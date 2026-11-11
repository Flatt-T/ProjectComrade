// PW04 contract tests: versioned MMO protocol, identities, counters, operations,
// protection state machine and rules/decision configuration. All fixtures are original
// synthetic data — no classic assets or player data.
import { describe, expect, it } from 'vitest';
import {
  MMO_PROTOCOL, MMO_RULESET_ID, MMO_RULESET_VERSION, PERSISTENT_RULES_V1,
  MMO_CAPABILITIES_NONE, MMO_CAPABILITIES_MILESTONE1, MMO_DECISIONS_OPEN,
  counter, parseCounter, isUuid,
  parseMmoWorldConfig, parseMmoClientMessage, parseMmoAction, parseMmoOperation,
  parseProtectionRecord, parseBarterOffer,
  newProtection, protectionTransition, operationMayTriggerRecovery,
} from '../../packages/contracts/src/index';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REGION = ID(1), CMD = ID(2), ENT = ID(3), COMP = ID(4), OFFER = ID(5);

function command(action: unknown, over: Record<string, unknown> = {}) {
  return {
    protocol: MMO_PROTOCOL, type: 'command', commandId: CMD, regionId: REGION,
    seenEpoch: '3', lastSeenEventSeq: '9140', action, ...over,
  };
}

describe('mmo protocol envelope', () => {
  it('accepts a well-formed command and subscribe', () => {
    const cmd = parseMmoClientMessage(command({ t: 'move', entityIds: [ENT], x: 10, y: 20 }));
    expect(cmd.type).toBe('command');
    if (cmd.type === 'command') expect(cmd.action.t).toBe('move');
    const sub = parseMmoClientMessage({ protocol: MMO_PROTOCOL, type: 'subscribe', regionId: REGION, seenEpoch: '0', lastSeenEventSeq: '0' });
    expect(sub.type).toBe('subscribe');
  });

  it('rejects unknown protocol versions and classic-shaped messages', () => {
    expect(() => parseMmoClientMessage(command({ t: 'move', entityIds: [ENT], x: 1, y: 1 }, { protocol: 'comrade.mmo.v2' }))).toThrow(/protocol/i);
    expect(() => parseMmoClientMessage({ version: 1, type: 'turn', turn: 1, tick: 2, checksum: 3, commands: [] })).toThrow();
    expect(() => parseMmoClientMessage(command({ t: 'move', entityIds: [ENT], x: 1, y: 1 }, { regionId: 'not-a-uuid' }))).toThrow();
  });

  it('rejects malformed counters and oversized sequences', () => {
    expect(() => parseCounter('12x')).toThrow();
    expect(() => parseCounter('-1')).toThrow();
    expect(() => parseCounter('9223372036854775808')).toThrow();
    expect(() => parseMmoClientMessage(command({ t: 'stop', entityIds: [ENT] }, { seenEpoch: '1.5' }))).toThrow();
    // Counters beyond Number.MAX_SAFE_INTEGER round-trip as decimal strings.
    const big = '9007199254740993';
    expect(parseCounter(big)).toBe(big);
    const msg = parseMmoClientMessage(command({ t: 'stop', entityIds: [ENT] }, { lastSeenEventSeq: big }));
    expect(msg.type === 'command' ? msg.lastSeenEventSeq : '').toBe(big);
  });

  it('rejects malformed amounts, negative quantities and bad entity references', () => {
    expect(() => parseMmoAction({ t: 'move', entityIds: [ENT], x: -1, y: 0 })).toThrow();
    expect(() => parseMmoAction({ t: 'move', entityIds: ['nope'], x: 0, y: 0 })).toThrow();
    expect(() => parseMmoAction({ t: 'barterOffer', offer: { give: [{ kind: 'credits', amount: -5 }], want: [] } })).toThrow();
    expect(() => parseMmoAction({ t: 'selectShield', compoundId: COMP, seconds: -60 })).toThrow();
    expect(() => parseMmoAction({ t: 'selectShield', compoundId: COMP, seconds: 8 * 24 * 3600 })).toThrow();
    expect(() => parseMmoAction({ t: 'unknownFutureAction' })).toThrow();
    // Oversized payloads.
    expect(() => parseMmoAction({ t: 'move', entityIds: Array(65).fill(ENT), x: 0, y: 0 })).toThrow();
    expect(() => parseMmoAction({ t: 'chat', channel: 'region', text: 'x'.repeat(501) })).toThrow();
  });

  it('keeps intents free of asserted outcomes', () => {
    // A sell command carries only the entity; credits/ownership are server-computed.
    const parsed = parseMmoAction({ t: 'sell', entityId: ENT, credits: 9999, owner: ID(9) });
    expect(parsed).toEqual({ t: 'sell', entityId: ENT });
  });
});

