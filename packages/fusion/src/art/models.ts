// 3D models for buildings and vehicles, modelled on the look of the classics:
// Dune 2000's rounded cream-metal structures with house accents, Red Alert 2's ribbed
// silver Allied and brutal concrete Soviet buildings, light hulls with player markings.
// All geometry is original; only the visual language follows the references.
import { Mesh, RGB, tint } from './forge';

export type ArtStyle = 'dune' | 'allied' | 'soviet';

export function styleFor(packId: string, side: string): ArtStyle {
  if (side === 'allies') return 'allied';
  if (side === 'soviets' || side === 'soviet') return 'soviet';
  return packId === 'ra2' ? 'allied' : 'dune';
}

interface Palette { body: RGB; trim: RGB; dark: RGB; pad: RGB; glass: RGB; metal: RGB; hull: RGB }
const PALETTES: Record<ArtStyle, Palette> = {
  dune: { body: [234, 224, 202], trim: [190, 176, 150], dark: [86, 76, 64], pad: [201, 160, 112], glass: [128, 174, 196], metal: [162, 154, 138], hull: [214, 202, 178] },
  allied: { body: [200, 205, 211], trim: [148, 155, 163], dark: [66, 72, 80], pad: [146, 144, 138], glass: [140, 198, 236], metal: [176, 181, 188], hull: [196, 200, 205] },
  soviet: { body: [156, 151, 136], trim: [116, 111, 100], dark: [60, 57, 51], pad: [126, 122, 112], glass: [214, 132, 96], metal: [128, 125, 116], hull: [170, 166, 154] },
};
const GLOW_BLUE: RGB = [150, 225, 255];
const GLOW_CYAN: RGB = [170, 245, 255];
const TRACK: RGB = [52, 49, 45];
const BARREL: RGB = [70, 68, 64];

export function palette(style: ArtStyle) { return PALETTES[style]; }

/** Low concrete foundation every building sits on. */
function foundation(m: Mesh, w: number, h: number, p: Palette) {
  m.box(0.04, 0.04, 0, w - 0.04, h - 0.04, 0.07, p.pad);
}

/** A stepped barrel vault along X (reads as the ribbed roofs of hangars). */
function vault(m: Mesh, x0: number, y0: number, x1: number, y1: number, z0: number, rise: number, color: RGB, ribs = 5) {
  const d = (y1 - y0) / 2;
  for (let k = 0; k < ribs; k++) {
    const f = (k + 1) / ribs;
    const inset = d * (1 - Math.cos((f * Math.PI) / 2)) * 0.98;
    const z = z0 + rise * Math.sin((f * Math.PI) / 2);
    m.box(x0, y0 + inset * 0.999, z0 + (rise * k) / ribs * 0.0, x1, y1 - inset * 0.999, z, tint(color, k % 2 ? 0.94 : 1));
  }
  // Rib bands across the vault.
  for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.75) m.box(x, y0 + 0.02, z0, x + 0.05, y1 - 0.02, z0 + rise + 0.015, tint(color, 0.9));
}

