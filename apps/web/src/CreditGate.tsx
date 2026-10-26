// Shown in the lobby when this commander has no matches left for the chosen style:
// watch an advertisement to earn one, or buy the battle pack.
import React, { useEffect, useState } from 'react';
import type { AdBreak as AdBreakSlot, PackPrice, PlayKind } from '@comrade/contracts';
import { CREDIT_AD_SECONDS, CREDIT_PACK } from '@comrade/contracts';
import AdBreak from './AdBreak';
import { api, money } from './api';
import { errorText, readLocalConsent, useAuth } from './auth';
import { Link, useRoute } from './router';

export default function CreditGate({ kind, room, onEarned }: { kind: PlayKind; room?: string; onEarned: () => void }) {
  const { signedIn, reload } = useAuth();
  const { navigate } = useRoute();
  const [pack, setPack] = useState<PackPrice | null>(null);
  const [ad, setAd] = useState<AdBreakSlot | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const seconds = CREDIT_AD_SECONDS[kind];
  const label = kind === 'fusion' ? 'Fusion' : 'Classic';

  useEffect(() => {
    api.plans().then(result => setPack(result.packs.find(p => p.pack === CREDIT_PACK.id) ?? null)).catch(() => undefined);
  }, []);

  async function watch() {
    setError('');
    setBusy('watch');
    try {
      const personalised = signedIn ? false : readLocalConsent().personalisedAds;
      // Signed-in personalisation is resolved server-side from stored consent; the flag
      // here is only for guests, who have no account record.
      const started = await api.startAdCredit(kind, personalised);
      setAd(started.ad);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy('');
    }
  }

  async function finished() {
    const token = ad?.token;
    setAd(null);
    if (!token) return;
    setBusy('grant');
    try {
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

  return <>
    {ad && <AdBreak ad={ad} onDone={() => void finished()} />}
    <div className="credit-gate">
      <p>You have no {label} matches left this week. Watch a {seconds}-second advertisement for one
        more, or buy a battle pack.</p>
      <div className="credit-actions">
        <button className="deploy" disabled={!!busy} onClick={() => void watch()}>
          {busy === 'watch' || busy === 'grant' ? 'LOADING…' : `WATCH ${seconds}s FOR ONE ${label.toUpperCase()} MATCH`}
        </button>
        <button disabled={!!busy || (signedIn && !pack)} onClick={() => void buy()}>
          {busy === 'buy' ? 'OPENING…' : pack
            ? `BUY ${CREDIT_PACK.classic} CLASSIC + ${CREDIT_PACK.fusion} FUSION · ${money(pack.unitAmount, pack.currency)}`
            : signedIn ? 'BATTLE PACK UNAVAILABLE' : 'REGISTER TO BUY A BATTLE PACK'}
        </button>
      </div>
      <p className="credit-alt">Or <Link to="/tiers">subscribe for unlimited play</Link>
        {signedIn ? '' : <> · <Link to="/register">register a callsign</Link> for a free weekly allowance</>}.</p>
      {error && <small className="lobby-error">{error}</small>}
    </div>
  </>;
}
