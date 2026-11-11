// Persistent-world ("MMO beta") contracts: versioned protocol, identities, commands,
// authoritative results, operations, protection states and the rules profile.
//
// This module is deliberately separate from the classic room/lockstep contracts in
// index.ts: a persistent command is never a classic match message, and classic four-seat
// limits do not apply. Everything a client sends is an *intent* — the region authority
// decides credits, ownership, health, shields and outcomes (COMRADE 14 §5, COMRADE 18 §2.2).
//
// Wire counters (event sequences, ticks, epochs, balances) are decimal strings, never
// JSON numbers: they can exceed JavaScript's safe integer range (COMRADE 14 §5).
import { Faction } from './index.js';

export const MMO_PROTOCOL = 'comrade.mmo.v1' as const;
export const MMO_RULESET_ID = 'persistent_world' as const;
export const MMO_RULESET_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Identities and counters
// ---------------------------------------------------------------------------

/** Opaque durable identifiers. Accounts reuse the platform's account UUID. */
export type MmoId = string;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is MmoId => typeof x === 'string' && UUID.test(x);

/**
 * A counter that may exceed Number.MAX_SAFE_INTEGER: a non-negative decimal string,
 * at most signed-bigint range (COMRADE 14 §5 parseCounter). Serialize with BigInt(x).toString().
 */
export type Counter = string;
const COUNTER = /^(0|[1-9][0-9]{0,18})$/;
export const MAX_COUNTER = 9223372036854775807n;
export function parseCounter(value: unknown): Counter {
  if (typeof value !== 'string' || !COUNTER.test(value) || BigInt(value) > MAX_COUNTER) {
    throw new Error('INVALID_COUNTER');
  }
  return value;
}
export const counter = (n: bigint | number): Counter => {
  const v = BigInt(n);
  if (v < 0n || v > MAX_COUNTER) throw new Error('COUNTER_RANGE');
  return v.toString();
};

// ---------------------------------------------------------------------------
// Rules profile: every COMRADE 18 tunable lives here, never in code paths.
// ---------------------------------------------------------------------------

/**
 * The persistent-mode rules profile. Values marked (tunable) in COMRADE 18 are the
 * approved starting defaults; unspecified magnitudes are implementation choices recorded
 * in docs/persistent-world/DECISIONS.md §D. Profiles are versioned data, validated on
 * the wire — a region pins the profile version it was created under.
 */
export interface MmoRulesProfile {
  version: number;
  /** Milliseconds after the last live socket before a player counts as offline. */
  offlineAfterMs: number;
  /** Window in which dealing or taking player-vs-player damage marks a compound in battle. */
  battleWindowMs: number;
  /** Free nightly shield allowance per day, seconds; consumed before earned hours. */
  nightlyShieldSeconds: number;
  /** Earned-shield income cap per day from objectives and crates combined, seconds. */
  earnedShieldDailyCapSeconds: number;
  /** Newcomer setup protection: online milliseconds required to complete it. */
  setupProtectionOnlineMs: number;
  /** Newcomer protection lapses this long after first spawn regardless of online time. */
  setupProtectionLapseMs: number;
  /** Credits multiplier over the pack's standard skirmish start for the starter grant. */
  starterCreditsMultiplier: number;
  /** Maximum compounds (deployed construction yards) one player may hold. */
  maxCompounds: number;
  /** Target minutes of sustained assault to level a developed base (lower/upper bound). */
  baseLevelMinutes: { min: number; max: number };
  /** Army supply cap per player and upkeep credits per supply point per minute. */
  armySupply: { cap: number; upkeepPerPointPerMinute: number };
  /** Recovery: only these structure roles may be built while recovering. */
  recoveryBuildRoles: string[];
  /** Recovery: maximum banked-credit accrual while protected, credits. */
  recoveryCreditCap: number;
  /** Recovery milestone: one power structure plus one barracks-equivalent. */
  recoveryMilestone: { power: number; barracks: number };
  /** Salvage: percent of build cost dropped, and decay time in seconds. */
  salvage: { percentOfCost: number; decaySeconds: number };
  /** Capturable sites per region (min/max neutral sites generated). */
  sitesPerRegion: { min: number; max: number };
  /** Transport capacities (COMRADE 18 §3.8). */
  transport: {
    seaLandingCraft: { capacityMcv: number; capacityCarrier: number; capacityVehicles: number };
    heavyAirlift: { capacityMcv: number; capacityCarrier: number };
  };
  /** Alliance membership cap. */
  allianceMaxMembers: number;
  /** Anti-snowball: power-score ratio below which a victim yields no salvage or ladder points. */
  powerScoreSalvageFloorRatio: number;
  /** Reward catalogue (COMRADE 18 §3.4/§3.10). */
  rewards: {
    dailyObjectives: number;
    dailyObjectiveShieldSeconds: number;
    weeklyObjectiveShieldSeconds: number;
    notificationShieldWarningMinutes: number;
  };
  /** Hibernation look-ahead for inbound transfers, milliseconds. */
  hibernateInboundLookaheadMs: number;
}