export function buildingMesh(shape: string, w: number, h: number, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  const dune = style === 'dune', soviet = style === 'soviet';
  if (shape !== 'wall') foundation(m, w, h, p);
  switch (shape) {
    case 'conyard': {
      if (dune) {
        m.box(0.3, 0.9, 0.07, 2.05, 2.65, 0.5, p.body);
        m.dome(1.15, 1.75, 0.5, 0.62, p.body, 5, 20, 0.55);
        m.cylinder(2.38, 2.05, 0.07, 0.62, 0.44, 0.44, p.body, 18);
        m.dome(2.38, 2.05, 0.62, 0.44, p.body, 4, 18, 0.35);
        m.box(0.3, 2.6, 0.07, 2.05, 2.68, 0.36, team);
      } else {
        m.box(0.35, 1.1, 0.07, 3.0, 3.65, 0.85, p.body);
        vault(m, 0.45, 1.2, 2.9, 3.55, 0.85, 0.35, p.trim, 6);
        m.box(3.05, 2.2, 0.07, 3.75, 3.7, 1.25, p.body, { top: p.trim });
        m.box(1.0, 3.62, 0.3, 2.4, 3.68, 0.7, team);
        m.box(3.05, 3.66, 0.6, 3.75, 3.72, 1.0, team);
      }
      // Construction crane.
      const mx = dune ? 2.38 : 3.4, my = dune ? 0.55 : 0.6, top = dune ? 1.75 : 2.15;
      m.box(mx - 0.1, my - 0.1, 0.07, mx + 0.1, my + 0.1, top, p.metal);
      m.box(dune ? 0.55 : 0.7, my - 0.07, top - 0.14, mx + 0.25, my + 0.07, top, team);
      m.box((dune ? 0.85 : 1.1), my - 0.02, top - 0.75, (dune ? 0.89 : 1.14), my + 0.02, top - 0.14, p.dark);
      break;
    }
    case 'windtrap': {
      if (dune) {
        m.cylinder(1, 1, 0.07, 0.42, 0.86, 0.86, p.body, 22, { cap: false });
        m.cylinder(1, 1, 0.36, 0.46, 0.88, 0.88, team, 22, { cap: false });
        m.dome(1, 1, 0.46, 0.86, p.body, 6, 22, 0.9);
        // Intake slots around the shell.
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          const x = 1 + Math.cos(a) * 0.62, y = 1 + Math.sin(a) * 0.62;
          m.box(x - 0.07, y - 0.07, 0.6, x + 0.07, y + 0.07, 0.95, p.dark);
        }
        m.cylinder(1, 1, 1.32, 1.46, 0.2, 0.14, p.metal, 12);
      } else {
        // Allied power plant: twin ribbed generator drums with glowing cores.
        m.box(0.15, 0.15, 0.07, 1.85, 1.85, 0.3, p.trim);
        for (const [cx, cy] of [[0.62, 0.95], [1.38, 1.05]]) {
          for (let z = 0.3, k = 0; z < 1.2; z += 0.15, k++) m.cylinder(cx, cy, z, z + 0.15, k % 2 ? 0.34 : 0.38, k % 2 ? 0.34 : 0.38, k % 2 ? p.metal : p.body, 18);
          m.cylinder(cx, cy, 1.2, 1.32, 0.28, 0.2, GLOW_BLUE, 14, { glow: true });
        }
        m.box(0.2, 1.82, 0.12, 1.8, 1.88, 0.28, team);
      }
      break;
    }
    case 'reactor': {
      // Tesla Reactor: concrete block with a stacked coil and a charged globe.
      m.box(0.2, 0.2, 0.07, 1.8, 1.8, 0.45, p.body, { top: p.trim });
      m.box(0.2, 1.76, 0.12, 1.8, 1.82, 0.38, team);
      for (let k = 0; k < 7; k++) m.cylinder(1, 1, 0.45 + k * 0.14, 0.55 + k * 0.14, 0.42 - k * 0.03, 0.42 - k * 0.03, k % 2 ? p.dark : p.metal, 16);
      m.dome(1, 1, 1.43, 0.24, GLOW_BLUE, 4, 16, 0.3);
      for (const f of m.faces.slice(-4 * 16 - 1)) f.glow = true;
      break;
    }
    case 'refinery': {
      if (dune) {
        for (const cx of [0.62, 1.48]) {
          m.cylinder(cx, 0.78, 0.07, 0.72, 0.42, 0.42, p.body, 20, { cap: false });
          m.dome(cx, 0.78, 0.72, 0.42, p.body, 4, 20, 0.3);
          m.cylinder(cx, 0.78, 0.45, 0.52, 0.43, 0.43, team, 20, { cap: false });
        }
        m.box(2.0, 0.22, 0.07, 2.88, 1.55, 0.62, p.body, { top: p.trim });
        m.box(2.0, 1.52, 0.4, 2.88, 1.58, 0.52, team);
        m.box(0.55, 1.45, 0.07, 1.55, 1.95, 0.12, p.metal);
      } else {
        m.box(0.3, 0.35, 0.07, 2.6, 2.65, 0.78, p.body);
        vault(m, 0.4, 0.45, 2.5, 2.55, 0.78, 0.3, p.trim, 5);
        for (const cy of [0.8, 1.95]) {
          m.cylinder(3.2, cy, 0.07, 0.95, 0.45, 0.45, p.metal, 18, { cap: false });
          m.dome(3.2, cy, 0.95, 0.45, soviet ? p.trim : p.body, 4, 18, 0.32);
        }
        m.box(2.6, 1.1, 0.07, 3.95, 1.6, 0.3, p.dark);
        m.box(0.6, 2.62, 0.25, 2.2, 2.68, 0.6, team);
      }
      break;
    }
    case 'barracks': {
      m.box(0.22, 0.4, 0.07, 1.78, 1.72, dune ? 0.48 : 0.55, p.body);
      if (soviet) m.box(0.15, 0.33, 0.55, 1.85, 1.79, 0.68, team);
      else m.roof(0.15, 0.33, 1.85, 1.79, dune ? 0.48 : 0.55, dune ? 0.82 : 0.95, dune ? p.trim : team, 'x');
      m.box(0.75, 1.69, 0.07, 1.25, 1.75, 0.4, p.dark);
      m.box(1.6, 0.3, 0.5, 1.66, 0.36, 1.35, p.metal);
      m.box(1.66, 0.31, 1.05, 2.0, 0.35, 1.32, team);
      if (!dune) for (let x = 0.2; x < 1.8; x += 0.32) m.box(x, 1.78, 0.07, x + 0.26, 1.92, 0.2, [168, 150, 110]);
      break;
    }
    case 'silo': {
      m.cylinder(0.5, 0.5, 0.07, 0.55, 0.36, 0.36, p.body, 18, { cap: false });
      m.cylinder(0.5, 0.5, 0.32, 0.38, 0.37, 0.37, team, 18, { cap: false });
      m.dome(0.5, 0.5, 0.55, 0.36, p.body, 4, 18, 0.25);
      break;
    }
    case 'factory': case 'heavyfactory': {
      const big = shape === 'heavyfactory';
      m.box(0.2, 0.3, 0.07, w - 0.2, h - 0.2, big ? 0.62 : 0.5, p.body);
      vault(m, 0.25, 0.35, w - 0.25, h - 0.25, big ? 0.62 : 0.5, big ? 0.55 : 0.4, dune ? p.trim : p.metal, 6);
      m.box(w * 0.3, h - 0.23, 0.07, w * 0.7, h - 0.17, big ? 0.5 : 0.4, p.dark);
      m.box(w * 0.3 - 0.06, h - 0.24, 0.07, w * 0.3, h - 0.16, big ? 0.56 : 0.46, team);
      m.box(w * 0.7, h - 0.24, 0.07, w * 0.7 + 0.06, h - 0.16, big ? 0.56 : 0.46, team);
      if (big) {
        m.box(0.3, 0.4, 1.17, w - 0.3, 0.55, 1.3, team);
        m.box(0.3, 0.4, 0.07, 0.42, 0.52, 1.3, p.metal);
        m.box(w - 0.42, 0.4, 0.07, w - 0.3, 0.52, 1.3, p.metal);
      }
      break;
    }
    case 'radar': {
      if (soviet) {
        m.box(0.3, 0.3, 0.07, 1.7, 1.7, 0.35, p.body);
        for (const [x, y] of [[0.55, 0.55], [1.45, 0.55], [0.55, 1.45], [1.45, 1.45]]) m.box(x - 0.05, y - 0.05, 0.35, x + 0.05, y + 0.05, 1.5, p.metal);
        m.box(0.45, 0.45, 1.5, 1.55, 1.55, 1.62, team);
      } else {
        m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.55, p.body, { top: p.trim });
        m.box(0.25, h - 0.29, 0.3, w - 0.25, h - 0.23, 0.48, team);
        m.cylinder(w - 0.6, 0.65, 0.55, 1.05, 0.1, 0.08, p.metal, 10);
      }
      break;
    }
    case 'lab': {
      m.box(0.2, 0.2, 0.07, w - 0.2, h - 0.2, 0.42, p.body);
      m.dome(w / 2, h / 2, 0.42, Math.min(w, h) * 0.36, dune ? p.body : p.glass, 6, 22, Math.min(w, h) * 0.32);
      m.cylinder(w / 2, h / 2, 0.36, 0.44, Math.min(w, h) * 0.37, Math.min(w, h) * 0.37, team, 22, { cap: false });
      if (soviet) for (const x of [0.4, w - 0.4]) { m.cylinder(x, 0.4, 0.42, 1.4, 0.07, 0.03, p.metal, 8); m.dome(x, 0.4, 1.4, 0.08, team, 2, 8); }
      break;
    }
    case 'palace': {
      m.box(0.3, 0.3, 0.07, 2.7, 2.7, 0.5, p.body, { top: p.trim });
      m.dome(1.5, 1.5, 0.5, 0.85, p.body, 6, 24, 0.8);
      m.cylinder(1.5, 1.5, 0.45, 0.55, 0.87, 0.87, team, 24, { cap: false });
      for (const [x, y] of [[0.45, 0.45], [2.55, 0.45], [0.45, 2.55], [2.55, 2.55]]) {
        m.cylinder(x, y, 0.07, 1.05, 0.2, 0.18, p.body, 14);
        m.dome(x, y, 1.05, 0.2, team, 3, 14, 0.2);
      }
      break;
    }
    case 'turret': {
      if (!dune && soviet) m.box(0.15, 0.15, 0.07, 0.85, 0.85, 0.32, p.body, { top: p.trim });
      else if (!dune) {
        // Allied pillbox: low octagonal concrete bunker with a firing slit.
        m.cylinder(0.5, 0.5, 0.07, 0.36, 0.44, 0.4, p.body, 8);
        m.cylinder(0.5, 0.5, 0.22, 0.27, 0.445, 0.445, p.dark, 8, { cap: false });
      } else m.cylinder(0.5, 0.5, 0.07, 0.34, 0.42, 0.38, p.body, 8, { top: p.trim });
      break;
    }
    case 'rocketturret':
      m.cylinder(0.5, 0.5, 0.07, 0.34, 0.42, 0.38, p.body, 8, { top: p.trim });
      m.cylinder(0.5, 0.5, 0.3, 0.36, 0.43, 0.43, team, 8, { cap: false });
      break;
    case 'missilesilo': {
      // Soviet silo: armoured pad, blast doors and a control block with red markings.
      m.box(0.25, 0.25, 0.07, 2.75, 2.75, 0.35, p.body, { top: p.trim });
      m.box(0.6, 0.6, 0.35, 1.48, 2.4, 0.42, p.dark);
      m.box(1.52, 0.6, 0.35, 2.4, 2.4, 0.42, p.dark);
      m.box(0.55, 0.55, 0.35, 2.45, 0.62, 0.45, team);
      m.box(0.55, 2.38, 0.35, 2.45, 2.45, 0.45, team);
      m.box(2.3, 2.3, 0.35, 2.75, 2.75, 0.85, p.body, { top: team });
      break;
    }
    case 'weather': {
      // Allied weather device: plinth, tall spire and a ring of emitter dishes.
      m.box(0.25, 0.25, 0.07, 2.75, 2.75, 0.45, p.body, { top: p.trim });
      m.box(0.25, 2.69, 0.15, 2.75, 2.75, 0.4, team);
      m.cylinder(1.5, 1.5, 0.45, 2.2, 0.3, 0.12, p.metal, 14);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        m.cylinder(1.5 + Math.cos(a) * 0.85, 1.5 + Math.sin(a) * 0.85, 0.45, 0.9, 0.08, 0.06, p.metal, 8);
        m.cylinder(1.5 + Math.cos(a) * 0.85, 1.5 + Math.sin(a) * 0.85, 0.9, 1.05, 0.05, 0.24, p.body, 12, { top: p.glass });
      }
      m.dome(1.5, 1.5, 2.2, 0.2, GLOW_BLUE, 3, 14, 0.25);
      for (const f of m.faces.slice(-3 * 14 - 1)) f.glow = true;
      break;
    }
    case 'prismtower':
      m.box(0.18, 0.18, 0.07, 0.82, 0.82, 0.3, p.body, { top: p.trim });
      m.cylinder(0.5, 0.5, 0.3, 1.45, 0.16, 0.1, p.metal, 10);
      m.cylinder(0.5, 0.5, 0.6, 0.7, 0.17, 0.16, team, 10, { cap: false });
      m.cylinder(0.5, 0.5, 1.45, 1.75, 0.08, 0.22, GLOW_CYAN, 6, { glow: true, cap: false });
      m.cylinder(0.5, 0.5, 1.75, 2.15, 0.22, 0, GLOW_CYAN, 6, { glow: true });
      break;
    case 'teslacoil':
      m.box(0.15, 0.15, 0.07, 0.85, 0.85, 0.3, p.body, { top: p.trim });
      m.box(0.15, 0.81, 0.1, 0.85, 0.87, 0.26, team);
      for (let k = 0; k < 8; k++) m.cylinder(0.5, 0.5, 0.3 + k * 0.15, 0.4 + k * 0.15, 0.3 - k * 0.022, 0.3 - k * 0.022, k % 2 ? p.dark : p.metal, 14);
      m.cylinder(0.5, 0.5, 1.45, 1.55, 0.06, 0.06, p.metal, 8);
      m.dome(0.5, 0.5, 1.55, 0.17, GLOW_BLUE, 3, 14, 0.2);
      for (const f of m.faces.slice(-3 * 14 - 1)) f.glow = true;
      break;
    default:
      m.box(0.2, 0.2, 0.07, w - 0.2, h - 0.2, 0.6, p.body);
      m.box(0.2, h - 0.24, 0.2, w - 0.2, h - 0.18, 0.45, team);
  }
  return m;
}

