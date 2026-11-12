// Versioned frontier world generation (PW16, COMRADE 18 §2.4/§3.9).
//
// Persistent frontier regions are NOT hand-authored presets: each region seed
// carries a `WorldgenSpec` and `generateWorldMap` deterministically produces the
// terrain. The spec + seed fully determine the map, so snapshots, restores and
// every runner replica regenerate identical land — a code update or restart can
// never reshuffle an existing region.
//
// Generation is attempt-based: each attempt draws a candidate heightfield,
// paints terrain, carves water connections and scatters resources, then runs
// machine checks (single naval component, enough viable newcomer sites on the
// main landmass). Rejected attempts are recorded with reasons so map
// diagnostics can explain why a seed was refused.
import { Rng } from './core.js';
import { MapData, buildableTerrain, isWater, noise, passable, terrainIndex } from './map.js';
import type { MapPreset, RulePack } from './rules.js';

export const WORLDGEN_VERSION = 1;

/** Everything needed to reproduce a generated region map. Stored in the region seed. */
export interface WorldgenSpec {
  version: number;
  width: number;
  height: number;
  /** Heightfield threshold 0..255: cells at or above are land. */
  seaLevel: number;
  /** Primary buildable land terrain id (resolved from the pack at spec time). */
  landTerrain: string;
  /** Terrain painted on land cells adjacent to water (beach/coast edge). */
  shoreTerrain?: string;
  /** Secondary buildable terrain sprinkled in noise patches (forest/sand/snow). */
  biomeTerrain?: string;
  /** Impassable terrain scattered in small clumps (trees/cliff/rough). */
  blockTerrain?: string;
  /** Primary water terrain id. */
  waterTerrain: string;
  /** Extra decorative river channels carved from inland water to the sea. */
  rivers: number;
  /** Resource field clusters scattered on viable land. */
  resourceClusters: number;
  /** Radius of each resource cluster in cells. */
  resourceRadius: number;
  /** Minimum viable newcomer sites required on the main landmass. */
  spawnSitesMin: number;
  /** Maximum candidate maps tried before giving up. */
  maxAttempts: number;
}

/** Tunable profile section (contracts `MmoRulesProfile.worldgen`). */
export interface WorldgenTuning {
  width: number;
  height: number;
  seaLevel: number;
  rivers: number;
  resourceClusters: number;
  resourceRadius: number;
  spawnSitesMin: number;
  maxAttempts: number;
}

export const WORLDGEN_DEFAULT: WorldgenTuning = {
  width: 96, height: 96, seaLevel: 118, rivers: 3,
  resourceClusters: 14, resourceRadius: 6, spawnSitesMin: 8, maxAttempts: 24,
};

export interface WorldgenAttempt {
  attempt: number;
  seed: number;
  landFraction: number;
  landComponents: number;
  /** Naval components BEFORE channel carving. */
  waterComponents: number;
  viableSpawnCells: number;
  reasons: string[];
}

export interface WorldgenReport {
  spec: WorldgenSpec;
  attempts: WorldgenAttempt[];
  /** Choke-point diagnostic: cells where the main landmass narrows between water. */
  landBridges: number;
}

export interface WorldgenResult {
  map: MapData;
  /** Synthetic preset so GameSetup/preset consumers see real dimensions and spawn anchors. */
  preset: MapPreset;
  report: WorldgenReport;
}

// ---------------------------------------------------------------------------
// Terrain resolution — spec terrain ids come from pack terrain categories so the
// same profile works for every pack (TD, RA2, Dune, fusions).
// ---------------------------------------------------------------------------

function landCandidates(pack: RulePack): string[] {
  const buildOn = pack.mechanics.buildOn;
  return pack.terrains
    .filter(t => t.vehicle && t.buildable && (!buildOn || buildOn.includes(t.id)) && t.id !== 'road')
    .map(t => t.id);
}

function blockCandidates(pack: RulePack): string[] {
  return pack.terrains.filter(t => !t.vehicle && !t.water).map(t => t.id);
}

/**
 * Resolve a WorldgenSpec for a pack + tuning + master seed. Terrain variety is
 * derived deterministically from the seed: the primary land stays stable, the
 * biome patch terrain and block scatter rotate through the pack's candidates.
 */
