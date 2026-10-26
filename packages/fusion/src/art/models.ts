// 3D models for buildings and vehicles, modelled on the look of the classics:
// Dune 2000's rounded cream-metal structures with house accents, Red Alert 2's ribbed
// silver Allied and brutal concrete Soviet buildings, light hulls with player markings.
// All geometry is original; only the visual language follows the references.
import { Mesh, RGB, Vec3, tint } from './forge';

export type ArtStyle = 'dune' | 'allied' | 'soviet' | 'gdi' | 'nod';

export function styleFor(packId: string, side: string): ArtStyle {
  if (side === 'gdi') return 'gdi';
  if (side === 'nod') return 'nod';
  if (side === 'allies') return 'allied';
  if (side === 'soviets' || side === 'soviet') return 'soviet';
  return packId === 'ra2' || packId === 'ra1' ? 'allied' : 'dune';
}

interface Palette { body: RGB; trim: RGB; dark: RGB; pad: RGB; glass: RGB; metal: RGB; hull: RGB }
const PALETTES: Record<ArtStyle, Palette> = {
  dune: { body: [234, 224, 202], trim: [190, 176, 150], dark: [86, 76, 64], pad: [201, 160, 112], glass: [128, 174, 196], metal: [162, 154, 138], hull: [214, 202, 178] },
  allied: { body: [200, 205, 211], trim: [148, 155, 163], dark: [66, 72, 80], pad: [146, 144, 138], glass: [140, 198, 236], metal: [176, 181, 188], hull: [196, 200, 205] },
  soviet: { body: [112, 112, 112], trim: [80, 48, 48], dark: [48, 32, 32], pad: [104, 100, 96], glass: [214, 132, 96], metal: [128, 125, 116], hull: [150, 146, 136] },
  // Tiberian Dawn, measured off the original building sprites: GDI's light grey concrete
  // with darker roof panels and sand-coloured tanks; Nod's near-black slabs and red glow.
  gdi: { body: [160, 160, 160], trim: [96, 96, 96], dark: [48, 48, 48], pad: [128, 128, 128], glass: [150, 198, 226], metal: [176, 176, 176], hull: [160, 144, 112] },
  nod: { body: [80, 80, 80], trim: [48, 48, 56], dark: [24, 24, 32], pad: [64, 64, 64], glass: [226, 96, 72], metal: [96, 96, 96], hull: [96, 96, 96] },
};
const GLOW_BLUE: RGB = [150, 225, 255];
const GLOW_CYAN: RGB = [170, 245, 255];
const GLOW_RED: RGB = [255, 96, 70];
const GLOW_GREEN: RGB = [150, 255, 130];
const GLOW_PURPLE: RGB = [205, 130, 255];
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

/** A body of revolution along X (blimps, fuselages, submarine hulls); `profile` gives the radius along it. */
function lathe(m: Mesh, x0: number, x1: number, yc: number, zc: number, profile: (t: number) => number, color: RGB, rings = 10, segs = 12, squash = 1) {
  const ring = (k: number) => {
    const t = k / rings, x = x0 + (x1 - x0) * t, r = Math.max(0.001, profile(t));
    return Array.from({ length: segs }, (_, i) => {
      const a = (i / segs) * Math.PI * 2;
      return [x, yc + Math.cos(a) * r, zc + Math.sin(a) * r * squash] as Vec3;
    });
  };
  let prev = ring(0);
  for (let k = 1; k <= rings; k++) {
    const cur = ring(k);
    for (let i = 0; i < segs; i++) { const j = (i + 1) % segs; m.add([prev[i], cur[i], cur[j], prev[j]], color, { smooth: true }); }
    prev = cur;
  }
}

/** A flat outline (x, y pairs) extruded between two heights: ship hulls and decks. */
function prism(m: Mesh, outline: [number, number][], z0: number, z1: number, color: RGB, top?: RGB) {
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % outline.length];
    m.add([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], color);
  }
  m.add(outline.map(([x, y]) => [x, y, z1] as Vec3), top ?? color);
}

/** Pointed ship hull outline, bow toward +X. */
function hullOutline(L: number, W: number): [number, number][] {
  return [[-L, -W * 0.85], [L * 0.45, -W], [L, 0], [L * 0.45, W], [-L, W * 0.85]];
}

