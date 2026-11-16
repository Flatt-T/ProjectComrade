// PW18: cross-region transfer — a unit walks to the map edge under a 'depart'
// order, leaves with a full state manifest (no death, no salvage), and
// spawnTransfer materializes it on the destination sim with stable durable
// identity, cargo nesting and owner-by-pid resolution.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, isWater, passable, restoreGame,
  type Entity, type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'
const MAP = 'td-tiberium-gardens';
const PID_A = '11111111-1111-4111-8111-111111111111';
const PID_B = '22222222-2222-4222-8222-222222222222';

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 0, recoveryBuildRoles: [],
  salvage: { percentOfCost: 25, decaySeconds: 600, mismatchFloorRatio: 0, scoreWeights: { structure: 1, unit: 1, tech: 0 } },
};

function setup(pids = [PID_A]): GameSetup {
  return {
    pack: PACK, mapId: MAP, seed: 11, persistent: true, mmo: TUNING,
    players: pids.map((pid, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
      playerId: pid,
    })),
  };
}

/** A vehicle-passable cell biased toward a map corner — short depart walk. */
const landNear = (g: Game, corner: 'nw' | 'se' = 'nw'): number => {
  const w = g.map.w, h = g.map.h;
  const xs = corner === 'nw' ? [2, 3, 4, 5, 6] : [w - 7, w - 6, w - 5, w - 4, w - 3];
  const ys = corner === 'nw' ? [2, 3, 4, 5, 6] : [h - 7, h - 6, h - 5, h - 4, h - 3];
  for (const y of ys) for (const x of xs) {
    const i = y * w + x;
    if (passable(PACK, g.map, i, 'vehicle') && !g.map.occupied[i]) return i;
  }
  for (let i = 0; i < w * h; i++) {
    if (passable(PACK, g.map, i, 'vehicle') && !g.map.occupied[i]) return i;
  }
  throw new Error('no land cell');
};

/** Issue depart and step until the entity leaves or the walk budget ends. */
function depart(g: Game, e: Entity, maxSteps = 3000): boolean {
  g.enqueue(e.owner, { t: 'depart', ids: [e.id] });
  for (let i = 0; i < maxSteps && g.entities.has(e.id); i++) g.step();
  return !g.entities.has(e.id);
}

