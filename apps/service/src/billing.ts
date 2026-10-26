// Stripe: the product catalogue, Checkout, the Customer Portal, proration previews,
// invoices and the webhook that keeps local entitlements in step.
//
// Prices are never hardcoded. Every amount shown anywhere comes from Stripe, retrieved by
// the `lookup_key` recorded against each tier, so the Stripe dashboard is the only place a
// price is ever set. Entitlements are written from webhooks (the source of truth) and also
// refreshed opportunistically when a player returns from Checkout, so a webhook that is
// slow or retried never leaves someone staring at a tier they have paid for.
import Stripe from 'stripe';
import {
  InvoiceSummary, PAID_TIERS, PlanCatalogue, PlanPrice, Tier,
  plan, tierForLookupKey,
} from '@comrade/contracts';
import { AccountRow, accountByCustomer, accountById, recordAccountEvent, setStripeCustomer } from './accounts.js';
import { publicUrl, stripe as stripeConfig } from './config.js';
import { HttpError, badRequest, notFound, unavailable } from './http.js';
import { eventAlreadyHandled, upsertSubscription } from './entitlements.js';
import { log } from './ops.js';

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (!stripeConfig.configured()) throw unavailable('Billing is not configured on this deployment');
  // The SDK's pinned API version is used deliberately: shapes that moved between versions
  // are read defensively below, so the service works on whichever version the key is on.
  client ??= new Stripe(stripeConfig.secretKey(), {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'Project Comrade', url: publicUrl() },
  });
  return client;
}

/** Stripe moved some fields between API versions; read both shapes. */
function loose(value: unknown): Record<string, unknown> { return (value ?? {}) as Record<string, unknown>; }
function seconds(value: unknown): Date | null {
  return typeof value === 'number' && value > 0 ? new Date(value * 1000) : null;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

let cached: { at: number; catalogue: PlanCatalogue } | undefined;
const CATALOGUE_TTL_MS = 60_000;

/** Live prices for every paid tier, by lookup key. Cached briefly to spare the API. */
export async function catalogue(force = false): Promise<PlanCatalogue> {
  if (!force && cached && Date.now() - cached.at < CATALOGUE_TTL_MS) return cached.catalogue;
  const lookupKeys = PAID_TIERS.map(t => plan(t).lookupKey!).filter(Boolean);
  const result = await stripe().prices.list({ lookup_keys: lookupKeys, active: true, expand: ['data.tiers'], limit: 100 });
  const prices: PlanPrice[] = [];
  for (const price of result.data) {
    const tier = tierForLookupKey(price.lookup_key);
    if (!tier) continue;
    prices.push({
      tier,
      priceId: price.id,
      lookupKey: price.lookup_key!,
      unitAmount: price.unit_amount ?? null,
      currency: price.currency,
      interval: (price.recurring?.interval ?? null) as PlanPrice['interval'],
      intervalCount: price.recurring?.interval_count ?? 1,
      taxBehavior: (price.tax_behavior ?? null) as PlanPrice['taxBehavior'],
      trialDays: price.recurring?.trial_period_days ?? null,
    });
  }
  prices.sort((a, b) => PAID_TIERS.indexOf(a.tier) - PAID_TIERS.indexOf(b.tier));
  const catalogue: PlanCatalogue = { prices, currency: prices[0]?.currency ?? 'gbp' };
  cached = { at: Date.now(), catalogue };
  return catalogue;
}

async function priceFor(tier: Tier): Promise<PlanPrice> {
  const key = plan(tier).lookupKey;
  if (!key) throw badRequest('That tier is not for sale');
  const found = (await catalogue()).prices.find(p => p.tier === tier)
    // A price added in Stripe moments ago should not need a cache expiry to be buyable.
    ?? (await catalogue(true)).prices.find(p => p.tier === tier);
  if (!found) throw new HttpError(503, `No active Stripe price with lookup key ${key}`);
  return found;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/** The account's Stripe customer, created on first need and remembered. */
export async function ensureCustomer(account: AccountRow): Promise<string> {
  if (account.stripe_customer_id) return account.stripe_customer_id;
  // Reuse a customer that already exists for this address rather than making a duplicate.
  const existing = await stripe().customers.list({ email: account.email, limit: 1 });
  const customer = existing.data[0] ?? await stripe().customers.create({
    email: account.email,
    name: account.display_name ?? account.handle,
    metadata: { accountId: account.id, handle: account.handle },
  });
  await setStripeCustomer(account.id, customer.id);
  return customer.id;
}

// ---------------------------------------------------------------------------
// Buying and managing
// ---------------------------------------------------------------------------

export async function checkout(account: AccountRow, tier: Tier): Promise<{ url: string }> {
  const price = await priceFor(tier);
  const customer = await ensureCustomer(account);
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: price.priceId, quantity: 1 }],
    client_reference_id: account.id,
    subscription_data: { metadata: { accountId: account.id, handle: account.handle, tier } },
    success_url: `${publicUrl()}/account/billing?checkout=done&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl()}/tiers?checkout=cancelled`,
    allow_promotion_codes: stripeConfig.promotionCodes(),
    automatic_tax: { enabled: stripeConfig.automaticTax() },
    // Stripe requires these to be updatable when it is calculating tax for a saved customer.
    customer_update: stripeConfig.automaticTax() ? { address: 'auto', name: 'auto' } : undefined,
    billing_address_collection: stripeConfig.automaticTax() ? 'required' : 'auto',
  });
  if (!session.url) throw new HttpError(502, 'Stripe did not return a checkout page');
  await recordAccountEvent(account.id, 'checkout-started', { tier });
  return { url: session.url };
}

