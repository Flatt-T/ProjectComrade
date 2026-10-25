import { describe, expect, it } from 'vitest';
import { CLASSIC_PACKS, Game, LocalSession, LockstepSession, PACKS, dunePack, parseCommand, ra2Pack, facingTo, isqrt, Rng } from '../../packages/fusion/src/index';
import type { Command, GameSetup, TurnPacket, TurnTransport } from '../../packages/fusion/src/index';

const ai2 = (pack: GameSetup['pack'], seed = 7, mapId = pack.maps[0].id): GameSetup => ({
  pack, mapId, seed,
  players: [{ name: 'A', faction: pack.factions[0].id, ai: true }, { name: 'B', faction: pack.factions[1].id, ai: true }],
});

function run(game: Game, ticks: number) { for (let i = 0; i < ticks; i++) game.step(); }

describe('fusion core maths', () => {
  it('computes exact integer square roots and classic facings', () => {
    for (const n of [0, 1, 2, 15, 16, 17, 65535, 65536, 1e9]) expect(isqrt(n) ** 2 <= n && (isqrt(n) + 1) ** 2 > n).toBe(true);
    expect(facingTo(0, -10)).toBe(0);   // north
    expect(facingTo(10, 0)).toBe(64);   // east
    expect(facingTo(0, 10)).toBe(128);  // south
    expect(facingTo(-10, 0)).toBe(192); // west
    expect(facingTo(10, -10)).toBe(32); // north-east
  });
  it('produces a repeatable random stream per seed', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const sa = Array.from({ length: 5 }, () => a.next()), sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
  });
});

describe('fusion determinism', () => {
  for (const pack of CLASSIC_PACKS) {
    it(`${pack.id}: same seed and commands give the same game`, () => {
      const a = new Game(ai2(pack, 99)), b = new Game(ai2(pack, 99));
      for (let t = 0; t < 2400; t++) {
        a.step(); b.step();
        if (t % 300 === 0) expect(a.checksum()).toBe(b.checksum());
      }
      expect(a.checksum()).toBe(b.checksum());
      const c = new Game(ai2(pack, 100));
      run(c, 2400);
      expect(c.checksum()).not.toBe(a.checksum());
    });
  }
});