/** Wall segment: a post plus connectors toward neighbouring wall cells (bitmask N,E,S,W). */
export function wallMesh(mask: number, style: ArtStyle): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  const c = style === 'dune' ? [128, 118, 104] as RGB : p.trim;
  const t = 0.18, hgt = style === 'dune' ? 0.45 : 0.55;
  if (mask & 1) m.box(0.5 - t, 0, 0, 0.5 + t, 0.5, hgt * 0.9, c);
  if (mask & 2) m.box(0.5, 0.5 - t, 0, 1, 0.5 + t, hgt * 0.9, c);
  if (mask & 4) m.box(0.5 - t, 0.5, 0, 0.5 + t, 1, hgt * 0.9, c);
  if (mask & 8) m.box(0, 0.5 - t, 0, 0.5, 0.5 + t, hgt * 0.9, c);
  m.box(0.5 - t * 1.25, 0.5 - t * 1.25, 0, 0.5 + t * 1.25, 0.5 + t * 1.25, hgt, tint(c, 1.08));
  return m;
}

// ---------------------------------------------------------------- vehicles

const HAS_TURRET = new Set(['tank-turret', 'siege-turret', 'launcher', 'sonic', 'devastator', 'prism']);
export function hasTurret(shape: string) { return HAS_TURRET.has(shape); }

