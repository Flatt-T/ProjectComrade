// Canvas renderer for the Fusion Engine. One implementation, two projections:
// top-down 3/4 view (Dune) and 2:1 isometric (RA2). Terrain is painted per pixel with
// relief lighting; buildings and vehicles are 3D-forged sprites (see ./art). All art is
// original and procedural; sprites are chosen by `shape` key so they can be replaced.
import { LEPTONS } from './core';
import { WARP_TICKS } from './game';
import type { Effect, Entity, Game, Projectile } from './game';
import { FxLayer, bolt, missile } from './art/fx';
import { ISO_VIEW, ORTHO_VIEW, RGB, Sprite, View, bake, hexToRgb } from './art/forge';
import { ArtStyle, FLYING, ROTATING_DEFENCES, buildingMesh, crystalMesh, defenseTurretMesh, hasTurret, hullMesh, styleFor, treeMesh, turretMesh, wallMesh } from './art/models';
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
  private fx = new FxLayer();
  private seen = new WeakSet<Effect>();
  private shake = 0;
  private lastTime = 0;

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
      const lift = this.altitude(e) * this.view.zScale * this.camera.zoom;
      const d = Math.hypot(p.x - sx, p.y - lift - sy + 4);
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

  /** Height a unit flies at, in cells (0 on the ground). */
  altitude(e: Entity): number {
    const def = this.game.pack.units[e.type];
    if (!def || def.kind !== 'aircraft') return 0;
    // Carryalls and jets settle onto their pad while rearming or idle at base.
    const pad = e.order === 'rearm' && e.x === e.px && e.y === e.py;
    return (def.altitude ?? 1.5) * (pad ? 0.25 : 1);
  }

  /** Enemy units hidden by their own ability (Mirage Tank, submarines, Fremen, spies). */
  private hiddenFromViewer(e: Entity): boolean {
    return e.disguised && this.game.isEnemy(this.viewer, e.owner);
  }

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
    const now = performance.now();
    const dt = this.lastTime ? Math.min(0.1, (now - this.lastTime) / 1000) : 1 / 60;
    this.lastTime = now;
    if (!this.terrainReady) { paintTerrain(this.terrain, this.game.map, this.game.pack, this.view, this.originX); this.terrainReady = true; }
    this.spawnFromEffects();
    this.emitContinuous();
    this.fx.step(dt);
    this.shake = Math.max(0, this.shake - dt * 28);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = this.camera.zoom;
    const jx = this.shake ? (Math.random() - 0.5) * this.shake : 0, jy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(z, 0, 0, z, (-this.camera.x + jx) * z, (-this.camera.y + jy) * z);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain, 0, 0);
    const view = this.visibleCells();
    this.drawConcrete(view);
    this.fx.drawDecals(ctx, this.iso);
    this.drawResources(view);
    this.drawRubble();
    this.drawGhost();
    this.drawScene(alpha, view);
    this.drawWorms(alpha);
    this.drawProjectiles();
    this.drawEffects();
    this.fx.draw(ctx);
    this.drawMarkers();
    this.drawShroud();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawOverlays();
  }

  /** Pixels per cell for sizing radial effects in either projection. */
  private get cellPx() { return this.iso ? this.view.tileW * 0.72 : this.view.tileW; }

  private decal(x: number, y: number, r: number, kind: 'scorch' | 'crater' | 'wreck', ms: number) {
    const now = performance.now();
    this.fx.decals.push({ x, y, r, kind, born: now, until: now + ms });
    if (this.fx.decals.length > 260) this.fx.decals.shift();
  }

  /** Turn new simulation events into particles, decals and screen shake (once each). */
  private spawnFromEffects() {
    const { game } = this;
    const cell = this.cellPx;
    for (const fx of game.effects) {
      if (this.seen.has(fx)) continue;
      this.seen.add(fx);
      if (game.tick - fx.tick > fx.dur) continue;
      const p = this.project(fx.x / LEPTONS, fx.y / LEPTONS);
      const e = this.fx;
      switch (fx.kind) {
        case 'explosion':
          e.emit(p.x, p.y, 4, 6, 'fire'); e.emit(p.x, p.y, 4, 5, 'smoke'); e.emit(p.x, p.y, 4, 6, 'spark');
          this.decal(p.x, p.y, cell * 0.45, 'scorch', 14000); this.shake = Math.max(this.shake, 2); break;
        case 'vehicleDeath':
          e.emit(p.x, p.y, 4, 12, 'fire', 1.2); e.emit(p.x, p.y, 6, 8, 'smoke', 1.2); e.emit(p.x, p.y, 4, 10, 'spark'); e.emit(p.x, p.y, 4, 8, 'debris');
          this.decal(p.x, p.y, cell * 0.6, 'scorch', 20000); this.decal(p.x, p.y, cell * 0.32, 'wreck', 14000); this.shake = Math.max(this.shake, 4); break;
        case 'bigExplosion':
          e.emit(p.x, p.y, 6, 26, 'fire', 1.7); e.emit(p.x, p.y, 8, 18, 'smoke', 1.7); e.emit(p.x, p.y, 6, 18, 'debris', 1.4); e.emit(p.x, p.y, 6, 16, 'spark', 1.3);
          this.decal(p.x, p.y, cell * 1.3, 'scorch', 30000); this.shake = Math.max(this.shake, 7); break;
        case 'death': e.emit(p.x, p.y, 2, 4, 'dust', 0.5); break;
        case 'crush': e.emit(p.x, p.y, 2, 5, 'dust', 0.6); break;
        case 'hit': e.emit(p.x, p.y, 6, 3, 'spark', 0.6); break;
        case 'muzzle': {
          const b = this.project(fx.x2 / LEPTONS, fx.y2 / LEPTONS);
          const a = Math.atan2(b.y - p.y, b.x - p.x);
          e.emit(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 6, 7, 1, 'smoke', 0.45); break;
        }
        case 'deploy': e.emit(p.x, p.y, 2, 18, 'dust', 1.4); break;
        case 'sell': e.emit(p.x, p.y, 4, 16, 'dust', 1.4); break;
        case 'build': e.emit(p.x, p.y, 2, 8, 'dust'); break;
        case 'nuke':
          e.emit(p.x, p.y, 10, 70, 'fire', 3); e.emit(p.x, p.y, 20, 50, 'smoke', 3); e.emit(p.x, p.y, 8, 40, 'debris', 2.2); e.emit(p.x, p.y, 8, 40, 'spark', 2.2);
          this.decal(p.x, p.y, (fx.x2 / LEPTONS) * cell * 0.85, 'crater', 70000); this.shake = Math.max(this.shake, 24); break;
        case 'ionStrike':
          e.emit(p.x, p.y, 6, 60, 'blue', 2); e.emit(p.x, p.y, 10, 12, 'smoke', 1.5);
          this.decal(p.x, p.y, (fx.x2 / LEPTONS) * cell * 0.7, 'scorch', 50000); this.shake = Math.max(this.shake, 12); break;
        case 'lightning':
          e.emit(p.x, p.y, 4, 12, 'blue'); e.emit(p.x, p.y, 4, 6, 'spark');
          this.decal(p.x, p.y, cell * 0.4, 'scorch', 20000); this.shake = Math.max(this.shake, 3); break;
        case 'bloom': e.emit(p.x, p.y, 2, 26, 'sand', 1.5); break;
        case 'wormEat': e.emit(p.x, p.y, 2, 30, 'sand', 1.6); break;
        case 'wormDive': e.emit(p.x, p.y, 2, 14, 'sand', 1.2); break;
        case 'chrono': if (!fx.x2) e.emit(p.x, p.y, 6, 14, 'blue', 0.8); break;
        case 'chronoFlash': e.emit(p.x, p.y, 12, 40, 'blue', 1.6); this.shake = Math.max(this.shake, 3); break;
        case 'capture': case 'upgrade': case 'promote': e.emit(p.x, p.y - 10, 4, 10, 'spark', 0.8); break;
        case 'delivery': case 'lift': case 'drop': case 'dig': case 'undig': case 'parachute': e.emit(p.x, p.y, 2, 8, 'dust', 0.9); break;
        case 'droneIn': case 'enter': case 'repairFx': e.emit(p.x, p.y - 4, 3, 5, 'spark', 0.6); break;
        case 'reinforce': e.emit(p.x, p.y, 4, 20, 'sand', 1.3); break;
        case 'board': case 'unload': e.emit(p.x, p.y, 2, 6, 'dust', 0.7); break;
      }
      if (fx.kind === 'explosion' && fx.x2 >= 512) {
        // Demolition Truck, Kirov crash, reactor meltdown: a much bigger blast.
        const k = fx.x2 / 512;
        e.emit(p.x, p.y, 8, 26 * k, 'fire', 1.8 * k); e.emit(p.x, p.y, 12, 18 * k, 'smoke', 1.8 * k); e.emit(p.x, p.y, 6, 14 * k, 'debris', 1.5);
        this.decal(p.x, p.y, (fx.x2 / LEPTONS) * cell * 0.6, 'crater', 50000); this.shake = Math.max(this.shake, 6 * k);
      }
    }
  }

  /** Emitters that run every frame: rocket trails, harvester dust, burning wrecks, launches. */
  private emitContinuous() {
    const { game } = this;
    for (const pr of game.projectiles) {
      const w = game.pack.weapons[pr.weapon];
      if (w.visual !== 'missile' && w.visual !== 'artillery') continue;
      const f = this.flight(pr);
      if (w.visual === 'missile') this.fx.emit(f.x - Math.cos(f.angle) * 4, f.y, f.z, 1, 'smoke', 0.5);
      else if (this.frame % 2 === 0) this.fx.emit(f.x, f.y, f.z, 1, 'steam');
    }
    if (this.frame % 3 === 0) for (const e of game.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.hstate !== 'gather' || e.order !== 'harvest' || !game.pack.units[e.type]?.harvester) continue;
      const p = this.project(e.x / LEPTONS, e.y / LEPTONS);
      this.fx.emit(p.x, p.y, 2, 1, game.pack.id === 'dune' ? 'sand' : 'dust', 0.6);
    }
    const now = performance.now();
    for (const d of this.fx.decals) if (d.kind === 'wreck' && now - d.born < 9000 && Math.random() < 0.3) this.fx.emit(d.x, d.y, 4, 1, 'smoke', 0.7);
    for (const fx of game.effects) {
      if (fx.kind !== 'superLaunch') continue;
      const age = game.tick - fx.tick;
      if (age >= 0 && age < fx.dur * 0.45) { const p = this.project(fx.x / LEPTONS, fx.y / LEPTONS); this.fx.emit(p.x, p.y, 12, 2, 'smoke', 1.8); }
    }
  }

  /** Screen position, height and heading of a projectile in flight. */
  private flight(pr: Projectile) {
    const w = this.game.pack.weapons[pr.weapon];
    const p = this.project(pr.x / LEPTONS, pr.y / LEPTONS);
    const s = this.project(pr.sx / LEPTONS, pr.sy / LEPTONS), e = this.project(pr.tx / LEPTONS, pr.ty / LEPTONS);
    const total = Math.hypot(e.x - s.x, e.y - s.y) || 1;
    const t = Math.min(1, Math.hypot(p.x - s.x, p.y - s.y) / total);
    const angle = Math.atan2(e.y - p.y, e.x - p.x);
    const z = w.visual === 'artillery' ? 6 + 4 * t * (1 - t) * Math.min(120, total * 0.55)
      : w.visual === 'missile' ? 8 + Math.sin(t * Math.PI) * Math.min(36, total * 0.12) : 7;
    return { x: p.x, y: p.y, z, t, angle };
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
        if (e.carriedBy) continue; // Drawn by its carrier (cargo) or hidden inside its victim (drone).
        if (e.owner !== this.viewer && viewer && !viewer.visible[game.cellOf(e)]) continue;
        const lx = e.px + (e.x - e.px) * alpha, ly = e.py + (e.y - e.py) * alpha;
        if (this.hiddenFromViewer(e)) {
          // A disguised Mirage Tank shows the enemy a tree; everything else simply vanishes.
          if (game.pack.units[e.type].shape === 'mirage') items.push({ depth: depthOf(lx / LEPTONS, ly / LEPTONS), draw: () => {
            const s = this.sprite('tree|1', () => bake(treeMesh(1), this.view));
            const p = this.project(lx / LEPTONS - 0.5, ly / LEPTONS - 0.5);
            this.blit(s, p.x, p.y);
          } });
          continue;
        }
        const air = this.altitude(e) > 0;
        items.push({ depth: depthOf(lx / LEPTONS, ly / LEPTONS) + (air ? 10000 : 0), draw: () => this.drawUnit(e, lx, ly) });
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
    const grow = Math.min(1, (game.tick - e.born + 1) / (def.wall ? 8 : 36));
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
      if (grow < 1) this.construct(s, origin.x, origin.y, grow, e.cx, e.cy, e.w, e.h);
      else { this.blit(s, origin.x, origin.y); this.structureDetail(e, def.shape, style, team, color, off); }
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
    this.statusMarks(e, this.project(e.cx + e.w / 2, e.cy + e.h / 2), Math.max(e.w, e.h) * 16);
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
    if (ROTATING_DEFENCES.has(shape)) {
      if (shape === 'turret' && style === 'allied') return; // The Allied pillbox has no visible gun.
      const r = this.rot(e.turret);
      const s = this.sprite(`dt|${shape}|${style}|${color}|${r.key}`, () => bake(defenseTurretMesh(shape, style, team).rotated(r.angle), this.view, undefined, { shadow: false }));
      const c = this.project(e.cx + e.w / 2, e.cy + e.h / 2);
      this.blit(s, c.x, c.y);
    } else if (shape === 'chronosphere' && !off) {
      const c = this.project(e.cx + e.w / 2, e.cy + e.h / 2);
      this.glow(c.x, c.y - 1.1 * zs, 18 + 4 * Math.sin(t * 3), '150,230,255', 0.6);
    } else if (shape === 'curtain' && !off) {
      const c = this.project(e.cx + e.w / 2, e.cy + e.h / 2);
      this.glow(c.x, c.y - 1.0 * zs, 16 + 3 * Math.sin(t * 4), '255,90,60', 0.55);
    } else if ((shape === 'gap' || shape === 'sensor' || shape === 'cloning') && !off) {
      const c = this.project(e.cx + e.w / 2, e.cy + e.h / 2);
      const rgb = shape === 'gap' ? '150,225,255' : shape === 'sensor' ? '205,130,255' : '150,240,190';
      this.glow(c.x, c.y - (shape === 'cloning' ? 0.7 : 1.6) * zs, 10 + 3 * Math.sin(t * 5 + e.id), rgb, 0.6);
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

  /** Building rising behind scaffolding with a welding seam (also played in reverse when sold). */
  private construct(s: Sprite, wx: number, wy: number, p: number, cx: number, cy: number, w: number, h: number) {
    const { ctx } = this;
    const left = Math.round(wx - s.ox), top = Math.round(wy - s.oy), H = s.canvas.height;
    const cut = top + H * (1 - p);
    ctx.save(); ctx.beginPath(); ctx.rect(left, cut, s.canvas.width, H * p + 1); ctx.clip();
    ctx.drawImage(s.canvas, left, top); ctx.restore();
    const corners = [this.project(cx, cy), this.project(cx + w, cy), this.project(cx + w, cy + h), this.project(cx, cy + h)];
    ctx.strokeStyle = 'rgba(64,58,50,0.9)'; ctx.lineWidth = 1.4;
    for (const c of corners) { ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, Math.min(c.y, cut + 2)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(corners[3].x, Math.min(corners[3].y, cut + 2)); ctx.lineTo(corners[2].x, Math.min(corners[2].y, cut + 2)); ctx.lineTo(corners[1].x, Math.min(corners[1].y, cut + 2)); ctx.stroke();
    ctx.strokeStyle = `rgba(255,${200 + Math.floor(Math.random() * 40)},120,0.9)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left + 6, cut); ctx.lineTo(left + s.canvas.width - 6, cut); ctx.stroke();
    if (Math.random() < 0.7) this.fx.emit(left + 6 + Math.random() * (s.canvas.width - 12), cut + 2, 0, 1, 'spark', 0.45);
    if (p < 0.2 && Math.random() < 0.5) this.fx.emit((corners[0].x + corners[2].x) / 2, (corners[0].y + corners[2].y) / 2, 0, 2, 'dust', 1.2);
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
    const ground = this.project(lx / LEPTONS, ly / LEPTONS);
    const lift = this.altitude(e) * this.view.zScale;
    // Ships ride the swell; aircraft hang above their own shadow.
    const bob = def.kind === 'naval' ? Math.sin(this.frame / 18 + e.id) * 0.9 : lift ? Math.sin(this.frame / 25 + e.id) * 1.5 : 0;
    const p = { x: ground.x, y: ground.y - lift + bob };
    const style = this.style(e.owner), team = this.teamColor(e.owner);
    const color = game.players[e.owner]?.color ?? '';
    if (lift) {
      const size = FLYING.has(def.shape) ? (def.shape === 'kirov' ? 26 : 13) : 6;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(ground.x, ground.y, size, size * (this.iso ? 0.45 : 0.6), 0, 0, Math.PI * 2); ctx.fill();
    }
    if (e.disguised) ctx.globalAlpha = 0.5; // Own hidden units show ghosted.
    // Chrono Miner: fades out while charging, then fades back in at the refinery.
    const warping = e.hstate === 'warp' ? e.timer / WARP_TICKS : game.tick - e.warp < 15 ? (game.tick - e.warp) / 15 : 1;
    if (warping < 1) {
      ctx.globalAlpha = Math.max(0.05, warping);
      this.glow(p.x, p.y - 6, 26, '140,200,255', 1 - warping);
      if (Math.random() < 0.5) this.fx.emit(p.x, p.y - 6, 8, 1, 'blue', 0.6);
    }
    if (def.kind === 'infantry' || def.shape === 'rocketeer') {
      if (def.shape === 'rocketeer') {
        // Jetpack flame under a flying soldier.
        ctx.fillStyle = `rgba(255,${170 + (this.frame % 4) * 20},80,0.9)`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 1.8, 4 + (this.frame % 3), 0, 0, Math.PI * 2); ctx.fill();
      }
      this.drawInfantry(e, def.shape, p.x, p.y, color);
    } else {
      if (e.carrying) {
        // Carryall cargo hangs just below it.
        const cargo = game.entities.get(e.carrying);
        if (cargo) {
          const cd = game.pack.units[cargo.type], r = this.rot(e.facing);
          const cs = this.sprite(`h|${cd.shape}|${style}|${color}|${r.key}`, () => bake(hullMesh(cd.shape, style, team).rotated(r.angle), this.view));
          this.blit(cs, p.x, p.y + 8);
        }
      }
      const hull = this.rot(e.facing);
      const air = FLYING.has(def.shape);
      const hs = this.sprite(`h|${def.shape}|${style}|${color}|${hull.key}`, () => bake(hullMesh(def.shape, style, team).rotated(hull.angle), this.view, undefined, { shadow: !air && def.kind !== 'naval' }));
      if (def.kind === 'naval') {
        ctx.strokeStyle = 'rgba(220,240,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(ground.x, ground.y + 1, def.shape === 'ship-carrier' || def.shape === 'ship-dreadnought' ? 40 : def.shape.startsWith('ship') || def.shape === 'sub' ? 30 : 18, this.iso ? 9 : 12, 0, 0, Math.PI * 2); ctx.stroke();
      }
      this.blit(hs, p.x, p.y);
      if (def.shape === 'helicopter') {
        // Tandem rotors, spinning.
        ctx.strokeStyle = 'rgba(30,30,30,0.55)'; ctx.lineWidth = 1.6;
        const dir = facingAngle(e.facing, this.iso);
        for (const off of [-9, 8]) {
          const cx = p.x + Math.cos(dir) * off, cy = p.y - 11 + Math.sin(dir) * off * (this.iso ? 0.5 : 0.7);
          for (let k = 0; k < 3; k++) {
            const a = this.frame * 0.9 + (k * Math.PI * 2) / 3 + off;
            ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 11, cy - Math.sin(a) * 5); ctx.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 5); ctx.stroke();
          }
        }
      }
      if (e.passengers.length) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p.x - 9, p.y - 26, 18, 8);
        ctx.fillStyle = '#e2e8da'; ctx.font = '7px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText(String(e.passengers.length), p.x, p.y - 20);
      }
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
    ctx.globalAlpha = 1;
    if (e.convertedUntil) { ctx.fillStyle = 'rgba(120,255,120,0.22)'; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 14, 0, Math.PI * 2); ctx.fill(); }
    if (!e.convertedUntil && e.owner !== e.originalOwner) {
      // Mind-controlled: a violet halo.
      ctx.strokeStyle = `rgba(205,130,255,${0.5 + 0.3 * Math.sin(this.frame / 6)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 12, 6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.drone) {
      // A terror drone clinging to the hull.
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(p.x + 4, p.y - 12, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.frame % 10 < 5 ? '#ff4030' : '#a02010'; ctx.fillRect(p.x + 5, p.y - 13, 1.5, 1.5);
    }
    if (e.deployed) this.deployedLook(e, def.shape, ground.x, ground.y);
    this.statusMarks(e, p, def.kind === 'infantry' ? 8 : 16);
    if (e.rank) this.chevrons(p.x + (def.kind === 'infantry' ? 6 : 12), p.y - (def.kind === 'infantry' ? 16 : 20), e.rank);
    if (this.selected.has(e.id)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
      const r = def.kind === 'infantry' ? 7 : 15;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, r, this.iso ? r * 0.5 : r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.selected.has(e.id) || this.hover === e.id) this.healthBar(p.x, p.y - (def.kind === 'infantry' ? 18 : 24), def.kind === 'infantry' ? 14 : 26, e.hp / e.maxHp, this.selected.has(e.id));
  }

  /** Iron Curtain sheen and a blinking planted charge, for units and buildings alike. */
  private statusMarks(e: Entity, p: { x: number; y: number }, r: number) {
    const { ctx, game } = this;
    if (e.invulnUntil > game.tick) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,40,30,${0.22 + 0.12 * Math.sin(this.frame / 5)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.4, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.c4At > game.tick && this.frame % 12 < 6) {
      ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.6, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Veterancy chevrons: one for veteran, two for elite. */
  private chevrons(x: number, y: number, rank: number) {
    const { ctx } = this;
    ctx.strokeStyle = rank >= 2 ? '#ffd24a' : '#e8e8e8'; ctx.lineWidth = 1.6;
    for (let k = 0; k < Math.min(2, rank); k++) {
      ctx.beginPath(); ctx.moveTo(x - 3, y + k * 3.5); ctx.lineTo(x, y - 2.5 + k * 3.5); ctx.lineTo(x + 3, y + k * 3.5); ctx.stroke();
    }
  }

  /** Deployed stances: G.I. sandbags, Desolator rad cloud, a thumping Thumper. */
  private deployedLook(e: Entity, shape: string, x: number, y: number) {
    const { ctx } = this;
    if (shape === 'desolator') {
      this.glow(x, y - 2, 20 + 4 * Math.sin(this.frame / 8), '150,255,120', 0.35);
    } else if (shape === 'thumper') {
      const k = Math.abs(Math.sin(this.frame / 4));
      ctx.fillStyle = '#6a6052'; ctx.fillRect(x + 4, y - 8 - k * 4, 3, 8);
      if (k < 0.2) this.fx.emit(x + 5, y, 2, 1, 'sand', 0.4);
    } else {
      ctx.fillStyle = '#9a8a64';
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * (this.iso ? 3.5 : 5), 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    }
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
    const helmet: Record<string, string> = { 'infantry-elite': '#222', engineer: '#e8c640', spy: '#2a2a30', saboteur: '#1a1a1a', yuri: '#c9a07c', ivan: '#5a3a24', chrono: '#9fd4ff', desolator: '#3e5a2c', thumper: '#8a7350' };
    ctx.fillStyle = helmet[shape] ?? mid;
    ctx.beginPath(); ctx.arc(x, y - 12.6, 2.2, Math.PI, Math.PI * 2); ctx.fill();
    if (shape === 'chrono') this.glow(x, y - 8, 8, '140,200,255', 0.35 + 0.15 * Math.sin(this.frame / 6));
    if (shape === 'yuri') this.glow(x, y - 12, 6, '205,130,255', 0.3);
    if (shape === 'desolator') { ctx.fillStyle = '#7fbf4a'; ctx.fillRect(x - 4, y - 10, 2, 5); }
    if (shape === 'ivan') { ctx.fillStyle = '#c03020'; ctx.beginPath(); ctx.arc(x - cos * 4, y - 7, 1.8, 0, Math.PI * 2); ctx.fill(); }
    if (shape === 'engineer' || shape === 'spy' || shape === 'thumper' || shape === 'saboteur' || shape === 'yuri') {
      // No rifle: a toolbox, a briefcase, the thumper or a satchel instead.
      ctx.fillStyle = shape === 'engineer' ? '#c8a030' : shape === 'thumper' ? '#6a6052' : '#3a3530';
      ctx.fillRect(x + cos * 3 - 1.5, y - 6, 3, 3);
      return;
    }
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
      const t = game.pack.terrains[game.map.terrain[game.cellIndex(Math.floor(lx / LEPTONS), Math.floor(ly / LEPTONS))]];
      const wet = !!t?.water;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      // Churned sand (or white water) trail and the worm's ridged back breaking the surface.
      for (let k = 7; k >= 0; k--) {
        const wob = Math.sin(this.frame / 6 + k) * 2.2;
        ctx.fillStyle = wet ? `rgba(225,240,250,${0.12 + k * 0.035})` : `rgba(150,108,62,${0.18 + k * 0.03})`;
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
      const f = this.flight(pr);
      if (w.visual === 'missile') missile(ctx, f.x, f.y - f.z, f.angle, 3.2, Math.random() * 0.6);
      else if (w.visual === 'bomb') {
        // Kirov bombs drop from the airship to the ground.
        const src = game.entities.get(pr.source);
        const drop = src ? this.altitude(src) * this.view.zScale : 0;
        const total = Math.max(1, Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy)), done = Math.hypot(pr.x - pr.sx, pr.y - pr.sy) / total;
        ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.ellipse(f.x, f.y - drop * (1 - done), 2.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (w.visual === 'torpedo') {
        ctx.strokeStyle = 'rgba(230,245,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(f.x - Math.cos(f.angle) * 12, f.y - Math.sin(f.angle) * 12); ctx.lineTo(f.x, f.y); ctx.stroke();
      }
      else if (w.visual === 'artillery') {
        // Shell on a ballistic arc, its shadow racing along the ground.
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 3, this.iso ? 1.5 : 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#26221e'; ctx.beginPath(); ctx.arc(f.x, f.y - f.z, 2.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,180,80,0.7)'; ctx.beginPath(); ctx.arc(f.x - Math.cos(f.angle) * 2.5, f.y - f.z - Math.sin(f.angle) * 2.5, 1.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x - Math.cos(f.angle) * 10, f.y - f.z - Math.sin(f.angle) * 10); ctx.lineTo(f.x, f.y - f.z); ctx.stroke();
      }
    }
  }

  private drawEffects() {
    const { ctx, game } = this;
    const cell = this.cellPx;
    const squash = this.iso ? 0.5 : 0.75;
    for (const fx of game.effects) {
      const age = game.tick - fx.tick;
      if (age > fx.dur || fx.kind === 'rubble') continue;
      const t = age / fx.dur;
      const a = this.project(fx.x / LEPTONS, fx.y / LEPTONS);
      const b = this.project(fx.x2 / LEPTONS, fx.y2 / LEPTONS);
      switch (fx.kind) {
        case 'bullet': {
          ctx.strokeStyle = `rgba(255,240,170,${1 - t})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 7); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
          this.flash(a.x, a.y - 7, Math.atan2(b.y - a.y, b.x - a.x), 4 * (1 - t));
          break;
        }
        case 'muzzle': case 'cannon':
          this.flash(a.x, a.y - 8, Math.atan2(b.y - a.y, b.x - a.x), 7 * (1 - t));
          break;
        case 'prism':
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(170,240,255,${1 - t})`; ctx.lineWidth = 6 * (1 - t) + 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 30); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${1 - t})`; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'tesla':
          bolt(ctx, a.x, a.y - 22, b.x, b.y - 5, 7, 1 - t);
          break;
        case 'sonic':
          for (let k = 0; k < 4; k++) {
            const f = (t + k / 4) % 1;
            const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f - 6;
            ctx.strokeStyle = `rgba(220,230,255,${0.6 * (1 - t)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 6 + f * 6, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        case 'hit':
          ctx.fillStyle = `rgba(255,220,120,${1 - t})`; ctx.beginPath(); ctx.arc(a.x, a.y - 5, 3 + t * 4, 0, Math.PI * 2); ctx.fill();
          break;
        case 'explosion': case 'bigExplosion': case 'vehicleDeath': case 'death': case 'crush': case 'wormEat': {
          const big = fx.kind === 'bigExplosion';
          const blast = fx.kind === 'explosion' && fx.x2 >= 512 ? (fx.x2 / LEPTONS) * cell * 0.7 : 0;
          const r = (blast || (big ? 30 : fx.kind === 'wormEat' ? 22 : fx.kind === 'death' || fx.kind === 'crush' ? 6 : fx.kind === 'vehicleDeath' ? 18 : 15)) * (0.35 + t);
          if (fx.kind === 'wormEat') { ctx.fillStyle = `rgba(170,120,64,${1 - t})`; ctx.beginPath(); ctx.arc(a.x, a.y - 4, r, 0, Math.PI * 2); ctx.fill(); break; }
          const g = ctx.createRadialGradient(a.x, a.y - 6, 0, a.x, a.y - 6, r);
          g.addColorStop(0, `rgba(255,250,210,${1 - t})`); g.addColorStop(0.35, `rgba(255,180,60,${0.95 * (1 - t)})`);
          g.addColorStop(0.75, `rgba(210,80,20,${0.7 * (1 - t)})`); g.addColorStop(1, 'rgba(120,40,10,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y - 6, r, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'deploy': {
          // The MCV folds away as the Construction Yard unfolds out of it.
          const def = fx.item ? game.pack.units[fx.item] : undefined;
          if (!def) break;
          const owner = fx.owner ?? 0, style = this.style(owner), team = this.teamColor(owner), color = game.players[owner]?.color ?? '';
          const r = this.rot(96);
          const s = this.sprite(`h|${def.shape}|${style}|${color}|${r.key}`, () => bake(hullMesh(def.shape, style, team).rotated(r.angle), this.view));
          const k = Math.max(0, 1 - t * 1.8);
          if (k > 0) {
            ctx.save(); ctx.globalAlpha = k; ctx.translate(a.x, a.y); ctx.scale(0.55 + 0.45 * k, 0.55 + 0.45 * k);
            ctx.drawImage(s.canvas, -s.ox, -s.oy); ctx.restore();
          }
          break;
        }
        case 'sell': {
          const def = fx.item ? game.pack.structures[fx.item] : undefined;
          if (!def || def.floor || def.wall) break;
          const owner = fx.owner ?? 0, style = this.style(owner), team = this.teamColor(owner), color = game.players[owner]?.color ?? '';
          const s = this.sprite(`b|${def.shape}|${def.w}x${def.h}|${style}|${color}`, () => bake(buildingMesh(def.shape, def.w, def.h, style, team), this.view));
          const o = this.project(fx.x2, fx.y2);
          this.construct(s, o.x, o.y, Math.max(0, 1 - t), fx.x2, fx.y2, def.w, def.h);
          break;
        }
        case 'superLaunch': {
          // The missile climbs out of its silo and leaves the screen.
          const q = t / 0.35;
          if (q < 1) {
            if (q < 0.18) this.glow(a.x, a.y - 18, 40 * (1 - q / 0.18), '255,230,170');
            missile(ctx, a.x, a.y - 26 - q * q * 520, -Math.PI / 2, 5, Math.random());
          }
          break;
        }
        case 'superIncoming': {
          // Target warning, then the missile screams down.
          const pulse = 0.5 + 0.5 * Math.sin(this.frame / 4);
          const R = cell * 1.8 * (1 + 0.08 * pulse);
          ctx.strokeStyle = `rgba(255,60,40,${0.45 + 0.4 * pulse})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, R, R * squash, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(a.x - R * 1.2, a.y); ctx.lineTo(a.x + R * 1.2, a.y); ctx.moveTo(a.x, a.y - R * squash * 1.2); ctx.lineTo(a.x, a.y + R * squash * 1.2); ctx.stroke();
          if (t > 0.6) {
            const q = (t - 0.6) / 0.4;
            missile(ctx, a.x + (1 - q) * 70, a.y - (1 - q) * (1 - q) * 640, Math.PI / 2 - 0.11, 5, Math.random());
          }
          break;
        }
        case 'nuke': {
          const R = (fx.x2 / LEPTONS) * cell;
          if (t < 0.22) this.glow(a.x, a.y - 10, R * 2.4 * (0.5 + t * 3), `255,255,240`, 1 - t / 0.22);
          // Fireball.
          const fr = R * (0.35 + 0.55 * Math.min(1, t * 3));
          const g = ctx.createRadialGradient(a.x, a.y - 12, 0, a.x, a.y - 12, fr);
          g.addColorStop(0, `rgba(255,250,220,${1 - t})`); g.addColorStop(0.4, `rgba(255,170,60,${0.9 * (1 - t)})`); g.addColorStop(1, 'rgba(160,50,10,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a.x, a.y - 12, fr, fr * (0.4 + squash * 0.6), 0, 0, Math.PI * 2); ctx.fill();
          // Shockwave across the ground.
          ctx.strokeStyle = `rgba(255,240,210,${0.8 * (1 - t)})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, R * 2.1 * t + 4, (R * 2.1 * t + 4) * squash, 0, 0, Math.PI * 2); ctx.stroke();
          // Mushroom cloud: rising stem and rolling cap.
          const rise = Math.min(1, t * 1.6);
          const stemTop = a.y - 30 - 120 * rise;
          const sg = ctx.createLinearGradient(0, a.y, 0, stemTop);
          sg.addColorStop(0, `rgba(255,150,60,${0.85 * (1 - t)})`); sg.addColorStop(1, `rgba(90,80,72,${0.8 * (1 - t * 0.7)})`);
          ctx.fillStyle = sg; ctx.fillRect(a.x - (9 - 3 * t), stemTop, 18 - 6 * t, a.y - stemTop);
          const cr = 22 + 46 * Math.min(1, t * 1.4);
          const cg = ctx.createRadialGradient(a.x, stemTop, 0, a.x, stemTop, cr);
          cg.addColorStop(0, `rgba(255,${190 - t * 120},90,${0.95 * (1 - t * 0.6)})`); cg.addColorStop(0.6, `rgba(120,96,80,${0.85 * (1 - t * 0.5)})`); cg.addColorStop(1, 'rgba(70,64,60,0)');
          ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(a.x, stemTop, cr, cr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'ionCharge': {
          // Orbital lock: a thin beam focusing on the target.
          ctx.globalCompositeOperation = 'lighter';
          const w = 1.5 + t * 5;
          ctx.strokeStyle = `rgba(150,210,255,${0.35 + 0.35 * Math.random()})`; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(b.x, b.y - 800); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.3 * Math.random()})`; ctx.lineWidth = w * 0.3; ctx.stroke();
          const rr = cell * 2.2 * (1 - t) + 4;
          ctx.strokeStyle = `rgba(150,220,255,${0.4 + 0.5 * t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(b.x, b.y, rr, rr * squash, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ionStrike': {
          const R = (fx.x2 / LEPTONS) * cell;
          ctx.globalCompositeOperation = 'lighter';
          const W = 36 * (1 - t) + 6;
          const g = ctx.createLinearGradient(a.x - W, 0, a.x + W, 0);
          g.addColorStop(0, 'rgba(90,160,255,0)'); g.addColorStop(0.5, `rgba(235,248,255,${1 - t})`); g.addColorStop(1, 'rgba(90,160,255,0)');
          ctx.fillStyle = g; ctx.fillRect(a.x - W, a.y - 900, W * 2, 900);
          const gb = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R * (0.4 + t));
          gb.addColorStop(0, `rgba(230,245,255,${1 - t})`); gb.addColorStop(1, 'rgba(80,150,255,0)');
          ctx.fillStyle = gb; ctx.beginPath(); ctx.ellipse(a.x, a.y, R * (0.4 + t), R * (0.4 + t) * squash, 0, 0, Math.PI * 2); ctx.fill();
          for (const k of [1, 1.6]) {
            ctx.strokeStyle = `rgba(170,220,255,${0.8 * (1 - t)})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(a.x, a.y, R * k * t + 3, (R * k * t + 3) * squash, 0, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'stormClouds': {
          // Gathering storm: darkened ground, churning clouds, rain.
          const R = (fx.x2 / LEPTONS) * cell;
          const fade = Math.max(0, Math.min(1, t / 0.15, (1 - t) / 0.15));
          const dg = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R * 1.5);
          dg.addColorStop(0, `rgba(10,14,24,${0.45 * fade})`); dg.addColorStop(1, 'rgba(10,14,24,0)');
          ctx.fillStyle = dg; ctx.beginPath(); ctx.ellipse(a.x, a.y, R * 1.5, R * 1.5 * squash, 0, 0, Math.PI * 2); ctx.fill();
          for (let k = 0; k < 9; k++) {
            const ang = (k / 9) * Math.PI * 2 + this.frame * 0.004;
            const cx = a.x + Math.cos(ang) * R * 0.7, cy = a.y + Math.sin(ang) * R * 0.7 * squash - 80;
            const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
            cg.addColorStop(0, `rgba(40,44,52,${0.6 * fade})`); cg.addColorStop(1, 'rgba(40,44,52,0)');
            ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.5, R * 0.32, 0, 0, Math.PI * 2); ctx.fill();
          }
          ctx.strokeStyle = `rgba(170,190,220,${0.35 * fade})`; ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 40; k++) {
            const rx = a.x + (Math.random() - 0.5) * R * 2, ry = a.y + (Math.random() - 0.5) * R * squash * 2 - 30;
            ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 10);
          }
          ctx.stroke();
          if (fade > 0.5 && Math.random() < 0.04) this.glow(a.x, a.y - 60, R * 1.4, '210,225,255', 0.25);
          break;
        }
        case 'lightning':
          bolt(ctx, a.x + (Math.random() - 0.5) * 60, a.y - 300, a.x, a.y - 4, 18, 1 - t);
          this.glow(a.x, a.y, cell * 1.2, '200,220,255', 1 - t);
          break;
        case 'laser': case 'rad': case 'psychic': {
          const rgb = fx.kind === 'laser' ? '255,250,200' : fx.kind === 'rad' ? '150,255,110' : '205,130,255';
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${rgb},${1 - t})`; ctx.lineWidth = 3 * (1 - t) + 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 10);
          if (fx.kind === 'psychic') for (let k = 1; k <= 8; k++) ctx.lineTo(a.x + (b.x - a.x) * k / 8 + Math.sin(k * 2 + this.frame / 2) * 3, a.y - 10 + (b.y - a.y + 5) * k / 8);
          else ctx.lineTo(b.x, b.y - 5);
          ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'paradrop': case 'spyPlane': {
          // The transport plane crosses toward the drop zone.
          const sx = a.x - 400 * (1 - t), sy = a.y - 70 - 150 * (1 - t);
          ctx.fillStyle = 'rgba(40,44,48,0.9)';
          ctx.beginPath(); ctx.moveTo(sx + 16, sy); ctx.lineTo(sx - 12, sy - 4); ctx.lineTo(sx - 12, sy + 4); ctx.closePath(); ctx.fill();
          ctx.fillRect(sx - 4, sy - 14, 4, 28);
          break;
        }
        case 'parachute': {
          const y = a.y - 50 * (1 - t);
          ctx.fillStyle = `rgba(235,235,225,${1 - t * 0.5})`;
          ctx.beginPath(); ctx.arc(a.x, y - 14, 7, Math.PI, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(80,80,80,0.6)'; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(a.x - 7, y - 14); ctx.lineTo(a.x, y - 6); ctx.lineTo(a.x + 7, y - 14); ctx.stroke();
          break;
        }
        case 'chronoCharge': case 'curtainCharge': {
          const rgb = fx.kind === 'chronoCharge' ? '140,210,255' : '255,80,60';
          const pulse = 0.5 + 0.5 * Math.sin(age / 3);
          for (const q of fx.kind === 'chronoCharge' ? [a, b] : [a]) {
            ctx.strokeStyle = `rgba(${rgb},${0.4 + 0.4 * pulse})`; ctx.lineWidth = 2;
            const rr = cell * (fx.kind === 'chronoCharge' ? 2.5 : fx.x2 / LEPTONS) * (0.8 + 0.2 * pulse);
            ctx.beginPath(); ctx.ellipse(q.x, q.y, rr, rr * squash, 0, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }
        case 'chronoFlash': case 'curtain': {
          if (fx.kind === 'curtain' && t > 0.1) break;
          const rgb = fx.kind === 'chronoFlash' ? '160,220,255' : '255,70,50';
          this.glow(a.x, a.y, cell * (fx.x2 / LEPTONS) * 1.2, rgb, 1 - t * (fx.kind === 'curtain' ? 10 : 1));
          break;
        }
        case 'infiltrate': case 'promote': case 'upgrade': case 'capture': {
          // Floating callout above the target.
          const label = fx.kind === 'promote' ? (fx.x2 >= 2 ? 'ELITE' : 'VETERAN') : fx.kind === 'upgrade' ? 'UPGRADED' : fx.kind === 'capture' ? 'CAPTURED'
            : ({ steal: 'CREDITS STOLEN', blackout: 'POWER DOWN', reshroud: 'RADAR JAMMED', veteran: 'TECH STOLEN', super: 'TIMER RESET' } as Record<string, string>)[fx.color ?? ''] ?? 'INFILTRATED';
          ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = `rgba(0,0,0,${0.6 * (1 - t)})`; ctx.fillText(label, a.x + 1, a.y - 28 - t * 20 + 1);
          ctx.fillStyle = `rgba(255,236,150,${1 - t})`; ctx.fillText(label, a.x, a.y - 28 - t * 20);
          break;
        }
        case 'c4':
          if (age % 10 < 5) { ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.arc(a.x, a.y - 8, 3, 0, Math.PI * 2); ctx.fill(); }
          break;
        case 'chrono': case 'convert': case 'bloom': case 'build': case 'denied': case 'wormDive': {
          if (fx.kind === 'chrono' && fx.x2) {
            // Chrono Legionnaire beam.
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(150,215,255,${1 - t})`; ctx.lineWidth = 4 * (1 - t) + 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y - 10); ctx.lineTo(b.x, b.y - 5); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            break;
          }
          const color = fx.kind === 'chrono' ? '120,190,255' : fx.kind === 'convert' ? '130,255,120' : fx.kind === 'bloom' ? '240,140,60' : fx.kind === 'denied' ? '255,80,60' : '230,220,200';
          ctx.strokeStyle = `rgba(${color},${1 - t})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(a.x, a.y - 4, 6 + t * 18, (6 + t * 18) * squash, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
      }
    }
  }

  private glow(x: number, y: number, r: number, rgb: string, alpha = 1) {
    const { ctx } = this;
    if (r <= 0 || alpha <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${0.9 * alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Star-shaped muzzle flash pointing along `angle`. */
  private flash(x: number, y: number, angle: number, size: number) {
    if (size <= 0.5) return;
    const { ctx } = this;
    const fx = x + Math.cos(angle) * 10, fy = y + Math.sin(angle) * (this.iso ? 5 : 7);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,230,150,0.95)';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = angle + (k / 10) * Math.PI * 2, r = k % 2 ? size * 0.35 : (k === 0 ? size * 1.6 : size);
      const px = fx + Math.cos(a) * r, py = fy + Math.sin(a) * r;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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
  const base = item.replace(/^(upgrade|starport):/, '');
  const unit = game.pack.units[base], s = game.pack.structures[base];
  const key = `${game.pack.id}|${base}|${color}`;
  let sprite = iconCache.get(key);
  if (!sprite) {
    if (s?.floor) {
      const c = concreteTile(view);
      sprite = { canvas: c, ox: c.width / 2, oy: c.height / 2 };
    } else if (s) sprite = bake(s.wall ? wallMesh(10, style) : buildingMesh(s.shape, s.w, s.h, style, team), view, undefined, { shadow: false });
    else if (unit && unit.kind !== 'infantry' && unit.shape !== 'rocketeer') {
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
  if (item.startsWith('upgrade:')) {
    // Upgrade badge: a bold arrow in the corner.
    g.fillStyle = '#ffd24a'; g.strokeStyle = '#3a2a00'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W - 12, 4); g.lineTo(W - 3, 14); g.lineTo(W - 8, 14); g.lineTo(W - 8, 22); g.lineTo(W - 16, 22); g.lineTo(W - 16, 14); g.lineTo(W - 21, 14); g.closePath();
    g.fill(); g.stroke();
  }
}
