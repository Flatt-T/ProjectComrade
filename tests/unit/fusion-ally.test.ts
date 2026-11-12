// PW09: alliance semantics in the persistent engine — allied players are not
// enemies, alliance state survives snapshot/restore, and the bounded caretaker
// auto-repair heals only the owner's structures for free. Classic matches
// ignore every persistent-only command.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame,
  AUTO_REPAIR_TICKS, AUTO_REPAIR_PERCENT,
  type GameSetup,
} from '../../packages/fusion/src/index';
import { PERSISTENT_RULES_V1, NO_ALLIANCE_PERMISSIONS, parseAlliancePermissions } from '../../packages/contracts/src/mmo';

const PACK = CLASSIC_PACKS[0];

function setup(persistent: boolean, players?: Partial<GameSetup['players'][number]>[]): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 31, persistent,
    players: [
      { name: 'A', faction: PACK.factions[0].id, ai: false, ...(players?.[0] ?? {}) },
      { name: 'B', faction: PACK.factions[1].id, ai: false, ...(players?.[1] ?? {}) },
    ],
  };
}

function steps(game: Game, n: number) { for (let i = 0; i < n; i++) game.step(); }

describe('PW09 alliance hostility', () => {
  it('players sharing an ally key are not enemies; -1 means no alliance', () => {
    const g = new Game(setup(true));
    expect(g.isEnemy(0, 1)).toBe(true); // distinct teams, no alliance
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 7 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 7 });
    g.step();
    expect(g.players[0].ally).toBe(7);
    expect(g.players[1].ally).toBe(7);
    expect(g.isEnemy(0, 1)).toBe(false);
    // A different alliance key is hostile again.
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 9 });
    g.step();
    expect(g.isEnemy(0, 1)).toBe(true);
    // Leaving the alliance (-1) restores hostility.
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: -1 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: -1 });
    g.step();
    expect(g.isEnemy(0, 1)).toBe(true);
  });

  it('alliance does not merge same-slot or broken-player checks', () => {
    const g = new Game(setup(true));
    expect(g.isEnemy(0, 0)).toBe(false);
    expect(g.isEnemy(0, -1)).toBe(false);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 3 });
    g.step();
    // Player 1 has no alliance: still an enemy of player 0.
    expect(g.isEnemy(0, 1)).toBe(true);
  });

  it('classic matches ignore setAlly/setAutoRepair entirely', () => {
    const g = new Game(setup(false));
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 7 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 7 });
    g.enqueue(-1, { t: 'setAutoRepair', slot: 0, on: true });
    steps(g, 5);
    expect(g.players[0].ally).toBe(-1);
    expect(g.players[1].ally).toBe(-1);
    expect(g.players[0].autoRepair).toBe(false);
    expect(g.isEnemy(0, 1)).toBe(true);
  });

  it('allied players do not auto-acquire each other; broken alliances fight', () => {
    const g = new Game(setup(true));
    runParked(g);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 4 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 4 });
    g.step();
    // Move player 1's units next to player 0's units, then order an attack.
    const armed = (e: { type: string }) => !!PACK.units[e.type]?.weapon;
    const u1 = [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === 1 && e.hp > 0 && armed(e))!;
    const u0 = [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && armed(e))!;
    u1.x = u0.x + 3; u1.y = u0.y; u1.px = u1.x; u1.py = u1.y;
    const hpBefore = u0.hp;
    g.enqueue(1, { t: 'attack', ids: [u1.id], target: u0.id });
    steps(g, 120);
    // Without force, an ally is not a valid attack target — no damage dealt.
    expect(g.entities.get(u0.id)!.hp).toBe(hpBefore);
    // The same attack succeeds once the alliance is broken.
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: -1 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: -1 });
    g.step();
    g.enqueue(1, { t: 'attack', ids: [u1.id], target: u0.id });
    steps(g, 600);
    expect(g.entities.get(u0.id)!.hp).toBeLessThan(hpBefore);
  });
});

/** Park every unit so only the commands under test act. */
function runParked(g: Game) {
  for (const u of g.entities.values()) {
    if (u.kind === 'unit' && u.hp > 0) { u.order = 'idle'; u.hstate = 'seek'; }
  }
}

