// Canvas renderer for the Fusion Engine. One implementation, two projections:
// top-down (Dune) and 2:1 isometric (RA2). Artwork is procedural and faction-coloured;
// sprites are chosen by `shape` key so a later asset pipeline can replace them.
import { LEPTONS } from './core';
import type { Entity, Game } from './game';

const ORTHO_TILE = 32;
const ISO_W = 48, ISO_H = 24;

export interface Camera { x: number; y: number; zoom: number }
export interface Ghost { item: string; x: number; y: number }

export class FusionRenderer {
  readonly iso: boolean;
  camera: Camera = { x: 0, y: 0, zoom: 1.25 };
  selected = new Set<number>();
  /** Entity under the pointer; its health bar shows like a selected one. */
  hover = 0;
  ghost: Ghost | null = null;
  /** Short-lived order confirmation rings (UI only, never part of the simulation). */
  markers: { cx: number; cy: number; color: string; until: number }[] = [];
  dragBox: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private terrainKey = -1;
  private originX = 0;
  private frame = 0;

  constructor(private canvas: HTMLCanvasElement, private game: Game, public viewer: number) {
    this.iso = game.pack.projection === 'iso';
    this.ctx = canvas.getContext('2d')!;
    this.originX = this.iso ? game.map.h * (ISO_W / 2) : 0;
    this.terrain = document.createElement('canvas');
    const size = this.worldSize();
    this.terrain.width = size.w; this.terrain.height = size.h;
  }

  // ------------------------------------------------------------ projection

  worldSize() {
    const { w, h } = this.game.map;
    return this.iso ? { w: (w + h) * (ISO_W / 2), h: (w + h) * (ISO_H / 2) } : { w: w * ORTHO_TILE, h: h * ORTHO_TILE };
  }

  /** Cell-space (fractional cells) to world pixels. */
  project(cx: number, cy: number): { x: number; y: number } {
    if (!this.iso) return { x: cx * ORTHO_TILE, y: cy * ORTHO_TILE };
    return { x: this.originX + (cx - cy) * (ISO_W / 2), y: (cx + cy) * (ISO_H / 2) };
  }

  /** World pixels to fractional cells. */
  unproject(wx: number, wy: number): { cx: number; cy: number } {
    if (!this.iso) return { cx: wx / ORTHO_TILE, cy: wy / ORTHO_TILE };
    const a = (wx - this.originX) / (ISO_W / 2), b = wy / (ISO_H / 2);
    return { cx: (a + b) / 2, cy: (b - a) / 2 };
  }

  toScreen(lx: number, ly: number) {
    const p = this.project(lx / LEPTONS, ly / LEPTONS);
    return { x: (p.x - this.camera.x) * this.camera.zoom, y: (p.y - this.camera.y) * this.camera.zoom };
  }

  /** Screen pixel to integer cell. */
  screenToCell(sx: number, sy: number) {
    const { cx, cy } = this.unproject(sx / this.camera.zoom + this.camera.x, sy / this.camera.zoom + this.camera.y);
    return { x: Math.floor(cx), y: Math.floor(cy) };
  }

  centerOn(cellX: number, cellY: number) {
    const p = this.project(cellX + 0.5, cellY + 0.5);
    this.camera.x = p.x - this.canvas.width / 2 / this.camera.zoom;
    this.camera.y = p.y - this.canvas.height / 2 / this.camera.zoom;
    this.clampCamera();
  }

  clampCamera() {
    const size = this.worldSize();
    const vw = this.canvas.width / this.camera.zoom, vh = this.canvas.height / this.camera.zoom;
    this.camera.x = Math.max(-vw * 0.25, Math.min(size.w - vw * 0.75, this.camera.x));
    this.camera.y = Math.max(-vh * 0.25, Math.min(size.h - vh * 0.75, this.camera.y));
  }

