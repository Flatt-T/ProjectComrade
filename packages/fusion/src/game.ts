import { Hasher, LEPTONS, Rng, cellCenter, dist, facingDelta, facingTo, toCell } from './core.js';
import { MapData, buildableTerrain, generateMap, inBounds, isWater, passable, resourceIndex, terrainPassable } from './map.js';
import { findPath, nearestCell } from './path.js';
import { Doctrine, FactionDef, InfiltrationEffect, MapPreset, MoveClass, QueueKind, RulePack, StructureDef, SuperweaponDef, TargetKind, UnitDef, WeaponDef, factionCanUse, prereqsMet, structurePrereqRoles, weaponCanTarget } from './rules.js';
import { runAI, AIState, AILevel, AI_LEVELS, createAIState } from './ai.js';
import { isHarvesterUnit, isMcvUnit, structureRoles } from './recovery.js';
import { starterPicks } from './starter.js';

export type Command =
  | { t: 'move'; ids: number[]; x: number; y: number }
  | { t: 'attackMove'; ids: number[]; x: number; y: number }
  | { t: 'attack'; ids: number[]; target: number; force?: boolean }
  | { t: 'fireAt'; ids: number[]; x: number; y: number }
  | { t: 'guard'; ids: number[] }
  | { t: 'scatter'; ids: number[] }
  /** `lock` ties the harvester to that field: it comes back to it after every delivery. */
  | { t: 'harvest'; ids: number[]; x: number; y: number; lock?: boolean }
  | { t: 'stop'; ids: number[] }
  | { t: 'deploy'; ids: number[] }
  /** Engineers capture or repair, spies infiltrate, damaged vehicles visit a repair pad, aircraft land to rearm. */
  | { t: 'enter'; ids: number[]; target: number }
  | { t: 'build'; item: string }
  | { t: 'cancel'; item: string }
  | { t: 'place'; item: string; x: number; y: number }
  | { t: 'sell'; id: number }
  | { t: 'repair'; id: number }
  /** Persistent profile only (PW14): pack an owned structure into its dedicated carrier. */
  | { t: 'pack'; id: number }
  /** Persistent profile only (PW14): redeploy a packed carrier at a footprint's top-left cell. */
  | { t: 'unpack'; id: number; x: number; y: number }
  | { t: 'rally'; x: number; y: number }
  | { t: 'super'; id: number; x: number; y: number; x2?: number; y2?: number }
  | { t: 'surrender' }
  /** Persistent profile only: a player joins a running region (slot = players.length). */
  | { t: 'join'; player: PlayerSetup }
  /** Persistent profile only: a player disconnects; their base keeps running. */
  | { t: 'leave'; slot: number }
  /** Persistent profile only: hand entities to another player slot, state preserved. */
  | { t: 'transfer'; ids: number[]; to: number }
  /** Persistent profile only: journaled alliance sync — allied players do not fight. */
  | { t: 'setAlly'; slot: number; ally: number }
  /** Persistent profile only: owner-enabled caretaker auto-repair (bounded). */
  | { t: 'setAutoRepair'; slot: number; on: boolean }
  /** Persistent profile only: journaled shield boundary on/off for a compound (PW10). */
  | { t: 'setShield'; compound: number; on: boolean }
  /** Persistent profile only: newcomer setup protection on/off for a player slot (PW11). */
  | { t: 'setNewcomerProtection'; slot: number; on: boolean }
  /** Persistent profile only: recovery protection on/off for a player slot (PW12). */
  | { t: 'setRecovery'; slot: number; on: boolean }
  /** Persistent profile only: spawn the bound recovery MCV for a player slot (PW12). */
  | { t: 'grantRecovery'; slot: number; cell: number }
  /** Journaled credit movement between players (PW13 barter settlement). The
   *  durable layer validates balances; the engine clamps at zero defensively. */
  | { t: 'adjustCredits'; slot: number; delta: number };

export interface PlayerSetup {
  name: string; faction: string; ai: boolean; team?: number; level?: AILevel; ally?: number; autoRepair?: boolean;
  /** Durable account player id (persistent regions only) — makes joins idempotent. */
  playerId?: string;
  /** Explicit spawn cell index; overrides the spawnCell hook and start positions. */
  cell?: number;
  /** Versioned newcomer starter grant: credits plus the expanded unit list (PW11).
   *  Every unit spawns bound — it cannot be sold or traded for value. */
  starter?: { credits: number; units: string[] };
  /** Spawn already inside the one-hour newcomer protection window (PW11). */
  newcomerProtected?: boolean;
}

/**
 * Persistent-region extension points (PW21). Classic matches leave this empty; the
 * persistent profile fills the hooks that later PW issues implement (salvage,
 * capturable sites, region-edge transfer, protection). Hooks run inside the
 * deterministic step, so they must be pure functions of game state.
 */
export interface RegionHooks {
  /** Where a joining player appears; default cycles the map's start positions. */
  spawnCell?(game: Game, player: Player): number;
  /** Bonus-crate contents hook (salvage crates land with PW22/PW23). */
  crateKind?(game: Game): CrateKind;
  /** Capturable-site ownership change hook (PW22/PW23). */
  siteCapture?(game: Game, siteId: string, owner: number): void;
  /** Entity leaving the region edge (cross-region transfer, PW13+). */
  regionEdge?(game: Game, entityId: number, edge: 'north' | 'south' | 'east' | 'west'): void;
}
export type CreditsPreset = 'low' | 'standard' | 'high';
export interface GameSetup {
  pack: RulePack;
  mapId: string;
  seed: number;
  players: PlayerSetup[];
  credits?: CreditsPreset;
  /** 1..15, matching the lobby setting; 15 unlocks everything. */
  techLevel?: number;
  /** Which roster a pack that describes both doctrines fields (default 'irregular'). */
  doctrine?: Doctrine;
  /** Sandworm activity, percent of the pack's base rate (0 = none, default 100). */
  worms?: number;
  /** Resource renewal, 0 (never) to 50; 25 is the rule pack's own rate. */
  renewal?: number;
  /** Superweapon recharge speed in percent: 100 classic, 200 twice as fast. */
  superCharge?: number;
  /** Bonus-crate frequency, 0 (none) to 200; 100 drops about one a minute. */
  crates?: number;
  /**
   * PW24 salvage in classic skirmish matches (optional setting): destroyed
   * units/buildings drop credit crates worth a share of build cost. Persistent
   * regions get the same mechanic through `mmo.salvage`, which adds the
   * anti-snowball power-score floor.
   */
  salvage?: { percentOfCost: number; decaySeconds: number };
  /**
   * Persistent-world profile (PW21): players may join and leave a running region,
   * entities change hands by command, and there is no match-over condition — the
   * region authority decides elimination, protection and recovery instead.
   */
  persistent?: boolean;
  /**
   * Persistent pacing tuning (PW23), mapped from the region's MmoRulesProfile by
   * the service. Absent means classic pacing — classic matches are unaffected.
   * All values are tunable profile data, never literals in code paths.
   */
  mmo?: MmoTuning;
}

/** Engine-facing subset of the persistent rules profile (PW23). */
export interface MmoTuning {
  /** Structure max-HP multiplier vs unit damage (persistent bases level slower). */
  structureHpMultiplier: number;
  /** Live-unit supply cap per player; 0 disables the cap. */
  supplyCap: number;
  /** Credits of upkeep per supply point per in-game minute. */
  upkeepPerPointPerMinute: number;
  /** Maximum standing construction yards (compounds) per player; 0 disables. */
  maxCompounds: number;
  /** Compound shield boundary radius in cells (PW10); 0 disables shield enforcement. */
  shieldRadiusCells?: number;
  /** Recovery: banked credits stop accruing above this cap (PW12); 0 disables. */
  recoveryCreditCap?: number;
  /** Recovery: structure roles that may be rebuilt while recovering (PW12). */
  recoveryBuildRoles?: string[];
  /**
   * PW24 salvage (COMRADE 18 §3.9): share of build cost dropped as a crate,
   * decay time, and the anti-snowball floor — a victim whose in-sim power
   * score is below `mismatchFloorRatio` of the attacker's yields no crate.
   * `scoreWeights` mirrors the profile's powerScoreWeights so the in-sim
   * score matches the durable world_member score.
   */
  salvage?: {
    percentOfCost: number;
    decaySeconds: number;
    mismatchFloorRatio: number;
    scoreWeights: { structure: number; unit: number; tech: number };
  };
}

/** Supply upkeep cadence: one in-game minute at the 15 Hz tick rate. */
export const SUPPLY_UPKEEP_TICKS = 900;
/** Caretaker auto-repair cadence and rate: 1% of max structure HP per in-game minute. */
export const AUTO_REPAIR_TICKS = 900;
export const AUTO_REPAIR_PERCENT = 1;
/** Queue kinds that produce units (subject to the PW23 supply cap). */
const UNIT_QUEUES = new Set<QueueKind>(['infantry', 'vehicle', 'aircraft', 'naval', 'starport']);

export type OrderKind = 'idle' | 'move' | 'attackMove' | 'attack' | 'attackGround' | 'harvest' | 'deploy' | 'enter' | 'rearm' | 'ferry';
export type HarvestState = 'seek' | 'gather' | 'toRefinery' | 'unload' | 'warp';
/** Ticks a Chrono Miner spends charging before it jumps to the refinery. */
export const WARP_TICKS = 18;

export interface Entity {
  id: number;
  type: string;
  kind: 'unit' | 'structure';
  owner: number;
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  facing: number;
  turret: number;
  order: OrderKind;
  path: number[];
  goal: number;
  /** Where an attack-move resumes after a fight. */
  resume: number;
  target: number;
  cooldown: number;
  repathTick: number;
  // Harvesters
  hstate: HarvestState;
  cargo: number;
  cargoValue: number;
  harvestCell: number;
  /** Field this harvester was ordered to work (cell index), or -1 to take the nearest. */
  homeField: number;
  timer: number;
  dock: number;
  // Structures
  cx: number;
  cy: number;
  w: number;
  h: number;
  repairing: boolean;
  /** Harvester currently using this refinery. */
  dockedBy: number;
  // Deviator conversion
  originalOwner: number;
  convertedUntil: number;
  /** Tick the entity was created (placement/spawn animation). */
  born: number;
  /** Dune: built off concrete, so the sand slowly wears it back down to half health. */
  exposed: boolean;
  /** Superweapon charge in ticks. */
  charge: number;
  /** Ctrl+click force-fire: keep attacking even a friendly or neutral target. */
  force: boolean;
  /** Cell targeted by a force-fire on open ground. */
  fireCell: number;
  /** Veterancy: experience (value of kills) and rank (0 rookie, 1 veteran, 2 elite). */
  xp: number;
  rank: number;
  /** Aircraft ammunition left. */
  ammo: number;
  /** Deployed in place (GI sandbags, Desolator, Thumper). */
  deployed: boolean;
  /** Mirage Tank: hidden from enemies after standing still. */
  disguised: boolean;
  stillTicks: number;
  /** Carryall cargo, or the carrier/vehicle this unit is riding in (terror drones ride their victims). */
  carrying: number;
  carriedBy: number;
  /** Yuri: the unit under permanent mind control. */
  controls: number;
  /** A planted charge: detonation tick and the player who planted it. */
  c4At: number;
  c4By: number;
  /** Iron Curtain / planetary shield: invulnerable until this tick. */
  invulnUntil: number;
  /** Tractor beam: cannot move or act until this tick. */
  heldUntil: number;
  /** Terror drone inside this vehicle. */
  drone: number;
  /** Tick a Chrono Miner last arrived by teleport (for the fade-in). */
  warp: number;
  /** Units riding inside this transport. */
  passengers: number[];
  /**
   * Persistent-world binding (PW26): 0 = freely tradable/sellable, nonzero = bound to
   * the owning account and ineligible for barter or credit sale. 1 = starter grant,
   * 2 = recovery grant. Always 0 in classic matches.
   */
  bound: number;
  /** Persistent profile (PW10): compound shield boundary active on this construction yard. */
  shielded: boolean;
  /** Persistent profile (PW10): last tick PvP damage was exchanged inside this compound's radius. */
  battleAt: number;
  /**
   * Persistent profile (PW12): recovery protection on this entity — the bound
   * recovery MCV and the permitted rebuild structures. Protected entities can
   * neither deal nor receive damage, like newcomer protection but entity-scoped
   * so surviving unprotected units keep fighting.
   */
  recoveryProtected: boolean;
  /**
   * Persistent profile (PW14): while this entity is a packed-building carrier it
   * is a unit whose type is `pack_<structure>` and this field names the structure
   * type it redeploys into. The entity id — and therefore the durable asset id —
   * is unchanged across pack/deploy, so one asset survives every form. '' = not
   * packed. Snapshots predating PW14 lack the field; restoreGame normalizes it.
   */
  packedType: string;
  /**
   * Persistent profile (PW17): the faction this asset was CREATED under —
   * stamped at spawn from the creator's faction and never rewritten by
   * transfers, packing or redeploys. An imported production building keeps its
   * donor faction here, which is what makes it produce that faction's units.
   * '' on entities predating PW17; restoreGame falls back to the owner's.
   */
  faction: string;
  /**
   * PW24: player slot of the unit that dealt the killing damage, stamped when
   * hp reaches 0 so removeEntity can apply the salvage mismatch rule. -1 for
   * environmental/ownerless kills; transient — never serialized.
   */
  deadBy?: number;
}

export interface ProductionQueue { items: string[]; paid: number; acc: number; ready: boolean; hold: boolean }

export interface Player {
  slot: number;
  name: string;
  faction: string;
  side: string;
  color: string;
  accent: string;
  ai: boolean;
  team: number;
  credits: number;
  storage: number;
  powerGen: number;
  powerUse: number;
  defeated: boolean;
  queues: Record<QueueKind, ProductionQueue>;
  explored: Uint8Array;
  visible: Uint8Array;
  rally: number;
  stats: { built: number; lost: number; killed: number; harvested: number };
  /** Upgrade level bought for each structure type (Dune factories and yard). */
  upgrades: Record<string, number>;
  /** A spy in a power plant shuts the grid down until this tick. */
  blackoutUntil: number;
  /** A spy in a factory makes everything it builds start as a veteran. */
  veteranQueues: QueueKind[];
  /** Cached from owned support buildings whenever the base changes. */
  incomeBonus: number;
  costReduction: number;
  /** Persistent profile: false after a `leave` command; the base keeps simulating. */
  connected: boolean;
  /** Persistent profile: alliance key (-1 = none). Allied players are not enemies. */
  ally: number;
  /** Persistent profile: caretaker auto-repair of own damaged structures. */
  autoRepair: boolean;
  /** Persistent profile (PW11): durable account player id, when the join supplied one. */
  pid?: string;
  /**
   * Persistent profile (PW11): newcomer setup protection is active — this
   * player's entities can neither deal nor receive damage, and they cannot
   * launch superweapons. Set at spawn and mirrored by journaled commands.
   */
  newcomerProtected: boolean;
  /**
   * Persistent profile (PW12): the player is inside a recovery episode —
   * rebuilding is restricted to the profile's recovery roles, one harvester,
   * and banked credits stop accruing above the cap. Mirrored by journaled
   * setRecovery commands from the durable protection record.
   */
  recovering: boolean;
  /** Persistent profile (PW12): a recovering player's forces dealt damage to
   *  another player — the durable evaluator ends recovery on this flag. */
  recoveryAttacked: boolean;
}

export interface Projectile { id: number; owner: number; weapon: string; x: number; y: number; sx: number; sy: number; tx: number; ty: number; target: number; source: number }
/** Visual-only event for the renderer. `item`/`owner` let it draw the right sprite. */
export interface Effect { kind: string; x: number; y: number; x2: number; y2: number; tick: number; dur: number; color?: string; item?: string; owner?: number }
/** A scheduled superweapon impact, resolved deterministically on its tick. */
export interface Strike {
  tick: number; x: number; y: number; owner: number; damage: number; radius: number;
  kind: 'missile' | 'ion' | 'laser' | 'bolt' | 'drop' | 'chrono' | 'curtain' | 'shield' | 'tractor' | 'reveal';
  name: string;
  /** Chronosphere destination. */
  x2?: number; y2?: number;
  /** Paradrops and reinforcements. */
  units?: string[];
  /** Iron Curtain length. */
  duration?: number;
}
export interface Worm { id: number; x: number; y: number; px: number; py: number; target: number; hidden: number; hp: number; facing: number; wander: number; /** Prowl destination (cell index), or -1. */ goal: number; /** Ticks spent on the surface this stint. */ up: number; /** Visual / biome form (worm, tusken, ewok, opee). */ form: string }

/** A bonus crate waiting on the map. */
export type CrateKind = 'money' | 'heal' | 'veteran' | 'reveal' | 'unit' | 'salvage';
export interface Crate {
  id: number; cell: number; kind: CrateKind;
  /** PW24: credit value for 'salvage' crates; absent on classic bonus crates. */
  value?: number;
  /** PW24: tick at which a salvage crate decays; absent means it never decays. */
  expiresTick?: number;
}

/** One salvage crate spawn or collection, drained by the region runner for audit. */
export interface SalvageEvent {
  tick: number;
  cell: number;
  credits: number;
  kind: 'spawn' | 'collect';
  /** Sim entity id of the destroyed asset (spawn events only). */
  simId: number;
  victimOwner: number;
  collectorOwner: number;
  killerOwner: number;
  victimType: string;
  victimKind: string;
}
/** The renewal setting at which fields grow back at the pack's own rate (mirrors the lobby's). */
export const RENEWAL_CLASSIC = 25;
/** How often crates drop at 100%, and what each kind is worth. */
const CRATE_EVERY = 900, CRATE_KINDS: CrateKind[] = ['money', 'money', 'heal', 'veteran', 'reveal', 'unit'];

const QUEUES: QueueKind[] = ['structure', 'defense', 'infantry', 'vehicle', 'aircraft', 'naval', 'starport'];
const UPGRADE = 'upgrade:', STARPORT = 'starport:';
/** Arm's length from a building's edge: any cell touching it, diagonals included. */
const REACH = 288;

/**
 * PW14: every packable structure gets a dedicated packed-building carrier unit.
 * The carrier is a real UnitDef (`pack_<structure>`) so every entity-type lookup —
 * AI, renderer, audio, combat — resolves it without special-casing. tech 99 keeps
 * it out of every build menu (techCap tops out at 10); carriers only ever come
 * from the pack transition. Walls, floors and water-only structures have no
 * carrier: a packed wall is meaningless and a land carrier cannot redeploy a
 * shipyard. Returns a NEW pack — classic matches and mashup composition never
 * see carriers; only persistent games get the augmented copy.
 */
export function withPackedCarriers(pack: RulePack): RulePack {
  const units = { ...pack.units };
  for (const s of Object.values(pack.structures)) {
    if (s.wall || s.floor || s.onWater) continue;
    const id = `pack_${s.id}`;
    if (units[id]) continue;
    units[id] = {
      // PW24: a destroyed carrier salvages the packed building's build cost.
      id, name: `Packed ${s.name}`, kind: 'vehicle', cost: s.cost, hp: s.hp,
      armor: 'heavy', speed: 18, turn: 6, sight: Math.max(3, s.sight),
      prereqs: [], tech: 99, shape: s.shape, role: 'support', packedCarrier: s.id,
    };
  }
  return { ...pack, units };
}

export class Game {
  readonly pack: RulePack;
  readonly map: MapData;
  readonly rng: Rng;
  readonly players: Player[] = [];
  readonly entities = new Map<number, Entity>();
  readonly projectiles: Projectile[] = [];
  /** Visual-only events for the renderer; never read by the simulation. */
  effects: Effect[] = [];
  worms: Worm[] = [];
  strikes: Strike[] = [];
  tick = 0;
  /** Spy Plane sweeps: temporary sight for a player over an area. */
  reveals: { owner: number; x: number; y: number; r: number; until: number }[] = [];
  /** Dune Starport: CHOAM price level in percent. */
  market = 100;
  over = false;
  winnerTeam = -1;
  private nextId = 1;
  private pending = new Map<number, { slot: number; cmd: Command }[]>();
  private powerDirty = true;
  /** Highest tech level buildable in this match (the lobby setting mapped to 1..10). */
  readonly techCap: number;
  readonly doctrine: Doctrine;
  /** Sandworm activity percent (0 = none): how many worms roam, and how long they stay under. */
  readonly wormRate: number;
  /** Resource renewal setting; RENEWAL_CLASSIC (25) is the pack's own rate, 0 turns it off. */
  readonly renewal: number;
  /** Superweapon recharge percent: 100 classic, 200 twice as fast. */
  readonly superCharge: number;
  /** Bonus-crate frequency percent; 0 means no crates. */
  readonly crateRate: number;
  crates: Crate[] = [];
  /** PW24: skirmish salvage setting (classic matches); persistent uses mmo.salvage. */
  private classicSalvage?: { percentOfCost: number; decaySeconds: number };
  /** PW24 audit feed: salvage spawns/collects; the region runner drains it. */
  readonly salvageEvents: SalvageEvent[] = [];