describe('PW09 caretaker auto-repair', () => {
  it('heals only the owner\'s damaged structures, for free, at the bounded rate', () => {
    const g = new Game(setup(true, [{ autoRepair: true }, {}]));
    runParked(g);
    const s0 = g.spawnStructure('fact', 0, 40, 40);
    const s1 = g.spawnStructure('fact', 1, 50, 50);
    s0.hp = Math.floor(s0.maxHp / 2);
    s1.hp = Math.floor(s1.maxHp / 2);
    const creditsBefore = g.players[0].credits;
    const entityCount = g.entities.size;

    steps(g, AUTO_REPAIR_TICKS);

    const heal = Math.max(1, Math.floor(s0.maxHp * AUTO_REPAIR_PERCENT / 100));
    expect(g.entities.get(s0.id)!.hp).toBe(Math.min(s0.maxHp, Math.floor(s0.maxHp / 2) + heal));
    // Another player's structure is untouched — the caretaker is not an empire bot.
    expect(g.entities.get(s1.id)!.hp).toBe(Math.floor(s1.maxHp / 2));
    // Repair spends nothing and places nothing.
    expect(g.players[0].credits).toBe(creditsBefore);
    expect(g.entities.size).toBe(entityCount);
  });

  it('does nothing while disabled and works for offline players', () => {
    const g = new Game(setup(true)); // autoRepair defaults off
    const s0 = g.spawnStructure('fact', 0, 40, 40);
    s0.hp = Math.floor(s0.maxHp / 2);
    steps(g, AUTO_REPAIR_TICKS);
    expect(g.entities.get(s0.id)!.hp).toBe(Math.floor(s0.maxHp / 2));

    // Enable it, disconnect the player, and confirm the caretaker still repairs.
    g.enqueue(-1, { t: 'setAutoRepair', slot: 0, on: true });
    g.enqueue(-1, { t: 'leave', slot: 0 });
    g.step();
    expect(g.players[0].autoRepair).toBe(true);
    expect(g.players[0].connected).toBe(false);
    steps(g, AUTO_REPAIR_TICKS);
    expect(g.entities.get(s0.id)!.hp).toBeGreaterThan(Math.floor(s0.maxHp / 2));
  });
});

describe('PW09 snapshot carry', () => {
  it('ally key and autoRepair survive capture/restore', () => {
    const g = new Game(setup(true, [{ ally: 11, autoRepair: true }, {}]));
    g.step();
    const snap = captureGame(g, { seed: 31 });
    const b = restoreGame(snap, CLASSIC_PACKS);
    expect(b.players[0].ally).toBe(11);
    expect(b.players[0].autoRepair).toBe(true);
    expect(b.players[1].ally).toBe(-1);
    expect(b.isEnemy(0, 1)).toBe(true);
    // And replay stays identical.
    for (let i = 0; i < 200; i++) { g.step(); b.step(); }
    expect(b.checksum()).toBe(g.checksum());
  });

  it('snapshots predating PW09 restore with safe defaults', () => {
    const g = new Game(setup(true));
    g.step();
    const snap = JSON.parse(captureGame(g, { seed: 31 }));
    for (const p of snap.state.players) { delete p.ally; delete p.autoRepair; }
    const b = restoreGame(JSON.stringify(snap), CLASSIC_PACKS);
    expect(b.players[0].ally).toBe(-1);
    expect(b.players[0].autoRepair).toBe(false);
  });
});

describe('PW09 permission contract', () => {
  it('membership alone grants nothing; permissions are explicit booleans', () => {
    expect(NO_ALLIANCE_PERMISSIONS).toEqual({ station: false, reinforce: false, trade: false, unitTransfer: false });
    expect(parseAlliancePermissions({ station: true, reinforce: true, trade: false, unitTransfer: true }))
      .toEqual({ station: true, reinforce: true, trade: false, unitTransfer: true });
    // There is deliberately no construction key — a forged 'build' grant parses
    // to nothing; the result carries exactly the four known permissions.
    const forged = parseAlliancePermissions({ station: true, reinforce: true, trade: false, unitTransfer: false, build: true });
    expect(Object.keys(forged).sort()).toEqual(['reinforce', 'station', 'trade', 'unitTransfer']);
    expect((forged as unknown as Record<string, unknown>).build).toBeUndefined();
  });

  it('rejects malformed permission payloads', () => {
    expect(() => parseAlliancePermissions({ station: true, reinforce: 'yes', trade: false, unitTransfer: false })).toThrow();
    expect(() => parseAlliancePermissions({ station: true, reinforce: true, trade: false })).toThrow();
    expect(() => parseAlliancePermissions(null)).toThrow();
    expect(PERSISTENT_RULES_V1.allianceMaxMembers).toBe(10);
  });
});