  /** Entity under a screen point (prefers units, then the structure footprint). */
  pick(sx: number, sy: number): Entity | undefined {
    const viewer = this.game.players[this.viewer];
    let best: Entity | undefined, bestD = 18 * this.camera.zoom;
    for (const e of this.game.entities.values()) {
      if (e.hp <= 0 || e.kind !== 'unit') continue;
      if (e.owner !== this.viewer && viewer && !viewer.visible[this.game.cellOf(e)]) continue;
      const p = this.toScreen(e.x, e.y);
      const d = Math.hypot(p.x - sx, p.y - sy + 4);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (best) return best;
    const c = this.screenToCell(sx, sy);
    if (c.x < 0 || c.y < 0 || c.x >= this.game.map.w || c.y >= this.game.map.h) return undefined;
    const i = c.y * this.game.map.w + c.x;
    const id = this.game.map.occupied[i];
    if (!id || viewer && !viewer.explored[i]) return undefined;
    return this.game.entities.get(id);
  }

  // ------------------------------------------------------------ frame

  draw(alpha: number) {
    const { ctx, canvas, game } = this;
    this.frame++;
    const concreteKey = game.map.concrete.reduce((n, v, i) => n + v * (i + 1), 0);
    if (concreteKey !== this.terrainKey) { this.paintTerrain(); this.terrainKey = concreteKey; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = this.camera.zoom;
    ctx.setTransform(z, 0, 0, z, -this.camera.x * z, -this.camera.y * z);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0);
    const view = this.visibleCells();
    this.drawResources(view);
    this.drawRubble();
    this.drawGhost();
    this.drawEntities(alpha);
    this.drawWorms(alpha);
    this.drawProjectiles();
    this.drawEffects();
    this.drawMarkers();
    this.drawShroud(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOverlays(alpha);
  }

  private visibleCells() {
    const { w, h } = this.game.map;
    const z = this.camera.zoom;
    const corners = [[0, 0], [this.canvas.width, 0], [0, this.canvas.height], [this.canvas.width, this.canvas.height]]
      .map(([sx, sy]) => this.unproject(sx / z + this.camera.x, sy / z + this.camera.y));
    const minX = Math.max(0, Math.floor(Math.min(...corners.map(c => c.cx))) - 2);
    const maxX = Math.min(w - 1, Math.ceil(Math.max(...corners.map(c => c.cx))) + 2);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map(c => c.cy))) - 2);
    const maxY = Math.min(h - 1, Math.ceil(Math.max(...corners.map(c => c.cy))) + 4);
    return { minX, maxX, minY, maxY };
  }

  private cellPath(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, w = 1, h = 1) {
    if (!this.iso) { ctx.rect(x * ORTHO_TILE, y * ORTHO_TILE, w * ORTHO_TILE, h * ORTHO_TILE); return; }
    const a = this.project(x, y), b = this.project(x + w, y), c = this.project(x + w, y + h), d = this.project(x, y + h);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  // ------------------------------------------------------------ terrain

  private paintTerrain() {
    const g = this.terrain.getContext('2d')!;
    const { game } = this;
    const { w, h, terrain, decor, concrete } = game.map;
    const terrains = game.pack.terrains;
    g.clearRect(0, 0, this.terrain.width, this.terrain.height);
    // Pass 1: base colour with smooth, low-frequency variation (no per-cell checkerboard).
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = terrains[terrain[i]];
      const f = smoothNoise(x, y, decor[0] + 3);
      g.beginPath(); this.cellPath(g, x, y);
      g.fillStyle = mix(t.color, t.color2, f);
      g.fill();
      if (this.iso) { g.strokeStyle = g.fillStyle; g.lineWidth = 1; g.stroke(); }
    }
    // Pass 2: soft transitions where a higher-priority terrain meets a lower one.
    const tile = this.iso ? ISO_W : ORTHO_TILE;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const own = terrain[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const other = terrain[ny * w + nx];
        if (other <= own) continue;
        const o = terrains[other];
        const edge = this.project(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5);
        g.save();
        g.beginPath(); this.cellPath(g, x, y); g.clip();
        const grad = g.createRadialGradient(edge.x, edge.y, 0, edge.x, edge.y, tile * 0.55);
        grad.addColorStop(0, hexA(o.color, 0.9)); grad.addColorStop(0.5, hexA(o.color, 0.45)); grad.addColorStop(1, hexA(o.color, 0));
        g.fillStyle = grad;
        g.fillRect(edge.x - tile, edge.y - tile, tile * 2, tile * 2);
        g.restore();
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = terrains[terrain[i]];
      const v = decor[i];
      // Texture: a few deterministic speckles per cell.
      const c = this.project(x + 0.5, y + 0.5);
      const spread = this.iso ? ISO_W * 0.35 : ORTHO_TILE * 0.4;
      for (let k = 0; k < 3; k++) {
        const n = (v * (k + 7)) & 255;
        g.fillStyle = k % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
        g.fillRect(c.x + ((n & 15) / 15 - 0.5) * spread * 2, c.y + ((n >> 4) / 15 - 0.5) * spread * (this.iso ? 1 : 2), 2 + (n & 1), 1 + (n & 1));
      }
      if (t.id === 'cliff' || t.id === 'trees' || t.id === 'rough') this.paintFeature(g, t.id, x, y, v);
      if (t.id === 'water') { g.strokeStyle = 'rgba(160,210,255,0.18)'; g.beginPath(); g.moveTo(c.x - 8, c.y + (v & 3)); g.lineTo(c.x + 6, c.y + (v & 3)); g.stroke(); }
      if (t.sand && v % 5 === 0) { g.strokeStyle = 'rgba(120,80,30,0.18)'; g.beginPath(); g.arc(c.x, c.y + 10, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      if (concrete[i]) {
        g.beginPath(); this.cellPath(g, x, y);
        g.fillStyle = '#8f8a80'; g.fill(); g.strokeStyle = '#6f6a62'; g.lineWidth = 1; g.stroke();
      }
    }
  }

  private paintFeature(g: CanvasRenderingContext2D, kind: string, x: number, y: number, v: number) {
    const c = this.project(x + 0.5, y + 0.5);
    if (kind === 'trees') {
      for (let k = 0; k < 2; k++) {
        const ox = ((v >> (k * 2)) & 3) * 3 - 5, oy = ((v >> (k * 2 + 4)) & 3) * 2 - 4;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(c.x + ox + 3, c.y + oy + 5, 7, 3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = k ? '#2d5a22' : '#3b6e2b'; g.beginPath(); g.arc(c.x + ox, c.y + oy - 6, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(c.x + ox - 2, c.y + oy - 9, 3, 0, Math.PI * 2); g.fill();
      }
    } else {
      g.fillStyle = kind === 'cliff' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.12)';
      g.beginPath(); g.moveTo(c.x - 9, c.y + 5); g.lineTo(c.x - 2, c.y - 8 - (v & 3)); g.lineTo(c.x + 9, c.y + 4); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.beginPath(); g.moveTo(c.x - 2, c.y - 8 - (v & 3)); g.lineTo(c.x + 2, c.y - 2); g.lineTo(c.x - 6, c.y + 3); g.closePath(); g.fill();
    }
  }

  private drawResources(view: { minX: number; maxX: number; minY: number; maxY: number }) {
    const { ctx, game } = this;
    const { w, res, resKind } = game.map;
    const viewer = game.players[this.viewer];
    for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
      const i = y * w + x;
      if (!resKind[i] || viewer && !viewer.explored[i]) continue;
      const def = game.pack.resources[resKind[i] - 1];
      const c = this.project(x + 0.5, y + 0.5);
      const n = Math.min(4, 1 + Math.floor((res[i] * 4) / (def.max + 1)));
      const v = game.map.decor[i];
      const spice = def.id === 'spice';
      for (let k = 0; k < n; k++) {
        const ox = (((v >> k) & 7) - 3.5) * (this.iso ? 4 : 3.5), oy = (((v >> (k + 3)) & 7) - 3.5) * (this.iso ? 2 : 3.5);
        if (spice) {
          ctx.fillStyle = k % 2 ? def.color : def.color2;
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.ellipse(c.x + ox, c.y + oy, 6, this.iso ? 3 : 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = def.color2;
          ctx.beginPath(); ctx.moveTo(c.x + ox, c.y + oy - 5); ctx.lineTo(c.x + ox + 3, c.y + oy); ctx.lineTo(c.x + ox, c.y + oy + 2); ctx.lineTo(c.x + ox - 3, c.y + oy); ctx.closePath(); ctx.fill();
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.moveTo(c.x + ox, c.y + oy - 5); ctx.lineTo(c.x + ox + 3, c.y + oy); ctx.lineTo(c.x + ox, c.y + oy - 1); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  private drawRubble() {
    const { ctx } = this;
    for (const e of this.game.effects) {
      if (e.kind !== 'rubble' || this.game.tick - e.tick > e.dur) continue;
      const cx = Math.floor(e.x / LEPTONS - e.x2 / 2), cy = Math.floor(e.y / LEPTONS - e.y2 / 2);
      ctx.beginPath(); this.cellPath(ctx, cx, cy, e.x2, e.y2);
      ctx.fillStyle = 'rgba(30,24,18,0.55)'; ctx.fill();
    }
  }

  // ------------------------------------------------------------ entities

  private drawEntities(alpha: number) {
    const { game } = this;
    const viewer = game.players[this.viewer];
    const list: { e: Entity; depth: number; x: number; y: number }[] = [];
    for (const e of game.entities.values()) {
      if (e.hp <= 0) continue;
      const lx = e.px + (e.x - e.px) * alpha, ly = e.py + (e.y - e.py) * alpha;
      if (e.kind === 'unit' && e.owner !== this.viewer && viewer && !viewer.visible[game.cellOf(e)]) continue;
      if (e.kind === 'structure' && viewer && !viewer.explored[e.cy * game.map.w + e.cx]) continue;
      const depth = e.kind === 'structure' ? (e.cx + e.w) + (e.cy + e.h) - 0.5 : (lx + ly) / LEPTONS + (this.iso ? 0 : ly / LEPTONS);
      list.push({ e, depth: this.iso ? depth : (e.kind === 'structure' ? e.cy + e.h - 0.2 : ly / LEPTONS), x: lx, y: ly });
    }
    list.sort((a, b) => a.depth - b.depth || a.e.id - b.e.id);
    for (const item of list) {
      if (item.e.kind === 'structure') this.drawStructure(item.e);
      else this.drawUnit(item.e, item.x, item.y);
    }
  }

  private colors(owner: number) {
    const p = this.game.players[owner];
    return { main: p?.color ?? '#999', accent: p?.accent ?? '#ddd' };
  }

  private drawStructure(e: Entity) {
    const { ctx, game } = this;
    const def = game.pack.structures[e.type];
    const { main, accent } = this.colors(e.owner);
    const lowPower = !!def.needsPower && game.lowPower(e.owner);
    const grow = Math.min(1, (game.tick - e.born + 1) / 12);
    const height = (def.wall ? 10 : 14 + Math.min(def.w, def.h) * 7) * grow;
    // Footprint shadow and base.
    ctx.beginPath(); this.cellPath(ctx, e.cx, e.cy, e.w, e.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    const inset = 0.08;
    const corners = [this.project(e.cx + inset, e.cy + inset), this.project(e.cx + e.w - inset, e.cy + inset), this.project(e.cx + e.w - inset, e.cy + e.h - inset), this.project(e.cx + inset, e.cy + e.h - inset)];
    const top = corners.map(p => ({ x: p.x, y: p.y - height }));
    const wallTone = def.wall ? '#7a746a' : '#5a5650';
    // Visible side faces (south and east) then the roof.
    const face = (a: number, b: number, shade: string) => {
      ctx.beginPath(); ctx.moveTo(corners[a].x, corners[a].y); ctx.lineTo(corners[b].x, corners[b].y); ctx.lineTo(top[b].x, top[b].y); ctx.lineTo(top[a].x, top[a].y); ctx.closePath();
      ctx.fillStyle = shade; ctx.fill();
    };
    if (this.iso) { face(3, 2, shade(wallTone, -25)); face(2, 1, shade(wallTone, -10)); } else face(3, 2, shade(wallTone, -25));
    ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); for (let k = 1; k < 4; k++) ctx.lineTo(top[k].x, top[k].y); ctx.closePath();
    ctx.fillStyle = def.wall ? '#8d877c' : '#77736b'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    if (!def.wall) {
      // Faction trim along the roof edge.
      ctx.beginPath(); ctx.moveTo(top[3].x, top[3].y); ctx.lineTo(top[2].x, top[2].y); if (this.iso) ctx.lineTo(top[1].x, top[1].y);
      ctx.strokeStyle = main; ctx.lineWidth = 2.5; ctx.stroke();
    }
    const c = { x: (top[0].x + top[2].x) / 2, y: (top[0].y + top[2].y) / 2 };
    const s = Math.min(def.w, def.h) * (this.iso ? 9 : 10);
    this.structureDetail(def.shape, c.x, c.y, s, main, accent, e, lowPower);
    if (lowPower) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); for (let k = 1; k < 4; k++) ctx.lineTo(top[k].x, top[k].y); ctx.fill(); }
    if (e.repairing && this.frame % 30 < 18) this.icon('🔧', c.x, c.y - s - 4);
    if (this.selected.has(e.id) || this.hover === e.id) this.healthBar(c.x, top[0].y - 8, Math.max(24, s * 2), e.hp / e.maxHp, this.selected.has(e.id));
  }

  private structureDetail(shape: string, x: number, y: number, s: number, main: string, accent: string, e: Entity, off: boolean) {
    const { ctx } = this;
    const t = this.frame / 30;
    ctx.save();
    ctx.translate(x, y);
    switch (shape) {
      case 'conyard':
        ctx.fillStyle = '#5c5a55'; ctx.fillRect(-s * 0.7, -s * 0.2, s * 1.4, s * 0.6);
        ctx.strokeStyle = main; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.2); ctx.lineTo(-s * 0.1, -s * 0.9); ctx.lineTo(s * 0.6, -s * 0.7); ctx.stroke();
        ctx.fillStyle = accent; ctx.fillRect(s * 0.5, -s * 0.7, 4, s * 0.5);
        break;
      case 'windtrap': {
        ctx.fillStyle = '#4f5a5f'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const a = t * 3 + (k * Math.PI * 2) / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5); ctx.stroke(); }
        break;
      }
      case 'reactor':
        ctx.fillStyle = '#4d5357'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(120,200,255,${0.5 + 0.4 * Math.sin(t * 4)})`; ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2); ctx.fill();
        break;
      case 'refinery':
        ctx.fillStyle = '#6a6760'; ctx.beginPath(); ctx.arc(-s * 0.5, 0, s * 0.35, 0, Math.PI * 2); ctx.arc(s * 0.15, -s * 0.1, s * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = main; ctx.fillRect(-s * 0.9, s * 0.25, s * 1.8, 4);
        break;
      case 'barracks':
        ctx.fillStyle = shade(main, -15); ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.3); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.6, s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent; ctx.fillRect(s * 0.3, -s * 0.9, 2, s * 0.6); ctx.fillRect(s * 0.32, -s * 0.9, 8, 5);
        break;
      case 'silo':
        ctx.fillStyle = '#7c776d'; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = main; ctx.lineWidth = 2; ctx.stroke();
        break;
      case 'factory': case 'heavyfactory':
        ctx.fillStyle = '#3e3d3a'; ctx.fillRect(-s * 0.45, -s * 0.1, s * 0.9, s * 0.6);
        ctx.fillStyle = main; ctx.fillRect(-s * 0.75, -s * 0.55, s * 1.5, 5);
        if (shape === 'heavyfactory') { ctx.fillStyle = accent; ctx.fillRect(-s * 0.75, -s * 0.4, s * 0.3, s * 0.25); }
        break;
      case 'radar': {
        ctx.strokeStyle = off ? '#555' : accent; ctx.lineWidth = 3;
        const a = off ? 0.6 : t * 2;
        ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.5, s * 0.18, a, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#555'; ctx.fillRect(-2, -s * 0.2, 4, s * 0.5);
        break;
      }
      case 'lab':
        ctx.fillStyle = '#9fb8c4'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, Math.PI, 0); ctx.fill();
        ctx.fillStyle = main; ctx.fillRect(-s * 0.6, 0, s * 1.2, 4);
        break;
      case 'palace':
        ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.45, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(-s * 0.6, s * 0.1, s * 0.25, Math.PI, 0); ctx.arc(s * 0.6, s * 0.1, s * 0.25, Math.PI, 0); ctx.fill();
        ctx.fillStyle = main; ctx.fillRect(-2, -s * 0.9, 4, s * 0.4);
        break;
      case 'turret': case 'rocketturret': {
        const a = facingAngle(e.turret, this.iso);
        ctx.fillStyle = '#58554f'; ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(a); ctx.fillStyle = main; ctx.fillRect(0, -3, s * 0.9, 6);
        if (shape === 'rocketturret') { ctx.fillStyle = accent; ctx.fillRect(s * 0.2, -6, s * 0.4, 12); }
        break;
      }
      case 'prismtower': {
        ctx.fillStyle = '#4b5a66'; ctx.fillRect(-4, -s * 0.2, 8, s * 0.6);
        ctx.fillStyle = off ? '#5c6670' : `rgba(150,230,255,${0.75 + 0.25 * Math.sin(t * 5)})`;
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * 0.35, -s * 0.5); ctx.lineTo(0, -s * 0.2); ctx.lineTo(-s * 0.35, -s * 0.5); ctx.closePath(); ctx.fill();
        break;
      }
      case 'teslacoil': {
        ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, -s * 0.2 - k * 6, s * 0.35 - k * 2, 3, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = off ? '#666' : '#9fe6ff'; ctx.beginPath(); ctx.arc(0, -s * 0.2 - 28, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'wall': break;
      default:
        ctx.fillStyle = main; ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
    }
    ctx.restore();
  }

  private drawUnit(e: Entity, lx: number, ly: number) {
    const { ctx, game } = this;
    const def = game.pack.units[e.type];
    const p = this.project(lx / LEPTONS, ly / LEPTONS);
    const { main, accent } = this.colors(e.owner);
    const angle = facingAngle(e.facing, this.iso);
    const turret = facingAngle(e.turret, this.iso);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (this.selected.has(e.id)) {
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 2, def.kind === 'infantry' ? 7 : 15, def.kind === 'infantry' ? 4 : 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 3, def.kind === 'infantry' ? 5 : 12, def.kind === 'infantry' ? 3 : 7, 0, 0, Math.PI * 2); ctx.fill();
    const shape = def.shape;
    if (def.kind === 'infantry') {
      if (shape === 'dog') {
        ctx.rotate(angle); ctx.fillStyle = '#6b5136'; ctx.fillRect(-6, -3, 12, 6); ctx.fillRect(4, -2, 5, 4); ctx.fillStyle = main; ctx.fillRect(-1, -3, 2, 6);
      } else {
        const bob = (e.x !== e.px || e.y !== e.py) ? Math.sin(this.frame / 3 + e.id) * 1.2 : 0;
        ctx.fillStyle = shade(main, -30); ctx.fillRect(-2.5, -4 + bob, 5, 7);
        ctx.fillStyle = main; ctx.beginPath(); ctx.arc(0, -5 + bob, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9c9a0'; ctx.beginPath(); ctx.arc(0, -8.5 + bob, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(0, -4 + bob); ctx.rotate(angle);
        ctx.fillStyle = shape === 'infantry-rocket' ? accent : '#222';
        ctx.fillRect(0, -1, shape === 'infantry-rocket' ? 8 : 6, shape === 'infantry-rocket' ? 3 : 2);
        ctx.restore();
        if (shape === 'infantry-elite') { ctx.fillStyle = accent; ctx.fillRect(-3, -2 + bob, 6, 2); }
      }
    } else {
      ctx.rotate(angle);
      const big = shape === 'mcv' || shape === 'harvester' || shape === 'devastator';
      const L = big ? 17 : shape === 'trike' ? 9 : 13, Wd = big ? 11 : shape === 'trike' ? 5 : 9;
      // Tracks / wheels.
      ctx.fillStyle = '#23211f';
      ctx.fillRect(-L, -Wd - 2, L * 2, 4); ctx.fillRect(-L, Wd - 2, L * 2, 4);
      // Hull.
      ctx.fillStyle = shade(main, -10); ctx.fillRect(-L + 1, -Wd + 1, L * 2 - 2, Wd * 2 - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-L + 1, -Wd + 1, L * 2 - 2, 3);
      if (shape === 'harvester') {
        ctx.fillStyle = '#8c8578'; ctx.fillRect(-L + 2, -Wd + 3, L, Wd * 2 - 6);
        ctx.fillStyle = '#4c4840'; ctx.fillRect(L - 4, -Wd, 6, Wd * 2);
        const load = e.cargo / Math.max(1, def.harvester!.capacity);
        ctx.fillStyle = game.pack.resources[0].color; ctx.fillRect(-L + 3, -Wd + 4, (L - 2) * load, Wd * 2 - 8);
      } else if (shape === 'mcv') {
        ctx.fillStyle = '#9a958a'; ctx.fillRect(-L + 4, -Wd + 3, L * 1.4, Wd * 2 - 6);
        ctx.fillStyle = accent; ctx.fillRect(L - 8, -3, 6, 6);
      } else if (shape === 'trike' || shape === 'quad') {
        ctx.fillStyle = accent; ctx.fillRect(-2, -3, 6, 6);
        ctx.fillStyle = '#222'; ctx.fillRect(2, -1, L - 1, 2);
      } else {
        ctx.rotate(turret - angle);
        if (shape === 'prism') {
          ctx.fillStyle = '#8fd6f0'; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(9, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
        } else if (shape === 'sonic') {
          ctx.fillStyle = '#c7cfd6'; ctx.beginPath(); ctx.arc(2, 0, 7, -Math.PI / 2, Math.PI / 2); ctx.fill();
        } else if (shape === 'launcher') {
          ctx.fillStyle = shade(main, 15); ctx.fillRect(-6, -6, 14, 12);
          ctx.fillStyle = accent; for (let k = -1; k <= 1; k++) ctx.fillRect(4, k * 4 - 1, 6, 2);
        } else {
          const barrels = shape === 'devastator' ? 2 : 1;
          ctx.fillStyle = shade(main, 15); ctx.beginPath(); ctx.arc(0, 0, shape === 'devastator' ? 8 : 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2b2a28';
          for (let k = 0; k < barrels; k++) ctx.fillRect(3, barrels === 2 ? (k ? 2 : -4) : -1.5, shape === 'siege-turret' ? 18 : 14, barrels === 2 ? 2.5 : 3);
        }
      }
    }
    ctx.restore();
    if (e.convertedUntil) { ctx.fillStyle = 'rgba(120,255,120,0.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill(); }
    if (this.selected.has(e.id) || this.hover === e.id) this.healthBar(p.x, p.y - (def.kind === 'infantry' ? 16 : 20), def.kind === 'infantry' ? 14 : 26, e.hp / e.maxHp, this.selected.has(e.id));
  }

  private healthBar(x: number, y: number, w: number, frac: number, selected: boolean) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = frac > 0.5 ? '#3ed43e' : frac > 0.25 ? '#e6d33c' : '#e04a3a';
    ctx.fillRect(x - w / 2, y, Math.max(1, w * frac), 3);
    if (selected) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5; ctx.strokeRect(x - w / 2 - 1, y - 1, w + 2, 5); }
  }

  private icon(text: string, x: number, y: number) {
    this.ctx.font = '12px sans-serif'; this.ctx.textAlign = 'center'; this.ctx.fillText(text, x, y);
  }

  private drawWorms(alpha: number) {
    const { ctx, game } = this;
    const viewer = game.players[this.viewer];
    for (const w of game.worms) {
      if (w.hidden) continue;
      const lx = w.px + (w.x - w.px) * alpha, ly = w.py + (w.y - w.py) * alpha;
      if (viewer && !viewer.visible[game.cellIndex(Math.floor(lx / LEPTONS), Math.floor(ly / LEPTONS))]) continue;
      const p = this.project(lx / LEPTONS, ly / LEPTONS);
      const a = facingAngle(w.facing, this.iso);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      for (let k = 5; k >= 0; k--) {
        const wob = Math.sin(this.frame / 6 + k) * 2;
        ctx.fillStyle = `rgba(110,72,36,${0.25 + k * 0.08})`;
        ctx.beginPath(); ctx.ellipse(-k * 7, wob, 9 - k * 0.6, 6 - k * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#d9a35f'; ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawProjectiles() {
    const { ctx, game } = this;
    for (const pr of game.projectiles) {
      const w = game.pack.weapons[pr.weapon];
      const p = this.project(pr.x / LEPTONS, pr.y / LEPTONS);
      if (w.visual === 'missile') {
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(p.x - 2, p.y - 2 - 6, 4, 4);
        ctx.fillStyle = 'rgba(255,170,60,0.8)'; ctx.beginPath(); ctx.arc(p.x, p.y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (w.visual === 'artillery') {
        ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(p.x, p.y - 10, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private drawEffects() {
    const { ctx, game } = this;
    for (const fx of game.effects) {
      const age = game.tick - fx.tick;
      if (age > fx.dur || fx.kind === 'rubble') continue;
      const t = age / fx.dur;
      const a = this.project(fx.x / LEPTONS, fx.y / LEPTONS);
      const b = this.project(fx.x2 / LEPTONS, fx.y2 / LEPTONS);
      switch (fx.kind) {
        case 'bullet': case 'muzzle':
          ctx.strokeStyle = `rgba(255,240,170,${1 - t})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 4); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
          break;
        case 'prism':
          ctx.strokeStyle = `rgba(170,240,255,${1 - t})`; ctx.lineWidth = 5 * (1 - t) + 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 14); ctx.lineTo(b.x, b.y - 4); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${1 - t})`; ctx.lineWidth = 1.5; ctx.stroke();
          break;
        case 'tesla': {
          ctx.strokeStyle = `rgba(150,220,255,${1 - t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 16);
          const steps = 7;
          for (let k = 1; k <= steps; k++) {
            const jx = k === steps ? 0 : (Math.sin(fx.tick * 13 + k * 7 + this.frame) * 7);
            ctx.lineTo(a.x + ((b.x - a.x) * k) / steps + jx, a.y - 16 + ((b.y - 4 - (a.y - 16)) * k) / steps + jx * 0.5);
          }
          ctx.stroke();
          break;
        }
        case 'sonic':
          for (let k = 0; k < 4; k++) {
            const f = (t + k / 4) % 1;
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f - 4;
            ctx.strokeStyle = `rgba(220,230,255,${0.6 * (1 - t)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 6 + f * 6, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        case 'hit': case 'cannon':
          ctx.fillStyle = `rgba(255,220,120,${1 - t})`; ctx.beginPath(); ctx.arc(a.x, a.y - 4, 3 + t * 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'explosion': case 'bigExplosion': case 'death': case 'crush': case 'wormEat': {
          const r = (fx.kind === 'bigExplosion' ? 26 : fx.kind === 'wormEat' ? 20 : fx.kind === 'death' || fx.kind === 'crush' ? 6 : 13) * (0.4 + t);
          ctx.fillStyle = fx.kind === 'wormEat' ? `rgba(190,140,70,${1 - t})` : `rgba(255,${140 + (1 - t) * 90},40,${1 - t})`;
          ctx.beginPath(); ctx.arc(a.x, a.y - 4, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(40,35,30,${0.5 * (1 - t)})`; ctx.beginPath(); ctx.arc(a.x + 3, a.y - 8 - t * 10, r * 0.7, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'chrono': case 'convert': case 'bloom': case 'build': case 'sell': case 'denied': case 'wormDive': {
          const color = fx.kind === 'chrono' ? '120,190,255' : fx.kind === 'convert' ? '130,255,120' : fx.kind === 'bloom' ? '240,140,60' : fx.kind === 'denied' ? '255,80,60' : '230,220,200';
          ctx.strokeStyle = `rgba(${color},${1 - t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(a.x, a.y - 4, 6 + t * 18, 0, Math.PI * 2); ctx.stroke();
          break;
        }
      }
    }
  }

  private drawMarkers() {
    const now = performance.now();
    this.markers = this.markers.filter(m => m.until > now);
    for (const m of this.markers) {
      const p = this.project(m.cx + 0.5, m.cy + 0.5);
      const t = (m.until - now) / 450;
      this.ctx.strokeStyle = m.color; this.ctx.lineWidth = 2;
      this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y, 4 + 10 * t, (4 + 10 * t) * (this.iso ? 0.5 : 1), 0, 0, Math.PI * 2); this.ctx.stroke();
    }
  }

  private drawGhost() {
    if (!this.ghost) return;
    const { ctx, game } = this;
    const def = game.pack.structures[this.ghost.item];
    if (!def) return;
    const player = game.players[this.viewer];
    const ok = game.canPlace(player, def.id, this.ghost.x, this.ghost.y);
    for (let y = this.ghost.y; y < this.ghost.y + def.h; y++) for (let x = this.ghost.x; x < this.ghost.x + def.w; x++) {
      ctx.beginPath(); this.cellPath(ctx, x, y);
      ctx.fillStyle = ok ? 'rgba(80,230,80,0.45)' : 'rgba(240,60,50,0.45)'; ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(160,255,160,0.8)' : 'rgba(255,140,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  private drawShroud(view: { minX: number; maxX: number; minY: number; maxY: number }) {
    const { ctx, game } = this;
    const viewer = game.players[this.viewer];
    if (!viewer) return;
    const dark = new Path2D(), fog = new Path2D();
    const w = game.map.w;
    for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
      const i = y * w + x;
      if (!viewer.explored[i]) this.cellPath(dark, x, y);
      else if (!viewer.visible[i]) this.cellPath(fog, x, y);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(fog);
    ctx.fillStyle = '#000'; ctx.fill(dark);
    // Overdraw edge seams so the iso shroud has no hairline gaps.
    if (this.iso) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(dark); }
  }

  private drawOverlays(_alpha: number) {
    if (!this.dragBox) return;
    const { ctx } = this;
    const b = this.dragBox;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.min(b.x1, b.x2) + 0.5, Math.min(b.y1, b.y2) + 0.5, Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
  }

  // ------------------------------------------------------------ minimap

  drawMinimap(target: HTMLCanvasElement, radar: boolean) {
    const g = target.getContext('2d')!;
    const { game } = this;
    const { w, h } = game.map;
    const viewer = game.players[this.viewer];
    const W = target.width, H = target.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (!radar) {
      for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(120,140,110,${(k * 37 + this.frame) % 7 / 14})`; g.fillRect((k * 53 + this.frame * 3) % W, (k * 29) % H, 2, 1); }
      return;
    }
    const sx = W / w, sy = H / h;
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      let color = '#000';
      if (!viewer || viewer.explored[i]) {
        const res = game.map.resKind[i];
        color = res ? game.pack.resources[res - 1].color : game.pack.terrains[game.map.terrain[i]].color;
      }
      const n = parseInt(color.slice(1), 16);
      const k = i * 4;
      const dim = viewer && viewer.explored[i] && !viewer.visible[i] ? 0.6 : 1;
      img.data[k] = ((n >> 16) & 255) * dim; img.data[k + 1] = ((n >> 8) & 255) * dim; img.data[k + 2] = (n & 255) * dim; img.data[k + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, W, H);
    for (const e of game.entities.values()) {
      if (e.hp <= 0) continue;
      const cell = game.cellOf(e);
      if (e.owner !== this.viewer && viewer && !(e.kind === 'structure' ? viewer.explored[cell] : viewer.visible[cell])) continue;
      g.fillStyle = this.colors(e.owner).main;
      if (e.kind === 'structure') g.fillRect(e.cx * sx, e.cy * sy, Math.max(2, e.w * sx), Math.max(2, e.h * sy));
      else g.fillRect(Math.floor(e.x / LEPTONS) * sx, Math.floor(e.y / LEPTONS) * sy, Math.max(2, sx), Math.max(2, sy));
    }
    // Camera footprint in cell space.
    const z = this.camera.zoom;
    const pts = [[0, 0], [this.canvas.width, 0], [this.canvas.width, this.canvas.height], [0, this.canvas.height]]
      .map(([px, py]) => this.unproject(px / z + this.camera.x, py / z + this.camera.y));
    g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.cx * sx, p.cy * sy) : g.moveTo(p.cx * sx, p.cy * sy)));
    g.closePath(); g.stroke();
  }

  /** Center the camera on a minimap click. */
  minimapJump(fx: number, fy: number) {
    this.centerOn(fx * this.game.map.w, fy * this.game.map.h);
  }
}

