// PW21: persistent-region engine — snapshot/restore replay equality across all four
// classic packs, join/leave without match-over, ownership transfer, headless
// endurance and measurements. Everything runs the real deterministic sim.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame, parseCommand,
  type Command, type GameSetup,
} from '../../packages/fusion/src/index';

const LONG_TIMEOUT = process.env.PW21_LONG === '1' ? 1_800_000 : 120_000;

const setup = (pack: GameSetup['pack'], seed = 11, persistent = false): GameSetup => ({
  pack, mapId: pack.maps[0].id, seed,
  players: [
    { name: 'A', faction: pack.factions[0].id, ai: true },
    { name: 'B', faction: pack.factions[1].id, ai: true },
  ],
  persistent,
});

function runTicks(game: Game, from: number, to: number, commands: { at: number; slot: number; cmd: Command }[] = []) {
  const sums: number[] = [];
  for (let t = from; t < to; t++) {
    for (const c of commands) if (c.at === t) game.enqueue(c.slot, c.cmd);
    game.step();
    if (game.tick % 25 === 0) sums.push(game.checksum());
  }
  return { sums, final: game.checksum() };
}

describe('PW21 snapshot/restore', () => {
  for (const pack of CLASSIC_PACKS) {
    it(`${pack.id}: restore at tick N replays to identical checksums`, () => {
      const a = new Game(setup(pack, 42));
      runTicks(a, 0, 200);
      const snap = captureGame(a, { seed: 42 });
      const mid = a.checksum();
      const expected = runTicks(a, 200, 800);

      const b = restoreGame(snap, CLASSIC_PACKS);
      expect(b.tick).toBe(200);
      expect(b.checksum()).toBe(mid);
      const actual = runTicks(b, 200, 800);
      expect(actual.final).toBe(expected.final);
      expect(actual.sums).toEqual(expected.sums);
    });
  }

  it('restored game has identical entity ids, next id and pending commands', () => {
    const a = new Game(setup(CLASSIC_PACKS[0], 5));
    const unit = [...a.entities.values()].find(e => e.kind === 'unit')!;
    a.enqueue(0, { t: 'move', ids: [unit.id], x: 40, y: 40 });
    runTicks(a, 0, 100);
    const b = restoreGame(captureGame(a, { seed: 5 }), CLASSIC_PACKS);
    expect(b.entities.size).toBe(a.entities.size);
    expect([...b.entities.keys()].sort((x, y) => x - y)).toEqual([...a.entities.keys()].sort((x, y) => x - y));
    expect((b as unknown as { nextId: number }).nextId).toBe((a as unknown as { nextId: number }).nextId);
    expect(b.checksum()).toBe(a.checksum());
  });
});

