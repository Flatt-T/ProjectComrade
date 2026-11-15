// THU-2239 / PW15+PW28: every naval choice must field a working sea lift —
// build the naval yard for real, produce the choice's heavy-craft, load an MCV
// AND a packed building, sail the channel, unload on the far shore with no
// receiving structure, and settle/deploy on the island. Runs on the universal
// persistent pack (td-landing: a sea channel splitting the map into two banks)
// so the journey exercises namespaced defs, allowedDefs gating and packed
// carriers exactly as a settlement does.
import { describe, expect, it } from 'vitest';
import {
  Game, LEPTONS, isWater, passable, worldAllowedDefs, worldPack,
  worldStarterUnits, type Entity, type GameSetup, type MashupLoadout,
  type MmoTuning,
} from '../../packages/fusion/src/index';

const { pack, choices } = worldPack();

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 0, recoveryBuildRoles: [],
  salvage: { percentOfCost: 25, decaySeconds: 600, mismatchFloorRatio: 0, scoreWeights: { structure: 1, unit: 1, tech: 0 } },
};

const cellOf = (g: Game, e: Entity) =>
  Math.floor(e.y / LEPTONS) * g.map.w + Math.floor(e.x / LEPTONS);

function loadout(naval: string | undefined): MashupLoadout {
  return {
    structures: choices.structures[0].key,
    infantry: choices.infantry[0].key,
    vehicle: choices.vehicle[0].key,
    aircraft: choices.aircraft[0].key,
    naval,
  };
}

function setup(lo: MashupLoadout): Game {
  const s: GameSetup = {
    pack, mapId: 'td-landing', seed: 7, techLevel: 15, persistent: true, mmo: TUNING,
    players: [{
      name: 'A', faction: 'commander', ai: false, playerId: 'pa',
      starter: { credits: 100000, units: worldStarterUnits(lo) },
      allowedDefs: worldAllowedDefs(lo),
    }],
  };
  return new Game(s);
}

function step(g: Game, n = 1) { for (let i = 0; i < n; i++) g.step(); }

function until(g: Game, pred: () => boolean, maxSteps: number, what: string) {
  for (let i = 0; i < maxSteps; i++) {
    if (pred()) return;
    g.step();
  }
  throw new Error(`timed out waiting for ${what} (${maxSteps} steps, tick ${g.tick})`);
}

/** Find a placement cell for a structure def: onWater defs need water, others land. */
function placeCell(g: Game, item: string): number {
  const def = g.pack.structures[item]!;
  const wantWater = !!def.onWater;
  const structs = [...g.entities.values()].filter(e => e.owner === 0 && e.kind === 'structure' && e.hp > 0);
  const near = (i: number) => structs.some(s =>
    i % g.map.w >= s.cx - 10 && i % g.map.w <= s.cx + s.w + 10
    && Math.floor(i / g.map.w) >= s.cy - 10 && Math.floor(i / g.map.w) <= s.cy + s.h + 10);
  for (const requireNear of [true, false]) {
    for (let i = 0; i < g.map.w * g.map.h; i++) {
      if (wantWater !== isWater(g.pack, g.map, i)) continue;
      if (requireNear && !near(i)) continue;
      if (g.canPlace(g.players[0], item, i % g.map.w, Math.floor(i / g.map.w))) return i;
    }
  }
  throw new Error(`no placement cell for ${item}`);
}

/** Build a structure end-to-end through the real queue: build -> ready -> place. */
function construct(g: Game, item: string) {
  g.enqueue(0, { t: 'build', item });
  const p = g.players[0];
  const kind = g.queueFor(item);
  if (kind !== 'structure' && kind !== 'defense') throw new Error(`${item} is not a structure`);
  until(g, () => p.queues[kind].ready && p.queues[kind].items[0] === item, 30000, `${kind} ${item} ready`);
  const cell = placeCell(g, item);
  g.enqueue(0, { t: 'place', item, x: cell % g.map.w, y: Math.floor(cell / g.map.w) });
  step(g, 5);
  const s = [...g.entities.values()].find(e => e.type === item && e.owner === 0 && e.kind === 'structure');
  if (!s) throw new Error(`structure ${item} did not appear after place`);
  return s;
}

