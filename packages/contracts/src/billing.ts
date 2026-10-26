// What a player is entitled to, and the shape of the billing API the web app talks to.
//
// Entitlements are data, not code: the plan table below is the single definition of every
// quota, ad rule and perk, so changing the offer is a change here and nowhere else. Prices
// are deliberately absent — they are retrieved live from Stripe by lookup key, so the
// product catalogue has exactly one source of truth and nothing can drift out of step.
import { GameStyle, styleInfo } from './index.js';

/** `guest` is an unregistered visitor; the rest are account tiers. */
export type Tier = 'guest' | 'free' | 'bronze' | 'silver' | 'gold';
/** Original-engine styles bill as `classic`; Fusion Engine styles as `fusion`. */
export type PlayKind = 'classic' | 'fusion';

export const TIERS: Tier[] = ['guest', 'free', 'bronze', 'silver', 'gold'];
/** Paid tiers, cheapest first: the order the upgrade ladder is shown in. */
export const PAID_TIERS: Tier[] = ['bronze', 'silver', 'gold'];

export interface TierPlan {
  id: Tier;
  name: string;
  /** Stripe price `lookup_key`; absent for the tiers nobody buys. */
  lookupKey?: string;
  /** Plays allowed in a weekly window; `null` means unlimited. */
  classicPlaysPerWeek: number | null;
  fusionPlaysPerWeek: number | null;
  /** Whether a pre-match advertisement is shown. */
  ads: boolean;
  /** Voting rights on proposed features and maps. */
  voting: boolean;
  /** Access to new maps and fusions during their early-access window. */
  earlyAccess: boolean;
  blurb: string;
  perks: string[];
}

export const EARLY_ACCESS_DAYS = 7;

export const PLANS: Record<Tier, TierPlan> = {
  guest: {
    id: 'guest', name: 'Guest', classicPlaysPerWeek: 1, fusionPlaysPerWeek: 0,
    ads: true, voting: false, earlyAccess: false,
    blurb: 'One taster match, no account needed.',
    perks: ['One Classic match a week', 'Advertisement before the match'],
  },
  free: {
    id: 'free', name: 'Free', classicPlaysPerWeek: 3, fusionPlaysPerWeek: 1,
    ads: true, voting: false, earlyAccess: false,
    blurb: 'Register a callsign and keep your record.',
    perks: ['3 Classic matches a week', '1 Fusion match a week', 'Advertisement before the match', 'Match history and sharing'],
  },
  bronze: {
    id: 'bronze', name: 'Bronze', lookupKey: 'comrade_bronze_monthly',
    classicPlaysPerWeek: null, fusionPlaysPerWeek: 5,
    ads: false, voting: false, earlyAccess: false,
    blurb: 'Unlimited Classic play, no advertisements.',
    perks: ['Unlimited Classic matches', '5 Fusion matches a week', 'No advertisements — straight into the match', 'Match history and sharing'],
  },
  silver: {
    id: 'silver', name: 'Silver', lookupKey: 'comrade_silver_monthly',
    classicPlaysPerWeek: null, fusionPlaysPerWeek: null,
    ads: false, voting: false, earlyAccess: false,
    blurb: 'Everything, unlimited.',
    perks: ['Unlimited Classic matches', 'Unlimited Fusion matches', 'No advertisements', 'Match history and sharing'],
  },
  gold: {
    id: 'gold', name: 'Gold', lookupKey: 'comrade_gold_monthly',
    classicPlaysPerWeek: null, fusionPlaysPerWeek: null,
    ads: false, voting: true, earlyAccess: true,
    blurb: 'Unlimited play, a vote on what gets built, and new content first.',
    perks: ['Unlimited Classic matches', 'Unlimited Fusion matches', 'No advertisements',
      'Voting rights on new features and maps', `New maps and fusions ${EARLY_ACCESS_DAYS} days before anyone else`],
  },
};

