// The original Tiberian Dawn and Red Alert artwork, for the two rule packs that replicate
// games whose art is freeware. tools/prepare-art.py bakes the sprites out of the pinned
// content packs into an atlas, a remap mask and an index; this loads them and draws from
// them. Everything else the engine draws stays procedural (packages/fusion/src/art), and
// so does this when the atlas is missing: the renderer simply falls back.

/** One frame in the atlas: position, size, and the offset from the object's centre. */
export type Frame = [x: number, y: number, w: number, h: number, ox: number, oy: number];

interface ShapeEntry {
  w: number;
  h: number;
  /** 0 for buildings, 8 for infantry, 32 for vehicles. */
  facings: number;
  body: Frame[];
  turret?: Frame[];
  /** Infantry only: frames per facing in the walk cycle. */
  walkFrames?: number;
  walk?: Frame[];
}

interface ArtIndex {
  cell: number;
  units: Record<string, ShapeEntry>;
  structures: Record<string, ShapeEntry>;
  /**
   * Ground tiles as [x, y] pairs per terrain, and the resource overlays as one list of
   * frames per density step. Both live in the tile atlas.
   */
  tiles: Record<string, [number, number][] | Frame[][]>;
  trees: Frame[];
  /** Luminance of each step of the house colour ramp, brightest first. */
  remapLuma: number[];
  atlas: { w: number; h: number };
  tileAtlas: { w: number; h: number };
}

/** Which baked art pack a rule pack uses, if any. */
export function artPackFor(packId: string): string | null {
  if (packId === 'td') return 'td';
  if (packId === 'ra1') return 'ra';
  return null;
}

export class ClassicArt {
  private index: ArtIndex | null = null;
  private base: HTMLCanvasElement | null = null;
  private mask: ImageData | null = null;
  private tiles: HTMLImageElement | null = null;
  /** One atlas per house colour, built the first time that colour is drawn. */
  private tinted = new Map<string, HTMLCanvasElement>();

  constructor(readonly pack: string) { void this.load(); }

  get ready() { return !!this.index && !!this.base; }
  get cell() { return this.index?.cell ?? 24; }
  get tileAtlas() { return this.tiles; }

  private async load() {
    try {
      const base = `/content/art/${this.pack}`;
      const response = await fetch(`${base}.json`, { cache: 'force-cache' });
      if (!response.ok) return;
      const index = await response.json() as ArtIndex;
      const [sprites, remap, tiles] = await Promise.all([
        loadImage(`${base}.png`), loadImage(`${base}-remap.png`), loadImage(`${base}-tiles.png`),
      ]);
      const canvas = document.createElement('canvas');
      canvas.width = sprites.width; canvas.height = sprites.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(sprites, 0, 0);
      // The mask says, per pixel, which step of the house ramp it belongs to (0 = none).
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = remap.width; maskCanvas.height = remap.height;
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.drawImage(remap, 0, 0);
      this.mask = maskCtx.getImageData(0, 0, remap.width, remap.height);
      this.base = canvas;
      this.tiles = tiles;
      this.index = index;
    } catch {
      // No baked art: the renderer keeps its procedural models.
    }
  }

  entry(kind: 'unit' | 'structure', id: string): ShapeEntry | undefined {
    if (!this.index) return undefined;
    return kind === 'unit' ? this.index.units[id] : this.index.structures[id];
  }

  tilesFor(terrain: string): [number, number][] | undefined {
    const tiles = this.index?.tiles[terrain];
    return Array.isArray(tiles) && Array.isArray(tiles[0]) && tiles[0].length === 2 ? tiles as [number, number][] : undefined;
  }

  /** Overlay frames for a resource, one list per density step (sparse to rich). */
  resourceSteps(id: string): Frame[][] | undefined {
    const tiles = this.index?.tiles[id];
    if (!Array.isArray(tiles) || !Array.isArray(tiles[0]) || tiles[0].length === 2) return undefined;
    return tiles as Frame[][];
  }

  get treeFrames(): Frame[] { return this.index?.trees ?? []; }