/** COMRADE 18 approved starting defaults (tunable values). */
export const PERSISTENT_RULES_V1: MmoRulesProfile = {
  version: 1,
  offlineAfterMs: 60_000,
  battleWindowMs: 300_000,
  nightlyShieldSeconds: 8 * 3600,
  earnedShieldDailyCapSeconds: 12 * 3600,
  setupProtectionOnlineMs: 3_600_000,
  setupProtectionLapseMs: 86_400_000,
  starterCreditsMultiplier: 2,
  maxCompounds: 3,
  baseLevelMinutes: { min: 20, max: 30 },
  armySupply: { cap: 100, upkeepPerPointPerMinute: 1 },
  recoveryBuildRoles: ['construction-yard', 'power', 'refinery', 'barracks'],
  recoveryCreditCap: 5_000,
  recoveryMilestone: { power: 1, barracks: 1 },
  salvage: { percentOfCost: 25, decaySeconds: 600 },
  sitesPerRegion: { min: 2, max: 4 },
  transport: {
    seaLandingCraft: { capacityMcv: 1, capacityCarrier: 1, capacityVehicles: 5 },
    heavyAirlift: { capacityMcv: 1, capacityCarrier: 1 },
  },
  allianceMaxMembers: 10,
  powerScoreSalvageFloorRatio: 0.5,
  rewards: {
    dailyObjectives: 3,
    dailyObjectiveShieldSeconds: 2 * 3600,
    weeklyObjectiveShieldSeconds: 10 * 3600,
    notificationShieldWarningMinutes: 30,
  },
  hibernateInboundLookaheadMs: 120_000,
};

// ---------------------------------------------------------------------------
// Capabilities and open decisions (COMRADE 18 §6)
// ---------------------------------------------------------------------------

/** Feature gates a world may enable. An unresolved decision keeps its gate off. */
export interface MmoCapabilities {
  barter: boolean;
  packing: boolean;
  transportSea: boolean;
  transportAir: boolean;
  multiRegion: boolean;
  ladder: boolean;
  notifications: boolean;
  notificationsEmail: boolean;
  allianceChat: boolean;
  mapPings: boolean;
  salvage: boolean;
  capturableSites: boolean;
  objectives: boolean;
  awayReport: boolean;
}

/** The four items COMRADE 18 §6 leaves open. 'open' means the gated feature stays off. */
export type MmoOpenDecision = 'paid_tiers' | 'bridge_rules' | 'engineer_capture' | 'fog_security';
export type MmoDecisionState = Record<MmoOpenDecision, 'open' | 'resolved'>;
export const MMO_OPEN_DECISIONS: MmoOpenDecision[] = ['paid_tiers', 'bridge_rules', 'engineer_capture', 'fog_security'];
export const MMO_DECISIONS_OPEN: MmoDecisionState = {
  paid_tiers: 'open', bridge_rules: 'open', engineer_capture: 'open', fog_security: 'open',
};

/** Everything off — the safe test profile for unresolved branches. */
export const MMO_CAPABILITIES_NONE: MmoCapabilities = {
  barter: false, packing: false, transportSea: false, transportAir: false, multiRegion: false,
  ladder: false, notifications: false, notificationsEmail: false, allianceChat: false,
  mapPings: false, salvage: false, capturableSites: false, objectives: false, awayReport: false,
};

/**
 * Milestone-1 (PW27) starting gates: single region, no economy trades yet, notifications
 * and the away report in, objectives in. Later issues raise individual flags as their
 * mechanics land — a capability is only ever enabled by the issue that implements it.
 */
export const MMO_CAPABILITIES_MILESTONE1: MmoCapabilities = {
  ...MMO_CAPABILITIES_NONE,
  notifications: true, allianceChat: true, mapPings: true, objectives: true, awayReport: true,
};

export interface MmoWorldConfig {
  protocol: typeof MMO_PROTOCOL;
  rulesetId: typeof MMO_RULESET_ID;
  rulesetVersion: number;
  profile: MmoRulesProfile;
  capabilities: MmoCapabilities;
  decisions: MmoDecisionState;
}

const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isPosInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0;
const isNonNegInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;

function parseProfile(value: unknown): MmoRulesProfile {
  const v = object(value);
  const p = { ...PERSISTENT_RULES_V1, ...v } as MmoRulesProfile;
  if (!isPosInt(v.version)) throw new Error('Invalid rules profile version');
  for (const key of ['offlineAfterMs', 'battleWindowMs', 'setupProtectionOnlineMs', 'setupProtectionLapseMs',
    'starterCreditsMultiplier', 'maxCompounds', 'recoveryCreditCap', 'earnedShieldDailyCapSeconds',
    'nightlyShieldSeconds', 'armySupply', 'baseLevelMinutes', 'recoveryMilestone', 'salvage',
    'sitesPerRegion', 'transport', 'rewards', 'hibernateInboundLookaheadMs', 'powerScoreSalvageFloorRatio',
    'allianceMaxMembers', 'recoveryBuildRoles'] as const) {
    if (v[key] === undefined) throw new Error(`Rules profile missing ${key}`);
  }
  if (!isNonNegInt(p.offlineAfterMs) || !isNonNegInt(p.battleWindowMs)
    || !isNonNegInt(p.setupProtectionOnlineMs) || !isNonNegInt(p.setupProtectionLapseMs)
    || !isPosInt(p.starterCreditsMultiplier) || !isPosInt(p.maxCompounds)
    || !isNonNegInt(p.recoveryCreditCap) || !isNonNegInt(p.nightlyShieldSeconds)
    || !isNonNegInt(p.earnedShieldDailyCapSeconds) || !isNonNegInt(p.hibernateInboundLookaheadMs)
    || !isNonNegInt(p.allianceMaxMembers)
    || typeof p.powerScoreSalvageFloorRatio !== 'number' || p.powerScoreSalvageFloorRatio <= 0 || p.powerScoreSalvageFloorRatio > 1
    || !Array.isArray(p.recoveryBuildRoles) || p.recoveryBuildRoles.length > 16 || p.recoveryBuildRoles.length === 0
    || p.recoveryBuildRoles.some(r => typeof r !== 'string' || !/^[a-z-]{2,32}$/.test(r))
    || !isPosInt(p.baseLevelMinutes?.min) || !isPosInt(p.baseLevelMinutes?.max) || p.baseLevelMinutes.min > p.baseLevelMinutes.max
    || !isNonNegInt(p.armySupply?.cap) || !isNonNegInt(p.armySupply?.upkeepPerPointPerMinute)
    || !isPosInt(p.recoveryMilestone?.power) || !isPosInt(p.recoveryMilestone?.barracks)
    || !isPosInt(p.salvage?.percentOfCost) || p.salvage.percentOfCost > 100 || !isPosInt(p.salvage?.decaySeconds)
    || !isPosInt(p.sitesPerRegion?.min) || !isPosInt(p.sitesPerRegion?.max) || p.sitesPerRegion.min > p.sitesPerRegion.max
    || !isPosInt(p.transport?.seaLandingCraft?.capacityMcv) || !isPosInt(p.transport?.seaLandingCraft?.capacityCarrier)
    || !isPosInt(p.transport?.seaLandingCraft?.capacityVehicles)
    || !isPosInt(p.transport?.heavyAirlift?.capacityMcv) || !isPosInt(p.transport?.heavyAirlift?.capacityCarrier)
    || !isPosInt(p.rewards?.dailyObjectives) || !isPosInt(p.rewards?.dailyObjectiveShieldSeconds)
    || !isPosInt(p.rewards?.weeklyObjectiveShieldSeconds) || !isPosInt(p.rewards?.notificationShieldWarningMinutes)) {
    throw new Error('Invalid rules profile values');
  }
  return p;
}

