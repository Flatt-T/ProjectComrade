import { MapPreset, MoveClass, RulePack } from './rules';

export interface MapData {
  w: number;
  h: number;
  /** Index into pack.terrains. */
  terrain: Uint8Array;
  /** Resource units in each cell. */
  res: Uint16Array;
  /** 0 = none, otherwise index + 1 into pack.resources. */
  resKind: Uint8Array;
  /** The resource a cell held when the map was made (0 = none), and how much: fields grow back to this. */
  resHome: Uint8Array;
  resCap: Uint16Array;
  /** Dune concrete under the cell. */
  concrete: Uint8Array;
  /** Id of the blocking structure occupying the cell, 0 if none. */
  occupied: Int32Array;
  /** Decorative variation for the renderer, 0..255. */
  decor: Uint8Array;
  starts: { x: number; y: number }[];
}

/** Order-independent integer noise, so generation never depends on iteration order. */
export function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) & 255;
}

export function terrainIndex(pack: RulePack, id: string): number {
  const i = pack.terrains.findIndex(t => t.id === id);
  if (i < 0) throw new Error(`Unknown terrain ${id} in pack ${pack.id}`);
  return i;
}

export function resourceIndex(pack: RulePack, id: string): number {
  const i = pack.resources.findIndex(r => r.id === id);
  if (i < 0) throw new Error(`Unknown resource ${id} in pack ${pack.id}`);
  return i;
}

export function generateMap(pack: RulePack, preset: MapPreset, seed: number): MapData {
  const { width: w, height: h } = preset;
  const size = w * h;
  const map: MapData = {
    w, h,
    terrain: new Uint8Array(size).fill(terrainIndex(pack, preset.base)),
    res: new Uint16Array(size),
    resKind: new Uint8Array(size),
    resHome: new Uint8Array(size),
    resCap: new Uint16Array(size),
    concrete: new Uint8Array(size),
    occupied: new Int32Array(size),
    decor: new Uint8Array(size),
    starts: preset.starts.map(s => ({ ...s })),
  };
  const set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < w && y < h) map.terrain[y * w + x] = t; };
  const rough = preset.roughness ?? 2;

  for (const f of preset.features) {
    const t = terrainIndex(pack, f.terrain);
    if (f.shape === 'rect') {
      for (let y = f.y; y < f.y + (f.h ?? 1); y++) for (let x = f.x; x < f.x + (f.w ?? 1); x++) set(x, y, t);
    } else if (f.shape === 'circle') {
      const r = f.r ?? 3;
      for (let y = f.y - r - rough; y <= f.y + r + rough; y++) for (let x = f.x - r - rough; x <= f.x + r + rough; x++) {
        const d2 = (x - f.x) ** 2 + (y - f.y) ** 2;
        const jitter = (noise(x, y, seed) % (rough * 2 + 1)) - rough;
        const rr = r + jitter * 0.5;
        if (d2 <= rr * rr) set(x, y, t);
      }
    } else {
      // Ridge: a thick, slightly wandering line (cliffs, dune walls, rivers).
      const r = f.r ?? 1;
      const x2 = f.x2 ?? f.x, y2 = f.y2 ?? f.y;
      const steps = Math.max(Math.abs(x2 - f.x), Math.abs(y2 - f.y), 1);
      for (let i = 0; i <= steps; i++) {
        const cx = Math.round(f.x + ((x2 - f.x) * i) / steps);
        const cy = Math.round(f.y + ((y2 - f.y) * i) / steps);
        const wobble = (noise(i, steps, seed) % 3) - 1;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r + 1) set(cx + dx + wobble, cy + dy, t);
        }
      }
    }
  }

  for (const field of preset.fields) {
    const kind = resourceIndex(pack, field.resource);
    const def = pack.resources[kind];
    const max = field.amount ?? def.max;
    for (let y = field.y - field.r - 1; y <= field.y + field.r + 1; y++) for (let x = field.x - field.r - 1; x <= field.x + field.r + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      const terrain = pack.terrains[map.terrain[i]];
      if (!terrain.vehicle || terrain.buildable && pack.mechanics.buildOn?.includes(terrain.id)) continue;
      const d = Math.sqrt((x - field.x) ** 2 + (y - field.y) ** 2);
      const edge = field.r + ((noise(x, y, seed + 7) % 3) - 1) * 0.6;
      if (d > edge) continue;
      const richness = Math.max(0.25, 1 - d / (field.r + 1));
      map.resKind[i] = kind + 1;
      map.res[i] = Math.max(1, Math.round(max * richness));
    }
  }

  // Keep start positions clear of resources so the first base always fits.
  for (const s of map.starts) for (let y = s.y - 2; y <= s.y + 4; y++) for (let x = s.x - 2; x <= s.x + 4; x++) {
    if (x >= 0 && y >= 0 && x < w && y < h) { map.res[y * w + x] = 0; map.resKind[y * w + x] = 0; }
  }
  map.resHome.set(map.resKind);
  map.resCap.set(map.res);
  for (let i = 0; i < size; i++) map.decor[i] = noise(i % w, Math.floor(i / w), seed + 13);
  return map;
}

export function inBounds(map: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.w && y < map.h;
}

export function terrainPassable(pack: RulePack, map: MapData, i: number, kind: MoveClass): boolean {
  const t = pack.terrains[map.terrain[i]];
  switch (kind) {
    case 'infantry': return t.foot;
    case 'vehicle': return t.vehicle;
    case 'naval': return !!t.water;
    case 'amphibious': return t.vehicle || !!t.water;
    case 'aircraft': return true;
  }
}

/** Aircraft fly over buildings; everything else needs a free cell. */
export function passable(pack: RulePack, map: MapData, i: number, kind: MoveClass): boolean {
  return (kind === 'aircraft' || map.occupied[i] === 0) && terrainPassable(pack, map, i, kind);
}

/** Cells of open water (shipyards, naval spawn points). */
export function isWater(pack: RulePack, map: MapData, i: number): boolean {
  return !!pack.terrains[map.terrain[i]].water;
}

/** Terrain suitability for a structure cell, ignoring other structures and units. */
export function buildableTerrain(pack: RulePack, map: MapData, i: number): boolean {
  const t = pack.terrains[map.terrain[i]];
  if (!t.buildable) return false;
  if (pack.mechanics.buildOn && !pack.mechanics.buildOn.includes(t.id)) return false;
  return map.resKind[i] === 0;
}
