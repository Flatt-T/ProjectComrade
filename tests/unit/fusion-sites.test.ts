// PW24: capturable sites (COMRADE 18 §3.9). Each persistent region has 2-4
// neutral sites providing income, tech or repair-depot perks. Sites are
// objectives: indestructible, unshieldable, unpackable, unsellable. Capture is
// deterministic — hostile units inside the radius fill a progress meter; the
// holder banks hold-time until the site changes hands.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, CLASSIC_SITE_TUNING, Game, captureGame, regionSitePlan, restoreGame,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0];

const SITES = { ...CLASSIC_SITE_TUNING };

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 5000, recoveryBuildRoles: [],
  sites: SITES,
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

function placeSite(g: Game, type: 'site_income' | 'site_tech' | 'site_depot' = 'site_income') {
  const cell = openCell(g, type === 'site_depot' ? 3 : 2, type === 'site_depot' ? 3 : 2);
  const x = cell % g.map.w, y = Math.floor(cell / g.map.w);
  return g.spawnStructure(type, -1, x, y);
}

/** Park a unit on the site's capture centre. */
function parkOn(g: Game, unit: { x: number; y: number; px: number; py: number }, s: { cx: number; cy: number; w: number; h: number }) {
  unit.x = unit.px = (s.cx + s.w / 2) * 256;
  unit.y = unit.py = (s.cy + s.h / 2) * 256;
}