export function parseMmoWorldConfig(value: unknown): MmoWorldConfig {
  const v = object(value);
  if (v.protocol !== MMO_PROTOCOL) throw new Error('Unsupported MMO protocol');
  if (v.rulesetId !== MMO_RULESET_ID) throw new Error('Unsupported ruleset');
  if (!isPosInt(v.rulesetVersion)) throw new Error('Invalid ruleset version');
  const caps = object(v.capabilities ?? {});
  const capabilities = {} as MmoCapabilities;
  for (const key of ['barter', 'packing', 'transportSea', 'transportAir', 'multiRegion', 'ladder',
    'notifications', 'notificationsEmail', 'allianceChat', 'mapPings', 'salvage',
    'capturableSites', 'objectives', 'awayReport'] as const) {
    if (!isBool(caps[key])) throw new Error(`Missing capability ${key}`);
    capabilities[key] = caps[key];
  }
  // An unresolved decision must keep its capability off: paid tiers may never sell combat
  // power, bridge/engineer/fog behaviour stays at classic defaults until decided.
  const decisions = object(v.decisions ?? {});
  const state = {} as MmoDecisionState;
  for (const key of MMO_OPEN_DECISIONS) {
    if (decisions[key] !== 'open' && decisions[key] !== 'resolved') throw new Error(`Invalid decision state ${key}`);
    state[key] = decisions[key];
  }
  return { protocol: MMO_PROTOCOL, rulesetId: MMO_RULESET_ID, rulesetVersion: v.rulesetVersion, profile: parseProfile(v.profile), capabilities, decisions: state };
}

// ---------------------------------------------------------------------------
// Protection states (COMRADE 11 §3, COMRADE 18 §3.1–3.2, §2.6)
// ---------------------------------------------------------------------------

export type ProtectionKind = 'NEWCOMER' | 'OFFLINE_EARNED' | 'RECOVERY';
export type ProtectionStatus = 'armed' | 'active' | 'ended';

/**
 * One compound's protection record. Times are server-authoritative ISO-8601 instants or
 * millisecond offsets from a trusted epoch; the service never trusts client clocks.
 * `generation` increments on every pause/resume so a stale expiry job cannot consume a
 * paused shield (COMRADE 14 §7).
 */
export interface ProtectionRecord {
  kind: ProtectionKind;
  status: ProtectionStatus;
  compoundId: MmoId;
  ownerId: MmoId;
  generation: Counter;
  /** Newcomer: accumulated *online* milliseconds toward the setup hour. */
  onlineMs: number;
  /** Newcomer: instant the current online stretch began, or null while offline. */
  onlineSinceMs: number | null;
  /** Newcomer: absolute lapse instant after first spawn. */
  lapseAtMs: number | null;
  /** Earned shield: armed selection waiting for the offline transition. */
  armedSeconds: number;
  /** Earned shield: active interval [startedAtMs, endsAtMs). */
  startedAtMs: number | null;
  endsAtMs: number | null;
  /** Recovery: milestone progress toward power + barracks. */
  milestonePower: number;
  milestoneBarracks: number;
}

export function newProtection(kind: ProtectionKind, compoundId: MmoId, ownerId: MmoId, nowMs: number, rules: MmoRulesProfile): ProtectionRecord {
  return {
    kind, status: kind === 'OFFLINE_EARNED' ? 'armed' : 'active',
    compoundId, ownerId, generation: counter(0),
    onlineMs: 0,
    onlineSinceMs: kind === 'NEWCOMER' ? nowMs : null,
    lapseAtMs: kind === 'NEWCOMER' ? nowMs + rules.setupProtectionLapseMs : null,
    armedSeconds: 0,
    startedAtMs: kind === 'OFFLINE_EARNED' ? null : nowMs,
    endsAtMs: null,
    milestonePower: 0, milestoneBarracks: 0,
  };
}

