// Sprite forge: renders small 3D models built from primitives into cached 2D sprites,
// lit consistently, for either view. This is how the art gets the pre-rendered look of
// the classics (Dune 2000's 3/4 view, Red Alert 2's isometric voxels) without bundling
// any original asset. Model space: X east, Y south, Z up, measured in cells.

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];
export interface Face { pts: Vec3[]; color: RGB; glow?: boolean; flat?: boolean; smooth?: boolean }

export class Mesh {
  faces: Face[] = [];
  add(pts: Vec3[], color: RGB, opts: { glow?: boolean; flat?: boolean; smooth?: boolean } = {}) { this.faces.push({ pts, color, ...opts }); return this; }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB, opts: { glow?: boolean; top?: RGB } = {}) {
    const c = (x: number, y: number, z: number): Vec3 => [x, y, z];
    this.add([c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], opts.top ?? color, opts); // top
    this.add([c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1)], color, opts);              // south
    this.add([c(x1, y0, z0), c(x1, y0, z1), c(x1, y1, z1), c(x1, y1, z0)], color, opts);              // east
    this.add([c(x0, y0, z0), c(x0, y0, z1), c(x1, y0, z1), c(x1, y0, z0)], color, opts);              // north
    this.add([c(x0, y0, z0), c(x0, y1, z0), c(x0, y1, z1), c(x0, y0, z1)], color, opts);              // west
    return this;
  }

  /** Frustum/cylinder around a vertical axis. */
  cylinder(cx: number, cy: number, z0: number, z1: number, r0: number, r1 = r0, color: RGB, segs = 16, opts: { glow?: boolean; top?: RGB; cap?: boolean } = {}) {
    const ring = (r: number, z: number) => Array.from({ length: segs }, (_, i) => {
      const a = (i / segs) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z] as Vec3;
    });
    const lo = ring(r0, z0), hi = ring(r1, z1);
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      this.add([lo[i], lo[j], hi[j], hi[i]], color, { glow: opts.glow, smooth: true });
    }
    if (opts.cap !== false && r1 > 0) this.add([...hi], opts.top ?? color, { glow: opts.glow, smooth: true });
    return this;
  }

  /** Hemisphere (dome) sitting on z0. */
  dome(cx: number, cy: number, z0: number, r: number, color: RGB, rings = 5, segs = 16, height = r) {
    for (let k = 0; k < rings; k++) {
      const a0 = (k / rings) * (Math.PI / 2), a1 = ((k + 1) / rings) * (Math.PI / 2);
      this.cylinder(cx, cy, z0 + Math.sin(a0) * height, z0 + Math.sin(a1) * height, Math.cos(a0) * r, Math.cos(a1) * r, color, segs, { cap: k === rings - 1 });
    }
    return this;
  }

  /** Gabled roof along X (axis 'x') or Y. */
  roof(x0: number, y0: number, x1: number, y1: number, z0: number, ridge: number, color: RGB, axis: 'x' | 'y' = 'x') {
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      this.add([[x0, y0, z0], [x1, y0, z0], [x1, ym, ridge], [x0, ym, ridge]], color);
      this.add([[x0, ym, ridge], [x1, ym, ridge], [x1, y1, z0], [x0, y1, z0]], color);
      this.add([[x0, y0, z0], [x0, ym, ridge], [x0, y1, z0]], color);
      this.add([[x1, y0, z0], [x1, y1, z0], [x1, ym, ridge]], color);
    } else {
      const xm = (x0 + x1) / 2;
      this.add([[x0, y0, z0], [xm, y0, ridge], [xm, y1, ridge], [x0, y1, z0]], color);
      this.add([[xm, y0, ridge], [x1, y0, z0], [x1, y1, z0], [xm, y1, ridge]], color);
      this.add([[x0, y1, z0], [xm, y1, ridge], [x1, y1, z0]], color);
      this.add([[x0, y0, z0], [x1, y0, z0], [xm, y0, ridge]], color);
    }
    return this;
  }

  /** Copy of the mesh rotated about (ox, oy) by `angle` radians (for unit facings). */
  rotated(angle: number, ox = 0, oy = 0): Mesh {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = new Mesh();
    m.faces = this.faces.map(f => ({ ...f, pts: f.pts.map(([x, y, z]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c, z] as Vec3) }));
    return m;
  }

  merge(other: Mesh) { this.faces.push(...other.faces); return this; }
}

export interface View {
  iso: boolean;
  /** Pixels per cell. */
  tileW: number;
  tileH: number;
  /** Pixels per unit of height. */
  zScale: number;
}

export const ORTHO_VIEW: View = { iso: false, tileW: 32, tileH: 32, zScale: 26 };
export const ISO_VIEW: View = { iso: true, tileW: 48, tileH: 24, zScale: 22 };