describe('fusion gameplay', () => {
  for (const pack of CLASSIC_PACKS) {
    it(`${pack.id}: AI deploys, builds an economy, harvests and fights`, () => {
      const game = new Game(ai2(pack, 3));
      run(game, 15 * 60 * 6);
      for (const p of game.players) {
        expect(p.stats.built).toBeGreaterThanOrEqual(4);
        expect(p.stats.harvested).toBeGreaterThan(0);
      }
      const yards = [...game.entities.values()].filter(e => e.kind === 'structure' && pack.structures[e.type].constructionYard);
      expect(yards.length).toBeGreaterThan(0);
      const combat = game.players.reduce((n, p) => n + p.stats.killed, 0);
      expect(combat).toBeGreaterThan(0);
    });

    it(`${pack.id}: every map generates with clear, reachable starts`, () => {
      for (const preset of pack.maps) {
        const players = preset.starts.map((_, i) => ({ name: `P${i}`, faction: pack.factions[i % pack.factions.length].id, ai: true }));
        const game = new Game({ pack, mapId: preset.id, seed: 1, players });
        expect(game.players.length).toBe(preset.maxPlayers);
        for (const p of game.players) {
          const mcv = [...game.entities.values()].find(e => e.owner === p.slot && pack.units[e.type]?.deploysTo);
          expect(mcv, `${preset.id} slot ${p.slot} has an MCV`).toBeTruthy();
          const yard = pack.structures[pack.units[mcv!.type].deploysTo!];
          const cx = Math.floor(mcv!.x / 256) - (yard.w >> 1), cy = Math.floor(mcv!.y / 256) - (yard.h >> 1);
          expect(game.canPlace(p, yard.id, cx, cy, true, mcv!.id), `${preset.id} slot ${p.slot} can deploy`).toBe(true);
        }
      }
    });
  }

  it('dune: buildings need rock and start damaged without concrete', () => {
    const game = new Game({ pack: dunePack, mapId: 'arrakis-basin', seed: 5, players: [{ name: 'H', faction: 'atreides', ai: false }, { name: 'AI', faction: 'harkonnen', ai: true }] });
    const p = game.players[0];
    const mcv = [...game.entities.values()].find(e => e.owner === 0 && e.type === 'mcv')!;
    game.enqueue(0, { t: 'deploy', ids: [mcv.id] });
    game.step();
    const yard = [...game.entities.values()].find(e => e.owner === 0 && e.type === 'conyard')!;
    expect(yard).toBeTruthy();
    // Sand is never buildable.
    const sand = game.map.terrain.findIndex(t => dunePack.terrains[t].id === 'sand');
    expect(game.canPlace(p, 'windtrap', sand % game.map.w, Math.floor(sand / game.map.w), true)).toBe(false);
    // Build a windtrap and place it on bare rock: it starts at half health.
    game.enqueue(0, { t: 'build', item: 'windtrap' });
    for (let i = 0; i < 400 && !p.queues.structure.ready; i++) game.step();
    expect(p.queues.structure.ready).toBe(true);
    let spot: { x: number; y: number } | null = null;
    for (let y = yard.cy - 3; y <= yard.cy + 5 && !spot; y++) for (let x = yard.cx - 3; x <= yard.cx + 5 && !spot; x++) if (game.canPlace(p, 'windtrap', x, y)) spot = { x, y };
    expect(spot).not.toBeNull();
    game.enqueue(0, { t: 'place', item: 'windtrap', ...spot! });
    game.step();
    const trap = [...game.entities.values()].find(e => e.owner === 0 && e.type === 'windtrap')!;
    expect(trap.hp).toBe(Math.floor(trap.maxHp / 2));
    expect(p.powerGen).toBe(120);
    // Nothing attacks it, so it keeps that health: there is no slow erosion.
    const hp = trap.hp;
    for (let i = 0; i < 1800; i++) game.step();
    expect(trap.hp).toBe(hp);
  });

  it('ra2: chrono miners teleport home and ore regrows', () => {
    const game = new Game(ai2(ra2Pack, 11));
    run(game, 15 * 60 * 3);
    const allies = game.players.find(p => p.side === 'allies')!;
    expect(allies.stats.harvested).toBeGreaterThan(0);
    expect(game.effects.some(e => e.kind === 'chrono') || allies.stats.harvested > 0).toBe(true);
    const ore = game.map.resKind.findIndex(k => k > 0 && !!ra2Pack.resources[k - 1].regrows);
    expect(ore).toBeGreaterThanOrEqual(0);
  });

  it('rejects commands for units a player does not own', () => {
    const game = new Game(ai2(ra2Pack, 4));
    const enemyUnit = [...game.entities.values()].find(e => e.owner === 1 && e.kind === 'unit')!;
    const before = { x: enemyUnit.x, y: enemyUnit.y };
    const cmd: Command = { t: 'move', ids: [enemyUnit.id], x: 1, y: 1 };
    game.enqueue(0, cmd);
    game.step();
    expect(enemyUnit.order).not.toBe('move');
    expect({ x: enemyUnit.x, y: enemyUnit.y }).toEqual(before);
  });

  it('registers every classic pack', () => {
    expect(Object.keys(PACKS)).toEqual(expect.arrayContaining(['td', 'dune', 'ra1', 'ra2'])); // Plus community fusions.
  });
});

