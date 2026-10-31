// Shown in the lobby when this commander has no matches left for the chosen style:
// watch an advertisement to earn one, or buy the battle pack.
//
// The extra match is granted only after Google's `adViewed` callback. Dismissing the
// placement, or having none available, grants nothing. The credit session is opened when a
// rewarded placement is ready so `show()` can run from the click without waiting on the API.
import React, { useEffect, useState } from 'react';
import type { PackPrice, PlayKind } from '@comrade/contracts';
import { CREDIT_PACK } from '@comrade/contracts';
import { clearRewardOffer, configureAds, prepareReward, type RewardOffer } from './adsense';
import { api, money } from './api';
import { errorText, readLocalConsent, useAuth } from './auth';
import { Link, useRoute } from './router';

export default function CreditGate({ kind, room, onEarned }: { kind: PlayKind; room?: string; onEarned: () => void }) {
  const { signedIn, reload } = useAuth();
  const { navigate } = useRoute();
  const [pack, setPack] = useState<PackPrice | null>(null);
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const label = kind === 'fusion' ? 'Fusion' : 'Classic';

  useEffect(() => {
    api.plans().then(result => setPack(result.packs.find(p => p.pack === CREDIT_PACK.id) ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    configureAds();
    let live = true;
    clearRewardOffer();
    setOffer(null);
    setToken('');
    (async () => {
      const next = await prepareReward('bonus-credits');
      if (!live) return;
      setOffer(next);
      if (!next) return;
      try {
        const personalised = signedIn ? false : readLocalConsent().personalisedAds;
        const started = await api.startAdCredit(kind, personalised);
        if (live) setToken(started.ad.token);
      } catch (caught) {
        if (live) setError(errorText(caught));
      }
    })();
    return () => { live = false; };
  }, [kind, signedIn]);

  async function watch() {
    setError('');
    if (!offer || !token) {
      setError('No advertisement is ready yet. Try again in a moment.');
      return;
    }
    // `show` must run inside this click, before any await, or the placement may not display.
    offer.show();
    setBusy('watch');
    try {
      const outcome = await offer.outcome;
      if (outcome !== 'viewed') {
        setError('Watch the advertisement to the end to earn the match.');
        clearRewardOffer();
        setOffer(await prepareReward('bonus-credits'));
        return;
      }
      await api.completeAdCredit(token);
      await reload();
      onEarned();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy('');
    }
  }

  async function buy() {
    setError('');
    if (!signedIn) {
      const next = room ? `/?room=${encodeURIComponent(room)}` : '/tiers';
      navigate(`/register?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy('buy');
    try {
      const returnPath = room ? `/?room=${encodeURIComponent(room)}` : '/account/billing';
      const { url } = await api.checkoutPack(returnPath);
      window.location.assign(url);
    } catch (caught) {
      setError(errorText(caught));
      setBusy('');
    }
  }

  return <div className="credit-gate">
    <p>You have no {label} matches left today. Watch an advertisement for one more, or buy a
      battle pack.</p>
    <div className="credit-actions">
      <button className="deploy" disabled={!!busy} onClick={() => void watch()}>
        {busy === 'watch' ? 'LOADING…' : `WATCH AN ADVERTISEMENT FOR ONE ${label.toUpperCase()} MATCH`}
      </button>
      <button disabled={!!busy || (signedIn && !pack)} onClick={() => void buy()}>
        {busy === 'buy' ? 'OPENING…' : pack
          ? `BUY ${CREDIT_PACK.classic} CLASSIC + ${CREDIT_PACK.fusion} FUSION · ${money(pack.unitAmount, pack.currency)}`
          : signedIn ? 'BATTLE PACK UNAVAILABLE' : 'REGISTER TO BUY A BATTLE PACK'}
      </button>
    </div>
    <p className="credit-alt">Or <Link to="/tiers">subscribe for unlimited play</Link>
      {signedIn ? '' : <> · <Link to="/register">register a callsign</Link> for a free daily allowance</>}.</p>
    {error && <small className="lobby-error">{error}</small>}
  </div>;
}
