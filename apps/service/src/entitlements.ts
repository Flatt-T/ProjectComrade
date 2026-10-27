// What a player may do right now: their tier, their daily allowances and what is left.
//
// The window is anchored to the account's own registration moment rather than midnight, so
// each player's allowance renews 24 hours after they registered. Counting plays is counting
// rows in `play_ledger` since the start of the current window — there is no running total to
// drift, and a refund is a deleted row. Gold votes keep a separate seven-day window.
import {
  Entitlements, PlayKind, QuotaState, SubscriptionState, SubscriptionStatus, Tier,
  allowance, plan, remainingPlays,
} from '@comrade/contracts';
import { consumeCredit, restoreCredit, unspentCredits } from './credits.js';
import { one, query } from './db.js';
import { platformEnabled } from './config.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

function windowOf(anchor: Date, span: number, now: Date): { start: Date; end: Date } {
  const elapsed = now.getTime() - anchor.getTime();
  // A clock skew or a future anchor must not produce a negative window.
  const windows = elapsed > 0 ? Math.floor(elapsed / span) : 0;
  const start = new Date(anchor.getTime() + windows * span);
  return { start, end: new Date(start.getTime() + span) };
}

/** Subscription states that still carry their tier's benefits. */
const ENTITLED: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

/** Who the quota belongs to: a registered account, or a guest's device. */
export type Subject = { accountId: string; guestId?: undefined } | { guestId: string; accountId?: undefined };

interface SubscriptionRow {
  id: string; tier: string; status: string; price_id: string | null;
  unit_amount: number | null; currency: string | null;
  current_period_end: Date | null; cancel_at_period_end: boolean; pending_tier: string | null;
}

/**
 * The subscription that decides this account's tier: the entitled one with the highest
 * tier, so an overlap during an upgrade always resolves in the player's favour.
 */
export async function activeSubscription(accountId: string): Promise<SubscriptionState | undefined> {
  const rows = await query<SubscriptionRow>(
    `select id, tier, status, price_id, unit_amount, currency, current_period_end, cancel_at_period_end, pending_tier
     from subscriptions where account_id = $1 order by updated_at desc`, [accountId]);
  const entitled = rows.filter(r => ENTITLED.includes(r.status as SubscriptionStatus));
  const best = entitled.sort((a, b) => rank(b.tier) - rank(a.tier))[0] ?? rows[0];
  if (!best) return undefined;
  return {
    id: best.id,
    tier: asTier(best.tier),
    status: best.status as SubscriptionStatus,
    currentPeriodEnd: best.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: best.cancel_at_period_end,
    pendingTier: best.pending_tier ? asTier(best.pending_tier) : undefined,
    priceId: best.price_id,
    unitAmount: best.unit_amount,
    currency: best.currency,
  };
}

const ORDER: Tier[] = ['guest', 'free', 'bronze', 'silver', 'gold'];
const rank = (tier: string) => Math.max(0, ORDER.indexOf(tier as Tier));
const asTier = (value: string): Tier => (ORDER.includes(value as Tier) ? value as Tier : 'free');

/** The tier an account is entitled to, which is `free` unless a subscription says otherwise. */
export function tierFromSubscription(subscription: SubscriptionState | undefined): Tier {
  if (!subscription || !ENTITLED.includes(subscription.status)) return 'free';
  return subscription.tier;
}

/** The current 24-hour play window, anchored to `anchor`. */
export function allowanceWindow(anchor: Date, now = new Date()): { start: Date; end: Date } {
  return windowOf(anchor, DAY_MS, now);
}

/** The current weekly window, used for Gold votes. */
export function weekWindow(anchor: Date, now = new Date()): { start: Date; end: Date } {
  return windowOf(anchor, WEEK_MS, now);
}

async function playsUsed(subject: Subject, kind: PlayKind, since: Date): Promise<number> {
  const row = subject.accountId
    ? await one<{ used: string }>(
      `select count(*)::text as used from play_ledger
       where account_id = $1 and kind = $2 and created_at >= $3 and source = 'allowance'`,
      [subject.accountId, kind, since])
    : await one<{ used: string }>(
      `select count(*)::text as used from play_ledger
       where guest_id = $1 and kind = $2 and created_at >= $3 and source = 'allowance'`,
      [subject.guestId, kind, since]);
  return Number(row?.used ?? 0);
}

export async function quotaFor(subject: Subject, kind: PlayKind, tier: Tier, anchor: Date): Promise<QuotaState> {
  const limit = allowance(tier, kind);
  if (limit === null) return { kind, limit: null, used: 0, remaining: null, bonus: 0 };
  const { start, end } = allowanceWindow(anchor);
  const [used, bonus] = await Promise.all([playsUsed(subject, kind, start), unspentCredits(subject, kind)]);
  return { kind, limit, used, remaining: remainingPlays(limit, used, bonus), bonus, resetsAt: end.toISOString() };
}

