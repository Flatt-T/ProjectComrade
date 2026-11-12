// PW18: cross-region transfer — a unit walks to the map edge under a 'depart'
// order, leaves with a full state manifest (no death, no salvage), and
// spawnTransfer materializes it on the destination sim with stable durable
// identity, cargo nesting and owner-by-pid resolution.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, passable, restoreGame,
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