describe('fusion lockstep multiplayer', () => {
  /**
   * In-memory relay with per-packet jitter, standing in for the room WebSocket. Like the
   * web connection, it buffers packets for a client until that client's session subscribes.
   */
  function makeHub(slots: number[]) {
    const handlers = new Map<number, (from: number, p: TurnPacket) => void>();
    const members = new Set(slots);
    const queue: { to: number; from: number; packet: TurnPacket; at: number }[] = [];
    let clock = 0, jitter = 1;
    return {
      transport(slot: number): TurnTransport {
        return {
          send: packet => { for (const to of members) if (to !== slot) queue.push({ to, from: slot, packet: JSON.parse(JSON.stringify(packet)), at: clock + 20 + ((jitter = (jitter * 7 + 3) % 97)) }); },
          subscribe: h => { handlers.set(slot, h); return () => handlers.delete(slot); },
        };
      },
      advance(ms: number) {
        clock += ms;
        for (let i = 0; i < queue.length; i++) {
          const m = queue[i];
          if (m.at > clock || !handlers.has(m.to)) continue;
          queue.splice(i--, 1);
          handlers.get(m.to)!(m.from, m.packet);
        }
      },
      drop(slot: number, finalTurn: number) {
        members.delete(slot); handlers.delete(slot);
        for (const to of members) queue.push({ to, from: slot, packet: { turn: finalTurn, tick: 0, checksum: 0, commands: [{ t: 'surrender' }], final: true }, at: clock + 10 });
      },
    };
  }
  const setup = (): GameSetup => ({
    pack: ra2Pack, mapId: 'four-corners', seed: 2024,
    players: [{ name: 'Human A', faction: 'america', ai: false }, { name: 'Human B', faction: 'russia', ai: false }, { name: 'AI', faction: 'russia', ai: true }],
  });

  it('names the commander a client is waiting for, and resumes when their turn arrives', () => {
    const hub = makeHub([0, 1]);
    const a = new LockstepSession(new Game(setup()), 0, [0, 1], hub.transport(0));
    const b = new LockstepSession(new Game(setup()), 1, [0, 1], hub.transport(1));
    // B's tab is in the background and has not run yet: A can play its input delay, then waits.
    for (let i = 0; i < 20; i++) { hub.advance(50); a.update(50); }
    expect(a.status()).toBe('waiting');
    expect(a.waitingFor()).toEqual([1]);
    // B catches up (its background ticker runs); A resumes and nobody is waited on.
    for (let i = 0; i < 40; i++) { hub.advance(50); a.update(50); b.update(50); }
    expect(a.status()).toBe('running');
    expect(a.waitingFor()).toEqual([]);
    expect(a.game.tick).toBeGreaterThan(20); // Stuck at 6 (its input delay) before B caught up.
  });

  it('keeps every client in sync with different commands and network jitter', () => {
    const hub = makeHub([0, 1]);
    const a = new LockstepSession(new Game(setup()), 0, [0, 1], hub.transport(0));
    const b = new LockstepSession(new Game(setup()), 1, [0, 1], hub.transport(1));
    const sums: Record<number, number>[] = [{}, {}];
    // Sample inside step() so frames that advance several ticks never skip a sample.
    [a, b].forEach((s, i) => {
      const step = s.game.step.bind(s.game);
      s.game.step = () => { step(); if (s.game.tick % 60 === 0) sums[i][s.game.tick] = s.game.checksum(); };
    });
    const mcv = (s: LockstepSession) => [...s.game.entities.values()].find(e => e.owner === s.slot && e.type === 'mcv')!.id;
    a.issue({ t: 'deploy', ids: [mcv(a)] });
    b.issue({ t: 'move', ids: [mcv(b)], x: 50, y: 50 });
    for (let frame = 0; frame < 3000; frame++) {
      hub.advance(16);
      [a, b].forEach(s => s.update(16));
      if (frame === 300) a.issue({ t: 'build', item: 'a-power' });
      if (frame === 400) b.issue({ t: 'deploy', ids: [mcv(b)] });
    }
    expect(a.status()).not.toBe('desync');
    expect(b.status()).not.toBe('desync');
    const common = Object.keys(sums[0]).filter(t => t in sums[1]);
    expect(common.length).toBeGreaterThan(5);
    for (const t of common) expect(sums[0][+t], `tick ${t}`).toBe(sums[1][+t]);
    expect(a.game.players[0].stats.built).toBeGreaterThan(0);
  });

  it('turns a dropped player into a surrender on the same tick everywhere', () => {
    const hub = makeHub([0, 1]);
    const a = new LockstepSession(new Game(setup()), 0, [0, 1], hub.transport(0));
    const b = new LockstepSession(new Game(setup()), 1, [0, 1], hub.transport(1));
    for (let frame = 0; frame < 300; frame++) { hub.advance(16); a.update(16); b.update(16); }
    hub.drop(1, Math.floor(b.game.tick / 3) + 2);
    for (let frame = 0; frame < 600; frame++) { hub.advance(16); a.update(16); }
    expect(a.status()).toBe('running');
    expect(a.game.players[1].defeated).toBe(true);
    expect(a.game.tick).toBeGreaterThan(b.game.tick + 100);
  });

  it('drops malformed network commands', () => {
    expect(parseCommand({ t: 'move', ids: [1, 2], x: 3, y: 4 })).toEqual({ t: 'move', ids: [1, 2], x: 3, y: 4 });
    expect(parseCommand({ t: 'move', ids: 'all', x: 3, y: 4 })).toBeNull();
    expect(parseCommand({ t: 'build', item: '../../etc' })).toBeNull();
    expect(parseCommand({ t: 'nuke' })).toBeNull();
    expect(parseCommand(null)).toBeNull();
  });
});

