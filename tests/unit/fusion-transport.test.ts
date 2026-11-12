// PW15: sea landing craft — heavy-cargo transport that carries one MCV or one
// packed building carrier exclusively, or up to five vehicles, sails to any
// shoreline and unloads with no receiving structure. Cargo is physically
// attached until a valid unload commits; carrier death loses the cargo with
// salvage; protected-only cargo shares protection; ownership can never split
// cargo from carrier.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, LEPTONS, captureGame, isWater, passable, restoreGame,
  type Entity, type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'
const MAP = 'td-landing'; // sea channel + island: shore AND deep water

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 0, recoveryBuildRoles: [],
  salvage: { percentOfCost: 25, decaySeconds: 600, mismatchFloorRatio: 0, scoreWeights: { structure: 1, unit: 1, tech: 0 } },
};

function setup(players = 1): GameSetup {
  return {
    pack: PACK, mapId: MAP, seed: 47, persistent: true, mmo: TUNING,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

const cellOf = (g: Game, e: Entity) => Math.floor(e.y / LEPTONS) * g.map.w + Math.floor(e.x / LEPTONS);

function scan(g: Game, want: (i: number) => boolean, from = 0): number[] {
  const out: number[] = [];
  for (let i = from; i < g.map.w * g.map.h; i++) if (want(i)) out.push(i);
  return out;
}
const waterCells = (g: Game) => scan(g, i => isWater(g.pack, g.map, i));
const landCells = (g: Game, cls: 'vehicle' | 'infantry' = 'vehicle') =>
  scan(g, i => !isWater(g.pack, g.map, i) && passable(g.pack, g.map, i, cls) && !g.map.occupied[i]);

/** A water cell with open land within unload reach (adjacent-ish shoreline). */
function shoreWater(g: Game): number {
  for (const w of waterCells(g)) {
    const wx = w % g.map.w, wy = Math.floor(w / g.map.w);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = wx + dx, y = wy + dy;
      if (x < 0 || y < 0 || x >= g.map.w || y >= g.map.h) continue;
      const i = y * g.map.w + x;
      if (!isWater(g.pack, g.map, i) && passable(g.pack, g.map, i, 'vehicle')) return w;
    }
  }
  throw new Error('no shoreline water on map');
}

/** Open water with no land within 4 cells — unload must fail there. */
function deepWater(g: Game): number {
  for (const w of waterCells(g)) {
    const wx = w % g.map.w, wy = Math.floor(w / g.map.w);
    let land = false;
    for (let dy = -4; dy <= 4 && !land; dy++) for (let dx = -4; dx <= 4 && !land; dx++) {
      const x = wx + dx, y = wy + dy;
      if (x < 0 || y < 0 || x >= g.map.w || y >= g.map.h) continue;
      const i = y * g.map.w + x;
      if (!isWater(g.pack, g.map, i) && passable(g.pack, g.map, i, 'vehicle')) land = true;
    }
    if (!land) return w;
  }
  throw new Error('no deep water on map');
}

/** A land cell beside a given water cell — orthogonal neighbours first so the
 *  centre distance stays within transport board range (256 <= REACH 288). */
function beachNextTo(g: Game, water: number): number {
  const wx = water % g.map.w, wy = Math.floor(water / g.map.w);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dx, dy] of dirs) {
    const x = wx + dx, y = wy + dy;
    if (x < 0 || y < 0 || x >= g.map.w || y >= g.map.h) continue;
    const i = y * g.map.w + x;
    if (!isWater(g.pack, g.map, i) && passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) return i;
  }
  throw new Error('no beach beside water cell');
}

function board(g: Game, ids: number[], craft: Entity, steps = 200) {
  g.enqueue(0, { t: 'enter', ids, target: craft.id });
  for (let i = 0; i < steps; i++) {
    g.step();
    const c = g.entities.get(craft.id);
    if (c && ids.every(id => { const u = g.entities.get(id); return u && u.carriedBy === c.id; })) return;
  }
}

function deploy(g: Game, ids: number[]) { g.enqueue(0, { t: 'deploy', ids }); g.step(); }

