// PW31 (THU-2442): the persistent client's tick-ordered effect buffer. Remote
// commands must apply at their original simulated tick in journal order,
// deduplicated by effect identity; a delayed checksum must still be compared
// from per-tick history, and any unrecoverable divergence requests exactly one
// resnapshot (debounced).
import { describe, expect, it, vi } from 'vitest';
import { Game, TICKS_PER_SECOND, type Command, type GameSetup } from '../../packages/fusion/src/index';
import { CLASSIC_PACKS } from '../../packages/fusion/src/index';
import { PersistentSession, type MmoConnection } from '../../apps/web/src/mmo.js';

const PACK = CLASSIC_PACKS[0];
const STEP_MS = 1000 / TICKS_PER_SECOND;

function setup(): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent: true,
    mmo: {
      structureHpMultiplier: 1, supplyCap: 0,
      upkeepPerPointPerMinute: 0, maxCompounds: 0,
      shieldRadiusCells: 4,
    },
    players: [{ name: 'P0', faction: PACK.factions[0].id, ai: false }],
  };
}

function fakeConn() {
  const sent: unknown[] = [];
  const conn = {
    command: (a: unknown) => sent.push(a),
    on: () => () => undefined,
    close: () => undefined,
  } as unknown as MmoConnection;
  return { conn, sent };
}

function sessionFor(g: Game) {
  const { conn } = fakeConn();
  const s = new PersistentSession(g, 0, conn, 'region-test');
  const resync = vi.fn();
  s.onNeedResync = resync;
  return { s, resync };
}

function steps(s: PersistentSession, n: number) {
  for (let i = 0; i < n; i++) s.update(STEP_MS + 1);
}

describe('PW31 tick-ordered remote effects', () => {
  it('applies effects at their original tick in journal order', () => {
    const g = new Game(setup());
    const unit = g.spawnUnit('minigunner', 0, g.map.w * 10 + 10);
    const { s } = sessionFor(g);

    // Spy on the engine's enqueue to observe the exact scheduled ticks.
    const enqueued: number[] = [];
    const orig = g.enqueue.bind(g);
    g.enqueue = (slot: number, cmd: Command, atTick?: number) => {
      enqueued.push(atTick ?? g.tick + 1);
      orig(slot, cmd, atTick);
    };

    const t0 = g.tick;
    const moveA: Command = { t: 'move', ids: [unit.id], x: 20, y: 20 };
    const moveB: Command = { t: 'move', ids: [unit.id], x: 40, y: 40 };
    // Arrive out of order: the later-tick effect lands first.
    s.applyRemote(t0 + 6, 0, moveB, 'k-b');
    s.applyRemote(t0 + 3, 0, moveA, 'k-a');

    steps(s, 3); // reach t0+3: moveA applies here
    expect(enqueued).toEqual([t0 + 3]);
    steps(s, 3); // reach t0+6: moveB applies here
    expect(enqueued).toEqual([t0 + 3, t0 + 6]);
  });

  it('deduplicates effects by identity but keeps same-sequence distinct effects', () => {
    const g = new Game(setup());
    const u1 = g.spawnUnit('minigunner', 0, g.map.w * 10 + 10);
    const u2 = g.spawnUnit('minigunner', 0, g.map.w * 10 + 12);
    const { s } = sessionFor(g);
    const enqueued: number[] = [];
    const orig = g.enqueue.bind(g);
    g.enqueue = (slot: number, cmd: Command, atTick?: number) => {
      enqueued.push(atTick ?? g.tick + 1); orig(slot, cmd, atTick);
    };

    const t0 = g.tick;
    const cmd: Command = { t: 'stop', ids: [u1.id] };
    s.applyRemote(t0 + 2, 0, cmd, 'seq-1:fx-a');
    s.applyRemote(t0 + 2, 0, cmd, 'seq-1:fx-a'); // exact duplicate — dropped
    s.applyRemote(t0 + 2, 0, { t: 'stop', ids: [u2.id] }, 'seq-1:fx-b'); // same seq, different effect
    steps(s, 2);
    expect(enqueued).toEqual([t0 + 2, t0 + 2]);
  });

  it('requests one debounced resnapshot for a late or diverged effect', () => {
    const g = new Game(setup());
    const unit = g.spawnUnit('minigunner', 0, g.map.w * 10 + 10);
    const { s, resync } = sessionFor(g);

    // Effect whose tick already passed — cannot be applied faithfully.
    s.applyRemote(g.tick - 1, 0, { t: 'stop', ids: [unit.id] }, 'late');
    expect(resync).toHaveBeenCalledTimes(1);
    s.applyRemote(g.tick - 2, 0, { t: 'stop', ids: [unit.id] }, 'late2');
    expect(resync).toHaveBeenCalledTimes(1); // debounced
  });

  it('compares delayed checksums from per-tick history', () => {
    const g = new Game(setup());
    const { s, resync } = sessionFor(g);
    steps(s, 10);
    const pastTick = g.tick - 5;
    // The checksum the server recorded for that tick: read it back honestly.
    const honest = (s as unknown as { checksumHist: Map<number, number> }).checksumHist.get(pastTick)!;
    s.observeChecksum(pastTick, honest, 'e1', performance.now());
    expect(resync).not.toHaveBeenCalled();
    s.observeChecksum(pastTick, honest ^ 0xffff, 'e1', performance.now());
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('trails the authoritative tick by the render delay once anchored', () => {
    const g = new Game(setup());
    const { s } = sessionFor(g);
    // Anchor far ahead: the estimate horizon caps how far the client may step.
    s.noteServerTick(g.tick + 100, performance.now(), 'e1');
    for (let i = 0; i < 40; i++) s.update(STEP_MS + 1);
    // horizon ≈ (tick+100+elapsed) - 10 → ~90 ticks of headroom; 40 steps all ran.
    expect(g.tick).toBeGreaterThanOrEqual(40);
    // Now anchor only just ahead of the render delay: stepping must stall.
    const stalled = g.tick;
    s.noteServerTick(stalled + 5, performance.now(), 'e1');
    for (let i = 0; i < 30; i++) s.update(STEP_MS + 1);
    expect(g.tick).toBeLessThanOrEqual(stalled + 5);
    expect(g.tick - stalled).toBeLessThanOrEqual(6);
  });
});