export function worldgenSpecFor(pack: RulePack, tuning: WorldgenTuning, seed: number): WorldgenSpec {
  const land = landCandidates(pack);
  const landTerrain = land[0] ?? pack.terrains.find(t => t.buildable)?.id ?? pack.terrains[0].id;
  const waterTerrain = pack.terrains.find(t => t.water)?.id;
  if (!waterTerrain) throw new Error(`pack ${pack.id} has no water terrain for worldgen`);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const biomePool = land.filter(id => id !== landTerrain);
  const blockPool = blockCandidates(pack);
  return {
    version: WORLDGEN_VERSION,
    width: tuning.width, height: tuning.height, seaLevel: tuning.seaLevel,
    landTerrain,
    shoreTerrain: landTerrain,
    biomeTerrain: biomePool.length ? biomePool[rng.int(biomePool.length)] : undefined,
    blockTerrain: blockPool.length ? blockPool[rng.int(blockPool.length)] : undefined,
    waterTerrain,
    rivers: tuning.rivers, resourceClusters: tuning.resourceClusters,
    resourceRadius: tuning.resourceRadius, spawnSitesMin: tuning.spawnSitesMin,
    maxAttempts: tuning.maxAttempts,
  };
}

// ---------------------------------------------------------------------------
// Heightfield + flood fills
// ---------------------------------------------------------------------------

/** Smooth value noise in [0,255]: four octaves of the integer hash, bilinear. */
function vnoise(x: number, y: number, seed: number, cell: number): number {
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = noise(x0, y0, seed), n10 = noise(x0 + 1, y0, seed);
  const n01 = noise(x0, y0 + 1, seed), n11 = noise(x0 + 1, y0 + 1, seed);
  const top = n00 + (n10 - n00) * sx, bot = n01 + (n11 - n01) * sx;
  return Math.round(top + (bot - top) * sy);
}

function heightAt(x: number, y: number, seed: number): number {
  // Large landmasses, medium bays, fine coastline detail.
  return Math.round(
    vnoise(x, y, seed, 28) * 0.5 +
    vnoise(x, y, seed ^ 0x9e3779b9, 13) * 0.3 +
    vnoise(x, y, seed ^ 0x51f15e, 6) * 0.2,
  );
}

const DIRS8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

/** 8-connected component labels for cells matching `ok`. Returns labels + count. */
function components(map: MapData, ok: (i: number) => boolean): { labels: Int32Array; count: number; sizes: number[] } {
  const w = map.w, size = w * map.h;
  const labels = new Int32Array(size).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < size; s++) {
    if (labels[s] >= 0 || !ok(s)) continue;
    const id = sizes.length;
    let n = 0;
    labels[s] = id; stack.push(s);
    while (stack.length) {
      const c = stack.pop()!; n++;
      const cx = c % w, cy = Math.floor(c / w);
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
        const ni = ny * w + nx;
        if (labels[ni] < 0 && ok(ni)) { labels[ni] = id; stack.push(ni); }
      }
    }
    sizes.push(n);
  }
  return { labels, count: sizes.length, sizes };
}

// ---------------------------------------------------------------------------
// Carving
// ---------------------------------------------------------------------------

/** Carve a 1–2 cell water channel from `from` to `to` with jittered walk. */
function carveChannel(map: MapData, from: number, to: number, water: number, rng: Rng, width: number) {
  const w = map.w;
  let cx = from % w, cy = Math.floor(from / w);
  const tx = to % w, ty = Math.floor(to / w);
  const paint = (x: number, y: number) => {
    for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
      if (dx * dx + dy * dy > width * width + width) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < map.h) map.terrain[ny * w + nx] = water;
    }
  };
  let guard = w * map.h * 4;
  while ((cx !== tx || cy !== ty) && guard-- > 0) {
    paint(cx, cy);
    const dx = Math.sign(tx - cx), dy = Math.sign(ty - cy);
    // Mostly straight, occasionally sidestep for a natural meander.
    if (rng.chance(18)) {
      const px = cx + (dy !== 0 ? dy : 0), py = cy + (dx !== 0 ? -dx : rng.chance(50) ? 1 : -1);
      if (px >= 0 && py >= 0 && px < w && py < map.h) { cx = px; cy = py; continue; }
    }
    if (dx !== 0 && (dy === 0 || rng.chance(50))) cx += dx; else cy += dy;
  }
  paint(cx, cy);
}