export type ProtectionEvent =
  | { t: 'owner_online'; atMs: number }
  | { t: 'owner_offline'; atMs: number; inBattle: boolean }
  | { t: 'tick'; atMs: number }
  | { t: 'shield_expired'; generation: Counter; atMs: number }
  | { t: 'milestone'; power: number; barracks: number; atMs: number }
  | { t: 'player_end_recovery'; atMs: number }
  | { t: 'player_attack'; atMs: number }
  | { t: 'battle_cleared'; atMs: number };

/**
 * Pure protection state machine. Returns the next record (or the same object when
 * nothing changes). Combat rules that need world state — "in battle", milestone counts —
 * arrive as event fields computed by the region authority; this function only decides
 * what protection does with them. Deterministic and side-effect free so both the service
 * and tests exercise the same transition rules.
 */
export function protectionTransition(rec: ProtectionRecord, event: ProtectionEvent, rules: MmoRulesProfile): ProtectionRecord {
  if (rec.status === 'ended') return rec;
  const next = { ...rec };
  const bump = () => { next.generation = counter(BigInt(next.generation) + 1n); };
  // Effective online time at `atMs`: committed accumulation plus the live stretch.
  const onlineAt = (atMs: number) => next.onlineMs + (next.onlineSinceMs !== null ? Math.max(0, atMs - next.onlineSinceMs) : 0);
  const settleOnline = (atMs: number) => {
    if (next.onlineSinceMs !== null) {
      next.onlineMs = Math.min(rules.setupProtectionOnlineMs, onlineAt(atMs));
      next.onlineSinceMs = null;
    }
  };
  switch (rec.kind) {
    case 'NEWCOMER': {
      if (event.t === 'owner_online') {
        // A new online stretch begins; time only counts while the owner is online.
        // Repeated online events must not restart the stretch and lose elapsed time.
        if (next.onlineSinceMs === null) next.onlineSinceMs = event.atMs;
      } else if (event.t === 'owner_offline' || event.t === 'tick') {
        settleOnline(event.atMs);
      }
      if (event.t === 'tick' || event.t === 'owner_offline' || event.t === 'owner_online') {
        const done = onlineAt(event.atMs) >= rules.setupProtectionOnlineMs
          || (rec.lapseAtMs !== null && event.atMs >= rec.lapseAtMs);
        if (done) { next.status = 'ended'; next.onlineSinceMs = null; break; }
      }
      break;
    }
    case 'OFFLINE_EARNED': {
      if (event.t === 'owner_offline' && rec.status === 'armed') {
        // D5: an earned shield cannot start while the compound is in battle; the armed
        // selection stays armed and starts when the battle clears.
        if (!event.inBattle) {
          next.status = 'active';
          next.startedAtMs = event.atMs;
          next.endsAtMs = event.atMs + rec.armedSeconds * 1000;
          bump();
        }
      } else if (event.t === 'battle_cleared' && rec.status === 'armed') {
        // Handled by the region re-emitting owner_offline semantics; nothing to do here.
      } else if (event.t === 'owner_online' && rec.status === 'active') {
        // Login pauses consumption and preserves unused time.
        const remaining = Math.max(0, (rec.endsAtMs ?? event.atMs) - event.atMs);
        next.armedSeconds = Math.ceil(remaining / 1000);
        next.endsAtMs = null;
        next.status = 'armed';
        bump();
      } else if (event.t === 'shield_expired' && rec.status === 'active'
        && rec.generation === event.generation && event.atMs >= (rec.endsAtMs ?? Infinity)) {
        next.status = 'ended';
        next.armedSeconds = 0;
      } else if (event.t === 'tick' && rec.status === 'active' && rec.endsAtMs !== null && event.atMs >= rec.endsAtMs) {
        next.status = 'ended';
        next.armedSeconds = 0;
      }
      break;
    }
    case 'RECOVERY': {
      if (event.t === 'milestone') {
        next.milestonePower = event.power;
        next.milestoneBarracks = event.barracks;
        if (event.power >= rules.recoveryMilestone.power && event.barracks >= rules.recoveryMilestone.barracks) {
          next.status = 'ended';
        }
      } else if (event.t === 'player_end_recovery' || event.t === 'player_attack') {
        // Recovery ends at the milestone, on the player's choice, or at once if the
        // player attacks another player (COMRADE 18 §2.6). No timeout.
        next.status = 'ended';
      }
      break;
    }
  }
  return next;
}

/** Whether a journaled operation may produce the sell-all recovery transition. Only an
 *  ordinary SELL_REFUND of the player's last building (or a defeat) qualifies; PACK,
 *  BARTER and every other operation must never share that trigger (PW-T20/T21). */
export function operationMayTriggerRecovery(kind: MmoOperationKind): boolean {
  return kind === 'SELL_REFUND' || kind === 'DEFEAT' || kind === 'RECOVERY_GRANT';
}

// ---------------------------------------------------------------------------
// Operations: distinct economic/state transitions, never a generic 'sell' flag.
// ---------------------------------------------------------------------------

