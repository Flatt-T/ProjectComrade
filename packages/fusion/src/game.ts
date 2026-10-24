import { Hasher, LEPTONS, Rng, cellCenter, dist, facingDelta, facingTo, toCell } from './core';
import { MapData, buildableTerrain, generateMap, inBounds, isWater, passable, resourceIndex, terrainPassable } from './map';
import { findPath, nearestCell } from './path';
import { InfiltrationEffect, MapPreset, MoveClass, QueueKind, RulePack, StructureDef, SuperweaponDef, TargetKind, UnitDef, WeaponDef, factionCanUse, prereqsMet, weaponCanTarget } from './rules';
import { runAI, AIState, AILevel, AI_LEVELS, createAIState } from './ai';

export type Command =
  | { t: 'move'; ids: number[]; x: number; y: number }
  | { t: 'attackMove'; ids: number[]; x: number; y: number }
  | { t: 'attack'; ids: number[]; target: number; force?: boolean }
  | { t: 'fireAt'; ids: number[]; x: number; y: number }
  | { t: 'guard'; ids: number[] }
  | { t: 'scatter'; ids: number[] }
  | { t: 'harvest'; ids: number[]; x: number; y: number }
  | { t: 'stop'; ids: number[] }
  | { t: 'deploy'; ids: number[] }
  /** Engineers capture or repair, spies infiltrate, damaged vehicles visit a repair pad, aircraft land to rearm. */
  | { t: 'enter'; ids: number[]; target: number }
  | { t: 'build'; item: string }
  | { t: 'cancel'; item: string }
  | { t: 'place'; item: string; x: number; y: number }
  | { t: 'sell'; id: number }
  | { t: 'repair'; id: number }
  | { t: 'rally'; x: number; y: number }
  | { t: 'super'; id: number; x: number; y: number; x2?: number; y2?: number }
  | { t: 'surrender' };

export interface PlayerSetup { name: string; faction: string; ai: boolean; team?: number; level?: AILevel }
export type CreditsPreset = 'low' | 'standard' | 'high';
export interface GameSetup {
  pack: RulePack;
  mapId: string;
  seed: number;
  players: PlayerSetup[];
  credits?: CreditsPreset;
  /** 1..15, matching the lobby setting; 15 unlocks everything. */
  techLevel?: number;
  /** Sandworm activity, percent of the pack's base rate (0 = none, default 100). */
  worms?: number;
}

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
  /** Iron Curtain: invulnerable until this tick. */
  invulnUntil: number;
  /** Terror drone inside this vehicle. */
  drone: number;
  /** Tick a Chrono Miner last arrived by teleport (for the fade-in). */
  warp: number;
  /** Units riding inside this transport. */
  passengers: number[];
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
}

export interface Projectile { id: number; owner: number; weapon: string; x: number; y: number; sx: number; sy: number; tx: number; ty: number; target: number; source: number }
/** Visual-only event for the renderer. `item`/`owner` let it draw the right sprite. */
export interface Effect { kind: string; x: number; y: number; x2: number; y2: number; tick: number; dur: number; color?: string; item?: string; owner?: number }
/** A scheduled superweapon impact, resolved deterministically on its tick. */
export interface Strike {
  tick: number; x: number; y: number; owner: number; damage: number; radius: number;
  kind: 'missile' | 'ion' | 'bolt' | 'drop' | 'chrono' | 'curtain' | 'reveal';
  name: string;
  /** Chronosphere destination. */
  x2?: number; y2?: number;
  /** Paradrops and reinforcements. */
  units?: string[];
  /** Iron Curtain length. */
  duration?: number;
}
export interface Worm { id: number; x: number; y: number; px: number; py: number; target: number; hidden: number; hp: number; facing: number; wander: number; /** Prowl destination (cell index), or -1. */ goal: number }