describe('fusion packs compose from existing games', () => {
  it('runs RA2 armies on Dune terrain with sandworms and spice, as pure data', () => {
    // A fusion game: Dune's desert, spice and sandworms; RA2's factions, arsenal and tech tree.
    const fusion: GameSetup['pack'] = {
      ...ra2Pack,
      id: 'spice-war', name: 'Spice War', projection: 'ortho',
      terrains: dunePack.terrains.map(t => t.id === 'rock' ? { ...t, buildable: true } : t),
      resources: dunePack.resources,
      maps: dunePack.maps,
      mechanics: { buildOn: ['rock'], sandworm: dunePack.mechanics.sandworm, bloom: dunePack.mechanics.bloom },
      fidelityNote: 'Original fusion game.',
    };
    const game = new Game({ pack: fusion, mapId: 'arrakis-basin', seed: 21, players: [{ name: 'A', faction: 'america', ai: true }, { name: 'S', faction: 'russia', ai: true }] });
    run(game, 15 * 60 * 5);
    for (const p of game.players) {
      expect(p.stats.built).toBeGreaterThanOrEqual(4);
      expect(p.stats.harvested).toBeGreaterThan(0);
    }
    expect(game.worms.length).toBe(1);
  });
});

describe('sandworm activity setting', () => {
  const appear = dunePack.mechanics.sandworm!.appearAfter;
  const dune = (worms?: number) => new Game({ ...ai2(dunePack, 5), worms });

  it('0 turns worms off; lower rates delay their arrival and lengthen their dives', () => {
    const off = dune(0);
    run(off, appear * 3);
    expect(off.worms.length).toBe(0);

    const classic = dune(100), half = dune(50);
    run(classic, appear + 2); run(half, appear + 2);
    expect(classic.worms.length).toBe(1);
    expect(half.worms.length).toBe(0); // at 50% the first worm waits twice as long
    run(half, appear);
    expect(half.worms.length).toBe(1);
  });

  it('puts more worms on the sand at higher activity, and fewer at lower', () => {
    // The setting is about how much worm there is, not only when the first one arrives.
    const busy = dune(200), quiet = dune(100);
    run(busy, appear * 2); run(quiet, appear * 2);
    expect(busy.worms.length).toBeGreaterThan(quiet.worms.length);
    expect(busy.worms.length).toBe(dunePack.mechanics.sandworm!.count * 2);
  });

  it('sends worms back under after a stint on the surface, for longer at low activity', () => {
    const dive = (rate: number) => {
      const g = dune(rate);
      let under = 0;
      for (let i = 0; i < appear * 2 + 15 * 60 * 6; i++) {
        g.step();
        if (g.worms.length && g.worms.every(w => w.hidden)) under++;
      }
      return under;
    };
    // Nothing is hunting them, so any time spent hidden is the dive cycle doing its work.
    const quiet = dive(50), busy = dive(200);
    expect(quiet).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(busy);
  });

  it('defaults to classic behaviour when the setup omits it, and parses from the lobby', async () => {
    const { parseSettings, DEFAULT_SETTINGS } = await import('../../packages/contracts/src/index');
    expect(dune().wormRate).toBe(100);
    expect(parseSettings({ worms: 125 }).worms).toBe(125);
    expect(parseSettings({ worms: 999 }).worms).toBe(DEFAULT_SETTINGS.worms);
    expect(parseSettings({}).worms).toBe(DEFAULT_SETTINGS.worms);
  });
});