export interface Who {
  tier: Tier;
  registered: boolean;
  subject: Subject;
  anchor: Date;
  subscription?: SubscriptionState;
}

export async function entitlementsFor(who: Who): Promise<Entitlements> {
  const details = plan(who.tier);
  const quotas = await Promise.all((['classic', 'fusion'] as PlayKind[]).map(kind => quotaFor(who.subject, kind, who.tier, who.anchor)));
  return {
    tier: who.tier,
    registered: who.registered,
    ads: details.ads,
    voting: details.voting,
    earlyAccess: details.earlyAccess,
    quotas,
    subscription: who.subscription,
  };
}

/** Entitlements for a deployment with no database: everything open, nothing metered. */
export function openEntitlements(): Entitlements {
  return {
    tier: 'silver', registered: false, ads: false, voting: false, earlyAccess: true,
    quotas: [
      { kind: 'classic', limit: null, used: 0, remaining: null, bonus: 0 },
      { kind: 'fusion', limit: null, used: 0, remaining: null, bonus: 0 },
    ],
  };
}

export interface PlaySpend {
  subject: Subject;
  kind: PlayKind;
  tier: Tier;
  /** Start of this player's daily window, so bonus credits are only spent once the allowance is gone. */
  anchor: Date;
  style: string;
  map?: string;
  room?: string;
  matchId?: string;
}

async function insertLedger(spend: PlaySpend, source: 'allowance' | 'bonus', creditId: string | null): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into play_ledger (account_id, guest_id, kind, tier, style, map, room, match_id, source, credit_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text as id`,
    [spend.subject.accountId ?? null, spend.subject.guestId ?? null, spend.kind, spend.tier,
      spend.style, spend.map ?? null, spend.room ?? null, spend.matchId ?? null, source, creditId]);
  return row!.id;
}

/** Spend one play. Returns the ledger id, so it can be refunded if the match never starts. */
export async function spendPlay(spend: PlaySpend): Promise<string> {
  const limit = allowance(spend.tier, spend.kind);
  if (limit === null) return insertLedger(spend, 'allowance', null);
  const { start } = allowanceWindow(spend.anchor);
  const used = await playsUsed(spend.subject, spend.kind, start);
  if (used < limit) return insertLedger(spend, 'allowance', null);
  const creditId = await consumeCredit(spend.subject, spend.kind);
  if (!creditId) throw new Error('No play remaining');
  return insertLedger(spend, 'bonus', creditId);
}

/** Give a play back — used when a match is abandoned before it really began. */
export async function refundPlay(ledgerId: string): Promise<void> {
  const row = await one<{ credit_id: string | null }>(
    `delete from play_ledger where id = $1 returning credit_id::text as credit_id`, [ledgerId]);
  if (row?.credit_id) await restoreCredit(row.credit_id);
}

export async function attachMatch(ledgerId: string, matchId: string): Promise<void> {
  await query(`update play_ledger set match_id = $2 where id = $1`, [ledgerId, matchId]);
}

/** Mirror a Stripe subscription into the local table. */
export interface SubscriptionUpsert {
  id: string; accountId: string; tier: Tier; status: string;
  priceId: string | null; lookupKey: string | null; unitAmount: number | null; currency: string | null;
  currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; pendingTier: Tier | null;
}

export async function upsertSubscription(s: SubscriptionUpsert): Promise<void> {
  await query(
    `insert into subscriptions (id, account_id, tier, status, price_id, lookup_key, unit_amount, currency,
       current_period_end, cancel_at_period_end, pending_tier, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (id) do update set
       account_id = excluded.account_id, tier = excluded.tier, status = excluded.status,
       price_id = excluded.price_id, lookup_key = excluded.lookup_key, unit_amount = excluded.unit_amount,
       currency = excluded.currency, current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, pending_tier = excluded.pending_tier,
       updated_at = now()`,
    [s.id, s.accountId, s.tier, s.status, s.priceId, s.lookupKey, s.unitAmount, s.currency,
      s.currentPeriodEnd, s.cancelAtPeriodEnd, s.pendingTier]);
}

/** True when this Stripe event has already been applied. Records it when it has not. */
export async function eventAlreadyHandled(id: string, type: string): Promise<boolean> {
  if (!platformEnabled()) return false;
  const row = await one<{ inserted: boolean }>(
    `insert into stripe_events (id, type) values ($1, $2)
     on conflict (id) do nothing returning true as inserted`, [id, type]);
  return !row;
}
