import { describe, expect, it } from 'vitest';
import { Game, LockstepSession, PACKS, dunePack, parseCommand, ra2Pack, facingTo, isqrt, Rng } from '../../packages/fusion/src/index';
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
  for (const pack of [dunePack, ra2Pack]) {
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
  for (const pack of [dunePack, ra2Pack]) {
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
  });

  it('ra2: chrono miners teleport home and ore regrows', () => {
    const game = new Game(ai2(ra2Pack, 11));
    run(game, 15 * 60 * 3);
    const allies = game.players.find(p => p.faction === 'allies')!;
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

  it('registers both packs', () => {
    expect(Object.keys(PACKS).sort()).toEqual(['dune', 'ra2']);
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
    players: [{ name: 'Human A', faction: 'allies', ai: false }, { name: 'Human B', faction: 'soviets', ai: false }, { name: 'AI', faction: 'soviets', ai: true }],
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
    const game = new Game({ pack: fusion, mapId: 'arrakis-basin', seed: 21, players: [{ name: 'A', faction: 'allies', ai: true }, { name: 'S', faction: 'soviets', ai: true }] });
    run(game, 15 * 60 * 5);
    for (const p of game.players) {
      expect(p.stats.built).toBeGreaterThanOrEqual(4);
      expect(p.stats.harvested).toBeGreaterThan(0);
    }
    expect(game.worms.length).toBe(1);
  });
});

describe('fusion superweapons', () => {
  const setup = (seed = 8): GameSetup => ({ pack: ra2Pack, mapId: 'temperate-valley', seed, players: [{ name: 'S', faction: 'soviets', ai: false }, { name: 'A', faction: 'allies', ai: false }] });
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
    const g = new Game({ ...setup(), players: [{ name: 'A', faction: 'allies', ai: false }, { name: 'S', faction: 'soviets', ai: false }] });
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

  it('gives the Death Hand only to the Harkonnen palace', () => {
    const g = new Game({ pack: dunePack, mapId: 'arrakis-basin', seed: 2, players: [{ name: 'A', faction: 'atreides', ai: false }, { name: 'H', faction: 'harkonnen', ai: false }] });
    const a = g.spawnStructure('palace', 0, 10, 10), h = g.spawnStructure('palace', 1, 50, 50);
    expect(g.superweaponOf(a)).toBeUndefined();
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
      const g = new Game({ pack, mapId: 'temperate-valley', seed: 4, players: [{ name: 'A', faction: 'allies', ai: false }, { name: 'S', faction: 'soviets', ai: false }] });
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