/** Vehicle hull pointing +X, centred on the origin. Sizes are in cells. */
export function hullMesh(shape: string, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  const hull = p.hull;
  const tracked = (L: number, W: number, h: number) => {
    m.box(-L, -W, 0, L, -W + 0.12, h * 0.75, TRACK);
    m.box(-L, W - 0.12, 0, L, W, h * 0.75, TRACK);
    m.box(-L + 0.04, -W + 0.1, 0.04, L - 0.02, W - 0.1, h, hull, { top: tint(hull, 1.03) });
    m.box(-L * 0.6, -W + 0.12, h - 0.005, L * 0.2, -W + 0.18, h + 0.01, team);
    m.box(-L * 0.6, W - 0.18, h - 0.005, L * 0.2, W - 0.12, h + 0.01, team);
  };
  switch (shape) {
    case 'trike':
      m.box(-0.2, -0.04, 0.03, -0.1, 0.04, 0.1, TRACK);
      for (const y of [-0.13, 0.13]) m.box(0.12, y - 0.04, 0.02, 0.22, y + 0.04, 0.1, TRACK);
      m.box(-0.18, -0.1, 0.06, 0.22, 0.1, 0.16, hull);
      m.box(-0.05, -0.08, 0.16, 0.1, 0.08, 0.2, team);
      m.box(0.2, -0.02, 0.12, 0.34, 0.02, 0.15, BARREL);
      break;
    case 'quad':
      for (const [x, y] of [[-0.18, -0.17], [-0.18, 0.17], [0.18, -0.17], [0.18, 0.17]]) m.box(x - 0.07, y - 0.05, 0.02, x + 0.07, y + 0.05, 0.13, TRACK);
      m.box(-0.24, -0.13, 0.07, 0.26, 0.13, 0.2, hull);
      m.box(-0.12, -0.11, 0.2, 0.12, 0.11, 0.27, team);
      m.box(0.0, -0.09, 0.27, 0.18, 0.09, 0.33, p.trim);
      break;
    case 'harvester':
      tracked(0.5, 0.33, 0.26);
      m.box(0.18, -0.24, 0.26, 0.46, 0.24, 0.52, hull, { top: p.glass });
      m.box(-0.46, -0.27, 0.26, 0.14, 0.27, 0.58, tint(hull, 0.95));
      m.box(-0.42, -0.23, 0.58, 0.1, 0.23, 0.62, p.dark);
      m.box(0.46, -0.3, 0.02, 0.6, 0.3, 0.2, p.metal);
      break;
    case 'mcv':
      tracked(0.52, 0.32, 0.24);
      m.box(-0.45, -0.25, 0.24, 0.2, 0.25, 0.62, tint(hull, 0.97), { top: p.trim });
      m.box(0.24, -0.22, 0.24, 0.48, 0.22, 0.48, hull, { top: p.glass });
      m.box(-0.45, -0.26, 0.4, 0.2, -0.24, 0.5, team);
      m.box(-0.1, -0.03, 0.62, 0.0, 0.03, 0.95, p.metal);
      break;
    case 'devastator':
      tracked(0.5, 0.36, 0.26);
      m.box(-0.38, -0.22, 0.26, 0.4, 0.22, 0.34, tint(hull, 0.92));
      break;
    case 'siege-turret':
      tracked(0.42, 0.29, 0.2);
      break;
    default:
      tracked(0.38, 0.26, 0.18);
  }
  return m;
}

