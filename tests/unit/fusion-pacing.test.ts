// PW23: persistent pacing — structure toughness, army supply cap, supply upkeep,
// compound limit, power-score asset totals and snapshot carry. Plus the balance
// harness: scripted assaults against small/medium/large reference bases report
// time-to-destroy against the 20–30 minute COMRADE 18 target band.
import { describe, expect, it } from 'vitest';
import {
  PACKS, Game, captureGame, restoreGame,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';
import {
  PERSISTENT_RULES_V1, computePowerScore, powerScoreMismatch, spawnRegionInBand,
} from '../../packages/contracts/src/mmo';

const PACK = PACKS['td'];
const MAP = 'td-tiberium-gardens'; // 80x80, clear terrain

/** The shipped profile, mapped onto engine tuning — tests exercise real defaults. */
const PROFILE_TUNING: MmoTuning = {
  structureHpMultiplier: PERSISTENT_RULES_V1.structureHpMultiplier,
  supplyCap: PERSISTENT_RULES_V1.armySupply.cap,
  upkeepPerPointPerMinute: PERSISTENT_RULES_V1.armySupply.upkeepPerPointPerMinute,
  maxCompounds: PERSISTENT_RULES_V1.maxCompounds,
};

function setup(mmo?: Partial<MmoTuning>, seed = 7): GameSetup {
  return {
    pack: PACK, mapId: MAP, seed, persistent: true,
    players: [
      { name: 'Defender', faction: 'gdi', ai: false },
      { name: 'Attacker', faction: 'nod', ai: false },
    ],
    mmo: { ...PROFILE_TUNING, ...mmo },
  };
}

function steps(game: Game, n: number) { for (let i = 0; i < n; i++) game.step(); }

/** Park every living unit of a slot so it neither fights nor harvests. */
function parkUnits(game: Game, slot: number) {
  for (const u of game.entities.values()) {
    if (u.kind === 'unit' && u.owner === slot && u.hp > 0) { u.order = 'idle'; u.hstate = 'seek'; }
  }
}

describe('PW23 structure toughness', () => {
  it('scales structure maxHp by the profile multiplier; classic is untouched', () => {
    const tuned = new Game(setup());
    const s = tuned.spawnStructure('fact', 0, 40, 40);
    expect(s.maxHp).toBe(1000 * PERSISTENT_RULES_V1.structureHpMultiplier);

    const classic = new Game({ ...setup(), persistent: false });
    const c = classic.spawnStructure('fact', 0, 40, 40);
    expect(c.maxHp).toBe(1000);
  });

  it('concrete-start damage still applies on top of the multiplier', () => {
    const g = new Game(setup());
    const s = g.spawnStructure('fact', 0, 40, 40, 50);
    expect(s.hp).toBe(Math.floor((1000 * PERSISTENT_RULES_V1.structureHpMultiplier * 50) / 100));
    expect(s.maxHp).toBe(1000 * PERSISTENT_RULES_V1.structureHpMultiplier);
  });
});

describe('PW23 army supply cap', () => {
  it('stalls unit production at the cap and resumes below it', () => {
    const g = new Game(setup());
    const p = g.players[0];
    g.spawnStructure('fact', 0, 10, 10);
    g.spawnStructure('nuke', 0, 14, 10);
    g.spawnStructure('proc', 0, 10, 14);
    g.spawnStructure('weap', 0, 14, 14);
    p.credits = 1_000_000;
    parkUnits(g, 0);
    const start = g.supplyPoints(p);
    // Cap two above the starting army: exactly two tanks may be fielded.
    (g as unknown as { mmo: MmoTuning }).mmo = { ...PROFILE_TUNING, supplyCap: start + 2 };

    for (let i = 0; i < 4; i++) g.enqueue(0, { t: 'build', item: 'mediumtank' });
    steps(g, 30000);
    expect(g.supplyPoints(p)).toBe(start + 2);
    // Production stalled, not cancelled: two tanks remain queued.
    const queued = ['vehicle', 'starport', 'infantry', 'naval', 'aircraft']
      .reduce((n, k) => n + (p.queues as Record<string, { items: string[] }>)[k].items.length, 0);
    expect(queued).toBe(2);

    // Destroy one fielded tank — the queue resumes and replaces it.
    const tank = [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && e.type === 'mediumtank');
    expect(tank).toBeTruthy();
    tank!.hp = 0;
    steps(g, 2); // cleanup removes the corpse
    steps(g, 30000);
    expect(g.supplyPoints(p)).toBe(start + 2);
    // Three of the four queued tanks have now been fielded; one remains.
    const remaining = ['vehicle', 'starport', 'infantry', 'naval', 'aircraft']
      .reduce((n, k) => n + (p.queues as Record<string, { items: string[] }>)[k].items.length, 0);
    expect(remaining).toBe(1);
  });

  it('does not stall structure queues at the supply cap', () => {
    const g = new Game(setup({ supplyCap: 1 }));
    const p = g.players[0];
    g.spawnStructure('fact', 0, 10, 10);
    g.spawnStructure('nuke', 0, 14, 10);
    g.spawnStructure('proc', 0, 10, 14);
    g.spawnStructure('weap', 0, 14, 14);
    p.credits = 1_000_000;
    parkUnits(g, 0);
    expect(g.supplyPoints(p)).toBeGreaterThanOrEqual(1);
    g.enqueue(0, { t: 'build', item: 'mediumtank' });
    g.enqueue(0, { t: 'build', item: 'nuke' });
    steps(g, 2); // commands apply at the tick boundary
    // The unit queues but cannot produce while at cap; the structure queue is
    // untouched by the cap and starts paying immediately.
    expect(p.queues.vehicle.items).toContain('mediumtank');
    expect(p.queues.vehicle.paid).toBe(0);
    steps(g, 600);
    expect(p.queues.vehicle.paid).toBe(0); // still stalled at cap
    expect(p.queues.structure.paid + p.queues.structure.acc).toBeGreaterThan(0); // paying
  });
});

describe('PW23 supply upkeep', () => {
  it('drains upkeepPerPointPerMinute credits per supply point each in-game minute', () => {
    const upkeep = 500;
    const g = new Game(setup({ upkeepPerPointPerMinute: upkeep }));
    const p = g.players[0];
    parkUnits(g, 0);
    const supply = g.supplyPoints(p);
    expect(supply).toBeGreaterThan(0);
    p.credits = 1_000_000;
    steps(g, 900); // exactly one upkeep period
    expect(p.credits).toBe(1_000_000 - upkeep * supply);
    steps(g, 900);
    expect(p.credits).toBe(1_000_000 - 2 * upkeep * supply);
  });

  it('floors upkeep at zero credits', () => {
    const g = new Game(setup({ upkeepPerPointPerMinute: 999_999 }));
    const p = g.players[0];
    parkUnits(g, 0);
    expect(g.supplyPoints(p)).toBeGreaterThan(0);
    p.credits = 10;
    steps(g, 900);
    expect(p.credits).toBe(0);
  });

  it('applies the same upkeep inside fastForwardQuiescent', () => {
    const live = new Game(setup({ upkeepPerPointPerMinute: 500 }));
    const ff = new Game(setup({ upkeepPerPointPerMinute: 500 }));
    for (const g of [live, ff]) {
      parkUnits(g, 0);
      g.players[0].credits = 1_000_000;
    }
    steps(live, 1800);
    ff.fastForwardQuiescent(1800, [0, 0]);
    // Same supply, same two upkeep periods — credits must match exactly.
    expect(ff.players[0].credits).toBe(live.players[0].credits);
  });
});

describe('PW23 compound limit', () => {
  it('denies placement at the cap and reopens when a yard falls', () => {
    const g = new Game(setup({ maxCompounds: 4 }));
    const p = g.players[0];
    g.spawnStructure('fact', 0, 10, 10);
    g.spawnStructure('fact', 0, 20, 10);
    g.spawnStructure('fact', 0, 30, 10);
    expect(g.compoundCount(p)).toBe(3);

    // Find genuinely placeable cells while under the cap — one for a yard, one
    // for an ordinary structure (which the cap must never touch).
    let spot: { x: number; y: number } | null = null;
    let nukeSpot: { x: number; y: number } | null = null;
    for (let y = 6; y < 40 && (!spot || !nukeSpot); y++) {
      for (let x = 6; x < 60; x++) {
        if (!spot && g.canPlace(p, 'fact', x, y)) spot = { x, y };
        if (!nukeSpot && g.canPlace(p, 'nuke', x, y)) nukeSpot = { x, y };
      }
    }
    expect(spot).toBeTruthy();
    expect(nukeSpot).toBeTruthy();
    // Ensure the nuke probe doesn't sit inside the yard probe's footprint.
    const overlaps = (a: { x: number; y: number }, aw: number, ah: number, b: { x: number; y: number }, bw: number, bh: number) =>
      a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
    if (overlaps(nukeSpot!, 2, 2, spot!, 3, 3)) {
      nukeSpot = null;
      for (let y = 6; y < 40 && !nukeSpot; y++) for (let x = 6; x < 60; x++) {
        if (!overlaps({ x, y }, 2, 2, spot!, 3, 3) && g.canPlace(p, 'nuke', x, y)) { nukeSpot = { x, y }; break; }
      }
      expect(nukeSpot).toBeTruthy();
    }

    // Fourth yard fills the cap; every further yard placement is denied while
    // non-compound structures remain placeable at the same coordinates.
    g.spawnStructure('fact', 0, spot!.x, spot!.y);
    expect(g.compoundCount(p)).toBe(4);
    expect(g.canPlace(p, 'fact', spot!.x, spot!.y)).toBe(false);
    expect(g.canPlace(p, 'nuke', nukeSpot!.x, nukeSpot!.y)).toBe(true);

    // Destroy one yard and placement reopens.
    const yard = [...g.entities.values()].find(e => e.type === 'fact' && e.owner === 0 && e.hp > 0
      && !(e.cx === spot!.x && e.cy === spot!.y))!;
    yard.hp = 0;
    steps(g, 2); // cleanup frees the cells
    expect(g.compoundCount(p)).toBe(3);
    // The spot cell itself is occupied by the surviving fourth yard; check a
    // different free cell is placeable again instead.
    let reopened = false;
    for (let y = 6; y < 40 && !reopened; y++) {
      for (let x = 6; x < 60; x++) {
        if ((x !== spot!.x || y !== spot!.y) && g.canPlace(p, 'fact', x, y)) { reopened = true; break; }
      }
    }
    expect(reopened).toBe(true);
  });
});

describe('PW23 snapshot carry', () => {
  it('restores persistent tuning so post-restore spawns stay scaled', () => {
    const g = new Game(setup());
    steps(g, 50);
    const b = restoreGame(captureGame(g, { seed: 7 }), Object.values(PACKS));
    const s = b.spawnStructure('fact', 0, 40, 40);
    expect(s.maxHp).toBe(1000 * PERSISTENT_RULES_V1.structureHpMultiplier);
    expect(b.mmo?.supplyCap).toBe(PERSISTENT_RULES_V1.armySupply.cap);
  });
});

// ---------------------------------------------------------------------------
// Balance harness: scripted assaults vs reference bases (COMRADE 18 §2.4 target:
// levelling a developed base takes ~20–30 minutes of sustained assault).
// ---------------------------------------------------------------------------

interface BaseTier { name: string; structures: string[] }
const TIERS: BaseTier[] = [
  { name: 'small', structures: ['fact', 'nuke', 'proc', 'pyle'] },
  { name: 'medium', structures: ['fact', 'nuke', 'nuk2', 'proc', 'silo', 'pyle', 'weap', 'hq'] },
  { name: 'large', structures: ['fact', 'nuke', 'nuk2', 'proc', 'silo', 'pyle', 'weap', 'hq', 'fix', 'aflight'] },
];

/** Lay a base on a grid starting at (bx,by). */
function buildBase(game: Game, owner: number, bx: number, by: number, types: string[]) {
  const out = [];
  let x = bx, y = by;
  for (const type of types) {
    const def = PACK.structures[type];
    if (!def) throw new Error(`unknown structure ${type}`);
    out.push(game.spawnStructure(type, owner, x, y));
    x += def.w + 1;
    if (x > bx + 14) { x = bx; y += 4; }
  }
  return out;
}

/**
 * Time-to-destroy under a sustained assault: every 600 ticks the army is
 * re-tasked onto the nearest standing structure (models a player focus-firing
 * through the base rather than a single attack-move that idles out of sight).
 */
function timeToDestroy(tier: BaseTier, tuning: MmoTuning, armySize: number): { minutes: number; structures: number } {
  const g = new Game(setup({ ...tuning, supplyCap: 0, upkeepPerPointPerMinute: 0 }));
  for (const e of g.entities.values()) if (e.kind === 'unit' && e.hp > 0) e.hp = 0;
  const base = buildBase(g, 0, 12, 12, tier.structures);
  const army = [];
  for (let i = 0; i < armySize; i++) {
    army.push(g.spawnUnit('mediumtank', 1, (56 + (i % 5)) * 80 + (56 + Math.floor(i / 5))));
  }
  const maxTicks = 90 * 60 * 15; // ninety sim-minutes cap
  let ticks = 0;
  while (ticks < maxTicks) {
    g.step();
    ticks++;
    if (ticks % 600 !== 1) continue;
    const alive = base.filter(s => s.hp > 0);
    if (!alive.length) break;
    const cx = army.reduce((a, u) => a + u.x, 0) / army.length;
    const cy = army.reduce((a, u) => a + u.y, 0) / army.length;
    const target = alive.reduce((b, s) => {
      const d = (s.x + s.w * 128 - cx) ** 2 + (s.y + s.h * 128 - cy) ** 2;
      const bd = (b.x + b.w * 128 - cx) ** 2 + (b.y + b.h * 128 - cy) ** 2;
      return d < bd ? s : b;
    });
    g.enqueue(1, { t: 'attackMove', ids: army.map(u => u.id), x: Math.floor(target.cx + target.w / 2), y: Math.floor(target.cy + target.h / 2) });
  }
  return { minutes: ticks / 900, structures: base.length };
}

describe('PW23 balance harness (time-to-destroy)', () => {
  it('reports TTD for small, medium and large reference bases', () => {
    // Reference assault: a developed army — 20 main battle tanks, no defenders.
    const army = 20;
    const results = TIERS.map(t => ({ tier: t.name, ...timeToDestroy(t, PROFILE_TUNING, army) }));
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(`[pw23-balance] ${r.tier}: ${r.minutes.toFixed(1)} min vs ${army} tanks (${r.structures} structures)`);
    }
    const medium = results.find(r => r.tier === 'medium')!;
    // COMRADE 18 target band for a developed base: profile.baseLevelMinutes.
    expect(medium.minutes).toBeGreaterThanOrEqual(PERSISTENT_RULES_V1.baseLevelMinutes.min);
    expect(medium.minutes).toBeLessThanOrEqual(PERSISTENT_RULES_V1.baseLevelMinutes.max);
    // Ordering sanity: bigger bases take longer under the same assault.
    expect(results[2].minutes).toBeGreaterThan(results[0].minutes);
  }, 300_000);
});

