// PW11: deterministic newcomer spawn-cell selection. The authority picks a
// map-valid, terrain-valid cell with reachable resources, honours a viable
// client preference, maximises practical travel separation from existing
// settlements, and never stalls on a degenerate map.
import { describe, expect, it } from 'vitest';
import { PACKS, buildableTerrain, generateMap, passable } from '../../packages/fusion/src/index';
import { pickSpawnCell } from '../../apps/service/src/mmo/spawn';

const PACK = PACKS['td'];
const PRESET = PACK.maps[0];
const SEED = 1337;
const MAP = generateMap(PACK, PRESET, SEED);

function viable(i: number): boolean {
  return passable(PACK, MAP, i, 'vehicle') && buildableTerrain(PACK, MAP, i);
}
function sepFrom(i: number, keep: number[]): number {
  const cx = i % MAP.w, cy = Math.floor(i / MAP.w);
  let best = Infinity;
  for (const k of keep) {
    const d = Math.max(Math.abs(cx - (k % MAP.w)), Math.abs(cy - Math.floor(k / MAP.w)));
    if (d < best) best = d;
  }
  return best;
}

describe('pickSpawnCell', () => {
  it('is deterministic and returns a viable cell', () => {
    const a = pickSpawnCell({ packId: 'td', mapId: PRESET.id, seed: SEED });
    const b = pickSpawnCell({ packId: 'td', mapId: PRESET.id, seed: SEED });
    expect(a.cell).toBe(b.cell);
    expect(viable(a.cell)).toBe(true);
    expect(a.x).toBe(a.cell % MAP.w);
    expect(a.y).toBe(Math.floor(a.cell / MAP.w));
  });

  it('honours a viable, sufficiently separated client preference', () => {
    const base = pickSpawnCell({ packId: 'td', mapId: PRESET.id, seed: SEED });
    const pick = pickSpawnCell({
      packId: 'td', mapId: PRESET.id, seed: SEED,
      preferCell: base.cell, keepAwayCells: [], separationCells: 1,
    });
    expect(pick.cell).toBe(base.cell);
    expect(pick.adjusted).toBe(false);
  });

  it('rejects an inviable preference and adjusts to the best valid cell', () => {
    // Cell 0 is the map corner — find a cell that fails viability instead of
    // assuming the corner is water.
    let bad = -1;
    for (let i = 0; i < MAP.w * MAP.h; i++) if (!viable(i)) { bad = i; break; }
    expect(bad).toBeGreaterThanOrEqual(0);
    const pick = pickSpawnCell({
      packId: 'td', mapId: PRESET.id, seed: SEED,
      preferCell: bad, keepAwayCells: [], separationCells: 1,
    });
    expect(pick.adjusted).toBe(true);
    expect(pick.cell).not.toBe(bad);
    expect(viable(pick.cell)).toBe(true);
  });

  it('maximises separation from existing settlements when the band allows', () => {
    // Keep-away ring around the map centre: the pick must land at the best
    // achievable distance, never inside the ring.
    const keep: number[] = [];
    const cx = MAP.w >> 1, cy = MAP.h >> 1, ring = 20;
    for (let i = 0; i < MAP.w * MAP.h; i++) {
      const x = i % MAP.w, y = Math.floor(i / MAP.w);
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= ring) keep.push(i);
    }
    const pick = pickSpawnCell({
      packId: 'td', mapId: PRESET.id, seed: SEED,
      keepAwayCells: keep, separationCells: 24,
    });
    const got = sepFrom(pick.cell, keep);
    // The best achievable separation over all viable cells.
    let best = -1;
    for (let i = 0; i < MAP.w * MAP.h; i++) {
      if (!viable(i)) continue;
      best = Math.max(best, Math.min(sepFrom(i, keep), 24));
    }
    expect(Math.min(got, 24)).toBe(best);
    expect(viable(pick.cell)).toBe(true);
  });

  it('still returns a cell when every constraint is unsatisfiable', () => {
    const keep: number[] = [];
    for (let i = 0; i < MAP.w * MAP.h; i++) keep.push(i);
    const pick = pickSpawnCell({
      packId: 'td', mapId: PRESET.id, seed: SEED,
      keepAwayCells: keep, separationCells: 24,
    });
    expect(pick.cell).toBeGreaterThanOrEqual(0);
    expect(pick.cell).toBeLessThan(MAP.w * MAP.h);
  });
});