describe('barter contracts', () => {
  const offer = {
    offerId: OFFER, regionId: REGION, fromId: ID(10), toId: ID(11),
    give: [{ kind: 'unit', ref: ENT, amount: 10 }, { kind: 'credits', amount: 100 }],
    want: [{ kind: 'shieldSeconds', amount: 7200 }],
    createdAtMs: 1_000, expiresAtMs: 2_000,
  };
  it('round-trips a free-price offer', () => {
    const parsed = parseBarterOffer(offer);
    expect(parsed.give).toHaveLength(2);
    expect(parsed.want[0].kind).toBe('shieldSeconds');
    // The same ten units may validly price at 100 or 1,000 credits — no valuation is imposed.
    const dearer = parseBarterOffer({ ...offer, want: [{ kind: 'credits', amount: 1000 }] });
    expect(dearer.want[0].amount).toBe(1000);
  });
  it('rejects self-trades, empty offers, bad refs and oversized sides', () => {
    expect(() => parseBarterOffer({ ...offer, toId: offer.fromId })).toThrow();
    expect(() => parseBarterOffer({ ...offer, give: [], want: [] })).toThrow();
    expect(() => parseBarterOffer({ ...offer, give: [{ kind: 'unit', ref: 'bad', amount: 1 }] })).toThrow();
    expect(() => parseBarterOffer({ ...offer, give: Array(33).fill({ kind: 'credits', amount: 1 }) })).toThrow();
    expect(() => parseBarterOffer({ ...offer, give: [{ kind: 'credits', ref: ENT, amount: 1 }] })).toThrow();
  });
});

describe('operations', () => {
  it('parses every operation kind and rejects unknown ones', () => {
    expect(parseMmoOperation({ kind: 'SELL_REFUND', entityId: ENT, compoundId: COMP }).kind).toBe('SELL_REFUND');
    expect(parseMmoOperation({ kind: 'PACK', entityId: ENT }).kind).toBe('PACK');
    expect(parseMmoOperation({ kind: 'BARTER', offerId: OFFER }).kind).toBe('BARTER');
    expect(parseMmoOperation({ kind: 'NEWCOMER_SPAWN', playerId: ID(10), regionId: REGION, faction: 'gdi', x: 5, y: 6 }).kind).toBe('NEWCOMER_SPAWN');
    const salvage = parseMmoOperation({ kind: 'SALVAGE_SPAWN', regionId: REGION, x: 1, y: 2, credits: '250' });
    expect(salvage.kind === 'SALVAGE_SPAWN' ? salvage.credits : '').toBe('250');
    expect(() => parseMmoOperation({ kind: 'TELEPORT', entityId: ENT })).toThrow();
    expect(() => parseMmoOperation({ kind: 'SELL_REFUND', entityId: 'bad', compoundId: COMP })).toThrow();
  });

  it('only sell-all, defeat and the recovery grant may trigger recovery', () => {
    expect(operationMayTriggerRecovery('SELL_REFUND')).toBe(true);
    expect(operationMayTriggerRecovery('DEFEAT')).toBe(true);
    expect(operationMayTriggerRecovery('RECOVERY_GRANT')).toBe(true);
    for (const kind of ['PACK', 'BARTER', 'UNPACK', 'DEPLOY', 'SELECT_PROTECTION', 'SHIELD_CONSUME',
      'NEWCOMER_SPAWN', 'RECOVERY_TRANSITION', 'SALVAGE_SPAWN', 'SITE_CAPTURE', 'LADDER_AWARD'] as const) {
      expect(operationMayTriggerRecovery(kind)).toBe(false);
    }
  });
});

