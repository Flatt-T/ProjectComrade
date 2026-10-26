import { describe, expect, it } from 'vitest';
import {
  EARLY_ACCESS_DAYS, PAID_TIERS, PLANS, TIERS, VOTES_PER_WEEK,
  allowance, handleValid, plan, playKind, tierForLookupKey, tierRank,
} from '../../packages/contracts/src/index';
import { WEEK_MS, tierFromSubscription, weekWindow } from '../../apps/service/src/entitlements';
import { scoreOf } from '../../apps/service/src/history';

describe('tier entitlements', () => {
  it('matches the published offer exactly', () => {
    // Free: three Classic and one Fusion a week, with advertisements.
    expect(allowance('free', 'classic')).toBe(3);
    expect(allowance('free', 'fusion')).toBe(1);
    expect(plan('free').ads).toBe(true);

    // Bronze: unlimited Classic, five Fusion, no advertisements.
    expect(allowance('bronze', 'classic')).toBeNull();
    expect(allowance('bronze', 'fusion')).toBe(5);
    expect(plan('bronze').ads).toBe(false);

    // Silver: unlimited everything.
    expect(allowance('silver', 'classic')).toBeNull();
    expect(allowance('silver', 'fusion')).toBeNull();

    // Gold: unlimited, plus voting and early access.
    expect(allowance('gold', 'fusion')).toBeNull();
    expect(plan('gold').voting).toBe(true);
    expect(plan('gold').earlyAccess).toBe(true);
    // No other tier votes or gets content early.
    for (const tier of TIERS.filter(t => t !== 'gold')) {
      expect(plan(tier).voting).toBe(false);
      expect(plan(tier).earlyAccess).toBe(false);
    }
  });

  it('gives guests a single taster and shows them an advertisement', () => {
    expect(allowance('guest', 'classic')).toBe(1);
    expect(allowance('guest', 'fusion')).toBe(0);
    expect(plan('guest').ads).toBe(true);
  });

  it('bills the original engines as Classic and the Fusion Engine as Fusion', () => {
    expect(playKind('td-classic')).toBe('classic');
    expect(playKind('ra1')).toBe('classic');
    expect(playKind('td-fusion')).toBe('fusion');
    expect(playKind('ra1-fusion')).toBe('fusion');
    expect(playKind('dune2k')).toBe('fusion');
    expect(playKind('ra2')).toBe('fusion');
    expect(playKind('fusion-leviathan')).toBe('fusion');
  });

  it('only sells the three paid tiers, each with its own Stripe lookup key', () => {
    expect(PAID_TIERS).toEqual(['bronze', 'silver', 'gold']);
    const keys = PAID_TIERS.map(t => PLANS[t].lookupKey);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every(Boolean)).toBe(true);
    expect(PLANS.free.lookupKey).toBeUndefined();
    expect(PLANS.guest.lookupKey).toBeUndefined();
  });

  it('maps a Stripe lookup key back to the tier it sells', () => {
    for (const tier of PAID_TIERS) expect(tierForLookupKey(PLANS[tier].lookupKey)).toBe(tier);
    expect(tierForLookupKey('something_else')).toBeNull();
    expect(tierForLookupKey(null)).toBeNull();
    expect(tierForLookupKey(undefined)).toBeNull();
  });

  it('ranks tiers so an upgrade can be told from a downgrade', () => {
    expect(tierRank('gold')).toBeGreaterThan(tierRank('silver'));
    expect(tierRank('silver')).toBeGreaterThan(tierRank('bronze'));
    expect(tierRank('bronze')).toBeGreaterThan(tierRank('free'));
    expect(tierRank('free')).toBeGreaterThan(tierRank('guest'));
  });
});

