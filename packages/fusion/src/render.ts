// Canvas renderer for the Fusion Engine. One implementation, two projections:
// top-down 3/4 view (Dune) and 2:1 isometric (RA2). Terrain is painted per pixel with
// relief lighting; buildings and vehicles are 3D-forged sprites (see ./art). All art is
// original and procedural; sprites are chosen by `shape` key so they can be replaced.
import { LEPTONS } from './core';
import type { Entity, Game } from './game';
import { ISO_VIEW, ORTHO_VIEW, RGB, Sprite, View, bake, hexToRgb } from './art/forge';
import { ArtStyle, buildingMesh, crystalMesh, defenseTurretMesh, hasTurret, hullMesh, styleFor, treeMesh, turretMesh, wallMesh } from './art/models';
import { concreteTile, materials, paintTerrain, spiceSprite } from './art/terrain';

export interface Camera { x: number; y: number; zoom: number }
export interface Ghost { item: string; x: number; y: number }

const FACINGS = 32;

export class FusionRenderer {
  readonly iso: boolean;
  readonly view: View;
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
  private terrainReady = false;
  private shroud: HTMLCanvasElement;
  private originX = 0;
  private frame = 0;
  private sprites = new Map<string, Sprite>();
  private tiles = new Map<string, HTMLCanvasElement>();

  constructor(private canvas: HTMLCanvasElement, private game: Game, public viewer: number) {
    this.iso = game.pack.projection === 'iso';
    this.view = this.iso ? ISO_VIEW : ORTHO_VIEW;
    this.ctx = canvas.getContext('2d')!;
    this.originX = this.iso ? game.map.h * (this.view.tileW / 2) : 0;
    this.terrain = document.createElement('canvas');
    const size = this.worldSize();
    this.terrain.width = size.w; this.terrain.height = size.h;
    this.shroud = document.createElement('canvas');
    this.shroud.width = game.map.w; this.shroud.height = game.map.h;
  }

  // ------------------------------------------------------------ projection

  worldSize() {
    const { w, h } = this.game.map;
    return this.iso ? { w: (w + h) * (this.view.tileW / 2), h: (w + h) * (this.view.tileH / 2) } : { w: w * this.view.tileW, h: h * this.view.tileH };
  }

  /** Cell-space (fractional cells) to world pixels. */
  project(cx: number, cy: number): { x: number; y: number } {
    if (!this.iso) return { x: cx * this.view.tileW, y: cy * this.view.tileH };
    return { x: this.originX + (cx - cy) * (this.view.tileW / 2), y: (cx + cy) * (this.view.tileH / 2) };
  }