describe('PW23 power score and mismatch rule', () => {
  it('computePowerScore weights structure, unit and tech assets', () => {
    const score = computePowerScore(
      { structureCost: 10_000, unitCost: 5_000, techLevels: 4 },
      PERSISTENT_RULES_V1.powerScoreWeights);
    expect(score).toBe(10_000 + 5_000 + 4 * PERSISTENT_RULES_V1.powerScoreWeights.tech);
  });

  it('assetTotals reflects live entities and upgrades', () => {
    const g = new Game(setup());
    const p = g.players[0];
    parkUnits(g, 0);
    g.spawnStructure('fact', 0, 40, 40); // cost 5000
    const totals = g.assetTotals(p);
    expect(totals.structureCost).toBeGreaterThanOrEqual(5000);
    p.upgrades['fact'] = 2;
    expect(g.assetTotals(p).techLevels).toBe(2);
  });

  it('powerScoreMismatch suppresses rewards only for far-weaker victims', () => {
    const ratio = PERSISTENT_RULES_V1.powerScoreSalvageFloorRatio;
    expect(powerScoreMismatch(10_000, 10_000 * ratio - 1, ratio)).toBe(true);
    expect(powerScoreMismatch(10_000, 10_000 * ratio, ratio)).toBe(false);
    expect(powerScoreMismatch(10_000, 9_000, ratio)).toBe(false);
    expect(powerScoreMismatch(10_000, 0, ratio)).toBe(true);
    expect(powerScoreMismatch(0, 0, ratio)).toBe(false);
  });

  it('spawnRegionInBand admits cohorts inside the band, rejects stronger regions', () => {
    const baseline = PERSISTENT_RULES_V1.spawnCohortBaselineScore;
    const ratio = PERSISTENT_RULES_V1.spawnRegionPowerBandRatio;
    expect(spawnRegionInBand([baseline, baseline * 2, 0], baseline, ratio)).toBe(true);
    expect(spawnRegionInBand([baseline * (ratio + 1)], baseline, ratio)).toBe(false);
    expect(spawnRegionInBand([baseline * ratio], baseline, ratio)).toBe(true); // boundary inclusive
    expect(spawnRegionInBand([], baseline, ratio)).toBe(true);
  });
});
