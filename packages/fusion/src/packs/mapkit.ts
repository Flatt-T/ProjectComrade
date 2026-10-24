// Symmetry helpers so authored skirmish maps are fair by construction.
type Placeable = { x: number; y: number; w?: number; h?: number; x2?: number; y2?: number };

/** Each item plus its point reflection through the map centre (two-player maps). */
export function mirror<T extends Placeable>(items: T[], W: number, H: number): T[] {
  return items.flatMap(f => {
    const m = { ...f };
    if (f.w !== undefined) { m.x = W - f.x - f.w; m.y = H - f.y - (f.h ?? 1); } else { m.x = W - 1 - f.x; m.y = H - 1 - f.y; }
    if (f.x2 !== undefined) m.x2 = W - 1 - f.x2;
    if (f.y2 !== undefined) m.y2 = H - 1 - f.y2;
    return [f, m];
  });
}

/** Each item in all four quadrants (four-player maps). Use with point-like features. */
export function quad<T extends Placeable>(items: T[], W: number, H: number): T[] {
  return items.flatMap(f => {
    const fx = (x: number) => W - 1 - x, fy = (y: number) => H - 1 - y;
    const variant = (mx: boolean, my: boolean): T => ({
      ...f,
      x: mx ? fx(f.x) : f.x, y: my ? fy(f.y) : f.y,
      ...(f.x2 !== undefined ? { x2: mx ? fx(f.x2) : f.x2 } : {}),
      ...(f.y2 !== undefined ? { y2: my ? fy(f.y2) : f.y2 } : {}),
    });
    return [f, variant(true, false), variant(false, true), variant(true, true)];
  });
}