describe('PW18 depart + manifest', () => {
  it('walks to the edge, emits one manifest event and leaves no corpse', () => {
    const g = new Game(setup());
    const u = g.spawnUnit('lighttank', 0, landNear(g));
    const hp = u.hp;
    expect(depart(g, u)).toBe(true);
    expect(g.departEvents.length).toBe(1);
    const ev = g.departEvents[0];
    expect(ev.simId).toBe(u.id);
    expect(ev.manifest.type).toBe('lighttank');
    expect(ev.manifest.hp).toBe(hp);
    expect(ev.manifest.ownerPid).toBe(PID_A);
    expect(ev.manifest.kind).toBe('unit');
    // Departure is not a death: no salvage spawn, no kill credit path.
    expect(g.salvageEvents.filter(e => e.kind === 'spawn')).toHaveLength(0);
  });

  it('departEvents only fire on actual edge arrival', () => {
    const g = new Game(setup());
    const u = g.spawnUnit('lighttank', 0, landNear(g, 'se'));
    g.enqueue(0, { t: 'depart', ids: [u.id] });
    for (let i = 0; i < 60; i++) g.step();
    for (const ev of g.departEvents) expect(g.entities.has(ev.simId)).toBe(false);
  });

  it('transferManifest captures unit state and spawnTransfer rebuilds it', () => {
    const src = new Game(setup([PID_A]));
    const u = src.spawnUnit('lighttank', 0, landNear(src));
    u.hp = Math.floor(u.maxHp / 2); u.xp = 7; u.rank = 2; u.bound = 1; u.durableId = 'dur-1';
    const m = src.transferManifest(u);
    expect(m.type).toBe('lighttank');
    expect(m.hp).toBe(Math.floor(u.maxHp / 2));
    expect(m.ownerPid).toBe(PID_A);
    expect(m.cargoUnits).toBeUndefined();

    // Destination: same pid but a different slot index.
    const dst = new Game(setup([PID_B, PID_A]));
    const id = dst.spawnTransfer(m, landNear(dst), 'transfer-uuid');
    expect(id).not.toBeNull();
    const e = dst.entities.get(id!)!;
    expect(e.owner).toBe(1); // PID_A's slot in the destination roster
    expect(e.type).toBe('lighttank');
    expect(e.hp).toBe(Math.floor(u.maxHp / 2));
    expect(e.xp).toBe(7);
    expect(e.rank).toBe(2);
    expect(e.bound).toBe(1);
    expect(e.durableId).toBe('transfer-uuid');
    expect(e.order).toBe('idle');
  });

  it('spawnTransfer nests transport cargo recursively', () => {
    const src = new Game(setup([PID_A]));
    // APC is a transport in the TD pack.
    const apc = src.spawnUnit('apc', 0, landNear(src));
    const rider = src.spawnUnit('commando', 0, landNear(src, 'se'));
    src.entities.get(rider.id)!.hp = Math.floor(rider.maxHp / 2);
    // Board the rider directly (engine enter logic is covered by PW15 tests).
    src.entities.get(apc.id)!.passengers.push(rider.id);
    src.entities.get(rider.id)!.carriedBy = apc.id;
    src.entities.get(rider.id)!.x = apc.x; src.entities.get(rider.id)!.y = apc.y;

    const m = src.transferManifest(apc);
    expect(m.cargoUnits).toHaveLength(1);
    expect(m.cargoUnits![0].type).toBe('commando');
    expect(m.cargoUnits![0].hp).toBe(Math.floor(rider.maxHp / 2));

    const dst = new Game(setup([PID_A]));
    const id = dst.spawnTransfer(m, landNear(dst), 'tid')!;
    const carrier = dst.entities.get(id)!;
    expect(carrier.passengers).toHaveLength(1);
    const cargo = dst.entities.get(carrier.passengers[0])!;
    expect(cargo.carriedBy).toBe(id);
    expect(cargo.type).toBe('commando');
    expect(cargo.hp).toBe(Math.floor(rider.maxHp / 2));
  });

  it('spawnTransfer rejects the whole crossing when a passenger cannot be restored', () => {
    const src = new Game(setup([PID_A]));
    const apc = src.spawnUnit('apc', 0, landNear(src));
    const rider = src.spawnUnit('commando', 0, landNear(src, 'se'));
    src.entities.get(apc.id)!.passengers.push(rider.id);
    src.entities.get(rider.id)!.carriedBy = apc.id;
    src.entities.get(rider.id)!.x = apc.x; src.entities.get(rider.id)!.y = apc.y;
    const m = src.transferManifest(apc);
    expect(m.cargoUnits).toHaveLength(1);

    // Destination pack lacks the rider definition: the carrier must not
    // arrive empty — the entire transfer stays recoverable (null).
    const broken = JSON.parse(JSON.stringify(m));
    broken.cargoUnits[0].type = 'unit-not-in-this-pack';
    const dst = new Game(setup([PID_A]));
    const before = dst.entities.size;
    expect(dst.spawnTransfer(broken, landNear(dst))).toBeNull();
    expect(dst.entities.size).toBe(before);

    // Same for a passenger whose owner has no slot here.
    const orphan = JSON.parse(JSON.stringify(m));
    orphan.cargoUnits[0].ownerPid = PID_B;
    expect(dst.spawnTransfer(orphan, landNear(dst))).toBeNull();
    expect(dst.entities.size).toBe(before);

    // The intact manifest still crosses with its passenger.
    const id = dst.spawnTransfer(m, landNear(dst))!;
    expect(dst.entities.get(id)!.passengers).toHaveLength(1);
  });

  it('spawnTransfer returns null when the owner has no slot', () => {
    const src = new Game(setup([PID_A]));
    const u = src.spawnUnit('lighttank', 0, landNear(src));
    const m = src.transferManifest(u);
    const dst = new Game(setup([PID_B]));
    expect(dst.spawnTransfer(m, landNear(dst))).toBeNull();
  });

  it('durableId survives snapshot/restore', () => {
    const g = new Game(setup());
    const u = g.spawnUnit('lighttank', 0, landNear(g));
    u.durableId = '11111111-2222-3333-4444-555555555555';
    const snap = captureGame(g, { seed: 11 });
    const r = restoreGame(snap, [PACK]);
    const e = [...r.entities.values()].find(x => x.id === u.id)!;
    expect(e.durableId).toBe(u.durableId);
  });

  it('restore re-arms departEvents (pending drains are recovered via PREPARED sweep)', () => {
    const g = new Game(setup());
    const u = g.spawnUnit('lighttank', 0, landNear(g));
    depart(g, u);
    expect(g.departEvents.length).toBe(1);
    const snap = captureGame(g, { seed: 11 });
    const r = restoreGame(snap, [PACK]);
    // departEvents is re-armed empty on restore: the durable PREPARED row plus
    // the missing entity is what the runner's sweep keys on, not the queue.
    expect(r.departEvents).toEqual([]);
    expect(r.entities.has(u.id)).toBe(false);
  });

  it('unspawnTransfer removes a spawned unit quietly', () => {
    const g = new Game(setup());
    const u = g.spawnUnit('lighttank', 0, landNear(g));
    const m = g.transferManifest(u);
    const dst = new Game(setup([PID_A]));
    const id = dst.spawnTransfer(m, landNear(dst))!;
    expect(dst.entities.has(id)).toBe(true);
    dst.unspawnTransfer(id);
    expect(dst.entities.has(id)).toBe(false);
    expect(dst.salvageEvents.filter(e => e.kind === 'spawn')).toHaveLength(0);
  });
});