export function turretMesh(shape: string, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  switch (shape) {
    case 'siege-turret':
      m.box(-0.2, -0.17, 0.2, 0.14, 0.17, 0.36, p.hull, { top: team });
      m.box(0.1, -0.05, 0.25, 0.62, 0.05, 0.33, BARREL);
      break;
    case 'launcher':
      m.box(-0.2, -0.17, 0.19, 0.2, 0.17, 0.42, p.hull, { top: p.trim });
      for (const y of [-0.1, 0, 0.1]) m.box(0.2, y - 0.035, 0.25, 0.26, y + 0.035, 0.38, p.dark);
      m.box(-0.2, -0.18, 0.3, 0.2, -0.16, 0.38, team);
      break;
    case 'sonic':
      m.box(-0.18, -0.14, 0.19, 0.1, 0.14, 0.3, p.hull);
      m.cylinder(0.12, 0, 0.3, 0.34, 0.2, 0.24, team, 16);
      m.dome(0.12, 0, 0.34, 0.24, p.glass, 3, 16, 0.12);
      break;
    case 'devastator':
      m.box(-0.26, -0.24, 0.34, 0.2, 0.24, 0.55, p.hull, { top: team });
      for (const y of [-0.1, 0.1]) m.box(0.18, y - 0.045, 0.4, 0.7, y + 0.045, 0.48, BARREL);
      break;
    case 'prism':
      m.cylinder(0, 0, 0.18, 0.28, 0.17, 0.15, p.hull, 12, { top: team });
      m.cylinder(0.04, 0, 0.28, 0.48, 0.12, 0.0, GLOW_CYAN, 6, { glow: true });
      break;
    default:
      m.cylinder(-0.02, 0, 0.18, 0.31, 0.17, 0.15, p.hull, 14, { top: team });
      m.box(0.1, -0.03, 0.22, 0.55, 0.03, 0.27, BARREL);
  }
  return m;
}

