// Google AdSense for HTML5 games — the Ad Placement API.
//
// The publisher snippet lives in index.html so Google's crawler can verify the site. This
// module is the only place the rest of the app talks to `adBreak` / `adConfig`. Credits are
// granted only from `adViewed`; a dismissed or missing placement grants nothing.

export const ADSENSE_CLIENT = 'ca-pub-3714156360561836';
export const ADS_TXT_LINE = 'google.com, pub-3714156360561836, DIRECT, f08c47fec0942fa0';

export interface PlacementInfo {
  breakType: string;
  breakName: string;
  breakFormat: string;
  breakStatus: string;
}

type ShowAdFn = () => void;

/** A rewarded placement that is ready to show from a click handler. */
export interface RewardOffer {
  show: ShowAdFn;
  outcome: Promise<'viewed' | 'dismissed'>;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (placement: Record<string, unknown>) => void;
    adConfig?: (config: Record<string, unknown>) => void;
  }
}

const PLACEMENT_TIMEOUT_MS = 20_000;
const pendingInterstitials = new Map<string, Promise<PlacementInfo | null>>();
let prerollUsed = false;
let rewardPrepared: Promise<RewardOffer | null> | undefined;

/** Google allows one preroll per page load; later matches use `start`. */
export function interstitialType(prerollAlreadyShown: boolean): 'preroll' | 'start' {
  return prerollAlreadyShown ? 'start' : 'preroll';
}

export function configureAds(): void {
  if (typeof window.adConfig !== 'function') return;
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
}

function placementApi(): Window['adBreak'] | undefined {
  return typeof window.adBreak === 'function' ? window.adBreak : undefined;
}

function once<T>(settle: (value: T) => void): (value: T) => void {
  let done = false;
  return value => {
    if (done) return;
    done = true;
    settle(value);
  };
}

/** True when the player actually saw the placement, not when it was skipped or empty. */
export function placementFilled(status: string | undefined): boolean {
  return status === 'viewed';
}

/** Statuses that mean Google did not show a placement, so the house advertisement should run. */
export function placementMissed(info: PlacementInfo | null): boolean {
  if (!info) return true;
  return info.breakStatus === 'noAdPreloaded'
    || info.breakStatus === 'error'
    || info.breakStatus === 'timeout'
    || info.breakStatus === 'frequencyCapped'
    || info.breakStatus === 'ignored';
}

/**
 * Pre-match interstitial. The same match token reuses one in-flight call so React Strict Mode
 * cannot fire two placements for one slot. The first call on a page is `preroll`.
 */
export function showInterstitial(token: string): Promise<PlacementInfo | null> {
  const existing = pendingInterstitials.get(token);
  if (existing) return existing;
  const run = new Promise<PlacementInfo | null>(resolve => {
    const adBreak = placementApi();
    if (!adBreak) { resolve(null); return; }
    const type = interstitialType(prerollUsed);
    prerollUsed = true;
    const done = once(resolve);
    const placement: Record<string, unknown> = {
      type,
      name: 'pre-match',
      adBreakDone: (info: PlacementInfo) => done(info ?? {
        breakType: type, breakName: 'pre-match', breakFormat: 'interstitial', breakStatus: 'other',
      }),
    };
    // preroll must not pass beforeAd/afterAd; later matches pause/resume around `start`.
    if (type !== 'preroll') {
      placement.beforeAd = () => undefined;
      placement.afterAd = () => undefined;
    }
    try { adBreak(placement); } catch { done(null); return; }
    window.setTimeout(() => done(null), PLACEMENT_TIMEOUT_MS);
  });
  pendingInterstitials.set(token, run);
  void run.finally(() => { if (pendingInterstitials.get(token) === run) pendingInterstitials.delete(token); });
  return run;
}

/**
 * Ask the API whether a rewarded ad is available. `show` must then be called from a click.
 * A fresh `adBreak` is armed after `clearRewardOffer`.
 */
export function prepareReward(name: string): Promise<RewardOffer | null> {
  if (rewardPrepared) return rewardPrepared;
  rewardPrepared = new Promise<RewardOffer | null>(resolve => {
    const adBreak = placementApi();
    if (!adBreak) { resolve(null); return; }
    const done = once(resolve);
    let settleOutcome: (value: 'viewed' | 'dismissed') => void = () => undefined;
    const outcome = new Promise<'viewed' | 'dismissed'>(r => { settleOutcome = once(r); });
    try {
      adBreak({
        type: 'reward',
        name,
        beforeReward: (showAdFn: ShowAdFn) => {
          done({ show: showAdFn, outcome });
        },
        adViewed: () => settleOutcome('viewed'),
        adDismissed: () => settleOutcome('dismissed'),
        adBreakDone: (info: PlacementInfo) => {
          if (info?.breakStatus === 'viewed') settleOutcome('viewed');
          else settleOutcome('dismissed');
          done(null);
        },
      });
    } catch {
      done(null);
      return;
    }
    window.setTimeout(() => done(null), PLACEMENT_TIMEOUT_MS);
  });
  return rewardPrepared;
}

export function clearRewardOffer(): void {
  rewardPrepared = undefined;
}

export function resetAdPlacementsForTests(): void {
  prerollUsed = false;
  pendingInterstitials.clear();
  rewardPrepared = undefined;
}