describe('PW21 persistent profile', () => {
  const psetup = (pack: GameSetup['pack'], seed = 21): GameSetup => setup(pack, seed, true);

  it('join and leave keep every client in checksum lockstep', () => {
    const commands = [
      { at: 120, slot: -1, cmd: { t: 'join', player: { name: 'C', faction: CLASSIC_PACKS[0].factions[0].id, ai: true } } as Command },
      { at: 240, slot: -1, cmd: { t: 'leave', slot: 1 } as Command },
    ];
    const a = new Game(psetup(CLASSIC_PACKS[0]));
    const b = new Game(psetup(CLASSIC_PACKS[0]));
    const ra = runTicks(a, 0, 600, commands);
    const rb = runTicks(b, 0, 600, commands);
    expect(ra.final).toBe(rb.final);
    expect(a.players).toHaveLength(3);
    expect(a.players[1].connected).toBe(false);
    expect(a.players[2].connected).toBe(true);
    // The joiner actually deployed a base.
    expect([...a.entities.values()].some(e => e.owner === 2)).toBe(true);
  });

  it('classic matches ignore join/leave/transfer commands', () => {
    const game = new Game(setup(CLASSIC_PACKS[0]));
    const ownersBefore = new Map([...game.entities.values()].map(e => [e.id, e.owner]));
    const unitId = [...game.entities.values()].find(e => e.kind === 'unit')!.id;
    game.enqueue(-1, { t: 'join', player: { name: 'X', faction: game.pack.factions[0].id, ai: false } });
    game.enqueue(-1, { t: 'leave', slot: 0 });
    game.enqueue(0, { t: 'transfer', ids: [unitId], to: 1 });
    runTicks(game, 0, 10); // before the first AI think, so nothing else can move
    expect(game.players).toHaveLength(2);
    expect(game.players[0].connected).toBe(true);
    for (const [id, owner] of ownersBefore) {
      const e = game.entities.get(id);
      if (e) expect(e.owner).toBe(owner);
    }
  });

  it('transfer keeps position, health and orders; rejects dead and foreign entities', () => {
    const game = new Game(psetup(CLASSIC_PACKS[0]));
    runTicks(game, 0, 60);
    const unit = [...game.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0)!;
    unit.hp = Math.max(1, unit.hp - 10); // mid-combat damage
    const before = { x: unit.x, y: unit.y, hp: unit.hp, order: unit.order };
    game.enqueue(0, { t: 'transfer', ids: [unit.id], to: 1 });
    // A dead entity cannot be transferred (hp <= 0 is skipped).
    const other = [...game.entities.values()].find(e => e.kind === 'unit' && e.owner === 1 && e.hp > 0)!;
    other.hp = 0;
    game.enqueue(1, { t: 'transfer', ids: [other.id], to: 0 });
    // Player 1 cannot take player 0's property.
    game.enqueue(1, { t: 'transfer', ids: [unit.id], to: 1 });
    game.step();
    const after = game.entities.get(unit.id)!;
    expect(after.owner).toBe(1);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.hp).toBe(before.hp);
    expect(after.order).toBe(before.order);
    // Dead entity was cleaned up, never transferred.
    expect(game.entities.get(other.id)).toBeUndefined();
    // The second transfer attempt by slot 1 targeted an entity it did not own at issue time —
    // after the first transfer it DID own it, so issue a fresh foreign attempt instead:
    const foreign = [...game.entities.values()].find(e => e.owner === 0)!;
    game.enqueue(1, { t: 'transfer', ids: [foreign.id], to: 1 });
    game.step();
    expect(game.entities.get(foreign.id)!.owner).toBe(0);
  });

  it('persistent regions have no match-over; classic still ends', () => {
    const pgame = new Game(psetup(CLASSIC_PACKS[0]));
    runTicks(pgame, 0, 30);
    // Everyone but slot 0 surrenders: classic would end, persistent must not.
    for (const slot of [1]) pgame.enqueue(slot, { t: 'surrender' });
    runTicks(pgame, 30, 400);
    expect(pgame.over).toBe(false);
    expect(pgame.tick).toBe(400);

    const cgame = new Game(setup(CLASSIC_PACKS[0]));
    runTicks(cgame, 0, 30);
    cgame.enqueue(1, { t: 'surrender' });
    runTicks(cgame, 30, 400);
    expect(cgame.over).toBe(true);
  });

  it('a disconnected player cannot issue commands but their base keeps running', () => {
    const idle: GameSetup = { ...psetup(CLASSIC_PACKS[0]), players: [
      { name: 'A', faction: CLASSIC_PACKS[0].factions[0].id, ai: false },
      { name: 'B', faction: CLASSIC_PACKS[0].factions[1].id, ai: false },
    ] };
    const game = new Game(idle);
    runTicks(game, 0, 100);
    const unit = [...game.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0)!;
    const before = { goal: unit.goal, order: unit.order };
    game.enqueue(-1, { t: 'leave', slot: 0 });
    game.enqueue(0, { t: 'move', ids: [unit.id], x: 10, y: 10 });
    game.step(); // tick 101: leave sorts first (slot -1), then the ignored move
    expect(game.players[0].connected).toBe(false);
    const after = game.entities.get(unit.id)!;
    expect(after.goal).toBe(before.goal);
    expect(after.order).toBe(before.order);
    runTicks(game, 101, 1600);
    // The offline base keeps simulating: its assets stay alive and the world runs on.
    expect(game.over).toBe(false);
    expect([...game.entities.values()].filter(e => e.owner === 0 && e.hp > 0).length).toBeGreaterThan(0);
  });
});

describe('PW21 headless endurance and measurements', () => {
  it('runs simulated hours headless with stable memory and reports costs', () => {
    const LONG = process.env.PW21_LONG === '1';
    const hours = LONG ? 24 : 2;
    const ticks = hours * 3600 * 15;
    const game = new Game({ ...setup(CLASSIC_PACKS[3], 77), persistent: true });
    const before = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    let entities = 0, maxEntities = 0;
    for (let i = 0; i < ticks; i++) {
      game.step();
      if (i % 4500 === 0) { entities = game.entities.size; maxEntities = Math.max(maxEntities, entities); }
    }
    const elapsed = Date.now() - t0;
    const after = process.memoryUsage().heapUsed;
    const snap = captureGame(game, { seed: 77 });
    // eslint-disable-next-line no-console
    console.log(`[pw21] ${hours}h=${ticks} ticks in ${elapsed}ms (${(elapsed / ticks).toFixed(4)}ms/tick), ` +
      `entities=${entities} max=${maxEntities}, heap Δ=${((after - before) / 1048576).toFixed(1)}MB, snapshot=${(snap.length / 1024).toFixed(0)}KB`);
    expect(game.tick).toBe(ticks);
    expect(game.over).toBe(false);
    // A restored copy continues identically.
    const b = restoreGame(snap, CLASSIC_PACKS);
    for (let i = 0; i < 300; i++) { game.step(); b.step(); }
    expect(b.checksum()).toBe(game.checksum());
    if (LONG) expect(after - before).toBeLessThan(256 * 1048576);
  }, LONG_TIMEOUT);
});

describe('PW21 command parsing', () => {
  it('accepts well-formed persistent commands and rejects malformed ones', () => {
    expect(parseCommand({ t: 'join', player: { name: 'N', faction: 'f', ai: false } })).toEqual({ t: 'join', player: { name: 'N', faction: 'f', ai: false, team: undefined, level: undefined } });
    expect(parseCommand({ t: 'leave', slot: 2 })).toEqual({ t: 'leave', slot: 2 });
    expect(parseCommand({ t: 'transfer', ids: [1, 2], to: 3 })).toEqual({ t: 'transfer', ids: [1, 2], to: 3 });
    expect(parseCommand({ t: 'join', player: { name: 'x'.repeat(30), faction: 'f', ai: false } })).toBeNull();
    expect(parseCommand({ t: 'leave', slot: -1 })).toBeNull();
    expect(parseCommand({ t: 'transfer', ids: 'nope', to: 1 })).toBeNull();
  });
});
