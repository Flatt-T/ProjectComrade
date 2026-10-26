// The pre-match advertisement.
//
// Provider-agnostic by design: the service hands down an ordered list of VAST tag URLs and
// this plays them with Google's IMA SDK, falling to the next tag on an error or a timeout and
// finally to a house advertisement, so the slot is never empty and a network outage can never
// stop a match from starting.
//
// It is an overlay, not a gate: the simulation underneath is already running from the first
// tick with this player's input locked. That is what makes the free tier's delayed start real
// — thirty seconds of an idle base — while every subscriber in the room plays on, and it is
// why no lockstep peer ever waits for an advertisement to finish.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AdBreak as AdBreakSlot } from '@comrade/contracts';
import { api } from './api';
import { Link } from './router';
import { recordEvent } from './diagnostics';

const IMA_SDK = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';

/** The handful of IMA shapes used here, so the SDK needs no type package. */
interface ImaAdsManager {
  init(width: number, height: number, mode: unknown): void;
  start(): void;
  destroy(): void;
  setVolume(volume: number): void;
  addEventListener(type: string, handler: (event: unknown) => void): void;
  getRemainingTime(): number;
}
interface ImaAdsLoader {
  addEventListener(type: string, handler: (event: unknown) => void): void;
  requestAds(request: Record<string, unknown>): void;
  destroy(): void;
  contentComplete(): void;
}
interface ImaNamespace {
  AdDisplayContainer: new (container: HTMLElement, video: HTMLVideoElement) => { initialize(): void; destroy(): void };
  AdsLoader: new (container: unknown) => ImaAdsLoader;
  AdsRequest: new () => Record<string, unknown>;
  AdsRenderingSettings: new () => Record<string, unknown>;
  ViewMode: { NORMAL: unknown };
  AdErrorEvent: { Type: { AD_ERROR: string } };
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
  AdEvent: { Type: { ALL_ADS_COMPLETED: string; COMPLETE: string; STARTED: string; SKIPPED: string } };
  settings: { setNumRedirects(n: number): void; setLocale(locale: string): void };
}
declare global {
  interface Window { google?: { ima?: ImaNamespace } }
}

let sdkPromise: Promise<ImaNamespace | null> | undefined;

