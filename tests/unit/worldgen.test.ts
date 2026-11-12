// PW16: versioned frontier world generation — deterministic, varied, connected.
// Every generated region must have one naval component (ships traverse all
// water), enough viable newcomer sites on the main landmass, resources near
// them, and full snapshot/restore fidelity through spec + seed.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, WORLDGEN_DEFAULT, WORLDGEN_VERSION, buildableTerrain,
  captureGame, generateWorldMap, isWater, passable, restoreGame, worldgenSpecFor,
  type GameSetup, type MmoTuning, type WorldgenSpec,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 0, recoveryBuildRoles: [],
  salvage: { percentOfCost: 25, decaySeconds: 600, mismatchFloorRatio: 0, scoreWeights: { structure: 1, unit: 1, tech: 0 } },
};

function specFor(seed: number, over: Partial<WorldgenSpec> = {}): WorldgenSpec {
  return { ...worldgenSpecFor(PACK, WORLDGEN_DEFAULT, seed), ...over };
}

/** 8-connected component count for cells matching `ok` (mirrors path.ts). */
function componentCount(w: number, h: number, ok: (i: number) => boolean): number {
  const seen = new Uint8Array(w * h);
  let count = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !ok(s)) continue;
    count++;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % w, cy = Math.floor(c / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!seen[ni] && ok(ni)) { seen[ni] = 1; stack.push(ni); }
      }
    }
  }
  return count;
}

function waterComponents(map: ReturnType<typeof generateWorldMap>['map']): number {
  return componentCount(map.w, map.h, i =>
    !!PACK.terrains[map.terrain[i]].water);
}

describe('worldgen (PW16)', () => {
  it('is deterministic: same pack + spec + seed reproduces identical terrain and resources', () => {
    const spec = specFor(1234);
    const a = generateWorldMap(PACK, spec, 777);
    const b = generateWorldMap(PACK, spec, 777);
    expect([...a.map.terrain]).toEqual([...b.map.terrain]);
    expect([...a.map.res]).toEqual([...b.map.res]);
    expect([...a.map.resKind]).toEqual([...b.map.resKind]);
    expect(a.preset.starts).toEqual(b.preset.starts);
  });

  it('varies terrain across seeds', () => {
    const sigs = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const { map } = generateWorldMap(PACK, specFor(seed), seed * 97 + 11);
      sigs.add([...map.terrain.slice(0, 512)].join(','));
    }
    expect(sigs.size).toBeGreaterThan(1);
  });

  it('keeps every water body in one naval component (ships traverse all water)', () => {
    for (const seed of [11, 22, 33]) {
      const { map } = generateWorldMap(PACK, specFor(seed), seed);
      expect(waterComponents(map)).toBe(1);
    }
  });

  it('produces enough viable newcomer sites with resources on land', () => {
    for (const seed of [5, 6, 7]) {
      const spec = specFor(seed);
      const { map, preset, report } = generateWorldMap(PACK, spec, seed);
      expect(report.attempts.length).toBeGreaterThan(0);
      expect(preset.starts.length).toBeGreaterThanOrEqual(spec.spawnSitesMin > 16 ? 16 : spec.spawnSitesMin);
      let viable = 0, withRes = 0;
      for (let i = 0; i < map.w * map.h; i++) {
        if (!passable(PACK, map, i, 'vehicle') || !buildableTerrain(PACK, map, i)) continue;
        viable++;
        const cx = i % map.w, cy = Math.floor(i / map.w);
        let near = 0;
        for (let y = Math.max(0, cy - 14); y <= Math.min(map.h - 1, cy + 14); y++)
          for (let x = Math.max(0, cx - 14); x <= Math.min(map.w - 1, cx + 14); x++)
            near += map.res[y * map.w + x];
        if (near > 0) withRes++;
      }
      expect(viable).toBeGreaterThanOrEqual(spec.spawnSitesMin);
      expect(withRes).toBeGreaterThanOrEqual(spec.spawnSitesMin);
    }
  });

  it('scatters resource fields on land', () => {
    const { map } = generateWorldMap(PACK, specFor(9), 9);
    const kinds = new Set<number>();
    for (const k of map.resKind) if (k) kinds.add(k);
    expect(kinds.size).toBeGreaterThan(0);
    for (let i = 0; i < map.w * map.h; i++) {
      if (map.resKind[i]) expect(isWater(PACK, map, i)).toBe(false);
    }
  });

  it('records rejected attempts with reasons in diagnostics', () => {
    // seaLevel 255 → everything is water → every attempt must be rejected.
    const spec = specFor(4, { seaLevel: 255, maxAttempts: 3 });
    expect(() => generateWorldMap(PACK, spec, 4)).toThrow(/no valid map/);
    try {
      generateWorldMap(PACK, spec, 4);
    } catch (e) {
      expect(String(e)).toMatch(/land fraction|viable spawn/);
    }
  });

  it('reports attempt diagnostics for accepted maps too', () => {
    const { report } = generateWorldMap(PACK, specFor(8), 8);
    expect(report.spec.version).toBe(WORLDGEN_VERSION);
    expect(report.attempts.at(-1)!.reasons).toEqual([]);
    expect(report.landBridges).toBeGreaterThanOrEqual(0);
  });

  it('runs inside a Game and survives snapshot/restore with identity intact', () => {
    const spec = specFor(21);
    const setup: GameSetup = {
      pack: PACK, mapId: 'worldgen', seed: 42, persistent: true, mmo: TUNING, worldgen: spec,
      players: [{ name: 'P0', faction: PACK.factions[0].id, ai: false }],
    };
    const g = new Game(setup);
    expect(g.map.w).toBe(spec.width);
    expect(g.map.h).toBe(spec.height);
    expect(g.worldgenSpec).toEqual(spec);
    const snap = captureGame(g, { seed: 42 });
    const g2 = restoreGame(snap, [PACK]);
    expect(g2.worldgenSpec).toEqual(spec);
    expect([...g2.map.terrain]).toEqual([...g.map.terrain]);
    expect(g2.mapPreset.starts).toEqual(g.mapPreset.starts);
    // The restored player still has their starter MCV.
    expect([...g2.entities.values()].some(e => e.kind === 'unit' && e.owner === 0)).toBe(true);
  });
});
