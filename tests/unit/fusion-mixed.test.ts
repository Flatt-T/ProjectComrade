// PW17: fixed factions + compatible mixed forces. A player's faction is fixed
// at setup; every asset keeps the faction it was CREATED under (e.faction)
// across barter/transfer/pack. Imported production buildings field their own
// faction's roster — prerequisites match by role so the buyer's buildings
// count where the role matches, while faction-specific tech still needs that
// faction's building.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';
import { persistentPackRunnable, persistentPackRevision } from '../../apps/service/src/mmo/packs.js';

const PACK = CLASSIC_PACKS[0]; // 'td': factions gdi (slot 0) / nod (slot 1)

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 5000, recoveryBuildRoles: [],
};

function setup(players = 2): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent: true, mmo: TUNING,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

function openSite(g: Game, w: number, h: number, slot = 0): { x: number; y: number } {
  const mw = g.map.w;
  for (let cy = 2; cy < g.map.h - h - 2; cy++) {
    for (let cx = 2; cx < mw - w - 2; cx++) {
      if (g.canPlace(g.players[slot], 'fact', cx, cy, true)) return { x: cx, y: cy };
    }
  }
  throw new Error('no open site');
}

function step(g: Game, n: number) { for (let i = 0; i < n; i++) g.step(); }

describe('PW17 fixed faction and asset identity', () => {
  it('stamps creator faction on spawn and preserves it through transfer', () => {
    const g = new Game(setup());
    const site = openSite(g, 2, 2, 1);
    const hand = g.spawnStructure('hand', 1, site.x, site.y); // nod barracks
    expect(hand.faction).toBe('nod');
    expect(g.players[1].faction).toBe('nod');

    // Barter-style handover: owner changes, creator faction and player faction do not.
    g.enqueue(1, { t: 'transfer', ids: [hand.id], to: 0 });
    g.step();
    const e = g.entities.get(hand.id)!;
    expect(e.owner).toBe(0);
    expect(e.faction).toBe('nod');
    expect(e.type).toBe('hand');
    expect(g.players[0].faction).toBe('gdi');
    expect(g.players[1].faction).toBe('nod');
  });

  it('keeps faction fixed — no command path mutates player faction', () => {
    const g = new Game(setup());
    const before = g.players.map(p => p.faction);
    // Exercise the roster commands that exist; none may rewrite faction.
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 1 });
    g.enqueue(-1, { t: 'setAutoRepair', slot: 0, on: true });
    g.enqueue(-1, { t: 'setNewcomerProtection', slot: 0, on: true });
    g.enqueue(-1, { t: 'setRecovery', slot: 0, on: true });
    g.enqueue(-1, { t: 'setRecovery', slot: 0, on: false });
    step(g, 3);
    expect(g.players.map(p => p.faction)).toEqual(before);
  });
});

describe('PW17 imported production buildings', () => {
  /** GDI player (slot 0) owns a nod 'hand' barracks transferred from slot 1. */
  function gdiWithNodHand(): { g: Game; hand: ReturnType<Game['spawnStructure']> } {
    const g = new Game(setup());
    const site = openSite(g, 2, 2, 1);
    const hand = g.spawnStructure('hand', 1, site.x, site.y);
    g.enqueue(1, { t: 'transfer', ids: [hand.id], to: 0 });
    g.step();
    return { g, hand };
  }

  it('an imported factory offers the donor faction’s units, not the buyer’s', () => {
    const { g } = gdiWithNodHand();
    const p = g.players[0];
    const infantry = g.buildOptions(p, 'infantry');
    // Nod-only infantry is now buildable through the imported hand…
    expect(infantry).toContain('flamethrower');
    // …but GDI-only infantry still needs a GDI barracks (prereq 'pyle' =
    // infantry-plant:gdi, which the nod hand does not satisfy).
    expect(infantry).not.toContain('grenadier');
    // Shared infantry works through either barracks role.
    expect(infantry).toContain('minigunner');
    expect(infantry).toContain('rocketsoldier');
  });

  it('produces the donor faction’s unit for the buyer, owned by the buyer', () => {
    const { g } = gdiWithNodHand();
    const p = g.players[0];
    p.credits = 999_999;
    expect(g.canBuild(p, 'flamethrower')).toBe(true);
    g.enqueue(0, { t: 'build', item: 'flamethrower' });
    g.step();
    step(g, 4000);
    const produced = [...g.entities.values()].find(e => e.type === 'flamethrower');
    expect(produced).toBeDefined();
    expect(produced!.owner).toBe(0);
    expect(g.pack.units['flamethrower'].factions).toContain('nod');
  });

  it('faction-specific tech still needs that faction’s building', () => {
    const { g } = gdiWithNodHand();
    const p = g.players[0];
    // chemwarrior needs 'hand' AND 'tmpl' — the nod superweapon facility.
    expect(g.canBuild(p, 'chemwarrior')).toBe(false);
    const site = openSite(g, 4, 4, 1);
    const tmpl = g.spawnStructure('tmpl', 1, site.x, site.y);
    g.enqueue(1, { t: 'transfer', ids: [tmpl.id], to: 0 });
    g.step();
    expect(g.canBuild(p, 'chemwarrior')).toBe(true);
    // ...but a GDI superweapon (eye) must NOT satisfy the nod prereq.
    const g2 = new Game(setup());
    const p2 = g2.players[0];
    const s1 = openSite(g2, 2, 2, 1);
    const hand2 = g2.spawnStructure('hand', 1, s1.x, s1.y);
    g2.enqueue(1, { t: 'transfer', ids: [hand2.id], to: 0 });
    g2.step();
    const s2 = openSite(g2, 4, 4, 0);
    const eye = g2.spawnStructure('eye', 0, s2.x, s2.y); // gdi superweapon
    void eye;
    expect(g2.canBuild(p2, 'chemwarrior')).toBe(false);
  });

  it('role matching: a bigger shared power plant satisfies the power prereq', () => {
    const g = new Game(setup());
    const p = g.players[0];
    const site = openSite(g, 3, 3, 0);
    g.spawnStructure('fact', 0, site.x, site.y); // construction yard enables structure queue
    const site2 = openSite(g, 2, 2, 0);
    g.spawnStructure('nuk2', 0, site2.x, site2.y); // power role, no 'nuke' type
    // proc requires 'nuke' — role matching accepts nuk2's power role.
    expect(g.canBuild(p, 'proc')).toBe(true);
  });

  it('importing a factory never adds donor structures to the build menu', () => {
    const { g } = gdiWithNodHand();
    const p = g.players[0];
    // 'hand' is a nod structure — the GDI player still cannot queue it.
    expect(g.canBuild(p, 'hand')).toBe(false);
    const defenses = g.buildOptions(p, 'defense');
    expect(defenses).not.toContain('gun'); // nod-only defense
    expect(defenses).not.toContain('sam');
  });
});

describe('PW17 pack compatibility manifest', () => {
  it('declares td supported and rejects unknown packs', () => {
    expect(persistentPackRunnable('td')).toBe(true);
    expect(persistentPackRevision('td')).toBe('td-persistent-1');
    expect(persistentPackRunnable('dune')).toBe(false);
    expect(persistentPackRunnable('ra2')).toBe(false);
    expect(() => persistentPackRevision('dune')).toThrow();
    expect(() => persistentPackRevision('ra2')).toThrow();
  });
});
