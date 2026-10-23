import { Hasher, LEPTONS, Rng, cellCenter, dist, facingDelta, facingTo, toCell } from './core';
import { MapData, buildableTerrain, generateMap, inBounds, passable, resourceIndex, terrainPassable } from './map';
import { findPath, nearestCell } from './path';
import { MapPreset, QueueKind, RulePack, StructureDef, UnitDef, WeaponDef, factionCanUse, prereqsMet, weaponCanTarget } from './rules';
import { runAI, AIState, createAIState } from './ai';

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
  | { t: 'build'; item: string }
  | { t: 'cancel'; item: string }
  | { t: 'place'; item: string; x: number; y: number }
  | { t: 'sell'; id: number }
  | { t: 'repair'; id: number }
  | { t: 'rally'; x: number; y: number }
  | { t: 'super'; id: number; x: number; y: number }
  | { t: 'surrender' };

export interface PlayerSetup { name: string; faction: string; ai: boolean; team?: number }
export type CreditsPreset = 'low' | 'standard' | 'high';
export interface GameSetup {
  pack: RulePack;
  mapId: string;
  seed: number;
  players: PlayerSetup[];
  credits?: CreditsPreset;
  /** 1..15, matching the lobby setting; 15 unlocks everything. */
  techLevel?: number;
}

export type OrderKind = 'idle' | 'move' | 'attackMove' | 'attack' | 'attackGround' | 'harvest' | 'deploy';
export type HarvestState = 'seek' | 'gather' | 'toRefinery' | 'unload';

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
}

export interface Projectile { id: number; owner: number; weapon: string; x: number; y: number; sx: number; sy: number; tx: number; ty: number; target: number; source: number }
/** Visual-only event for the renderer. `item`/`owner` let it draw the right sprite. */
export interface Effect { kind: string; x: number; y: number; x2: number; y2: number; tick: number; dur: number; color?: string; item?: string; owner?: number }
/** A scheduled superweapon impact, resolved deterministically on its tick. */
export interface Strike { tick: number; x: number; y: number; owner: number; damage: number; radius: number; kind: 'missile' | 'ion' | 'bolt'; name: string }
export interface Worm { id: number; x: number; y: number; px: number; py: number; target: number; hidden: number; hp: number; facing: number; wander: number }