describe('PW24 capturable sites', () => {
  it('plan is a pure function of (pack, map, seed, range)', () => {
    const g = new Game(setup());
    const p1 = regionSitePlan(PACK, g.map, 99, 2, 4);
    const p2 = regionSitePlan(PACK, g.map, 99, 2, 4);
    const p3 = regionSitePlan(PACK, g.map, 100, 2, 4);
    expect(p1).toEqual(p2);
    expect(p1.length).toBeGreaterThanOrEqual(2);
    expect(p1.length).toBeLessThanOrEqual(4);
    expect(p3).not.toEqual(p1);
    // No two sites overlap.
    for (let i = 0; i < p1.length; i++) for (let j = i + 1; j < p1.length; j++) {
      const a = p1[i], b = p1[j];
      const overlap = a.cx < b.cx + 3 && b.cx < a.cx + 3 && a.cy < b.cy + 3 && b.cy < a.cy + 3;
      expect(overlap).toBe(false);
    }
  });

  it('spawns neutral and captures to the occupying force', () => {
    const g = new Game(setup());
    const site = placeSite(g);
    expect(site.owner).toBe(-1);
    const tank = g.spawnUnit('mediumtank', 0, openCell(g));
    parkOn(g, tank, site);
    for (let i = 0; i < SITES.captureTicks + 30 && site.owner === -1; i++) g.step();
    expect(site.owner).toBe(0);
    const ev = g.siteEvents.find(e => e.kind === 'capture');
    expect(ev).toBeTruthy();
    expect(ev!.fromOwner).toBe(-1);
    expect(ev!.toOwner).toBe(0);
    expect(ev!.siteKind).toBe('income');
  });

  it('changes hands and reports held ticks on recapture', () => {
    const g = new Game(setup());
    const site = placeSite(g);
    const a = g.spawnUnit('mediumtank', 0, openCell(g));
    parkOn(g, a, site);
    for (let i = 0; i < SITES.captureTicks + 30 && site.owner === -1; i++) g.step();
    expect(site.owner).toBe(0);
    g.siteEvents.length = 0;
    const b = g.spawnUnit('mediumtank', 1, openCell(g));
    parkOn(g, b, site);
    // Remove A's unit so only B contests.
    a.hp = 0;
    for (let i = 0; i < SITES.captureTicks + 30 && site.owner === 0; i++) g.step();
    expect(site.owner).toBe(1);
    const ev = g.siteEvents.find(e => e.kind === 'capture');
    expect(ev!.fromOwner).toBe(0);
    expect(ev!.toOwner).toBe(1);
    expect(ev!.heldTicks).toBeGreaterThan(0);
  });

  it('a contested capture that fades emits repelled once', () => {
    const g = new Game(setup());
    const site = placeSite(g);
    const a = g.spawnUnit('mediumtank', 0, openCell(g));
    parkOn(g, a, site);
    for (let i = 0; i < SITES.captureTicks + 30 && site.owner === -1; i++) g.step();
    expect(site.owner).toBe(0);
    g.siteEvents.length = 0;
    const b = g.spawnUnit('mediumtank', 1, openCell(g));
    parkOn(g, b, site);
    for (let i = 0; i < 40; i++) g.step(); // partial progress
    b.hp = 0; a.hp = 0; // everyone leaves
    for (let i = 0; i < SITES.decayPerTick * 200 + 30; i++) g.step();
    const repelled = g.siteEvents.filter(e => e.kind === 'repelled');
    expect(repelled.length).toBe(1);
    expect(repelled[0].fromOwner).toBe(0);
  });

  it('pays income to the holder on the upkeep cadence', () => {
    const g = new Game(setup());
    const site = placeSite(g, 'site_income');
    site.owner = 0; site.originalOwner = 0;
    const before = g.players[0].credits;
    // Advance past the next SUPPLY_UPKEEP_TICKS boundary (900 ticks).
    for (let i = 0; i <= 900; i++) g.step();
    expect(g.players[0].credits).toBe(before + SITES.incomeCreditsPerMinute);
  });

  it('depot repairs nearby damaged structures for the holder', () => {
    const g = new Game(setup());
    const site = placeSite(g, 'site_depot');
    site.owner = 0; site.originalOwner = 0;
    const cell = openCell(g, 2, 2);
    const x = cell % g.map.w, y = Math.floor(cell / g.map.w);
    const struct = g.spawnStructure('proc', 0, x, y);
    // Move the depot next to the proc so it is inside depotRadiusCells.
    site.cx = struct.cx - 1; site.cy = struct.cy - 1;
    struct.hp = Math.floor(struct.maxHp / 2);
    const hpBefore = struct.hp;
    for (let i = 0; i <= 900; i++) g.step();
    expect(struct.hp).toBeGreaterThan(hpBefore);
  });

  it('sites take no damage and cannot be sold or shielded', () => {
    const g = new Game(setup());
    const site = placeSite(g);
    site.owner = 0; site.originalOwner = 0;
    const hp = site.hp;
    g.damage(site, 99999, 1);
    expect(site.hp).toBe(hp);
    // Sell is refused for site structures.
    g.enqueue(0, { t: 'sell', id: site.id });
    g.step();
    expect(g.entities.has(site.id)).toBe(true);
    // Shield toggle is refused for site structures.
    g.enqueue(0, { t: 'setShield', compound: site.id, on: true });
    g.step();
    expect(site.shielded).toBe(false);
  });

  it('survives snapshot/restore with owner and progress intact', () => {
    const g = new Game(setup());
    const site = placeSite(g);
    const tank = g.spawnUnit('mediumtank', 0, openCell(g));
    parkOn(g, tank, site);
    for (let i = 0; i < 60; i++) g.step();
    const snap = captureGame(g, { seed: 47 });
    const g2 = restoreGame(snap, [PACK]);
    const s2 = [...g2.entities.values()].find(e => e.kind === 'structure' && g2.structDef(e).site)!;
    expect(s2.siteState?.progress).toBe(site.siteState?.progress);
    expect(s2.owner).toBe(site.owner);
    // Capture completes identically on the restored game.
    for (let i = 0; i < SITES.captureTicks + 60 && s2.owner === -1; i++) g2.step();
    expect(s2.owner).toBe(0);
  });

  it('classic skirmish sites setting spawns neutral sites without persistent mode', () => {
    const g = new Game({
      pack: PACK, mapId: PACK.maps[0].id, seed: 47,
      players: [
        { name: 'A', faction: 'gdi', ai: false },
        { name: 'B', faction: 'nod', ai: false },
      ],
      sites: { min: 2, max: 3 },
    });
    const sites = [...g.entities.values()].filter(e => e.kind === 'structure' && g.structDef(e).site);
    expect(sites.length).toBeGreaterThanOrEqual(2);
    expect(sites.length).toBeLessThanOrEqual(3);
    expect(sites.every(s => s.owner === -1)).toBe(true);
    // A classic game has no mmo tuning but still runs siteTick. Remove the
    // enemy roster so only slot-0 units can contest the chosen site.
    const site = sites[0];
    // Move the enemy roster to the far corner so only slot-0 units contest —
    // killing them would end the classic match before capture completes.
    for (const e of [...g.entities.values()]) {
      if (e.kind === 'unit' && e.owner === 1) { e.x = e.px = 8; e.y = e.py = 8; }
    }
    // Spawn far from the site so spawn-cell collision can't interfere.
    let far = -1;
    for (let i = 0; i < g.map.w * g.map.h; i++) {
      const x = i % g.map.w, y = Math.floor(i / g.map.w);
      if (Math.abs(x - site.cx) < 12 || Math.abs(y - site.cy) < 12 || g.map.occupied[i]) continue;
      far = i; break;
    }
    const tank = g.spawnUnit('mediumtank', 0, far);
    parkOn(g, tank, site);
    for (let i = 0; i < CLASSIC_SITE_TUNING.captureTicks + 30 && site.owner === -1; i++) g.step();
    expect(site.owner).toBe(0);
  });

  it('no sites spawn without the setting', () => {
    const g = new Game(setup(2, { mmo: { ...TUNING, sites: undefined } }));
    g.step();
    expect([...g.entities.values()].some(e => e.kind === 'structure' && g.structDef(e).site)).toBe(false);
  });
});
