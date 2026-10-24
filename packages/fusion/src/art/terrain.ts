// Per-pixel terrain painter. Instead of flat tiles, every pixel picks its material from
// smooth, noise-perturbed terrain fields (so edges erode organically), is textured
// procedurally (sand ripples, craggy rock, grass, water), and is lit by a height field
// with cast shadows, giving raised rock plateaus and cliffs their relief.
import type { MapData } from '../map';
import type { RulePack } from '../rules';
import { RGB, View } from './forge';

type Kind = 'sand' | 'dunes' | 'rock' | 'rough' | 'cliff' | 'grass' | 'road' | 'beach' | 'woods' | 'water';
interface Material { base: RGB; alt: RGB; height: number; kind: Kind; edge: number }

const DUNE: Record<string, Material> = {
  sand: { base: [233, 208, 160], alt: [219, 189, 140], height: 0, kind: 'sand', edge: 0.3 },
  dunes: { base: [229, 196, 140], alt: [208, 170, 114], height: 0.12, kind: 'dunes', edge: 0.35 },
  rock: { base: [202, 126, 68], alt: [174, 100, 54], height: 0.42, kind: 'rock', edge: 0.8 },
  rough: { base: [160, 88, 50], alt: [124, 64, 36], height: 0.62, kind: 'rough', edge: 0.75 },
  cliff: { base: [118, 58, 32], alt: [82, 38, 22], height: 1.15, kind: 'cliff', edge: 0.45 },
};
const RA2: Record<string, Material> = {
  clear: { base: [122, 134, 60], alt: [98, 112, 46], height: 0, kind: 'grass', edge: 0.35 },
  road: { base: [152, 120, 82], alt: [128, 100, 66], height: 0, kind: 'road', edge: 0.2 },
  sand: { base: [206, 180, 122], alt: [186, 160, 104], height: 0, kind: 'beach', edge: 0.35 },
  rough: { base: [132, 122, 74], alt: [108, 98, 60], height: 0.08, kind: 'rough', edge: 0.45 },
  trees: { base: [88, 104, 42], alt: [70, 86, 34], height: 0, kind: 'woods', edge: 0.4 },
  cliff: { base: [172, 104, 60], alt: [122, 70, 40], height: 1.15, kind: 'cliff', edge: 0.45 },
  water: { base: [40, 64, 94], alt: [32, 52, 78], height: -0.35, kind: 'water', edge: 0.35 },
};