/** Rotating gun on top of a defensive structure (1x1, centred at 0.5, 0.5). */
export function defenseTurretMesh(shape: string, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  if (shape === 'rocketturret') {
    m.box(-0.18, -0.16, 0.36, 0.16, 0.16, 0.58, p.body, { top: team });
    for (const y of [-0.08, 0.08]) m.box(0.16, y - 0.04, 0.42, 0.26, y + 0.04, 0.52, p.dark);
  } else {
    m.cylinder(0, 0, 0.32, 0.5, 0.2, 0.17, p.body, 12, { top: team });
    m.box(0.12, -0.035, 0.38, 0.58, 0.035, 0.45, BARREL);
  }
  return m;
}

// ---------------------------------------------------------------- scenery

export function treeMesh(variant: number): Mesh {
  const m = new Mesh();
  const trunk: RGB = [92, 66, 40];
  if (variant % 2 === 0) {
    // Conifer: stacked cones.
    m.cylinder(0.5, 0.5, 0, 0.25, 0.05, 0.04, trunk, 6);
    const g: RGB = [44, 82, 40];
    m.cylinder(0.5, 0.5, 0.2, 0.75, 0.32, 0.0, g, 10);
    m.cylinder(0.5, 0.5, 0.5, 1.0, 0.25, 0.0, tint(g, 1.1), 10);
    m.cylinder(0.5, 0.5, 0.78, 1.25, 0.17, 0.0, tint(g, 1.18), 10);
  } else {
    // Broadleaf: a trunk and a clustered canopy.
    m.cylinder(0.5, 0.5, 0, 0.42, 0.06, 0.05, trunk, 6);
    const g: RGB = [70, 104, 44];
    for (const [dx, dy, r, z] of [[0, 0, 0.3, 0.42], [0.14, 0.1, 0.2, 0.55], [-0.12, 0.08, 0.2, 0.5], [0.02, -0.12, 0.2, 0.62]]) {
      m.dome(0.5 + dx, 0.5 + dy, z - r * 0.5, r, tint(g, 0.95 + (dx + dy) * 0.4), 3, 10, r * 1.1);
    }
  }
  return m;
}

/** Ore / gem crystal cluster within one cell. */
export function crystalMesh(color: RGB, count: number, seed: number): Mesh {
  const m = new Mesh();
  for (let k = 0; k < count; k++) {
    const h = (seed * (k + 3) * 2654435761) >>> 0;
    const x = 0.2 + ((h & 255) / 255) * 0.6, y = 0.2 + (((h >> 8) & 255) / 255) * 0.6;
    const r = 0.06 + (((h >> 16) & 15) / 15) * 0.05;
    m.cylinder(x, y, 0, 0.05, r, r * 0.8, tint(color, 0.92), 5);
    m.cylinder(x, y, 0.05, 0.05 + r * 2.2, r * 0.8, 0, tint(color, 0.95 + ((h >> 20) & 3) * 0.06), 5, { glow: ((h >> 22) & 3) === 0 });
  }
  return m;
}