describe('protection state machine', () => {
  const rules = PERSISTENT_RULES_V1;
  const T0 = 1_700_000_000_000;

  it('NEWCOMER counts online time only and lapses 24h after first spawn', () => {
    let rec = newProtection('NEWCOMER', COMP, ID(10), T0, rules);
    expect(rec.status).toBe('active');
    // One continuous online hour completes setup protection.
    rec = protectionTransition(rec, { t: 'tick', atMs: T0 + rules.setupProtectionOnlineMs }, rules);
    expect(rec.status).toBe('ended');
    // Offline stretches do not count: spawn, offline, online 30min, offline — still active.
    rec = newProtection('NEWCOMER', COMP, ID(10), T0, rules);
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0 + 1, inBattle: false }, rules);
    rec = protectionTransition(rec, { t: 'owner_online', atMs: T0 + 12 * 3600_000 }, rules);
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0 + 12 * 3600_000 + 1_800_000, inBattle: false }, rules);
    expect(rec.status).toBe('active');
    expect(rec.onlineMs).toBe(1_800_001);
    // The 24h lapse ends it even with online time remaining.
    rec = protectionTransition(rec, { t: 'tick', atMs: T0 + rules.setupProtectionLapseMs }, rules);
    expect(rec.status).toBe('ended');
  });

  it('OFFLINE_EARNED arms manually, activates only offline, pauses on login preserving time', () => {
    let rec = newProtection('OFFLINE_EARNED', COMP, ID(10), T0, rules);
    rec = { ...rec, armedSeconds: 8 * 3600 };
    expect(rec.status).toBe('armed');
    // Inventory alone never activates: a tick while online changes nothing.
    rec = protectionTransition(rec, { t: 'tick', atMs: T0 + 1000 }, rules);
    expect(rec.status).toBe('armed');
    // Going offline starts the shield at the armed duration.
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0 + 2000, inBattle: false }, rules);
    expect(rec.status).toBe('active');
    expect(rec.endsAtMs).toBe(T0 + 2000 + 8 * 3600 * 1000);
    // Six hours offline, then login: protection ends, ~2h preserved as armed seconds.
    const loginAt = T0 + 2000 + 6 * 3600_000;
    rec = protectionTransition(rec, { t: 'owner_online', atMs: loginAt }, rules);
    expect(rec.status).toBe('armed');
    expect(rec.armedSeconds).toBe(2 * 3600);
    expect(rec.endsAtMs).toBeNull();
    // Re-arm offline again consumes the preserved time from zero-pause semantics.
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: loginAt + 1000, inBattle: false }, rules);
    expect(rec.status).toBe('active');
    expect(rec.endsAtMs).toBe(loginAt + 1000 + 2 * 3600_000);
  });

  it('OFFLINE_EARNED cannot start mid-battle; the armed selection survives (D5)', () => {
    let rec = newProtection('OFFLINE_EARNED', COMP, ID(10), T0, rules);
    rec = { ...rec, armedSeconds: 3600 };
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0 + 1000, inBattle: true }, rules);
    expect(rec.status).toBe('armed');
    expect(rec.startedAtMs).toBeNull();
    // Battle clears; the region re-evaluates the offline transition.
    rec = protectionTransition(rec, { t: 'battle_cleared', atMs: T0 + 5000 }, rules);
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0 + 5001, inBattle: false }, rules);
    expect(rec.status).toBe('active');
    expect(rec.endsAtMs).toBe(T0 + 5001 + 3600_000);
  });

  it('OFFLINE_EARNED expires at its deadline without anyone watching', () => {
    let rec = newProtection('OFFLINE_EARNED', COMP, ID(10), T0, rules);
    rec = { ...rec, armedSeconds: 60 };
    rec = protectionTransition(rec, { t: 'owner_offline', atMs: T0, inBattle: false }, rules);
    rec = protectionTransition(rec, { t: 'tick', atMs: T0 + 59_999 }, rules);
    expect(rec.status).toBe('active');
    rec = protectionTransition(rec, { t: 'tick', atMs: T0 + 60_000 }, rules);
    expect(rec.status).toBe('ended');
    // A stale generation cannot kill a newer interval.
    const gen = rec.generation;
    rec = protectionTransition(rec, { t: 'shield_expired', generation: gen, atMs: T0 + 60_001 }, rules);
    expect(rec.status).toBe('ended');
  });

  it('RECOVERY ends only at the milestone, player choice, or player attack — never a timeout', () => {
    let rec = newProtection('RECOVERY', COMP, ID(10), T0, rules);
    rec = protectionTransition(rec, { t: 'milestone', power: 1, barracks: 0, atMs: T0 + 1 }, rules);
    expect(rec.status).toBe('active');
    rec = protectionTransition(rec, { t: 'milestone', power: 1, barracks: 1, atMs: T0 + 2 }, rules);
    expect(rec.status).toBe('ended');
    // Player choice ends it early.
    rec = newProtection('RECOVERY', COMP, ID(10), T0, rules);
    rec = protectionTransition(rec, { t: 'player_end_recovery', atMs: T0 + 1 }, rules);
    expect(rec.status).toBe('ended');
    // Attacking another player ends it at once.
    rec = newProtection('RECOVERY', COMP, ID(10), T0, rules);
    rec = protectionTransition(rec, { t: 'player_attack', atMs: T0 + 1 }, rules);
    expect(rec.status).toBe('ended');
    // Ended records ignore further events.
    rec = protectionTransition(rec, { t: 'milestone', power: 9, barracks: 9, atMs: T0 + 2 }, rules);
    expect(rec.status).toBe('ended');
  });

  it('protection records round-trip through the validator', () => {
    const rec = newProtection('OFFLINE_EARNED', COMP, ID(10), T0, rules);
    const armed = { ...rec, armedSeconds: 3600 };
    expect(parseProtectionRecord(JSON.parse(JSON.stringify(armed)))).toEqual(armed);
    expect(() => parseProtectionRecord({ ...armed, generation: 'x' })).toThrow();
    expect(() => parseProtectionRecord({ ...armed, kind: 'CHEAT' })).toThrow();
  });
});