  /**
   * The frame for a facing. The engine counts facing 0..255 clockwise from north, and the
   * sprite sheets are laid out the same way, so this is a straight scale.
   */
  frame(entry: ShapeEntry, facing: number, part: 'body' | 'turret' = 'body'): Frame | undefined {
    const frames = part === 'turret' ? entry.turret : entry.body;
    if (!frames?.length) return undefined;
    if (!entry.facings) return frames[0];
    const step = Math.round((facing * entry.facings) / 256) % entry.facings;
    return frames[step] ?? frames[0];
  }

  /** Infantry walk cycle: the frame for a facing at a point in the animation. */
  walkFrame(entry: ShapeEntry, facing: number, tick: number): Frame | undefined {
    if (!entry.walk?.length || !entry.walkFrames) return this.frame(entry, facing);
    const facings = entry.facings || 8;
    const step = Math.round((facing * facings) / 256) % facings;
    const at = step * entry.walkFrames + (tick % entry.walkFrames);
    return entry.walk[at] ?? this.frame(entry, facing);
  }

  /** The atlas painted in one house's colour, built once per colour. */
  atlasFor(color: string): HTMLCanvasElement | null {
    if (!this.base || !this.mask || !this.index) return null;
    const cached = this.tinted.get(color);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = this.base.width; canvas.height = this.base.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(this.base, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const [r, g, b] = hexToRgb(color);
    const mask = this.mask.data, pixels = image.data;
    for (let i = 0; i < mask.length; i += 4) {
      const step = mask[i];
      if (!step) continue;
      // Westwood shaded a house's colour over sixteen steps; keep the shape, change the hue.
      const luma = this.index.remapLuma[step - 1] ?? 1;
      pixels[i] = Math.min(255, r * luma);
      pixels[i + 1] = Math.min(255, g * luma);
      pixels[i + 2] = Math.min(255, b * luma);
      pixels[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    this.tinted.set(color, canvas);
    return canvas;
  }

  /** Draw one frame with its centre at (x, y) on screen, kept pixel-sharp. */
  draw(ctx: CanvasRenderingContext2D, color: string, frame: Frame, x: number, y: number, scale = 1) {
    const atlas = this.atlasFor(color);
    if (!atlas) return;
    const [sx, sy, w, h, ox, oy] = frame;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, sx, sy, w, h, Math.round(x - ox * scale), Math.round(y - oy * scale), Math.round(w * scale), Math.round(h * scale));
    ctx.imageSmoothingEnabled = smooth;
  }
}

/**
 * Paint a whole battlefield from the theatre's own tiles, one 24x24 tile a cell, choosing
 * between a terrain's tiles by the map's decoration noise so the ground varies as the
 * originals' did. Returns false when the art has no tiles for this map's terrain.
 */
export function paintClassicTerrain(
  art: ClassicArt,
  canvas: HTMLCanvasElement,
  map: { w: number; h: number; terrain: Uint8Array; decor: Uint8Array },
  terrainIds: string[],
  tileW: number,
  tileH: number,
): boolean {
  const atlas = art.tileAtlas;
  if (!atlas || !art.ready) return false;
  const lists = terrainIds.map(id => art.tilesFor(id));
  if (!lists.some(list => list && list.length)) return false;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const cell = art.cell;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      const list = lists[map.terrain[i]] ?? lists[0];
      if (!list || !list.length) continue;
      const [sx, sy] = list[map.decor[i] % list.length];
      ctx.drawImage(atlas, sx, sy, cell, cell, x * tileW, y * tileH, tileW, tileH);
    }
  }
  return true;
}

/** Draw a tile-atlas frame (scenery and overlays, which carry no house colour). */
export function drawTileFrame(
  art: ClassicArt,
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  x: number,
  y: number,
  scale = 1,
) {
  const atlas = art.tileAtlas;
  if (!atlas) return;
  const [sx, sy, w, h, ox, oy] = frame;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sx, sy, w, h, Math.round(x - ox * scale), Math.round(y - oy * scale), Math.round(w * scale), Math.round(h * scale));
  ctx.imageSmoothingEnabled = smooth;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load ${src}`));
    image.src = src;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
