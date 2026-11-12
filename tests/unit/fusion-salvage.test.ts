// PW24: salvage crates (COMRADE 18 §3.9). A destroyed unit or building drops a
// crate worth a share of build cost, collectable by any player, decaying after
// the configured time. The anti-snowball floor suppresses drops when the
// victim's in-sim power score is far below the killer's. Sold buildings drop
// nothing (they never die — removeEntity runs with died=false).
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td': factions gdi (slot 0) / nod (slot 1)

const SALVAGE = { percentOfCost: 25, decaySeconds: 600, mismatchFloorRatio: 0.5, scoreWeights: { structure: 1, unit: 1, tech: 25 } };

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 5000, recoveryBuildRoles: [],
  salvage: SALVAGE,
};

function setup(players = 2, extra: Partial<GameSetup> = {}): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent: true, mmo: TUNING,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
    ...extra,
  };
}

function step(g: Game, n: number) { for (let i = 0; i < n; i++) g.step(); }

function openCell(g: Game, w = 1, h = 1): number {
  for (let i = 0; i < g.map.w * g.map.h; i++) {
    const x = i % g.map.w, y = Math.floor(i / g.map.w);
    if (x < 2 || y < 2 || x >= g.map.w - w - 2 || y >= g.map.h - h - 2) continue;
    let ok = true;
    for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) {
      if (g.map.occupied[(y + dy) * g.map.w + x + dx]) ok = false;
    }
    if (ok) return i;
  }
  throw new Error('no open cell');
}

describe('PW24 salvage crates', () => {
  it('drops a crate worth 25% of build cost on a killed unit', () => {
    const g = new Game(setup());
    const cell = openCell(g);
    const victim = g.spawnUnit('minigunner', 1, cell); // nod rocket soldier
    const cost = PACK.units.minigunner.cost;
    g.damage(victim, victim.hp, 0);
    g.step();
    const crate = g.crates.find(c => c.kind === 'salvage');
    expect(crate).toBeTruthy();
    expect(crate!.value).toBe(Math.floor(cost * 25 / 100));
    const ev = g.salvageEvents.find(e => e.kind === 'spawn');
    expect(ev).toBeTruthy();
    expect(ev!.credits).toBe(crate!.value);
    expect(ev!.victimOwner).toBe(1);
    expect(ev!.killerOwner).toBe(0);
    expect(ev!.simId).toBe(victim.id);
    expect(g.entities.has(victim.id)).toBe(false);
  });

  it('pays credits to the collector and logs a collect event', () => {
    const g = new Game(setup());
    const vcell = openCell(g);
    const victim = g.spawnUnit('minigunner', 1, vcell);
    const ccell = openCell(g);
    const collector = g.spawnUnit('minigunner', 0, ccell);
    g.damage(victim, victim.hp, 0);
    g.step();
    const crate = g.crates.find(c => c.kind === 'salvage')!;
    // Park the collector on the crate cell (LEPTONS=256 per cell).
    collector.x = collector.px = (crate.cell % g.map.w) * 256 + 128;
    collector.y = collector.py = Math.floor(crate.cell / g.map.w) * 256 + 128;
    const before = g.players[0].credits;
    g.step();
    expect(g.players[0].credits).toBe(before + crate.value!);
    expect(g.crates.some(c => c.id === crate.id)).toBe(false);
    expect(g.salvageEvents.some(e => e.kind === 'collect' && e.collectorOwner === 0 && e.credits === crate.value)).toBe(true);
  });

  it('decays after the configured time', () => {
    const g = new Game(setup());
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, 0);
    g.step();
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(true);
    step(g, 600 * 15 + 30);
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(false);
  });

  it('drops nothing when the victim is far weaker than the killer', () => {
    const g = new Game(setup());
    // P0 fields a large army; P1 fields a single soldier — victim score is far
    // below the attacker's, so the anti-snowball floor suppresses the crate.
    for (let i = 0; i < 12; i++) g.spawnUnit('mediumtank', 0, openCell(g));
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, 0);
    g.step();
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(false);
    expect(g.salvageEvents.some(e => e.kind === 'spawn')).toBe(false);
  });

  it('drops for a roughly equal victim (floor boundary)', () => {
    const g = new Game(setup());
    g.spawnUnit('minigunner', 0, openCell(g));
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, 0);
    g.step();
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(true);
  });

  it('drops nothing for environmental or ownerless kills', () => {
    const g = new Game(setup());
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, -1); // by=-1: no killer
    g.step();
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(false);
  });

  it('drops salvage for a destroyed building at 25% of structure cost', () => {
    const g = new Game(setup());
    const site = openCell(g);
    const x = site % g.map.w, y = Math.floor(site / g.map.w);
    const struct = g.spawnStructure('proc', 1, x, y);
    const cost = PACK.structures.proc.cost;
    g.damage(struct, struct.hp, 0);
    g.step();
    const crate = g.crates.find(c => c.kind === 'salvage');
    expect(crate).toBeTruthy();
    expect(crate!.value).toBe(Math.floor(cost * 25 / 100));
  });

  it('drops nothing when a building is sold (died=false path)', () => {
    const g = new Game(setup());
    const site = openCell(g);
    const x = site % g.map.w, y = Math.floor(site / g.map.w);
    const struct = g.spawnStructure('proc', 1, x, y);
    g.enqueue(1, { t: 'sell', id: struct.id });
    g.step();
    expect(g.entities.has(struct.id)).toBe(false);
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(false);
  });

  it('is off by default in persistent games without mmo.salvage', () => {
    const g = new Game(setup(2, { mmo: { ...TUNING, salvage: undefined } }));
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, 0);
    g.step();
    expect(g.crates.some(c => c.kind === 'salvage')).toBe(false);
  });

  it('works as an optional skirmish setting in classic matches', () => {
    const g = new Game({
      pack: PACK, mapId: PACK.maps[0].id, seed: 47,
      players: [
        { name: 'A', faction: 'gdi', ai: false },
        { name: 'B', faction: 'nod', ai: false },
      ],
      salvage: { percentOfCost: 25, decaySeconds: 600 },
    });
    const victim = g.spawnUnit('minigunner', 1, openCell(g));
    g.damage(victim, victim.hp, 0);
    g.step();
    const crate = g.crates.find(c => c.kind === 'salvage');
    expect(crate).toBeTruthy();
    expect(crate!.value).toBe(Math.floor(PACK.units.minigunner.cost * 25 / 100));
  });

  it('conservation: total crate value equals the configured share of destroyed cost', () => {
    const g = new Game(setup());
    const types = ['minigunner', 'rocketsoldier', 'flametank'];
    let destroyedCost = 0;
    for (const t of types) {
      const u = g.spawnUnit(t, 1, openCell(g));
      destroyedCost += PACK.units[t].cost;
      g.damage(u, u.hp, 0);
    }
    g.step();
    const total = g.crates.filter(c => c.kind === 'salvage').reduce((s, c) => s + (c.value ?? 0), 0);
    // Per-asset floor rounding means the sum is within one credit per asset.
    expect(total).toBeGreaterThanOrEqual(Math.floor(destroyedCost * 25 / 100) - types.length);
    expect(total).toBeLessThanOrEqual(Math.floor(destroyedCost * 25 / 100));
  });
});