describe('PW15 landing craft', () => {
  it('is a naval heavy-cargo transport on the naval queue', () => {
    const def = PACK.units['landing-craft'];
    expect(def).toBeDefined();
    expect(def!.kind).toBe('naval');
    expect(def!.heavyCargo).toBe(true);
    expect(def!.transport).toBe(15);
    expect(def!.weapon).toBeUndefined(); // unarmed: meant to be escorted (D7)
    const g = new Game(setup());
    expect(g.queueFor('landing-craft')).toBe('naval');
    // Every faction may build it (no factions restriction).
    expect(def!.factions).toBeUndefined();
  });

  it('boards an MCV exclusively, sails, and the MCV deploys a yard on the far bank', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    // The MCV starts on the beach beside the craft — within board range.
    board(g, [mcv.id], craft);
    expect(g.entities.get(mcv.id)!.carriedBy).toBe(craft.id);
    expect(craft.passengers).toContain(mcv.id);

    // Exclusive run: nothing else may board while the MCV is aboard.
    const humvee = g.spawnUnit('humvee', 0, beachNextTo(g, cellOf(g, craft)));
    g.enqueue(0, { t: 'enter', ids: [humvee.id], target: craft.id });
    for (let i = 0; i < 100; i++) g.step();
    expect(g.entities.get(humvee.id)!.carriedBy).not.toBe(craft.id);
    expect(craft.passengers).not.toContain(humvee.id);

    // Unload at the shoreline: deploy on the craft releases the MCV aboard.
    deploy(g, [craft.id]);
    const landed = g.entities.get(mcv.id)!;
    expect(landed.carriedBy).toBe(0);
    expect(landed.hp).toBeGreaterThan(0);
    expect(passable(g.pack, g.map, cellOf(g, landed), 'vehicle')).toBe(true);

    // The MCV then deploys its construction yard — the first foothold. The
    // beach cell may be too tight for the 3x3 footprint, so step inland to
    // the nearest cell where the yard actually fits (same rule the game uses).
    const mw = g.map.w;
    const landedCell = cellOf(g, landed);
    const spot = landCells(g)
      .map(i => ({ i, d: Math.abs(i % mw - landedCell % mw) + Math.abs(Math.floor(i / mw) - Math.floor(landedCell / mw)) }))
      .sort((a, b) => a.d - b.d)
      .map(s => s.i)
      .find(i => {
        const cx = i % mw - 1, cy = Math.floor(i / mw) - 1; // fact is 3x3, centre it
        return cx >= 0 && cy >= 0 && g.canPlace(g.players[0], 'fact', cx, cy, true);
      });
    expect(spot).toBeDefined();
    landed.x = (spot! % mw + 0.5) * LEPTONS;
    landed.y = (Math.floor(spot! / mw) + 0.5) * LEPTONS;
    deploy(g, [mcv.id]);
    const yard = [...g.entities.values()].find(e => e.kind === 'structure' && e.type === 'fact' && e.owner === 0);
    expect(yard).toBeDefined();
  });

  it('carries five vehicles and refuses a sixth', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const beach = beachNextTo(g, cellOf(g, craft));
    const tanks = Array.from({ length: 6 }, () => g.spawnUnit('humvee', 0, beach));
    board(g, tanks.map(t => t.id), craft, 400);
    const aboard = craft.passengers.length;
    expect(aboard).toBe(5); // 15 seats / 3 per vehicle
    const left = tanks.filter(t => { const e = g.entities.get(t.id)!; return e.carriedBy !== craft.id; });
    expect(left).toHaveLength(1);
  });

  it('a craft already carrying vehicles refuses an MCV', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const beach = beachNextTo(g, cellOf(g, craft));
    const tanks = Array.from({ length: 2 }, () => g.spawnUnit('humvee', 0, beach));
    board(g, tanks.map(t => t.id), craft);
    expect(craft.passengers.length).toBe(2);

    const mcv = g.spawnUnit('mcv', 0, beach);
    g.enqueue(0, { t: 'enter', ids: [mcv.id], target: craft.id });
    for (let i = 0; i < 100; i++) g.step();
    expect(g.entities.get(mcv.id)!.carriedBy).not.toBe(craft.id);
  });

  it('blocked unloading over deep water leaves a recoverable valid state', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, deepWater(g));
    // Beach far away: park the MCV on any land, board by adjacency is
    // impossible — load it directly to isolate the unload rule.
    const mcv = g.spawnUnit('mcv', 0, landCells(g)[0]);
    craft.passengers.push(mcv.id);
    mcv.carriedBy = craft.id;
    mcv.x = craft.x; mcv.y = craft.y;

    deploy(g, [craft.id]);
    const still = g.entities.get(mcv.id)!;
    expect(still.carriedBy).toBe(craft.id); // refused over open water
    expect(still.hp).toBeGreaterThan(0);
    expect(craft.passengers).toContain(mcv.id);

    // Recoverable: sail the craft to the shoreline and the same unload works.
    const shore = shoreWater(g);
    craft.x = (shore % g.map.w + 0.5) * LEPTONS;
    craft.y = (Math.floor(shore / g.map.w) + 0.5) * LEPTONS;
    deploy(g, [craft.id]);
    expect(g.entities.get(mcv.id)!.carriedBy).toBe(0);
  });

  it('carrier death loses the cargo with salvage for both', () => {
    const g = new Game(setup(2));
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    board(g, [mcv.id], craft);
    expect(craft.passengers).toContain(mcv.id);

    const before = g.crates.filter(c => c.kind === 'salvage').length;
    g.damage(craft, craft.hp, 1, 0);
    for (let i = 0; i < 10; i++) g.step();
    // Craft and MCV both die with the carrier's killer credited (D7): each
    // drops a salvage crate — dead entities are removed, so absence = dead.
    expect(g.entities.get(craft.id)?.hp ?? 0).toBe(0);
    expect(g.entities.get(mcv.id)?.hp ?? 0).toBe(0);
    const salvage = g.crates.filter(c => c.kind === 'salvage');
    expect(salvage.length - before).toBeGreaterThanOrEqual(2);
  });

  it('protected-only cargo shares protection; the craft cannot be hurt', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    mcv.recoveryProtected = true; // the bound recovery MCV case (PW12+PW15)
    board(g, [mcv.id], craft);
    expect(craft.passengers).toContain(mcv.id);

    const hp = craft.hp;
    g.damage(craft, 500, 1, 0);
    g.step();
    expect(g.entities.get(craft.id)!.hp).toBe(hp); // damage refused both ways
  });

  it('mixed cargo is unprotected', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    const tank = g.spawnUnit('humvee', 0, beachNextTo(g, cellOf(g, craft)));
    mcv.recoveryProtected = true;
    // Inject a mixed manifest directly — legitimate boarding can never create
    // this state (heavy cargo is exclusive), but the rule must still hold.
    craft.passengers.push(mcv.id, tank.id);
    mcv.carriedBy = craft.id; tank.carriedBy = craft.id;
    mcv.x = craft.x; mcv.y = craft.y; tank.x = craft.x; tank.y = craft.y;

    const hp = craft.hp;
    g.damage(craft, 500, 1, 0);
    expect(g.entities.get(craft.id)!.hp).toBeLessThan(hp);
  });

  it('a craft with cargo cannot change hands (barter/transfer safety)', () => {
    const g = new Game(setup(2));
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    board(g, [mcv.id], craft);
    // transfer is persistent-only and owner-issued: slot 0 tries to hand the
    // laden craft to player 1 — it must be refused while cargo is aboard.
    g.enqueue(0, { t: 'transfer', ids: [craft.id], to: 1 });
    g.step();
    expect(g.entities.get(craft.id)!.owner).toBe(0);
    // After unloading, the empty craft transfers normally.
    deploy(g, [craft.id]);
    g.enqueue(0, { t: 'transfer', ids: [craft.id], to: 1 });
    g.step();
    expect(g.entities.get(craft.id)!.owner).toBe(1);
  });

  it('cargo survives a snapshot/restore cycle — no duplication on crash', () => {
    const g = new Game(setup());
    const craft = g.spawnUnit('landing-craft', 0, shoreWater(g));
    const mcv = g.spawnUnit('mcv', 0, beachNextTo(g, cellOf(g, craft)));
    board(g, [mcv.id], craft);
    expect(craft.passengers).toContain(mcv.id);

    const g2 = restoreGame(captureGame(g, { seed: 47 }), [PACK]);
    const c2 = [...g2.entities.values()].find(e => e.type === 'landing-craft')!;
    // Exactly one craft; the manifest is the single MCV cargo (the player's
    // own starter MCV is a separate entity elsewhere on the map).
    expect([...g2.entities.values()].filter(e => e.type === 'landing-craft')).toHaveLength(1);
    expect(c2.passengers).toHaveLength(1);
    const cargo = g2.entities.get(c2.passengers[0])!;
    expect(cargo.type).toBe('mcv');
    expect(cargo.carriedBy).toBe(c2.id);
  });
});
