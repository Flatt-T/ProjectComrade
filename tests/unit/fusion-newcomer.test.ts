// PW11: newcomer settlement in the persistent engine. A journaled `join` with a
// starter grant spawns the versioned loadout bound to the player, honours the
// authority-picked cell, is idempotent on the durable player id, and the
// one-hour setup protection flag makes the player's forces unable to deal or
// receive damage until the durable evaluator turns it off. Classic matches
// reject join entirely.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame, LEPTONS, starterLoadout,
  type GameSetup,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'
const FACTION = PACK.factions[0];
const LOADOUT = starterLoadout(PACK, FACTION);
const CELL = 40 * PACK.maps[0].width + 40;

function setup(players = 1, persistent = true): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

function join(g: Game, over: Record<string, unknown> = {}) {
  g.enqueue(-1, {
    t: 'join',
    player: {
      name: 'Newcomer', faction: FACTION.id, ai: false,
      playerId: 'player-new', cell: CELL,
      starter: { credits: 4242, units: LOADOUT.units },
      newcomerProtected: true,
      ...over,
    },
  });
  g.step();
}

function ownUnits(g: Game, slot: number) {
  return [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0);
}

describe('PW11 newcomer join grant', () => {
  it('spawns the full starter loadout bound, at the requested cell, with grant credits', () => {
    const g = new Game(setup(1));
    join(g);
    const p = g.players[1];
    expect(p.pid).toBe('player-new');
    expect(p.credits).toBe(4242);
    expect(p.newcomerProtected).toBe(true);
    const units = ownUnits(g, 1);
    // MCV + harvester + 4 tanks + 2 lights + 8 infantry.
    expect(units.length).toBe(LOADOUT.units.length);
    expect(units.every(u => u.bound === 1)).toBe(true);
    // Every granted unit id is the faction-equivalent pick.
    const types = units.map(u => u.type).sort();
    expect(types).toEqual([...LOADOUT.units].sort());
    // The MCV sits on the requested cell.
    const mcv = units.find(u => PACK.units[u.type].deploysTo)!;
    expect(Math.floor(mcv.y / LEPTONS)).toBe(Math.floor(CELL / PACK.maps[0].width));
  });

  it('is idempotent on the durable player id — a replayed join never duplicates the base', () => {
    const g = new Game(setup(1));
    join(g);
    const before = ownUnits(g, 1).length;
    join(g); // same playerId again
    expect(g.players.filter(p => p.pid === 'player-new').length).toBe(1);
    expect(ownUnits(g, 1).length).toBe(before);
  });

  it('a bound MCV deploys a bound construction yard that cannot be sold', () => {
    const g = new Game(setup(1));
    join(g);
    const mcv = ownUnits(g, 1).find(u => PACK.units[u.type].deploysTo)!;
    g.enqueue(1, { t: 'deploy', ids: [mcv.id] });
    g.step();
    const yard = [...g.entities.values()].find(e => e.owner === 1 && e.kind === 'structure' && e.hp > 0)!;
    expect(yard.bound).toBe(1);
    g.enqueue(1, { t: 'sell', id: yard.id });
    g.step();
    expect(g.entities.get(yard.id)?.hp).toBeGreaterThan(0);
  });

  it('setup protection blocks damage both ways and superweapon fire', () => {
    const g = new Game(setup(2));
    join(g);
    const slot = g.players.findIndex(pl => pl.pid === 'player-new');
    const enemy = [...g.entities.values()].find(e => e.owner === 0 && e.kind === 'unit' && e.hp > 0)!;
    const mine = ownUnits(g, slot)[0];
    const hpBefore = mine.hp;
    const enemyHp = enemy.hp;
    g.damage(mine, 50, 0, enemy.id);
    expect(mine.hp).toBe(hpBefore);
    g.damage(enemy, 50, slot, mine.id);
    expect(enemy.hp).toBe(enemyHp);
    // And the protected player cannot fire even with a target in range.
    g.enqueue(slot, { t: 'attack', ids: [mine.id], target: enemy.id, force: true });
    for (let i = 0; i < 600; i++) g.step();
    expect(enemy.hp).toBe(enemyHp);
  });

  it('setNewcomerProtection off restores normal damage rules', () => {
    const g = new Game(setup(2));
    join(g);
    const slot = g.players.findIndex(pl => pl.pid === 'player-new');
    g.enqueue(-1, { t: 'setNewcomerProtection', slot, on: false });
    g.step();
    expect(g.players[slot].newcomerProtected).toBe(false);
    const mine = ownUnits(g, slot)[0];
    const enemy = [...g.entities.values()].find(e => e.owner === 0 && e.kind === 'unit' && e.hp > 0)!;
    const before = mine.hp;
    g.damage(mine, 50, 0, enemy.id);
    expect(mine.hp).toBeLessThan(before);
  });

  it('survives snapshot/restore with protection, binding and durable id intact', () => {
    const g = new Game(setup(1));
    join(g);
    const snap = captureGame(g, { seed: 47 });
    const r = restoreGame(snap, [PACK]);
    const p = r.players.find(pl => pl.pid === 'player-new')!;
    expect(p.newcomerProtected).toBe(true);
    const units = [...r.entities.values()].filter(e => e.owner === p.slot && e.kind === 'unit');
    expect(units.length).toBe(LOADOUT.units.length);
    expect(units.every(u => u.bound === 1)).toBe(true);
  });

  it('classic matches reject the persistent join command', () => {
    const g = new Game(setup(1, false));
    g.enqueue(-1, { t: 'join', player: { name: 'X', faction: FACTION.id, ai: false, playerId: 'p' } });
    g.step();
    expect(g.players.length).toBe(1);
  });
});
