// Deterministic foundations for the Comrade Fusion Engine.
// The simulation uses integers only: positions are in leptons (256 per cell), time is
// in ticks (15 per second), and randomness comes from a seeded xorshift generator. The
// same seed and command stream therefore produce the same game on every machine.

export const LEPTONS = 256;
export const TICKS_PER_SECOND = 15;

export function cellCenter(cell: number): number { return cell * LEPTONS + LEPTONS / 2; }
export function toCell(lepton: number): number { return Math.floor(lepton / LEPTONS); }

/** xorshift32 — tiny, fast and identical across JS engines. */
export class Rng {
  private state: number;
  constructor(seed: number) { this.state = (seed | 0) || 0x9e3779b9; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x | 0;
    return (x >>> 0);
  }
  /** Integer in [0, max). */
  int(max: number): number { return max <= 0 ? 0 : this.next() % max; }
  chance(percent: number): boolean { return this.int(100) < percent; }
  get seed(): number { return this.state; }
}

/** Integer square root (floor). Avoids Math.sqrt so results never depend on FPU rounding. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  // Correct any platform rounding so the result is exact.
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return isqrt(dx * dx + dy * dy);
}

/**
 * Facing in 0..255, 0 = north, increasing clockwise (C&C convention).
 * Computed with integer octant maths so it is deterministic.
 */
export function facingTo(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  // Angle within the octant scaled to 0..32, via a rational approximation of atan.
  const small = Math.min(ax, ay), big = Math.max(ax, ay);
  const frac = Math.floor((small * 32) / big); // tan(angle) * 32, 0..32
  // atan(t) ~= (pi/4)t + 0.273 t(1-t); in facing units (64 per quarter turn) that is
  // frac + 11 * frac * (32 - frac) / 1024. Exact at 0 and 45 degrees, within ~1 unit elsewhere.
  const oct = frac + ((11 * frac * (32 - frac)) >> 10);
  let angle: number; // 0..63 for the first quadrant measured from north
  if (ay >= ax) angle = oct; else angle = 64 - oct;
  // Map quadrant: screen y grows downward, north is -y.
  if (dx >= 0 && dy < 0) return angle & 255;
  if (dx >= 0 && dy >= 0) return (128 - angle) & 255;
  if (dx < 0 && dy >= 0) return (128 + angle) & 255;
  return (256 - angle) & 255;
}

/** Signed smallest difference between two facings, in -128..127. */
export function facingDelta(from: number, to: number): number {
  return ((to - from + 384) & 255) - 128;
}

/** FNV-1a over 32-bit integers, used for the per-tick desync checksum. */
export class Hasher {
  private h = 0x811c9dc5;
  add(value: number): this {
    let v = value | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= v & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
      v >>= 8;
    }
    return this;
  }
  addString(s: string): this { for (let i = 0; i < s.length; i++) this.add(s.charCodeAt(i)); return this; }
  get value(): number { return this.h >>> 0; }
}