describe('PW18/THU-2242 spawn-cell search', () => {
  const GARDENS = 'td-tiberium-gardens';
  const gardenSetup = (pids = [PID_A]): GameSetup => ({
    pack: PACK, mapId: GARDENS, seed: 11, persistent: true, mmo: TUNING,
    players: pids.map((pid, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
      playerId: pid,
    })),
  });
  const cheb = (a: number, b: number, w: number) =>
    Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w)));

  it('falls through to the 9–40 cell ring when the near field is full', () => {
    const dst = new Game(gardenSetup());
    const w = dst.map.w;
    // Origin: an open vehicle cell near the map centre.
    let origin = -1;
    for (let y = dst.map.h >> 1; y < dst.map.h; y++) {
      for (let x = dst.map.w >> 1; x < dst.map.w; x++) {
        const i = y * w + x;
        if (passable(PACK, dst.map, i, 'vehicle') && !dst.map.occupied[i] && !dst.unitInCell(i)) { origin = i; break; }
      }
      if (origin >= 0) break;
    }
    expect(origin).toBeGreaterThanOrEqual(0);
    // Saturate every passable cell within Chebyshev radius 8 — including the
    // origin — so the inner search cannot succeed.
    const ox = origin % w, oy = Math.floor(origin / w);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const x = ox + dx, y = oy + dy;
      if (x < 0 || y < 0 || x >= w || y >= dst.map.h) continue;
      const i = y * w + x;
      if (passable(PACK, dst.map, i, 'vehicle') && !dst.map.occupied[i] && !dst.unitInCell(i)) {
        dst.spawnUnit('commando', 0, i);
      }
    }
    // Sanity: the origin itself is now blocked.
    expect(dst.unitInCell(origin)).toBeDefined();
    // A lawful cell must exist in the 9–40 ring (open map, radius 40 reaches
    // well past the saturated disc).
    const src = new Game(setup([PID_A]));
    const m = src.transferManifest(src.spawnUnit('lighttank', 0, landNear(src)));
    const id = dst.spawnTransfer(m, origin, 'tid-far');
    expect(id).not.toBeNull();
    const e = dst.entities.get(id!)!;
    // The spawn MUST land outside the saturated disc — proof the wider search ran.
    expect(cheb(dst.cellOf(e), origin, w)).toBeGreaterThan(8);
    expect(e.durableId).toBe('tid-far');
  });

  it('refuses a naval manifest when no water exists in range (truly blocked)', () => {
    const dst = new Game(gardenSetup());
    const src = new Game(setup([PID_A]));
    // td-tiberium-gardens has zero water cells (verified: 80x80, 0 water).
    const boat = src.spawnUnit('gunboat', 0, landNear(src));
    const m = src.transferManifest(boat);
    expect(m.type).toBe('gunboat');
    const before = dst.entities.size;
    for (const cell of [landNear(dst), landNear(dst, 'se'), (dst.map.h >> 1) * dst.map.w + (dst.map.w >> 1)]) {
      expect(dst.spawnTransfer(JSON.parse(JSON.stringify(m)), cell)).toBeNull();
    }
    expect(dst.entities.size).toBe(before);
  });

  it('lands a ground manifest on a bank when the requested cell is water', () => {
    const dst = new Game({ ...gardenSetup(), mapId: 'td-landing' });
    const src = new Game(setup([PID_A]));
    const m = src.transferManifest(src.spawnUnit('lighttank', 0, landNear(src)));
    // td-landing: vertical water channel around x=28..43 — request mid-channel.
    const w = dst.map.w, waterCell = 32 * w + 35;
    expect(isWater(PACK, dst.map, waterCell)).toBe(true);
    const id = dst.spawnTransfer(m, waterCell, 'tid-bank');
    expect(id).not.toBeNull();
    const e = dst.entities.get(id!)!;
    const ec = dst.cellOf(e);
    expect(isWater(PACK, dst.map, ec)).toBe(false);
    expect(cheb(ec, waterCell, w)).toBeLessThanOrEqual(40);
  });
});

