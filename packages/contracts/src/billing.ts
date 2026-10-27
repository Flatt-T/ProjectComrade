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

/** Seconds a player must watch to earn one match when they have none left. */
export const CREDIT_AD_SECONDS: Record<PlayKind, number> = { classic: 30, fusion: 60 };
/** Rolling 24-hour cap on advertisement-earned matches, per kind, against house-ad farming. */
export const AD_CREDITS_PER_DAY = 20;

/** One-off pack of extra matches. The amount is in Stripe, bound by `lookupKey`. */
export type CreditPackId = 'battle';
export interface CreditPack {
  id: CreditPackId;
  name: string;
  lookupKey: string;
  classic: number;
  fusion: number;
  blurb: string;
}
export const CREDIT_PACK: CreditPack = {
  id: 'battle',
  name: 'Battle pack',
  lookupKey: 'comrade_credit_pack',
  classic: 5,
  fusion: 3,
  blurb: 'Five Classic matches and three Fusion matches, kept until you play them.',
};
export function packForLookupKey(key: string | null | undefined): CreditPack | null {
  return key === CREDIT_PACK.lookupKey ? CREDIT_PACK : null;
}

/** Weekly remaining plus any extra credits; `null` means unlimited. */
export function remainingPlays(limit: number | null, used: number, bonus = 0): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - used) + Math.max(0, bonus);
}

export interface TierPlan {
  id: Tier;
  name: string;
  /** Stripe price `lookup_key`; absent for the tiers nobody buys. */
  lookupKey?: string;
  /** Plays allowed in a 24-hour window; `null` means unlimited. */
  classicPlaysPerDay: number | null;
  fusionPlaysPerDay: number | null;
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
    id: 'guest', name: 'Guest', classicPlaysPerDay: 2, fusionPlaysPerDay: 1,
    ads: true, voting: false, earlyAccess: false,
    blurb: 'A daily taster, no account needed.',
    perks: ['2 Classic matches a day', '1 Fusion match a day', 'Advertisement before the match'],
  },
  free: {
    id: 'free', name: 'Free', classicPlaysPerDay: 3, fusionPlaysPerDay: 2,
    ads: true, voting: false, earlyAccess: false,
    blurb: 'Register a callsign and keep your record.',
    perks: ['3 Classic matches a day', '2 Fusion matches a day', 'Advertisement before the match', 'Match history and sharing'],
  },
  bronze: {
    id: 'bronze', name: 'Bronze', lookupKey: 'comrade_bronze_monthly',
    classicPlaysPerDay: null, fusionPlaysPerDay: 5,
    ads: false, voting: false, earlyAccess: false,
    blurb: 'Unlimited Classic play, no advertisements.',
    perks: ['Unlimited Classic matches', '5 Fusion matches a day', 'No advertisements — straight into the match', 'Match history and sharing'],
  },
  silver: {
    id: 'silver', name: 'Silver', lookupKey: 'comrade_silver_monthly',
    classicPlaysPerDay: null, fusionPlaysPerDay: null,
    ads: false, voting: false, earlyAccess: false,
    blurb: 'Everything, unlimited.',
    perks: ['Unlimited Classic matches', 'Unlimited Fusion matches', 'No advertisements', 'Match history and sharing'],
  },
  gold: {
    id: 'gold', name: 'Gold', lookupKey: 'comrade_gold_monthly',
    classicPlaysPerDay: null, fusionPlaysPerDay: null,
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

/** The daily allowance for a kind of play; `null` is unlimited. */
export function allowance(tier: Tier, kind: PlayKind): number | null {
  const p = plan(tier);
  return kind === 'fusion' ? p.fusionPlaysPerDay : p.classicPlaysPerDay;
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

export interface PackPrice {
  pack: CreditPackId;
  priceId: string;
  lookupKey: string;
  /** Minor units (pence for GBP), exactly as Stripe stores it. */
  unitAmount: number | null;
  currency: string;
  taxBehavior: 'inclusive' | 'exclusive' | 'unspecified' | null;
}

export interface PlanCatalogue { prices: PlanPrice[]; packs: PackPrice[]; currency: string }

/** What one kind of play has left in the current window. */
export interface QuotaState {
  kind: PlayKind;
  /** `null` when unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** Extra matches from advertisements or a pack, kept until spent. */
  bonus: number;
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
  /** True when this player can watch an advertisement to earn one match of `kind`. */
  canEarnByAd?: boolean;
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
  /** `credit` is watched to earn a match; `delay` is the free-tier overlay on a live match. */
  purpose?: 'delay' | 'credit';
}

export interface HouseAd { headline: string; body: string; cta: string; href: string }
