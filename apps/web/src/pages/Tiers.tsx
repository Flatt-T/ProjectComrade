// The tiers page: what each subscription gives you, priced from Stripe.
//
// Not one amount is written down in this app. The prices come from Stripe by lookup key, so
// what a player is quoted is always what Stripe will charge them, and changing a price is a
// change in the Stripe dashboard and nowhere else.
import React, { useEffect, useState } from 'react';
import type { PlanPrice, Tier, TierPlan } from '@comrade/contracts';
import { PAID_TIERS, plan as planFor } from '@comrade/contracts';
import { api, money } from '../api';
import { errorText, useAuth } from '../auth';
import { Link, useRoute } from '../router';
import { Notice, Spinner, TierBadge } from '../ui';

const ORDER: Tier[] = ['free', 'bronze', 'silver', 'gold'];

function playsText(limit: number | null, what: string): string {
  if (limit === null) return `Unlimited ${what}`;
  if (limit === 0) return `No ${what}`;
  return `${limit} ${what} a week`;
}

export default function Tiers() {
  const { signedIn, tier, entitlements, tiers, open } = useAuth();
  const { navigate, search } = useRoute();
  const [prices, setPrices] = useState<PlanPrice[] | null>(null);
  const [currency, setCurrency] = useState('gbp');
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<Tier | null>(null);
  const [error, setError] = useState('');
  const cancelled = search.get('checkout') === 'cancelled';

  useEffect(() => {
    api.plans()
      .then(result => { setPrices(result.prices); setCurrency(result.currency); setConfigured(result.configured); })
      .catch(() => setPrices([]));
  }, []);

  const priceFor = (id: Tier) => prices?.find(p => p.tier === id);

  async function choose(target: Tier) {
    setError('');
    if (!signedIn) {
      // Come back here once the callsign exists, so the choice is not lost.
      navigate(`/register?next=${encodeURIComponent(`/tiers?tier=${target}`)}`);
      return;
    }
    setBusy(target);
    try {
      if (entitlements?.subscription && ['active', 'trialing', 'past_due'].includes(entitlements.subscription.status)) {
        // Already subscribed: switching tier is a change, not a new purchase.
        navigate(`/account/billing?change=${target}`);
        return;
      }
      const { url } = await api.checkout(target);
      window.location.assign(url);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  const table: (TierPlan & { classicPlaysPerWeek: number | null; fusionPlaysPerWeek: number | null })[] =
    tiers?.tiers.filter(t => ORDER.includes(t.id)) ?? ORDER.map(id => planFor(id));

  return <section className="page tiers-page">
    <header className="page-head">
      <p className="eyebrow">SUBSCRIPTIONS</p>
      <h1>Pick your rank</h1>
      <p>Play free every week, or subscribe for unlimited battles with no advertisements.
        Cancel whenever you like — you keep the tier until the end of the month you have paid for.</p>
    </header>

    {cancelled && <Notice>Checkout cancelled — nothing was charged.</Notice>}
    {error && <Notice kind="bad">{error}</Notice>}
    {!configured && <Notice>Subscriptions are not switched on for this deployment yet. Free play is unlimited in the meantime.</Notice>}
    {!prices && <Spinner label="Fetching prices from Stripe…" />}

    <div className="tier-grid">
      {table.map(details => {
        const price = priceFor(details.id);
        // An open deployment has no accounts, so nobody is on a tier.
        const current = !open && tier === details.id;
        const buyable = PAID_TIERS.includes(details.id) && configured && !!price;
        return <article key={details.id} className={`tier-card ${details.id}${current ? ' current' : ''}`}>
          <header>
            <TierBadge tier={details.id} />
            {details.id === 'free'
              ? <p className="tier-price"><b>Free</b></p>
              : <p className="tier-price">
                  {price ? <><b>{money(price.unitAmount, price.currency)}</b>
                    <span>/{price.intervalCount > 1 ? ` ${price.intervalCount} ` : ''}{price.interval ?? 'month'}</span></>
                    : configured
                      ? <span className="tier-price-missing">Price unavailable</span>
                      : <span className="tier-price-soon">Coming soon</span>}
                  {price?.taxBehavior === 'inclusive' && <small>VAT included</small>}
                  {price?.taxBehavior === 'exclusive' && <small>plus VAT</small>}
                  {!!price?.trialDays && <small>{price.trialDays}-day free trial</small>}
                </p>}
            <p className="tier-blurb">{details.blurb}</p>
          </header>
          <ul className="tier-perks">
            <li>{playsText(details.classicPlaysPerWeek, 'Classic matches')}</li>
            <li>{playsText(details.fusionPlaysPerWeek, 'Fusion matches')}</li>
            <li className={details.ads ? 'minus' : ''}>{details.ads ? '30-second advertisement before each match' : 'No advertisements'}</li>
            {details.voting && <li>Voting rights on new features and maps</li>}
            {details.earlyAccess && <li>New maps and fusions a week early</li>}
          </ul>
          {current
            ? <p className="tier-current">Your current tier</p>
            : buyable
              ? <button className="deploy" disabled={busy === details.id} onClick={() => choose(details.id)}>
                  {busy === details.id ? 'OPENING…' : `CHOOSE ${details.name.toUpperCase()} →`}
                </button>
              : details.id === 'free' && !signedIn
                ? <Link to="/register" className="deploy">REGISTER FREE →</Link>
                : null}
        </article>;
      })}
    </div>

    <footer className="tiers-foot">
      <p>Prices shown in {currency.toUpperCase()}, charged by Stripe. You can change or cancel your subscription
        at any time from <Link to="/account/billing">your billing page</Link>, where every invoice is available too.</p>
      <p><Link to="/legal/terms">Terms</Link> · <Link to="/legal/refunds">Cancellations and refunds</Link> · <Link to="/legal/privacy">Privacy</Link></p>
    </footer>
  </section>;
}