export function buildingMesh(shape: string, w: number, h: number, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  const dune = style === 'dune', soviet = style === 'soviet';
  // Tiberian Dawn's buildings are squatter and blockier than Red Alert 2's, with flat
  // panelled roofs: where the silhouette differs that much, they get their own shape.
  const td = style === 'gdi' || style === 'nod';
  if (shape !== 'wall' && shape !== 'shipyard') foundation(m, w, h, p);
  switch (shape) {
    case 'conyard': {
      if (td) {
        // A low walled compound: panelled roof, a service bay at the front, and the
        // gantry crane that sits over one corner of the original.
        m.box(0.18, 0.18, 0.07, w - 0.18, h - 0.55, 0.62, p.body, { top: p.trim });
        for (let x = 0.3; x < w - 0.35; x += 0.62) m.box(x, 0.3, 0.62, x + 0.44, h - 0.68, 0.66, tint(p.trim, 0.88));
        m.box(0.3, h - 0.58, 0.07, w - 0.3, h - 0.2, 0.3, p.pad, { top: p.dark });
        m.box(0.3, h - 0.3, 0.1, w - 0.3, h - 0.22, 0.26, team);
        // Crane: two legs, a boom across the roof and the hook line.
        for (const x of [0.42, w - 0.52]) m.box(x, 0.36, 0.62, x + 0.1, 0.46, 1.5, p.metal);
        m.box(0.42, 0.34, 1.42, w - 0.42, 0.48, 1.56, team);
        m.box(w / 2 - 0.03, 0.38, 0.9, w / 2 + 0.03, 0.44, 1.42, p.dark);
        break;
      }
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
      if (td) {
        // The Tiberium refinery: a tall processing tower, a sand-coloured holding tank,
        // and the dark unloading bay the harvester backs into.
        m.box(0.2, 0.2, 0.07, 1.5, h - 0.2, 1.15, p.body, { top: p.trim });
        for (let z = 0.35; z < 1.1; z += 0.3) m.box(0.16, 0.3, z, 1.54, h - 0.3, z + 0.06, tint(p.trim, 0.9));
        m.cylinder(2.2, h / 2, 0.07, 0.95, 0.6, 0.6, p.hull, 20, { cap: false });
        m.dome(2.2, h / 2, 0.95, 0.6, tint(p.hull, 1.08), 4, 20, 0.3);
        m.box(1.5, h - 1.1, 0.07, w - 0.25, h - 0.25, 0.12, p.pad, { top: p.dark });
        m.box(0.2, 0.16, 0.5, 1.5, 0.24, 0.8, team);
        m.box(1.62, h / 2 - 0.1, 0.9, 2.2, h / 2 + 0.1, 1.0, p.metal);
        break;
      }
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
      if (style === 'allied') {
        // The Allied barracks is a camp: olive canvas tents behind a sandbagged front.
        const canvas: RGB = [128, 160, 96], shade: RGB = [96, 128, 80];
        for (const cx of [0.62, 1.38]) {
          m.roof(cx - 0.34, 0.34, cx + 0.34, 1.5, 0.07, 0.56, cx > 1 ? shade : canvas, 'x');
          m.box(cx - 0.34, 1.46, 0.07, cx + 0.34, 1.52, 0.3, tint(shade, 0.85));
        }
        m.box(0.2, 1.56, 0.07, 1.8, 1.8, 0.22, [176, 160, 128], { top: [148, 134, 104] });
        m.box(0.6, 1.52, 0.12, 1.4, 1.58, 0.26, team);
        break;
      }
      if (td) {
        // GDI's barracks: a pale flat-roofed hut with a dark doorway and a vent stack.
        m.box(0.18, 0.3, 0.07, 1.82, 1.78, 0.56, p.body, { top: p.trim });
        m.box(0.26, 0.38, 0.56, 1.74, 1.7, 0.6, tint(p.trim, 0.9));
        m.box(0.62, 1.74, 0.07, 1.24, 1.82, 0.42, p.dark);
        m.box(0.26, 1.72, 0.46, 1.74, 1.78, 0.54, team);
        m.cylinder(1.56, 0.56, 0.56, 0.86, 0.1, 0.09, p.metal, 10);
        break;
      }
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
      if (w > 1) {
        // Tiberian Dawn and Red Alert store their harvest in low paired tanks lying flat.
        for (const cy of [0.5, h > 1 ? 1.5 : 0.5]) {
          for (const cx of [0.56, 1.44].slice(0, w > 1 ? 2 : 1)) {
            m.cylinder(cx, cy, 0.07, 0.42, 0.26, 0.26, p.body, 14, { cap: false });
            m.dome(cx, cy, 0.42, 0.26, tint(p.body, 1.06), 3, 14, 0.14);
            m.cylinder(cx, cy, 0.26, 0.3, 0.27, 0.27, team, 14, { cap: false });
          }
          if (h === 1) break;
        }
        m.box(0.2, 0.42, 0.07, w - 0.2, 0.52, 0.16, p.dark);
        break;
      }
      m.cylinder(0.5, 0.5, 0.07, 0.55, 0.36, 0.36, p.body, 18, { cap: false });
      m.cylinder(0.5, 0.5, 0.32, 0.38, 0.37, 0.37, team, 18, { cap: false });
      m.dome(0.5, 0.5, 0.55, 0.36, p.body, 4, 18, 0.25);
      break;
    }
    case 'factory': case 'heavyfactory': {
      if (td) {
        // The weapons factory is mostly its dark open hangar mouth, under a pale shell.
        m.box(0.2, 0.2, 0.07, w - 0.2, h - 0.5, 0.8, p.body, { top: p.trim });
        m.box(0.34, 0.3, 0.8, w - 0.34, h - 0.6, 0.86, tint(p.trim, 0.9));
        m.box(0.45, h - 0.52, 0.07, w - 0.45, h - 0.18, 0.62, p.dark);
        m.box(0.45, h - 0.2, 0.07, w - 0.45, h - 0.12, 0.08, tint(p.dark, 1.4));
        m.box(0.2, h - 0.54, 0.62, w - 0.2, h - 0.46, 0.7, team);
        for (const x of [0.3, w - 0.42]) m.box(x, h - 0.5, 0.07, x + 0.12, h - 0.2, 0.66, p.body);
        break;
      }
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
      if (td) {
        // Communications Center: a blockhouse with the white dish on its roof.
        m.box(0.2, 0.3, 0.07, w - 0.2, h - 0.2, 0.68, p.body, { top: p.trim });
        m.box(0.3, 0.4, 0.68, w - 0.3, h - 0.3, 0.74, tint(p.trim, 0.9));
        m.box(0.2, h - 0.24, 0.2, w - 0.2, h - 0.18, 0.5, team);
        m.cylinder(w / 2, h / 2 - 0.1, 0.74, 1.1, 0.1, 0.08, p.metal, 10);
        m.cylinder(w / 2, h / 2 - 0.1, 1.06, 1.42, 0.12, 0.5, [208, 208, 192], 20, { cap: false });
        m.cylinder(w / 2, h / 2 - 0.1, 1.08, 1.12, 0.14, 0.14, p.dark, 12);
        break;
      }
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
      if (soviet) {
        // The Soviet tech centre is a slab with blue-grey glazing and a mast.
        m.box(0.2, 0.25, 0.07, w - 0.2, h - 0.2, 0.78, [96, 104, 112], { top: [64, 80, 96] });
        for (let x = 0.35; x < w - 0.4; x += 0.4) m.box(x, 0.2, 0.3, x + 0.24, 0.26, 0.66, [120, 140, 160]);
        m.box(0.2, h - 0.24, 0.2, w - 0.2, h - 0.18, 0.6, team);
        m.cylinder(w - 0.5, 0.55, 0.78, 1.6, 0.06, 0.04, p.metal, 8);
        m.dome(w - 0.5, 0.55, 1.6, 0.08, GLOW_RED, 2, 8);
        break;
      }
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
    case 'hitech': {
      // Dune High Tech Factory: a tall ribbed hangar with a round landing pad in front.
      m.box(0.25, 0.25, 0.07, w - 0.25, 1.65, 0.6, p.body);
      vault(m, 0.3, 0.3, w - 0.3, 1.6, 0.6, 0.55, p.trim, 6);
      m.box(0.25, 1.62, 0.3, w - 0.25, 1.68, 0.5, team);
      m.cylinder(w / 2, 2.3, 0.07, 0.12, 0.62, 0.62, p.dark, 22);
      m.cylinder(w / 2, 2.3, 0.12, 0.13, 0.42, 0.42, team, 22);
      m.cylinder(w / 2, 2.3, 0.13, 0.14, 0.3, 0.3, p.dark, 22);
      break;
    }
    case 'repairpad': {
      // Repair bay: in the classics this is almost all apron, with a light gantry over it.
      m.box(0.12, 0.12, 0.07, w - 0.12, h - 0.12, 0.14, tint(p.pad, 1.05), { top: tint(p.metal, 0.95) });
      m.box(0.5, 0.5, 0.14, w - 0.5, h - 0.5, 0.16, tint(p.metal, 0.88));
      m.box(0.85, 0.85, 0.18, w - 0.85, h - 0.85, 0.2, p.metal);
      for (const [x, y] of [[0.3, 0.3], [w - 0.5, 0.3], [0.3, h - 0.5], [w - 0.5, h - 0.5]]) m.box(x, y, 0.18, x + 0.2, y + 0.2, 0.24, team);
      m.box(0.25, h / 2 - 0.1, 0.18, 0.45, h / 2 + 0.1, 1.05, p.metal);
      m.box(w - 0.45, h / 2 - 0.1, 0.18, w - 0.25, h / 2 + 0.1, 1.05, p.metal);
      m.box(0.25, h / 2 - 0.1, 0.95, w - 0.25, h / 2 + 0.1, 1.08, team);
      m.box(w / 2 - 0.08, h / 2 - 0.08, 0.6, w / 2 + 0.08, h / 2 + 0.08, 0.95, p.dark);
      break;
    }
    case 'starport': {
      // Dune Starport: a great dome over the landing field with a control tower.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.35, p.body, { top: p.trim });
      m.dome(w / 2, h / 2, 0.35, 1.05, p.body, 6, 26, 0.72);
      m.cylinder(w / 2, h / 2, 0.3, 0.42, 1.07, 1.07, team, 26, { cap: false });
      m.cylinder(w / 2, h / 2, 1.0, 1.08, 0.3, 0.3, p.glass, 16);
      m.cylinder(w - 0.5, 0.5, 0.35, 1.35, 0.12, 0.1, p.metal, 10);
      m.dome(w - 0.5, 0.5, 1.35, 0.17, p.glass, 3, 10);
      break;
    }
    case 'shipyard': {
      // Floating dock: two piers, a back wall and a gantry over the open berth.
      const pier: RGB = tint(p.body, 0.95);
      m.box(0.1, 0.12, 0, w - 0.1, 0.62, 0.32, pier, { top: p.trim });
      m.box(0.1, h - 0.62, 0, w - 0.1, h - 0.12, 0.32, pier, { top: p.trim });
      m.box(w - 0.6, 0.62, 0, w - 0.1, h - 0.62, 0.28, p.trim);
      m.box(0.12, 0.6, 0.22, w - 0.12, 0.66, 0.3, team);
      m.box(0.12, h - 0.66, 0.22, w - 0.12, h - 0.6, 0.3, team);
      for (const x of [0.6, w - 1.1]) {
        m.box(x, 0.28, 0.32, x + 0.14, 0.44, 1.35, p.metal);
        m.box(x, h - 0.44, 0.32, x + 0.14, h - 0.28, 1.35, p.metal);
        m.box(x, 0.28, 1.25, x + 0.14, h - 0.28, 1.38, soviet ? p.dark : team);
      }
      break;
    }
    case 'purifier': {
      // Ore Purifier: processing hall, three tanks and a glowing filter window.
      m.box(0.3, 0.3, 0.07, w - 0.3, 1.95, 0.62, p.body, { top: p.trim });
      m.box(0.3, 1.92, 0.25, w - 0.3, 1.98, 0.5, team);
      m.box(0.8, 1.94, 0.14, 2.2, 1.99, 0.24, GLOW_BLUE, { glow: true });
      for (const cx of [0.75, 1.5, 2.25]) {
        m.cylinder(cx, 2.4, 0.07, 0.95, 0.3, 0.3, p.metal, 16, { cap: false });
        m.dome(cx, 2.4, 0.95, 0.3, p.body, 3, 16, 0.18);
      }
      m.cylinder(0.65, 0.65, 0.62, 1.7, 0.15, 0.12, p.trim, 10);
      break;
    }
    case 'satellite': {
      // Spy Satellite Uplink: a big dish on a pedestal.
      m.box(0.3, 0.3, 0.07, w - 0.3, h - 0.3, 0.4, p.body, { top: p.trim });
      m.box(0.3, h - 0.34, 0.15, w - 0.3, h - 0.28, 0.35, team);
      m.cylinder(w / 2, h / 2, 0.4, 0.9, 0.12, 0.09, p.metal, 10);
      m.cylinder(w / 2, h / 2, 0.88, 1.25, 0.14, 0.66, p.body, 22, { cap: false });
      m.cylinder(w / 2, h / 2, 0.9, 0.93, 0.15, 0.15, p.dark, 12);
      m.cylinder(w / 2, h / 2, 0.93, 1.5, 0.03, 0.02, p.metal, 6);
      m.dome(w / 2, h / 2, 1.5, 0.05, GLOW_BLUE, 2, 8);
      break;
    }
    case 'gap':
      // Gap Generator: a pylon with an emitter ring.
      m.box(0.2, 0.2, 0.07, 0.8, 0.8, 0.3, p.body, { top: p.trim });
      m.box(0.2, 0.76, 0.12, 0.8, 0.82, 0.26, team);
      m.cylinder(0.5, 0.5, 0.3, 1.45, 0.13, 0.08, p.metal, 10);
      m.cylinder(0.5, 0.5, 1.05, 1.15, 0.34, 0.34, p.dark, 18, { cap: false });
      m.cylinder(0.5, 0.5, 1.45, 1.62, 0.1, 0.02, GLOW_BLUE, 8, { glow: true });
      break;
    case 'nuclear': {
      // Nuclear Reactor: twin cooling towers and a reactor hall with a green glow.
      m.box(0.25, 1.65, 0.07, w - 0.25, h - 0.25, 0.6, p.body, { top: p.trim });
      m.box(0.25, h - 0.29, 0.3, w - 0.25, h - 0.23, 0.5, team);
      m.box(1.05, h - 0.26, 0.12, 1.95, h - 0.2, 0.26, GLOW_GREEN, { glow: true });
      for (const cx of [0.85, 2.15]) {
        m.cylinder(cx, 0.95, 0.07, 0.75, 0.64, 0.46, p.metal, 20, { cap: false });
        m.cylinder(cx, 0.95, 0.75, 1.35, 0.46, 0.56, p.metal, 20, { cap: false });
        m.cylinder(cx, 0.95, 1.33, 1.35, 0.52, 0.52, p.dark, 20);
      }
      break;
    }
    case 'industrial': {
      // Industrial Plant: a long works hall with a saw-tooth roof and smokestacks.
      m.box(0.2, 0.7, 0.07, w - 0.2, h - 0.2, 0.7, p.body);
      for (let x = 0.2; x < w - 0.3; x += 0.65) m.roof(x, 0.7, Math.min(w - 0.2, x + 0.65), h - 0.2, 0.7, 1.0, k(p.trim, x), 'y');
      m.box(0.2, h - 0.24, 0.3, w - 0.2, h - 0.18, 0.55, team);
      for (const x of [0.6, 1.35, 2.1]) m.cylinder(x, 0.4, 0.07, 1.7, 0.16, 0.12, p.dark, 10);
      break;
    }
    case 'cloning': {
      // Cloning Vats: a row of glowing glass tubes.
      m.box(0.2, 0.2, 0.07, w - 0.2, h - 0.2, 0.35, p.body, { top: p.trim });
      m.box(0.2, h - 0.24, 0.12, w - 0.2, h - 0.18, 0.3, team);
      for (let x = 0.6; x < w - 0.3; x += 0.6) {
        m.cylinder(x, h / 2, 0.35, 1.05, 0.22, 0.22, [150, 230, 190], 14, { glow: true, cap: false });
        m.cylinder(x, h / 2, 1.05, 1.15, 0.26, 0.26, p.metal, 14);
      }
      break;
    }
    case 'sensor':
      // Psychic Sensor: a pyramid mast with a violet eye.
      m.box(0.3, 0.3, 0.07, w - 0.3, h - 0.3, 0.35, p.body, { top: p.trim });
      m.box(0.3, h - 0.34, 0.12, w - 0.3, h - 0.28, 0.3, team);
      m.cylinder(w / 2, h / 2, 0.35, 1.25, 0.55, 0.06, p.dark, 4);
      m.cylinder(w / 2, h / 2, 1.25, 1.7, 0.04, 0.03, p.metal, 6);
      m.dome(w / 2, h / 2, 1.7, 0.12, GLOW_PURPLE, 3, 10);
      for (const f of m.faces.slice(-3 * 10 - 1)) f.glow = true;
      break;
    case 'patriot':
      m.box(0.15, 0.15, 0.07, 0.85, 0.85, 0.25, p.body, { top: p.trim });
      m.box(0.15, 0.81, 0.1, 0.85, 0.87, 0.22, team);
      break;
    case 'flakcannon':
      // Sandbagged emplacement.
      m.cylinder(0.5, 0.5, 0.07, 0.3, 0.44, 0.4, [150, 136, 102], 10, { top: p.dark });
      break;
    case 'grandcannon':
      m.box(0.15, 0.15, 0.07, w - 0.15, h - 0.15, 0.45, p.body, { top: p.trim });
      m.box(0.15, h - 0.2, 0.12, w - 0.15, h - 0.14, 0.38, team);
      break;
    case 'chronosphere': {
      // Chronosphere: a glass sphere cradled in a ring on four pylons.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.4, p.body, { top: p.trim });
      m.box(0.25, h - 0.29, 0.15, w - 0.25, h - 0.23, 0.35, team);
      for (const [x, y] of [[0.55, 0.55], [w - 0.55, 0.55], [0.55, h - 0.55], [w - 0.55, h - 0.55]]) m.box(x - 0.08, y - 0.08, 0.4, x + 0.08, y + 0.08, 1.0, p.metal);
      m.cylinder(w / 2, h / 2, 0.92, 1.02, 1.12, 1.12, p.metal, 26, { cap: false });
      m.cylinder(w / 2, h / 2, 0.4, 0.85, 0.3, 0.6, p.glass, 20, { cap: false });
      m.dome(w / 2, h / 2, 0.85, 0.6, p.glass, 5, 20, 0.6);
      m.dome(w / 2, h / 2, 0.85, 0.22, GLOW_CYAN, 3, 12, 0.22);
      for (const f of m.faces.slice(-3 * 12 - 1)) f.glow = true;
      break;
    }
    case 'curtain': {
      // Iron Curtain: a slab frame with a red field between the uprights.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.4, p.body, { top: p.trim });
      m.box(0.5, 0.8, 0.4, w - 0.5, h - 0.8, 0.6, p.dark);
      for (const x of [0.45, w - 0.45]) m.box(x - 0.14, 1.25, 0.4, x + 0.14, 1.75, 1.7, p.metal);
      m.box(0.31, 1.3, 1.5, w - 0.31, 1.7, 1.7, team);
      m.box(0.6, 1.42, 0.6, w - 0.6, 1.58, 1.5, GLOW_RED, { glow: true });
      break;
    }
    // ------------------------------------------------ Tiberian Dawn and Red Alert
    case 'tdpower': {
      // Power Plant: a turbine hall under a sloped vented roof, with a low annex at the
      // front. Red Alert's wears the red-brown roof its sprite has.
      const roof: RGB = td ? p.trim : [96, 56, 48];
      m.box(0.2, 0.42, 0.07, 1.8, 1.72, 0.62, p.body);
      m.roof(0.14, 0.36, 1.86, 1.76, 0.62, 0.95, roof, 'x');
      for (let x = 0.36; x < 1.6; x += 0.34) m.box(x, 0.34, 0.5, x + 0.2, 0.4, 0.74, p.dark);
      m.box(0.32, 1.72, 0.07, 1.68, 1.86, 0.34, tint(p.body, 0.94), { top: p.dark });
      m.box(0.32, 1.84, 0.12, 1.68, 1.9, 0.3, team);
      for (const cx of [0.56, 1.3]) {
        m.cylinder(cx, 0.78, 0.95, 1.38, 0.13, 0.11, p.metal, 12, { cap: false });
        m.cylinder(cx, 0.78, 1.36, 1.42, 0.12, 0.12, p.dark, 12);
      }
      break;
    }
    case 'advpower': {
      // Advanced Power Plant: the same hall again, longer, with a second roof and the
      // turbine housings along its flank.
      const roof: RGB = td ? p.trim : [96, 56, 48];
      m.box(0.2, 0.42, 0.07, w - 0.2, h - 0.5, 0.66, p.body);
      m.roof(0.14, 0.36, w - 0.14, h - 0.44, 0.66, 1.02, roof, 'x');
      for (let x = 0.4; x < w - 0.5; x += 0.36) m.box(x, 0.34, 0.54, x + 0.22, 0.4, 0.8, p.dark);
      m.box(0.3, h - 0.5, 0.07, w - 0.3, h - 0.16, 0.38, tint(p.body, 0.94), { top: p.dark });
      m.box(0.3, h - 0.22, 0.12, w - 0.3, h - 0.16, 0.34, team);
      for (let k2 = 0; k2 < 3; k2++) {
        const cx = 0.6 + k2 * ((w - 1.2) / 2);
        m.cylinder(cx, 0.8, 1.02, 1.5, 0.14, 0.12, p.metal, 12, { cap: false });
        m.cylinder(cx, 0.8, 1.48, 1.54, 0.13, 0.13, p.dark, 12);
      }
      break;
    }
    case 'handofnod': {
      // Hand of Nod: a domed muster hall behind a stepped entry tower.
      m.box(0.2, 0.9, 0.07, 1.8, 2.8, 0.52, p.body, { top: p.trim });
      m.dome(1, 1.85, 0.52, 0.78, p.body, 5, 20, 0.5);
      m.cylinder(1, 1.85, 0.46, 0.56, 0.8, 0.8, team, 20, { cap: false });
      m.box(0.45, 0.2, 0.07, 1.55, 0.95, 0.72, tint(p.body, 0.95), { top: p.trim });
      m.box(0.6, 0.2, 0.72, 1.4, 0.9, 0.95, p.trim);
      m.box(0.72, 0.16, 0.18, 1.28, 0.22, 0.5, p.dark);
      m.box(0.86, 0.14, 0.26, 1.14, 0.2, 0.42, GLOW_RED, { glow: true });
      break;
    }
    case 'airstrip': {
      // Airstrip: tarmac with a centre line, touchdown chevrons and a control hut.
      m.box(0.1, 0.25, 0.07, w - 0.1, h - 0.25, 0.1, p.pad, { top: tint(p.dark, 1.5) });
      for (let x = 0.4; x < w - 0.5; x += 0.8) m.box(x, h / 2 - 0.05, 0.1, x + 0.45, h / 2 + 0.05, 0.105, [226, 222, 196]);
      for (const x of [0.25, w - 0.5]) for (const dy of [-0.45, 0.45]) m.box(x, h / 2 + dy - 0.06, 0.1, x + 0.25, h / 2 + dy + 0.06, 0.105, team);
      m.box(w - 0.95, 0.12, 0.07, w - 0.3, 0.62, 0.45, p.body, { top: p.trim });
      m.box(w - 0.85, 0.16, 0.45, w - 0.4, 0.58, 0.7, p.glass);
      m.box(w - 0.95, 0.58, 0.2, w - 0.3, 0.64, 0.4, team);
      m.cylinder(0.45, 0.35, 0.07, 0.75, 0.06, 0.05, p.metal, 8);
      m.box(0.45, 0.32, 0.6, 0.72, 0.38, 0.72, team);
      break;
    }
    case 'helipad': {
      // Helipad: a dark apron with a painted circle, a service hut on one side.
      m.box(0.12, 0.12, 0.07, w - 0.12, h - 0.12, 0.12, tint(p.dark, 1.3), { top: tint(p.dark, 1.15) });
      m.box(w - 0.6, 0.18, 0.12, w - 0.16, 0.74, 0.46, p.body, { top: p.trim });
      m.box(w - 0.6, 0.7, 0.18, w - 0.16, 0.76, 0.4, team);
      m.cylinder(w / 2, h / 2, 0.12, 0.125, 0.62, 0.62, tint(p.trim, 1.1), 24);
      m.cylinder(w / 2, h / 2, 0.125, 0.13, 0.5, 0.5, p.dark, 24);
      m.box(w / 2 - 0.3, h / 2 - 0.06, 0.13, w / 2 + 0.3, h / 2 + 0.06, 0.135, team);
      m.box(w / 2 - 0.3, h / 2 - 0.3, 0.13, w / 2 - 0.18, h / 2 + 0.3, 0.135, team);
      m.box(w / 2 + 0.18, h / 2 - 0.3, 0.13, w / 2 + 0.3, h / 2 + 0.3, 0.135, team);
      for (const [x, y] of [[0.22, 0.22], [w - 0.22, 0.22], [0.22, h - 0.22], [w - 0.22, h - 0.22]]) m.cylinder(x, y, 0.12, 0.2, 0.05, 0.04, GLOW_BLUE, 6, { glow: true });
      break;
    }
    case 'ioncannon': {
      // Advanced Communications Center: a dark uplink block under a big white dish.
      m.box(0.22, 0.22, 0.07, w - 0.22, h - 0.22, 0.5, tint(p.body, 0.72), { top: p.dark });
      m.box(0.3, 0.3, 0.5, w - 0.3, h - 0.3, 0.56, tint(p.dark, 1.25));
      m.box(0.22, h - 0.26, 0.2, w - 0.22, h - 0.2, 0.44, team);
      m.cylinder(w / 2, h / 2, 0.5, 1.15, 0.14, 0.1, p.metal, 12);
      m.cylinder(w / 2, h / 2, 1.1, 1.52, 0.16, 0.72, [208, 208, 192], 24, { cap: false });
      m.cylinder(w / 2, h / 2, 1.12, 1.16, 0.18, 0.18, p.dark, 12);
      m.cylinder(w / 2, h / 2, 1.16, 1.78, 0.035, 0.025, p.metal, 6);
      m.dome(w / 2, h / 2, 1.78, 0.09, GLOW_CYAN, 2, 10);
      for (const f of m.faces.slice(-2 * 10 - 1)) f.glow = true;
      break;
    }
    case 'temple': {
      // Temple of Nod: a stepped black pyramid with a glowing apex.
      for (let k2 = 0; k2 < 5; k2++) {
        const inset = 0.25 + k2 * 0.22, z = 0.07 + k2 * 0.26;
        m.box(inset, inset, z, w - inset, h - inset, z + 0.26, tint(p.dark, 1.15 + k2 * 0.12), { top: tint(p.dark, 1.35 + k2 * 0.1) });
      }
      m.box(0.25, 0.19, 0.2, w - 0.25, 0.25, 0.44, team);
      m.cylinder(w / 2, h / 2, 1.37, 1.62, 0.16, 0.1, p.metal, 8);
      m.dome(w / 2, h / 2, 1.62, 0.16, GLOW_RED, 3, 12, 0.22);
      for (const f of m.faces.slice(-3 * 12 - 1)) f.glow = true;
      break;
    }
    case 'gtower': {
      // Guard Tower: a squat concrete post with a firing slit under a flat cap.
      m.cylinder(0.5, 0.5, 0.07, 0.62, 0.36, 0.3, tint(p.body, 0.8), 8, { top: p.trim });
      m.cylinder(0.5, 0.5, 0.78, 0.88, 0.4, 0.4, p.trim, 8);
      m.cylinder(0.5, 0.5, 0.56, 0.64, 0.33, 0.33, p.dark, 8, { cap: false });
      m.box(0.3, 0.46, 0.3, 0.7, 0.54, 0.4, team);
      break;
    }
    case 'atower': {
      // Advanced Guard Tower: a tall mast with twin rocket pods.
      m.box(0.2, h - 0.8, 0.07, 0.8, h - 0.2, 0.35, p.body, { top: p.trim });
      m.cylinder(0.5, h - 0.5, 0.35, 1.45, 0.2, 0.16, p.body, 10);
      m.cylinder(0.5, h - 0.5, 0.95, 1.05, 0.21, 0.21, team, 10, { cap: false });
      for (const dy of [-0.18, 0.18]) m.box(0.3, h - 0.5 + dy - 0.07, 1.45, 0.7, h - 0.5 + dy + 0.07, 1.66, p.trim, { top: p.dark });
      break;
    }
    case 'obelisk': {
      // Obelisk of Light: a tapered spire with a crystal lens at the tip.
      m.box(0.26, h - 0.76, 0.07, 0.74, h - 0.24, 0.26, p.trim, { top: p.dark });
      m.cylinder(0.5, h - 0.5, 0.26, 1.85, 0.26, 0.09, tint(p.dark, 1.1), 4);
      m.cylinder(0.5, h - 0.5, 0.5, 0.58, 0.24, 0.22, team, 4, { cap: false });
      m.cylinder(0.5, h - 0.5, 1.85, 2.05, 0.09, 0.0, GLOW_RED, 4, { glow: true });
      break;
    }
    case 'samsite': {
      // SAM Site: a low bunker whose roof opens onto twin launch rails.
      m.box(0.15, 0.12, 0.07, w - 0.15, h - 0.12, 0.3, p.body, { top: p.trim });
      m.box(0.15, h - 0.16, 0.12, w - 0.15, h - 0.1, 0.26, team);
      for (const dx of [-0.3, 0.3]) {
        const cx = w / 2 + dx;
        m.box(cx - 0.12, h / 2 - 0.14, 0.3, cx + 0.12, h / 2 + 0.14, 0.38, p.dark);
        m.cylinder(cx, h / 2, 0.38, 0.72, 0.08, 0.05, p.metal, 8);
      }
      break;
    }
    case 'flametower': {
      // Flame Tower: a white-capped turret with a burner nozzle and a pilot flame.
      m.cylinder(0.5, 0.5, 0.07, 0.42, 0.38, 0.34, tint(p.body, 1.15), 10, { top: [232, 232, 232] });
      m.cylinder(0.5, 0.5, 0.42, 0.62, 0.3, 0.26, p.trim, 10, { top: p.dark });
      m.box(0.44, 0.5, 0.48, 0.92, 0.56, 0.56, p.dark);
      m.cylinder(0.5, 0.5, 0.3, 0.38, 0.39, 0.39, team, 10, { cap: false });
      m.dome(0.95, 0.53, 0.5, 0.06, [255, 150, 60], 2, 8);
      for (const f of m.faces.slice(-2 * 8 - 1)) f.glow = true;
      break;
    }
    case 'dropship': {
      // Dropship Bay: a cleared landing apron with guide lights, a cradle and a control block.
      m.box(0.12, 0.12, 0.07, w - 0.12, h - 0.12, 0.14, p.pad, { top: tint(p.dark, 1.45) });
      m.cylinder(w / 2, h / 2, 0.14, 0.15, 0.95, 0.95, tint(p.trim, 1.08), 26);
      m.cylinder(w / 2, h / 2, 0.15, 0.16, 0.74, 0.74, p.dark, 26);
      for (let k2 = 0; k2 < 8; k2++) {
        const a = (k2 / 8) * Math.PI * 2 + 0.2;
        m.cylinder(w / 2 + Math.cos(a) * 1.15, h / 2 + Math.sin(a) * 1.15, 0.14, 0.24, 0.05, 0.04, k2 % 2 ? GLOW_BLUE : team, 6, { glow: k2 % 2 === 0 });
      }
      for (const dx of [-0.5, 0.5]) m.box(w / 2 + dx - 0.07, h / 2 - 0.5, 0.16, w / 2 + dx + 0.07, h / 2 + 0.5, 0.3, p.metal);
      m.box(0.2, h - 0.72, 0.07, 0.86, h - 0.2, 0.52, p.body, { top: p.trim });
      m.box(0.26, h - 0.66, 0.52, 0.8, h - 0.26, 0.74, p.glass);
      m.box(0.2, h - 0.24, 0.2, 0.86, h - 0.18, 0.44, team);
      break;
    }
    case 'sonicarray': {
      // Sonic Array: a ring of resonator horns around a tuned central bell.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.42, p.body, { top: p.trim });
      m.box(0.25, h - 0.29, 0.16, w - 0.25, h - 0.23, 0.36, team);
      for (let k2 = 0; k2 < 6; k2++) {
        const a = (k2 / 6) * Math.PI * 2 + 0.25;
        const cx = w / 2 + Math.cos(a) * 0.92, cy = h / 2 + Math.sin(a) * 0.92;
        m.cylinder(cx, cy, 0.42, 0.72, 0.1, 0.09, p.metal, 10);
        m.cylinder(cx, cy, 0.72, 0.98, 0.09, 0.24, p.body, 14, { cap: false });
        m.cylinder(cx, cy, 0.96, 0.99, 0.2, 0.2, p.glass, 14);
      }
      m.cylinder(w / 2, h / 2, 0.42, 1.15, 0.34, 0.28, p.body, 18, { top: p.trim });
      m.cylinder(w / 2, h / 2, 0.78, 0.88, 0.36, 0.36, team, 18, { cap: false });
      m.dome(w / 2, h / 2, 1.15, 0.3, p.glass, 5, 18, 0.34);
      m.dome(w / 2, h / 2, 1.2, 0.12, GLOW_CYAN, 3, 12, 0.14);
      for (const f of m.faces.slice(-3 * 12 - 1)) f.glow = true;
      break;
    }
    case 'prismarray': {
      // Prism Array: a focusing crystal on a stepped plinth, fed by satellite prisms.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.4, p.body, { top: p.trim });
      m.box(0.25, h - 0.29, 0.14, w - 0.25, h - 0.23, 0.34, team);
      m.box(0.75, 0.75, 0.4, w - 0.75, h - 0.75, 0.62, p.trim, { top: p.metal });
      for (let k2 = 0; k2 < 4; k2++) {
        const a = (k2 / 4) * Math.PI * 2 + Math.PI / 4;
        const cx = w / 2 + Math.cos(a) * 1.0, cy = h / 2 + Math.sin(a) * 1.0;
        m.cylinder(cx, cy, 0.4, 0.78, 0.11, 0.08, p.metal, 8);
        m.cylinder(cx, cy, 0.78, 1.02, 0.1, 0.0, GLOW_CYAN, 6, { glow: true });
      }
      m.cylinder(w / 2, h / 2, 0.62, 1.05, 0.26, 0.2, p.metal, 12);
      m.cylinder(w / 2, h / 2, 1.05, 1.95, 0.24, 0.0, GLOW_CYAN, 6, { glow: true });
      break;
    }
    case 'teslaarray': {
      // Tesla Storm Array: a ring of coils around a charged central mast.
      m.box(0.25, 0.25, 0.07, w - 0.25, h - 0.25, 0.4, p.body, { top: p.trim });
      m.box(0.25, h - 0.29, 0.14, w - 0.25, h - 0.23, 0.34, team);
      for (let k2 = 0; k2 < 4; k2++) {
        const a = (k2 / 4) * Math.PI * 2 + Math.PI / 4;
        const cx = w / 2 + Math.cos(a) * 0.95, cy = h / 2 + Math.sin(a) * 0.95;
        for (let z = 0.4, j = 0; j < 5; z += 0.13, j++) m.cylinder(cx, cy, z, z + 0.13, 0.17 - j * 0.02, 0.17 - j * 0.02, j % 2 ? p.dark : p.metal, 12);
        m.dome(cx, cy, 1.05, 0.11, GLOW_BLUE, 2, 10);
        for (const f of m.faces.slice(-2 * 10 - 1)) f.glow = true;
      }
      m.cylinder(w / 2, h / 2, 0.4, 1.5, 0.22, 0.14, p.metal, 14);
      m.cylinder(w / 2, h / 2, 0.85, 0.95, 0.26, 0.26, team, 14, { cap: false });
      m.dome(w / 2, h / 2, 1.5, 0.26, GLOW_CYAN, 4, 16, 0.3);
      for (const f of m.faces.slice(-4 * 16 - 1)) f.glow = true;
      break;
    }
    case 'aagun': {
      // AA Gun: a sandbagged ring on a concrete apron; the gun itself tracks its target.
      m.box(0.18, h - 0.82, 0.07, 0.82, h - 0.18, 0.2, p.pad, { top: p.trim });
      m.cylinder(0.5, h - 0.5, 0.2, 0.34, 0.36, 0.33, [150, 136, 102], 10, { top: p.dark });
      m.box(0.2, h - 0.2, 0.12, 0.8, h - 0.14, 0.26, team);
      break;
    }
    default:
      m.box(0.2, 0.2, 0.07, w - 0.2, h - 0.2, 0.6, p.body);
      m.box(0.2, h - 0.24, 0.2, w - 0.2, h - 0.18, 0.45, team);
  }
  return m;
}

/** Alternate roof shades for saw-tooth roofs. */
function k(c: RGB, x: number): RGB { return tint(c, Math.round(x / 0.65) % 2 ? 0.92 : 1); }

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

const HAS_TURRET = new Set(['tank-turret', 'siege-turret', 'mammoth-turret', 'launcher', 'sonic', 'devastator', 'prism', 'mirage', 'tesla-tank', 'ship-destroyer', 'ship-patrol', 'ship-cruiser', 'ship-dreadnought']);
/** Ships are modelled small and scaled up to RA2's big hulls. */
const SHIP_SCALE: Record<string, number> = { hovercraft: 1.5, 'ship-destroyer': 1.8, 'ship-cruiser': 1.8, 'ship-carrier': 1.9, 'ship-patrol': 1.5, 'ship-dreadnought': 1.9, sub: 1.7, dolphin: 1.3, squid: 1.5 };
function scaled(m: Mesh, k = 1): Mesh {
  if (k !== 1) for (const f of m.faces) f.pts = f.pts.map(([x, y, z]) => [x * k, y * k, z * k] as Vec3);
  return m;
}
/** Units drawn in the air with a ground shadow. */
export const FLYING = new Set(['kirov', 'jet', 'ornithopter', 'carryall', 'helicopter', 'orca', 'apache']);
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
    case 'wormrider': {
      // Worm Rider: a ridden sandworm, back arched out of the sand, with maker hooks.
      const sand: RGB = [196, 150, 96], gut: RGB = [164, 112, 70];
      for (let k2 = 0; k2 < 7; k2++) {
        const t = k2 / 6, x = -0.55 + t * 1.1;
        const r = 0.1 + Math.sin(Math.PI * (0.12 + t * 0.88)) * 0.17;
        const z = Math.sin(Math.PI * t) * 0.12;
        m.cylinder(x, 0, z, z + r * 1.25, r, r * 0.86, k2 % 2 ? sand : tint(sand, 0.93), 10);
      }
      // Mouth rings at the head.
      m.cylinder(0.58, 0, 0.04, 0.16, 0.17, 0.12, gut, 10, { cap: false });
      m.cylinder(0.62, 0, 0.06, 0.12, 0.1, 0.04, [92, 52, 38], 8);
      // Two riders with their hooks.
      for (const [x, y] of [[-0.06, -0.06], [-0.26, 0.07]]) {
        m.box(x - 0.04, y - 0.04, 0.3, x + 0.04, y + 0.04, 0.44, team);
        m.dome(x, y, 0.44, 0.045, [214, 190, 150], 2, 8);
        m.box(x + 0.04, y - 0.01, 0.36, x + 0.22, y + 0.01, 0.38, p.metal);
      }
      break;
    }
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
    case 'destroyer-td':
      // Tank Destroyer: low casemate with a long fixed gun.
      tracked(0.42, 0.28, 0.16);
      m.box(-0.32, -0.2, 0.16, 0.26, 0.2, 0.32, hull, { top: team });
      m.box(0.2, -0.035, 0.22, 0.78, 0.035, 0.28, BARREL);
      break;
    case 'drone':
      // Terror Drone: a little spider.
      for (let k2 = 0; k2 < 8; k2++) {
        const a = (k2 / 8) * Math.PI * 2 + 0.4;
        m.box(Math.cos(a) * 0.12 - 0.02, Math.sin(a) * 0.12 - 0.02, 0, Math.cos(a) * 0.24 + 0.02, Math.sin(a) * 0.24 + 0.02, 0.06, p.dark);
      }
      m.dome(0, 0, 0.05, 0.13, p.metal, 3, 10, 0.1);
      m.box(0.1, -0.03, 0.08, 0.15, 0.03, 0.12, GLOW_RED, { glow: true });
      break;
    case 'demotruck':
      for (const [x, y] of [[-0.28, -0.17], [-0.28, 0.17], [0.25, -0.17], [0.25, 0.17]]) m.box(x - 0.07, y - 0.04, 0.0, x + 0.07, y + 0.04, 0.1, TRACK);
      m.box(0.12, -0.15, 0.06, 0.38, 0.15, 0.32, hull, { top: p.glass });
      m.box(-0.4, -0.17, 0.06, 0.1, 0.17, 0.18, p.dark);
      for (const [x, y] of [[-0.28, -0.08], [-0.28, 0.08], [-0.08, -0.08], [-0.08, 0.08]]) m.cylinder(x, y, 0.18, 0.36, 0.07, 0.07, [210, 190, 60], 10, { top: team });
      break;
    case 'kirov':
      // Kirov airship: the great blimp, tail fins and a gondola slung beneath.
      lathe(m, -0.8, 0.8, 0, 0.42, t => 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.55), tint(p.metal, 1.05), 12, 14);
      m.box(-0.3, -0.12, 0.42, 0.3, 0.12, 0.44, team);
      m.box(-0.2, -0.08, 0.02, 0.28, 0.08, 0.14, p.dark);
      m.add([[-0.85, 0, 0.42], [-0.55, 0, 0.42], [-0.85, 0, 0.85]], team);
      m.add([[-0.85, -0.32, 0.42], [-0.55, 0, 0.42], [-0.85, 0.32, 0.42]], team);
      break;
    case 'jet':
      // Harrier / Black Eagle: fuselage, swept wings and a tail.
      lathe(m, -0.38, 0.42, 0, 0.1, t => 0.07 * Math.pow(Math.sin(Math.PI * (0.15 + t * 0.85)), 0.6), p.metal, 8, 10);
      m.add([[-0.1, -0.34, 0.1], [0.12, -0.05, 0.1], [0.12, 0.05, 0.1], [-0.1, 0.34, 0.1]], tint(p.metal, 0.92));
      m.box(-0.12, -0.34, 0.09, -0.02, -0.28, 0.12, team);
      m.box(-0.12, 0.28, 0.09, -0.02, 0.34, 0.12, team);
      m.add([[-0.38, 0, 0.1], [-0.24, 0, 0.1], [-0.38, 0, 0.3]], tint(p.metal, 0.85));
      m.add([[-0.38, -0.14, 0.1], [-0.26, 0, 0.1], [-0.38, 0.14, 0.1]], tint(p.metal, 0.85));
      break;
    case 'ornithopter':
      // Dune Ornithopter: a slim cockpit body with four long wings.
      lathe(m, -0.35, 0.35, 0, 0.12, t => 0.08 * Math.pow(Math.sin(Math.PI * t), 0.7), p.body, 8, 10);
      for (const x of [-0.08, 0.1]) {
        m.add([[x - 0.06, -0.46, 0.15], [x + 0.06, -0.06, 0.15], [x + 0.06, 0.06, 0.15], [x - 0.06, 0.46, 0.15]], tint(p.trim, 0.95));
      }
      m.box(0.22, -0.05, 0.12, 0.33, 0.05, 0.19, p.glass);
      m.box(-0.3, -0.04, 0.12, -0.18, 0.04, 0.2, team);
      break;
    case 'carryall':
      // Carryall: a long body with twin engine pods and a cargo clamp.
      lathe(m, -0.5, 0.5, 0, 0.2, t => 0.11 * Math.pow(Math.sin(Math.PI * t), 0.5), p.body, 10, 10);
      for (const y of [-0.24, 0.24]) lathe(m, -0.3, 0.2, y, 0.2, t => 0.06 * Math.pow(Math.sin(Math.PI * t), 0.5), p.trim, 6, 8);
      m.box(-0.1, -0.26, 0.17, 0.1, 0.26, 0.22, p.metal);
      m.box(-0.35, -0.06, 0.28, -0.1, 0.06, 0.32, team);
      m.box(-0.2, -0.12, 0.02, 0.2, -0.09, 0.1, p.dark);
      m.box(-0.2, 0.09, 0.02, 0.2, 0.12, 0.1, p.dark);
      break;
    case 'ship-destroyer':
      prism(m, hullOutline(0.6, 0.17), -0.04, 0.14, tint(p.hull, 0.9), p.trim);
      m.box(-0.35, -0.1, 0.14, -0.02, 0.1, 0.32, p.hull, { top: team });
      m.box(-0.2, -0.02, 0.32, -0.14, 0.02, 0.55, p.metal);
      break;
    case 'ship-cruiser':
      prism(m, hullOutline(0.7, 0.19), -0.04, 0.15, tint(p.hull, 0.9), p.trim);
      m.box(-0.45, -0.12, 0.15, 0.05, 0.12, 0.36, p.hull, { top: team });
      m.cylinder(-0.2, 0, 0.36, 0.62, 0.05, 0.03, p.metal, 8);
      m.box(-0.28, -0.1, 0.55, -0.12, 0.1, 0.58, p.dark);
      for (const x of [0.15, 0.3]) m.box(x, -0.09, 0.15, x + 0.1, 0.09, 0.2, p.dark);
      break;
    case 'ship-carrier':
      prism(m, [[-0.85, -0.3], [0.65, -0.3], [0.9, -0.1], [0.9, 0.1], [0.65, 0.3], [-0.85, 0.3]], -0.04, 0.2, tint(p.hull, 0.88), [118, 122, 126]);
      m.box(-0.8, -0.015, 0.2, 0.8, 0.015, 0.205, [225, 225, 205]);
      for (const x of [-0.6, -0.2, 0.2]) m.box(x, -0.2, 0.2, x + 0.12, -0.17, 0.205, [225, 200, 90]);
      m.box(-0.3, 0.2, 0.2, 0.15, 0.3, 0.5, p.hull, { top: team });
      m.cylinder(-0.05, 0.25, 0.5, 0.7, 0.03, 0.02, p.metal, 6);
      break;
    case 'ship-patrol':
      prism(m, hullOutline(0.42, 0.13), -0.03, 0.11, tint(p.hull, 0.9), p.trim);
      m.box(-0.3, -0.08, 0.11, -0.05, 0.08, 0.24, p.hull, { top: team });
      break;
    case 'ship-dreadnought':
      prism(m, hullOutline(0.85, 0.22), -0.04, 0.16, tint(p.hull, 0.88), p.trim);
      m.box(-0.2, -0.13, 0.16, 0.15, 0.13, 0.42, p.hull, { top: team });
      m.cylinder(-0.05, 0, 0.42, 0.7, 0.06, 0.04, p.metal, 8);
      for (const x of [-0.6, -0.45, 0.3, 0.45]) m.cylinder(x, 0, 0.16, 0.22, 0.06, 0.06, p.dark, 10);
      break;
    case 'hovercraft':
      // Amphibious Transport: a hull on an inflated skirt with a loading ramp.
      prism(m, [[-0.5, -0.24], [0.45, -0.24], [0.55, -0.12], [0.55, 0.12], [0.45, 0.24], [-0.5, 0.24]], 0, 0.08, [56, 56, 58]);
      prism(m, [[-0.42, -0.19], [0.4, -0.19], [0.48, 0], [0.4, 0.19], [-0.42, 0.19]], 0.08, 0.24, p.hull, p.trim);
      m.box(-0.38, -0.12, 0.24, -0.1, 0.12, 0.36, p.hull, { top: team });
      for (const y of [-0.12, 0.12]) m.cylinder(-0.45, y, 0.24, 0.42, 0.07, 0.07, p.dark, 10);
      break;
    case 'helicopter':
      // Night Hawk: a tandem-rotor body; the blades are drawn spinning by the renderer.
      lathe(m, -0.45, 0.42, 0, 0.18, t => 0.12 * Math.pow(Math.sin(Math.PI * (0.1 + t * 0.9)), 0.5), p.metal, 10, 12);
      m.box(0.18, -0.07, 0.2, 0.36, 0.07, 0.28, p.glass);
      m.box(-0.4, -0.04, 0.26, -0.3, 0.04, 0.4, p.metal);
      m.box(0.25, -0.03, 0.28, 0.33, 0.03, 0.36, p.metal);
      m.box(-0.2, -0.13, 0.15, 0.1, -0.12, 0.25, team);
      m.box(-0.2, 0.12, 0.15, 0.1, 0.13, 0.25, team);
      break;
    case 'sub':
      // Typhoon: a long dark hull riding low, with its sail.
      lathe(m, -0.55, 0.55, 0, 0.0, t => 0.13 * Math.pow(Math.sin(Math.PI * t), 0.45), [62, 66, 70], 10, 12, 0.7);
      m.box(-0.1, -0.04, 0.05, 0.12, 0.04, 0.25, [70, 74, 78], { top: team });
      break;
    case 'dolphin':
      lathe(m, -0.3, 0.32, 0, 0.04, t => 0.08 * Math.pow(Math.sin(Math.PI * t), 0.6), [120, 140, 160], 8, 10, 0.8);
      m.add([[-0.05, 0, 0.1], [0.08, 0, 0.1], [-0.08, 0, 0.22]], [100, 120, 140]);
      break;
    case 'squid':
      m.dome(0.05, 0, 0.0, 0.18, [120, 70, 140], 3, 12, 0.16);
      for (let k2 = 0; k2 < 6; k2++) {
        const a = (k2 / 6) * Math.PI - Math.PI / 2;
        m.box(-0.35, Math.sin(a) * 0.16 - 0.02, 0.0, 0.0, Math.sin(a) * 0.16 + 0.02, 0.04, [140, 80, 160]);
      }
      break;
    case 'humvee':
      // Hum-vee / Ranger: four wheels, a slab body and a roof gun.
      for (const [x, y] of [[-0.2, -0.16], [-0.2, 0.16], [0.2, -0.16], [0.2, 0.16]]) m.box(x - 0.08, y - 0.05, 0.0, x + 0.08, y + 0.05, 0.12, TRACK);
      m.box(-0.28, -0.14, 0.08, 0.3, 0.14, 0.2, hull);
      m.box(0.02, -0.12, 0.2, 0.26, 0.12, 0.3, hull, { top: p.glass });
      m.box(-0.26, -0.13, 0.2, 0.0, 0.13, 0.26, tint(hull, 0.95), { top: team });
      m.cylinder(-0.12, 0, 0.3, 0.37, 0.05, 0.05, p.dark, 8);
      m.box(-0.12, -0.025, 0.33, 0.14, 0.025, 0.37, BARREL);
      break;
    case 'buggy':
      // Nod Buggy: an open frame, a roll cage and a pintle gun.
      for (const [x, y] of [[-0.18, -0.15], [-0.18, 0.15], [0.2, -0.13], [0.2, 0.13]]) m.box(x - 0.08, y - 0.05, 0.0, x + 0.08, y + 0.05, 0.12, TRACK);
      m.box(-0.24, -0.11, 0.08, 0.3, 0.11, 0.17, hull);
      m.box(-0.06, -0.1, 0.17, 0.12, 0.1, 0.22, team);
      for (const y of [-0.1, 0.1]) m.box(-0.08, y - 0.02, 0.22, 0.1, y + 0.02, 0.32, p.metal);
      m.box(-0.08, -0.1, 0.3, 0.1, 0.1, 0.33, p.metal);
      m.box(0.08, -0.02, 0.2, 0.34, 0.02, 0.24, BARREL);
      break;
    case 'bike':
      // Recon Bike: three wheels, a rider and twin rocket tubes.
      for (const [x, y] of [[-0.16, -0.1], [-0.16, 0.1], [0.18, 0]]) m.box(x - 0.06, y - 0.035, 0.0, x + 0.06, y + 0.035, 0.1, TRACK);
      m.box(-0.16, -0.07, 0.07, 0.2, 0.07, 0.14, hull);
      m.box(-0.04, -0.05, 0.14, 0.06, 0.05, 0.22, team);
      for (const y of [-0.09, 0.09]) m.cylinder(0.0, y, 0.15, 0.17, 0.035, 0.035, p.dark, 8, { cap: false });
      break;
    case 'apc':
      // APC: a sloped armoured box on tracks with a cupola gun.
      tracked(0.4, 0.28, 0.18);
      m.box(-0.34, -0.22, 0.18, 0.18, 0.22, 0.4, hull, { top: tint(hull, 1.04) });
      m.add([[0.18, -0.22, 0.18], [0.4, -0.18, 0.18], [0.4, 0.18, 0.18], [0.18, 0.22, 0.18]], tint(hull, 0.98));
      m.add([[0.18, -0.22, 0.4], [0.4, -0.18, 0.22], [0.4, 0.18, 0.22], [0.18, 0.22, 0.4]], tint(hull, 1.06));
      m.box(-0.34, -0.23, 0.26, -0.02, -0.21, 0.34, team);
      m.box(-0.34, 0.21, 0.26, -0.02, 0.23, 0.34, team);
      m.cylinder(-0.08, 0, 0.4, 0.48, 0.1, 0.09, hull, 10, { top: team });
      m.box(-0.02, -0.025, 0.43, 0.26, 0.025, 0.47, BARREL);
      break;
    case 'mammoth-turret':
      // Mammoth Tank: a long double-tracked hull; the twin turret is drawn separately.
      m.box(-0.58, -0.4, 0, 0.58, -0.24, 0.26, TRACK);
      m.box(-0.58, 0.24, 0, 0.58, 0.4, 0.26, TRACK);
      m.box(-0.54, -0.3, 0.06, 0.56, 0.3, 0.32, hull, { top: tint(hull, 1.03) });
      m.box(-0.5, -0.33, 0.3, 0.2, 0.33, 0.34, tint(hull, 0.96));
      m.box(-0.5, -0.41, 0.2, 0.0, -0.38, 0.3, team);
      m.box(-0.5, 0.38, 0.2, 0.0, 0.41, 0.3, team);
      break;
    case 'flametank':
      // Flame Tank: a tracked tank with paired nozzles and pressure drums, no turret.
      tracked(0.44, 0.3, 0.2);
      m.box(-0.36, -0.24, 0.2, 0.26, 0.24, 0.34, hull, { top: tint(hull, 1.04) });
      for (const y of [-0.12, 0.12]) m.cylinder(-0.1, y, 0.34, 0.46, 0.1, 0.1, p.metal, 12);
      for (const y of [-0.08, 0.08]) m.cylinder(0.26, y, 0.24, 0.26, 0.045, 0.045, p.dark, 8, { cap: false });
      for (const y of [-0.08, 0.08]) m.box(0.26, y - 0.035, 0.22, 0.5, y + 0.035, 0.28, BARREL);
      m.box(-0.36, -0.25, 0.26, 0.0, -0.23, 0.32, team);
      m.box(-0.36, 0.23, 0.26, 0.0, 0.25, 0.32, team);
      break;
    case 'minelayer':
      // Minelayer / Supply Truck: a small tracked carrier with a rear dispenser.
      tracked(0.34, 0.24, 0.16);
      m.box(-0.2, -0.19, 0.16, 0.28, 0.19, 0.34, hull, { top: p.glass });
      m.box(-0.36, -0.17, 0.16, -0.2, 0.17, 0.26, p.dark);
      m.box(-0.2, -0.2, 0.22, 0.1, -0.18, 0.3, team);
      break;
    case 'mgg':
      // Mobile Gap Generator: a wheeled van carrying an emitter dish.
      for (const [x, y] of [[-0.2, -0.15], [-0.2, 0.15], [0.2, -0.15], [0.2, 0.15]]) m.box(x - 0.07, y - 0.05, 0.0, x + 0.07, y + 0.05, 0.11, TRACK);
      m.box(-0.28, -0.16, 0.08, 0.3, 0.16, 0.34, hull, { top: tint(hull, 1.03) });
      m.box(0.14, -0.13, 0.2, 0.3, 0.13, 0.32, p.glass);
      m.box(-0.28, -0.17, 0.16, 0.0, -0.15, 0.26, team);
      m.cylinder(-0.1, 0, 0.34, 0.44, 0.04, 0.03, p.metal, 8);
      m.cylinder(-0.1, 0, 0.42, 0.56, 0.06, 0.2, p.body, 14, { cap: false });
      break;
    case 'orca':
      // Orca: a VTOL with twin lift pods and rocket pods under stub wings.
      lathe(m, -0.3, 0.36, 0, 0.14, t => 0.09 * Math.pow(Math.sin(Math.PI * (0.18 + t * 0.82)), 0.55), p.metal, 8, 10);
      m.box(0.16, -0.06, 0.16, 0.3, 0.06, 0.22, p.glass);
      for (const y of [-0.2, 0.2]) {
        m.box(-0.12, y - 0.07, 0.12, 0.08, y + 0.07, 0.2, tint(p.metal, 0.95), { top: team });
        m.cylinder(-0.02, y, 0.08, 0.12, 0.06, 0.06, p.dark, 10);
      }
      m.add([[-0.08, -0.22, 0.15], [0.06, -0.08, 0.15], [0.06, 0.08, 0.15], [-0.08, 0.22, 0.15]], tint(p.metal, 0.92));
      m.add([[-0.3, 0, 0.14], [-0.18, 0, 0.14], [-0.3, 0, 0.3]], team);
      break;
    case 'apache':
      // Apache / Longbow / Hind: a gunship with stub wings, chin gun and rotor mast.
      lathe(m, -0.42, 0.38, 0, 0.17, t => 0.1 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.88)), 0.5), p.metal, 10, 12);
      m.box(0.2, -0.05, 0.17, 0.34, 0.05, 0.24, p.glass);
      m.box(0.26, -0.03, 0.1, 0.38, 0.03, 0.15, p.dark);
      for (const y of [-0.17, 0.17]) {
        m.box(-0.06, y - 0.05, 0.13, 0.1, y + 0.05, 0.18, tint(p.metal, 0.95), { top: team });
        m.cylinder(0.02, y, 0.09, 0.13, 0.05, 0.05, p.dark, 8);
      }
      m.box(-0.04, -0.03, 0.26, 0.04, 0.03, 0.34, p.metal);
      m.box(-0.42, -0.02, 0.2, -0.3, 0.02, 0.36, p.metal);
      break;
    default:
      tracked(0.38, 0.26, 0.18);
  }
  return scaled(m, SHIP_SCALE[shape]);
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
    case 'mirage':
      m.cylinder(-0.02, 0, 0.18, 0.3, 0.17, 0.15, p.hull, 12, { top: team });
      m.box(0.1, -0.025, 0.22, 0.5, 0.025, 0.26, BARREL);
      m.cylinder(-0.05, 0, 0.3, 0.36, 0.04, 0.12, GLOW_CYAN, 10, { glow: true });
      break;
    case 'tesla-tank':
      m.box(-0.18, -0.16, 0.18, 0.12, 0.16, 0.3, p.hull, { top: team });
      for (const y of [-0.08, 0.08]) {
        for (let z = 0.3, k2 = 0; k2 < 3; z += 0.07, k2++) m.cylinder(0.02, y, z, z + 0.07, 0.06, 0.06, k2 % 2 ? p.dark : p.metal, 10);
        m.dome(0.02, y, 0.51, 0.05, GLOW_BLUE, 2, 8);
      }
      break;
    case 'ship-destroyer': case 'ship-patrol':
      m.cylinder(0.25, 0, 0.12, 0.22, 0.08, 0.07, p.hull, 10, { top: team });
      m.box(0.3, -0.02, 0.15, 0.55, 0.02, 0.19, BARREL);
      break;
    case 'ship-cruiser':
      m.box(0.32, -0.08, 0.15, 0.5, 0.08, 0.26, p.hull, { top: team });
      for (const y of [-0.04, 0.04]) m.box(0.42, y - 0.02, 0.24, 0.52, y + 0.02, 0.3, p.dark);
      break;
    case 'ship-dreadnought':
      m.box(0.4, -0.1, 0.16, 0.65, 0.1, 0.3, p.hull, { top: team });
      for (const y of [-0.05, 0.05]) m.box(0.55, y - 0.025, 0.28, 0.72, y + 0.025, 0.36, p.dark);
      break;
    case 'mammoth-turret':
      // Twin cannon with a rocket pod either side.
      m.box(-0.3, -0.26, 0.34, 0.16, 0.26, 0.52, p.hull, { top: team });
      for (const y of [-0.1, 0.1]) m.box(0.12, y - 0.045, 0.4, 0.78, y + 0.045, 0.48, BARREL);
      for (const y of [-0.26, 0.26]) {
        m.box(-0.22, y - 0.06, 0.4, 0.02, y + 0.06, 0.54, tint(p.hull, 0.95));
        for (const dz of [0.42, 0.48]) m.cylinder(0.02, y, dz, dz + 0.04, 0.03, 0.03, p.dark, 6, { cap: false });
      }
      break;
    default:
      m.cylinder(-0.02, 0, 0.18, 0.31, 0.17, 0.15, p.hull, 14, { top: team });
      m.box(0.1, -0.03, 0.22, 0.55, 0.03, 0.27, BARREL);
  }
  return scaled(m, SHIP_SCALE[shape]);
}

