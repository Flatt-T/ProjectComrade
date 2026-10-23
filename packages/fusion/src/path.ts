import { MapData, passable } from './map';
import { MoveClass, RulePack } from './rules';

const DIRS = [[0, -1, 10], [1, 0, 10], [0, 1, 10], [-1, 0, 10], [1, -1, 14], [1, 1, 14], [-1, 1, 14], [-1, -1, 14]] as const;

/** Binary min-heap keyed by (f, h, index) so ties always resolve the same way. */
class Heap {
  private items: number[] = [];
  constructor(private f: Int32Array, private h: Int32Array) {}
  get size() { return this.items.length; }
  private less(a: number, b: number) {
    const fa = this.f[a], fb = this.f[b];
    if (fa !== fb) return fa < fb;
    const ha = this.h[a], hb = this.h[b];
    if (ha !== hb) return ha < hb;
    return a < b;
  }
  push(n: number) {
    const items = this.items;
    items.push(n);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(items[i], items[p])) break;
      [items[i], items[p]] = [items[p], items[i]];
      i = p;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < items.length && this.less(items[l], items[m])) m = l;
        if (r < items.length && this.less(items[r], items[m])) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
}

export interface PathOptions {
  /** Cells that should count as walkable even if occupied (e.g. a refinery dock). */
  allow?: number;
  maxNodes?: number;
}

/**
 * A* over the cell grid. Returns the cells to walk through (start excluded, goal
 * included). If the goal cannot be reached, returns a path to the closest reachable cell.
 */
export function findPath(pack: RulePack, map: MapData, kind: MoveClass, from: number, to: number, opts: PathOptions = {}): number[] {
  if (from === to) return [];
  // Aircraft fly straight to the goal.
  if (kind === 'aircraft') return [to];
  const w = map.w, size = w * map.h;
  const g = new Int32Array(size).fill(-1);
  const f = new Int32Array(size);
  const h = new Int32Array(size);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const tx = to % w, ty = Math.floor(to / w);
  const heuristic = (i: number) => {
    const dx = Math.abs((i % w) - tx), dy = Math.abs(Math.floor(i / w) - ty);
    return 10 * (dx + dy) - 6 * Math.min(dx, dy);
  };
  const walkable = (i: number) => i === opts.allow || passable(pack, map, i, kind);
  const heap = new Heap(f, h);
  g[from] = 0; h[from] = heuristic(from); f[from] = h[from];
  heap.push(from);
  let best = from, bestH = h[from];
  const maxNodes = opts.maxNodes ?? 6000;
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === to) { best = to; break; }
    if (h[cur] < bestH) { best = cur; bestH = h[cur]; }
    if (++expanded > maxNodes) break;
    const cx = cur % w, cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
      const ni = ny * w + nx;
      if (closed[ni] || !walkable(ni)) continue;
      // No cutting corners past blocked cells.
      if (dx !== 0 && dy !== 0 && (!walkable(cy * w + nx) || !walkable(ny * w + cx))) continue;
      const speed = pack.terrains[map.terrain[ni]].speed || 100;
      const ng = g[cur] + Math.floor((cost * 100) / speed);
      if (g[ni] !== -1 && ng >= g[ni]) continue;
      g[ni] = ng; h[ni] = heuristic(ni); f[ni] = ng + h[ni]; parent[ni] = cur;
      heap.push(ni);
    }
  }
  const path: number[] = [];
  for (let c = best; c !== from && c !== -1; c = parent[c]) path.push(c);
  return path.reverse();
}

/** Spiral outwards from a cell to find the nearest cell satisfying a predicate. */
export function nearestCell(map: MapData, origin: number, maxRadius: number, ok: (i: number) => boolean): number {
  const w = map.w, ox = origin % w, oy = Math.floor(origin / w);
  if (ok(origin)) return origin;
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = ox + dx, y = oy + dy;
      if (x < 0 || y < 0 || x >= w || y >= map.h) continue;
      const i = y * w + x;
      if (ok(i)) return i;
    }
  }
  return -1;
}
