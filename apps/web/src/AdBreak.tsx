// The pre-match advertisement overlay.
//
// Google's Ad Placement API draws the creative. This overlay only does two jobs: it holds the
// player's input so lockstep peers are never stalled (ADR 011), and it shows the house
// promotion when Google does not fill. The simulation underneath is already running from the
// first tick.
import React, { useEffect, useRef, useState } from 'react';
import type { AdBreak as AdBreakSlot } from '@comrade/contracts';
import { api } from './api';
import { Link } from './router';
import { recordEvent } from './diagnostics';
import { configureAds, placementFilled, placementMissed, showInterstitial } from './adsense';

export default function AdBreak({ ad, onDone }: { ad: AdBreakSlot; onDone: () => void }) {
  const finished = useRef(false);
  const startedAt = useRef(Date.now());
  const [house, setHouse] = useState(false);
  const [left, setLeft] = useState(ad.seconds);
  const houseUntil = useRef<number | null>(null);

  useEffect(() => {
    configureAds();
    startedAt.current = Date.now();
    const finish = (provider: string, filled: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const watched = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
      api.adImpression({ token: ad.token, provider, filled, seconds: watched })
        .catch(() => undefined);
      recordEvent('ad-complete', { provider, filled });
      onDone();
    };

    let cancelled = false;
    (async () => {
      const info = await showInterstitial(ad.token);
      if (cancelled || finished.current) return;
      if (placementMissed(info)) {
        recordEvent('ad-placement-empty', { status: info?.breakStatus ?? 'missing' });
        houseUntil.current = Date.now() + ad.seconds * 1000;
        setHouse(true);
        return;
      }
      finish('adsense', placementFilled(info?.breakStatus));
    })();

    return () => { cancelled = true; };
  }, [ad, onDone]);

  useEffect(() => {
    if (!house) return;
    const timer = window.setInterval(() => {
      const until = houseUntil.current ?? Date.now();
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0 && !finished.current) {
        finished.current = true;
        const watched = Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
        api.adImpression({ token: ad.token, provider: 'house', filled: false, seconds: watched })
          .catch(() => undefined);
        recordEvent('ad-complete', { provider: 'house', filled: false });
        onDone();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [house, ad, onDone]);

  return <div className="ad-break" role="dialog" aria-label="Advertisement before the match">
    <div className="ad-stage">
      {house ? <div className="ad-house">
        <p className="eyebrow">A WORD FROM US</p>
        <h3>{ad.house.headline}</h3>
        <p>{ad.house.body}</p>
        <Link to={ad.house.href} className="ad-cta">{ad.house.cta} →</Link>
      </div> : <div className="ad-house">
        <p className="eyebrow">ADVERTISEMENT</p>
        <h3>Your base is already on the field</h3>
        <p>You join the battle when this ends. Subscribers walk straight in.</p>
      </div>}
    </div>
    {house && <div className="ad-bar">
      <span className="ad-count">{left}s</span>
      <div className="ad-progress"><i style={{ width: `${100 - (left / Math.max(1, ad.seconds)) * 100}%` }} /></div>
      <span className="ad-note">
        Your base is already on the field — you join the battle when this ends.
        {' '}<Link to="/tiers">Bronze removes this</Link>.
      </span>
    </div>}
    {!ad.personalised && <small className="ad-consent">
      Showing a non-personalised advertisement. <Link to="/legal/cookies">Advertising choices</Link>
    </small>}
  </div>;
}