  /** World pixels to fractional cells. */
  unproject(wx: number, wy: number): { cx: number; cy: number } {
    if (!this.iso) return { cx: wx / this.view.tileW, cy: wy / this.view.tileH };
    const a = (wx - this.originX) / (this.view.tileW / 2), b = wy / (this.view.tileH / 2);
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

  // ------------------------------------------------------------ sprite cache

  private style(owner: number): ArtStyle { return styleFor(this.game.pack.id, this.game.players[owner]?.side ?? ''); }
  private teamColor(owner: number): RGB { return hexToRgb(this.game.players[owner]?.color ?? '#9a9a9a'); }

  private sprite(key: string, make: () => Sprite): Sprite {
    let s = this.sprites.get(key);
    if (!s) { s = make(); this.sprites.set(key, s); }
    return s;
  }

  private blit(s: Sprite, wx: number, wy: number, alpha = 1) {
    if (alpha < 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.canvas, Math.round(wx - s.ox), Math.round(wy - s.oy));
    if (alpha < 1) this.ctx.globalAlpha = 1;
  }

  /** Facing (0..255, 0 = north) to a model rotation (model points +X). */
  private rot(facing: number) {
    const f = (Math.round(facing / (256 / FACINGS)) % FACINGS) * (256 / FACINGS);
    return { key: f, angle: (f / 256) * Math.PI * 2 - Math.PI / 2 };
  }

  // ------------------------------------------------------------ frame

  draw(alpha: number) {
    const { ctx, canvas } = this;
    this.frame++;
    if (!this.terrainReady) { paintTerrain(this.terrain, this.game.map, this.game.pack, this.view, this.originX); this.terrainReady = true; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = this.camera.zoom;
    ctx.setTransform(z, 0, 0, z, -this.camera.x * z, -this.camera.y * z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, 0, 0);
    const view = this.visibleCells();
    this.drawConcrete(view);
    this.drawResources(view);
    this.drawRubble();
    this.drawGhost();
    this.drawScene(alpha, view);
    this.drawWorms(alpha);
    this.drawProjectiles();
    this.drawEffects();
    this.drawMarkers();
    this.drawShroud();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOverlays();
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
    if (!this.iso) { ctx.rect(x * this.view.tileW, y * this.view.tileH, w * this.view.tileW, h * this.view.tileH); return; }
    const a = this.project(x, y), b = this.project(x + w, y), c = this.project(x + w, y + h), d = this.project(x, y + h);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  /** Top-left anchor of a cell's tile image. */
  private tileOrigin(x: number, y: number) {
    const p = this.project(x, y);
    return this.iso ? { x: p.x - this.view.tileW / 2, y: p.y } : p;
  }

  // ------------------------------------------------------------ ground layer

  private drawConcrete(view: { minX: number; maxX: number; minY: number; maxY: number }) {
    const { game } = this;
    const viewer = game.players[this.viewer];
    let tile = this.tiles.get('concrete');
    if (!tile) { tile = concreteTile(this.view); this.tiles.set('concrete', tile); }
    for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
      const i = y * game.map.w + x;
      if (!game.map.concrete[i] || viewer && !viewer.explored[i]) continue;
      const o = this.tileOrigin(x, y);
      this.ctx.drawImage(tile, o.x, o.y);
    }
  }

  private drawResources(view: { minX: number; maxX: number; minY: number; maxY: number }) {
    const { ctx, game } = this;
    const { w, res, resKind, decor } = game.map;
    const viewer = game.players[this.viewer];
    for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
      const i = y * w + x;
      if (!resKind[i] || viewer && !viewer.explored[i]) continue;
      const def = game.pack.resources[resKind[i] - 1];
      const level = Math.min(3, Math.floor((res[i] * 4) / (def.max + 1)));
      const variant = decor[i] & 3;
      const c = this.project(x + 0.5, y + 0.5);
      if (def.id === 'spice') {
        const key = `spice|${level}|${variant}`;
        let t = this.tiles.get(key);
        if (!t) { t = spiceSprite(level, variant, this.view); this.tiles.set(key, t); }
        ctx.drawImage(t, c.x - t.width / 2, c.y - t.height / 2);
      } else {
        const s = this.sprite(`crystal|${def.id}|${level}|${variant}`, () => bake(crystalMesh(hexToRgb(def.color), 2 + level * 2, variant * 7 + level + 1), this.view, undefined, { shadow: true }));
        const o = this.project(x, y);
        this.blit(s, o.x, o.y);
      }
    }
  }

  private drawRubble() {
    const { ctx } = this;
    for (const e of this.game.effects) {
      if (e.kind !== 'rubble' || this.game.tick - e.tick > e.dur) continue;
      const cx = Math.floor(e.x / LEPTONS - e.x2 / 2), cy = Math.floor(e.y / LEPTONS - e.y2 / 2);
      ctx.beginPath(); this.cellPath(ctx, cx, cy, e.x2, e.y2);
      ctx.fillStyle = 'rgba(40,30,22,0.5)'; ctx.fill();
      for (let k = 0; k < e.x2 * e.y2 * 3; k++) {
        const p = this.project(cx + ((k * 0.37) % e.x2), cy + ((k * 0.61) % e.y2));
        ctx.fillStyle = k % 2 ? 'rgba(70,62,54,0.8)' : 'rgba(110,100,88,0.8)';
        ctx.fillRect(p.x, p.y, 3, 2);
      }
    }
  }

  // ------------------------------------------------------------ scene (depth-sorted)

  private drawScene(alpha: number, view: { minX: number; maxX: number; minY: number; maxY: number }) {
    const { game } = this;
    const viewer = game.players[this.viewer];
    const items: { depth: number; draw: () => void }[] = [];
    const depthOf = (cx: number, cy: number) => this.iso ? cx + cy : cy;
    for (const e of game.entities.values()) {
      if (e.hp <= 0) continue;
      if (e.kind === 'unit') {
        if (e.owner !== this.viewer && viewer && !viewer.visible[game.cellOf(e)]) continue;
        const lx = e.px + (e.x - e.px) * alpha, ly = e.py + (e.y - e.py) * alpha;
        items.push({ depth: depthOf(lx / LEPTONS, ly / LEPTONS), draw: () => this.drawUnit(e, lx, ly) });
      } else {
        if (viewer && !viewer.explored[e.cy * game.map.w + e.cx]) continue;
        items.push({ depth: depthOf(e.cx + e.w - 0.5, e.cy + e.h - 0.5) - 0.01, draw: () => this.drawStructure(e) });
      }
    }
    // Trees are scenery that units can stand behind.
    const treeT = game.pack.terrains.findIndex(t => t.id === 'trees');
    if (treeT >= 0) {
      for (let y = view.minY; y <= view.maxY; y++) for (let x = view.minX; x <= view.maxX; x++) {
        const i = y * game.map.w + x;
        if (game.map.terrain[i] !== treeT || viewer && !viewer.explored[i]) continue;
        const v = game.map.decor[i];
        items.push({ depth: depthOf(x + 0.5, y + 0.5), draw: () => {
          const s = this.sprite(`tree|${v % 4}`, () => bake(treeMesh(v % 4), this.view));
          const p = this.project(x + ((v >> 2) & 3) * 0.05 - 0.05, y + ((v >> 4) & 3) * 0.05 - 0.05);
          this.blit(s, p.x, p.y);
        } });
      }
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();
  }

  private drawStructure(e: Entity) {
    const { ctx, game } = this;
    const def = game.pack.structures[e.type];
    const style = this.style(e.owner), team = this.teamColor(e.owner);
    const color = game.players[e.owner]?.color ?? '';
    const origin = this.project(e.cx, e.cy);
    const grow = Math.min(1, (game.tick - e.born + 1) / 14);
    const off = !!def.needsPower && game.lowPower(e.owner);
    if (def.wall) {
      const map = game.map;
      const same = (dx: number, dy: number) => {
        const id = map.occupied[(e.cy + dy) * map.w + e.cx + dx];
        const n = id ? game.entities.get(id) : undefined;
        return !!n && n.owner === e.owner && !!game.pack.structures[n.type].wall;
      };
      const mask = (e.cy > 0 && same(0, -1) ? 1 : 0) | (e.cx < map.w - 1 && same(1, 0) ? 2 : 0) | (e.cy < map.h - 1 && same(0, 1) ? 4 : 0) | (e.cx > 0 && same(-1, 0) ? 8 : 0);
      const s = this.sprite(`wall|${style}|${mask}`, () => bake(wallMesh(mask, style), this.view));
      this.blit(s, origin.x, origin.y, grow);
    } else {
      const s = this.sprite(`b|${def.shape}|${def.w}x${def.h}|${style}|${color}`, () => bake(buildingMesh(def.shape, def.w, def.h, style, team), this.view));
      this.blit(s, origin.x, origin.y, grow);
      this.structureDetail(e, def.shape, style, team, color, off);
    }
    if (off) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); this.cellPath(ctx, e.cx, e.cy, e.w, e.h); ctx.fill();
    }
    // Damaged buildings smoke and burn.
    if (e.hp < e.maxHp * 0.5) {
      const c = this.project(e.cx + e.w * 0.55, e.cy + e.h * 0.45);
      for (let k = 0; k < 3; k++) {
        const t = ((this.frame + k * 20 + e.id * 7) % 60) / 60;
        ctx.fillStyle = `rgba(50,46,42,${0.45 * (1 - t)})`;
        ctx.beginPath(); ctx.arc(c.x + k * 5 - 5 + t * 6, c.y - 16 - t * 26, 4 + t * 7, 0, Math.PI * 2); ctx.fill();
      }
      if (e.hp < e.maxHp * 0.25) { ctx.fillStyle = `rgba(255,${120 + (this.frame % 8) * 12},40,0.8)`; ctx.beginPath(); ctx.arc(c.x, c.y - 10, 3 + (this.frame % 5), 0, Math.PI * 2); ctx.fill(); }
    }
    if (e.repairing && this.frame % 30 < 18) {
      const c = this.project(e.cx + e.w / 2, e.cy + e.h / 2);
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔧', c.x, c.y - 30);
    }
    if (this.selected.has(e.id)) this.brackets(e);
    if (this.selected.has(e.id) || this.hover === e.id) {
      const top = this.project(e.cx + e.w / 2, e.cy);
      this.healthBar(top.x, top.y - (this.iso ? 46 : 36), Math.max(26, e.w * 14), e.hp / e.maxHp, this.selected.has(e.id));
    }
  }