/** Load the IMA SDK once per page. Resolves null when it cannot be loaded (blocked, offline). */
function loadSdk(): Promise<ImaNamespace | null> {
  if (window.google?.ima) return Promise.resolve(window.google.ima);
  sdkPromise ??= new Promise<ImaNamespace | null>(resolve => {
    const script = document.createElement('script');
    script.src = IMA_SDK;
    script.async = true;
    // An ad blocker makes this fail, which is fine: the house advertisement takes over.
    script.onload = () => resolve(window.google?.ima ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
    setTimeout(() => resolve(window.google?.ima ?? null), 8_000);
  });
  return sdkPromise;
}

type Phase = 'loading' | 'playing' | 'house';

export default function AdBreak({ ad, onDone }: { ad: AdBreakSlot; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const finished = useRef(false);
  const [phase, setPhase] = useState<Phase>(ad.tags.length ? 'loading' : 'house');
  const [left, setLeft] = useState(ad.seconds);
  const provider = useRef('house');
  const [muted, setMuted] = useState(true);

  // The slot lasts a fixed time whatever happens inside it, so the match is never held up by
  // a network that stalls and a player always knows exactly how long they are waiting.
  const deadline = useMemo(() => Date.now() + ad.seconds * 1000, [ad.seconds]);

  useEffect(() => {
    const finish = (filled: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const watched = Math.round((Date.now() - (deadline - ad.seconds * 1000)) / 1000);
      api.adImpression({ token: ad.token, provider: provider.current, filled, seconds: watched })
        .catch(() => undefined);
      recordEvent('ad-complete', { provider: provider.current, filled });
      onDone();
    };

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) finish(provider.current !== 'house');
    }, 250);

    let manager: ImaAdsManager | undefined;
    let loader: ImaAdsLoader | undefined;
    let display: { initialize(): void; destroy(): void } | undefined;
    let cancelled = false;

    (async () => {
      if (!ad.tags.length) return;
      const ima = await loadSdk();
      if (cancelled) return;
      if (!ima || !host.current || !video.current) { setPhase('house'); return; }
      ima.settings.setNumRedirects(4);
      ima.settings.setLocale('en');

      // Walk the waterfall: the first tag that plays wins, and each failure moves down one.
      for (const [index, tag] of ad.tags.entries()) {
        if (cancelled || finished.current) return;
        const played = await new Promise<boolean>(resolve => {
          let settled = false;
          const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
          try {
            display = new ima.AdDisplayContainer(host.current!, video.current!);
            display.initialize();
            loader = new ima.AdsLoader(display);
            loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
              recordEvent('ad-tag-failed', { rung: index });
              done(false);
            });
            loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event: unknown) => {
              const settings = new ima.AdsRenderingSettings();
              settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
              manager = (event as { getAdsManager(video: HTMLVideoElement, settings: unknown): ImaAdsManager })
                .getAdsManager(video.current!, settings);
              manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => done(false));
              manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
                provider.current = `rung-${index + 1}`;
                setPhase('playing');
              });
              // Completing the creative early must not dismiss the slot: the timer is the
              // only finish, so a delayed start and a credit-earn watch last the full length.
              try {
                const box = host.current!.getBoundingClientRect();
                manager.init(Math.max(320, box.width), Math.max(180, box.height), ima.ViewMode.NORMAL);
                // Autoplay with sound is blocked by browsers; the player can unmute.
                manager.setVolume(0);
                manager.start();
              } catch { done(false); }
            });
            const request = new ima.AdsRequest();
            request.adTagUrl = tag;
            request.linearAdSlotWidth = Math.max(320, host.current!.clientWidth || 640);
            request.linearAdSlotHeight = Math.max(180, host.current!.clientHeight || 360);
            loader.requestAds(request);
          } catch {
            done(false);
          }
          setTimeout(() => done(false), ad.timeoutMs);
        });
        if (played || finished.current) return;
        // Tear this rung down before trying the next one.
        try { manager?.destroy(); } catch { /* already gone */ }
        try { loader?.destroy(); } catch { /* already gone */ }
        try { display?.destroy(); } catch { /* already gone */ }
        manager = loader = display = undefined;
      }
      if (!cancelled && !finished.current) {
        recordEvent('ad-waterfall-empty', {});
        setPhase('house');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      try { manager?.destroy(); } catch { /* already gone */ }
      try { loader?.destroy(); } catch { /* already gone */ }
      try { display?.destroy(); } catch { /* already gone */ }
    };
  }, [ad, deadline, onDone]);

  const credit = ad.purpose === 'credit';

  return <div className="ad-break" role="dialog" aria-label={credit ? 'Advertisement to earn a match' : 'Advertisement before the match'}>
    <div className="ad-stage">
      <div className="ad-ima" ref={host} />
      <video ref={video} className="ad-video" muted={muted} playsInline />
      {phase !== 'playing' && <div className="ad-house">
        <p className="eyebrow">{phase === 'loading' ? 'ADVERTISEMENT LOADING' : 'A WORD FROM US'}</p>
        <h3>{ad.house.headline}</h3>
        <p>{ad.house.body}</p>
        <Link to={ad.house.href} className="ad-cta">{ad.house.cta} →</Link>
      </div>}
    </div>
    <div className="ad-bar">
      <span className="ad-count">{left}s</span>
      <div className="ad-progress"><i style={{ width: `${100 - (left / Math.max(1, ad.seconds)) * 100}%` }} /></div>
      <span className="ad-note">
        {credit
          ? 'Watch to the end to add one match to your account.'
          : <>Your base is already on the field — you join the battle when this ends.
            {' '}<Link to="/tiers">Bronze removes this</Link>.</>}
      </span>
      {phase === 'playing' && <button className="ad-mute" onClick={() => setMuted(m => !m)}>{muted ? 'UNMUTE' : 'MUTE'}</button>}
    </div>
    {!ad.personalised && <small className="ad-consent">
      Showing a non-personalised advertisement. <Link to="/legal/cookies">Advertising choices</Link>
    </small>}
  </div>;
}