/** The Stripe-hosted portal: payment methods, cancellation, invoices, plan changes. */
export async function portal(account: AccountRow, returnPath = '/account/billing'): Promise<{ url: string }> {
  const customer = await ensureCustomer(account);
  const session = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${publicUrl()}${returnPath.startsWith('/') ? returnPath : `/${returnPath}`}`,
  });
  return { url: session.url };
}

/** The subscription we would change when the player switches tier. */
async function changeableSubscription(customer: string): Promise<Stripe.Subscription> {
  const subscriptions = await stripe().subscriptions.list({ customer, status: 'all', limit: 10 });
  const live = subscriptions.data.find(s => ['active', 'trialing', 'past_due'].includes(s.status));
  if (!live) throw notFound('No active subscription to change');
  return live;
}

export interface ChangePreview {
  tier: Tier;
  /** Minor units due now once Stripe has applied proration credit. */
  amountDue: number | null;
  currency: string | null;
  /** When the switch takes effect: immediately for an upgrade. */
  immediate: boolean;
  nextRenewal: string | null;
}

/** What switching tier would cost right now, straight from Stripe's proration engine. */
export async function previewChange(account: AccountRow, tier: Tier): Promise<ChangePreview> {
  const price = await priceFor(tier);
  const customer = await ensureCustomer(account);
  const subscription = await changeableSubscription(customer);
  const item = subscription.items.data[0];
  const renewal = seconds(loose(item).current_period_end ?? loose(subscription).current_period_end);
  try {
    // Shapes differ across API versions; a failed preview must not block the upgrade.
    const preview = await (stripe().invoices as unknown as {
      createPreview(params: Record<string, unknown>): Promise<Stripe.Invoice>;
    }).createPreview({
      customer,
      subscription,
      subscription_details: {
        items: [{ id: item.id, price: price.priceId, quantity: 1 }],
        proration_behavior: 'always_invoice',
      },
    });
    return {
      tier, amountDue: preview.amount_due ?? null, currency: preview.currency ?? null,
      immediate: true, nextRenewal: renewal?.toISOString() ?? null,
    };
  } catch (error) {
    log('stripe-preview-unavailable', { message: String(error).slice(0, 160) });
    return { tier, amountDue: null, currency: price.currency, immediate: true, nextRenewal: renewal?.toISOString() ?? null };
  }
}

/**
 * Switch tier in place. Upgrades invoice the prorated difference straight away so the new
 * tier is usable immediately; downgrades take effect at renewal, so nobody pays twice for
 * the same week and nobody loses a tier they have already paid for.
 */
export async function changeTier(account: AccountRow, tier: Tier, direction: 'up' | 'down'): Promise<void> {
  const price = await priceFor(tier);
  const customer = await ensureCustomer(account);
  const subscription = await changeableSubscription(customer);
  const item = subscription.items.data[0];
  const updated = await stripe().subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: price.priceId, quantity: 1 }],
    proration_behavior: direction === 'up' ? 'always_invoice' : 'none',
    metadata: { ...subscription.metadata, accountId: account.id, tier },
    payment_behavior: 'pending_if_incomplete',
  });
  await syncSubscription(updated, account);
  await recordAccountEvent(account.id, 'tier-changed', { tier, direction });
}

export async function cancelAtPeriodEnd(account: AccountRow, cancel: boolean): Promise<void> {
  const customer = await ensureCustomer(account);
  const subscription = await changeableSubscription(customer);
  const updated = await stripe().subscriptions.update(subscription.id, { cancel_at_period_end: cancel });
  await syncSubscription(updated, account);
  await recordAccountEvent(account.id, cancel ? 'cancellation-scheduled' : 'cancellation-withdrawn', {});
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function invoices(account: AccountRow, limit = 24): Promise<InvoiceSummary[]> {
  if (!account.stripe_customer_id) return [];
  const list = await stripe().invoices.list({
    customer: account.stripe_customer_id,
    limit: Math.min(100, Math.max(1, limit)),
  });
  return list.data.map(invoice => ({
    id: invoice.id!,
    number: invoice.number ?? null,
    status: invoice.status ?? null,
    created: new Date(invoice.created * 1000).toISOString(),
    periodStart: seconds(invoice.period_start)?.toISOString() ?? null,
    periodEnd: seconds(invoice.period_end)?.toISOString() ?? null,
    total: invoice.total ?? 0,
    amountPaid: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? 'gbp',
    description: invoice.lines?.data[0]?.description ?? null,
    hostedUrl: invoice.hosted_invoice_url ?? null,
    pdfUrl: invoice.invoice_pdf ?? null,
  }));
}

/** A single invoice, checked to belong to this account before anything is returned. */
export async function invoice(account: AccountRow, id: string): Promise<InvoiceSummary> {
  const found = (await invoices(account, 100)).find(i => i.id === id);
  if (!found) throw notFound('No such invoice on this account');
  return found;
}

// ---------------------------------------------------------------------------
// Keeping entitlements in step
// ---------------------------------------------------------------------------

function tierOfSubscription(subscription: Stripe.Subscription): Tier {
  const item = subscription.items.data[0];
  const lookupKey = typeof item?.price === 'object' ? item.price.lookup_key : null;
  return tierForLookupKey(lookupKey)
    ?? tierForLookupKey(String(subscription.metadata?.lookup_key ?? ''))
    // Metadata is the fallback for a price whose lookup key was changed after purchase.
    ?? (['bronze', 'silver', 'gold'] as Tier[]).find(t => t === subscription.metadata?.tier)
    ?? 'free';
}

/** Any tier the subscription is scheduled to move to at renewal. */
async function pendingTierOf(subscription: Stripe.Subscription): Promise<Tier | null> {
  const scheduleId = typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule?.id;
  if (!scheduleId) return null;
  try {
    const schedule = await stripe().subscriptionSchedules.retrieve(scheduleId);
    const now = Math.floor(Date.now() / 1000);
    const next = schedule.phases.find(phase => phase.start_date > now);
    const price = next?.items[0]?.price;
    if (!price) return null;
    const resolved = typeof price === 'string' ? await stripe().prices.retrieve(price) : price;
    // A price deleted since the schedule was written carries no lookup key.
    return 'lookup_key' in resolved ? tierForLookupKey(resolved.lookup_key) : null;
  } catch {
    return null;
  }
}

/** Write a Stripe subscription into the local entitlement table. */
export async function syncSubscription(subscription: Stripe.Subscription, known?: AccountRow): Promise<void> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  // Normally the customer id identifies the account; the metadata written at Checkout is the
  // fallback for a subscription created before the customer id was recorded locally.
  const metadataId = String(subscription.metadata?.accountId ?? '');
  const account = known
    ?? await accountByCustomer(customerId)
    ?? (metadataId ? await accountById(metadataId) : undefined);
  if (account && !account.stripe_customer_id) await setStripeCustomer(account.id, customerId);
  if (!account) {
    // A subscription we cannot attribute is logged and left alone rather than guessed at.
    log('stripe-orphan-subscription', { subscription: subscription.id });
    return;
  }
  const item = subscription.items.data[0];
  const price = typeof item?.price === 'object' ? item.price : undefined;
  await upsertSubscription({
    id: subscription.id,
    accountId: account.id,
    tier: tierOfSubscription(subscription),
    status: subscription.status,
    priceId: price?.id ?? null,
    lookupKey: price?.lookup_key ?? null,
    unitAmount: price?.unit_amount ?? null,
    currency: subscription.currency ?? price?.currency ?? null,
    // `current_period_end` sits on the item in newer API versions and on the
    // subscription in older ones.
    currentPeriodEnd: seconds(loose(item).current_period_end ?? loose(subscription).current_period_end),
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    pendingTier: await pendingTierOf(subscription),
  });
}

/** Pull this customer's subscriptions from Stripe and mirror them. Used after Checkout. */
export async function resync(account: AccountRow): Promise<void> {
  if (!account.stripe_customer_id) return;
  const list = await stripe().subscriptions.list({
    customer: account.stripe_customer_id, status: 'all', limit: 20, expand: ['data.items.data.price'],
  });
  for (const subscription of list.data) await syncSubscription(subscription, account);
}

/**
 * Apply a verified webhook. Stripe retries until it gets a 2xx, so handlers are idempotent
 * and every event id is recorded before it is applied.
 */
export async function applyWebhook(raw: Buffer, signature: string | undefined): Promise<{ received: true }> {
  const secret = stripeConfig.webhookSecret();
  if (!secret) throw unavailable('Stripe webhooks are not configured');
  if (!signature) throw badRequest('Missing Stripe signature');
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    // An unverifiable payload is never looked at, let alone acted on.
    throw new HttpError(400, 'Signature verification failed');
  }
  if (await eventAlreadyHandled(event.id, event.type)) {
    log('stripe-replay', { type: event.type });
    return { received: true };
  }
  log('stripe-event', { type: event.type });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const accountId = session.client_reference_id ?? String(session.metadata?.accountId ?? '');
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (accountId && customerId) await setStripeCustomer(accountId, customerId).catch(() => undefined);
      if (customerId) {
        const account = await accountByCustomer(customerId);
        if (account) {
          await resync(account);
          await recordAccountEvent(account.id, 'checkout-completed', { session: session.id });
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      const account = customerId ? await accountByCustomer(customerId) : undefined;
      if (account) {
        await recordAccountEvent(account.id, event.type.replace('invoice.', 'invoice-'), {
          invoice: invoice.id, total: invoice.total, currency: invoice.currency,
        });
        // A failed payment moves the subscription to past_due; re-read rather than infer.
        await resync(account);
      }
      break;
    }
    case 'customer.deleted': {
      const customerId = event.data.object.id;
      const account = await accountByCustomer(customerId);
      if (account) await recordAccountEvent(account.id, 'stripe-customer-deleted', {});
      break;
    }
    default:
      // Everything else is acknowledged so Stripe stops retrying it.
      break;
  }
  return { received: true };
}