  /** Moving parts on top of the baked building sprite. */
  private structureDetail(e: Entity, shape: string, style: ArtStyle, team: RGB, color: string, off: boolean) {
    const { ctx } = this;
    const t = this.frame / 30;
    const zs = this.view.zScale;
    if (shape === 'turret' || shape === 'rocketturret') {
      if (shape === 'turret' && style === 'allied') return; // The Allied pillbox has no visible gun.
      const r = this.rot(e.turret);
      const s = this.sprite(`dt|${shape}|${style}|${color}|${r.key}`, () => bake(defenseTurretMesh(shape, style, team).rotated(r.angle), this.view, undefined, { shadow: false }));
      const c = this.project(e.cx + 0.5, e.cy + 0.5);
      this.blit(s, c.x, c.y);
    } else if (shape === 'radar') {
      const soviet = style === 'soviet';
      const c = this.project(e.cx + (soviet ? 1 : e.w - 0.6), e.cy + (soviet ? 1 : 0.65));
      const zTop = soviet ? 1.62 : 1.05;
      const y = c.y - zTop * zs;
      const a = off ? 0.5 : t * 1.6;
      ctx.save(); ctx.translate(c.x, y);
      ctx.fillStyle = '#5b5e62'; ctx.fillRect(-1.5, -4, 3, 6);
      ctx.rotate(Math.sin(a) * 0.9);
      ctx.fillStyle = '#d6d9dc'; ctx.strokeStyle = '#6f7378'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, -6, 10, 5, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (shape === 'windtrap' && style === 'dune') {
      const c = this.project(e.cx + 1, e.cy + 1);
      ctx.fillStyle = `rgba(${team.join(',')},${0.5 + 0.4 * Math.sin(t * 3)})`;
      ctx.beginPath(); ctx.arc(c.x, c.y - 1.4 * zs, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if ((shape === 'reactor' || shape === 'teslacoil') && !off) {
      const c = shape === 'reactor' ? this.project(e.cx + 1, e.cy + 1) : this.project(e.cx + 0.5, e.cy + 0.5);
      const zTop = shape === 'reactor' ? 1.6 : 1.68;
      const g = this.ctx.createRadialGradient(c.x, c.y - zTop * zs, 0, c.x, c.y - zTop * zs, 16);
      g.addColorStop(0, `rgba(190,240,255,${0.55 + 0.3 * Math.sin(t * 6)})`); g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y - zTop * zs, 16, 0, Math.PI * 2); ctx.fill();
      if (this.frame % 40 < 4) {
        ctx.strokeStyle = 'rgba(200,240,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(c.x, c.y - zTop * zs);
        for (let k = 1; k < 5; k++) ctx.lineTo(c.x + Math.sin(this.frame + k * 3) * 9, c.y - zTop * zs + k * 4);
        ctx.stroke();
      }
    } else if (shape === 'prismtower' && !off) {
      const c = this.project(e.cx + 0.5, e.cy + 0.5);
      const g = this.ctx.createRadialGradient(c.x, c.y - 1.8 * zs, 0, c.x, c.y - 1.8 * zs, 14);
      g.addColorStop(0, `rgba(200,250,255,${0.45 + 0.3 * Math.sin(t * 4)})`); g.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y - 1.8 * zs, 14, 0, Math.PI * 2); ctx.fill();
    }
  }

  private brackets(e: Entity) {
    const { ctx } = this;
    const pts = [this.project(e.cx, e.cy), this.project(e.cx + e.w, e.cy), this.project(e.cx + e.w, e.cy + e.h), this.project(e.cx, e.cy + e.h)];
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
    pts.forEach((p, i) => {
      const a = pts[(i + 3) % 4], b = pts[(i + 1) % 4];
      ctx.beginPath();
      ctx.moveTo(p.x + (a.x - p.x) * 0.2, p.y + (a.y - p.y) * 0.2); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + (b.x - p.x) * 0.2, p.y + (b.y - p.y) * 0.2);
      ctx.stroke();
    });
  }