/** Screen angle (radians, 0 = +x) for a C&C facing, in either projection. */
export function facingAngle(facing: number, iso: boolean): number {
  const th = (facing / 256) * Math.PI * 2;
  const dx = Math.sin(th), dy = -Math.cos(th);
  if (!iso) return Math.atan2(dy, dx);
  return Math.atan2((dx + dy) * (ISO_H / 2), (dx - dy) * (ISO_W / 2));
}

/** Smooth value noise in 0..1 with ~4-cell patches, for gentle colour variation. */
function smoothNoise(x: number, y: number, seed: number): number {
  const lattice = (ix: number, iy: number) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fx = x / 4, fy = y / 4;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = lattice(x0, y0), b = lattice(x0 + 1, y0), c = lattice(x0, y0 + 1), d = lattice(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function mix(c1: string, c2: string, f: number): string {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, c + amount));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Draw a small sidebar icon for a unit or structure (procedural, faction-coloured). */
export function drawIcon(target: HTMLCanvasElement, game: Game, item: string, color: string, accent: string) {
  const g = target.getContext('2d')!;
  const W = target.width, H = target.height;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#2b3238'); grad.addColorStop(1, '#14181c');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2 + 2);
  const unit = game.pack.units[item];
  const s = game.pack.structures[item];
  if (s) {
    const bw = Math.min(W * 0.8, 14 + s.w * 10), bh = Math.min(H * 0.7, 10 + s.h * 8);
    g.fillStyle = '#5a5650'; g.fillRect(-bw / 2, -bh / 2 + 6, bw, bh - 6);
    g.fillStyle = '#77736b'; g.fillRect(-bw / 2, -bh / 2, bw, bh - 6);
    g.fillStyle = s.floor ? '#8f8a80' : color; g.fillRect(-bw / 2, bh / 2 - 9, bw, 3);
    if (s.weapon) { g.fillStyle = accent; g.fillRect(0, -bh / 2, bw / 2, 4); }
    if (s.power > 0) { g.fillStyle = '#f3e15b'; g.beginPath(); g.moveTo(2, -10); g.lineTo(-4, 1); g.lineTo(1, 1); g.lineTo(-2, 10); g.lineTo(5, -2); g.lineTo(0, -2); g.closePath(); g.fill(); }
  } else if (unit) {
    if (unit.kind === 'infantry') {
      g.fillStyle = color; g.beginPath(); g.arc(0, -2, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e9c9a0'; g.beginPath(); g.arc(0, -11, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = shade(color, -30); g.fillRect(-5, 3, 10, 9);
      g.fillStyle = unit.shape === 'infantry-rocket' ? accent : '#222'; g.fillRect(3, -4, 12, 3);
    } else {
      g.fillStyle = '#23211f'; g.fillRect(-18, -11, 36, 4); g.fillRect(-18, 7, 36, 4);
      g.fillStyle = shade(color, -10); g.fillRect(-17, -9, 34, 18);
      if (unit.harvester) { g.fillStyle = '#8c8578'; g.fillRect(-15, -6, 16, 12); }
      else if (unit.deploysTo) { g.fillStyle = '#9a958a'; g.fillRect(-12, -6, 22, 12); }
      else { g.fillStyle = shade(color, 15); g.beginPath(); g.arc(-2, 0, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2b2a28'; g.fillRect(3, -2, 16, 4); }
    }
  }
  g.restore();
}
