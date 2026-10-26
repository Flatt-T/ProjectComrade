// Billing: the subscription, tier changes with a real proration quote, and every invoice.
//
// Buying goes through Stripe Checkout and card details, addresses and cancellations through
// the Stripe Customer Portal, so no payment information ever reaches this application. What
// is shown here is read back from Stripe: the amount actually being charged, the real renewal
// date, and the invoices with their hosted pages and PDFs.
import React, { useCallback, useEffect, useState } from 'react';
import type { InvoiceSummary, SubscriptionState, Tier } from '@comrade/contracts';
import { PAID_TIERS, plan as planFor } from '@comrade/contracts';
import { api, money } from '../api';
import { errorText, useAuth } from '../auth';
import { Link, useRoute } from '../router';
import { Allowances, DangerButton, Notice, SignInWall, Spinner, TierBadge } from '../ui';

const STATUS_TEXT: Record<string, string> = {
  active: 'Active',
  trialing: 'Free trial',
  past_due: 'Payment failed — retrying',
  unpaid: 'Unpaid',
  canceled: 'Cancelled',
  incomplete: 'Waiting for payment',
  incomplete_expired: 'Expired before payment',
  paused: 'Paused',
};

const date = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function Billing() {
  const { ready, signedIn, entitlements, tiers, applyMe, reload } = useAuth();
  const { search, navigate } = useRoute();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [quote, setQuote] = useState<{ tier: Tier; amountDue: number | null; currency: string | null; nextRenewal: string | null } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const justPaid = search.get('checkout') === 'done';
  const wanted = search.get('change') as Tier | null;

  const load = useCallback(async () => {
    const [sub, list] = await Promise.all([
      api.subscription().catch(() => ({ subscription: null, tier: 'free' as Tier })),
      api.invoices().then(r => r.invoices).catch(() => []),
    ]);
    setSubscription(sub.subscription);
    setInvoices(list);
  }, []);

  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  // Coming back from Checkout, pull entitlements through rather than waiting on the webhook.
  useEffect(() => {
    if (!justPaid || !signedIn) return;
    setBusy('sync');
    api.syncBilling()
      .then(me => { applyMe(me); setDone('Subscription active — thank you.'); })
      .catch(() => undefined)
      .finally(() => { setBusy(''); void load(); });
  }, [justPaid, signedIn, applyMe, load]);

  // A tier arriving as ?change= (from the tiers page) opens its quote straight away.
  useEffect(() => {
    if (!wanted || !PAID_TIERS.includes(wanted) || !signedIn) return;
    void getQuote(wanted);
  }, [wanted, signedIn]);

  if (!ready) return <section className="page"><Spinner /></section>;
  if (!signedIn) return <section className="page"><SignInWall what="Billing" /></section>;
  if (tiers && !tiers.billingEnabled) return <section className="page">
    <h1>Billing is not switched on</h1>
    <Notice>Subscriptions are not enabled for this deployment yet. Play is free in the meantime.</Notice>
    <Link to="/" className="deploy">BACK TO THE WAR ROOM →</Link>
  </section>;

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label); setError(''); setDone('');
    try { await work(); } catch (caught) { setError(errorText(caught)); } finally { setBusy(''); }
  };

  async function getQuote(tier: Tier) {
    await run(`quote-${tier}`, async () => {
      setQuote(await api.previewChange(tier));
    });
  }

  const tier = entitlements?.tier ?? 'free';
  const live = subscription && ['active', 'trialing', 'past_due'].includes(subscription.status);

  return <section className="page billing-page">
    <header className="page-head">
      <p className="eyebrow">BILLING</p>
      <h1>Your subscription</h1>
    </header>

    {error && <Notice kind="bad">{error}</Notice>}
    {done && <Notice kind="good">{done}</Notice>}
    {busy === 'sync' && <Spinner label="Confirming your subscription with Stripe…" />}

    <div className="billing-grid">
      <article className="card">
        <h2>Current tier</h2>
        <p className="billing-tier"><TierBadge tier={tier} /></p>
        {live && subscription
          ? <dl className="billing-facts">
              <dt>Status</dt><dd>{STATUS_TEXT[subscription.status] ?? subscription.status}</dd>
              <dt>Charge</dt><dd>{money(subscription.unitAmount, subscription.currency ?? 'gbp')} a month</dd>
              <dt>{subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews'}</dt>
              <dd>{date(subscription.currentPeriodEnd)}</dd>
              {subscription.pendingTier && <>
                <dt>Changing to</dt><dd>{planFor(subscription.pendingTier).name} at renewal</dd>
              </>}
            </dl>
          : <p>You are on the free tier. <Link to="/tiers">See what a subscription gives you</Link>.</p>}
        <Allowances />
        {subscription?.status === 'past_due' && <Notice kind="bad">
          Stripe could not take the last payment. Update your card in the billing portal and it
          will retry — you keep your tier in the meantime.
        </Notice>}
      </article>

      <article className="card">
        <h2>Change tier</h2>
        <p className="card-note">
          Upgrades take effect immediately and Stripe charges only the difference for the rest of
          the month. Downgrades take effect at renewal, so you keep what you have already paid for.
        </p>
        <div className="tier-switch">
          {PAID_TIERS.map(target => {
            const details = planFor(target);
            if (target === tier) return <p key={target} className="tier-current-row">
              <TierBadge tier={target} small /> current
            </p>;
            return <div key={target} className="tier-switch-row">
              <TierBadge tier={target} small />
              <span>{details.blurb}</span>
              {live
                ? <button disabled={!!busy} onClick={() => void getQuote(target)}>
                    {busy === `quote-${target}` ? 'CHECKING…' : 'QUOTE'}
                  </button>
                : <button disabled={!!busy} onClick={() => run(`buy-${target}`, async () => {
                    const { url } = await api.checkout(target);
                    window.location.assign(url);
                  })}>{busy === `buy-${target}` ? 'OPENING…' : 'SUBSCRIBE'}</button>}
            </div>;
          })}
        </div>

        {quote && <div className="tier-quote">
          <h3>Switch to {planFor(quote.tier).name}</h3>
          <p>{quote.amountDue === null
            ? 'Stripe will charge the prorated difference for the rest of this month.'
            : quote.amountDue > 0
              ? <>Due now: <b>{money(quote.amountDue, quote.currency ?? 'gbp')}</b>, for the rest of this month.</>
              : <>Nothing to pay now — the change is credited against your next invoice.</>}</p>
          <p className="card-note">Your next full invoice is dated {date(quote.nextRenewal)}.</p>
          <button className="deploy" disabled={!!busy} onClick={() => run('change', async () => {
            const result = await api.changeTier(quote.tier);
            setSubscription(result.subscription);
            setQuote(null);
            await reload();
            await load();
            setDone(result.direction === 'up'
              ? `You are on ${planFor(result.tier).name} now.`
              : `You will move to ${planFor(quote.tier).name} at renewal.`);
            navigate('/account/billing', { replace: true });
          })}>{busy === 'change' ? 'SWITCHING…' : 'CONFIRM THE SWITCH →'}</button>
          <button className="link-button" onClick={() => setQuote(null)}>Not now</button>
        </div>}
      </article>

      <article className="card">
        <h2>Payment and cancellation</h2>
        <p className="card-note">
          Cards, billing address, VAT details and cancellation are handled by Stripe's own secure
          portal. No card details ever touch Project Comrade.
        </p>
        <button className="deploy" disabled={!!busy} onClick={() => run('portal', async () => {
          const { url } = await api.portal('/account/billing');
          window.location.assign(url);
        })}>{busy === 'portal' ? 'OPENING…' : 'OPEN THE BILLING PORTAL →'}</button>
        {live && (subscription?.cancelAtPeriodEnd
          ? <button disabled={!!busy} onClick={() => run('resume', async () => {
              const result = await api.cancelSubscription(false);
              setSubscription(result.subscription);
              setDone('Cancellation withdrawn — your subscription will renew as usual.');
            })}>{busy === 'resume' ? 'WORKING…' : 'KEEP MY SUBSCRIPTION'}</button>
          : <DangerButton label="CANCEL AT PERIOD END" confirmLabel="YES, CANCEL AT RENEWAL"
              busy={busy === 'cancel'}
              onConfirm={() => run('cancel', async () => {
                const result = await api.cancelSubscription(true);
                setSubscription(result.subscription);
                setDone('Cancelled. You keep your tier until the date above.');
              })} />)}
      </article>

      <article className="card invoices-card">
        <h2>Invoices</h2>
        {!invoices && <Spinner label="Fetching invoices…" />}
        {invoices && !invoices.length && <p className="card-note">No invoices yet.</p>}
        {invoices && invoices.length > 0 && <table className="invoices">
          <thead><tr><th>Date</th><th>Invoice</th><th>Period</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>
            {invoices.map(invoice => <tr key={invoice.id}>
              <td>{date(invoice.created)}</td>
              <td>{invoice.number ?? '—'}</td>
              <td>{invoice.periodStart ? `${date(invoice.periodStart)} → ${date(invoice.periodEnd)}` : '—'}</td>
              <td>{money(invoice.total, invoice.currency)}</td>
              <td className={`inv-status ${invoice.status ?? ''}`}>{invoice.status ?? '—'}</td>
              <td className="inv-links">
                {invoice.hostedUrl && <a href={invoice.hostedUrl} target="_blank" rel="noreferrer noopener">View ↗</a>}
                {invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noreferrer noopener">PDF ↗</a>}
              </td>
            </tr>)}
          </tbody>
        </table>}
      </article>
    </div>

    <p className="billing-foot">
      <Link to="/legal/refunds">Cancellations and refunds</Link> · <Link to="/legal/terms">Terms</Link> ·
      {' '}<Link to="/account">Back to your account</Link>
    </p>
  </section>;
}