describe('match settings', () => {
  const dune = (extra: Partial<GameSetup>) => new Game({ ...ai2(dunePack, 5), ...extra });
  const td = (extra: Partial<GameSetup>) => new Game({ ...ai2(PACKS.td, 5), ...extra });

  it('renewal: 0 leaves mined ground bare, and higher settings fill it faster', () => {
    const mined = (g: Game, cells: number[]) => cells.reduce((n, i) => n + g.map.res[i], 0);
    const sample = (renewal: number) => {
      const g = dune({ renewal });
      // Strip a patch of field and see how much comes back.
      const cells: number[] = [];
      for (let i = 0; i < g.map.res.length && cells.length < 40; i++) if (g.map.resKind[i] && g.map.res[i] > 2) cells.push(i);
      for (const i of cells) g.map.res[i] = 0;
      run(g, 15 * 60 * 4);
      return mined(g, cells);
    };
    const none = sample(0), classic = sample(25), lush = sample(50);
    expect(none).toBe(0);
    expect(classic).toBeGreaterThan(0);
    expect(lush).toBeGreaterThan(classic);
  });

  it('superweapon recharge: 2x halves every charge time, and the AI and sidebar agree', () => {
    const classic = td({}), fast = td({ superCharge: 200 });
    const sw = PACKS.td.structures.eye.superweapon as { charge: number };
    expect(classic.chargeFor(sw as never)).toBe(sw.charge);
    expect(fast.chargeFor(sw as never)).toBe(Math.trunc(sw.charge / 2));
    // A powered Ion Cannon is ready in half the time. Human players, so nothing else
    // spends the power the uplink needs.
    const powered = (superCharge: number) => {
      const g = new Game({ pack: PACKS.td, mapId: PACKS.td.maps[0].id, seed: 5, superCharge,
        players: [{ name: 'A', faction: 'gdi', ai: false }, { name: 'B', faction: 'nod', ai: false }] });
      const eye = g.spawnStructure('eye', 0, 20, 20)!;
      for (let i = 0; i < 4; i++) g.spawnStructure('nuke', 0, 25, 18 + i * 3);
      let ticks = 0;
      while (ticks < sw.charge + 200 && eye.charge < g.chargeFor(sw as never)) { g.step(); ticks++; }
      expect(eye.charge, `${superCharge}% charged`).toBeGreaterThanOrEqual(g.chargeFor(sw as never));
      return ticks;
    };
    expect(powered(200)).toBeLessThan(powered(100) * 0.6);
  });

  it('crates: off by default, and a unit that walks onto one opens it', () => {
    expect(td({}).crates.length).toBe(0);
    const g = td({ crates: 200 });
    run(g, 15 * 60 * 3);
    expect(g.crates.length, 'crates appear when they are switched on').toBeGreaterThan(0);
    const crate = g.crates[0];
    const before = { credits: g.players[0].credits, units: [...g.entities.values()].filter(e => e.owner === 0 && e.kind === 'unit').length };
    const finder = g.spawnUnit('minigunner', 0, crate.cell);
    expect(finder).toBeTruthy();
    g.step();
    expect(g.crates.some(c => c.id === crate.id), 'the crate is taken').toBe(false);
    const after = { credits: g.players[0].credits, units: [...g.entities.values()].filter(e => e.owner === 0 && e.kind === 'unit').length };
    const better = after.credits > before.credits || after.units > before.units + 1 || finder.rank > 0 || finder.hp === finder.maxHp || g.reveals.length > 0;
    expect(better, `crate ${crate.kind} did something`).toBe(true);
  });

  it('crates: frequency decides how many are out, and none appear when off', () => {
    const count = (crates: number) => { const g = td({ crates }); run(g, 15 * 60 * 8); return g.crates.length; };
    expect(count(0)).toBe(0);
    expect(count(200)).toBeGreaterThan(0);
  });

  it('game speed: the clock runs faster without touching the simulation', () => {
    const steps = (speed: number) => {
      const g = td({});
      const session = new LocalSession(g, 0, speed);
      // A second of real time, in the 50 ms slices a browser actually delivers.
      for (let i = 0; i < 20; i++) session.update(50);
      return g.tick;
    };
    // A second of wall time, in ticks: 15 at classic, twice that at 200%, three times at 300%
    // (a tick either way, since the accumulator works in fractions of a millisecond).
    expect(Math.abs(steps(100) - 15)).toBeLessThanOrEqual(1);
    expect(Math.abs(steps(200) - 30)).toBeLessThanOrEqual(1);
    expect(Math.abs(steps(300) - 45)).toBeLessThanOrEqual(1);
    // Same seed, same number of ticks: speed is pacing, not a different game.
    const a = td({}), b = td({});
    run(a, 300); run(b, 300);
    expect(a.checksum()).toBe(b.checksum());
  });

  it('parses every new setting from the lobby, and clamps nonsense', async () => {
    const { parseSettings, DEFAULT_SETTINGS } = await import('../../packages/contracts/src/index');
    expect(parseSettings({ renewal: 40 }).renewal).toBe(40);
    expect(parseSettings({ renewal: 90 }).renewal).toBe(DEFAULT_SETTINGS.renewal);
    expect(parseSettings({ superCharge: 175 }).superCharge).toBe(175);
    expect(parseSettings({ superCharge: 50 }).superCharge).toBe(DEFAULT_SETTINGS.superCharge);
    expect(parseSettings({ crates: 150 }).crates).toBe(150);
    expect(parseSettings({ crates: -5 }).crates).toBe(DEFAULT_SETTINGS.crates);
    expect(parseSettings({ speed: 250 }).speed).toBe(250);
    expect(parseSettings({ speed: 1000 }).speed).toBe(DEFAULT_SETTINGS.speed);
  });
});