export function plan(tier: Tier): TierPlan { return PLANS[tier] ?? PLANS.guest; }

/** Which allowance a game style draws on. */
export function playKind(style: GameStyle): PlayKind {
  return styleInfo(style).engine === 'fusion' ? 'fusion' : 'classic';
}

/** The weekly allowance for a kind of play; `null` is unlimited. */
export function allowance(tier: Tier, kind: PlayKind): number | null {
  const p = plan(tier);
  return kind === 'fusion' ? p.fusionPlaysPerWeek : p.classicPlaysPerWeek;
}

/** Map a Stripe price lookup key back to the tier it sells. */
export function tierForLookupKey(key: string | null | undefined): Tier | null {
  if (!key) return null;
  return PAID_TIERS.find(t => PLANS[t].lookupKey === key) ?? null;
}

/** Tier ranking, so an upgrade can be told from a downgrade. */
export function tierRank(tier: Tier): number { return TIERS.indexOf(tier); }

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** A price as Stripe reports it; the web app never hardcodes an amount. */
export interface PlanPrice {
  tier: Tier;
  priceId: string;
  lookupKey: string;
  /** Minor units (pence for GBP), exactly as Stripe stores it. */
  unitAmount: number | null;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year' | null;
  intervalCount: number;
  /** Whether Stripe shows this price as tax-inclusive. */
  taxBehavior: 'inclusive' | 'exclusive' | 'unspecified' | null;
  /** Free trial days configured on the price, if any. */
  trialDays: number | null;
}

export interface PlanCatalogue { prices: PlanPrice[]; currency: string }

/** What one kind of play has left in the current window. */
export interface QuotaState {
  kind: PlayKind;
  /** `null` when unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** ISO timestamp the window resets at; absent when unlimited. */
  resetsAt?: string;
}

export interface Entitlements {
  tier: Tier;
  /** True once a registered account is signed in. */
  registered: boolean;
  /** Pre-match advertisement required for this player. */
  ads: boolean;
  voting: boolean;
  earlyAccess: boolean;
  quotas: QuotaState[];
  subscription?: SubscriptionState;
}

export type SubscriptionStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
  | 'incomplete_expired' | 'unpaid' | 'paused';

export interface SubscriptionState {
  id: string;
  tier: Tier;
  status: SubscriptionStatus;
  /** ISO timestamps. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Set when the subscription is scheduled to change tier at renewal. */
  pendingTier?: Tier;
  priceId: string | null;
  /** Minor units, from the price actually being charged. */
  unitAmount: number | null;
  currency: string | null;
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: string | null;
  created: string;
  periodStart: string | null;
  periodEnd: string | null;
  total: number;
  amountPaid: number;
  currency: string;
  description: string | null;
  /** Hosted invoice page and PDF, both short-lived Stripe URLs. */
  hostedUrl: string | null;
  pdfUrl: string | null;
}

/** Decision returned when a player asks to start or join a match. */
export interface PlayDecision {
  allowed: boolean;
  kind: PlayKind;
  /** Why it was refused, for the upgrade prompt. */
  reason?: 'quota' | 'early-access' | 'registration-required';
  /** Pre-match advertisement this player must watch. */
  ad?: AdBreak;
  quota: QuotaState;
  tier: Tier;
}

/** A pre-match advertisement slot, resolved server-side from the waterfall. */
export interface AdBreak {
  /** Correlates the impression report with the slot that was served. */
  token: string;
  seconds: number;
  /** Ordered VAST tag URLs; the client falls through them on error or timeout. */
  tags: string[];
  /** Shown when every network in the waterfall fails. */
  house: HouseAd;
  /** Milliseconds to wait for a tag before moving down the waterfall. */
  timeoutMs: number;
  /** False when the viewer has not consented to personalised advertising. */
  personalised: boolean;
}

export interface HouseAd { headline: string; body: string; cta: string; href: string }