// ---------------------------------------------------------------------------
// Resources + spawn anchors
// ---------------------------------------------------------------------------

/** Cells within `r` (Chebyshev) holding resources — mirrors spawn.ts viability. */
function nearbyResources(map: MapData, i: number, r: number): number {
  const w = map.w, cx = i % w, cy = Math.floor(i / w);
  let total = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(map.h - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++)
      total += map.res[y * w + x];
  return total;
}

function viableSpawnCell(pack: RulePack, map: MapData, i: number, resRadius: number): boolean {
  return passable(pack, map, i, 'vehicle') && buildableTerrain(pack, map, i)
    && nearbyResources(map, i, resRadius + 8) > 0;
}

/** Greedy max-min separation anchors over viable cells (deterministic scan order). */
function spawnAnchors(pack: RulePack, map: MapData, resRadius: number, count: number, onlyComp: Int32Array, comp: number): { x: number; y: number }[] {
  const w = map.w;
  const viable: number[] = [];
  for (let i = 0; i < w * map.h; i++) {
    if (onlyComp[i] !== comp || !viableSpawnCell(pack, map, i, resRadius)) continue;
    viable.push(i);
  }
  if (!viable.length) return [];
  const anchors: number[] = [viable[viable.length >> 1]];
  while (anchors.length < Math.min(count, viable.length)) {
    let best = -1, bestD = -1;
    for (const c of viable) {
      const cx = c % w, cy = Math.floor(c / w);
      let d = Infinity;
      for (const a of anchors) {
        const ax = a % w, ay = Math.floor(a / w);
        d = Math.min(d, Math.max(Math.abs(cx - ax), Math.abs(cy - ay)));
      }
      if (d > bestD) { bestD = d; best = c; }
    }
    if (best < 0) break;
    anchors.push(best);
  }
  return anchors.map(i => ({ x: i % w, y: Math.floor(i / w) }));
}

/** Narrowest-land diagnostic: vehicle cells with water on two opposite sides. */
function countLandBridges(pack: RulePack, map: MapData): number {
  const w = map.w;
  let n = 0;
  for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!passable(pack, map, i, 'vehicle')) continue;
    const n_ = isWater(pack, map, i - 1), s = isWater(pack, map, i + 1);
    const e = isWater(pack, map, i - w), ww = isWater(pack, map, i + w);
    if ((n_ && s) || (e && ww)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function paintAttempt(pack: RulePack, spec: WorldgenSpec, seed: number): { map: MapData; landCells: number; waterCells: number } {
  const w = spec.width, h = spec.height;
  const size = w * h;
  const landT = terrainIndex(pack, spec.landTerrain);
  const shoreT = spec.shoreTerrain ? terrainIndex(pack, spec.shoreTerrain) : landT;
  const biomeT = spec.biomeTerrain ? terrainIndex(pack, spec.biomeTerrain) : -1;
  const blockT = spec.blockTerrain ? terrainIndex(pack, spec.blockTerrain) : -1;
  const waterT = terrainIndex(pack, spec.waterTerrain);
  const map: MapData = {
    w, h,
    terrain: new Uint8Array(size),
    res: new Uint16Array(size), resKind: new Uint8Array(size),
    resHome: new Uint8Array(size), resCap: new Uint16Array(size),
    concrete: new Uint8Array(size), occupied: new Int32Array(size),
    decor: new Uint8Array(size), starts: [],
  };
  let landCells = 0, waterCells = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const elev = heightAt(x, y, seed);
    let t: number;
    if (elev < spec.seaLevel) { t = waterT; waterCells++; }
    else {
      landCells++;
      t = landT;
      // Coast edge: land cells touching water read as shore.
      let nearWater = false;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { nearWater = true; break; }
        if (heightAt(nx, ny, seed) < spec.seaLevel) { nearWater = true; break; }
      }
      if (nearWater) t = shoreT;
      else if (biomeT >= 0 && vnoise(x, y, seed ^ 0x7f4a7c15, 18) > 205) t = biomeT;
      else if (blockT >= 0 && vnoise(x, y, seed ^ 0x2c1b3d59, 9) > 232) t = blockT;
    }
    map.terrain[i] = t;
    map.decor[i] = noise(x, y, seed + 13);
  }
  return { map, landCells, waterCells };
}