export type MmoOperationKind =
  | 'SELL_REFUND'      // ordinary sale for game credits; may trigger recovery when it is the last building
  | 'PACK'             // building → dedicated carrier; no refund, no recovery
  | 'UNPACK'           // carrier → deployed building at a valid site
  | 'BARTER'           // allied exchange settled atomically
  | 'DEPLOY'           // MCV/carrier deployment transition
  | 'SELECT_PROTECTION'// owner arms/disarms earned-shield selection (never activates it)
  | 'SHIELD_CONSUME'   // authoritative offline consumption of shield seconds
  | 'NEWCOMER_SPAWN'   // first spawn: starter grant + setup protection
  | 'RECOVERY_GRANT'   // protected minimal MCV after qualifying loss/sell-all
  | 'RECOVERY_TRANSITION' // enter/leave RECOVERY protection
  | 'SALVAGE_SPAWN'    // crates from a destroyed asset
  | 'SITE_CAPTURE'     // capturable site ownership change
  | 'LADDER_AWARD'     // ladder points
  | 'DEFEAT';          // base destroyed: recovery evaluation

export type MmoOperation =
  | { kind: 'SELL_REFUND'; entityId: MmoId; compoundId: MmoId }
  | { kind: 'PACK'; entityId: MmoId }
  | { kind: 'UNPACK'; entityId: MmoId; x: number; y: number }
  | { kind: 'BARTER'; offerId: MmoId }
  | { kind: 'DEPLOY'; entityId: MmoId; x: number; y: number }
  | { kind: 'SELECT_PROTECTION'; compoundId: MmoId; seconds: number }
  | { kind: 'SHIELD_CONSUME'; compoundId: MmoId; seconds: number; generation: Counter }
  | { kind: 'NEWCOMER_SPAWN'; playerId: MmoId; regionId: MmoId; faction: Faction; x: number; y: number }
  | { kind: 'RECOVERY_GRANT'; playerId: MmoId; regionId: MmoId; x: number; y: number }
  | { kind: 'RECOVERY_TRANSITION'; compoundId: MmoId; enter: boolean }
  | { kind: 'SALVAGE_SPAWN'; regionId: MmoId; x: number; y: number; credits: Counter }
  | { kind: 'SITE_CAPTURE'; siteId: MmoId; regionId: MmoId; ownerId: MmoId | null }
  | { kind: 'LADDER_AWARD'; playerId: MmoId; points: Counter; reason: string }
  | { kind: 'DEFEAT'; compoundId: MmoId };

// ---------------------------------------------------------------------------
// Client intents (commands) — requests, never asserted outcomes.
// ---------------------------------------------------------------------------

/** Simulation-level intents mirror the Fusion command set but address durable entity
 *  ids; the region resolves them to live sim entities at the journal boundary. */
export type MmoSimAction =
  | { t: 'move'; entityIds: MmoId[]; x: number; y: number }
  | { t: 'attackMove'; entityIds: MmoId[]; x: number; y: number }
  | { t: 'attack'; entityIds: MmoId[]; targetId: MmoId; force?: boolean }
  | { t: 'fireAt'; entityIds: MmoId[]; x: number; y: number }
  | { t: 'guard' | 'scatter' | 'stop' | 'deploy'; entityIds: MmoId[] }
  | { t: 'harvest'; entityIds: MmoId[]; x: number; y: number; lock?: boolean }
  | { t: 'enter'; entityIds: MmoId[]; targetId: MmoId }
  | { t: 'build'; item: string }
  | { t: 'cancel'; item: string }
  | { t: 'place'; item: string; x: number; y: number }
  | { t: 'repair'; entityId: MmoId }
  | { t: 'rally'; x: number; y: number }
  | { t: 'super'; entityId: MmoId; x: number; y: number; x2?: number; y2?: number };

/** Persistent-mode economic and social intents. */
export type MmoWorldAction =
  | { t: 'sell'; entityId: MmoId }
  | { t: 'pack'; entityId: MmoId }
  | { t: 'unpack'; entityId: MmoId; x: number; y: number }
  | { t: 'redeploy'; entityId: MmoId; x: number; y: number }
  | { t: 'barterOffer'; offer: BarterOffer }
  | { t: 'barterAccept'; offerId: MmoId }
  | { t: 'barterDecline' | 'barterCancel'; offerId: MmoId }
  | { t: 'selectShield'; compoundId: MmoId; seconds: number }
  | { t: 'clearShield'; compoundId: MmoId }
  | { t: 'endRecovery'; compoundId: MmoId }
  | { t: 'settle'; regionId: MmoId; faction: Faction; x: number; y: number }
  | { t: 'chat'; channel: 'region' | 'alliance'; text: string }
  | { t: 'ping'; x: number; y: number }
  | { t: 'objectiveClaim'; objectiveId: MmoId };

export type MmoAction = MmoSimAction | MmoWorldAction;

/** What one side puts into a barter. Free pricing is the rule: no valuation is imposed. */
export interface BarterItem {
  kind: 'unit' | 'credits' | 'shieldSeconds' | 'powerUp' | 'packedBuilding';
  /** entityId for units/buildings, item id for power-ups, omitted for bulk credits/shield. */
  ref?: MmoId;
  amount: number;
}
export interface BarterOffer {
  offerId: MmoId;
  regionId: MmoId;
  fromId: MmoId;
  toId: MmoId;
  give: BarterItem[];
  want: BarterItem[];
  createdAtMs: number;
  expiresAtMs: number;
}

/** The client → server envelope (COMRADE 14 §5 shape, extended). */
export interface MmoCommandMessage {
  protocol: typeof MMO_PROTOCOL;
  type: 'command';
  commandId: MmoId;
  regionId: MmoId;
  /** Region authority epoch and journal tail the client has seen; stale values are
   *  rejected rather than merged (COMRADE 14 §6). */
  seenEpoch: Counter;
  lastSeenEventSeq: Counter;
  action: MmoAction;
}