/** Queue a unit item and wait for it to spawn at a factory. */
function produceUnit(g: Game, item: string): Entity {
  const before = new Set(g.entities.keys());
  g.enqueue(0, { t: 'build', item });
  let made: Entity | undefined;
  until(g, () => {
    made = [...g.entities.values()].find(e => e.type === item && e.owner === 0 && !before.has(e.id));
    return !!made;
  }, 40000, `unit ${item} produced`);
  return made!;
}

/** A water cell with open vehicle-passable land beside it on the given bank,
 *  preferring the row nearest the bases (y≈32) so cargo walks less. */
function shoreWater(g: Game, east: boolean): number {
  let best = -1, bd = 1e9;
  for (let i = 0; i < g.map.w * g.map.h; i++) {
    if (!isWater(g.pack, g.map, i)) continue;
    const x = i % g.map.w, y = Math.floor(i / g.map.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.map.w || ny >= g.map.h) continue;
      if (east !== (nx > 43)) continue;
      const j = ny * g.map.w + nx;
      if (!isWater(g.pack, g.map, j) && passable(g.pack, g.map, j, 'vehicle')) {
        const d = Math.abs(y - 32);
        if (d < bd) { bd = d; best = i; }
      }
    }
  }
  if (best < 0) throw new Error(`no ${east ? 'east' : 'west'} shoreline water`);
  return best;
}

/** Order a unit to a cell and wait until it stops within 2 cells of it. */
function moveUnit(g: Game, id: number, cell: number, maxSteps = 40000, exact = false) {
  g.enqueue(0, { t: 'move', ids: [id], x: cell % g.map.w, y: Math.floor(cell / g.map.w) });
  const tol = exact ? 0 : 2;
  until(g, () => {
    const e = g.entities.get(id);
    if (!e || e.hp <= 0) return true;
    if (e.order !== 'idle') return false;
    if (exact) return cellOf(g, e) === cell;
    const cx = e.x / LEPTONS, cy = e.y / LEPTONS;
    return Math.abs(cx - (cell % g.map.w)) <= tol && Math.abs(cy - Math.floor(cell / g.map.w)) <= tol;
  }, maxSteps, `unit ${id} reach cell ${cell}`);
}

/** Order a transport to sail to a water cell and wait until it stops nearby.
 *  `exact` matters for boarding legs: land units board at REACH (~1 cell), so
 *  the craft must actually pull alongside the shore, not merely near it. */
function sail(g: Game, craft: Entity, waterCell: number, maxSteps = 80000, exact = false) {
  g.enqueue(0, { t: 'move', ids: [craft.id], x: waterCell % g.map.w, y: Math.floor(waterCell / g.map.w) });
  until(g, () => {
    const e = g.entities.get(craft.id);
    if (!e || e.hp <= 0) return true;
    if (e.order !== 'idle') return false;
    return Math.abs(cellOf(g, e) - waterCell) <= (exact ? 1 : 3);
  }, maxSteps, `craft ${craft.id} reach water ${waterCell}`);
}

/** Nearest vehicle-passable cell to `fromCell` where an MCV standing on it can
 *  deploy `yardType` — mirrors deploy()'s own canPlace(ignoreRadius, ignoreUnit). */
function nearestYardSpot(g: Game, fromCell: number, yardType: string, ys: { w: number; h: number }, ignoreUnit: number): number {
  const mw = g.map.w;
  const cells: number[] = [];
  for (let i = 0; i < mw * g.map.h; i++) {
    if (isWater(g.pack, g.map, i) || !passable(g.pack, g.map, i, 'vehicle')) continue;
    if (g.map.occupied[i] || g.unitInCell(i, ignoreUnit)) continue;
    cells.push(i);
  }
  cells.sort((a, b) =>
    (Math.abs(a % mw - fromCell % mw) + Math.abs(Math.floor(a / mw) - Math.floor(fromCell / mw)))
    - (Math.abs(b % mw - fromCell % mw) + Math.abs(Math.floor(b / mw) - Math.floor(fromCell / mw))));
  for (const i of cells) {
    const tx = i % mw - (ys.w >> 1), ty = Math.floor(i / mw) - (ys.h >> 1);
    if (tx < 0 || ty < 0) continue;
    if (g.canPlace(g.players[0], yardType, tx, ty, true, ignoreUnit)) return i;
  }
  return -1;
}