describe('the weekly window', () => {
  const anchor = new Date('2026-03-04T09:30:00.000Z');

  it('starts at the registration moment and lasts exactly a week', () => {
    const { start, end } = weekWindow(anchor, anchor);
    expect(start.toISOString()).toBe(anchor.toISOString());
    expect(end.getTime() - start.getTime()).toBe(WEEK_MS);
  });

  it('holds still for the whole week, then steps on by exactly one week', () => {
    const sixDays = new Date(anchor.getTime() + 6 * 24 * 3600_000);
    expect(weekWindow(anchor, sixDays).start.toISOString()).toBe(anchor.toISOString());

    // A second past the week and the allowance has renewed.
    const justOver = new Date(anchor.getTime() + WEEK_MS + 1000);
    expect(weekWindow(anchor, justOver).start.getTime()).toBe(anchor.getTime() + WEEK_MS);
  });

  it("renews on the player's own day, not on a Monday", () => {
    // Anchored on a Wednesday, so every window must also start on a Wednesday.
    for (let week = 0; week < 10; week++) {
      const now = new Date(anchor.getTime() + week * WEEK_MS + 3600_000);
      expect(weekWindow(anchor, now).start.getUTCDay()).toBe(anchor.getUTCDay());
    }
  });

  it('never produces a window before the anchor, however odd the clock', () => {
    const before = new Date(anchor.getTime() - 5 * WEEK_MS);
    expect(weekWindow(anchor, before).start.getTime()).toBe(anchor.getTime());
  });
});

describe('subscription status drives the tier', () => {
  const base = {
    id: 'sub_1', tier: 'gold' as const, currentPeriodEnd: null,
    cancelAtPeriodEnd: false, priceId: 'price_1', unitAmount: 979, currency: 'gbp',
  };

  it('keeps the tier while Stripe is still collecting, including past_due', () => {
    for (const status of ['active', 'trialing', 'past_due'] as const) {
      expect(tierFromSubscription({ ...base, status })).toBe('gold');
    }
  });

  it('falls back to free once the subscription is really over', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'] as const) {
      expect(tierFromSubscription({ ...base, status })).toBe('free');
    }
    expect(tierFromSubscription(undefined)).toBe('free');
  });
});

describe('scoring', () => {
  const stats = {
    credits: 0, harvested: 10_000, spent: 0,
    unitsLost: 5, unitsKilled: 12, buildingsLost: 1, buildingsKilled: 3,
  };

  it('rewards economy and damage, and penalises losses', () => {
    // 1000 harvest + 120 kills + 75 buildings - 10 units - 5 buildings + 250 for the win.
    expect(scoreOf(stats, 'won')).toBe(1430);
    expect(scoreOf(stats, 'lost')).toBe(1180);
  });

  it('never goes negative, however badly it went', () => {
    expect(scoreOf({ ...stats, harvested: 0, unitsKilled: 0, buildingsKilled: 0, unitsLost: 500 }, 'lost')).toBe(0);
  });

  it('is the same formula for everyone in the match', () => {
    expect(scoreOf(stats, 'won') - scoreOf(stats, 'lost')).toBe(250);
  });
});

describe('callsigns', () => {
  it('accepts ordinary callsigns', () => {
    for (const handle of ['Nod', 'kane_lives', 'tanya-99', 'a.b.c', 'Commander7']) {
      expect(handleValid(handle), handle).toBe(true);
    }
  });

  it('refuses anything too short, too long, oddly punctuated or impersonating us', () => {
    for (const handle of ['ab', 'a'.repeat(21), '_leading', 'trailing-', 'double__sep', 'has space', 'emoji😀', 'admin', 'COMRADE', 'support']) {
      expect(handleValid(handle), handle).toBe(false);
    }
  });

  it('refuses anything that is not a string', () => {
    for (const handle of [undefined, null, 42, {}, []]) expect(handleValid(handle)).toBe(false);
  });
});

describe('published constants', () => {
  it('holds early access to a week and Gold votes to ten', () => {
    expect(EARLY_ACCESS_DAYS).toBe(7);
    expect(VOTES_PER_WEEK).toBe(10);
  });
});