export interface MmoSubscribeMessage {
  protocol: typeof MMO_PROTOCOL;
  type: 'subscribe';
  regionId: MmoId;
  seenEpoch: Counter;
  lastSeenEventSeq: Counter;
}

export type MmoClientMessage = MmoCommandMessage | MmoSubscribeMessage;

// ---------------------------------------------------------------------------
// Server → client: snapshot header, events, command results.
// ---------------------------------------------------------------------------

export type MmoCommandStatus = 'received' | 'committed_pending_application' | 'applied' | 'rejected';

export interface MmoCommandResult {
  protocol: typeof MMO_PROTOCOL;
  type: 'commandResult';
  commandId: MmoId;
  status: MmoCommandStatus;
  regionId: MmoId;
  epoch: Counter;
  eventSeq: Counter | null;
  tick: Counter | null;
  /** Present only when status is 'applied'; never echoes client-asserted state. */
  result?: unknown;
  error?: { code: string; message: string };
}

export interface MmoSnapshotHeader {
  protocol: typeof MMO_PROTOCOL;
  type: 'snapshot';
  regionId: MmoId;
  epoch: Counter;
  /** Events the snapshot state already represents; replay starts after this seq. */
  lastAppliedSeq: Counter;
  /** Durable journal tail at snapshot time (may be ahead of lastAppliedSeq). */
  lastCommittedSeq: Counter;
  tick: Counter;
  rulesetVersion: number;
  engineArtifactSha256: string;
  stateSha256: string;
  /** Opaque sim state payload (format owned by the region host). */
  state: unknown;
}

export interface MmoEventMessage {
  protocol: typeof MMO_PROTOCOL;
  type: 'event';
  regionId: MmoId;
  eventSeq: Counter;
  epoch: Counter;
  tick: Counter;
  eventKind: string;
  payload: unknown;
}

export interface MmoWelcomeMessage {
  protocol: typeof MMO_PROTOCOL;
  type: 'welcome';
  playerId: MmoId;
  sessionId: MmoId;
  config: MmoWorldConfig;
  /** Regions this player currently has authority-visible presence in. */
  regions: MmoId[];
}

export type MmoServerMessage =
  | MmoWelcomeMessage
  | MmoSnapshotHeader
  | MmoEventMessage
  | MmoCommandResult
  | { protocol: typeof MMO_PROTOCOL; type: 'error'; code: string; message: string };

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
const cell = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= 0xffffff;
const str = (x: unknown, max = 512): x is string => typeof x === 'string' && x.length <= max;
const uuid = (x: unknown): x is MmoId => isUuid(x);
const counterField = (x: unknown): x is Counter => { try { parseCounter(x); return true; } catch { return false; } };
const faction = (x: unknown): x is Faction => typeof x === 'string' && /^[a-z0-9-]{2,24}$/.test(x);

const SIM_KINDS = new Set(['move', 'attackMove', 'attack', 'fireAt', 'guard', 'scatter', 'stop', 'deploy', 'harvest', 'enter', 'build', 'cancel', 'place', 'repair', 'rally', 'super']);
const WORLD_KINDS = new Set(['sell', 'pack', 'unpack', 'redeploy', 'barterOffer', 'barterAccept', 'barterDecline', 'barterCancel',
  'selectShield', 'clearShield', 'endRecovery', 'settle', 'chat', 'ping', 'objectiveClaim']);

function ids(value: unknown, max = 64): value is MmoId[] {
  return Array.isArray(value) && value.length <= max && value.every(uuid);
}

export function parseBarterItem(value: unknown): BarterItem {
  const v = object(value);
  if (!['unit', 'credits', 'shieldSeconds', 'powerUp', 'packedBuilding'].includes(String(v.kind))) throw new Error('Invalid barter item kind');
  if (!isNonNegInt(v.amount) || v.amount > 1_000_000) throw new Error('Invalid barter amount');
  if (v.ref !== undefined && !uuid(v.ref)) throw new Error('Invalid barter item ref');
  if ((v.kind === 'credits' || v.kind === 'shieldSeconds') && v.ref !== undefined) throw new Error('Bulk barter items take no ref');
  return { kind: v.kind as BarterItem['kind'], ref: v.ref as MmoId | undefined, amount: v.amount };
}

export function parseBarterOffer(value: unknown): BarterOffer {
  const v = object(value);
  if (!uuid(v.offerId) || !uuid(v.regionId) || !uuid(v.fromId) || !uuid(v.toId) || !isPosInt(v.createdAtMs) || !isPosInt(v.expiresAtMs)) throw new Error('Invalid barter offer');
  if (!Array.isArray(v.give) || v.give.length > 32 || !Array.isArray(v.want) || v.want.length > 32) throw new Error('Invalid barter offer sides');
  const give = v.give.map(parseBarterItem), want = v.want.map(parseBarterItem);
  if (!give.length && !want.length) throw new Error('Empty barter offer');
  if (v.fromId === v.toId) throw new Error('Cannot barter with yourself');
  return { offerId: v.offerId, regionId: v.regionId, fromId: v.fromId, toId: v.toId, give, want, createdAtMs: v.createdAtMs, expiresAtMs: v.expiresAtMs };
}