/** Board heavy cargo onto an empty heavy-craft and wait until carriedBy commits. */
function board(g: Game, cargo: Entity, craft: Entity, maxSteps = 40000) {
  g.enqueue(0, { t: 'enter', ids: [cargo.id], target: craft.id });
  until(g, () => {
    const c = g.entities.get(cargo.id);
    return !!c && c.carriedBy === craft.id;
  }, maxSteps, `cargo ${cargo.id} board craft ${craft.id}`);
}

/** Deploy (unload) a transport and wait until its manifest is empty. */
function unload(g: Game, craft: Entity) {
  g.enqueue(0, { t: 'deploy', ids: [craft.id] });
  until(g, () => {
    const c = g.entities.get(craft.id);
    return !c || c.passengers.length === 0;
  }, 8000, `craft ${craft.id} unload`);
}

const NAVAL_YARD = 'w-svc-ra1-naval-spen'; // cheapest shared naval producer (650, onWater)
const VEHICLE_FACTORY = 'w-svc-dune-vehicle-lightfactory'; // cheapest shared vehicle producer (500)
const CARGO_MCV = 'w-svc-mcv-mcv'; // shared service MCV every loadout may build
const PACKABLE = 'w-svc-dune-infantry-barracks'; // cheapest packable building (300, structure queue)

function heavyLiftId(lo: MashupLoadout): string {
  const lifts = worldAllowedDefs(lo)
    .filter(id => pack.units[id]?.heavyCargo && pack.units[id]?.transport);
  expect(lifts, 'exactly one heavy lift per naval choice').toHaveLength(1);
  return lifts[0];
}