  /** Effective salvage config: persistent regions read mmo.salvage (patchable post-restore). */
  private salvageConfig() {
    if (this.persistent) return this.mmo?.salvage;
    const c = this.classicSalvage;
    return c ? { ...c, mismatchFloorRatio: 0, scoreWeights: undefined } : undefined;
  }
  private ai: (AIState | null)[] = [];
  readonly mapPreset: MapPreset;
  /** True under the persistent profile: join/leave/transfer commands and no match-over. */
  readonly persistent: boolean;
  /** Persistent pacing tuning (PW23); undefined in classic matches. */
  readonly mmo?: MmoTuning;
  /** Region extension points; classic matches leave this empty. */
  hooks: RegionHooks = {};
  /** Starting credits for late joiners (the setup preset, resolved once). */
  private startMoney = 0;

  constructor(setup: GameSetup) {
    // PW14: persistent games resolve carriers; classic matches keep the raw pack.
    this.pack = setup.persistent === true ? withPackedCarriers(setup.pack) : setup.pack;
    const preset = setup.pack.maps.find(m => m.id === setup.mapId) ?? setup.pack.maps[0];
    this.mapPreset = preset;
    this.map = generateMap(setup.pack, preset, setup.seed);
    this.rng = new Rng(setup.seed);
    this.techCap = Math.ceil(((setup.techLevel ?? 15) * 10) / 15);
    this.doctrine = setup.doctrine ?? 'irregular';
    this.wormRate = Math.max(0, Math.min(200, Math.trunc(setup.worms ?? 100)));
    this.renewal = Math.max(0, Math.min(50, Math.trunc(setup.renewal ?? RENEWAL_CLASSIC)));
    this.superCharge = Math.max(100, Math.min(200, Math.trunc(setup.superCharge ?? 100)));
    this.crateRate = Math.max(0, Math.min(200, Math.trunc(setup.crates ?? 0)));
    this.persistent = setup.persistent === true;
    // Tuning is a persistent-mode contract; classic matches ignore it entirely.
    this.mmo = this.persistent ? setup.mmo : undefined;
    this.classicSalvage = setup.salvage ? { ...setup.salvage } : undefined;
    const credits = setup.pack.startCredits[setup.credits ?? 'standard'];
    this.startMoney = credits;
    const size = this.map.w * this.map.h;
    setup.players.slice(0, preset.starts.length).forEach(p => this.addPlayer(p, credits, size));
    this.updateFog();
  }

  /**
   * Create a player slot and deploy their starting base. Used by the constructor for
   * the initial roster and by the persistent `join` command — identical on every
   * client because the journal fixes when it runs.
   */
  private addPlayer(p: PlayerSetup, credits = this.startMoney, size = this.map.w * this.map.h): Player {
    const slot = this.players.length;
    const faction = this.pack.factions.find(f => f.id === p.faction) ?? this.pack.factions[slot % this.pack.factions.length];
    const queue = (): ProductionQueue => ({ items: [], paid: 0, acc: 0, ready: false, hold: false });
    const startCredits = p.starter?.credits ?? credits;
    const mapSize = size;
    const player: Player = {
      slot, name: p.name, faction: faction.id, side: faction.side, color: faction.color, accent: faction.accent,
      ai: p.ai, team: p.team ?? slot, credits: startCredits, storage: 0, powerGen: 0, powerUse: 0, defeated: false,
      queues: { structure: queue(), defense: queue(), infantry: queue(), vehicle: queue(), aircraft: queue(), naval: queue(), starport: queue() },
      explored: new Uint8Array(mapSize), visible: new Uint8Array(mapSize), rally: -1,
      stats: { built: 0, lost: 0, killed: 0, harvested: 0 },
      upgrades: {}, blackoutUntil: 0, veteranQueues: [], incomeBonus: 0, costReduction: 0,
      connected: true,
      ally: p.ally ?? -1, autoRepair: p.autoRepair === true,
      newcomerProtected: p.newcomerProtected === true,
      recovering: false, recoveryAttacked: false,
    };
    if (p.playerId) player.pid = p.playerId;
    this.players.push(player);
    this.ai.push(p.ai ? createAIState(slot, p.level) : null);
    // The MCV sits on the spawn cell; the escort forms up outside its deploy footprint.
    // A journaled cell wins over the hook so every replica places identically.
    const cell = (p.cell !== undefined && p.cell >= 0 && p.cell < this.map.w * this.map.h)
      ? p.cell
      : this.hooks.spawnCell?.(this, player) ?? this.defaultSpawnCell(slot);
    const cx = cell % this.map.w, cy = Math.floor(cell / this.map.w);
    const startCell = cy * this.map.w + cx;
    const starting = p.starter?.units ?? this.startUnitsFor(faction);
    const bound = p.starter ? 1 : 0;
    const mcvType = starting.find(t => this.pack.units[t]?.deploysTo);
    const yard = mcvType ? this.pack.structures[this.pack.units[mcvType].deploysTo!] : undefined;
    const fx = cx - ((yard?.w ?? 1) >> 1), fy = cy - ((yard?.h ?? 1) >> 1);
    const inFootprint = (i: number) => {
      const x = i % this.map.w, y = Math.floor(i / this.map.w);
      return !!yard && x >= fx - 1 && x <= fx + yard.w && y >= fy - 1 && y <= fy + yard.h;
    };
    const spawnBound = (type: string, at: number) => {
      const e = this.spawnUnit(type, slot, at);
      e.bound = bound;
      return e;
    };
    if (mcvType) spawnBound(mcvType, startCell);
    starting.filter(t => t !== mcvType).forEach(type => {
      const origin = (Math.min(this.map.h - 1, fy + (yard?.h ?? 1) + 1)) * this.map.w + cx;
      const spot = nearestCell(this.map, origin, 8,
        i => passable(this.pack, this.map, i, this.moveClass(this.pack.units[type])) && !this.unitInCell(i) && !inFootprint(i));
      if (spot >= 0) spawnBound(type, spot);
    });
    return player;
  }