/** Validate one action payload. Returns the typed action or throws. */
export function parseMmoAction(value: unknown): MmoAction {
  const v = object(value);
  const t = String(v.t);
  if (!SIM_KINDS.has(t) && !WORLD_KINDS.has(t)) throw new Error('Unknown MMO action');
  const needIds = () => { if (!ids(v.entityIds)) throw new Error('Action requires entity ids'); };
  const needCell = () => { if (!cell(v.x) || !cell(v.y)) throw new Error('Action requires a cell'); };
  switch (t) {
    case 'move': case 'attackMove': needIds(); needCell(); return { t, entityIds: v.entityIds, x: v.x, y: v.y } as MmoAction;
    case 'attack': needIds(); if (!uuid(v.targetId)) throw new Error('Attack requires a target'); return { t, entityIds: v.entityIds, targetId: v.targetId, force: v.force === true } as MmoAction;
    case 'fireAt': needIds(); needCell(); return { t, entityIds: v.entityIds, x: v.x, y: v.y } as MmoAction;
    case 'guard': case 'scatter': case 'stop': case 'deploy': needIds(); return { t, entityIds: v.entityIds } as MmoAction;
    case 'harvest': needIds(); needCell(); return { t, entityIds: v.entityIds, x: v.x, y: v.y, lock: v.lock === true } as MmoAction;
    case 'enter': needIds(); if (!uuid(v.targetId)) throw new Error('Enter requires a target'); return { t, entityIds: v.entityIds, targetId: v.targetId } as MmoAction;
    case 'build': case 'cancel': if (!str(v.item, 64) || !/^[a-z0-9:@-]{1,64}$/.test(v.item)) throw new Error('Invalid item'); return { t, item: v.item } as MmoAction;
    case 'place': if (!str(v.item, 64) || !/^[a-z0-9:@-]{1,64}$/.test(v.item)) throw new Error('Invalid item'); needCell(); return { t, item: v.item, x: v.x, y: v.y } as MmoAction;
    case 'repair': if (!uuid(v.entityId)) throw new Error('Repair requires an entity'); return { t, entityId: v.entityId } as MmoAction;
    case 'rally': needCell(); return { t, x: v.x as number, y: v.y as number } as MmoAction;
    case 'super': if (!uuid(v.entityId)) throw new Error('super requires an entity'); needCell();
      return { t, entityId: v.entityId, x: v.x, y: v.y, x2: v.x2 as number | undefined, y2: v.y2 as number | undefined } as MmoAction;
    case 'sell': case 'pack': if (!uuid(v.entityId)) throw new Error(`${t} requires an entity`); return { t, entityId: v.entityId } as MmoAction;
    case 'unpack': case 'redeploy': if (!uuid(v.entityId)) throw new Error(`${t} requires an entity`); needCell(); return { t, entityId: v.entityId, x: v.x, y: v.y } as MmoAction;
    case 'barterOffer': return { t, offer: parseBarterOffer(v.offer) } as MmoAction;
    case 'barterAccept': case 'barterDecline': case 'barterCancel': if (!uuid(v.offerId)) throw new Error(`${t} requires an offer`); return { t, offerId: v.offerId } as MmoAction;
    case 'selectShield': if (!uuid(v.compoundId) || !isNonNegInt(v.seconds) || v.seconds > 7 * 24 * 3600) throw new Error('Invalid shield selection'); return { t, compoundId: v.compoundId, seconds: v.seconds } as MmoAction;
    case 'clearShield': case 'endRecovery': if (!uuid(v.compoundId)) throw new Error(`${t} requires a compound`); return { t, compoundId: v.compoundId } as MmoAction;
    case 'settle': if (!uuid(v.regionId) || !faction(v.faction)) throw new Error('Invalid settle'); needCell(); return { t, regionId: v.regionId, faction: v.faction, x: v.x, y: v.y } as MmoAction;
    case 'chat': if (v.channel !== 'region' && v.channel !== 'alliance') throw new Error('Invalid chat channel');
      if (!str(v.text, 500)) throw new Error('Invalid chat text');
      return { t, channel: v.channel as 'region' | 'alliance', text: v.text as string } as MmoAction;
    case 'ping': needCell(); return { t, x: v.x as number, y: v.y as number } as MmoAction;
    case 'objectiveClaim': if (!uuid(v.objectiveId)) throw new Error('objectiveClaim requires an objective'); return { t, objectiveId: v.objectiveId } as MmoAction;
    default: throw new Error('Unknown MMO action');
  }
}

export function parseMmoClientMessage(value: unknown): MmoClientMessage {
  const v = object(value);
  if (v.protocol !== MMO_PROTOCOL) throw new Error('Unsupported MMO protocol');
  if (!uuid(v.regionId)) throw new Error('Missing regionId');
  try { parseCounter(v.seenEpoch); parseCounter(v.lastSeenEventSeq); } catch { throw new Error('Invalid counters'); }
  if (v.type === 'subscribe') {
    return { protocol: MMO_PROTOCOL, type: 'subscribe', regionId: v.regionId as MmoId, seenEpoch: v.seenEpoch as Counter, lastSeenEventSeq: v.lastSeenEventSeq as Counter };
  }
  if (v.type === 'command') {
    if (!uuid(v.commandId)) throw new Error('Missing commandId');
    return {
      protocol: MMO_PROTOCOL, type: 'command', commandId: v.commandId as MmoId, regionId: v.regionId as MmoId,
      seenEpoch: v.seenEpoch as Counter, lastSeenEventSeq: v.lastSeenEventSeq as Counter,
      action: parseMmoAction(v.action),
    };
  }
  throw new Error('Invalid MMO client message');
}

// ---------------------------------------------------------------------------
// Journal event kinds (region_event.event_kind). The durable journal is the ordered
// input stream the sim replays; these names are the contract between coordinator,
// journal writer and snapshot recovery.
// ---------------------------------------------------------------------------