function hex(c: string): RGB { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function materials(pack: RulePack): Material[] {
  const table = pack.projection === 'iso' ? RA2 : DUNE;
  return pack.terrains.map(t => table[t.id] ?? {
    base: hex(t.color), alt: hex(t.color2), height: t.vehicle ? 0 : 0.8,
    kind: t.sand ? 'sand' : t.foot ? 'grass' : 'cliff', edge: 0.35,
  });
}

/** Tileable value-noise fBm, 256x256, values 0..1. */
function fbm(seed: number, baseCells: number, octaves: number): Float32Array {
  const N = 256, out = new Float32Array(N * N);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells << o;
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) {
      let h = Math.imul(i + 1, 374761393) ^ Math.imul(seed + o * 7919, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      lat[i] = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }
    const step = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / step, fy = y / step;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1], c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
      out[y * N + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

let noiseCache: { lo: Float32Array; mid: Float32Array; hi: Float32Array } | null = null;
function noises() {
  if (!noiseCache) noiseCache = { lo: fbm(11, 2, 4), mid: fbm(23, 8, 3), hi: fbm(37, 32, 2) };
  return noiseCache;
}
const at = (n: Float32Array, x: number, y: number) => n[((y & 255) << 8) | (x & 255)];
/** Bilinear sample at fractional texel coordinates, for smooth low-frequency variation. */
function smooth(n: Float32Array, fx: number, fy: number) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = at(n, x0, y0), b = at(n, x0 + 1, y0), c = at(n, x0, y0 + 1), d = at(n, x0 + 1, y0 + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const LIGHT = (() => { const v = [-0.55, -0.45, 0.85]; const l = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / l); })();

/**
 * Paint the whole battlefield into `canvas`. For isometric views `originX` shifts the
 * diamond so it fits; pixels outside the map stay transparent.
 */
export function paintTerrain(canvas: HTMLCanvasElement, map: MapData, pack: RulePack, view: View, originX: number) {
  const { lo, mid, hi } = noises();
  const mats = materials(pack);
  const { w, h, terrain } = map;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const data = img.data;

  // Height field on a sub-cell grid, then normal lighting and cast shadows.
  const S = 4, gw = w * S + 1, gh = h * S + 1;
  const height = new Float32Array(gw * gh);
  const cellH = (x: number, y: number) => mats[terrain[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]].height;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const cx = gx / S - 0.5, cy = gy / S - 0.5;
    const ix = Math.floor(cx), iy = Math.floor(cy);
    const u = cx - ix, v = cy - iy;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = cellH(ix, iy), b = cellH(ix + 1, iy), c = cellH(ix, iy + 1), d = cellH(ix + 1, iy + 1);
    const base = a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    height[gy * gw + gx] = base + (at(lo, gx * 3, gy * 3) - 0.5) * 0.12 * Math.max(0.2, base);
  }
  const shade = new Float32Array(gw * gh);
  const flat = LIGHT[2];
  const relief = 3.2;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx;
    const hx = (height[gy * gw + Math.min(gw - 1, gx + 1)] - height[gy * gw + Math.max(0, gx - 1)]) * S / 2 * relief;
    const hy = (height[Math.min(gh - 1, gy + 1) * gw + gx] - height[Math.max(0, gy - 1) * gw + gx]) * S / 2 * relief;
    const len = Math.hypot(hx, hy, 1);
    const nl = (-hx * LIGHT[0] - hy * LIGHT[1] + LIGHT[2]) / len;
    let s = 1 + (nl - flat) * 0.9;
    // Cast shadow: march toward the light; anything rising above the ray occludes.
    const h0 = height[i];
    const dx = LIGHT[0], dy = LIGHT[1], rise = LIGHT[2] / Math.hypot(dx, dy) / S;
    let occl = 0;
    for (let k = 1; k <= 14; k++) {
      const sx = Math.round(gx + dx * k * 1.4), sy = Math.round(gy + dy * k * 1.4);
      if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) break;
      const over = height[sy * gw + sx] - (h0 + rise * k * 1.4 * relief * 0.35);
      if (over > 0) { occl = Math.max(occl, Math.min(1, over * 4) * (1 - k / 18)); }
    }
    s *= 1 - occl * 0.32;
    shade[i] = s;
  }
  const sampleShade = (cx: number, cy: number) => {
    const fx = Math.max(0, Math.min(gw - 1.001, cx * S)), fy = Math.max(0, Math.min(gh - 1.001, cy * S));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = shade[y0 * gw + x0], b = shade[y0 * gw + x0 + 1], c = shade[(y0 + 1) * gw + x0], d = shade[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  const tw2 = view.tileW / 2, th2 = view.tileH / 2;
  const scores = new Float32Array(mats.length);
  const present: number[] = [];
  const col = [0, 0, 0];
  const texture = (t: number, x: number, y: number, out: number[]) => {
    const m = mats[t];
    // Rotated sampling so value-noise features never line up with the cell grid.
    const ru = x * 0.8 + y * 0.6, rv = y * 0.8 - x * 0.6;
    const patch = smooth(lo, ru / 4, rv / 4), grain = at(hi, x, y), med = smooth(mid, ru, rv);
    let f = Math.min(1, Math.max(0, (patch - 0.35) * 1.6 + (med - 0.5) * 0.4));
    let k = 1 + (grain - 0.5) * 0.12;
    switch (m.kind) {
      case 'sand': k += Math.sin(((x * 0.3 + y * 0.42) + patch * 34 + med * 7) * 0.55) * 0.018; break;
      case 'dunes': k += Math.sin(((x * 0.28 + y * 0.46) + patch * 50 + med * 9) * 0.32) * 0.05; f = Math.min(1, f + 0.15); break;
      case 'rock': { const r = 1 - Math.abs(med * 2 - 1); k *= 1 - Math.pow(r, 16) * 0.2; k += (grain - 0.5) * 0.16 + (at(hi, x * 3, y * 3) - 0.5) * 0.08; break; }
      case 'rough': { const r = 1 - Math.abs(med * 2 - 1); k *= 1 - Math.pow(r, 9) * 0.3; k += (grain - 0.5) * 0.24 + (at(hi, x * 3, y * 3) - 0.5) * 0.1; break; }
      case 'cliff': { const r = 1 - Math.abs(med * 2 - 1); k *= 1 - Math.pow(r, 4) * 0.45; k += (grain - 0.5) * 0.22 + Math.sin(y * 0.6 + med * 9) * 0.04; break; }
      case 'grass': case 'woods': {
        k += (grain > 0.8 ? -0.18 : grain < 0.12 ? 0.1 : 0) + (at(hi, x * 2 + 7, y * 2 + 3) - 0.5) * 0.14;
        f = Math.min(1, Math.max(0, f + (smooth(lo, x / 8 + 40, y / 8 + 40) - 0.5) * 1.8));
        k *= 1 + (smooth(lo, x / 4 + 90, y / 4 + 17) - 0.5) * 0.3;
        break;
      }
      case 'road': k += (grain - 0.5) * 0.1; break;
      case 'beach': k += (grain - 0.5) * 0.08; break;
      case 'water': k += Math.sin(x * 0.22 + y * 0.12 + med * 14) * 0.04 + (grain - 0.5) * 0.05; break;
    }
    out[0] = (m.base[0] + (m.alt[0] - m.base[0]) * f) * k;
    out[1] = (m.base[1] + (m.alt[1] - m.base[1]) * f) * k;
    out[2] = (m.base[2] + (m.alt[2] - m.base[2]) * f) * k;
  };
  const col2 = [0, 0, 0];

  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let cx: number, cy: number;
    if (view.iso) { const a = (px - originX) / tw2, b = py / th2; cx = (a + b) / 2; cy = (b - a) / 2; }
    else { cx = px / view.tileW; cy = py / view.tileH; }
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const fx = cx - 0.5, fy = cy - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const x0 = Math.max(0, ix), y0 = Math.max(0, iy), x1 = Math.min(w - 1, ix + 1), y1 = Math.min(h - 1, iy + 1);
    const t00 = terrain[y0 * w + x0], t10 = terrain[y0 * w + x1], t01 = terrain[y1 * w + x0], t11 = terrain[y1 * w + x1];
    let chosen = t00, blend = -1, mixAmt = 0;
    if (!(t00 === t10 && t00 === t01 && t00 === t11)) {
      const u = fx - ix, v = fy - iy;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      present.length = 0;
      for (const t of [t00, t10, t01, t11]) if (!present.includes(t)) { present.push(t); scores[t] = 0; }
      scores[t00] += (1 - su) * (1 - sv); scores[t10] += su * (1 - sv); scores[t01] += (1 - su) * sv; scores[t11] += su * sv;
      let best = -9, second = -9, bestT = t00, secondT = t00;
      for (const t of present) {
        const n = at(mid, px + t * 53, py + t * 97) * 0.55 + at(hi, px + t * 31, py + t * 17) * 0.3 + at(hi, px * 2 + t * 11, py * 2 + t * 5) * 0.15;
        const s = scores[t] + (n - 0.5) * mats[t].edge * 2.4 + t * 0.002;
        if (s > best) { second = best; secondT = bestT; best = s; bestT = t; } else if (s > second) { second = s; secondT = t; }
      }
      chosen = bestT;
      if (best - second < 0.035) { blend = secondT; mixAmt = 0.5 - (best - second) / 0.07; }
    }
    texture(chosen, px, py, col);
    if (blend >= 0) {
      texture(blend, px, py, col2);
      col[0] += (col2[0] - col[0]) * mixAmt; col[1] += (col2[1] - col[1]) * mixAmt; col[2] += (col2[2] - col[2]) * mixAmt;
    }
    let s = sampleShade(cx, cy);
    // Shallows and foam where water meets land.
    if (mats[chosen].kind === 'water' && (t00 !== t11 || t10 !== t01 || t00 !== t10)) { s *= 1.12; }
    const o = (py * W + px) * 4;
    data[o] = Math.max(0, Math.min(255, col[0] * s));
    data[o + 1] = Math.max(0, Math.min(255, col[1] * s));
    data[o + 2] = Math.max(0, Math.min(255, col[2] * s));
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Dune concrete slab: beige paving with fine joints, for one cell. */
export function concreteTile(view: View): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = view.tileW; c.height = view.tileH;
  const g = c.getContext('2d')!;
  const path = () => {
    g.beginPath();
    if (view.iso) { g.moveTo(view.tileW / 2, 0); g.lineTo(view.tileW, view.tileH / 2); g.lineTo(view.tileW / 2, view.tileH); g.lineTo(0, view.tileH / 2); }
    else g.rect(0, 0, view.tileW, view.tileH);
    g.closePath();
  };
  path(); g.fillStyle = '#d2a676'; g.fill();
  g.save(); path(); g.clip();
  for (let k = 0; k < 60; k++) { g.fillStyle = k % 2 ? 'rgba(255,240,210,0.10)' : 'rgba(90,50,20,0.10)'; g.fillRect((k * 37) % view.tileW, (k * 23) % view.tileH, 2, 1); }
  g.strokeStyle = 'rgba(255,236,200,0.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, view.tileH / 2); g.lineTo(view.tileW, view.tileH / 2); g.moveTo(view.tileW / 2, 0); g.lineTo(view.tileW / 2, view.tileH); g.stroke();
  g.restore();
  path(); g.strokeStyle = 'rgba(120,70,36,0.6)'; g.stroke();
  return c;
}

/** Dune spice: dusty red-orange stains on the sand. `level` 0..3 sets density. */
export function spiceSprite(level: number, variant: number, view: View): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = view.tileW * 2; c.height = view.tileH * 2;
  const g = c.getContext('2d')!;
  const cx = c.width / 2, cy = c.height / 2;
  const blobs = 3 + level * 3;
  for (let k = 0; k < blobs; k++) {
    const h = Math.imul(variant * 97 + k + 1, 2654435761) >>> 0;
    const x = cx + (((h & 255) / 255) - 0.5) * view.tileW * 1.1;
    const y = cy + ((((h >> 8) & 255) / 255) - 0.5) * view.tileH * 1.1;
    const r = view.tileW * (0.22 + ((h >> 16) & 15) / 60);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.32 + level * 0.12;
    grad.addColorStop(0, `rgba(196,82,34,${a})`); grad.addColorStop(0.6, `rgba(214,112,52,${a * 0.6})`); grad.addColorStop(1, 'rgba(220,130,70,0)');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y, r, view.iso ? r * 0.55 : r, 0, 0, Math.PI * 2); g.fill();
  }
  for (let k = 0; k < 18 + level * 14; k++) {
    const h = Math.imul(variant * 131 + k + 7, 2246822519) >>> 0;
    g.fillStyle = (h & 1) ? 'rgba(150,52,22,0.7)' : 'rgba(232,140,70,0.6)';
    g.fillRect(cx + (((h & 255) / 255) - 0.5) * view.tileW * 1.2, cy + ((((h >> 8) & 255) / 255) - 0.5) * view.tileH * 1.2, 1.5, 1.5);
  }
  return c;
}