describe('world configuration and decisions', () => {
  const base = {
    protocol: MMO_PROTOCOL, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    profile: PERSISTENT_RULES_V1, capabilities: MMO_CAPABILITIES_NONE, decisions: MMO_DECISIONS_OPEN,
  };
  it('parses a full config and rejects bad versions/decisions', () => {
    const cfg = parseMmoWorldConfig(base);
    expect(cfg.profile.nightlyShieldSeconds).toBe(8 * 3600);
    expect(cfg.decisions.fog_security).toBe('open');
    expect(() => parseMmoWorldConfig({ ...base, protocol: 'comrade.mmo.v9' })).toThrow();
    expect(() => parseMmoWorldConfig({ ...base, decisions: { ...MMO_DECISIONS_OPEN, paid_tiers: 'maybe' } })).toThrow();
    expect(() => parseMmoWorldConfig({ ...base, capabilities: { ...MMO_CAPABILITIES_NONE, barter: 'yes' } })).toThrow();
  });

  it('unresolved branches stay visibly open and gated off in the test profile', () => {
    // Every COMRADE 18 §6 item is represented as 'open'; the all-off capability set is
    // the profile unresolved branches run under until their issue lands.
    expect(Object.values(MMO_DECISIONS_OPEN).every(s => s === 'open')).toBe(true);
    expect(Object.values(MMO_CAPABILITIES_NONE).every(v => v === false)).toBe(true);
    const cfg = parseMmoWorldConfig({ ...base, capabilities: MMO_CAPABILITIES_MILESTONE1 });
    expect(cfg.capabilities.notifications).toBe(true);
    expect(cfg.capabilities.barter).toBe(false); // PW13, not yet implemented
    expect(cfg.capabilities.multiRegion).toBe(false); // PW18
  });

  it('rules profile rejects missing or malformed tunables', () => {
    const missing = { ...PERSISTENT_RULES_V1 } as Record<string, unknown>;
    delete missing.nightlyShieldSeconds;
    expect(() => parseMmoWorldConfig({ ...base, profile: missing })).toThrow(/nightlyShieldSeconds/);
    expect(() => parseMmoWorldConfig({ ...base, profile: { ...PERSISTENT_RULES_V1, maxCompounds: -1 } })).toThrow();
    expect(() => parseMmoWorldConfig({ ...base, profile: { ...PERSISTENT_RULES_V1, powerScoreSalvageFloorRatio: 4 } })).toThrow();
  });
});

describe('identities', () => {
  it('validates stable UUID identities and rejects display names as ids', () => {
    expect(isUuid(ID(1))).toBe(true);
    expect(isUuid('Commander_Flint')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(counter(0)).toBe('0');
    expect(() => counter(-1)).toThrow();
  });
});