export const MMO_EVENT_KINDS = [
  'command',            // a validated player command applied at a tick boundary
  'scheduled',          // durable deadline (build done, shield expiry, arrival)
  'protection',         // protection transition committed by the authority
  'operation',          // committed SELL_REFUND/PACK/BARTER/... result
  'transfer',           // cross-region handoff stage
  'world',              // world-level fact (site capture, salvage, ladder, objective)
] as const;
export type MmoEventKind = (typeof MMO_EVENT_KINDS)[number];

// ---------------------------------------------------------------------------
// Protection record validator (stored form / snapshot payloads)
// ---------------------------------------------------------------------------

export function parseProtectionRecord(value: unknown): ProtectionRecord {
  const v = object(value);
  if (!['NEWCOMER', 'OFFLINE_EARNED', 'RECOVERY'].includes(String(v.kind))) throw new Error('Invalid protection kind');
  if (!['armed', 'active', 'ended'].includes(String(v.status))) throw new Error('Invalid protection status');
  if (!uuid(v.compoundId) || !uuid(v.ownerId)) throw new Error('Invalid protection owner');
  const gen = parseCounter(v.generation);
  if (!isNonNegInt(v.onlineMs) || (v.onlineSinceMs !== null && !isNonNegInt(v.onlineSinceMs))
    || (v.lapseAtMs !== null && !isNonNegInt(v.lapseAtMs))
    || !isNonNegInt(v.armedSeconds)
    || (v.startedAtMs !== null && !isNonNegInt(v.startedAtMs))
    || (v.endsAtMs !== null && !isNonNegInt(v.endsAtMs))
    || !isNonNegInt(v.milestonePower) || !isNonNegInt(v.milestoneBarracks)) {
    throw new Error('Invalid protection record');
  }
  return {
    kind: v.kind as ProtectionKind, status: v.status as ProtectionStatus,
    compoundId: v.compoundId as MmoId, ownerId: v.ownerId as MmoId, generation: gen,
    onlineMs: v.onlineMs as number, onlineSinceMs: v.onlineSinceMs as number | null,
    lapseAtMs: v.lapseAtMs as number | null, armedSeconds: v.armedSeconds as number,
    startedAtMs: v.startedAtMs as number | null, endsAtMs: v.endsAtMs as number | null,
    milestonePower: v.milestonePower as number, milestoneBarracks: v.milestoneBarracks as number,
  };
}

// ---------------------------------------------------------------------------
// Operation validator (journal payloads are checked before they are committed)
// ---------------------------------------------------------------------------

export function parseMmoOperation(value: unknown): MmoOperation {
  const v = object(value);
  const kind = String(v.kind);
  const uuidField = (k: string) => { if (!uuid(v[k])) throw new Error(`Operation ${kind} requires ${k}`); };
  const cellField = () => { if (!cell(v.x) || !cell(v.y)) throw new Error(`Operation ${kind} requires a cell`); };
  switch (kind) {
    case 'SELL_REFUND': uuidField('entityId'); uuidField('compoundId'); return { kind, entityId: v.entityId, compoundId: v.compoundId } as MmoOperation;
    case 'PACK': uuidField('entityId'); return { kind, entityId: v.entityId } as MmoOperation;
    case 'UNPACK': case 'DEPLOY': uuidField('entityId'); cellField(); return { kind, entityId: v.entityId, x: v.x, y: v.y } as MmoOperation;
    case 'BARTER': uuidField('offerId'); return { kind, offerId: v.offerId } as MmoOperation;
    case 'SELECT_PROTECTION': uuidField('compoundId'); if (!isNonNegInt(v.seconds)) throw new Error('Invalid protection seconds'); return { kind, compoundId: v.compoundId, seconds: v.seconds } as MmoOperation;
    case 'SHIELD_CONSUME': uuidField('compoundId'); if (!isNonNegInt(v.seconds) || !counterField(v.generation)) throw new Error('Invalid shield consume'); return { kind, compoundId: v.compoundId, seconds: v.seconds, generation: v.generation } as MmoOperation;
    case 'NEWCOMER_SPAWN': case 'RECOVERY_GRANT': uuidField('playerId'); uuidField('regionId'); if (!faction(v.faction)) cellField(); return { kind, playerId: v.playerId, regionId: v.regionId, faction: v.faction, x: v.x, y: v.y } as MmoOperation;
    case 'RECOVERY_TRANSITION': uuidField('compoundId'); if (typeof v.enter !== 'boolean') throw new Error('Invalid recovery transition'); return { kind, compoundId: v.compoundId, enter: v.enter } as MmoOperation;
    case 'SALVAGE_SPAWN': uuidField('regionId'); cellField(); if (!counterField(v.credits)) throw new Error('Invalid salvage credits'); return { kind, regionId: v.regionId, x: v.x, y: v.y, credits: v.credits } as MmoOperation;
    case 'SITE_CAPTURE': uuidField('siteId'); uuidField('regionId'); if (v.ownerId !== null) uuidField('ownerId'); return { kind, siteId: v.siteId, regionId: v.regionId, ownerId: v.ownerId } as MmoOperation;
    case 'LADDER_AWARD': uuidField('playerId'); if (!counterField(v.points) || !str(v.reason, 128)) throw new Error('Invalid ladder award'); return { kind, playerId: v.playerId, points: v.points, reason: v.reason } as MmoOperation;
    case 'DEFEAT': uuidField('compoundId'); return { kind, compoundId: v.compoundId } as MmoOperation;
    default: throw new Error('Unknown MMO operation');
  }
}