function scatterResources(pack: RulePack, map: MapData, spec: WorldgenSpec, rng: Rng): void {
  const kinds = pack.resources.map((_, i) => i);
  for (let c = 0; c < spec.resourceClusters; c++) {
    // Find a buildable land cell on the largest vehicle component.
    let cx = -1, cy = -1;
    for (let tries = 0; tries < 400 && cx < 0; tries++) {
      const x = 2 + rng.int(spec.width - 4), y = 2 + rng.int(spec.height - 4);
      const i = y * spec.width + x;
      const t = pack.terrains[map.terrain[i]];
      if (!t.vehicle || t.water) continue;
      if (map.resKind[i] !== 0) continue;
      cx = x; cy = y;
    }
    if (cx < 0) continue;
    const kind = kinds[c % kinds.length];
    const def = pack.resources[kind];
    const max = def.max;
    for (let y = cy - spec.resourceRadius - 1; y <= cy + spec.resourceRadius + 1; y++) {
      for (let x = cx - spec.resourceRadius - 1; x <= cx + spec.resourceRadius + 1; x++) {
        if (x < 0 || y < 0 || x >= spec.width || y >= spec.height) continue;
        const i = y * spec.width + x;
        const terrain = pack.terrains[map.terrain[i]];
        if (!terrain.vehicle || (terrain.buildable && pack.mechanics.buildOn?.includes(terrain.id))) continue;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const edge = spec.resourceRadius + ((noise(x, y, spec.version + c) % 3) - 1) * 0.6;
        if (d > edge) continue;
        const richness = Math.max(0.25, 1 - d / (spec.resourceRadius + 1));
        map.resKind[i] = kind + 1;
        map.res[i] = Math.max(1, Math.round(max * richness));
      }
    }
  }
  map.resHome.set(map.resKind);
  map.resCap.set(map.res);
}

/**
 * Generate a region map. Deterministic in (pack, spec, seed): the same triple
 * always yields the same terrain, resources and spawn anchors on every machine.
 * Throws only when `maxAttempts` candidates all fail validation — callers
 * should treat that as a bad profile/seed pair, not a transient error.
 */
