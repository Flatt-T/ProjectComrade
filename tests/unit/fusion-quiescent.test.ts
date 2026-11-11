// PW22: quiescent fast-forward — the arithmetic advance a hibernated region applies
// at wake. Runs the real deterministic sim: production queues must advance exactly
// as live stepping would, and measured harvest income must accrue storage-capped.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, type Command, type GameSetup,
} from '../../packages/fusion/src/index';

const setup = (pack: GameSetup['pack'], seed = 7): GameSetup => ({
  pack, mapId: pack.maps[0].id, seed, persistent: true,
  players: [
    { name: 'A', faction: pack.factions[0].id, ai: false },
    { name: 'B', faction: pack.factions[1].id, ai: false },
  ],
});

function step(game: Game, ticks: number, commands: { at: number; slot: number; cmd: Command }[] = []) {
  for (let i = 0; i < ticks; i++) {
    for (const c of commands) if (c.at === game.tick) game.enqueue(c.slot, c.cmd);
    game.step();
  }
}

/** Deploy player 0's MCV so the construction yard exists. Returns the yard entity. */
function deployYard(game: Game) {
  const mcv = [...game.entities.values()].find(e =>
    e.kind === 'unit' && e.owner === 0 && game.pack.units[e.type]?.deploysTo);
  expect(mcv).toBeDefined();
  game.enqueue(0, { t: 'deploy', ids: [mcv!.id] });
  step(game, 90);
  const yard = [...game.entities.values()].find(e =>
    e.kind === 'structure' && e.owner === 0 && game.pack.structures[e.type].constructionYard);
  expect(yard).toBeDefined();
  return yard!;
}

describe('PW22 fastForwardQuiescent', () => {
  it('rejects non-persistent games', () => {
    const g = new Game({ ...setup(CLASSIC_PACKS[0]), persistent: false });
    expect(() => g.fastForwardQuiescent(10, [0, 0])).toThrow(/persistent/);
  });

  it('advances production queues identically to live stepping', () => {
    const pack = CLASSIC_PACKS[0];
    const live = new Game(setup(pack, 99));
    const ff = new Game(setup(pack, 99));
    deployYard(live);
    deployYard(ff);
    // Queue the same buildable structure on both games.
    const item = live.buildOptions(live.players[0], 'structure')[0];
    expect(item).toBeDefined();
    for (const g of [live, ff]) {
      g.players[0].credits = 1_000_000; // affordability never binds → paid path identical
      g.enqueue(0, { t: 'build', item });
    }
    step(live, 2); step(ff, 2); // let the build command apply on both
    expect(ff.players[0].queues.structure.items).toEqual([item]);

    const N = 20_000;
    step(live, N);
    const tickBefore = ff.tick;
    ff.fastForwardQuiescent(N, [0, 0]);
    expect(ff.tick).toBe(tickBefore); // the interval is wall-time, not sim ticks

    // Queue progression must match live stepping exactly: same paid, acc, ready.
    const qLive = live.players[0].queues.structure;
    const qFf = ff.players[0].queues.structure;
    expect(qFf.paid).toBe(qLive.paid);
    expect(qFf.acc).toBe(qLive.acc);
    expect(qFf.ready).toBe(qLive.ready);
    expect(qFf.items).toEqual(qLive.items);
  });

  it('completes a queued building that falls due inside the quiescent interval', () => {
    const g = new Game(setup(CLASSIC_PACKS[0], 5));
    deployYard(g);
    const options = g.buildOptions(g.players[0], 'defense');
    expect(options.length).toBeGreaterThan(0);
    g.players[0].credits = 1_000_000;
    g.enqueue(0, { t: 'build', item: options[0] });
    step(g, 2); // let the build command apply
    // The queue kind is 'defense', not 'structure' — find it dynamically.
    const kind = g.queueFor(options[0])!;
    expect(g.players[0].queues[kind].items).toEqual([options[0]]);
    g.fastForwardQuiescent(2_000_000, [0, 0]);
    const q = g.players[0].queues[kind];
    expect(q.ready).toBe(true);
    expect(q.items[0]).toBe(options[0]); // stays queued until placed, as live
  });

  it('accrues measured harvest income per tick, storage-capped', () => {
    const g = new Game(setup(CLASSIC_PACKS[0], 3));
    const p = g.players[0];
    p.credits = 100;
    p.storage = 400;
    p.incomeBonus = 0;
    g.fastForwardQuiescent(1_000, [0.5, 0]); // 0.5 credits/tick → 500 delivered
    expect(p.credits).toBe(400); // pinned at capacity
    // stats.harvested counts delivered value including the capped overflow,
    // exactly like the live unload path.
    expect(p.stats.harvested).toBe(500);
  });

  it('accrues without a storage cap when storage is unlimited', () => {
    const g = new Game(setup(CLASSIC_PACKS[0], 4));
    const p = g.players[0];
    p.credits = 100;
    p.storage = 0;
    g.fastForwardQuiescent(1_000, [2, 0]);
    expect(p.credits).toBe(2_100);
    expect(p.stats.harvested).toBe(2_000);
  });

  it('is deterministic: same interval and rates give identical state', () => {
    const a = new Game(setup(CLASSIC_PACKS[0], 8));
    const b = new Game(setup(CLASSIC_PACKS[0], 8));
    a.fastForwardQuiescent(5_000, [1.25, 0.75]);
    b.fastForwardQuiescent(5_000, [1.25, 0.75]);
    expect(a.checksum()).toBe(b.checksum());
    expect(a.players[0].credits).toBe(b.players[0].credits);
    expect(a.players[1].credits).toBe(b.players[1].credits);
  });
});