const QUEUES: QueueKind[] = ['structure', 'defense', 'infantry', 'vehicle'];

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
  over = false;
  winnerTeam = -1;
  private nextId = 1;
  private pending = new Map<number, { slot: number; cmd: Command }[]>();
  private powerDirty = true;
  private techCap: number;
  private ai: (AIState | null)[] = [];
  readonly mapPreset: MapPreset;

  constructor(setup: GameSetup) {
    this.pack = setup.pack;
    const preset = setup.pack.maps.find(m => m.id === setup.mapId) ?? setup.pack.maps[0];
    this.mapPreset = preset;
    this.map = generateMap(setup.pack, preset, setup.seed);
    this.rng = new Rng(setup.seed);
    this.techCap = Math.ceil(((setup.techLevel ?? 15) * 10) / 15);
    const credits = setup.pack.startCredits[setup.credits ?? 'standard'];
    const size = this.map.w * this.map.h;
    setup.players.slice(0, preset.starts.length).forEach((p, slot) => {
      const faction = setup.pack.factions.find(f => f.id === p.faction) ?? setup.pack.factions[slot % setup.pack.factions.length];
      const queue = (): ProductionQueue => ({ items: [], paid: 0, acc: 0, ready: false, hold: false });
      this.players.push({
        slot, name: p.name, faction: faction.id, side: faction.side, color: faction.color, accent: faction.accent,
        ai: p.ai, team: p.team ?? slot, credits, storage: 0, powerGen: 0, powerUse: 0, defeated: false,
        queues: { structure: queue(), defense: queue(), infantry: queue(), vehicle: queue() },
        explored: new Uint8Array(size), visible: new Uint8Array(size), rally: -1,
        stats: { built: 0, lost: 0, killed: 0, harvested: 0 },
      });
      this.ai.push(p.ai ? createAIState(slot) : null);
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
          i => passable(this.pack, this.map, i, this.pack.units[type].kind) && !this.unitInCell(i) && !inFootprint(i));
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
    const own = (ids: number[]) => ids.map(id => this.entities.get(id)).filter((e): e is Entity => !!e && e.owner === slot && e.kind === 'unit' && e.hp > 0);
    switch (cmd.t) {
      case 'move': case 'attackMove': {
        const units = own(cmd.ids);
        const goals = this.spreadGoals(units, this.cellIndex(cmd.x, cmd.y));
        units.forEach((u, n) => {
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
          const w = this.weaponOf(u);
          if (w && weaponCanTarget(w, kind) && (cmd.force || this.isEnemy(slot, target.owner) || target.owner < 0)) {
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
          const kind = this.unitDef(u).kind;
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
      case 'super': this.launchSuper(player, cmd.id, cmd.x, cmd.y); break;
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
      if (ai && !p.defeated && (this.tick + p.slot * 5) % 15 === 0) runAI(this, p, ai);
    }
    if (this.powerDirty) this.updatePower();
    for (const p of this.players) if (!p.defeated) this.production(p);
    for (const e of this.entities.values()) {
      e.px = e.x; e.py = e.y;
      if (e.hp <= 0) continue;
      if (e.convertedUntil && this.tick >= e.convertedUntil) { e.owner = e.originalOwner; e.convertedUntil = 0; e.order = 'idle'; e.target = 0; e.path = []; }
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
  structDef(e: Entity): StructureDef { return this.pack.structures[e.type]; }
  weaponOf(e: Entity): WeaponDef | undefined {
    const id = e.kind === 'unit' ? this.pack.units[e.type]?.weapon : this.pack.structures[e.type]?.weapon;
    return id ? this.pack.weapons[id] : undefined;
  }
  targetKind(e: Entity): 'infantry' | 'vehicle' | 'structure' {
    return e.kind === 'structure' ? 'structure' : this.pack.units[e.type].kind;
  }
  sightOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].sight : this.pack.structures[e.type].sight; }
  armorOf(e: Entity) { return e.kind === 'unit' ? this.pack.units[e.type].armor : this.pack.structures[e.type].armor; }

  private blank(type: string, kind: 'unit' | 'structure', owner: number, x: number, y: number, hp: number): Entity {
    return {
      id: this.nextId++, type, kind, owner, x, y, px: x, py: y, hp, maxHp: hp, facing: 128, turret: 128,
      order: 'idle', path: [], goal: -1, resume: -1, target: 0, cooldown: 0, repathTick: 0,
      hstate: 'seek', cargo: 0, cargoValue: 0, harvestCell: -1, timer: 0, dock: 0,
      cx: 0, cy: 0, w: 1, h: 1, repairing: false, dockedBy: 0, originalOwner: owner, convertedUntil: 0, born: this.tick, exposed: false, charge: 0, force: false, fireCell: -1,
    };
  }

  spawnUnit(type: string, owner: number, cell: number): Entity {
    const def = this.pack.units[type];
    const e = this.blank(type, 'unit', owner, cellCenter(cell % this.map.w), cellCenter(Math.floor(cell / this.map.w)), def.hp);
    if (def.harvester) e.order = 'harvest';
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
      const cell = nearestCell(this.map, dock, 4, i => passable(this.pack, this.map, i, 'vehicle'));
      if (cell >= 0) this.spawnUnit(def.refinery.freeUnit, owner, cell);
    }
    return e;
  }

  unitInCell(cell: number, except = 0): Entity | undefined {
    for (const e of this.entities.values()) if (e.kind === 'unit' && e.hp > 0 && e.id !== except && this.cellOf(e) === cell) return e;
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
      const kind = this.unitDef(u).kind;
      const cell = nearestCell(this.map, center, 8, i => !taken.has(i) && passable(this.pack, this.map, i, kind));
      const goal = cell >= 0 ? cell : center;
      taken.add(goal);
      return goal;
    });
  }

  private pathFor(u: Entity, goal: number, allow?: number): number[] {
    return findPath(this.pack, this.map, this.unitDef(u).kind, this.cellOf(u), goal, { allow });
  }

  // ---------------------------------------------------------------- production

  /** Structures the player currently owns, by type id. */
  owned(p: Player): Set<string> {
    const set = new Set<string>();
    for (const e of this.entities.values()) if (e.owner === p.slot && e.kind === 'structure' && e.hp > 0) set.add(e.type);
    return set;
  }

  queueFor(item: string): QueueKind | null {
    const s = this.pack.structures[item];
    if (s) return s.queue;
    const u = this.pack.units[item];
    if (u) return u.kind === 'infantry' ? 'infantry' : 'vehicle';
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
    const def: UnitDef | StructureDef | undefined = this.pack.structures[item] ?? this.pack.units[item];
    if (!def || def.tech > this.techCap || !factionCanUse(def, p.faction)) return false;
    if (!prereqsMet(def.prereqs, owned)) return false;
    const queue = this.queueFor(item)!;
    return this.factories(p, queue).length > 0;
  }

  buildOptions(p: Player, queue: QueueKind): string[] {
    const owned = this.owned(p);
    const pool = queue === 'structure' || queue === 'defense'
      ? Object.values(this.pack.structures).filter(s => s.queue === queue).map(s => s.id)
      : Object.values(this.pack.units).filter(u => (u.kind === 'infantry') === (queue === 'infantry')).map(u => u.id);
    return pool.filter(id => this.canBuild(p, id, owned));
  }

  costOf(item: string) { return (this.pack.structures[item] ?? this.pack.units[item])?.cost ?? 0; }

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
      const cost = this.costOf(item);
      let speed = 100 + (factories.length - 1) * this.pack.extraFactoryBonus;
      if (p.powerUse > p.powerGen) speed = Math.floor((speed * this.pack.lowPowerProductionPercent) / 100);
      // Credits are charged as production progresses, like the originals.
      q.acc += Math.floor((100 * speed) / this.pack.buildTicksPer100);
      let pay = Math.floor(q.acc / 100);
      q.acc -= pay * 100;
      pay = Math.min(pay, cost - q.paid, p.credits);
      if (pay <= 0 && q.paid < cost) continue;
      p.credits -= pay; q.paid += pay;
      if (q.paid < cost) continue;
      if (kind === 'structure' || kind === 'defense') { q.ready = true; continue; }
      // Unit complete: roll it out of the factory nearest the rally point.
      const def = this.pack.units[item];
      // Roll out of the factory the unit actually requires (tanks from the Heavy Factory).
      const named = new Set(def.prereqs.flatMap(r => r.split('|')));
      const factory = factories.find(f => named.has(f.type)) ?? factories[0];
      const exit = nearestCell(this.map, this.cellIndex(factory.cx + (factory.w >> 1), factory.cy + factory.h), 6,
        i => passable(this.pack, this.map, i, def.kind) && !this.unitInCell(i));
      if (exit < 0) continue;
      const unit = this.spawnUnit(item, p.slot, exit);
      unit.facing = 128; unit.turret = 128;
      if (!def.harvester && p.rally >= 0) {
        unit.order = 'move'; unit.goal = p.rally; unit.path = this.pathFor(unit, p.rally);
      }
      q.items.shift(); q.paid = 0; q.acc = 0;
    }
  }

  /** Placement check shared by the UI ghost, the AI and the place command. */
  canPlace(p: Player, item: string, x: number, y: number, ignoreRadius = false, ignoreUnit = 0): boolean {
    const def = this.pack.structures[item];
    if (!def) return false;
    for (let cy = y; cy < y + def.h; cy++) for (let cx = x; cx < x + def.w; cx++) {
      if (!inBounds(this.map, cx, cy)) return false;
      const i = cy * this.map.w + cx;
      if (this.map.occupied[i] || !buildableTerrain(this.pack, this.map, i)) return false;
      if (def.floor && this.map.concrete[i]) return false;
      if (!def.floor && this.unitInCell(i, ignoreUnit)) return false;
    }
    if (ignoreRadius) return true;
    const r = this.pack.buildRadius;
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
    for (const p of this.players) { p.powerGen = 0; p.powerUse = 0; }
    for (const e of this.entities.values()) {
      if (e.kind !== 'structure' || e.hp <= 0) continue;
      const p = this.players[e.owner];
      if (!p) continue;
      const power = this.pack.structures[e.type].power;
      if (power > 0) p.powerGen += power; else p.powerUse -= power;
    }
    this.powerDirty = false;
  }

  lowPower(owner: number): boolean { const p = this.players[owner]; return !!p && p.powerUse > p.powerGen; }

  // ---------------------------------------------------------------- units

  private unitThink(u: Entity) {
    const def = this.unitDef(u);
    if (u.cooldown > 0) u.cooldown--;
    if (def.regen && u.hp < u.maxHp && this.tick % 30 === 0) u.hp = Math.min(u.maxHp, u.hp + def.regen);
    if (def.harvester && (u.order === 'harvest' || u.order === 'idle')) { u.order = 'harvest'; this.harvest(u, def); return; }
    const weapon = this.weaponOf(u);
    if (u.order === 'attack') {
      const t = this.entities.get(u.target);
      if (!t || t.hp <= 0 || !u.force && !this.isEnemy(u.owner, t.owner) && !t.convertedUntil && t.owner !== -1) {
        u.target = 0; u.force = false;
        if (u.resume >= 0 && this.cellOf(u) !== u.resume && u.goal === u.resume) { u.order = 'attackMove'; u.path = this.pathFor(u, u.resume); } else u.order = 'idle';
        return;
      }
      if (weapon && this.inRange(u, t, weapon)) { u.path = []; this.aimAndFire(u, t, weapon); return; }
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
    // Idle and attack-moving units engage what they can see.
    if (weapon && (u.order === 'idle' || u.order === 'attackMove') && (this.tick + u.id) % 8 === 0) {
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
    let best: Entity | undefined; let bestD = reach + 1;
    const viewer = this.players[a.owner];
    for (const e of this.entities.values()) {
      if (e.hp <= 0 || !this.isEnemy(a.owner, e.owner)) continue;
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
    if (!terrainPassable(this.pack, this.map, next, def.kind) || this.map.occupied[next] && this.map.occupied[next] !== u.dock) {
      // Something was built in the way; find a new route.
      const goal = u.path[u.path.length - 1];
      u.path = this.pathFor(u, goal);
      return;
    }
    const tx = cellCenter(next % this.map.w), ty = cellCenter(Math.floor(next / this.map.w));
    const dx = tx - u.x, dy = ty - u.y;
    const want = facingTo(dx, dy);
    if (def.kind === 'vehicle' && def.turn) {
      const delta = facingDelta(u.facing, want);
      const stepTurn = Math.min(Math.abs(delta), def.turn);
      u.facing = (u.facing + Math.sign(delta) * stepTurn) & 255;
      if (Math.abs(delta) > 40) return; // Turn in place before driving, like the classics.
    } else u.facing = want;
    u.turret = u.facing;
    const terrainSpeed = this.pack.terrains[this.map.terrain[this.cellOf(u)]].speed;
    const step = Math.max(1, Math.floor((def.speed * terrainSpeed) / 100));
    const d = dist(u.x, u.y, tx, ty);
    if (d <= step) {
      u.x = tx; u.y = ty; u.path.shift();
      if (def.crusher) this.crush(u, next);
    } else {
      u.x += Math.trunc((dx * step) / d);
      u.y += Math.trunc((dy * step) / d);
    }
  }

  private crush(u: Entity, cell: number) {
    for (const e of this.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.id === u.id || !this.isEnemy(u.owner, e.owner)) continue;
      if (this.unitDef(e).crushable && this.cellOf(e) === cell) { this.damage(e, e.hp, u.owner); this.effect('crush', e.x, e.y, 0, 0, 12); }
    }
  }

  private aimAndFire(a: Entity, t: Entity | undefined, w: WeaponDef, gx = t?.x ?? 0, gy = t?.y ?? 0) {
    const want = facingTo(gx - a.x, gy - a.y);
    if (a.kind === 'unit' && this.unitDef(a).kind === 'infantry') a.facing = want;
    const delta = facingDelta(a.turret, want);
    a.turret = (a.turret + Math.sign(delta) * Math.min(Math.abs(delta), 16)) & 255;
    if (a.kind === 'unit' && this.unitDef(a).kind === 'vehicle' && !this.unitDef(a).shape.includes('turret')) {
      // Fixed-gun vehicles turn the whole hull.
      const d2 = facingDelta(a.facing, want);
      a.facing = (a.facing + Math.sign(d2) * Math.min(Math.abs(d2), this.unitDef(a).turn ?? 8)) & 255;
      if (Math.abs(d2) > 16) return;
    }
    if (Math.abs(delta) > 24 || a.cooldown > 0) return;
    a.cooldown = w.rof;
    const shots = w.burst ?? 1;
    for (let s = 0; s < shots; s++) this.fire(a, t, w, s, gx, gy);
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
        if (e.hp <= 0 || e.id === a.id) continue;
        const along = ((e.x - a.x) * (tx - a.x) + (e.y - a.y) * (ty - a.y)) / len;
        if (along < 0 || along > len + 128) continue;
        const px = a.x + ((tx - a.x) * along) / len, py = a.y + ((ty - a.y) * along) / len;
        if (dist(e.x, e.y, Math.round(px), Math.round(py)) < 160) this.hit(e, w, a.owner, 100);
      }
      this.effect('sonic', a.x, a.y, tx, ty, 12);
      return;
    }
    if (w.speed === 0) {
      this.effect(w.visual, a.x, a.y, tx, ty, w.visual === 'prism' || w.visual === 'tesla' ? 8 : 4);
      this.impact(w, a.owner, t, tx, ty, a.id);
      return;
    }
    this.projectiles.push({ id: this.nextId++, owner: a.owner, weapon: w.id, x: a.x, y: a.y, sx: a.x, sy: a.y, tx: tx + shot * 40, ty, target: t?.id ?? 0, source: a.id });
    this.effect('muzzle', a.x, a.y, tx, ty, 3);
  }

  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const w = this.pack.weapons[pr.weapon];
      if (w.visual === 'missile') {
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
    this.effect(w.splash ? 'explosion' : 'hit', x, y, 0, 0, w.splash ? 14 : 6);
    if (w.converts && target && target.kind === 'unit' && target.hp > 0 && this.unitDef(target).kind === 'vehicle' && target.owner !== owner && target.owner >= 0) {
      target.originalOwner = target.convertedUntil ? target.originalOwner : target.owner;
      target.owner = owner; target.convertedUntil = this.tick + w.converts; target.order = 'idle'; target.target = 0; target.path = [];
      this.effect('convert', target.x, target.y, 0, 0, 20);
    }
    if (!target && !w.splash) {
      // A ground shot still hits whatever is standing where it lands.
      for (const e of this.entities.values()) if (e.hp > 0 && this.distTo(x, y, e) <= 96) { target = e; break; }
    }
    if (target && target.hp > 0 && (!w.splash || this.distTo(x, y, target) <= LEPTONS)) this.hit(target, w, owner, 100, source);
    if (w.splash) {
      for (const e of this.entities.values()) {
        if (e.hp <= 0 || e === target) continue;
        const d = this.distTo(x, y, e);
        if (d >= w.splash) continue;
        this.hit(e, w, owner, Math.floor(((w.splash - d) * 100) / w.splash), source);
      }
      for (const worm of this.worms) if (!worm.hidden && dist(x, y, worm.x, worm.y) < w.splash) worm.hp -= w.damage;
    }
  }

  private hit(e: Entity, w: WeaponDef, owner: number, percent: number, source = 0) {
    const vs = this.pack.warheads[w.warhead]?.vs[this.armorOf(e)] ?? 100;
    const amount = Math.floor((w.damage * vs * percent) / 10000);
    if (amount <= 0) return;
    this.damage(e, amount, owner);
    // Idle units retaliate.
    if (e.hp > 0 && e.kind === 'unit' && e.order === 'idle' && source && this.weaponOf(e) && !this.unitDef(e).harvester) {
      const attacker = this.entities.get(source);
      if (attacker && this.isEnemy(e.owner, attacker.owner)) { e.order = 'attack'; e.target = attacker.id; }
    }
  }

  damage(e: Entity, amount: number, by: number) {
    if (e.hp <= 0) return;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
      const killer = this.players[by];
      if (killer && by !== e.owner) killer.stats.killed++;
      const victim = this.players[e.owner];
      if (victim) victim.stats.lost++;
      this.effect(e.kind === 'structure' ? 'bigExplosion' : this.unitDef(e).kind === 'infantry' ? 'death' : 'vehicleDeath', e.x, e.y, 0, 0, e.kind === 'structure' ? 30 : 18);
    }
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
      let ref = this.entities.get(u.dock);
      if (!ref || ref.hp <= 0 || ref.owner !== u.owner) {
        ref = undefined; let best = Infinity;
        for (const e of this.entities.values()) {
          if (e.owner !== u.owner || e.kind !== 'structure' || e.hp <= 0 || !this.pack.structures[e.type].refinery) continue;
          const d = dist(u.x, u.y, e.x, e.y);
          if (d < best) { best = d; ref = e; }
        }
        if (!ref) return; // No refinery: wait loaded until one is built.
        u.dock = ref.id;
      }
      const r = this.pack.structures[ref.type].refinery!;
      const dockCell = this.cellIndex(ref.cx + r.dockX, ref.cy + r.dockY);
      if (h.teleport && this.cellOf(u) !== dockCell) {
        // Chrono Miner: jump straight to the refinery pad.
        this.effect('chrono', u.x, u.y, 0, 0, 12);
        u.x = u.px = cellCenter(dockCell % this.map.w); u.y = u.py = cellCenter(Math.floor(dockCell / this.map.w));
        u.path = [];
        this.effect('chrono', u.x, u.y, 0, 0, 12);
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
      const next = p.credits + each;
      p.credits = p.storage > 0 && next > p.storage ? Math.max(p.credits, p.storage) : next;
      p.stats.harvested += each;
    }
    if (u.cargo === 0) { u.cargoValue = 0; ref.dockedBy = 0; u.hstate = 'seek'; u.path = []; }
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
    // Sand erosion: exposed Dune buildings decay to their uncovered floor, even after repair.
    const concrete = this.pack.mechanics.concrete;
    if (s.exposed && concrete && this.tick % 60 === 0) {
      const floor = Math.floor((s.maxHp * concrete.uncoveredStartPercent) / 100);
      if (s.hp > floor) s.hp = Math.max(floor, s.hp - Math.max(1, Math.floor(s.maxHp / 200)));
    }
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

  // ---------------------------------------------------------------- mechanics

  private mechanics() {
    const m = this.pack.mechanics;
    if (m.regrowth && this.tick % m.regrowth.everyTicks === 0) this.regrow(m.regrowth.amount, m.regrowth.spreadChance);
    if (m.bloom && this.tick % m.bloom.everyTicks === 0) this.bloom(m.bloom.radius, m.bloom.resource);
    if (m.sandworm) this.sandworms(m.sandworm);
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

  private sandworms(cfg: NonNullable<RulePack['mechanics']['sandworm']>) {
    if (this.tick < cfg.appearAfter) return;
    const isSand = (x: number, y: number) => {
      const cx = toCell(x), cy = toCell(y);
      return inBounds(this.map, cx, cy) && !!this.pack.terrains[this.map.terrain[cy * this.map.w + cx]].sand;
    };
    while (this.worms.length < cfg.count) {
      this.worms.push({ id: this.nextId++, x: 0, y: 0, px: 0, py: 0, target: 0, hidden: 1, hp: 0, facing: 0, wander: 0 });
    }
    for (const worm of this.worms) {
      worm.px = worm.x; worm.py = worm.y;
      if (worm.hidden) {
        if (--worm.hidden > 0) continue;
        // Surface somewhere on open sand.
        for (let attempt = 0; attempt < 40; attempt++) {
          const x = cellCenter(this.rng.int(this.map.w)), y = cellCenter(this.rng.int(this.map.h));
          if (isSand(x, y) && !this.map.starts.some(s => dist(cellCenter(s.x), cellCenter(s.y), x, y) < 10 * LEPTONS)) {
            worm.x = worm.px = x; worm.y = worm.py = y; worm.hp = 1000; worm.target = 0; worm.wander = 0; break;
          }
        }
        if (worm.hp <= 0) worm.hidden = 30;
        continue;
      }
      if (worm.hp <= 0) { worm.hidden = 600; this.effect('wormDive', worm.x, worm.y, 0, 0, 20); continue; }
      let prey = this.entities.get(worm.target);
      if (!prey || prey.hp <= 0 || prey.kind !== 'unit' || !isSand(prey.x, prey.y)) {
        prey = undefined; worm.target = 0;
        if ((this.tick + worm.id) % 10 === 0) {
          let best = cfg.sight * LEPTONS;
          for (const e of this.entities.values()) {
            if (e.kind !== 'unit' || e.hp <= 0 || !isSand(e.x, e.y)) continue;
            const d = dist(worm.x, worm.y, e.x, e.y);
            if (d < best) { best = d; prey = e; }
          }
          if (prey) worm.target = prey.id;
        }
      }
      let tx: number, ty: number;
      if (prey) { tx = prey.x; ty = prey.y; } else {
        if (!worm.wander || this.tick % 90 === 0) worm.wander = this.rng.int(256);
        tx = worm.x + (((worm.wander & 15) - 8) * LEPTONS); ty = worm.y + (((worm.wander >> 4) - 8) * LEPTONS);
      }
      const d = dist(worm.x, worm.y, tx, ty);
      if (prey && d < LEPTONS) {
        if (this.rng.chance(cfg.eatChance)) this.damage(prey, prey.hp, -1); else this.damage(prey, cfg.damage, -1);
        this.effect('wormEat', prey.x, prey.y, 0, 0, 30);
        worm.hidden = 450 + this.rng.int(300);
        continue;
      }
      if (d > 0) {
        const nx = worm.x + Math.trunc(((tx - worm.x) * Math.min(cfg.speed, d)) / d);
        const ny = worm.y + Math.trunc(((ty - worm.y) * Math.min(cfg.speed, d)) / d);
        if (isSand(nx, ny)) { worm.facing = facingTo(nx - worm.x, ny - worm.y); worm.x = nx; worm.y = ny; } else worm.wander = this.rng.int(256);
      }
    }
  }

  // ---------------------------------------------------------------- fog, cleanup, victory

  private updateFog() {
    const { w, h } = this.map;
    for (const p of this.players) p.visible.fill(0);
    for (const e of this.entities.values()) {
      if (e.hp <= 0) continue;
      const p = this.players[e.owner];
      if (!p) continue;
      const r = this.sightOf(e);
      const cx = toCell(e.x), cy = toCell(e.y);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= h) continue;
        const span = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
        for (let x = Math.max(0, cx - span); x <= Math.min(w - 1, cx + span); x++) {
          const i = y * w + x;
          p.visible[i] = 1; p.explored[i] = 1;
        }
      }
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
    this.entities.delete(e.id);
  }

  private cleanup() {
    for (const e of [...this.entities.values()]) if (e.hp <= 0) this.removeEntity(e, true);
  }

  private defeat(p: Player) {
    if (p.defeated) return;
    p.defeated = true;
    for (const e of this.entities.values()) if (e.owner === p.slot && e.hp > 0) { this.damage(e, e.hp, -1); }
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
  superweaponOf(e: Entity) {
    if (e.kind !== 'structure') return undefined;
    const sw = this.pack.structures[e.type]?.superweapon;
    if (!sw) return undefined;
    const faction = this.players[e.owner]?.faction;
    return !sw.factions || (faction && sw.factions.includes(faction)) ? sw : undefined;
  }

  private launchSuper(p: Player, id: number, x: number, y: number) {
    const s = this.entities.get(id);
    if (!s || s.owner !== p.slot || s.hp <= 0) return;
    const sw = this.superweaponOf(s);
    if (!sw || s.charge < sw.charge) return;
    s.charge = 0;
    const tx = cellCenter(Math.max(0, Math.min(this.map.w - 1, x))), ty = cellCenter(Math.max(0, Math.min(this.map.h - 1, y)));
    const tag = (fx: Effect) => { fx.owner = p.slot; fx.item = sw.id; fx.color = sw.name; return fx; };
    if (sw.kind === 'storm') {
      const duration = sw.duration ?? 200, count = sw.strikes ?? 20;
      tag(this.effect('stormClouds', tx, ty, sw.radius, 0, sw.delay + duration));
      for (let k = 0; k < count; k++) {
        // Integer scatter inside the storm's square (deterministic, no trigonometry).
        const bx = tx + this.rng.int(sw.radius * 2) - sw.radius, by = ty + this.rng.int(sw.radius * 2) - sw.radius;
        this.strikes.push({ tick: this.tick + sw.delay + Math.floor((k * duration) / count), x: bx, y: by, owner: p.slot, damage: sw.damage, radius: sw.boltRadius ?? 384, kind: 'bolt', name: sw.name });
      }
    } else {
      tag(this.effect(sw.kind === 'missile' ? 'superLaunch' : 'ionCharge', s.x, s.y, tx, ty, sw.delay));
      if (sw.kind === 'missile') tag(this.effect('superIncoming', tx, ty, s.x, s.y, sw.delay));
      this.strikes.push({ tick: this.tick + sw.delay, x: tx, y: ty, owner: p.slot, damage: sw.damage, radius: sw.radius, kind: sw.kind, name: sw.name });
    }
  }

  private resolveStrikes() {
    if (!this.strikes.length) return;
    const due = this.strikes.filter(s => s.tick <= this.tick);
    if (!due.length) return;
    this.strikes = this.strikes.filter(s => s.tick > this.tick);
    for (const s of due) {
      const fx = this.effect(s.kind === 'missile' ? 'nuke' : s.kind === 'ion' ? 'ionStrike' : 'lightning', s.x, s.y, s.radius, 0, s.kind === 'bolt' ? 12 : s.kind === 'ion' ? 45 : 90);
      fx.owner = s.owner; fx.color = s.name;
      for (const e of this.entities.values()) {
        if (e.hp <= 0) continue;
        const d = this.distTo(s.x, s.y, e);
        if (d >= s.radius) continue;
        // Full damage at the centre, a quarter at the edge.
        this.damage(e, Math.max(1, Math.floor((s.damage * (s.radius - Math.floor((d * 3) / 4))) / s.radius)), s.owner);
      }
      for (const worm of this.worms) if (!worm.hidden && dist(s.x, s.y, worm.x, worm.y) < s.radius) worm.hp -= s.damage;
    }
  }

  /** Desync detector: identical on every client running the same commands. */
  checksum(): number {
    const h = new Hasher().add(this.tick).add(this.rng.seed);
    for (const p of this.players) h.add(p.credits).add(p.defeated ? 1 : 0);
    for (const e of this.entities.values()) h.add(e.id).add(e.x).add(e.y).add(e.hp).add(e.owner).add(e.facing).add(e.charge);
    for (const s of this.strikes) h.add(s.tick).add(s.x).add(s.y);
    for (const pr of this.projectiles) h.add(pr.x).add(pr.y);
    for (const worm of this.worms) h.add(worm.x).add(worm.y).add(worm.hidden);
    return h.value;
  }
}