export function generateWorldMap(pack: RulePack, spec: WorldgenSpec, seed: number): WorldgenResult {
  const attempts: WorldgenAttempt[] = [];
  for (let a = 0; a < spec.maxAttempts; a++) {
    const attemptSeed = (seed + a * 0x9e3779b9) | 0;
    const { map, landCells, waterCells } = paintAttempt(pack, spec, attemptSeed);
    const reasons: string[] = [];

    // Decorative rivers first: inland channels to the map edge. They can create
    // new water bodies, so naval connectivity is validated AFTER them.
    if (spec.rivers > 0 && waterCells > spec.rivers * 4) {
      const rng = new Rng(attemptSeed ^ 0x27d4eb);
      const waterT = terrainIndex(pack, spec.waterTerrain);
      for (let r = 0; r < spec.rivers; r++) {
        const sx = 4 + rng.int(spec.width - 8), sy = 4 + rng.int(spec.height - 8);
        const si = sy * spec.width + sx;
        if (passable(pack, map, si, 'vehicle')) {
          // Carve from the land cell toward the nearest water, not just the edge.
          let best = -1, bestD = Infinity;
          for (let i = 0; i < spec.width * spec.height; i++) {
            if (!isWater(pack, map, i)) continue;
            const dx = Math.abs((i % spec.width) - sx), dy = Math.abs(Math.floor(i / spec.width) - sy);
            const d = dx + dy;
            if (d < bestD) { bestD = d; best = i; }
          }
          if (best >= 0) carveChannel(map, si, best, waterT, rng, 0);
        }
      }
    }

    // Naval connectivity: every water cell must reach every other by ship
    // (8-connected, matching findPath). Isolated ponds get carved channels.
    const navalOk = (i: number) => passable(pack, map, i, 'naval');
    let water = components(map, navalOk);
    const waterBefore = water.count;
    if (waterBefore > 1 && waterCells > 0) {
      const rng = new Rng(attemptSeed ^ 0x51ab3d);
      // Carve from each smaller component toward the largest until connected.
      let merged = true;
      for (let iter = 0; iter < spec.maxAttempts * 2 && water.count > 1; iter++) {
        const sizes = [...water.sizes].sort((x, y) => y - x);
        const main = water.sizes.indexOf(sizes[0]);
        let small = -1;
        for (let c = 0; c < water.count; c++) if (c !== main && (small < 0 || water.sizes[c] < water.sizes[small])) small = c;
        // Representative cells: first cell of each component.
        const mainCell = water.labels.indexOf(main);
        const smallCell = water.labels.indexOf(small);
        if (mainCell < 0 || smallCell < 0) break;
        carveChannel(map, smallCell, mainCell, terrainIndex(pack, spec.waterTerrain), rng, 1);
        water = components(map, navalOk);
      }
      merged = water.count <= 1;
      if (!merged) reasons.push(`water components ${waterBefore} -> ${water.count} after carving`);
    } else if (waterBefore > 1) {
      reasons.push('no water cells');
    }

    const landOk = (i: number) => passable(pack, map, i, 'vehicle');
    const land = components(map, landOk);

    // Resources on viable land.
    scatterResources(pack, map, spec, new Rng(attemptSeed ^ 0x6a09e667));

    // Spawn viability: buildable vehicle land with nearby resources, counted
    // per land component — the main component must host the cohort.
    const resR = spec.resourceRadius;
    const viableByComp = new Map<number, number>();
    let totalViable = 0;
    for (let i = 0; i < spec.width * spec.height; i++) {
      if (land.labels[i] < 0 || !viableSpawnCell(pack, map, i, resR)) continue;
      totalViable++;
      const c = land.labels[i];
      viableByComp.set(c, (viableByComp.get(c) ?? 0) + 1);
    }
    let mainComp = -1, mainViable = 0;
    for (const [c, n] of viableByComp) if (n > mainViable) { mainViable = n; mainComp = c; }

    const landFraction = landCells / (spec.width * spec.height);
    if (landFraction < 0.3) reasons.push(`land fraction ${landFraction.toFixed(2)} < 0.30`);
    if (landFraction > 0.85) reasons.push(`land fraction ${landFraction.toFixed(2)} > 0.85`);
    if (totalViable < spec.spawnSitesMin) reasons.push(`viable spawn cells ${totalViable} < ${spec.spawnSitesMin}`);
    if (mainViable < spec.spawnSitesMin) reasons.push(`main-land viable cells ${mainViable} < ${spec.spawnSitesMin}`);

    attempts.push({
      attempt: a, seed: attemptSeed,
      landFraction: Math.round(landFraction * 1000) / 1000,
      landComponents: land.count, waterComponents: waterBefore,
      viableSpawnCells: totalViable, reasons,
    });
    if (reasons.length) continue;

    // Accepted: anchors on the main land component for preset.starts.
    const anchors = spawnAnchors(pack, map, resR, 16, land.labels, mainComp);
    const preset: MapPreset = {
      id: 'worldgen', name: `Frontier ${seed.toString(16)}`, description: 'Procedurally generated persistent region',
      width: spec.width, height: spec.height, maxPlayers: 16, base: spec.landTerrain,
      starts: anchors, features: [], fields: [],
    };
    map.starts = anchors;
    return {
      map, preset,
      report: { spec, attempts, landBridges: countLandBridges(pack, map) },
    };
  }
  const why = attempts.map(a => `#${a.attempt}: ${a.reasons.join('; ') || 'ok?'}`).join(' | ');
  throw new Error(`worldgen: no valid map in ${spec.maxAttempts} attempts (${why})`);
}