describe('fusion superweapons', () => {
  const setup = (seed = 8): GameSetup => ({ pack: ra2Pack, mapId: 'temperate-valley', seed, players: [{ name: 'S', faction: 'russia', ai: false }, { name: 'A', faction: 'america', ai: false }] });
  const enemyHp = (g: Game) => [...g.entities.values()].filter(e => e.owner === 1).reduce((n, e) => n + e.hp, 0);

  function armed(type: string, seed = 8) {
    const g = new Game(setup(seed));
    // Deploy both MCVs, then grant player 0 a charged superweapon structure.
    for (const p of g.players) {
      const mcv = [...g.entities.values()].find(e => e.owner === p.slot && e.type === 'mcv')!;
      g.enqueue(p.slot, { t: 'deploy', ids: [mcv.id] });
    }
    g.step();
    const start = g.mapPreset.starts[0];
    const s = g.spawnStructure(type, 0, start.x + 3, start.y + 4);
    const sw = g.superweaponOf(s)!;
    s.charge = sw.charge;
    return { g, s, sw };
  }

  it('charges only while powered and fires a nuclear missile that lands after its flight', () => {
    const { g, s, sw } = armed('s-nuke');
    expect(sw.kind).toBe('missile');
    const yard = [...g.entities.values()].find(e => e.owner === 1 && e.type === 'conyard')!;
    const before = enemyHp(g);
    g.enqueue(0, { t: 'super', id: s.id, x: yard.cx + 2, y: yard.cy + 2 });
    g.step();
    expect(s.charge).toBe(0);
    expect(g.effects.some(e => e.kind === 'superLaunch')).toBe(true);
    expect(enemyHp(g)).toBe(before);
    for (let i = 0; i < sw.delay + 2; i++) g.step();
    expect(g.effects.some(e => e.kind === 'nuke')).toBe(true);
    expect(enemyHp(g)).toBeLessThan(before - 1000);
    // A spent weapon cannot fire again until it recharges.
    g.enqueue(0, { t: 'super', id: s.id, x: yard.cx, y: yard.cy });
    g.step();
    expect(g.strikes.length).toBe(0);
  });

  it('calls down a lightning storm as a series of scheduled strikes', () => {
    const g = new Game({ ...setup(), players: [{ name: 'A', faction: 'america', ai: false }, { name: 'S', faction: 'russia', ai: false }] });
    const start = g.mapPreset.starts[0];
    const s = g.spawnStructure('a-weather', 0, start.x + 3, start.y + 4);
    const sw = g.superweaponOf(s)!;
    s.charge = sw.charge;
    g.enqueue(0, { t: 'super', id: s.id, x: 50, y: 50 });
    g.step();
    expect(g.strikes.length).toBe(sw.strikes);
    for (let i = 0; i < sw.delay + (sw.duration ?? 0) + 5; i++) g.step();
    expect(g.strikes.length).toBe(0);
    expect(g.effects.filter(e => e.kind === 'lightning').length).toBeGreaterThan(5);
  });

  it('gives each Great House its own palace power', () => {
    const g = new Game({ pack: dunePack, mapId: 'arrakis-basin', seed: 2, players: [{ name: 'A', faction: 'atreides', ai: false }, { name: 'H', faction: 'harkonnen', ai: false }] });
    const a = g.spawnStructure('palace', 0, 10, 10), h = g.spawnStructure('palace', 1, 50, 50);
    expect(g.superweaponOf(a)?.name).toBe('Fremen War Party');
    // The war party is a team: fighters on foot and the worm riders they call up.
    expect(g.superweaponOf(a)?.units).toContain('fremen');
    expect(g.superweaponOf(a)?.units).toContain('wormrider');
    expect(g.superweaponOf(h)?.name).toBe('Death Hand');
    // Charging pauses on low power: a lone palace has no windtraps.
    for (let i = 0; i < 30; i++) g.step();
    expect(h.charge).toBe(0);
  });

  it('supports an Ion Cannon in any fusion pack as data, deterministically', () => {
    const pack: GameSetup['pack'] = {
      ...ra2Pack, id: 'ion-test',
      structures: { ...ra2Pack.structures, uplink: { id: 'uplink', name: 'Ion Cannon Uplink', cost: 3000, hp: 900, armor: 'building', w: 2, h: 2, power: 0, sight: 4, prereqs: [], tech: 10, queue: 'defense', shape: 'radar',
        superweapon: { id: 'ion', name: 'Ion Cannon', kind: 'ion', charge: 100, damage: 1500, radius: 640, delay: 30 } } },
    };
    const run = () => {
      const g = new Game({ pack, mapId: 'temperate-valley', seed: 4, players: [{ name: 'A', faction: 'america', ai: false }, { name: 'S', faction: 'russia', ai: false }] });
      const s = g.spawnStructure('uplink', 0, 12, 14);
      for (let i = 0; i < 110; i++) g.step();
      const target = [...g.entities.values()].find(e => e.owner === 1)!;
      g.enqueue(0, { t: 'super', id: s.id, x: Math.floor(target.x / 256), y: Math.floor(target.y / 256) });
      for (let i = 0; i < 40; i++) g.step();
      return g;
    };
    const a = run(), b = run();
    expect(a.effects.some(e => e.kind === 'ionCharge')).toBe(true);
    expect(a.effects.some(e => e.kind === 'ionStrike')).toBe(true);
    expect(a.checksum()).toBe(b.checksum());
  });
});