  /** Start cell for a slot: the map's own starts while they last, then a scan. */
  private defaultSpawnCell(slot: number): number {
    const starts = this.mapPreset.starts;
    if (slot < starts.length) return starts[slot].y * this.map.w + starts[slot].x;
    // Deterministic fallback for late joiners: first open vehicle cell scanning
    // outward from the map centre, clear of units and structures.
    const { w, h } = this.map;
    const cx = w >> 1, cy = h >> 1;
    for (let r = 0; r < Math.max(w, h); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (this.map.occupied[i] === 0 && passable(this.pack, this.map, i, 'vehicle') && !this.unitInCell(i)) return i;
      }
    }
    return cy * w + cx;
  }

  // ---------------------------------------------------------------- commands

  /** Queue a command for a future tick (default: the next one). */
  enqueue(slot: number, cmd: Command, atTick = this.tick + 1) {
    const list = this.pending.get(atTick) ?? [];
    list.push({ slot, cmd });
    this.pending.set(atTick, list);
  }

  private apply(slot: number, cmd: Command) {
    // Persistent-profile roster and ownership commands. They are journaled inputs
    // like any other command; classic matches reject them here and in parseCommand.
    // Enqueue them with slot -1 so they sort ahead of that tick's unit commands.
    if (cmd.t === 'join') {
      if (!this.persistent) return;
      // Idempotent on the durable player id: a retried or duplicated join
      // intent must never spawn a second base (PW11).
      if (cmd.player.playerId && this.players.some(pl => pl.pid === cmd.player.playerId)) return;
      this.addPlayer(cmd.player);
      return;
    }
    if (cmd.t === 'setNewcomerProtection') {
      if (this.persistent) { const p = this.players[cmd.slot]; if (p) p.newcomerProtected = cmd.on; }
      return;
    }
    if (cmd.t === 'setRecovery') {
      // PW12: recovery replaces defeat — entering recovery revives the player
      // (their base is gone; the protected MCV is the restart). Leaving clears
      // the entity-scoped protection flags so vulnerability returns at once.
      if (this.persistent) {
        const p = this.players[cmd.slot];
        if (p) {
          p.recovering = cmd.on;
          p.recoveryAttacked = false;
          if (cmd.on) p.defeated = false;
          else for (const e of this.entities.values()) {
            if (e.owner === cmd.slot) e.recoveryProtected = false;
          }
        }
      }
      return;
    }
    if (cmd.t === 'grantRecovery') {
      // PW12: the bound recovery MCV. Idempotent on the live roster — the
      // durable episode guarantees one grant, and this guard makes a replayed
      // command harmless even if the episode row were ever duplicated.
      if (this.persistent) {
        const p = this.players[cmd.slot];
        let hasMcv = false;
        if (p) for (const e of this.entities.values()) {
          if (e.owner === cmd.slot && e.hp > 0 && e.kind === 'unit' && isMcvUnit(this.unitDef(e))) { hasMcv = true; break; }
        }
        if (p && !hasMcv) {
          const faction = this.pack.factions.find(f => f.id === p.faction) ?? this.pack.factions[p.slot % this.pack.factions.length];
          // starterPicks throws on packs that cannot fill every role — a grant
          // must never crash the deterministic step, so degrade to no spawn.
          let mcvType = '';
          try { mcvType = starterPicks(this.pack, faction).mcv; } catch { mcvType = ''; }
          if (mcvType) {
            const cell = cmd.cell >= 0 && cmd.cell < this.map.w * this.map.h ? cmd.cell : this.defaultSpawnCell(cmd.slot);
            const spot = nearestCell(this.map, cell, 10,
              i => passable(this.pack, this.map, i, this.moveClass(this.pack.units[mcvType])) && !this.unitInCell(i));
            const e = this.spawnUnit(mcvType, cmd.slot, spot >= 0 ? spot : cell);
            e.bound = 2;
            e.recoveryProtected = true;
          }
        }
      }
      return;
    }
    if (cmd.t === 'leave') { const p = this.players[cmd.slot]; if (this.persistent && p) p.connected = false; return; }
    if (cmd.t === 'adjustCredits') {
      if (this.persistent) { const p = this.players[cmd.slot]; if (p) p.credits = Math.max(0, p.credits + cmd.delta); }
      return;
    }
    if (cmd.t === 'transfer') { if (this.persistent) this.transferOwner(cmd.ids, cmd.to, slot); return; }
    if (cmd.t === 'setAlly') { if (this.persistent) { const p = this.players[cmd.slot]; if (p) p.ally = cmd.ally; } return; }
    if (cmd.t === 'setAutoRepair') { if (this.persistent) { const p = this.players[cmd.slot]; if (p) p.autoRepair = cmd.on; } return; }
    if (cmd.t === 'setShield') {
      if (this.persistent && this.mmo?.shieldRadiusCells) {
        const c = this.entities.get(cmd.compound);
        if (c && c.kind === 'structure') c.shielded = cmd.on;
      }
      return;
    }
    const player = this.players[slot];
    if (!player || player.defeated || !player.connected) return;
    const own = (ids: number[]) => ids.map(id => this.entities.get(id)).filter((e): e is Entity => !!e && e.owner === slot && e.kind === 'unit' && e.hp > 0 && !e.carriedBy);
    switch (cmd.t) {
      case 'move': case 'attackMove': {
        const units = own(cmd.ids);
        const goals = this.spreadGoals(units, this.cellIndex(cmd.x, cmd.y));
        units.forEach((u, n) => {
          u.deployed = false;
          if (u.carrying) this.drop(u);
          u.order = cmd.t; u.target = 0; u.force = false; u.goal = goals[n]; u.resume = goals[n]; u.path = this.pathFor(u, goals[n]);
          if (u.hstate) u.hstate = 'seek';
        });
        break;
      }
      case 'attack': {
        const target = this.entities.get(cmd.target);
        if (!target || target.hp <= 0) break;
        const kind = this.targetKind(target);
        for (const u of own(cmd.ids)) {
          if (this.canEngage(u, target, kind) && (cmd.force || this.isEnemy(slot, target.owner) || target.owner < 0)) {
            u.order = 'attack'; u.target = target.id; u.force = !!cmd.force; u.path = []; u.repathTick = 0;
            u.resume = this.unitDef(u).sortie ? this.cellOf(target) : -1;
          }
        }
        break;
      }
      case 'fireAt': {
        const cell = this.cellIndex(cmd.x, cmd.y);
        for (const u of own(cmd.ids)) if (this.weaponOf(u)) { u.order = 'attackGround'; u.fireCell = cell; u.target = 0; u.path = []; u.repathTick = 0; u.resume = -1; }
        break;
      }
      case 'guard':
        // Hold this spot: engage whatever comes in range, then return to it.
        for (const u of own(cmd.ids)) { u.order = 'idle'; u.target = 0; u.force = false; u.path = []; u.goal = u.resume = this.cellOf(u); }
        break;
      case 'scatter':
        for (const u of own(cmd.ids)) {
          const kind = this.moveClass(this.unitDef(u));
          const here = this.cellOf(u);
          const cell = nearestCell(this.map, this.cellIndex((here % this.map.w) + this.rng.int(5) - 2, Math.floor(here / this.map.w) + this.rng.int(5) - 2), 3,
            i => i !== here && passable(this.pack, this.map, i, kind));
          if (cell >= 0) { u.order = 'move'; u.target = 0; u.force = false; u.goal = cell; u.path = this.pathFor(u, cell); }
        }
        break;
      case 'harvest': {
        const cell = this.cellIndex(cmd.x, cmd.y);
        for (const u of own(cmd.ids)) {
          if (!this.unitDef(u).harvester) continue;
          u.order = 'harvest'; u.hstate = u.cargo > 0 && cmd.lock ? u.hstate : 'seek'; u.harvestCell = cell; u.path = [];
          // A locked order means this field and no other, until the player says otherwise.
          u.homeField = cmd.lock ? cell : -1;
        }
        break;
      }
      case 'stop':
        for (const u of own(cmd.ids)) { u.order = 'idle'; u.target = 0; u.force = false; u.path = []; }
        break;
      case 'deploy':
        for (const u of own(cmd.ids)) this.deploy(u);
        break;
      case 'enter': {
        const target = this.entities.get(cmd.target);
        if (!target || target.hp <= 0) break;
        if (target.kind === 'unit') {
          // Board a friendly transport.
          for (const u of own(cmd.ids)) if (u.id !== target.id && this.canBoard(u, target)) { u.deployed = false; u.order = 'enter'; u.target = target.id; u.path = []; u.repathTick = 0; }
          break;
        }
        for (const u of own(cmd.ids)) {
          const def = this.unitDef(u);
          const sdef = this.structDef(target);
          const enemy = this.isEnemy(slot, target.owner);
          const ok = def.engineer ? enemy || target.owner === slot && target.hp < target.maxHp
            : def.spy ? enemy
            : target.owner === slot && (sdef.repairPad && def.kind !== 'infantry' && def.kind !== 'aircraft'
              || sdef.airfield && def.kind === 'aircraft' || !!sdef.refinery && !!def.harvester);
          if (!ok) continue;
          u.deployed = false;
          if (sdef.refinery && def.harvester) {
            // This is my refinery now: unload here, and come back here from now on.
            u.dock = target.id; u.order = 'harvest'; u.path = [];
            u.hstate = u.cargo > 0 ? 'toRefinery' : u.hstate === 'unload' ? u.hstate : 'seek';
            continue;
          }
          if (sdef.airfield && def.kind === 'aircraft') { u.order = 'rearm'; u.dock = target.id; u.path = [this.cellOf(target)]; continue; }
          u.order = 'enter'; u.target = target.id; u.path = []; u.repathTick = 0;
        }
        break;
      }
      case 'build': this.startBuild(player, cmd.item); break;
      case 'cancel': this.cancelBuild(player, cmd.item); break;
      case 'place': this.place(player, cmd.item, cmd.x, cmd.y); break;
      case 'sell': {
        const s = this.entities.get(cmd.id);
        // PW11/PW26: bound assets (starter grant, recovery MCV) cannot be sold
        // for value — they leave play only through the sanctioned transitions.
        if (s && s.owner === slot && s.kind === 'structure' && s.hp > 0 && !s.bound) {
          const def = this.pack.structures[s.type];
          player.credits += Math.floor((def.cost * this.pack.sellRefundPercent * s.hp) / (100 * s.maxHp));
          const fx = this.effect('sell', s.x, s.y, s.cx, s.cy, 24); fx.item = s.type; fx.owner = s.owner;
          s.hp = 0;
          this.removeEntity(s, false);
        }
        break;
      }
      case 'pack': {
        if (this.persistent) {
          const e = this.entities.get(cmd.id);
          if (e && e.owner === slot && e.kind === 'structure' && e.hp > 0 && !e.bound && this.packableStructure(e)) this.packStructure(e);
        }
        break;
      }
      case 'unpack': {
        if (this.persistent) {
          const e = this.entities.get(cmd.id);
          if (e && e.owner === slot && e.kind === 'unit' && e.packedType && e.hp > 0) this.unpackStructure(e, cmd.x, cmd.y);
        }
        break;
      }
      case 'repair': {
        const s = this.entities.get(cmd.id);
        if (s && s.owner === slot && s.kind === 'structure') s.repairing = !s.repairing;
        break;
      }
      case 'rally': player.rally = this.cellIndex(cmd.x, cmd.y); break;
      case 'super': this.launchSuper(player, cmd.id, cmd.x, cmd.y, cmd.x2, cmd.y2); break;
      case 'surrender': this.defeat(player); break;
    }
  }

  /**
   * Hand the issuer's live entities to another player slot. Position, health, orders
   * and cargo are untouched — only ownership changes. Dead or carried entities and
   * entities the issuer does not own are skipped.
   */
  private transferOwner(ids: number[], to: number, from: number) {
    const target = this.players[to];
    if (!target || to === from) return;
    for (const id of ids) {
      const e = this.entities.get(id);
      // PW26: bound assets (starter grant, recovery MCV) cannot change hands —
      // a transfer would launder the binding onto a different account.
      if (!e || e.hp <= 0 || e.carriedBy || e.owner !== from || e.bound !== 0) continue;
      e.owner = to;
    }
  }

  // ---------------------------------------------------------------- main loop

  step() {
    if (this.over) return;
    this.tick++;
    const commands = this.pending.get(this.tick);
    if (commands) {
      this.pending.delete(this.tick);
      // Stable order: slot, then submission order.
      commands.map((c, n) => ({ ...c, n })).sort((a, b) => a.slot - b.slot || a.n - b.n).forEach(c => this.apply(c.slot, c.cmd));
    }
    for (const p of this.players) {
      const ai = this.ai[p.slot];
      if (ai && p.connected && !p.defeated && (this.tick + p.slot * 5) % AI_LEVELS[ai.level].thinkEvery === 0) runAI(this, p, ai);
    }
    for (const p of this.players) if (p.blackoutUntil && this.tick >= p.blackoutUntil) { p.blackoutUntil = 0; this.powerDirty = true; }
    const market = this.pack.mechanics.market;
    if (market && this.tick % market.every === 0) this.market = market.min + this.rng.int(market.max - market.min + 1);
    if (this.powerDirty) this.updatePower();
    for (const p of this.players) {
      if (p.defeated) continue;
      this.production(p);
      if (this.mmo && this.tick % SUPPLY_UPKEEP_TICKS === 0) this.mmoUpkeep(p);
      if (p.autoRepair && this.tick % AUTO_REPAIR_TICKS === 0) this.autoRepairBase(p);
    }
    for (const e of this.entities.values()) {
      e.px = e.x; e.py = e.y;
      if (e.hp <= 0) continue;
      if (e.c4At && this.tick >= e.c4At) {
        this.effect('bigExplosion', e.x, e.y, 0, 0, 30);
        this.damage(e, e.hp, e.c4By);
        continue;
      }
      if (e.convertedUntil && this.tick >= e.convertedUntil) { e.owner = e.originalOwner; e.convertedUntil = 0; e.order = 'idle'; e.target = 0; e.path = []; }
      if (e.carriedBy) continue; // Moved by whatever carries it.
      if (e.kind === 'unit') this.unitThink(e); else this.structureThink(e);
    }
    this.updateProjectiles();
    this.resolveStrikes();
    this.mechanics();
    this.collectCrates();
    if (this.tick % 4 === 0) this.updateFog();
    this.cleanup();
    // Persistent regions have no match-over: elimination, protection and recovery
    // are world-authority decisions journaled as operations, not engine victory.
    if (!this.persistent && this.tick % 15 === 0) this.checkVictory();
    if (this.effects.length > 400) this.effects = this.effects.slice(-300);
  }

  // ---------------------------------------------------------------- helpers

  cellIndex(x: number, y: number) { return Math.max(0, Math.min(this.map.h - 1, y)) * this.map.w + Math.max(0, Math.min(this.map.w - 1, x)); }
  cellOf(e: { x: number; y: number }) { return this.cellIndex(toCell(e.x), toCell(e.y)); }
  unitDef(e: Entity): UnitDef { return this.pack.units[e.type]; }
  moveClass(def: UnitDef): MoveClass { return def.amphibious ? 'amphibious' : def.kind; }
  isAircraft(e: Entity) { return e.kind === 'unit' && this.pack.units[e.type].kind === 'aircraft'; }
  structDef(e: Entity): StructureDef { return this.pack.structures[e.type]; }
  weaponOf(e: Entity): WeaponDef | undefined {
    const def = e.kind === 'unit' ? this.pack.units[e.type] : undefined;
    const id = def ? (e.deployed && def.deployWeapon) || def.weapon : this.pack.structures[e.type]?.weapon;
    return id ? this.pack.weapons[id] : undefined;
  }
  /** Primary weapon, or the alt (Force, etc.) when the primary cannot reach this target. */
  weaponFor(e: Entity, t?: Entity): WeaponDef | undefined {
    const primary = this.weaponOf(e);
    if (!t || e.kind !== 'unit') return primary;
    if (primary && this.inRange(e, t, primary)) return primary;
    const altId = this.unitDef(e).altWeapon;
    const alt = altId ? this.pack.weapons[altId] : undefined;
    if (alt && this.inRange(e, t, alt)) return alt;
    return primary ?? alt;
  }
  targetKind(e: Entity): TargetKind {
    return e.kind === 'structure' ? 'structure' : this.pack.units[e.type].kind;
  }
  /** Can this unit be ordered to attack that target, by weapon or by a special ability? */
  canEngage(u: Entity, t: Entity, kind = this.targetKind(t)): boolean {
    const def = this.unitDef(u);
    if (def.c4 && (kind === 'structure' || !def.weapon)) return true;
    if (def.terror && kind === 'vehicle') return true;
    const ids = [def.weapon, def.deployWeapon, def.altWeapon];
    return ids.some(id => id && this.pack.weapons[id] && weaponCanTarget(this.pack.weapons[id], kind));
  }
  sightOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].sight : this.pack.structures[e.type].sight; }
  armorOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].armor : this.pack.structures[e.type].armor; }

  private blank(type: string, kind: 'unit' | 'structure', owner: number, x: number, y: number, hp: number): Entity {
    return {
      id: this.nextId++, type, kind, owner, x, y, px: x, py: y, hp, maxHp: hp, facing: 128, turret: 128,
      order: 'idle', path: [], goal: -1, resume: -1, target: 0, cooldown: 0, repathTick: 0,
      hstate: 'seek', cargo: 0, cargoValue: 0, harvestCell: -1, homeField: -1, timer: 0, dock: 0,
      cx: 0, cy: 0, w: 1, h: 1, repairing: false, dockedBy: 0, originalOwner: owner, convertedUntil: 0, born: this.tick, exposed: false, charge: 0, force: false, fireCell: -1,
      xp: 0, rank: 0, ammo: 0, deployed: false, disguised: false, stillTicks: 0, carrying: 0, carriedBy: 0, controls: 0, c4At: 0, c4By: -1, invulnUntil: 0, heldUntil: 0, drone: 0, warp: -999, passengers: [], bound: 0, shielded: false, battleAt: -1, recoveryProtected: false, packedType: '',
      faction: this.players[owner]?.faction ?? '',
    };
  }

  spawnUnit(type: string, owner: number, cell: number): Entity {
    const def = this.pack.units[type];
    const e = this.blank(type, 'unit', owner, cellCenter(cell % this.map.w), cellCenter(Math.floor(cell / this.map.w)), def.hp);
    if (def.harvester) e.order = 'harvest';
    e.ammo = def.ammo ?? 0;
    this.entities.set(e.id, e);
    return e;
  }

  spawnStructure(type: string, owner: number, cx: number, cy: number, hpPercent = 100): Entity {
    const def = this.pack.structures[type];
    const e = this.blank(type, 'structure', owner, cx * LEPTONS + (def.w * LEPTONS) / 2, cy * LEPTONS + (def.h * LEPTONS) / 2, def.hp);
    // Persistent pacing (PW23): structure durability scales so levelling a
    // developed base takes the profile's target assault time. maxHp carries the
    // multiplier; hpPercent (concrete-start damage) applies on top, exactly as
    // before. Classic games have no tuning and are byte-identical.
    const mult = this.mmo?.structureHpMultiplier ?? 1;
    e.maxHp = Math.max(1, Math.round(def.hp * mult));
    e.hp = Math.max(1, Math.floor((e.maxHp * hpPercent) / 100));
    e.cx = cx; e.cy = cy; e.w = def.w; e.h = def.h;
    this.entities.set(e.id, e);
    for (let y = cy; y < cy + def.h; y++) for (let x = cx; x < cx + def.w; x++) this.map.occupied[y * this.map.w + x] = e.id;
    this.powerDirty = true;
    const player = this.players[owner];
    if (player) {
      player.stats.built++;
      if (def.storage) player.storage += def.storage;
    }
    if (def.refinery?.freeUnit) {
      const dock = this.cellIndex(cx + def.refinery.dockX, cy + def.refinery.dockY);
      const free = this.pack.units[def.refinery.freeUnit];
      const cell = free ? nearestCell(this.map, dock, 4, i => passable(this.pack, this.map, i, this.moveClass(free))) : -1;
      if (cell >= 0) this.spawnUnit(def.refinery.freeUnit, owner, cell);
    }
    return e;
  }

  unitInCell(cell: number, except = 0): Entity | undefined {
    for (const e of this.entities.values()) if (e.kind === 'unit' && e.hp > 0 && e.id !== except && !e.carriedBy && !this.isAircraft(e) && this.cellOf(e) === cell) return e;
    return undefined;
  }

  /** Distance from a point to an entity's body (structures measure to their footprint edge). */
  distTo(x: number, y: number, t: Entity): number {
    if (t.kind === 'structure') {
      const nx = Math.max(t.cx * LEPTONS, Math.min(x, (t.cx + t.w) * LEPTONS - 1));
      const ny = Math.max(t.cy * LEPTONS, Math.min(y, (t.cy + t.h) * LEPTONS - 1));
      return dist(x, y, nx, ny);
    }
    return dist(x, y, t.x, t.y);
  }

  isEnemy(a: number, b: number): boolean {
    if (a === b || a < 0 || b < 0) return false;
    const pa = this.players[a], pb = this.players[b];
    if (!pa || !pb) return false;
    if (pa.team === pb.team) return false;
    // PW09: players sharing a non-negative alliance key are not enemies, whatever
    // their spawn team is. -1 means no alliance.
    if (pa.ally >= 0 && pa.ally === pb.ally) return false;
    return true;
  }

  // ---------------------------------------------------------------- compound shields (PW10)

  /** Construction yards carrying an active shield boundary (persistent profile only). */
  private shieldCompounds(): Entity[] {
    if (!this.persistent || !this.mmo?.shieldRadiusCells) return [];
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.shielded && e.hp > 0 && e.kind === 'structure') out.push(e);
    }
    return out;
  }

  private shieldRadiusLepton(): number {
    return (this.mmo?.shieldRadiusCells ?? 0) * LEPTONS;
  }

  private pointInCompound(x: number, y: number, c: Entity): boolean {
    return dist(x, y, c.x, c.y) <= this.shieldRadiusLepton();
  }

  /** The compound whose protection covers this owner at this point, if any. */
  compoundProtecting(x: number, y: number, owner: number): Entity | undefined {
    for (const c of this.shieldCompounds()) {
      if (!this.pointInCompound(x, y, c)) continue;
      if (owner === c.owner) return c;
      const po = this.players[owner], pc = this.players[c.owner];
      if (po && pc && po.ally >= 0 && po.ally === pc.ally) return c;
    }
    return undefined;
  }

  /**
   * Whether `e` (owned by `owner`) may damage `target` under the shield boundary.
   * The boundary is closed to hostile interference in both directions: enemies of
   * the compound owner cannot damage anything inside, and protected units inside
   * (owner or qualifying allies) cannot damage anything outside. Units already
   * inside when the shield activates are not ejected; an enemy insider simply can
   * no longer hurt protected assets, while defenders inside can still finish them.
   */
  private shieldBlocksDamage(e: Entity, by: number, source: number): boolean {
    if (!this.persistent || !this.mmo?.shieldRadiusCells) return false;
    const src = source ? this.entities.get(source) : undefined;
    for (const c of this.shieldCompounds()) {
      const eIn = this.pointInCompound(e.x, e.y, c);
      const sIn = !!src && this.pointInCompound(src.x, src.y, c);
      if (!eIn && !sIn) continue;
      // Hostile fire into the compound is blocked for enemies of its owner.
      if (eIn && by >= 0 && by !== c.owner && this.isEnemy(by, c.owner)) return true;
      // Protected units inside cannot fire outward through the boundary.
      if (sIn && !eIn && src && this.compoundProtecting(src.x, src.y, src.owner) === c) return true;
    }
    return false;
  }

  /** Same boundary applied at fire time so blocked shots never leave the muzzle. */
  private shieldBlocksFire(a: Entity, t: Entity | undefined, gx: number, gy: number): boolean {
    if (!this.persistent || !this.mmo?.shieldRadiusCells) return false;
    const tx = t ? t.x : gx, ty = t ? t.y : gy;
    for (const c of this.shieldCompounds()) {
      const aIn = this.pointInCompound(a.x, a.y, c);
      const tIn = this.pointInCompound(tx, ty, c);
      if (!aIn && !tIn) continue;
      if (aIn && this.compoundProtecting(a.x, a.y, a.owner) === c && !tIn) return true;
      if (!aIn && tIn && a.owner !== c.owner && this.isEnemy(a.owner, c.owner)) return true;
    }
    return false;
  }

  /** Stamp every compound whose boundary contains this PvP damage exchange. */
  private noteCompoundBattle(x: number, y: number, by: number, defender: number) {
    if (!this.persistent || !this.mmo?.shieldRadiusCells) return;
    for (const c of this.entities.values()) {
      if (c.kind !== 'structure' || c.hp <= 0 || !this.structDef(c).constructionYard) continue;
      if (!this.pointInCompound(x, y, c)) continue;
      if (by === c.owner || defender === c.owner || this.isEnemy(c.owner, by) || this.isEnemy(c.owner, defender)) {
        c.battleAt = this.tick;
      }
    }
  }

  private effect(kind: string, x: number, y: number, x2: number, y2: number, dur: number, color?: string): Effect {
    const fx: Effect = { kind, x, y, x2, y2, tick: this.tick, dur, color };
    this.effects.push(fx);
    return fx;
  }

  /** Assign each unit in a group its own destination cell around the target. */
  private spreadGoals(units: Entity[], center: number): number[] {
    const taken = new Set<number>();
    return units.map(u => {
      const kind = this.moveClass(this.unitDef(u));
      const cell = nearestCell(this.map, center, 8, i => !taken.has(i) && passable(this.pack, this.map, i, kind));
      const goal = cell >= 0 ? cell : center;
      taken.add(goal);
      return goal;
    });
  }

  private pathFor(u: Entity, goal: number, allow?: number): number[] {
    return findPath(this.pack, this.map, this.moveClass(this.unitDef(u)), this.cellOf(u), goal, { allow });
  }

  // ---------------------------------------------------------------- production

  /** Structures the player currently owns, by type id, with the upgrade level bought for each. */
  owned(p: Player): Map<string, number> {
    const map = new Map<string, number>();
    for (const e of this.entities.values()) if (e.owner === p.slot && e.kind === 'structure' && e.hp > 0) map.set(e.type, p.upgrades[e.type] ?? 0);
    return map;
  }

  /** The unit or structure an item builds ('upgrade:x' and 'starport:x' are pseudo-items). */
  baseItem(item: string) { return item.startsWith(UPGRADE) ? item.slice(UPGRADE.length) : item.startsWith(STARPORT) ? item.slice(STARPORT.length) : item; }

  queueFor(item: string): QueueKind | null {
    if (item.startsWith(UPGRADE)) return this.pack.structures[item.slice(UPGRADE.length)]?.upgrades ? 'structure' : null;
    if (item.startsWith(STARPORT)) return this.pack.units[item.slice(STARPORT.length)]?.starport ? 'starport' : null;
    const s = this.pack.structures[item];
    if (s) return s.queue;
    const u = this.pack.units[item];
    if (u) return u.queue ?? u.kind;
    return null;
  }

  /** Factory structures that enable a queue (construction yards build both base tabs). */
  factories(p: Player, queue: QueueKind): Entity[] {
    const list: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.owner !== p.slot || e.kind !== 'structure' || e.hp <= 0) continue;
      const def = this.pack.structures[e.type];
      if ((queue === 'structure' || queue === 'defense') ? def.constructionYard : def.produces === queue) list.push(e);
    }
    return list;
  }

  // ------------------------------------------------------------ mixed forces (PW17)

  /** Best upgrade level the player holds per prerequisite role key. */
  private ownedRoleLevels(p: Player): Map<string, number> {
    const roles = new Map<string, number>();
    for (const e of this.entities.values()) {
      if (e.owner !== p.slot || e.kind !== 'structure' || e.hp <= 0) continue;
      const def = this.pack.structures[e.type];
      if (!def) continue;
      const level = p.upgrades[e.type] ?? 0;
      for (const r of structurePrereqRoles(def)) roles.set(r, Math.max(roles.get(r) ?? 0, level));
    }
    return roles;
  }

  /**
   * PW17: prerequisites matched by ROLE, not exact type. 'nuke' is satisfied by
   * any power plant, 'pyle|hand' by a barracks of either faction, and a
   * faction-locked prereq ('tmpl', 'afld@1') still needs that faction's
   * building — importable, but never substitutable. Prereq ids with no role
   * signature fall back to exact type+level.
   */
  private prereqsSatisfied(p: Player, prereqs: string[], owned = this.owned(p)): boolean {
    // Classic matches keep exact type+level prereqs — role matching is a
    // deliberate persistent-mode change, not a fidelity tweak.
    if (!this.persistent) return prereqsMet(prereqs, owned);
    if (!prereqs.length) return true;
    const roles = this.ownedRoleLevels(p);
    return prereqs.every(entry => entry.split('|').some(alt => {
      const [id, need] = alt.split('@');
      const n = Number(need ?? 0);
      const sdef = this.pack.structures[id];
      const rs = sdef ? structurePrereqRoles(sdef) : [];
      if (rs.length) return rs.some(r => (roles.get(r) ?? -1) >= n);
      const have = owned.get(id);
      return have !== undefined && have >= n;
    }));
  }

  /**
   * PW17: the faction a production building fields. A faction-locked factory
   * produces its own faction's units no matter who owns it now; a shared one
   * falls back to the faction it was created under, then the current owner's.
   */
  private factoryFaction(e: Entity): { faction: string; side: string } {
    const sdef = this.pack.structures[e.type];
    if (sdef?.factions?.length) {
      const f = this.pack.factions.find(f => factionCanUse(sdef, f.id, f.side));
      if (f) return { faction: f.id, side: f.side };
    }
    const facId = e.faction || this.players[e.owner]?.faction || '';
    const f = this.pack.factions.find(x => x.id === facId);
    return { faction: facId, side: f?.side ?? facId };
  }

  /**
   * PW17: the factories allowed to build `item`. Unit production is scoped per
   * building: the factory's own faction gates the roster and the OWNER's
   * role-matched prerequisites must hold. An imported factory therefore offers
   * the donor faction's units — and only those.
   */
  eligibleFactories(p: Player, kind: QueueKind, item: string): Entity[] {
    const def = this.pack.units[this.baseItem(item)];
    if (!def) return [];
    const out: Entity[] = [];
    for (const e of this.factories(p, kind)) {
      const ff = this.factoryFaction(e);
      if (!factionCanUse(def, ff.faction, ff.side)) continue;
      if (!item.startsWith(STARPORT) && !this.prereqsSatisfied(p, def.prereqs)) continue;
      out.push(e);
    }
    return out;
  }

  // ------------------------------------------------------- persistent pacing

  /** Live units a player fields — the supply points the PW23 cap and upkeep use. */
  supplyPoints(p: Player): number {
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.owner === p.slot && e.kind === 'unit' && e.hp > 0) n++;
    }
    return n;
  }

  /** Standing construction yards — the player's compounds under the PW23 cap. */
  compoundCount(p: Player): number {
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.owner === p.slot && e.kind === 'structure' && e.hp > 0 && this.structDef(e).constructionYard) n++;
    }
    return n;
  }

  /**
   * Supply upkeep (PW23): every in-game minute each player pays
   * upkeepPerPointPerMinute credits per supply point, floored at zero. Runs in
   * step() and inside fastForwardQuiescent so quiescent intervals drain the
   * same way live ticks do.
   */
  private mmoUpkeep(p: Player) {
    const t = this.mmo;
    if (!t || t.upkeepPerPointPerMinute <= 0) return;
    const due = t.upkeepPerPointPerMinute * this.supplyPoints(p);
    if (due > 0) p.credits = Math.max(0, p.credits - due);
  }

  /**
   * Caretaker auto-repair (PW09): when the owner enabled it, own damaged
   * structures regenerate AUTO_REPAIR_PERCENT of max HP per in-game minute. It
   * never spends resources, places nothing and takes no orders — the only thing
   * the caretaker is allowed to do besides guards, harvesters and production.
   */
  private autoRepairBase(p: Player) {
    for (const e of this.entities.values()) {
      if (e.owner !== p.slot || e.kind !== 'structure' || e.hp <= 0 || e.hp >= e.maxHp) continue;
      if (e.invulnUntil > this.tick) continue;
      const heal = Math.max(1, Math.floor(e.maxHp * AUTO_REPAIR_PERCENT / 100));
      e.hp = Math.min(e.maxHp, e.hp + heal);
    }
  }

  /**
   * Raw asset totals for the world power score (PW23): build-cost sums plus
   * purchased upgrade levels. The service weights them via computePowerScore.
   */
  assetTotals(p: Player): { structureCost: number; unitCost: number; techLevels: number } {
    let structureCost = 0, unitCost = 0, techLevels = 0;
    for (const e of this.entities.values()) {
      if (e.owner !== p.slot || e.hp <= 0) continue;
      if (e.kind === 'structure') structureCost += this.pack.structures[e.type]?.cost ?? 0;
      else unitCost += this.pack.units[e.type]?.cost ?? 0;
    }
    for (const level of Object.values(p.upgrades)) techLevels += level;
    return { structureCost, unitCost, techLevels };
  }

  /** What a faction takes the field with, which the regular doctrine may change. */
  startUnitsFor(faction: FactionDef): string[] {
    const start = this.doctrine === 'regular' && faction.regularStart ? faction.regularStart : faction.startUnits;
    return start.filter(type => !!this.pack.units[type]);
  }

  /**
   * PW12 recovery build rules: while recovering, only structures whose derived
   * role is in the profile's recoveryBuildRoles may be queued or placed, and
   * the only unit production allowed is a single harvester. Upgrades and
   * starport purchases are not rebuilding and are denied outright.
   */
  private recoveryBuildAllowed(p: Player, item: string): boolean {
    const roles = this.mmo?.recoveryBuildRoles;
    if (!roles?.length) return true; // No tuning (pre-PW12 snapshot): unrestricted.
    if (item.startsWith(UPGRADE) || item.startsWith(STARPORT)) return false;
    const base = this.baseItem(item);
    const sdef = this.pack.structures[base];
    if (sdef) return structureRoles(sdef).some(r => roles.includes(r));
    const udef = this.pack.units[base];
    if (!udef || !isHarvesterUnit(udef)) return false;
    // One harvester operates during recovery: count live units plus anything
    // already queued so a stacked production order cannot bypass the cap.
    let harvesters = 0;
    for (const e of this.entities.values()) {
      if (e.owner === p.slot && e.hp > 0 && !e.carriedBy && e.kind === 'unit' && isHarvesterUnit(this.unitDef(e))) harvesters++;
    }
    for (const it of p.queues.vehicle.items) {
      const d = this.pack.units[this.baseItem(it)];
      if (d && isHarvesterUnit(d)) harvesters++;
    }
    return harvesters < 1;
  }

  canBuild(p: Player, item: string, owned = this.owned(p)): boolean {
    const queue = this.queueFor(item);
    if (!queue) return false;
    if (p.recovering && !this.recoveryBuildAllowed(p, item)) return false;
    const base = this.baseItem(item);
    const sdef = this.pack.structures[base];
    const udef = this.pack.units[base];
    const def: UnitDef | StructureDef | undefined = sdef ?? udef;
    if (!def) return false;
    // Buildings stay player-faction gated (PW17): importing a production
    // building never adds the donor faction's structures to the build menu.
    // Unit items are gated per-factory in eligibleFactories instead.
    const structureItem = !!sdef && (queue === 'structure' || queue === 'defense');
    // Classic matches gate every item by the player's faction; persistent
    // gates buildings the same way but units per-factory (PW17).
    const playerGated = structureItem || item.startsWith(UPGRADE) || !this.persistent;
    if (playerGated && !factionCanUse(def, p.faction, p.side)) return false;
    // The tech level caps what may be built, but not the improvement of a building already
    // standing: Construction Yards are never built directly (tech 99) yet can be upgraded.
    if (!item.startsWith(UPGRADE) && def.tech > this.techCap) return false;
    // A pack may describe both an irregular and a regular army; only one of them turns out.
    if (def.doctrine && def.doctrine !== this.doctrine) return false;
    if (item.startsWith(UPGRADE)) {
      // Upgrades are bought once the building stands, up to its number of levels.
      const level = owned.get(base);
      if (level === undefined || level >= ((def as StructureDef).upgrades ?? 0) || p.queues.structure.items.includes(item)) return false;
    } else if (!item.startsWith(STARPORT) && !this.prereqsSatisfied(p, def.prereqs, owned)) return false;
    if (structureItem || item.startsWith(UPGRADE)) return this.factories(p, queue).length > 0;
    // Classic matches gate units by the player's own faction exactly as before;
    // persistent mixed forces gate per-factory (PW17).
    if (!this.persistent) return this.factories(p, queue).length > 0;
    return this.eligibleFactories(p, queue, item).length > 0;
  }

  buildOptions(p: Player, queue: QueueKind): string[] {
    const owned = this.owned(p);
    let pool: string[];
    if (queue === 'structure' || queue === 'defense') {
      pool = Object.values(this.pack.structures).filter(s => s.queue === queue).map(s => s.id);
      if (queue === 'structure') pool.push(...Object.values(this.pack.structures).filter(s => s.upgrades).map(s => UPGRADE + s.id));
    } else if (queue === 'starport') pool = Object.values(this.pack.units).filter(u => u.starport).map(u => STARPORT + u.id);
    else pool = Object.values(this.pack.units).filter(u => (u.queue ?? u.kind) === queue).map(u => u.id);
    return pool.filter(id => this.canBuild(p, id, owned));
  }

  /** Price of an item for a player: upgrades, CHOAM prices and Industrial Plant discounts apply. */
  costOf(item: string, p?: Player): number {
    if (item.startsWith(UPGRADE)) return this.pack.structures[item.slice(UPGRADE.length)]?.upgradeCost ?? 0;
    if (item.startsWith(STARPORT)) return Math.floor(((this.pack.units[item.slice(STARPORT.length)]?.cost ?? 0) * this.market) / 100);
    const unit = this.pack.units[item];
    if (unit && p?.costReduction && unit.kind !== 'infantry') return Math.floor((unit.cost * (100 - p.costReduction)) / 100);
    return (this.pack.structures[item] ?? unit)?.cost ?? 0;
  }

  private startBuild(p: Player, item: string) {
    const queue = this.queueFor(item);
    if (!queue || !this.canBuild(p, item)) return;
    const q = p.queues[queue];
    if (queue === 'structure' || queue === 'defense') {
      if (q.items.length) return; // One building at a time per tab, as in the classics.
      q.items.push(item);
    } else if (q.items.length < 9) q.items.push(item);
    if (q.items.length === 1) { q.paid = 0; q.acc = 0; q.ready = false; q.hold = false; }
  }

  private cancelBuild(p: Player, item: string) {
    const queue = this.queueFor(item);
    if (!queue) return;
    const q = p.queues[queue];
    const idx = q.items.lastIndexOf(item);
    if (idx < 0) return;
    if (idx === 0) { p.credits += q.paid; q.paid = 0; q.acc = 0; q.ready = false; }
    q.items.splice(idx, 1);
  }

  /** Per-kind production context that cannot change while a region is quiescent. */
  private productionSpeed(p: Player, factories: Entity[]): number {
    let speed = 100 + (factories.length - 1) * this.pack.extraFactoryBonus;
    const ai = this.ai[p.slot];
    if (ai) speed = Math.floor((speed * AI_LEVELS[ai.level].buildPercent) / 100);
    if (p.powerUse > p.powerGen) speed = Math.floor((speed * this.pack.lowPowerProductionPercent) / 100);
    return speed;
  }

  private production(p: Player, fast?: { factories: Map<QueueKind, Entity[]>; speed: Map<QueueKind, number> }) {
    for (const kind of QUEUES) {
      const q = p.queues[kind];
      if (!q.items.length || q.ready) continue;
      let factories = fast?.factories.get(kind);
      if (factories === undefined) {
        factories = this.factories(p, kind);
        fast?.factories.set(kind, factories);
      }
      if (!factories.length) continue;
      const item = q.items[0];
      // Supply cap (PW23): unit production stalls while the army is at cap.
      // Already-paid progress is kept; the queue resumes when supply frees.
      if (this.mmo && this.mmo.supplyCap > 0 && UNIT_QUEUES.has(kind)
        && this.supplyPoints(p) >= this.mmo.supplyCap) continue;
      const cost = this.costOf(item, p);
      const speed = fast ? (fast.speed.get(kind) ?? this.productionSpeed(p, factories)) : this.productionSpeed(p, factories);
      if (fast && !fast.speed.has(kind)) fast.speed.set(kind, speed);
      // Credits are charged as production progresses, like the originals.
      q.acc += Math.floor((100 * speed) / this.pack.buildTicksPer100);
      let pay = Math.floor(q.acc / 100);
      q.acc -= pay * 100;
      pay = Math.min(pay, cost - q.paid, p.credits);
      if (pay <= 0 && q.paid < cost) continue;
      p.credits -= pay; q.paid += pay;
      if (q.paid < cost) continue;
      if (item.startsWith(UPGRADE)) {
        const base = item.slice(UPGRADE.length);
        p.upgrades[base] = (p.upgrades[base] ?? 0) + 1;
        for (const e of this.entities.values()) if (e.owner === p.slot && e.type === base && e.hp > 0) { const fx = this.effect('upgrade', e.x, e.y, 0, 0, 30); fx.owner = p.slot; }
        q.items.shift(); q.paid = 0; q.acc = 0;
        continue;
      }
      if (kind === 'structure' || kind === 'defense') { q.ready = true; continue; }
      const unitId = this.baseItem(item);
      const def = this.pack.units[unitId];
      // PW17: roll out of a factory actually allowed to build this item — an
      // imported building produces its own faction's units, so eligibility is
      // per-factory, not per-player. (structure/defense kinds already continued
      // above via q.ready, so `kind` here is always a unit queue.)
      const eligible = this.persistent ? this.eligibleFactories(p, kind, item) : factories;
      if (!eligible.length) continue;
      // Roll out of the factory the unit actually requires (tanks from the Heavy Factory).
      const named = new Set(def.prereqs.flatMap(r => r.split('|').map(a => a.split('@')[0])));
      const factory = kind === 'starport' ? eligible[0] : eligible.find(f => named.has(f.type)) ?? eligible[0];
      const exit = this.exitCell(factory, def);
      if (exit < 0) continue;
      const unit = this.spawnUnit(unitId, p.slot, exit);
      unit.facing = 128; unit.turret = 128;
      if (p.veteranQueues.includes(kind)) { unit.rank = 1; unit.xp = def.cost * (this.pack.veterancy?.veteran ?? 1); }
      if (kind === 'starport') { const fx = this.effect('delivery', unit.x, unit.y, 0, 0, 30); fx.owner = p.slot; }
      const sendToRally = (u: Entity) => {
        const d = this.unitDef(u);
        if (!d.harvester && !d.carrier && !d.ammo && p.rally >= 0) { u.order = 'move'; u.goal = p.rally; u.path = this.pathFor(u, p.rally); }
      };
      sendToRally(unit);
      // Cloning Vats copy every infantry unit trained.
      if (def.kind === 'infantry' && !def.noClone) for (const vat of this.entities.values()) {
        if (vat.owner !== p.slot || vat.kind !== 'structure' || vat.hp <= 0 || !this.structDef(vat).cloning) continue;
        const at = this.exitCell(vat, def);
        if (at >= 0) { const clone = this.spawnUnit(unitId, p.slot, at); clone.rank = unit.rank; clone.xp = unit.xp; sendToRally(clone); }
      }
      q.items.shift(); q.paid = 0; q.acc = 0;
    }
  }

  /** Where a new unit appears: aircraft over the pad, ships on nearby water, the rest at the door. */
  private exitCell(factory: Entity, def: UnitDef): number {
    const cls = this.moveClass(def);
    if (cls === 'aircraft') return this.cellIndex(factory.cx + (factory.w >> 1), factory.cy + (factory.h >> 1));
    const origin = cls === 'naval' ? this.cellIndex(factory.cx + (factory.w >> 1), factory.cy + (factory.h >> 1)) : this.cellIndex(factory.cx + (factory.w >> 1), factory.cy + factory.h);
    return nearestCell(this.map, origin, 6, i => passable(this.pack, this.map, i, cls) && !this.unitInCell(i));
  }

  /** Placement check shared by the UI ghost, the AI and the place command. */
  canPlace(p: Player, item: string, x: number, y: number, ignoreRadius = false, ignoreUnit = 0): boolean {
    const def = this.pack.structures[item];
    if (!def) return false;
    // Compound cap (PW23): a player may hold at most maxCompounds construction
    // yards. Checked here so the placement ghost, the AI and the place command
    // all see the same answer.
    if (this.mmo && def.constructionYard && this.mmo.maxCompounds > 0
      && this.compoundCount(p) >= this.mmo.maxCompounds) return false;
    for (let cy = y; cy < y + def.h; cy++) for (let cx = x; cx < x + def.w; cx++) {
      if (!inBounds(this.map, cx, cy)) return false;
      const i = cy * this.map.w + cx;
      if (this.map.occupied[i]) return false;
      // Shipyards float; everything else needs dry, buildable ground.
      if (def.onWater ? !isWater(this.pack, this.map, i) : !buildableTerrain(this.pack, this.map, i)) return false;
      if (def.floor && this.map.concrete[i]) return false;
      if (!def.floor && this.unitInCell(i, ignoreUnit)) return false;
    }
    if (ignoreRadius) return true;
    // Shipyards reach further: the coast is rarely right beside a base.
    const r = this.pack.buildRadius + (def.onWater ? 6 : 0);
    for (const e of this.entities.values()) {
      if (e.owner !== p.slot || e.kind !== 'structure' || e.hp <= 0) continue;
      if (x <= e.cx + e.w - 1 + r && x + def.w - 1 >= e.cx - r && y <= e.cy + e.h - 1 + r && y + def.h - 1 >= e.cy - r) return true;
    }
    // Concrete laid next to existing concrete also extends the build area (Dune).
    if (def.floor) for (let cy = y - 1; cy <= y + def.h; cy++) for (let cx = x - 1; cx <= x + def.w; cx++) {
      if (inBounds(this.map, cx, cy) && this.map.concrete[cy * this.map.w + cx]) return true;
    }
    return false;
  }

  private place(p: Player, item: string, x: number, y: number) {
    const kind = this.queueFor(item);
    if (!kind || (kind !== 'structure' && kind !== 'defense')) return;
    // PW12: an item queued before recovery began still cannot be placed after —
    // the recovery role gate applies at placement, not only at queue time.
    if (p.recovering && !this.recoveryBuildAllowed(p, item)) return;
    const q = p.queues[kind];
    if (!q.ready || q.items[0] !== item || !this.canPlace(p, item, x, y)) return;
    const def = this.pack.structures[item];
    q.items.shift(); q.ready = false; q.paid = 0; q.acc = 0;
    if (def.floor) {
      for (let cy = y; cy < y + def.h; cy++) for (let cx = x; cx < x + def.w; cx++) this.map.concrete[cy * this.map.w + cx] = 1;
      this.effect('build', (x + def.w / 2) * LEPTONS, (y + def.h / 2) * LEPTONS, 0, 0, 10);
      return;
    }
    const start = this.startHealth(def, x, y);
    const s = this.spawnStructure(item, p.slot, x, y, start);
    // PW12: every structure placed during recovery is a permitted rebuild and
    // carries the recovery protection flag until the episode ends.
    if (p.recovering) s.recoveryProtected = true;
    const fx = this.effect('place', s.x, s.y, 0, 0, 10); fx.item = item; fx.owner = p.slot;
    s.exposed = start < 100;
  }

  /** Dune: buildings not fully on concrete start damaged. */
  private startHealth(def: StructureDef, x: number, y: number): number {
    const concrete = this.pack.mechanics.concrete;
    if (!concrete || def.wall) return 100;
    for (let cy = y; cy < y + def.h; cy++) for (let cx = x; cx < x + def.w; cx++) if (!this.map.concrete[cy * this.map.w + cx]) return concrete.uncoveredStartPercent;
    return 100;
  }

  private deploy(u: Entity) {
    const def = this.unitDef(u);
    if (def.transport) { this.unload(u); return; }
    if (def.deployWeapon || def.lure) {
      // Toggle a deployed stance: dig in, set up, or start thumping.
      u.deployed = !u.deployed; u.path = []; u.order = 'idle'; u.target = 0;
      const fx = this.effect(u.deployed ? 'dig' : 'undig', u.x, u.y, 0, 0, 15); fx.item = u.type; fx.owner = u.owner;
      return;
    }
    if (!def.deploysTo) return;
    const s = this.pack.structures[def.deploysTo];
    const cx = toCell(u.x) - (s.w >> 1), cy = toCell(u.y) - (s.h >> 1);
    if (!this.canPlace(this.players[u.owner], def.deploysTo, cx, cy, true, u.id)) { this.effect('denied', u.x, u.y, 0, 0, 10); return; }
    u.hp = 0;
    this.entities.delete(u.id);
    const fx = this.effect('deploy', u.x, u.y, 0, 0, 30); fx.item = u.type; fx.owner = u.owner;
    // A bound MCV (newcomer starter grant, PW11) deploys a bound yard — the
    // grant cannot be cashed out by deploying and selling. The recovery MCV
    // (PW12) likewise passes its protection onto the yard it becomes.
    const yard = this.spawnStructure(def.deploysTo, u.owner, cx, cy, 100);
    yard.bound = u.bound;
    yard.recoveryProtected = u.recoveryProtected;
  }

  // ---------------------------------------------------------------- packed buildings (PW14)

  /** Structures with a synthesized carrier: everything except walls, floors and water-only builds. */
  private packableStructure(e: Entity): boolean {
    if (e.kind !== 'structure') return false;
    const def = this.pack.structures[e.type];
    return !!def && !def.wall && !def.floor && !def.onWater && !!this.pack.units[`pack_${e.type}`];
  }

  /**
   * PW14 pack: the deployed structure becomes its dedicated carrier — same entity
   * id (so the same durable asset id), same health, zero superweapon charge (D6).
   * The footprint frees, storage and power drop, docked harvesters are turned
   * away, and the entity moves as an unarmed vehicle until unpacked.
   */
  private packStructure(e: Entity) {
    const sdef = this.pack.structures[e.type];
    const p = this.players[e.owner];
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) {
      const i = y * this.map.w + x;
      if (this.map.occupied[i] === e.id) this.map.occupied[i] = 0;
    }
    if (p && sdef.storage) p.storage -= sdef.storage;
    this.powerDirty = true;
    for (const o of this.entities.values()) {
      if (o.dockedBy !== e.id) continue;
      o.dockedBy = 0; o.dock = 0;
      if (o.order === 'enter') { o.order = 'idle'; o.path = []; o.target = 0; }
    }
    e.kind = 'unit';
    e.packedType = sdef.id;
    e.type = `pack_${sdef.id}`;
    e.charge = 0;
    e.order = 'idle'; e.path = []; e.goal = -1; e.target = 0; e.resume = -1;
    e.cooldown = 0; e.repathTick = 0;
    e.dockedBy = 0; e.repairing = false;
    e.hstate = 'seek'; e.cargo = 0; e.cargoValue = 0; e.harvestCell = -1; e.homeField = -1; e.dock = 0; e.timer = 0;
    e.deployed = false; e.disguised = false; e.stillTicks = 0;
    const fx = this.effect('pack', e.x, e.y, 0, 0, 30); fx.item = e.packedType; fx.owner = e.owner;
  }

  /**
   * PW14 unpack: the carrier becomes its structure again at the requested
   * top-left cell. The carrier must be standing on or beside the footprint.
   * Validation runs before any mutation, so an illegal site leaves the carrier
   * exactly as it was — no loss, no duplicate.
   */
  private unpackStructure(e: Entity, x: number, y: number) {
    const structType = e.packedType;
    const sdef = this.pack.structures[structType];
    const p = this.players[e.owner];
    if (!sdef || !p) return;
    const cc = this.cellOf(e);
    const ccx = cc % this.map.w, ccy = Math.floor(cc / this.map.w);
    if (ccx < x - 1 || ccx > x + sdef.w || ccy < y - 1 || ccy > y + sdef.h) {
      this.effect('denied', e.x, e.y, 0, 0, 10);
      return;
    }
    if (!this.canPlace(p, structType, x, y, true, e.id)) { this.effect('denied', e.x, e.y, 0, 0, 10); return; }
    e.type = structType;
    e.packedType = '';
    e.kind = 'structure';
    e.cx = x; e.cy = y; e.w = sdef.w; e.h = sdef.h;
    for (let cy = y; cy < y + sdef.h; cy++) for (let cx = x; cx < x + sdef.w; cx++) this.map.occupied[cy * this.map.w + cx] = e.id;
    if (sdef.storage) p.storage += sdef.storage;
    this.powerDirty = true;
    e.x = x * LEPTONS + (sdef.w * LEPTONS) / 2;
    e.y = y * LEPTONS + (sdef.h * LEPTONS) / 2;
    e.px = e.x; e.py = e.y;
    e.order = 'idle'; e.path = []; e.goal = -1; e.target = 0; e.resume = -1;
    e.cooldown = 0; e.repathTick = 0; e.hstate = 'seek';
    // D6: charge is zero while packed and starts fresh on redeploy — packing
    // can never preserve, move or duplicate a charged shot.
    e.charge = 0;
    const fx = this.effect('deploy', e.x, e.y, 0, 0, 30); fx.item = structType; fx.owner = e.owner;
  }

  private updatePower() {
    for (const p of this.players) { p.powerGen = 0; p.powerUse = 0; p.incomeBonus = 0; p.costReduction = 0; }
    for (const e of this.entities.values()) {
      if (e.kind !== 'structure' || e.hp <= 0) continue;
      const p = this.players[e.owner];
      if (!p) continue;
      const def = this.pack.structures[e.type];
      if (def.power > 0) p.powerGen += def.power; else p.powerUse -= def.power;
      // Support buildings do not stack, like the originals.
      p.incomeBonus = Math.max(p.incomeBonus, def.incomeBonus ?? 0);
      p.costReduction = Math.max(p.costReduction, def.costReduction ?? 0);
    }
    for (const p of this.players) if (p.blackoutUntil) p.powerGen = 0;
    this.powerDirty = false;
  }

  lowPower(owner: number): boolean { const p = this.players[owner]; return !!p && p.powerUse > p.powerGen; }

  // ---------------------------------------------------------------- units

  private unitThink(u: Entity) {
    const def = this.unitDef(u);
    if (u.cooldown > 0) u.cooldown--;
    if (def.regen && u.hp < u.maxHp && this.tick % 30 === 0) u.hp = Math.min(u.maxHp, u.hp + def.regen);
    // Elite units patch themselves up.
    if (u.rank >= 2 && u.hp < u.maxHp && this.tick % 45 === 0) u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp / 100)));
    if (def.disguise) {
      u.stillTicks = u.x === u.px && u.y === u.py ? u.stillTicks + 1 : 0;
      u.disguised = u.stillTicks > 45;
    }
    if (u.drone) this.droneBite(u);
    for (const id of u.passengers) { const p = this.entities.get(id); if (p) { p.px = p.x; p.py = p.y; p.x = u.x; p.y = u.y; } }
    if (u.heldUntil > this.tick) { u.path = []; u.order = 'idle'; u.target = 0; return; }
    if (def.carrier && (u.order === 'idle' || u.order === 'ferry')) { this.ferry(u, def); return; }
    if (def.harvester && (u.order === 'harvest' || u.order === 'idle')) { u.order = 'harvest'; this.harvest(u, def); return; }
    if (def.ammo && u.ammo <= 0 && u.order !== 'rearm' && u.order !== 'move') { u.order = 'rearm'; u.dock = 0; u.path = []; }
    if (u.order === 'rearm') { this.rearm(u, def); return; }
    if (u.order === 'enter') { this.enterThink(u, def); return; }
    const weapon = this.weaponOf(u);
    if (u.order === 'attack') {
      const t = this.entities.get(u.target);
      if (!t || t.hp <= 0 || t.carriedBy || !u.force && !this.isEnemy(u.owner, t.owner) && !t.convertedUntil && t.owner !== -1) {
        u.target = 0; u.force = false;
        if (def.ammo) {
          if (def.sortie && u.ammo > 0) {
            const next = weapon && this.acquire(u, Math.max(weapon.range, def.sight * LEPTONS) + LEPTONS, weapon);
            if (next) { u.target = next.id; u.repathTick = 0; return; }
          }
          u.order = 'rearm'; u.dock = 0; u.path = []; return;
        }
        if (u.resume >= 0 && this.cellOf(u) !== u.resume && u.goal === u.resume) { u.order = 'attackMove'; u.path = this.pathFor(u, u.resume); } else u.order = 'idle';
        return;
      }
      const kind = this.targetKind(t);
      // PW10: a protected unit ordered against a target outside its compound's
      // shield must leave protection to engage — walk out, then fight.
      if (this.persistent && this.mmo?.shieldRadiusCells) {
        const prot = this.compoundProtecting(u.x, u.y, u.owner);
        if (prot && !this.pointInCompound(t.x, t.y, prot)) {
          u.order = 'attackMove'; u.path = this.pathFor(u, this.cellOf(t)); u.repathTick = this.tick + 20;
          this.move(u, def); return;
        }
      }
      const used = this.weaponFor(u, t);
      if (def.c4 && (kind === 'structure' || !weapon) || def.terror && kind === 'vehicle') {
        // Hands-on abilities: walk up and plant the charge, or jump inside the vehicle.
        if (this.distTo(u.x, u.y, t) <= (t.kind === 'structure' ? REACH : 160)) { u.path = []; this.contact(u, def, t); return; }
      } else if (used && this.inRange(u, t, used) && def.kind === 'aircraft' && def.sortie) {
        this.aimAndFire(u, t, used);
        if (!u.path.length || this.tick >= u.repathTick) { u.path = this.flyPast(u, t); u.repathTick = this.tick + 12; }
        this.move(u, def);
        return;
      } else if (used && this.inRange(u, t, used) && used === weapon) { u.path = []; this.aimAndFire(u, t, used); return; }
      else if (used && this.inRange(u, t, used)) {
        // Alt weapon (Force): fire while closing to melee.
        this.aimAndFire(u, t, used);
      }
      if (!u.path.length || this.tick >= u.repathTick) {
        u.path = this.pathFor(u, this.cellOf(t)); u.repathTick = this.tick + 20;
      }
      this.move(u, def);
      return;
    }
    if (u.order === 'attackGround') {
      const gx = cellCenter(u.fireCell % this.map.w), gy = cellCenter(Math.floor(u.fireCell / this.map.w));
      const d = dist(u.x, u.y, gx, gy);
      if (weapon && d <= weapon.range && d >= (weapon.minRange ?? 0)) { u.path = []; this.aimAndFire(u, undefined, weapon, gx, gy); return; }
      if (!u.path.length || this.tick >= u.repathTick) { u.path = this.pathFor(u, u.fireCell); u.repathTick = this.tick + 20; }
      if (!u.path.length) { u.order = 'idle'; return; }
      this.move(u, def);
      return;
    }
    // Idle and attack-moving units engage what they can see. Classic jets only strike when
    // ordered; sortie aircraft keep hunting until the magazine is empty.
    if (weapon && (!def.ammo || def.sortie) && (u.order === 'idle' || u.order === 'attackMove') && (this.tick + u.id) % 8 === 0) {
      const reach = u.order === 'attackMove' ? def.sight * LEPTONS : weapon.range + LEPTONS;
      const t = this.acquire(u, reach, weapon);
      if (t) { u.order = 'attack'; u.target = t.id; u.repathTick = 0; return; }
    }
    if (u.order === 'move' || u.order === 'attackMove') {
      if (!u.path.length) { u.order = 'idle'; return; }
      this.move(u, def);
    }
  }

  private inRange(a: Entity, t: Entity, w: WeaponDef) {
    const d = this.distTo(a.x, a.y, t);
    return d <= w.range && d >= (w.minRange ?? 0);
  }

  private acquire(a: Entity, reach: number, w: WeaponDef): Entity | undefined {
    // Yuri holds one mind at a time.
    if (w.converts && w.converts < 0 && a.controls && (this.entities.get(a.controls)?.hp ?? 0) > 0) return undefined;
    let best: Entity | undefined; let bestD = reach + 1;
    const viewer = this.players[a.owner];
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || e.carriedBy || e.disguised || e.invulnUntil > this.tick || !this.isEnemy(a.owner, e.owner)) continue;
      if (!weaponCanTarget(w, this.targetKind(e))) continue;
      if (viewer && !viewer.visible[this.cellOf(e)]) continue;
      const d = this.distTo(a.x, a.y, e);
      if (d > reach || d < (w.minRange ?? 0)) continue;
      // Prefer units over buildings, then nearest; ids break ties deterministically.
      const score = d + (e.kind === 'structure' ? LEPTONS * 3 : 0);
      if (score < bestD) { best = e; bestD = score; }
    }
    return best;
  }

  private move(u: Entity, def: UnitDef) {
    if (!u.path.length) return;
    const next = u.path[0];
    const cls = this.moveClass(def);
    if (cls !== 'aircraft' && (!terrainPassable(this.pack, this.map, next, cls) || this.map.occupied[next] && this.map.occupied[next] !== u.dock)) {
      // Something was built in the way; find a new route.
      const goal = u.path[u.path.length - 1];
      u.path = this.pathFor(u, goal);
      return;
    }
    const tx = cellCenter(next % this.map.w), ty = cellCenter(Math.floor(next / this.map.w));
    const dx = tx - u.x, dy = ty - u.y;
    const want = facingTo(dx, dy);
    if ((def.kind === 'vehicle' || def.kind === 'naval') && def.turn) {
      const delta = facingDelta(u.facing, want);
      const stepTurn = Math.min(Math.abs(delta), def.turn);
      u.facing = (u.facing + Math.sign(delta) * stepTurn) & 255;
      if (Math.abs(delta) > 40) return; // Turn in place before driving, like the classics.
    } else u.facing = want;
    u.turret = u.facing;
    const terrainSpeed = cls === 'aircraft' ? 100 : this.pack.terrains[this.map.terrain[this.cellOf(u)]].speed || 100;
    const step = Math.max(1, Math.floor((def.speed * terrainSpeed) / 100));
    const d = dist(u.x, u.y, tx, ty);
    let nx = u.x, ny = u.y;
    if (d <= step) { nx = tx; ny = ty; } else {
      nx = u.x + Math.trunc((dx * step) / d);
      ny = u.y + Math.trunc((dy * step) / d);
    }
    // PW10: an active compound shield admits only its owner — allies, enemies and
    // carriers are all turned back at the boundary. Units already inside (either
    // side) move freely, so protected troops can withdraw but never re-enter.
    if (this.persistent && this.mmo?.shieldRadiusCells && u.owner >= 0) {
      for (const c of this.shieldCompounds()) {
        if (u.owner === c.owner) continue;
        if (this.pointInCompound(nx, ny, c) && !this.pointInCompound(u.x, u.y, c)) {
          u.path = []; return;
        }
      }
    }
    u.x = nx; u.y = ny;
    if (d <= step) {
      u.path.shift();
      if (def.crusher && def.kind === 'vehicle') this.crush(u, next);
    }
  }

  private crush(u: Entity, cell: number) {
    for (const e of this.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.id === u.id || e.carriedBy || !this.isEnemy(u.owner, e.owner)) continue;
      if (this.unitDef(e).crushable && this.cellOf(e) === cell) { this.damage(e, e.hp, u.owner, u.id); this.effect('crush', e.x, e.y, 0, 0, 12); }
    }
  }

  // ---------------------------------------------------------------- special abilities

  /** Aircraft fly back to the nearest airfield and reload one shot at a time. */
  private rearm(u: Entity, def: UnitDef) {
    let pad = this.entities.get(u.dock);
    if (!pad || pad.hp <= 0 || pad.owner !== u.owner || pad.kind !== 'structure' || !this.structDef(pad).airfield) {
      pad = undefined; let best = Infinity;
      for (const e of this.entities.values()) {
        if (e.owner !== u.owner || e.kind !== 'structure' || e.hp <= 0 || !this.structDef(e).airfield) continue;
        const d = dist(u.x, u.y, e.x, e.y);
        if (d < best) { best = d; pad = e; }
      }
      if (!pad) { if (u.ammo > 0) u.order = 'idle'; return; } // Circle until an airfield stands.
      u.dock = pad.id; u.path = [this.cellOf(pad)];
    }
    if (this.distTo(u.x, u.y, pad) > 0 || u.path.length) {
      if (!u.path.length) u.path = [this.cellOf(pad)];
      this.move(u, def);
      return;
    }
    if (u.ammo < (def.ammo ?? 0)) { if (this.tick % 30 === 0) u.ammo++; return; }
    if (def.sortie && u.resume >= 0) {
      u.order = 'attackMove'; u.goal = u.resume; u.path = this.pathFor(u, u.resume);
      return;
    }
    u.order = 'idle';
  }

  /** A cell past the target, offset left or right so the next pass comes from the other side. */
  private flyPast(u: Entity, t: Entity): number[] {
    const dx = t.x - u.x, dy = t.y - u.y;
    const d = Math.max(1, dist(u.x, u.y, t.x, t.y));
    const ahead = 6 * LEPTONS, perp = 4 * LEPTONS;
    const side = (u.ammo & 1) ? 1 : -1;
    const px = t.x + Math.trunc((dx * ahead) / d) + Math.trunc((-dy * perp * side) / d);
    const py = t.y + Math.trunc((dy * ahead) / d) + Math.trunc((dx * perp * side) / d);
    const cell = this.cellIndex(toCell(px), toCell(py));
    return cell === this.cellOf(u) ? this.pathFor(u, this.cellOf(t)) : [cell];
  }

  /** Where a harvester is heading, for the Carryall: its refinery or its spice field. */
  private harvestGoal(h: Entity): number {
    if (h.hstate === 'toRefinery') {
      const ref = this.nearestRefinery(h);
      if (!ref) return -1;
      const r = this.structDef(ref).refinery!;
      return this.cellIndex(ref.cx + r.dockX, ref.cy + r.dockY);
    }
    if (h.hstate === 'seek' && h.harvestCell >= 0 && h.path.length) return h.harvestCell;
    return -1;
  }

  /** Dune Carryall: pick up harvesters facing a long drive and fly them there. */
  private ferry(u: Entity, def: UnitDef) {
    if (u.order === 'idle') {
      if ((this.tick + u.id) % 15 !== 0) return;
      const busy = new Set<number>();
      for (const e of this.entities.values()) if (e.kind === 'unit' && e.owner === u.owner && e.order === 'ferry') busy.add(e.target);
      let best: Entity | undefined, bestD = Infinity, dest = -1;
      for (const h of this.entities.values()) {
        if (h.owner !== u.owner || h.kind !== 'unit' || h.hp <= 0 || h.carriedBy || busy.has(h.id)) continue;
        const hd = this.unitDef(h);
        if (!hd.harvester || hd.harvester.teleport) continue;
        const goal = this.harvestGoal(h);
        if (goal < 0 || dist(h.x, h.y, cellCenter(goal % this.map.w), cellCenter(Math.floor(goal / this.map.w))) < 12 * LEPTONS) continue;
        const d = dist(u.x, u.y, h.x, h.y);
        if (d < bestD) { bestD = d; best = h; dest = goal; }
      }
      if (best) { u.order = 'ferry'; u.target = best.id; u.goal = dest; u.path = [this.cellOf(best)]; }
      return;
    }
    const h = this.entities.get(u.target);
    if (!h || h.hp <= 0 || h.owner !== u.owner) { if (u.carrying) this.drop(u); u.order = 'idle'; u.target = 0; u.path = []; return; }
    if (!u.carrying) {
      if (h.carriedBy || h.hstate === 'unload' || h.hstate === 'gather') { u.order = 'idle'; u.target = 0; u.path = []; return; }
      if (dist(u.x, u.y, h.x, h.y) <= 64) {
        u.carrying = h.id; h.carriedBy = u.id; h.path = [];
        u.path = [u.goal];
        this.effect('lift', h.x, h.y, 0, 0, 10);
      } else { u.path = [this.cellOf(h)]; this.move(u, def); }
      return;
    }
    if (!u.path.length) { this.drop(u); u.order = 'idle'; u.target = 0; return; }
    this.move(u, def);
    h.x = u.x; h.y = u.y;
  }

  private drop(u: Entity) {
    const h = this.entities.get(u.carrying);
    u.carrying = 0;
    if (!h) return;
    h.carriedBy = 0;
    const cls = this.moveClass(this.unitDef(h));
    const cell = nearestCell(this.map, this.cellOf(u), 4, i => passable(this.pack, this.map, i, cls) && !this.unitInCell(i, h.id));
    if (cell < 0) { this.damage(h, h.hp, -1); return; }
    h.x = h.px = cellCenter(cell % this.map.w); h.y = h.py = cellCenter(Math.floor(cell / this.map.w)); h.path = [];
    this.effect('drop', h.x, h.y, 0, 0, 10);
  }

  private enterThink(u: Entity, def: UnitDef) {
    const t = this.entities.get(u.target);
    if (!t || t.hp <= 0) { u.order = 'idle'; u.target = 0; u.path = []; return; }
    if (this.distTo(u.x, u.y, t) <= (t.kind === 'unit' ? 200 : REACH)) { u.path = []; this.enterAct(u, def, t); return; }
    if (!u.path.length || this.tick >= u.repathTick) { u.path = this.pathFor(u, this.cellOf(t)); u.repathTick = this.tick + 20; }
    if (!u.path.length) { u.order = 'idle'; u.target = 0; return; }
    this.move(u, def);
  }

  /** Set every passenger down on free ground around the transport; refused over open water. */
  private unload(t: Entity) {
    let left = 0;
    for (const id of [...t.passengers]) {
      const p = this.entities.get(id);
      if (!p) continue;
      const cls = this.moveClass(this.unitDef(p));
      const cell = nearestCell(this.map, this.cellOf(t), 3, i => passable(this.pack, this.map, i, cls) && !this.unitInCell(i));
      if (cell < 0) { left++; continue; }
      p.carriedBy = 0; p.x = p.px = cellCenter(cell % this.map.w); p.y = p.py = cellCenter(Math.floor(cell / this.map.w));
      p.order = 'idle'; p.path = [];
      t.passengers = t.passengers.filter(x => x !== id);
    }
    const fx = this.effect(left && left === t.passengers.length ? 'denied' : 'unload', t.x, t.y, 0, 0, 10); fx.owner = t.owner;
  }

  /** Room left in a transport, and whether this unit may board it. */
  private seats(t: Entity) {
    const cap = this.unitDef(t).transport ?? 0;
    return cap - t.passengers.reduce((n, id) => n + this.seatSize(this.entities.get(id)), 0);
  }
  private seatSize(e?: Entity) { return e && this.unitDef(e).kind === 'infantry' ? 1 : 3; }
  canBoard(u: Entity, t: Entity): boolean {
    const td = this.unitDef(t), ud = this.unitDef(u);
    if (t.kind !== 'unit' || !td?.transport || t.owner !== u.owner || u.kind !== 'unit' || ud.transport) return false;
    if (ud.kind === 'aircraft' || ud.kind === 'naval' || td.infantryOnly && ud.kind !== 'infantry') return false;
    return this.seats(t) >= this.seatSize(u);
  }

  private enterAct(u: Entity, def: UnitDef, t: Entity) {
    if (t.kind === 'unit') {
      // Climb aboard: the passenger rides hidden until unloaded.
      if (this.canBoard(u, t)) {
        t.passengers.push(u.id); u.carriedBy = t.id; u.path = []; u.x = t.x; u.y = t.y;
        const fx = this.effect('board', t.x, t.y, 0, 0, 10); fx.owner = u.owner;
      }
      u.order = 'idle'; u.target = 0;
      return;
    }
    const enemy = this.isEnemy(u.owner, t.owner);
    if (def.engineer) {
      if (enemy) this.capture(t, u.owner);
      else if (t.owner === u.owner) { t.hp = t.maxHp; this.effect('repairFx', t.x, t.y, 0, 0, 20); }
      this.consume(u);
      return;
    }
    if (def.spy && enemy) { this.infiltrate(t, u.owner); this.consume(u); return; }
    // Anything else (a vehicle at a repair pad) parks here; the pad does the work.
    u.order = 'idle'; u.target = 0;
  }

  /** The unit is used up by its ability (it goes inside, or goes up with the charge). */
  private consume(u: Entity) {
    const fx = this.effect('enter', u.x, u.y, 0, 0, 10); fx.owner = u.owner;
    u.hp = 0;
  }

  private capture(s: Entity, owner: number) {
    const def = this.structDef(s);
    const from = this.players[s.owner], to = this.players[owner];
    if (def.storage) { if (from) from.storage -= def.storage; if (to) to.storage += def.storage; }
    s.owner = owner; s.originalOwner = owner; s.repairing = false; s.target = 0; s.charge = 0;
    this.powerDirty = true;
    const fx = this.effect('capture', s.x, s.y, 0, 0, 30); fx.owner = owner; fx.item = s.type;
  }

  private infiltrate(s: Entity, spyOwner: number) {
    const def = this.structDef(s);
    const victim = this.players[s.owner], spy = this.players[spyOwner];
    if (!victim || !spy) return;
    const effect: InfiltrationEffect | 'super' | undefined = def.infiltrate
      ?? (def.refinery || def.storage ? 'steal'
        : def.power > 0 ? 'blackout'
        : def.radar ? 'reshroud'
        : def.produces && def.produces !== 'starport' ? 'veteran'
        : def.superweapon ? 'super' : undefined);
    switch (effect) {
      case 'steal': { const take = Math.floor(victim.credits / 2); victim.credits -= take; spy.credits += take; break; }
      case 'blackout': victim.blackoutUntil = this.tick + 900; this.powerDirty = true; break;
      case 'reshroud': victim.explored.fill(0); break;
      case 'veteran': if (def.produces && !spy.veteranQueues.includes(def.produces)) spy.veteranQueues.push(def.produces); break;
      case 'super': s.charge = 0; break;
    }
    const fx = this.effect('infiltrate', s.x, s.y, 0, 0, 30); fx.owner = spyOwner; fx.item = s.type; fx.color = effect ?? 'none';
  }

  /** C4 and terror drones: abilities used at arm's length. */
  private contact(u: Entity, def: UnitDef, t: Entity) {
    u.order = 'idle'; u.target = 0;
    if (def.terror && t.kind === 'unit' && this.unitDef(t).kind === 'vehicle') {
      if (t.drone) return; // Already infested.
      t.drone = u.id; u.carriedBy = t.id; u.x = t.x; u.y = t.y;
      this.effect('droneIn', t.x, t.y, 0, 0, 12);
      return;
    }
    if (def.c4 && !t.c4At) {
      t.c4At = this.tick + def.c4; t.c4By = u.owner;
      const fx = this.effect('c4', t.x, t.y, 0, 0, def.c4); fx.owner = u.owner;
    }
    if (def.expendable) this.consume(u);
  }

  /** A terror drone inside a vehicle chews through it until it dies or reaches a repair pad. */
  private droneBite(v: Entity) {
    const drone = this.entities.get(v.drone);
    if (!drone || drone.hp <= 0) { v.drone = 0; return; }
    drone.px = drone.x; drone.py = drone.y; drone.x = v.x; drone.y = v.y;
    if (this.tick % 15 === 0) this.damage(v, this.unitDef(drone).terror ?? 0, drone.owner, drone.id);
  }

  // ---------------------------------------------------------------- weapons

  private aimAndFire(a: Entity, t: Entity | undefined, w: WeaponDef, gx = t?.x ?? 0, gy = t?.y ?? 0) {
    // PW10: the compound shield boundary applies at the muzzle — a blocked shot
    // never exists, so projectiles, shells and beams cannot cross it.
    if (this.shieldBlocksFire(a, t, gx, gy)) { a.cooldown = Math.max(a.cooldown, 15); return; }
    // PW11: a protected newcomer's weapons never fire — they cannot attack.
    if (this.persistent && this.players[a.owner]?.newcomerProtected) { a.cooldown = Math.max(a.cooldown, 15); return; }
    // PW12: a recovery-protected entity's weapons never fire either.
    if (this.persistent && a.recoveryProtected) { a.cooldown = Math.max(a.cooldown, 15); return; }
    const want = facingTo(gx - a.x, gy - a.y);
    const udef = a.kind === 'unit' ? this.unitDef(a) : undefined;
    if (udef && (udef.kind === 'infantry' || udef.kind === 'aircraft')) a.facing = want;
    const delta = facingDelta(a.turret, want);
    a.turret = (a.turret + Math.sign(delta) * Math.min(Math.abs(delta), 16)) & 255;
    if (udef && (udef.kind === 'vehicle' || udef.kind === 'naval') && !udef.shape.includes('turret')) {
      // Fixed-gun vehicles turn the whole hull.
      const d2 = facingDelta(a.facing, want);
      a.facing = (a.facing + Math.sign(d2) * Math.min(Math.abs(d2), udef.turn ?? 8)) & 255;
      if (Math.abs(d2) > 16) return;
    }
    if (Math.abs(delta) > 24 || a.cooldown > 0) return;
    if (w.converts && w.converts < 0 && a.controls && (this.entities.get(a.controls)?.hp ?? 0) > 0) return;
    if (udef?.ammo) { if (a.ammo <= 0) return; a.ammo--; }
    a.cooldown = w.rof;
    a.stillTicks = 0; a.disguised = false;
    const shots = w.burst ?? 1;
    for (let s = 0; s < shots; s++) this.fire(a, t, w, s, gx, gy);
    if (w.suicide) this.damage(a, a.hp, -1);
  }

  private fire(a: Entity, t: Entity | undefined, w: WeaponDef, shot: number, gx: number, gy: number) {
    // Aim at the nearest point of a building so shells do not fly to its centre.
    let tx = gx, ty = gy;
    if (t && t.kind === 'structure') {
      tx = Math.max(t.cx * LEPTONS + 64, Math.min(a.x, (t.cx + t.w) * LEPTONS - 64));
      ty = Math.max(t.cy * LEPTONS + 64, Math.min(a.y, (t.cy + t.h) * LEPTONS - 64));
    }
    if (w.line) {
      // Sonic waves hurt everything along the line, friend or foe.
      const len = Math.max(1, dist(a.x, a.y, tx, ty));
      for (const e of this.entities.values()) {
        if (e.hp <= 0 || e.id === a.id || e.carriedBy || !weaponCanTarget(w, this.targetKind(e))) continue;
        const along = ((e.x - a.x) * (tx - a.x) + (e.y - a.y) * (ty - a.y)) / len;
        if (along < 0 || along > len + 128) continue;
        const px = a.x + ((tx - a.x) * along) / len, py = a.y + ((ty - a.y) * along) / len;
        if (dist(e.x, e.y, Math.round(px), Math.round(py)) < 160) this.hit(e, w, a.owner, 100, a.id);
      }
      this.tagWeapon(this.effect('sonic', a.x, a.y, tx, ty, 12), w, a);
      return;
    }
    if (w.speed === 0) {
      this.tagWeapon(this.effect(w.visual, a.x, a.y, tx, ty, w.visual === 'prism' || w.visual === 'tesla' ? 8 : 4), w, a);
      this.impact(w, a.owner, t, tx, ty, a.id);
      return;
    }
    this.projectiles.push({ id: this.nextId++, owner: a.owner, weapon: w.id, x: a.x, y: a.y, sx: a.x, sy: a.y, tx: tx + shot * 40, ty, target: t?.id ?? 0, source: a.id });
    this.tagWeapon(this.effect('muzzle', a.x, a.y, tx, ty, 3), w, a);
  }

  /** Weapon effects carry the weapon and shooter so the sound player can pick the right report. */
  private tagWeapon(fx: Effect, w: WeaponDef, a: Entity) { fx.item = w.id; fx.owner = a.owner; }

  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const w = this.pack.weapons[pr.weapon];
      if (w.visual === 'missile' || w.visual === 'torpedo') {
        const t = this.entities.get(pr.target);
        if (t && t.hp > 0) { pr.tx = t.x; pr.ty = t.y; }
      }
      const d = dist(pr.x, pr.y, pr.tx, pr.ty);
      if (d <= w.speed) {
        this.projectiles.splice(i, 1);
        this.impact(w, pr.owner, this.entities.get(pr.target), pr.tx, pr.ty, pr.source);
      } else {
        pr.x += Math.trunc(((pr.tx - pr.x) * w.speed) / d);
        pr.y += Math.trunc(((pr.ty - pr.y) * w.speed) / d);
      }
    }
  }

  private impact(w: WeaponDef, owner: number, target: Entity | undefined, x: number, y: number, source: number) {
    // Big blasts (Demolition Truck, Kirov crash, reactor meltdown) carry their radius for the renderer.
    this.effect(w.splash ? 'explosion' : 'hit', x, y, w.splash ?? 0, 0, w.splash ? (w.splash >= 512 ? 30 : 14) : 6);
    if (w.converts && target && target.kind === 'unit' && target.hp > 0 && target.owner !== owner && target.owner >= 0 && !target.carriedBy) {
      const kind = this.unitDef(target).kind;
      if (w.converts < 0) {
        // Yuri: permanent control of one victim, freed if Yuri dies.
        const yuri = this.entities.get(source);
        if (yuri && yuri.hp > 0 && kind !== 'aircraft' && !((this.entities.get(yuri.controls)?.hp ?? 0) > 0)) {
          if (!target.convertedUntil) target.originalOwner = target.owner;
          target.owner = owner; target.convertedUntil = 0; target.order = 'idle'; target.target = 0; target.path = [];
          yuri.controls = target.id;
          this.effect('convert', target.x, target.y, 0, 0, 20);
        }
      } else if (kind === 'vehicle') {
        target.originalOwner = target.convertedUntil ? target.originalOwner : target.owner;
        target.owner = owner; target.convertedUntil = this.tick + w.converts; target.order = 'idle'; target.target = 0; target.path = [];
        this.effect('convert', target.x, target.y, 0, 0, 20);
      }
    }
    if (!target && !w.splash) {
      // A ground shot still hits whatever is standing where it lands.
      for (const e of this.entities.values()) if (e.hp > 0 && !e.carriedBy && weaponCanTarget(w, this.targetKind(e)) && this.distTo(x, y, e) <= 96) { target = e; break; }
    }
    if (target && target.hp > 0 && (!w.splash || this.distTo(x, y, target) <= LEPTONS)) this.hit(target, w, owner, 100, source);
    if (w.splash) {
      for (const e of this.entities.values()) {
        if (e.hp <= 0 || e === target || e.carriedBy || !weaponCanTarget(w, this.targetKind(e))) continue;
        const d = this.distTo(x, y, e);
        if (d >= w.splash) continue;
        this.hit(e, w, owner, Math.floor(((w.splash - d) * 100) / w.splash), source);
      }
      for (const worm of this.worms) if (!worm.hidden && dist(x, y, worm.x, worm.y) < w.splash) worm.hp -= w.damage;
    }
  }

  private hit(e: Entity, w: WeaponDef, owner: number, percent: number, source = 0) {
    if (e.invulnUntil > this.tick) return;
    const vs = this.pack.warheads[w.warhead]?.vs[this.armorOf(e)] ?? 100;
    let amount = Math.floor((w.damage * vs * percent) / 10000);
    // Veterans hit harder and shrug off more.
    const vet = this.pack.veterancy;
    if (vet) {
      const src = source ? this.entities.get(source) : undefined;
      if (src?.rank) amount = Math.floor((amount * (100 + vet.firepower * src.rank)) / 100);
      if (e.rank) amount = Math.floor((amount * 100) / (100 + vet.armour * e.rank));
    }
    if (amount <= 0) return;
    this.damage(e, amount, owner, source);
    // Idle units retaliate.
    if (e.hp > 0 && e.kind === 'unit' && e.order === 'idle' && source && this.weaponOf(e) && !this.unitDef(e).harvester && !this.unitDef(e).ammo) {
      const attacker = this.entities.get(source);
      if (attacker && this.isEnemy(e.owner, attacker.owner) && this.canEngage(e, attacker)) { e.order = 'attack'; e.target = attacker.id; }
    }
  }

  damage(e: Entity, amount: number, by: number, source = 0, quiet = false) {
    if (e.hp <= 0 || e.invulnUntil > this.tick && !quiet) return;
    // PW10: an active compound shield is a hard boundary — no damage crosses it.
    if (this.shieldBlocksDamage(e, by, source)) return;
    // PW11: newcomer setup protection is player-scoped — a protected player's
    // entities can neither deal nor receive damage. Covers every damage path
    // (fire, artillery, crush, strikes) because they all funnel through here.
    if (this.persistent) {
      const def = this.players[e.owner];
      const atk = by >= 0 ? this.players[by] : undefined;
      if (def?.newcomerProtected || atk?.newcomerProtected) return;
      // PW12: recovery protection is entity-scoped — the bound MCV and the
      // permitted rebuild structures can neither deal nor receive damage,
      // while the player's surviving unprotected units fight normally.
      const src = source ? this.entities.get(source) : undefined;
      if (e.recoveryProtected || src?.recoveryProtected) return;
    }
    // D5: player-vs-player damage inside a compound's radius marks it in battle.
    if (by >= 0 && e.owner >= 0 && by !== e.owner && this.isEnemy(by, e.owner)) {
      this.noteCompoundBattle(e.x, e.y, by, e.owner);
      // PW12: a recovering player who attacks another player ends recovery at
      // once — the durable evaluator reads this flag on its next pass.
      const bp = this.players[by];
      if (bp?.recovering) bp.recoveryAttacked = true;
    }
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
      e.deadBy = by;
      const killer = this.players[by];
      if (killer && by !== e.owner) killer.stats.killed++;
      const victim = this.players[e.owner];
      if (victim) victim.stats.lost++;
      if (source && by !== e.owner) this.award(source, e);
      this.effect(e.kind === 'structure' ? 'bigExplosion' : this.unitDef(e).kind === 'infantry' ? 'death' : 'vehicleDeath', e.x, e.y, 0, 0, e.kind === 'structure' ? 30 : 18);
      // Some things go out with a bang (Devastator, Demolition Truck, Kirov, Nuclear Reactor).
      const dw = e.kind === 'unit' ? this.unitDef(e).deathWeapon : this.structDef(e).deathWeapon;
      if (dw && !quiet && this.pack.weapons[dw]) this.impact(this.pack.weapons[dw], e.owner, undefined, e.x, e.y, 0);
    }
  }

  /** Veterancy: kills earn experience worth the victim's cost. */
  private award(source: number, victim: Entity) {
    const vet = this.pack.veterancy;
    const src = this.entities.get(source);
    if (!vet || !src || src.kind !== 'unit' || src.hp <= 0) return;
    src.xp += victim.kind === 'unit' ? this.unitDef(victim).cost : this.structDef(victim).cost;
    const cost = Math.max(1, this.unitDef(src).cost);
    const rank = src.xp >= cost * vet.elite ? 2 : src.xp >= cost * vet.veteran ? 1 : 0;
    if (rank > src.rank) { src.rank = rank; const fx = this.effect('promote', src.x, src.y, rank, 0, 30); fx.owner = src.owner; }
  }

  // ---------------------------------------------------------------- harvesting

  private harvest(u: Entity, def: UnitDef) {
    const h = def.harvester!;
    const p = this.players[u.owner];
    if (u.hstate === 'seek') {
      if (u.cargo >= h.capacity) { u.hstate = 'toRefinery'; u.path = []; return; }
      const here = this.cellOf(u);
      if (this.map.res[here] > 0 && (u.harvestCell < 0 || here === u.harvestCell || !u.path.length)) { u.hstate = 'gather'; u.timer = h.gather; return; }
      if (!u.path.length) {
        const origin = u.homeField >= 0 ? u.homeField : u.harvestCell >= 0 ? u.harvestCell : here;
        // A locked field is searched close in; an unlocked one may wander outward.
        const reach = u.homeField >= 0 ? 12 : 30;
        let cell = nearestCell(this.map, origin, reach, i => this.map.res[i] > 0 && terrainPassable(this.pack, this.map, i, 'vehicle') && !this.map.occupied[i]);
        // The ordered field is worked out: go back to taking the nearest.
        if (cell < 0 && u.homeField >= 0) {
          u.homeField = -1;
          cell = nearestCell(this.map, here, 30, i => this.map.res[i] > 0 && terrainPassable(this.pack, this.map, i, 'vehicle') && !this.map.occupied[i]);
        }
        if (cell < 0) { if (u.cargo > 0) u.hstate = 'toRefinery'; return; }
        u.harvestCell = cell;
        u.path = this.pathFor(u, cell);
        if (!u.path.length && here !== cell) { u.harvestCell = -1; return; }
      }
      this.move(u, def);
      return;
    }
    if (u.hstate === 'gather') {
      const here = this.cellOf(u);
      if (this.map.res[here] <= 0) { u.hstate = 'seek'; u.harvestCell = here; u.path = []; return; }
      if (--u.timer > 0) return;
      u.timer = h.gather;
      const kind = this.map.resKind[here] - 1;
      this.map.res[here]--;
      if (this.map.res[here] === 0) this.map.resKind[here] = 0;
      u.cargo++;
      u.cargoValue += this.pack.resources[kind]?.value ?? 0;
      if (u.cargo >= h.capacity) { u.hstate = 'toRefinery'; u.path = []; }
      return;
    }
    if (u.hstate === 'toRefinery') {
      const ref = this.nearestRefinery(u);
      if (!ref) return; // No refinery: wait loaded until one is built.
      u.dock = ref.id;
      const dockCell = this.dockCell(ref, def);
      if (dockCell < 0) return; // Hemmed in: hold the load until something frees up.
      if (h.teleport && this.cellOf(u) !== dockCell) {
        // Chrono Miner: stop and charge up, then jump straight to the refinery pad.
        u.hstate = 'warp'; u.timer = WARP_TICKS; u.path = [];
        this.effect('minerWarp', u.x, u.y, 0, 0, WARP_TICKS);
        return;
      }
      if (this.cellOf(u) === dockCell) {
        if (ref.dockedBy && ref.dockedBy !== u.id && this.entities.get(ref.dockedBy)?.hp) return; // Queue for the pad.
        // Settle on the pad: arriving within the cell is enough, so a lepton of
        // overshoot cannot leave a full harvester idling beside the refinery.
        u.x = u.px = cellCenter(dockCell % this.map.w);
        u.y = u.py = cellCenter(Math.floor(dockCell / this.map.w));
        ref.dockedBy = u.id; u.hstate = 'unload'; u.timer = h.unload; u.facing = 64;
        return;
      }
      if (!u.path.length) u.path = this.pathFor(u, dockCell, dockCell);
      // No way through this tick (traffic, or a pad walled in): keep the refinery and
      // try again rather than dropping the load and standing still for ever.
      if (!u.path.length) return;
      this.move(u, def);
      return;
    }
    if (u.hstate === 'warp') {
      if (--u.timer > 0) return;
      const ref = this.nearestRefinery(u);
      if (ref) {
        const r = this.pack.structures[ref.type].refinery!;
        const dockCell = this.cellIndex(ref.cx + r.dockX, ref.cy + r.dockY);
        this.effect('chrono', u.x, u.y, 0, 0, 12);
        u.x = u.px = cellCenter(dockCell % this.map.w); u.y = u.py = cellCenter(Math.floor(dockCell / this.map.w));
        u.warp = this.tick;
        this.effect('chrono', u.x, u.y, 0, 0, 12);
      }
      u.hstate = 'toRefinery';
      return;
    }
    // unload
    const ref = this.entities.get(u.dock);
    if (!ref || ref.hp <= 0) { u.hstate = 'toRefinery'; u.dock = 0; return; }
    if (--u.timer > 0) return;
    u.timer = h.unload;
    if (u.cargo > 0) {
      const each = Math.floor(u.cargoValue / u.cargo);
      u.cargo--; u.cargoValue -= each;
      // With storage rules (Dune silos), anything above capacity is lost; starting
      // credits above capacity are never reduced. Packs without storage are unlimited.
      let next = p.credits + each + Math.floor((each * p.incomeBonus) / 100);
      // PW12: during recovery, banked credits stop accruing above the profile
      // cap — income still flows up to it, then stalls. Credits already above
      // the cap neither grow nor shrink.
      const cap = this.mmo?.recoveryCreditCap ?? 0;
      if (p.recovering && cap > 0) next = Math.min(next, Math.max(p.credits, cap));
      p.credits = p.storage > 0 && next > p.storage ? Math.max(p.credits, p.storage) : next;
      p.stats.harvested += each;
    }
    if (u.cargo === 0) { u.cargoValue = 0; ref.dockedBy = 0; u.hstate = 'seek'; u.path = []; }
  }

  /**
   * Where a harvester stands to unload: the refinery's own pad, or the closest clear cell
   * to it when the pad is built over, walled in or otherwise unreachable.
   */
  private dockCell(ref: Entity, def: UnitDef): number {
    const r = this.pack.structures[ref.type].refinery!;
    const pad = this.cellIndex(ref.cx + r.dockX, ref.cy + r.dockY);
    const cls = this.moveClass(def);
    if (passable(this.pack, this.map, pad, cls)) return pad;
    return nearestCell(this.map, pad, 4, i => passable(this.pack, this.map, i, cls));
  }

  /** The refinery a harvester is using, or the nearest one its owner has. */
  private nearestRefinery(u: Entity): Entity | undefined {
    const docked = this.entities.get(u.dock);
    if (docked && docked.hp > 0 && docked.owner === u.owner && docked.kind === 'structure' && this.structDef(docked).refinery) return docked;
    let ref: Entity | undefined, best = Infinity;
    for (const e of this.entities.values()) {
      if (e.owner !== u.owner || e.kind !== 'structure' || e.hp <= 0 || !this.pack.structures[e.type].refinery) continue;
      const d = dist(u.x, u.y, e.x, e.y);
      if (d < best) { best = d; ref = e; }
    }
    return ref;
  }

  // ---------------------------------------------------------------- structures

  private structureThink(s: Entity) {
    const def = this.structDef(s);
    const p = this.players[s.owner];
    if (s.repairing && p && s.hp < s.maxHp && this.tick % 3 === 0) {
      const heal = Math.max(1, Math.floor(s.maxHp / 100));
      const cost = Math.max(1, Math.floor((def.cost * heal) / (s.maxHp * 4)));
      if (p.credits >= cost) { p.credits -= cost; s.hp = Math.min(s.maxHp, s.hp + heal); } else s.repairing = false;
      if (s.hp >= s.maxHp) s.repairing = false;
    }
    if (def.repairPad && p && this.tick % 6 === 0) this.servicePad(s, p);
    const sw = this.superweaponOf(s);
    if (sw && s.charge < this.chargeFor(sw) && !this.lowPower(s.owner)) s.charge++;
    if (s.cooldown > 0) s.cooldown--;
    const w = def.weapon ? this.pack.weapons[def.weapon] : undefined;
    if (!w || def.needsPower && this.lowPower(s.owner)) return;
    let t = this.entities.get(s.target);
    if (!t || t.hp <= 0 || !this.isEnemy(s.owner, t.owner) || !this.inRange(s, t, w)) {
      t = (this.tick + s.id) % 6 === 0 ? this.acquire(s, w.range, w) : undefined;
      s.target = t?.id ?? 0;
    }
    if (t) this.aimAndFire(s, t, w);
  }

  /** Service Depot / Repair Pad: mends vehicles parked beside it and evicts terror drones. */
  private servicePad(s: Entity, p: Player) {
    for (const u of this.entities.values()) {
      if (u.kind !== 'unit' || u.owner !== s.owner || u.hp <= 0 || u.carriedBy || u.path.length) continue;
      const kind = this.unitDef(u).kind;
      if (kind === 'infantry' || kind === 'aircraft' || this.distTo(u.x, u.y, s) > REACH) continue;
      if (u.drone) { const d = this.entities.get(u.drone); if (d) this.damage(d, d.hp, s.owner); u.drone = 0; }
      if (u.hp >= u.maxHp) continue;
      const heal = Math.max(1, Math.floor(u.maxHp / 40));
      const cost = Math.max(1, Math.floor((this.unitDef(u).cost * heal) / (u.maxHp * 4)));
      if (p.credits < cost) break;
      p.credits -= cost; u.hp = Math.min(u.maxHp, u.hp + heal);
      if (this.tick % 30 === 0) this.effect('repairFx', u.x, u.y, 0, 0, 10);
    }
  }

  // ---------------------------------------------------------------- mechanics

  private mechanics() {
    const m = this.pack.mechanics;
    // Renewal scales both kinds of regrowth: the setting is a rate, so a higher number is a
    // shorter wait between units growing back. 0 stops renewal entirely.
    if (this.renewal > 0) {
      if (m.regrowth && this.tick % this.renewEvery(m.regrowth.everyTicks) === 0) this.regrow(m.regrowth.amount, m.regrowth.spreadChance);
      this.pack.resources.forEach((r, k) => { if (r.regrowEvery && this.tick % this.renewEvery(r.regrowEvery) === 0) this.regrowFields(k + 1); });
    }
    if (m.bloom && this.tick % m.bloom.everyTicks === 0) this.bloom(m.bloom.radius, m.bloom.resource);
    if (m.sandworm && this.wormRate > 0) this.sandworms(m.sandworm);
    this.crateTick();
  }

  /** Ticks between one unit of a resource growing back, at this match's renewal setting. */
  private renewEvery(base: number) { return Math.max(15, Math.trunc((base * RENEWAL_CLASSIC) / this.renewal)); }

  /** Ticks a superweapon needs to charge here: the setting speeds every power up together. */
  chargeFor(sw: SuperweaponDef) { return Math.max(1, Math.trunc((sw.charge * 100) / this.superCharge)); }

  // ---------------------------------------------------------------- bonus crates

  private crateTick() {
    if (!this.crateRate) return;
    const every = Math.max(60, Math.trunc((CRATE_EVERY * 100) / this.crateRate));
    const most = Math.max(1, Math.trunc((this.players.length * this.crateRate) / 100));
    if (this.tick === 0 || this.tick % every !== 0 || this.crates.length >= most) return;
    for (let attempt = 0; attempt < 50; attempt++) {
      const cell = this.rng.int(this.map.w * this.map.h);
      if (!passable(this.pack, this.map, cell, 'vehicle') || this.map.resKind[cell]) continue;
      if (this.crates.some(c => c.cell === cell) || this.unitInCell(cell)) continue;
      const x = cell % this.map.w, y = Math.floor(cell / this.map.w);
      if (this.map.starts.some(st => Math.abs(st.x - x) < 6 && Math.abs(st.y - y) < 6)) continue;
      const hooked = this.hooks.crateKind?.(this);
    this.crates.push({ id: this.nextId++, cell, kind: hooked ?? CRATE_KINDS[this.rng.int(CRATE_KINDS.length)] });
      return;
    }
  }

  /** A ground unit standing on a crate opens it. */
  private collectCrates() {
    // PW24: salvage crates decay on their own clock, collector or not.
    if (this.crates.some(c => c.expiresTick !== undefined && c.expiresTick <= this.tick)) {
      this.crates = this.crates.filter(c => c.expiresTick === undefined || c.expiresTick > this.tick);
    }
    if (!this.crates.length) return;
    for (const e of this.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.carriedBy || this.isAircraft(e) || e.owner < 0) continue;
      const at = this.crates.findIndex(c => c.cell === this.cellOf(e));
      if (at < 0) continue;
      const [crate] = this.crates.splice(at, 1);
      this.openCrate(crate, e);
    }
  }

  private openCrate(crate: Crate, finder: Entity) {
    const p = this.players[finder.owner];
    if (!p) return;
    const x = cellCenter(crate.cell % this.map.w), y = cellCenter(Math.floor(crate.cell / this.map.w));
    const fx = this.effect('delivery', x, y, 0, 0, 30);
    fx.owner = finder.owner; fx.item = crate.kind;
    switch (crate.kind) {
      case 'money':
        p.credits += 1000;
        break;
      case 'heal':
        // Patches up everything the finder has nearby, and the finder itself.
        for (const e of this.entities.values()) {
          if (e.owner !== finder.owner || e.hp <= 0 || dist(e.x, e.y, x, y) > LEPTONS * 5) continue;
          e.hp = e.maxHp;
        }
        break;
      case 'veteran':
        if (finder.rank < 2) { finder.rank++; finder.xp = this.unitDef(finder).cost * (this.pack.veterancy?.elite ?? 4); }
        else p.credits += 500;
        break;
      case 'reveal':
        this.reveals.push({ owner: finder.owner, x, y, r: Math.max(this.map.w, this.map.h), until: this.tick + 450 });
        break;
      case 'salvage': {
        // PW24: credit crates pay out directly; the runner audits the spawn.
        const value = crate.value ?? 0;
        p.credits += value;
        this.salvageEvents.push({
          tick: this.tick, cell: crate.cell, credits: value, kind: 'collect', simId: 0,
          victimOwner: -1, collectorOwner: finder.owner, killerOwner: -1,
          victimType: '', victimKind: '',
        });
        break;
      }
      case 'unit': {
        // A crew is already aboard: the free unit is whatever this side rolls out first.
        const faction = this.pack.factions.find(f => f.id === p.faction);
        const type = (faction ? this.startUnitsFor(faction) : []).find(t => !this.pack.units[t]?.deploysTo) ?? Object.keys(this.pack.units)[0];
        const spot = nearestCell(this.map, crate.cell, 4, i => passable(this.pack, this.map, i, this.moveClass(this.pack.units[type])) && !this.unitInCell(i));
        if (spot >= 0) this.spawnUnit(type, finder.owner, spot);
        break;
      }
    }
  }

  private regrow(amount: number, spreadChance: number) {
    const { w, h } = this.map;
    for (let i = 0; i < w * h; i++) {
      const kind = this.map.resKind[i];
      if (!kind || !this.pack.resources[kind - 1].regrows) continue;
      const max = this.pack.resources[kind - 1].max;
      if (this.map.res[i] < max) this.map.res[i] = Math.min(max, this.map.res[i] + amount);
      if (this.rng.int(1000) < spreadChance) {
        const n = [i - 1, i + 1, i - w, i + w][this.rng.int(4)];
        if (n >= 0 && n < w * h && !this.map.resKind[n] && !this.map.occupied[n] && buildableTerrain(this.pack, this.map, n) && terrainPassable(this.pack, this.map, n, 'vehicle')) {
          this.map.resKind[n] = kind; this.map.res[n] = 1;
        }
      }
    }
  }

  /** Mined-out cells of the map's original fields slowly grow back to their starting amount. */
  private regrowFields(kind: number) {
    const { resHome, resCap, res, resKind, occupied } = this.map;
    for (let i = 0; i < res.length; i++) {
      if (resHome[i] !== kind || res[i] >= resCap[i] || occupied[i] || resKind[i] && resKind[i] !== kind) continue;
      res[i]++;
      resKind[i] = kind;
    }
  }

  private bloom(radius: number, resource: string) {
    const { w, h } = this.map;
    const kind = resourceIndex(this.pack, resource) + 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = 4 + this.rng.int(w - 8), y = 4 + this.rng.int(h - 8);
      const i = y * w + x;
      if (!this.pack.terrains[this.map.terrain[i]].sand || this.map.resKind[i]) continue;
      if (this.map.starts.some(s => Math.abs(s.x - x) < 8 && Math.abs(s.y - y) < 8)) continue;
      const max = this.pack.resources[kind - 1].max;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const cx = x + dx, cy = y + dy;
        if (!inBounds(this.map, cx, cy) || dx * dx + dy * dy > radius * radius) continue;
        const c = cy * w + cx;
        if (!this.pack.terrains[this.map.terrain[c]].sand || this.map.occupied[c]) continue;
        this.map.resKind[c] = kind;
        this.map.res[c] = Math.max(this.map.res[c], Math.floor((max * (radius + 1 - Math.max(Math.abs(dx), Math.abs(dy)))) / (radius + 1)));
      }
      this.effect('bloom', cellCenter(x), cellCenter(y), 0, 0, 30);
      return;
    }
  }

  /** Stretch (or shrink) a worm's time underground by the match's activity setting. */
  private wormDelay(ticks: number) { return Math.max(1, Math.trunc((ticks * 100) / this.wormRate)); }

  /** How many worms roam at this match's activity setting (always at least one while worms are on). */
  private wormCount(cfg: NonNullable<RulePack['mechanics']['sandworm']>) {
    return Math.max(1, Math.round((cfg.count * this.wormRate) / 100));
  }

  /** How long a worm prowls before diving again: busier settings keep it up for longer. */
  private wormStint() { return Math.max(150, Math.trunc((600 * this.wormRate) / 100) + 300); }

  private sandworms(cfg: NonNullable<RulePack['mechanics']['sandworm']>) {
    if (this.tick < this.wormDelay(cfg.appearAfter)) return;
    // Where worms can go: sand by default; fusions can let them swim (habitat includes water).
    const habitat = cfg.habitat ? new Set(cfg.habitat.map(id => this.pack.terrains.findIndex(t => t.id === id))) : null;
    const formOf = (t: number) => {
      const id = this.pack.terrains[t]?.id;
      return (id && cfg.form?.[id]) || '';
    };
    const formsOnMap = (): string[] => {
      if (!cfg.form) return [];
      const seen: string[] = [];
      for (const t of this.map.terrain) {
        const f = formOf(t);
        if (f && !seen.includes(f)) seen.push(f);
      }
      return seen;
    };
    const isSand = (worm: Worm, x: number, y: number) => {
      const cx = toCell(x), cy = toCell(y);
      if (!inBounds(this.map, cx, cy)) return false;
      const t = this.map.terrain[cy * this.map.w + cx];
      if (worm.form && worm.form !== 'worm' && cfg.form) return formOf(t) === worm.form;
      return habitat ? habitat.has(t) : !!this.pack.terrains[t].sand;
    };
    // Resource cells worms are drawn to (fields as they were made, so worms keep circling mined-out ground).
    const lure = cfg.nearResources ? this.wormLures() : [];
    const nearLure = () => {
      // Pick a field (an 8x8 block of resource cells) first, so small fields get as many visits
      // as the big one, then a cell in it.
      const block = lure[this.rng.int(lure.length)];
      const c = block[this.rng.int(block.length)], r = cfg.nearResources!;
      return { x: cellCenter((c % this.map.w) + this.rng.int(r * 2 + 1) - r), y: cellCenter(Math.floor(c / this.map.w) + this.rng.int(r * 2 + 1) - r) };
    };
    while (this.worms.length < this.wormCount(cfg)) {
      const available = formsOnMap();
      const form = available.length ? available[this.worms.length % available.length] : 'worm';
      this.worms.push({ id: this.nextId++, x: 0, y: 0, px: 0, py: 0, target: 0, hidden: 1 + this.worms.length * 45, hp: 0, facing: 0, wander: 0, goal: -1, up: 0, form });
    }
    for (const worm of this.worms) {
      worm.px = worm.x; worm.py = worm.y;
      if (worm.hidden) {
        if (--worm.hidden > 0) continue;
        // Surface somewhere in the worm's habitat (near a resource field if it is drawn to them).
        for (let attempt = 0; attempt < 60; attempt++) {
          const spot = lure.length ? nearLure() : { x: cellCenter(this.rng.int(this.map.w)), y: cellCenter(this.rng.int(this.map.h)) };
          const { x, y } = spot;
          if (isSand(worm, x, y) && !this.map.starts.some(s => dist(cellCenter(s.x), cellCenter(s.y), x, y) < 10 * LEPTONS)) {
            worm.x = worm.px = x; worm.y = worm.py = y; worm.hp = 1000; worm.target = 0; worm.wander = 0; worm.up = 0; break;
          }
        }
        if (worm.hp <= 0) worm.hidden = 30;
        continue;
      }
      if (worm.hp <= 0) { worm.hidden = this.wormDelay(600); this.effect('wormDive', worm.x, worm.y, 0, 0, 20); continue; }
      let prey = this.entities.get(worm.target);
      // Worms do not prowl for ever: a stint on the surface ends in a dive, and the time
      // spent under is what the activity setting stretches or shortens.
      if (!prey && ++worm.up > this.wormStint()) {
        worm.hidden = this.wormDelay(600 + this.rng.int(600));
        worm.up = 0; worm.target = 0; worm.goal = -1;
        this.effect('wormDive', worm.x, worm.y, 0, 0, 20);
        continue;
      }
      if (!prey || prey.hp <= 0 || prey.kind !== 'unit' || prey.carriedBy || !isSand(worm, prey.x, prey.y)) {
        prey = undefined; worm.target = 0;
        if ((this.tick + worm.id) % 10 === 0) {
          let best = cfg.sight * LEPTONS;
          for (const e of this.entities.values()) {
            if (e.kind !== 'unit' || e.hp <= 0 || e.carriedBy || this.isAircraft(e) || !isSand(worm, e.x, e.y)) continue;
            // A thumping Thumper draws worms from anywhere on the map.
            const d = this.unitDef(e).lure && e.deployed ? 0 : dist(worm.x, worm.y, e.x, e.y);
            if (d < best) { best = d; prey = e; }
          }
          if (prey) worm.target = prey.id;
        }
      }
      let tx: number, ty: number;
      if (prey) { tx = prey.x; ty = prey.y; } else if (lure.length) {
        // Prowl from field to field.
        if (worm.goal < 0 || dist(worm.x, worm.y, cellCenter(worm.goal % this.map.w), cellCenter(Math.floor(worm.goal / this.map.w))) < LEPTONS * 2 || this.tick % 450 === worm.id % 450) {
          // Mostly field to field; a third of the time, out across open habitat (the sea).
          let g = nearLure();
          if (this.rng.int(3) === 0) for (let k = 0; k < 20; k++) {
            const x = cellCenter(this.rng.int(this.map.w)), y = cellCenter(this.rng.int(this.map.h));
            if (isSand(worm, x, y)) { g = { x, y }; break; }
          }
          worm.goal = this.cellIndex(toCell(g.x), toCell(g.y));
        }
        tx = cellCenter(worm.goal % this.map.w); ty = cellCenter(Math.floor(worm.goal / this.map.w));
      } else {
        if (!worm.wander || this.tick % 90 === 0) worm.wander = this.rng.int(256);
        tx = worm.x + (((worm.wander & 15) - 8) * LEPTONS); ty = worm.y + (((worm.wander >> 4) - 8) * LEPTONS);
      }
      const d = dist(worm.x, worm.y, tx, ty);
      if (prey && d < LEPTONS) {
        const raid = !!cfg.raid?.includes(worm.form);
        const amount = cfg.formDamage?.[worm.form] ?? cfg.damage;
        if (!raid && this.rng.chance(cfg.eatChance)) this.damage(prey, prey.hp, -1);
        else this.damage(prey, amount, -1);
        const fx = this.effect('wormEat', prey.x, prey.y, 0, 0, 30);
        fx.item = worm.form || 'worm';
        worm.hidden = this.wormDelay(450 + this.rng.int(300));
        continue;
      }
      if (d > 0) {
        const nx = worm.x + Math.trunc(((tx - worm.x) * Math.min(cfg.speed, d)) / d);
        const ny = worm.y + Math.trunc(((ty - worm.y) * Math.min(cfg.speed, d)) / d);
        if (isSand(worm, nx, ny)) { worm.facing = facingTo(nx - worm.x, ny - worm.y); worm.x = nx; worm.y = ny; } else { worm.wander = this.rng.int(256); worm.goal = -1; }
      }
    }
  }

  private lures: number[][] | null = null;
  /** The map's original resource fields as 8x8 blocks of cells (computed once). */
  private wormLures(): number[][] {
    if (!this.lures) {
      const blocks = new Map<number, number[]>();
      this.map.resHome.forEach((k, i) => {
        if (!k) return;
        const key = ((i % this.map.w) >> 3) * 1024 + (Math.floor(i / this.map.w) >> 3);
        blocks.set(key, [...(blocks.get(key) ?? []), i]);
      });
      this.lures = [...blocks.keys()].sort((a, b) => a - b).map(k => blocks.get(k)!);
    }
    return this.lures;
  }

  // ---------------------------------------------------------------- fog, cleanup, victory

  private updateFog() {
    const { w, h } = this.map;
    // Gap Generators: each cell records, as bits, the teams shrouding it.
    let gap: Uint8Array | null = null;
    for (const e of this.entities.values()) {
      if (e.kind !== 'structure' || e.hp <= 0) continue;
      const r = this.structDef(e).gap;
      if (!r || this.lowPower(e.owner)) continue;
      const field = gap ??= new Uint8Array(w * h);
      const bit = 1 << ((this.players[e.owner]?.team ?? 0) & 7);
      this.disc(toCell(e.x), toCell(e.y), r, i => { field[i] |= bit; });
    }
    for (const p of this.players) p.visible.fill(0);
    for (const e of this.entities.values()) {
      if (e.hp <= 0) continue;
      const p = this.players[e.owner];
      if (!p) continue;
      const mine = 1 << (p.team & 7);
      this.disc(toCell(e.x), toCell(e.y), this.sightOf(e), (i, d2) => {
        // Inside an enemy gap field, eyes reach only the next cell.
        if (gap && (gap[i] & ~mine) && d2 > 2) return;
        p.visible[i] = 1; p.explored[i] = 1;
      });
    }
    this.reveals = this.reveals.filter(r => r.until > this.tick);
    for (const r of this.reveals) {
      const p = this.players[r.owner];
      if (p) this.disc(toCell(r.x), toCell(r.y), r.r, i => { p.visible[i] = 1; p.explored[i] = 1; });
    }
    for (const e of this.entities.values()) {
      if (e.kind !== 'structure' || e.hp <= 0) continue;
      const def = this.structDef(e);
      const p = this.players[e.owner];
      if (!p || !(def.satellite || def.sensor) || this.lowPower(e.owner)) continue;
      if (def.satellite) p.explored.fill(1);
      if (def.sensor) {
        const r = def.sensor * LEPTONS;
        for (const u of this.entities.values()) if (u.kind === 'unit' && u.hp > 0 && this.isEnemy(e.owner, u.owner) && dist(e.x, e.y, u.x, u.y) <= r) p.visible[this.cellOf(u)] = 1;
      }
    }
    if (gap) for (const p of this.players) {
      const mine = 1 << (p.team & 7);
      for (let i = 0; i < w * h; i++) if ((gap[i] & ~mine) && !p.visible[i]) p.explored[i] = 0;
    }
  }

  /** Visit every cell of a disc; the callback gets the cell and its squared distance. */
  private disc(cx: number, cy: number, r: number, fn: (i: number, d2: number) => void) {
    const { w, h } = this.map;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      const span = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      for (let x = Math.max(0, cx - span); x <= Math.min(w - 1, cx + span); x++) fn(y * w + x, (x - cx) * (x - cx) + dy * dy);
    }
  }

  private removeEntity(e: Entity, died: boolean) {
    if (e.kind === 'structure') {
      for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) {
        const i = y * this.map.w + x;
        if (this.map.occupied[i] === e.id) this.map.occupied[i] = 0;
      }
      const p = this.players[e.owner];
      const def = this.pack.structures[e.type];
      if (p && def.storage) p.storage -= def.storage;
      this.powerDirty = true;
      if (died) this.effect('rubble', e.x, e.y, e.w, e.h, 600);
    }
    // Untangle riders: carried cargo falls with its carrier, drones hop out, minds are freed.
    if (e.carrying) { const c = this.entities.get(e.carrying); if (c) { c.carriedBy = 0; this.damage(c, c.hp, -1); } }
    for (const id of e.passengers) { const c = this.entities.get(id); if (c) { c.carriedBy = 0; this.damage(c, c.hp, -1); } }
    if (e.drone) { const d = this.entities.get(e.drone); if (d) d.carriedBy = 0; }
    if (e.carriedBy) {
      const c = this.entities.get(e.carriedBy);
      if (c) { if (c.drone === e.id) c.drone = 0; if (c.carrying === e.id) c.carrying = 0; c.passengers = c.passengers.filter(id => id !== e.id); }
    }
    if (e.controls) {
      const v = this.entities.get(e.controls);
      if (v && v.hp > 0 && !v.convertedUntil && v.owner !== v.originalOwner) {
        v.owner = v.originalOwner; v.order = 'idle'; v.target = 0; v.path = [];
        this.effect('convert', v.x, v.y, 0, 0, 20);
      }
    }
    if (died) this.maybeSalvage(e);
    this.entities.delete(e.id);
  }

  /**
   * PW24 (COMRADE 18 §3.9): a destroyed unit or building drops a salvage crate
   * worth a share of its build cost, collectable by anyone, decaying after the
   * configured time. Sold buildings never reach here with died=true; packed
   * carriers carry the packed structure's cost. The anti-snowball floor
   * suppresses crates when the victim's in-sim power score is far below the
   * killer's — the same rule the ladder applies to points.
   */
  private maybeSalvage(e: Entity) {
    const cfg = this.salvageConfig();
    if (!cfg || e.owner < 0) return;
    const by = e.deadBy ?? -1;
    if (by < 0 || by === e.owner) return;
    const def = e.kind === 'unit' ? this.unitDef(e) : this.structDef(e);
    const value = Math.floor(((def?.cost ?? 0) * cfg.percentOfCost) / 100);
    if (value <= 0) return;
    if (cfg.scoreWeights && cfg.mismatchFloorRatio > 0) {
      const atk = this.players[by], vic = this.players[e.owner];
      if (atk && vic) {
        const w = cfg.scoreWeights;
        const score = (p: Player) => {
          const t = this.assetTotals(p);
          return t.structureCost * w.structure + t.unitCost * w.unit + t.techLevels * w.tech;
        };
        if (score(vic) < score(atk) * cfg.mismatchFloorRatio) return;
      }
    }
    const cell = e.kind === 'structure'
      ? e.cy * this.map.w + e.cx
      : this.cellOf(e);
    const near = nearestCell(this.map, cell, 4,
      i => passable(this.pack, this.map, i, 'infantry') && !this.unitInCell(i));
    const spot = near >= 0 ? near : cell;
    this.crates.push({
      id: this.nextId++, cell: spot, kind: 'salvage', value,
      expiresTick: cfg.decaySeconds > 0 ? this.tick + Math.round(cfg.decaySeconds * 15) : undefined,
    });
    this.salvageEvents.push({
      tick: this.tick, cell: spot, credits: value, kind: 'spawn', simId: e.id,
      victimOwner: e.owner, collectorOwner: -1, killerOwner: by,
      victimType: e.type, victimKind: e.kind,
    });
  }

  private cleanup() {
    for (const e of [...this.entities.values()]) if (e.hp <= 0) this.removeEntity(e, true);
  }

  private defeat(p: Player) {
    if (p.defeated) return;
    p.defeated = true;
    for (const e of this.entities.values()) if (e.owner === p.slot && e.hp > 0) { this.damage(e, e.hp, -1, 0, true); }
  }

  private checkVictory() {
    for (const p of this.players) {
      if (p.defeated) continue;
      let alive = false;
      for (const e of this.entities.values()) {
        if (e.owner !== p.slot || e.hp <= 0) continue;
        if (e.kind === 'structure' ? !this.structDef(e).wall : !this.unitDef(e).harvester) { alive = true; break; }
      }
      if (!alive) this.defeat(p);
    }
    const teams = new Set(this.players.filter(p => !p.defeated).map(p => p.team));
    if (teams.size <= 1 && this.players.length > 1) { this.over = true; this.winnerTeam = teams.size ? [...teams][0] : -1; }
  }

  // ---------------------------------------------------------------- superweapons

  /** The superweapon a structure carries for its owner's faction, if any. */
  superweaponOf(e: Entity): SuperweaponDef | undefined {
    if (e.kind !== 'structure') return undefined;
    const sw = this.pack.structures[e.type]?.superweapon;
    const p = this.players[e.owner];
    if (!sw || !p) return undefined;
    return (Array.isArray(sw) ? sw : [sw]).find(d => factionCanUse(d, p.faction, p.side));
  }

  private launchSuper(p: Player, id: number, x: number, y: number, x2?: number, y2?: number) {
    const s = this.entities.get(id);
    if (!s || s.owner !== p.slot || s.hp <= 0) return;
    // PW11: a newcomer under setup protection cannot launch superweapons.
    if (this.persistent && p.newcomerProtected) return;
    // PW12: a recovery-protected structure cannot launch either.
    if (this.persistent && s.recoveryProtected) return;
    const sw = this.superweaponOf(s);
    if (!sw || s.charge < this.chargeFor(sw)) return;
    if (sw.kind === 'chrono' && (x2 === undefined || y2 === undefined)) return;
    // PW10: superweapons cannot target inside an enemy compound's active shield.
    if (this.persistent && this.mmo?.shieldRadiusCells) {
      const cx = (v: number) => cellCenter(Math.max(0, Math.min(this.map.w - 1, v)));
      const cy = (v: number) => cellCenter(Math.max(0, Math.min(this.map.h - 1, v)));
      const pts: [number, number][] = [[cx(x), cy(y)]];
      if (x2 !== undefined && y2 !== undefined) pts.push([cx(x2), cy(y2)]);
      for (const c of this.shieldCompounds()) {
        if (p.slot === c.owner || !this.isEnemy(p.slot, c.owner)) continue;
        if (pts.some(([px, py]) => this.pointInCompound(px, py, c))) return;
      }
    }
    s.charge = 0;
    const cx = (v: number) => cellCenter(Math.max(0, Math.min(this.map.w - 1, v)));
    const cy = (v: number) => cellCenter(Math.max(0, Math.min(this.map.h - 1, v)));
    const tx = cx(x), ty = cy(y);
    const tag = (fx: Effect) => { fx.owner = p.slot; fx.item = sw.id; fx.color = sw.name; return fx; };
    const base = { tick: this.tick + sw.delay, owner: p.slot, damage: sw.damage, radius: sw.radius, name: sw.name };
    switch (sw.kind) {
      case 'storm': {
        const duration = sw.duration ?? 200, count = sw.strikes ?? 20;
        tag(this.effect('stormClouds', tx, ty, sw.radius, 0, sw.delay + duration));
        for (let k = 0; k < count; k++) {
          // Integer scatter inside the storm's square (deterministic, no trigonometry).
          const bx = tx + this.rng.int(sw.radius * 2) - sw.radius, by = ty + this.rng.int(sw.radius * 2) - sw.radius;
          this.strikes.push({ ...base, tick: this.tick + sw.delay + Math.floor((k * duration) / count), x: bx, y: by, radius: sw.boltRadius ?? 384, kind: 'bolt' });
        }
        break;
      }
      case 'missile': case 'ion':
        tag(this.effect(sw.kind === 'missile' ? 'superLaunch' : 'ionCharge', s.x, s.y, tx, ty, sw.delay));
        if (sw.kind === 'missile') tag(this.effect('superIncoming', tx, ty, s.x, s.y, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, kind: sw.kind });
        break;
      case 'laser':
        tag(this.effect('laserCharge', s.x, s.y, tx, ty, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, x2: s.x, y2: s.y, kind: 'laser' });
        break;
      case 'tractor':
        tag(this.effect('tractorCharge', s.x, s.y, tx, ty, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, x2: s.x, y2: s.y, kind: 'tractor', duration: sw.duration ?? 450 });
        break;
      case 'shield':
        tag(this.effect('shieldCharge', tx, ty, sw.radius, 0, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, kind: 'shield', duration: sw.duration ?? 300 });
        break;
      case 'paradrop': case 'reinforce': {
        // Paratroopers and Fremen arrive at the target; the Ordos Saboteur walks out of the palace.
        const at = sw.atBase ? this.cellIndex(s.cx + (s.w >> 1), s.cy + s.h) : this.cellIndex(toCell(tx), toCell(ty));
        const dx = cellCenter(at % this.map.w), dy = cellCenter(Math.floor(at / this.map.w));
        tag(this.effect(sw.kind, dx, dy, s.x, s.y, sw.delay));
        this.strikes.push({ ...base, x: dx, y: dy, kind: 'drop', units: sw.units ?? [] });
        break;
      }
      case 'chrono': {
        const ex = cx(x2!), ey = cy(y2!);
        tag(this.effect('chronoCharge', tx, ty, ex, ey, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, x2: ex, y2: ey, kind: 'chrono' });
        break;
      }
      case 'reveal':
        tag(this.effect('spyPlane', tx, ty, s.x, s.y, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, kind: 'reveal', duration: sw.duration ?? 450 });
        break;
      case 'curtain':
        tag(this.effect('curtainCharge', tx, ty, sw.radius, 0, sw.delay));
        this.strikes.push({ ...base, x: tx, y: ty, kind: 'curtain', duration: sw.duration ?? 450 });
        break;
    }
  }

  private resolveStrikes() {
    if (!this.strikes.length) return;
    const due = this.strikes.filter(s => s.tick <= this.tick);
    if (!due.length) return;
    this.strikes = this.strikes.filter(s => s.tick > this.tick);
    for (const s of due) {
      if (s.kind === 'drop') { this.dropUnits(s); continue; }
      if (s.kind === 'chrono') { this.chronoShift(s); continue; }
      if (s.kind === 'curtain') { this.ironCurtain(s); continue; }
      if (s.kind === 'shield') { this.planetaryShield(s); continue; }
      if (s.kind === 'tractor') { this.tractorHold(s); continue; }
      if (s.kind === 'reveal') { this.reveals.push({ owner: s.owner, x: s.x, y: s.y, r: Math.ceil(s.radius / LEPTONS), until: this.tick + (s.duration ?? 450) }); continue; }
      const fx = this.effect(
        s.kind === 'missile' ? 'nuke' : s.kind === 'ion' ? 'ionStrike' : s.kind === 'laser' ? 'laserStrike' : 'lightning',
        s.kind === 'laser' && s.x2 !== undefined ? s.x2 : s.x,
        s.kind === 'laser' && s.y2 !== undefined ? s.y2 : s.y,
        s.kind === 'laser' ? s.x : s.radius,
        s.kind === 'laser' ? s.y : 0,
        s.kind === 'bolt' ? 12 : s.kind === 'ion' ? 45 : s.kind === 'laser' ? 55 : 90,
      );
      fx.owner = s.owner; fx.color = s.name;
      for (const e of this.entities.values()) {
        if (e.hp <= 0 || e.carriedBy) continue;
        const d = this.distTo(s.x, s.y, e);
        if (d >= s.radius) continue;
        // Full damage at the centre, a quarter at the edge.
        this.damage(e, Math.max(1, Math.floor((s.damage * (s.radius - Math.floor((d * 3) / 4))) / s.radius)), s.owner);
      }
      for (const worm of this.worms) if (!worm.hidden && dist(s.x, s.y, worm.x, worm.y) < s.radius) worm.hp -= s.damage;
    }
  }

  private dropUnits(s: Strike) {
    const origin = this.cellIndex(toCell(s.x), toCell(s.y));
    for (const type of s.units ?? []) {
      const def = this.pack.units[type];
      if (!def) continue;
      const cell = nearestCell(this.map, origin, 6, i => passable(this.pack, this.map, i, this.moveClass(def)) && !this.unitInCell(i));
      if (cell < 0) continue;
      // PW10: paradrops and reinforcements cannot materialise inside an active
      // compound shield — the same admission rule as ground entry (owner only).
      if (this.persistent && this.mmo?.shieldRadiusCells) {
        const cx = cellCenter(cell % this.map.w), cy = cellCenter(Math.floor(cell / this.map.w));
        const blocked = this.shieldCompounds().some(c => s.owner !== c.owner && this.pointInCompound(cx, cy, c));
        if (blocked) continue;
      }
      const u = this.spawnUnit(type, s.owner, cell);
      const fx = this.effect('parachute', u.x, u.y, 0, 0, 20); fx.owner = s.owner; fx.item = type;
    }
  }

  /** Chronosphere: vehicles in the circle jump to the same spot around the destination; infantry do not survive it. */
  private chronoShift(s: Strike) {
    const fx1 = this.effect('chronoFlash', s.x, s.y, s.radius, 0, 30); fx1.owner = s.owner;
    const fx2 = this.effect('chronoFlash', s.x2!, s.y2!, s.radius, 0, 30); fx2.owner = s.owner;
    const ox = toCell(s.x), oy = toCell(s.y), dx = toCell(s.x2!), dy = toCell(s.y2!);
    const caught: Entity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === 'unit' && e.hp > 0 && !e.carriedBy && !this.isAircraft(e) && dist(e.x, e.y, s.x, s.y) < s.radius) caught.push(e);
    }
    for (const e of caught) {
      const def = this.unitDef(e);
      if (def.kind === 'infantry') { this.damage(e, e.hp, s.owner); continue; }
      const cxx = toCell(e.x) - ox + dx, cyy = toCell(e.y) - oy + dy;
      const cls = this.moveClass(def);
      const cell = inBounds(this.map, cxx, cyy) ? nearestCell(this.map, this.cellIndex(cxx, cyy), 2, i => passable(this.pack, this.map, i, cls) && !this.unitInCell(i, e.id)) : -1;
      if (cell < 0) { this.damage(e, e.hp, s.owner); continue; }
      // PW10: chronoshift cannot materialise a unit inside a compound shield it
      // does not belong to — same admission rule as walking or paradropping in.
      if (this.persistent && this.mmo?.shieldRadiusCells) {
        const cx = cellCenter(cell % this.map.w), cy = cellCenter(Math.floor(cell / this.map.w));
        if (this.shieldCompounds().some(c => e.owner !== c.owner && this.pointInCompound(cx, cy, c))) continue;
      }
      e.x = e.px = cellCenter(cell % this.map.w); e.y = e.py = cellCenter(Math.floor(cell / this.map.w));
      e.path = []; e.order = 'idle'; e.target = 0;
    }
  }

  /** Iron Curtain: vehicles and buildings become invulnerable; infantry are killed. */
  private ironCurtain(s: Strike) {
    const fx = this.effect('curtain', s.x, s.y, s.radius, 0, s.duration ?? 450); fx.owner = s.owner;
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || e.carriedBy || this.distTo(s.x, s.y, e) >= s.radius) continue;
      if (e.kind === 'unit' && this.unitDef(e).kind === 'infantry') { this.damage(e, e.hp, s.owner); continue; }
      e.invulnUntil = this.tick + (s.duration ?? 450);
    }
  }

  /** Planetary Shield: a dome that protects friendlies, including infantry. */
  private planetaryShield(s: Strike) {
    const fx = this.effect('shield', s.x, s.y, s.radius, 0, s.duration ?? 300); fx.owner = s.owner;
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || e.carriedBy || this.distTo(s.x, s.y, e) >= s.radius) continue;
      if (!this.players[e.owner] || this.isEnemy(s.owner, e.owner)) continue;
      e.invulnUntil = this.tick + (s.duration ?? 300);
    }
  }

  /** Tractor Beam: pull enemy units into the lock and hold them. */
  private tractorHold(s: Strike) {
    const fx = this.effect('tractorHold', s.x2 ?? s.x, s.y2 ?? s.y, s.x, s.y, s.duration ?? 450); fx.owner = s.owner;
    const hold = this.tick + (s.duration ?? 450);
    for (const e of this.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.carriedBy || !this.isEnemy(s.owner, e.owner) || this.distTo(s.x, s.y, e) >= s.radius) continue;
      const def = this.unitDef(e);
      if (this.isAircraft(e)) {
        e.x = e.px = s.x; e.y = e.py = s.y;
      } else {
        const cell = nearestCell(this.map, this.cellIndex(toCell(s.x), toCell(s.y)), 3, i => passable(this.pack, this.map, i, this.moveClass(def)) && !this.unitInCell(i, e.id));
        // PW10: the beam cannot drag a unit into a compound shield it does not own.
        const shieldedCell = cell >= 0 && this.persistent && this.mmo?.shieldRadiusCells
          && this.shieldCompounds().some(c =>
            e.owner !== c.owner && this.pointInCompound(cellCenter(cell % this.map.w), cellCenter(Math.floor(cell / this.map.w)), c));
        if (cell >= 0 && !shieldedCell) { e.x = e.px = cellCenter(cell % this.map.w); e.y = e.py = cellCenter(Math.floor(cell / this.map.w)); }
      }
      e.heldUntil = hold; e.path = []; e.order = 'idle'; e.target = 0;
    }
  }

  /**
   * Quiescent-interval fast-forward (PW22 / COMRADE 18 §2.3). Advances production
   * queues and abstracted harvest income arithmetically — the exact same per-tick
   * production math step() runs, minus everything quiescence guarantees cannot
   * intervene (movement orders, combat, player commands). `rates[slot]` is the
   * measured harvest income in credits per tick, storage-capped exactly like a
   * real refinery delivery. Only valid on a game verified quiescent for the whole
   * interval; the caller journals the interval so replay applies it once.
   */
  fastForwardQuiescent(ticks: number, rates: number[]): void {
    if (!this.persistent) throw new Error('fastForwardQuiescent is persistent-profile only');
    if (ticks <= 0) return;
    const caches = new Map<Player, { factories: Map<QueueKind, Entity[]>; speed: Map<QueueKind, number> }>();
    const remainders = this.players.map(() => 0);
    for (let i = 0; i < ticks; i++) {
      for (let pi = 0; pi < this.players.length; pi++) {
        const p = this.players[pi];
        if (p.defeated) continue;
        const rate = rates[pi] ?? 0;
        if (rate > 0) {
          remainders[pi] += rate;
          const each = Math.floor(remainders[pi]);
          if (each > 0) {
            remainders[pi] -= each;
            // Same delivery accounting as the live harvest path (storage-capped).
            const next = p.credits + each + Math.floor((each * p.incomeBonus) / 100);
            p.credits = p.storage > 0 && next > p.storage ? Math.max(p.credits, p.storage) : next;
            p.stats.harvested += each;
          }
        }
        let cache = caches.get(p);
        if (!cache) { cache = { factories: new Map(), speed: new Map() }; caches.set(p, cache); }
        this.production(p, cache);
        // Supply upkeep parity: slept tick i+1 lands on absolute tick
        // this.tick+i+1, so the per-minute drain fires on the same cadence a
        // live step() would have used across the interval.
        if (this.mmo && (this.tick + i + 1) % SUPPLY_UPKEEP_TICKS === 0) this.mmoUpkeep(p);
        if (p.autoRepair && (this.tick + i + 1) % AUTO_REPAIR_TICKS === 0) this.autoRepairBase(p);
      }
      // Effects are cosmetic and tick-frozen here; keep the same bound step() uses.
      if (this.effects.length > 400) this.effects = this.effects.slice(-300);
    }
  }

  /** Desync detector: identical on every client running the same commands. */
  checksum(): number {
    const h = new Hasher().add(this.tick).add(this.rng.seed);
    for (const p of this.players) h.add(p.credits).add(p.defeated ? 1 : 0);
    h.add(this.market);
    for (const e of this.entities.values()) {
      h.add(e.id).add(e.x).add(e.y).add(e.hp).add(e.owner).add(e.facing).add(e.charge).add(e.xp).add(e.ammo).add(e.carriedBy).add(e.deployed ? 1 : 0).add(e.passengers.length).add(e.heldUntil);
      // Bound assets are persistent-world state; classic entities are all 0, so the
      // classic checksum stream is unchanged.
      if (e.bound) h.add(e.bound);
    }
    for (const s of this.strikes) h.add(s.tick).add(s.x).add(s.y);
    for (const pr of this.projectiles) h.add(pr.x).add(pr.y);
    for (const worm of this.worms) h.add(worm.x).add(worm.y).add(worm.hidden).add(worm.goal).add(worm.up).addString(worm.form);
    for (const crate of this.crates) h.add(crate.cell).add(CRATE_KINDS.indexOf(crate.kind)).add(crate.value ?? 0).add(crate.expiresTick ?? 0);
    return h.value;
  }
}