/** Defences with a gun that tracks its target. */
export const ROTATING_DEFENCES = new Set(['turret', 'rocketturret', 'patriot', 'flakcannon', 'grandcannon', 'aagun']);

/** Rotating gun on top of a defensive structure, centred on the origin. */
export function defenseTurretMesh(shape: string, style: ArtStyle, team: RGB): Mesh {
  const p = PALETTES[style];
  const m = new Mesh();
  if (shape === 'rocketturret') {
    m.box(-0.18, -0.16, 0.36, 0.16, 0.16, 0.58, p.body, { top: team });
    for (const y of [-0.08, 0.08]) m.box(0.16, y - 0.04, 0.42, 0.26, y + 0.04, 0.52, p.dark);
  } else if (shape === 'patriot') {
    m.box(-0.12, -0.2, 0.25, 0.12, 0.2, 0.32, p.metal);
    for (const y of [-0.12, 0.12]) m.box(-0.16, y - 0.08, 0.32, 0.24, y + 0.08, 0.52, p.body, { top: team });
  } else if (shape === 'flakcannon') {
    m.cylinder(0, 0, 0.3, 0.42, 0.18, 0.15, p.hull, 10, { top: team });
    for (const y of [-0.06, 0.06]) m.box(0.08, y - 0.025, 0.4, 0.46, y + 0.025, 0.48, BARREL);
  } else if (shape === 'aagun') {
    m.cylinder(0, 0, 0.34, 0.44, 0.17, 0.14, p.hull, 10, { top: team });
    for (const y of [-0.07, 0.07]) m.box(0.0, y - 0.03, 0.42, 0.52, y + 0.03, 0.48, BARREL);
  } else if (shape === 'grandcannon') {
    m.box(-0.38, -0.36, 0.45, 0.36, 0.36, 0.78, p.body, { top: team });
    m.box(0.3, -0.07, 0.56, 1.35, 0.07, 0.68, BARREL);
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

/** Bonus crate: a banded box with a coloured lid saying what is inside. */
export function crateMesh(kind: string): Mesh {
  const m = new Mesh();
  const wood: RGB = [146, 116, 74], band: RGB = [96, 88, 78];
  const lid: Record<string, RGB> = {
    money: [226, 190, 72], heal: [236, 240, 244], veteran: [236, 196, 92],
    reveal: [150, 205, 240], unit: [170, 178, 186],
  };
  m.box(0.28, 0.28, 0, 0.72, 0.72, 0.3, wood, { top: lid[kind] ?? wood });
  m.box(0.26, 0.42, 0.06, 0.74, 0.5, 0.24, band);
  m.box(0.42, 0.26, 0.06, 0.5, 0.74, 0.24, band);
  if (kind === 'heal') {
    m.box(0.44, 0.34, 0.3, 0.56, 0.66, 0.32, [208, 60, 60]);
    m.box(0.34, 0.44, 0.3, 0.66, 0.56, 0.32, [208, 60, 60]);
  } else if (kind === 'reveal') {
    m.dome(0.5, 0.5, 0.3, 0.12, [150, 225, 255], 3, 10, 0.12);
    for (const f of m.faces.slice(-3 * 10 - 1)) f.glow = true;
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