const QUEUES: QueueKind[] = ['structure', 'defense', 'infantry', 'vehicle', 'aircraft', 'naval', 'starport'];
const UPGRADE = 'upgrade:', STARPORT = 'starport:';
/** Arm's length from a building's edge: any cell touching it, diagonals included. */
const REACH = 288;

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
  /** Sandworm activity percent (0 = none): scales how long worms stay under between attacks. */
  readonly wormRate: number;
  private ai: (AIState | null)[] = [];
  readonly mapPreset: MapPreset;

  constructor(setup: GameSetup) {
    this.pack = setup.pack;
    const preset = setup.pack.maps.find(m => m.id === setup.mapId) ?? setup.pack.maps[0];
    this.mapPreset = preset;
    this.map = generateMap(setup.pack, preset, setup.seed);
    this.rng = new Rng(setup.seed);
    this.techCap = Math.ceil(((setup.techLevel ?? 15) * 10) / 15);
    this.wormRate = Math.max(0, Math.min(200, Math.trunc(setup.worms ?? 100)));
    const credits = setup.pack.startCredits[setup.credits ?? 'standard'];
    const size = this.map.w * this.map.h;
    setup.players.slice(0, preset.starts.length).forEach((p, slot) => {
      const faction = setup.pack.factions.find(f => f.id === p.faction) ?? setup.pack.factions[slot % setup.pack.factions.length];
      const queue = (): ProductionQueue => ({ items: [], paid: 0, acc: 0, ready: false, hold: false });
      this.players.push({
        slot, name: p.name, faction: faction.id, side: faction.side, color: faction.color, accent: faction.accent,
        ai: p.ai, team: p.team ?? slot, credits, storage: 0, powerGen: 0, powerUse: 0, defeated: false,
        queues: { structure: queue(), defense: queue(), infantry: queue(), vehicle: queue(), aircraft: queue(), naval: queue(), starport: queue() },
        explored: new Uint8Array(size), visible: new Uint8Array(size), rally: -1,
        stats: { built: 0, lost: 0, killed: 0, harvested: 0 },
        upgrades: {}, blackoutUntil: 0, veteranQueues: [], incomeBonus: 0, costReduction: 0,
      });
      this.ai.push(p.ai ? createAIState(slot, p.level) : null);
      // The MCV sits on the start cell; the escort forms up outside its deploy footprint.
      const start = preset.starts[slot];
      const startCell = start.y * this.map.w + start.x;
      const mcvType = faction.startUnits.find(t => this.pack.units[t].deploysTo);
      const yard = mcvType ? this.pack.structures[this.pack.units[mcvType].deploysTo!] : undefined;
      const fx = start.x - ((yard?.w ?? 1) >> 1), fy = start.y - ((yard?.h ?? 1) >> 1);
      const inFootprint = (i: number) => {
        const x = i % this.map.w, y = Math.floor(i / this.map.w);
        return !!yard && x >= fx - 1 && x <= fx + yard.w && y >= fy - 1 && y <= fy + yard.h;
      };
      if (mcvType) this.spawnUnit(mcvType, slot, startCell);
      faction.startUnits.filter(t => t !== mcvType).forEach(type => {
        const origin = (Math.min(this.map.h - 1, fy + (yard?.h ?? 1) + 1)) * this.map.w + start.x;
        const cell = nearestCell(this.map, origin, 8,
          i => passable(this.pack, this.map, i, this.moveClass(this.pack.units[type])) && !this.unitInCell(i) && !inFootprint(i));
        if (cell >= 0) this.spawnUnit(type, slot, cell);
      });
    });
    this.updateFog();
  }

  // ---------------------------------------------------------------- commands

  /** Queue a command for a future tick (default: the next one). */
  enqueue(slot: number, cmd: Command, atTick = this.tick + 1) {
    const list = this.pending.get(atTick) ?? [];
    list.push({ slot, cmd });
    this.pending.set(atTick, list);
  }

  private apply(slot: number, cmd: Command) {
    const player = this.players[slot];
    if (!player || player.defeated) return;
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
            u.order = 'attack'; u.target = target.id; u.force = !!cmd.force; u.path = []; u.repathTick = 0; u.resume = -1;
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
        for (const u of own(cmd.ids)) if (this.unitDef(u).harvester) { u.order = 'harvest'; u.hstate = 'seek'; u.harvestCell = cell; u.path = []; }
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
            : target.owner === slot && (sdef.repairPad && def.kind !== 'infantry' && def.kind !== 'aircraft' || sdef.airfield && def.kind === 'aircraft');
          if (!ok) continue;
          u.deployed = false;
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
        if (s && s.owner === slot && s.kind === 'structure' && s.hp > 0) {
          const def = this.pack.structures[s.type];
          player.credits += Math.floor((def.cost * this.pack.sellRefundPercent * s.hp) / (100 * s.maxHp));
          const fx = this.effect('sell', s.x, s.y, s.cx, s.cy, 24); fx.item = s.type; fx.owner = s.owner;
          s.hp = 0;
          this.removeEntity(s, false);
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
      if (ai && !p.defeated && (this.tick + p.slot * 5) % AI_LEVELS[ai.level].thinkEvery === 0) runAI(this, p, ai);
    }
    for (const p of this.players) if (p.blackoutUntil && this.tick >= p.blackoutUntil) { p.blackoutUntil = 0; this.powerDirty = true; }
    const market = this.pack.mechanics.market;
    if (market && this.tick % market.every === 0) this.market = market.min + this.rng.int(market.max - market.min + 1);
    if (this.powerDirty) this.updatePower();
    for (const p of this.players) if (!p.defeated) this.production(p);
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
    if (this.tick % 4 === 0) this.updateFog();
    this.cleanup();
    if (this.tick % 15 === 0) this.checkVictory();
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
  targetKind(e: Entity): TargetKind {
    return e.kind === 'structure' ? 'structure' : this.pack.units[e.type].kind;
  }
  /** Can this unit be ordered to attack that target, by weapon or by a special ability? */
  canEngage(u: Entity, t: Entity, kind = this.targetKind(t)): boolean {
    const def = this.unitDef(u);
    if (def.c4 && (kind === 'structure' || !def.weapon)) return true;
    if (def.terror && kind === 'vehicle') return true;
    const w = this.weaponOf(u);
    return !!w && weaponCanTarget(w, kind);
  }
  sightOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].sight : this.pack.structures[e.type].sight; }
  armorOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].armor : this.pack.structures[e.type].armor; }

  private blank(type: string, kind: 'unit' | 'structure', owner: number, x: number, y: number, hp: number): Entity {
    return {
      id: this.nextId++, type, kind, owner, x, y, px: x, py: y, hp, maxHp: hp, facing: 128, turret: 128,
      order: 'idle', path: [], goal: -1, resume: -1, target: 0, cooldown: 0, repathTick: 0,
      hstate: 'seek', cargo: 0, cargoValue: 0, harvestCell: -1, timer: 0, dock: 0,
      cx: 0, cy: 0, w: 1, h: 1, repairing: false, dockedBy: 0, originalOwner: owner, convertedUntil: 0, born: this.tick, exposed: false, charge: 0, force: false, fireCell: -1,
      xp: 0, rank: 0, ammo: 0, deployed: false, disguised: false, stillTicks: 0, carrying: 0, carriedBy: 0, controls: 0, c4At: 0, c4By: -1, invulnUntil: 0, drone: 0, warp: -999, passengers: [],
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
    e.hp = Math.max(1, Math.floor((def.hp * hpPercent) / 100));
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
    return this.players[a]?.team !== this.players[b]?.team;
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

  canBuild(p: Player, item: string, owned = this.owned(p)): boolean {
    const queue = this.queueFor(item);
    if (!queue) return false;
    const base = this.baseItem(item);
    const def: UnitDef | StructureDef | undefined = this.pack.structures[base] ?? this.pack.units[base];
    if (!def || def.tech > this.techCap || !factionCanUse(def, p.faction, p.side)) return false;
    if (item.startsWith(UPGRADE)) {
      // Upgrades are bought once the building stands, up to its number of levels.
      const level = owned.get(base);
      if (level === undefined || level >= ((def as StructureDef).upgrades ?? 0) || p.queues.structure.items.includes(item)) return false;
    } else if (!item.startsWith(STARPORT) && !prereqsMet(def.prereqs, owned)) return false;
    return this.factories(p, queue).length > 0;
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

  private production(p: Player) {
    for (const kind of QUEUES) {
      const q = p.queues[kind];
      if (!q.items.length || q.ready) continue;
      const item = q.items[0];
      const factories = this.factories(p, kind);
      if (!factories.length) continue;
      const cost = this.costOf(item, p);
      let speed = 100 + (factories.length - 1) * this.pack.extraFactoryBonus;
      const ai = this.ai[p.slot];
      if (ai) speed = Math.floor((speed * AI_LEVELS[ai.level].buildPercent) / 100);
      if (p.powerUse > p.powerGen) speed = Math.floor((speed * this.pack.lowPowerProductionPercent) / 100);
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
      // Roll out of the factory the unit actually requires (tanks from the Heavy Factory).
      const named = new Set(def.prereqs.flatMap(r => r.split('|').map(a => a.split('@')[0])));
      const factory = kind === 'starport' ? factories[0] : factories.find(f => named.has(f.type)) ?? factories[0];
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
    this.spawnStructure(def.deploysTo, u.owner, cx, cy, 100);
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
        if (def.ammo) { u.order = 'rearm'; u.dock = 0; u.path = []; return; } // Jets head home after a sortie.
        if (u.resume >= 0 && this.cellOf(u) !== u.resume && u.goal === u.resume) { u.order = 'attackMove'; u.path = this.pathFor(u, u.resume); } else u.order = 'idle';
        return;
      }
      const kind = this.targetKind(t);
      if (def.c4 && (kind === 'structure' || !weapon) || def.terror && kind === 'vehicle') {
        // Hands-on abilities: walk up and plant the charge, or jump inside the vehicle.
        if (this.distTo(u.x, u.y, t) <= (t.kind === 'structure' ? REACH : 160)) { u.path = []; this.contact(u, def, t); return; }
      } else if (weapon && this.inRange(u, t, weapon)) { u.path = []; this.aimAndFire(u, t, weapon); return; }
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
    // Idle and attack-moving units engage what they can see. Jets only strike when ordered,
    // and a thumping Thumper just thumps.
    if (weapon && !def.ammo && (u.order === 'idle' || u.order === 'attackMove') && (this.tick + u.id) % 8 === 0) {
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
    if (d <= step) {
      u.x = tx; u.y = ty; u.path.shift();
      if (def.crusher && def.kind === 'vehicle') this.crush(u, next);
    } else {
      u.x += Math.trunc((dx * step) / d);
      u.y += Math.trunc((dy * step) / d);
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
    u.order = 'idle';
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
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
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
        const origin = u.harvestCell >= 0 ? u.harvestCell : here;
        const cell = nearestCell(this.map, origin, 30, i => this.map.res[i] > 0 && terrainPassable(this.pack, this.map, i, 'vehicle') && !this.map.occupied[i]);
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
      const r = this.pack.structures[ref.type].refinery!;
      const dockCell = this.cellIndex(ref.cx + r.dockX, ref.cy + r.dockY);
      if (h.teleport && this.cellOf(u) !== dockCell) {
        // Chrono Miner: stop and charge up, then jump straight to the refinery pad.
        u.hstate = 'warp'; u.timer = WARP_TICKS; u.path = [];
        this.effect('minerWarp', u.x, u.y, 0, 0, WARP_TICKS);
        return;
      }
      if (this.cellOf(u) === dockCell && u.x === cellCenter(dockCell % this.map.w) && u.y === cellCenter(Math.floor(dockCell / this.map.w))) {
        if (ref.dockedBy && ref.dockedBy !== u.id && this.entities.get(ref.dockedBy)?.hp) return; // Queue for the pad.
        ref.dockedBy = u.id; u.hstate = 'unload'; u.timer = h.unload; u.facing = 64;
        return;
      }
      if (!u.path.length) u.path = this.pathFor(u, dockCell, dockCell);
      if (!u.path.length) { u.dock = 0; return; }
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
      const next = p.credits + each + Math.floor((each * p.incomeBonus) / 100);
      p.credits = p.storage > 0 && next > p.storage ? Math.max(p.credits, p.storage) : next;
      p.stats.harvested += each;
    }
    if (u.cargo === 0) { u.cargoValue = 0; ref.dockedBy = 0; u.hstate = 'seek'; u.path = []; }
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
    if (sw && s.charge < sw.charge && !this.lowPower(s.owner)) s.charge++;
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
    if (m.regrowth && this.tick % m.regrowth.everyTicks === 0) this.regrow(m.regrowth.amount, m.regrowth.spreadChance);
    this.pack.resources.forEach((r, k) => { if (r.regrowEvery && this.tick % r.regrowEvery === 0) this.regrowFields(k + 1); });
    if (m.bloom && this.tick % m.bloom.everyTicks === 0) this.bloom(m.bloom.radius, m.bloom.resource);
    if (m.sandworm && this.wormRate > 0) this.sandworms(m.sandworm);
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

  private sandworms(cfg: NonNullable<RulePack['mechanics']['sandworm']>) {
    if (this.tick < this.wormDelay(cfg.appearAfter)) return;
    // Where worms can go: sand by default; fusions can let them swim (habitat includes water).
    const habitat = cfg.habitat ? new Set(cfg.habitat.map(id => this.pack.terrains.findIndex(t => t.id === id))) : null;
    const isSand = (x: number, y: number) => {
      const cx = toCell(x), cy = toCell(y);
      if (!inBounds(this.map, cx, cy)) return false;
      const t = this.map.terrain[cy * this.map.w + cx];
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
    while (this.worms.length < cfg.count) {
      this.worms.push({ id: this.nextId++, x: 0, y: 0, px: 0, py: 0, target: 0, hidden: 1 + this.worms.length * 45, hp: 0, facing: 0, wander: 0, goal: -1 });
    }
    for (const worm of this.worms) {
      worm.px = worm.x; worm.py = worm.y;
      if (worm.hidden) {
        if (--worm.hidden > 0) continue;
        // Surface somewhere in the worm's habitat (near a resource field if it is drawn to them).
        for (let attempt = 0; attempt < 60; attempt++) {
          const spot = lure.length ? nearLure() : { x: cellCenter(this.rng.int(this.map.w)), y: cellCenter(this.rng.int(this.map.h)) };
          const { x, y } = spot;
          if (isSand(x, y) && !this.map.starts.some(s => dist(cellCenter(s.x), cellCenter(s.y), x, y) < 10 * LEPTONS)) {
            worm.x = worm.px = x; worm.y = worm.py = y; worm.hp = 1000; worm.target = 0; worm.wander = 0; break;
          }
        }
        if (worm.hp <= 0) worm.hidden = 30;
        continue;
      }
      if (worm.hp <= 0) { worm.hidden = this.wormDelay(600); this.effect('wormDive', worm.x, worm.y, 0, 0, 20); continue; }
      let prey = this.entities.get(worm.target);
      if (!prey || prey.hp <= 0 || prey.kind !== 'unit' || prey.carriedBy || !isSand(prey.x, prey.y)) {
        prey = undefined; worm.target = 0;
        if ((this.tick + worm.id) % 10 === 0) {
          let best = cfg.sight * LEPTONS;
          for (const e of this.entities.values()) {
            if (e.kind !== 'unit' || e.hp <= 0 || e.carriedBy || this.isAircraft(e) || !isSand(e.x, e.y)) continue;
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
            if (isSand(x, y)) { g = { x, y }; break; }
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
        if (this.rng.chance(cfg.eatChance)) this.damage(prey, prey.hp, -1); else this.damage(prey, cfg.damage, -1);
        this.effect('wormEat', prey.x, prey.y, 0, 0, 30);
        worm.hidden = this.wormDelay(450 + this.rng.int(300));
        continue;
      }
      if (d > 0) {
        const nx = worm.x + Math.trunc(((tx - worm.x) * Math.min(cfg.speed, d)) / d);
        const ny = worm.y + Math.trunc(((ty - worm.y) * Math.min(cfg.speed, d)) / d);
        if (isSand(nx, ny)) { worm.facing = facingTo(nx - worm.x, ny - worm.y); worm.x = nx; worm.y = ny; } else { worm.wander = this.rng.int(256); worm.goal = -1; }
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
    this.entities.delete(e.id);
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
    const sw = this.superweaponOf(s);
    if (!sw || s.charge < sw.charge) return;
    if (sw.kind === 'chrono' && (x2 === undefined || y2 === undefined)) return;
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
      if (s.kind === 'reveal') { this.reveals.push({ owner: s.owner, x: s.x, y: s.y, r: Math.ceil(s.radius / LEPTONS), until: this.tick + (s.duration ?? 450) }); continue; }
      const fx = this.effect(s.kind === 'missile' ? 'nuke' : s.kind === 'ion' ? 'ionStrike' : 'lightning', s.x, s.y, s.radius, 0, s.kind === 'bolt' ? 12 : s.kind === 'ion' ? 45 : 90);
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

  /** Desync detector: identical on every client running the same commands. */
  checksum(): number {
    const h = new Hasher().add(this.tick).add(this.rng.seed);
    for (const p of this.players) h.add(p.credits).add(p.defeated ? 1 : 0);
    h.add(this.market);
    for (const e of this.entities.values()) h.add(e.id).add(e.x).add(e.y).add(e.hp).add(e.owner).add(e.facing).add(e.charge).add(e.xp).add(e.ammo).add(e.carriedBy).add(e.deployed ? 1 : 0).add(e.passengers.length);
    for (const s of this.strikes) h.add(s.tick).add(s.x).add(s.y);
    for (const pr of this.projectiles) h.add(pr.x).add(pr.y);
    for (const worm of this.worms) h.add(worm.x).add(worm.y).add(worm.hidden).add(worm.goal);
    return h.value;
  }
}