describe('THU-2239 sea lift per naval choice (universal pack, td-landing channel)', () => {
  it('a blank navy slot fields no heavy lift', () => {
    const lo = loadout(undefined);
    const lifts = worldAllowedDefs(lo)
      .filter(id => pack.units[id]?.heavyCargo && pack.units[id]?.transport);
    expect(lifts).toHaveLength(0);
  });

  for (const naval of choices.naval) {
    it(`${naval.key}: build yard, produce craft, land MCV + packed building on the far bank`, { timeout: 300_000 }, () => {
      const lo = loadout(naval.key);
      const liftId = heavyLiftId(lo);
      const g = setup(lo);
      const mw = g.map.w;

      // 1. Relocate the starter MCV to the west shoreline and deploy the yard.
      const starterMcv = [...g.entities.values()].find(e => e.owner === 0 && e.kind === 'unit' && g.unitDef(e).deploysTo);
      expect(starterMcv, 'starter MCV granted').toBeTruthy();
      const yardType = Object.entries(pack.structures)
        .filter(([, s]) => s.constructionYard && worldAllowedDefs(lo).includes(s.id))
        .map(([id]) => id).sort()[0];
      const ys = pack.structures[yardType]!;
      // Drive to the west shore near the base row, then step to the nearest
      // cell whose 3x3 yard footprint fits — deploy refuses silently otherwise.
      let shoreApproach = -1;
      for (let y = 28; y < 37 && shoreApproach < 0; y++) for (let x = 22; x < 28; x++) {
        const i = y * mw + x;
        if (!isWater(g.pack, g.map, i) && passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) { shoreApproach = i; break; }
      }
      expect(shoreApproach).toBeGreaterThanOrEqual(0);
      moveUnit(g, starterMcv!.id, shoreApproach);
      const westSpot = nearestYardSpot(g, cellOf(g, g.entities.get(starterMcv!.id)!), yardType, ys, starterMcv!.id);
      expect(westSpot, 'west shore cell fitting the yard').toBeGreaterThanOrEqual(0);
      if (westSpot !== cellOf(g, g.entities.get(starterMcv!.id)!)) {
        moveUnit(g, starterMcv!.id, westSpot, 40000, true);
      }
      g.enqueue(0, { t: 'deploy', ids: [starterMcv!.id] });
      until(g, () => [...g.entities.values()].some(e => e.owner === 0 && e.kind === 'structure' && g.pack.structures[e.type]?.constructionYard), 4000, 'construction yard');

      // 2. Build the naval yard on the water beside the base, plus the vehicle
      //    factory and a packable store on land — all through the real queues.
      construct(g, NAVAL_YARD);
      construct(g, VEHICLE_FACTORY);
      construct(g, PACKABLE);

      // 3. Produce the choice's heavy craft and a second (cargo) MCV.
      const craft = produceUnit(g, liftId);
      expect(g.unitDef(craft).heavyCargo).toBe(true);
      const cargoMcv = produceUnit(g, CARGO_MCV);
      expect(g.unitDef(cargoMcv).deploysTo).toBeTruthy();

      // 4. Sail the craft alongside the west shore (a player would), board
      //    the MCV, then cross the channel.
      const westWater = shoreWater(g, false);
      const eastWater = shoreWater(g, true);
      sail(g, craft, westWater, 80000, true);
      board(g, cargoMcv, craft);
      sail(g, craft, eastWater);

      // 5. Unload on the far shore with no receiving structure, then the MCV
      //    deploys a yard — the first foothold on the island.
      unload(g, craft);
      const landedMcv = g.entities.get(cargoMcv.id)!;
      expect(landedMcv.carriedBy).toBe(0);
      expect(cellOf(g, landedMcv) % mw).toBeGreaterThan(43);
      // The beach cell may be too tight for the 3x3 yard — walk to the nearest
      // cell where the footprint actually fits (the game's own placement rule).
      const islandSpot = nearestYardSpot(g, cellOf(g, landedMcv), yardType, ys, landedMcv.id);
      expect(islandSpot, 'island cell fitting the yard').toBeGreaterThanOrEqual(0);
      if (islandSpot !== cellOf(g, landedMcv)) {
        moveUnit(g, landedMcv.id, islandSpot, 40000, true);
      }
      g.enqueue(0, { t: 'deploy', ids: [landedMcv.id] });
      until(g, () => [...g.entities.values()].some(e => e.owner === 0 && e.kind === 'structure' && e.hp > 0 && cellOf(g, e) % mw > 43 && g.pack.structures[e.type]?.constructionYard), 6000, 'island construction yard');

      // 6. Pack the store on the west bank, sail back, board it, cross again,
      //    unload and unpack — a packed building establishes on the island.
      const store = [...g.entities.values()].find(e => e.owner === 0 && e.kind === 'structure' && e.type === PACKABLE);
      expect(store, 'packable store built').toBeTruthy();
      g.enqueue(0, { t: 'pack', id: store!.id });
      step(g, 3);
      const carrier = g.entities.get(store!.id)!;
      expect(carrier.kind).toBe('unit');
      expect(carrier.packedType).toBe(PACKABLE);

      const c2 = g.entities.get(craft.id)!;
      sail(g, c2, shoreWater(g, false), 80000, true);
      board(g, carrier, c2);
      sail(g, c2, eastWater);
      unload(g, c2);
      const landedCarrier = g.entities.get(carrier.id)!;
      expect(landedCarrier.carriedBy).toBe(0);
      expect(landedCarrier.packedType).toBe(PACKABLE);

      // Unpack at a legal footprint next to where it landed.
      const lc = cellOf(g, landedCarrier);
      const sdef = g.pack.structures[PACKABLE]!;
      let unpacked = false;
      outer: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = lc % mw + dx, y = Math.floor(lc / mw) + dy;
        if (x < 0 || y < 0 || x + sdef.w > mw || y + sdef.h > g.map.h) continue;
        const before = new Set([...g.entities.values()].filter(e => e.kind === 'structure' && e.type === PACKABLE && cellOf(g, e) % mw > 43).map(e => e.id));
        g.enqueue(0, { t: 'unpack', id: landedCarrier.id, x, y });
        step(g, 3);
        if ([...g.entities.values()].some(e => e.kind === 'structure' && e.type === PACKABLE && e.owner === 0 && cellOf(g, e) % mw > 43 && !before.has(e.id))) {
          unpacked = true;
          break outer;
        }
      }
      expect(unpacked, 'packed building redeployed on the island').toBe(true);
    });
  }
});