export function projectPoint(view: View, [x, y, z]: Vec3): { x: number; y: number } {
  if (!view.iso) return { x: x * view.tileW, y: y * view.tileH - z * view.zScale };
  return { x: (x - y) * (view.tileW / 2), y: (x + y) * (view.tileH / 2) - z * view.zScale };
}

/** Direction toward the viewer, used for culling and depth. */
function viewDir(view: View): Vec3 {
  if (!view.iso) { const k = view.zScale / view.tileH; return norm([0, k, 1]); }
  const k = view.zScale / view.tileH;
  return norm([k, k, 1]);
}

const LIGHT: Vec3 = norm([-0.55, -0.45, 0.85]);

function norm(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function normal(pts: Vec3[]): Vec3 {
  // Newell's method copes with any planar polygon.
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm([nx, ny, nz]);
}

const rgb = (c: RGB, k: number) => `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;

/** Draw a mesh into a context with (0,0,0) at (ox, oy). */
export function drawMesh(ctx: CanvasRenderingContext2D, mesh: Mesh, view: View, ox: number, oy: number) {
  const v = viewDir(view);
  const faces = mesh.faces.map(f => {
    let n = normal(f.pts);
    // Faces are authored with mixed winding; orient each toward the viewer side it faces.
    const c = f.pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as Vec3, [0, 0, 0] as Vec3).map(x => x / f.pts.length) as Vec3;
    if (n[0] * v[0] + n[1] * v[1] + n[2] * v[2] < 0) n = [-n[0], -n[1], -n[2]];
    const depth = c[0] * v[0] + c[1] * v[1] + c[2] * v[2];
    return { f, n, depth, c };
  });
  faces.sort((a, b) => a.depth - b.depth);
  for (const { f, n } of faces) {
    const pts = f.pts.map(p => projectPoint(view, p));
    let k: number;
    if (f.glow) k = 1.15;
    else {
      const lambert = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      k = 0.56 + 0.56 * lambert + (n[2] > 0.9 ? 0.05 : 0);
    }
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(ox + p.x, oy + p.y) : ctx.moveTo(ox + p.x, oy + p.y)));
    ctx.closePath();
    const vertical = Math.abs(n[2]) < 0.35;
    if (vertical && !f.flat && !f.glow) {
      // Pre-rendered look: vertical faces darken toward the ground.
      const ys = pts.map(p => p.y);
      const g = ctx.createLinearGradient(0, oy + Math.min(...ys), 0, oy + Math.max(...ys));
      g.addColorStop(0, rgb(f.color, k * 1.1)); g.addColorStop(1, rgb(f.color, k * 0.78));
      ctx.fillStyle = g;
    } else ctx.fillStyle = rgb(f.color, k);
    ctx.fill();
    if (f.smooth || f.glow) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8; ctx.stroke(); }
    else { ctx.strokeStyle = rgb(f.color, k * 0.7); ctx.lineWidth = 0.6; ctx.stroke(); }
  }
}

export interface Sprite { canvas: HTMLCanvasElement; ox: number; oy: number }

/** Where a point casts its shadow on the ground (light from the north-west). */
function shadowPoint([x, y, z]: Vec3): Vec3 {
  return [x - (LIGHT[0] / LIGHT[2]) * z, y - (LIGHT[1] / LIGHT[2]) * z, 0];
}

/**
 * Render a mesh into a tightly-sized canvas, with its soft ground shadow baked in.
 * `ox/oy` is where the model origin lands.
 */
export function bake(mesh: Mesh, view: View, extra?: (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void, opts: { shadow?: boolean } = {}): Sprite {
  const shadow = opts.shadow !== false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: Vec3) => {
    const q = projectPoint(view, p);
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  };
  for (const f of mesh.faces) for (const p of f.pts) { grow(p); if (shadow) grow(shadowPoint(p)); }
  if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  const pad = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(maxX - minX) + pad * 2;
  canvas.height = Math.ceil(maxY - minY) + pad * 2;
  const ctx = canvas.getContext('2d')!;
  const ox = -minX + pad, oy = -minY + pad;
  if (shadow) {
    // Union of every face's ground shadow, composited once so overlaps don't double up.
    const layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    const s = layer.getContext('2d')!;
    s.fillStyle = '#000';
    for (const f of mesh.faces) {
      if (f.glow) continue;
      s.beginPath();
      f.pts.forEach((p, i) => { const q = projectPoint(view, shadowPoint(p)); if (i) s.lineTo(ox + q.x, oy + q.y); else s.moveTo(ox + q.x, oy + q.y); });
      s.closePath(); s.fill();
    }
    ctx.globalAlpha = 0.34; ctx.filter = 'blur(1.2px)';
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none';
  }
  drawMesh(ctx, mesh, view, ox, oy);
  extra?.(ctx, ox, oy);
  return { canvas, ox, oy };
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tint(c: RGB, k: number): RGB { return [c[0] * k, c[1] * k, c[2] * k]; }