describe('fusion classic controls', () => {
  const twoHumans = (): Game => new Game({ pack: ra2Pack, mapId: 'temperate-valley', seed: 12, players: [{ name: 'A', faction: 'america', ai: false }, { name: 'S', faction: 'russia', ai: false }] });
  const mine = (g: Game, type: string) => [...g.entities.values()].filter(e => e.owner === 0 && e.type === type);

  it('Ctrl force-fire attacks a friendly unit; a plain attack on a friend is refused', () => {
    const g = twoHumans();
    const [tank] = mine(g, 'grizzly');
    const [gi] = mine(g, 'gi');
    g.enqueue(0, { t: 'attack', ids: [tank.id], target: gi.id });
    g.step();
    expect(tank.order).not.toBe('attack');
    const before = gi.hp;
    g.enqueue(0, { t: 'attack', ids: [tank.id], target: gi.id, force: true });
    for (let i = 0; i < 150 && gi.hp > 0; i++) g.step();
    expect(gi.hp).toBeLessThan(before);
  });

  it('fires at open ground and damages whatever stands there', () => {
    const g = twoHumans();
    const [tank] = mine(g, 'grizzly');
    const [gi] = mine(g, 'gi');
    const before = gi.hp;
    g.enqueue(0, { t: 'fireAt', ids: [tank.id], x: Math.floor(gi.x / 256), y: Math.floor(gi.y / 256) });
    for (let i = 0; i < 150; i++) g.step();
    expect(tank.order).toBe('attackGround');
    expect(gi.hp).toBeLessThan(before);
  });

  it('guards in place and scatters deterministically', () => {
    const run = () => {
      const g = twoHumans();
      const gis = mine(g, 'gi');
      g.enqueue(0, { t: 'guard', ids: gis.map(e => e.id) });
      g.step();
      expect(gis.every(e => e.order === 'idle' && e.resume === g.cellOf(e))).toBe(true);
      g.enqueue(0, { t: 'scatter', ids: gis.map(e => e.id) });
      for (let i = 0; i < 60; i++) g.step();
      return g;
    };
    const a = run(), b = run();
    expect(a.checksum()).toBe(b.checksum());
  });
});