describe('PW18/THU-2242 order preservation across transfer', () => {
  it('restores a move order with a fresh path on the same map', () => {
    const src = new Game(setup([PID_A]));
    const u = src.spawnUnit('lighttank', 0, landNear(src));
    const goal = landNear(src, 'se');
    src.enqueue(0, { t: 'move', ids: [u.id], x: goal % src.map.w, y: Math.floor(goal / src.map.w) });
    src.step();
    expect(u.order).toBe('move');
    const m = src.transferManifest(u);
    expect(m.order).toBe('move');
    expect(m.goalCell).toBe(u.goal);
    expect(m.packId).toBe(PACK.id);
    expect(m.mapId).toBe(MAP);

    const dst = new Game(setup([PID_A]));
    const id = dst.spawnTransfer(m, landNear(dst))!;
    const e = dst.entities.get(id)!;
    expect(e.order).toBe('move');
    expect(e.goal).toBe(m.goalCell);
    // The destination recomputes the route — the source path is not carried.
    expect(e.path.length).toBeGreaterThan(0);
  });

  it('resolves entity-bound orders to idle at the destination', () => {
    const src = new Game(setup([PID_A]));
    const u = src.spawnUnit('lighttank', 0, landNear(src));
    u.order = 'attack'; u.target = 424242;
    const m = src.transferManifest(u);
    expect(m.order).toBe('attack');
    const dst = new Game(setup([PID_A]));
    const id = dst.spawnTransfer(m, landNear(dst))!;
    const e = dst.entities.get(id)!;
    expect(e.order).toBe('idle');
    expect(e.target).toBe(0);
  });

  it('does not restore position orders when the destination map differs', () => {
    const src = new Game(setup([PID_A]));
    const u = src.spawnUnit('lighttank', 0, landNear(src));
    const goal = landNear(src, 'se');
    src.enqueue(0, { t: 'move', ids: [u.id], x: goal % src.map.w, y: Math.floor(goal / src.map.w) });
    src.step();
    const m = src.transferManifest(u);
    expect(m.order).toBe('move');
    // Same pack, different map — cell coordinates are meaningless there.
    const dst = new Game({ ...setup([PID_A]), mapId: 'td-river-crossing' });
    const id = dst.spawnTransfer(m, landNear(dst))!;
    expect(dst.entities.get(id)!.order).toBe('idle');
  });
});