  private drawUnit(e: Entity, lx: number, ly: number) {
    const { ctx, game } = this;
    const def = game.pack.units[e.type];
    const p = this.project(lx / LEPTONS, ly / LEPTONS);
    const style = this.style(e.owner), team = this.teamColor(e.owner);
    const color = game.players[e.owner]?.color ?? '';
    if (def.kind === 'infantry') this.drawInfantry(e, def.shape, p.x, p.y, color);
    else {
      const hull = this.rot(e.facing);
      const hs = this.sprite(`h|${def.shape}|${style}|${color}|${hull.key}`, () => bake(hullMesh(def.shape, style, team).rotated(hull.angle), this.view));
      this.blit(hs, p.x, p.y);
      if (hasTurret(def.shape)) {
        const tr = this.rot(e.turret);
        const ts = this.sprite(`t|${def.shape}|${style}|${color}|${tr.key}`, () => bake(turretMesh(def.shape, style, team).rotated(tr.angle), this.view, undefined, { shadow: false }));
        this.blit(ts, p.x, p.y);
      }
      if (def.harvester && e.cargo > 0) {
        ctx.fillStyle = game.pack.resources[0].color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 0.6 * this.view.zScale, 6 * Math.min(1, e.cargo / def.harvester.capacity) + 1, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (e.convertedUntil) { ctx.fillStyle = 'rgba(120,255,120,0.22)'; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 14, 0, Math.PI * 2); ctx.fill(); }
    if (this.selected.has(e.id)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
      const r = def.kind === 'infantry' ? 7 : 15;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, r, this.iso ? r * 0.5 : r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.selected.has(e.id) || this.hover === e.id) this.healthBar(p.x, p.y - (def.kind === 'infantry' ? 18 : 24), def.kind === 'infantry' ? 14 : 26, e.hp / e.maxHp, this.selected.has(e.id));
  }

  private drawInfantry(e: Entity, shape: string, x: number, y: number, color: string) {
    const { ctx } = this;
    const moving = e.x !== e.px || e.y !== e.py;
    const step = moving ? Math.sin((this.frame + e.id * 5) / 3) : 0;
    const dir = facingAngle(e.facing, this.iso);
    const cos = Math.cos(dir), sin = Math.sin(dir);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 1, shape === 'dog' ? 6 : 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (shape === 'dog') {
      ctx.save(); ctx.translate(x, y - 3); ctx.rotate(dir);
      ctx.fillStyle = '#6e5133'; ctx.fillRect(-6, -2, 11, 4);
      ctx.fillRect(4, -2.5, 4, 4); ctx.fillStyle = '#4b361f';
      for (const lx of [-5, 3]) { ctx.fillRect(lx, 2, 1.5, 2 + step); ctx.fillRect(lx, -4, 1.5, 2 - step); }
      ctx.fillStyle = color; ctx.fillRect(1, -2, 1.5, 4);
      ctx.restore();
      return;
    }
    const dark = shade(color, -55), mid = shade(color, -20);
    // Legs.
    ctx.strokeStyle = '#3d3a33'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - 5); ctx.lineTo(x - 1.5 + step * 1.6, y);
    ctx.moveTo(x + 1, y - 5); ctx.lineTo(x + 1.5 - step * 1.6, y);
    ctx.stroke();
    // Body with light from the north-west.
    const g = ctx.createLinearGradient(x - 3, y - 11, x + 3, y - 4);
    g.addColorStop(0, shade(color, 30)); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 7.5, 3, 3.8, 0, 0, Math.PI * 2); ctx.fill();
    // Head and helmet.
    ctx.fillStyle = '#e2bf94'; ctx.beginPath(); ctx.arc(x, y - 12, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shape === 'infantry-elite' ? '#222' : mid;
    ctx.beginPath(); ctx.arc(x, y - 12.6, 2.2, Math.PI, Math.PI * 2); ctx.fill();
    // Weapon pointing along the facing.
    ctx.strokeStyle = shape === 'infantry-rocket' ? '#6f7a62' : '#1e1e1e';
    ctx.lineWidth = shape === 'infantry-rocket' ? 2.4 : 1.4;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + cos * 7, y - 8 + sin * (this.iso ? 3.5 : 5)); ctx.stroke();
    if (e.cooldown > (this.game.weaponOf(e)?.rof ?? 0) - 2) {
      ctx.fillStyle = 'rgba(255,230,140,0.95)'; ctx.beginPath(); ctx.arc(x + cos * 8, y - 8 + sin * (this.iso ? 4 : 6), 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  private healthBar(x: number, y: number, w: number, frac: number, selected: boolean) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = frac > 0.5 ? '#3ed43e' : frac > 0.25 ? '#e6d33c' : '#e04a3a';
    ctx.fillRect(x - w / 2, y, Math.max(1, w * frac), 3);
    if (selected) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5; ctx.strokeRect(x - w / 2 - 1, y - 1, w + 2, 5); }
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
      // Churned sand trail and the worm's ridged back breaking the surface.
      for (let k = 7; k >= 0; k--) {
        const wob = Math.sin(this.frame / 6 + k) * 2.2;
        ctx.fillStyle = `rgba(150,108,62,${0.18 + k * 0.03})`;
        ctx.beginPath(); ctx.ellipse(-k * 8, wob, 12 - k * 0.8, 7 - k * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = k % 2 ? '#9b6a3c' : '#b98652';
        ctx.beginPath(); ctx.ellipse(-k * 6, Math.sin(this.frame / 6 + k) * 1.5, 5.5 - k * 0.5, 4 - k * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawProjectiles() {
    const { ctx, game } = this;
    for (const pr of game.projectiles) {
      const w = game.pack.weapons[pr.weapon];
      const p = this.project(pr.x / LEPTONS, pr.y / LEPTONS);
      if (w.visual === 'missile') {
        ctx.fillStyle = 'rgba(255,170,60,0.5)'; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(p.x - 1.5, p.y - 9.5, 3, 3);
      } else if (w.visual === 'artillery') {
        ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 2.6, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(p.x, p.y - 6, 1.8, 0, Math.PI * 2); ctx.fill();
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
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
          break;
        case 'prism':
          ctx.strokeStyle = `rgba(170,240,255,${1 - t})`; ctx.lineWidth = 5 * (1 - t) + 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 30); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${1 - t})`; ctx.lineWidth = 1.5; ctx.stroke();
          break;
        case 'tesla': {
          ctx.strokeStyle = `rgba(150,220,255,${1 - t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 22);
          const steps = 7;
          for (let k = 1; k <= steps; k++) {
            const jx = k === steps ? 0 : (Math.sin(fx.tick * 13 + k * 7 + this.frame) * 7);
            ctx.lineTo(a.x + ((b.x - a.x) * k) / steps + jx, a.y - 22 + ((b.y - 5 - (a.y - 22)) * k) / steps + jx * 0.5);
          }
          ctx.stroke();
          break;
        }
        case 'sonic':
          for (let k = 0; k < 4; k++) {
            const f = (t + k / 4) % 1;
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f - 6;
            ctx.strokeStyle = `rgba(220,230,255,${0.6 * (1 - t)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 6 + f * 6, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        case 'hit': case 'cannon':
          ctx.fillStyle = `rgba(255,220,120,${1 - t})`; ctx.beginPath(); ctx.arc(a.x, a.y - 5, 3 + t * 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'explosion': case 'bigExplosion': case 'death': case 'crush': case 'wormEat': {
          const big = fx.kind === 'bigExplosion';
          const r = (big ? 30 : fx.kind === 'wormEat' ? 22 : fx.kind === 'death' || fx.kind === 'crush' ? 6 : 15) * (0.35 + t);
          if (fx.kind === 'wormEat') {
            ctx.fillStyle = `rgba(170,120,64,${1 - t})`; ctx.beginPath(); ctx.arc(a.x, a.y - 4, r, 0, Math.PI * 2); ctx.fill();
            break;
          }
          // Fireball with a bright core, then rolling smoke.
          const g = ctx.createRadialGradient(a.x, a.y - 6, 0, a.x, a.y - 6, r);
          g.addColorStop(0, `rgba(255,250,210,${1 - t})`); g.addColorStop(0.35, `rgba(255,180,60,${0.95 * (1 - t)})`);
          g.addColorStop(0.75, `rgba(210,80,20,${0.7 * (1 - t)})`); g.addColorStop(1, 'rgba(120,40,10,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y - 6, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(45,40,36,${0.45 * t * (1 - t) * 3})`;
          ctx.beginPath(); ctx.arc(a.x + 3, a.y - 10 - t * 16, r * 0.8, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'chrono': case 'convert': case 'bloom': case 'build': case 'sell': case 'denied': case 'wormDive': {
          const color = fx.kind === 'chrono' ? '120,190,255' : fx.kind === 'convert' ? '130,255,120' : fx.kind === 'bloom' ? '240,140,60' : fx.kind === 'denied' ? '255,80,60' : '230,220,200';
          ctx.strokeStyle = `rgba(${color},${1 - t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(a.x, a.y - 4, 6 + t * 18, (6 + t * 18) * (this.iso ? 0.5 : 1), 0, 0, Math.PI * 2); ctx.stroke();
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
      ctx.fillStyle = ok ? 'rgba(80,230,80,0.35)' : 'rgba(240,60,50,0.4)'; ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(160,255,160,0.8)' : 'rgba(255,140,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (ok && !def.floor && !def.wall) {
      const style = this.style(this.viewer), team = this.teamColor(this.viewer);
      const color = player?.color ?? '';
      const s = this.sprite(`b|${def.shape}|${def.w}x${def.h}|${style}|${color}`, () => bake(buildingMesh(def.shape, def.w, def.h, style, team), this.view));
      const o = this.project(this.ghost.x, this.ghost.y);
      this.blit(s, o.x, o.y, 0.55);
    }
  }

  /** Shroud and fog as a 1-pixel-per-cell mask, smoothly scaled so edges are soft. */
  private drawShroud() {
    const { ctx, game } = this;
    const viewer = game.players[this.viewer];
    if (!viewer) return;
    const { w, h } = game.map;
    const g = this.shroud.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      img.data[i * 4 + 3] = !viewer.explored[i] ? 255 : !viewer.visible[i] ? 110 : 0;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (this.iso) ctx.transform(this.view.tileW / 2, this.view.tileH / 2, -this.view.tileW / 2, this.view.tileH / 2, this.originX, 0);
    else ctx.scale(this.view.tileW, this.view.tileH);
    ctx.drawImage(this.shroud, 0, 0, w, h);
    ctx.restore();
  }

  private drawOverlays() {
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
    const mats = materials(game.pack);
    const sx = W / w, sy = H / h;
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      let c: RGB = [0, 0, 0];
      if (!viewer || viewer.explored[i]) {
        const res = game.map.resKind[i];
        c = res ? hexToRgb(game.pack.resources[res - 1].color) : mats[game.map.terrain[i]].base;
      }
      const k = i * 4;
      const dim = viewer && viewer.explored[i] && !viewer.visible[i] ? 0.6 : 1;
      img.data[k] = c[0] * dim; img.data[k + 1] = c[1] * dim; img.data[k + 2] = c[2] * dim; img.data[k + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, W, H);
    for (const e of game.entities.values()) {
      if (e.hp <= 0) continue;
      const cell = game.cellOf(e);
      if (e.owner !== this.viewer && viewer && !(e.kind === 'structure' ? viewer.explored[cell] : viewer.visible[cell])) continue;
      g.fillStyle = game.players[e.owner]?.color ?? '#999';
      if (e.kind === 'structure') g.fillRect(e.cx * sx, e.cy * sy, Math.max(2, e.w * sx), Math.max(2, e.h * sy));
      else g.fillRect(Math.floor(e.x / LEPTONS) * sx, Math.floor(e.y / LEPTONS) * sy, Math.max(2, sx), Math.max(2, sy));
    }
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
  return Math.atan2((dx + dy) * (ISO_VIEW.tileH / 2), (dx - dy) * (ISO_VIEW.tileW / 2));
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, c + amount));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const iconCache = new Map<string, Sprite>();

/** Sidebar cameo: the unit or building rendered from its 3D model on a dark plate. */
export function drawIcon(target: HTMLCanvasElement, game: Game, item: string, color: string, accent: string) {
  const g = target.getContext('2d')!;
  const W = target.width, H = target.height;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#3a4046'); grad.addColorStop(1, '#15191c');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const view = game.pack.projection === 'iso' ? ISO_VIEW : ORTHO_VIEW;
  const side = game.pack.factions.find(f => f.color === color)?.side ?? '';
  const style = styleFor(game.pack.id, side);
  const team = hexToRgb(color);
  const unit = game.pack.units[item], s = game.pack.structures[item];
  const key = `${game.pack.id}|${item}|${color}`;
  let sprite = iconCache.get(key);
  if (!sprite) {
    if (s?.floor) {
      const c = concreteTile(view);
      sprite = { canvas: c, ox: c.width / 2, oy: c.height / 2 };
    } else if (s) sprite = bake(s.wall ? wallMesh(10, style) : buildingMesh(s.shape, s.w, s.h, style, team), view, undefined, { shadow: false });
    else if (unit && unit.kind === 'vehicle') {
      const m = hullMesh(unit.shape, style, team);
      if (hasTurret(unit.shape)) m.merge(turretMesh(unit.shape, style, team));
      sprite = bake(m.rotated(Math.PI * 0.15), view, undefined, { shadow: false });
    }
    if (sprite) iconCache.set(key, sprite);
  }
  if (sprite) {
    const scale = Math.min((W - 6) / sprite.canvas.width, (H - 6) / sprite.canvas.height, unit ? 2.2 : 1.4);
    g.imageSmoothingEnabled = true;
    g.drawImage(sprite.canvas, (W - sprite.canvas.width * scale) / 2, (H - sprite.canvas.height * scale) / 2 + 2, sprite.canvas.width * scale, sprite.canvas.height * scale);
  } else if (unit) {
    // Infantry cameo: a large figure in faction colours.
    g.save(); g.translate(W / 2, H / 2 + 6);
    g.fillStyle = shade(color, -40); g.beginPath(); g.ellipse(0, -6, 7, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2bf94'; g.beginPath(); g.arc(0, -18, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(0, -19.5, 5, Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = unit.shape === 'infantry-rocket' ? accent : '#1e1e1e'; g.lineWidth = unit.shape === 'infantry-rocket' ? 4 : 2.5;
    g.beginPath(); g.moveTo(-2, -8); g.lineTo(14, -12); g.stroke();
    g.restore();
  }
}
