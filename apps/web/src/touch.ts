/**
 * Touch gestures for the battlefield, in element-local CSS pixels.
 *
 * - tap / double tap
 * - one-finger drag: pan
 * - long press, then drag: box select
 * - two fingers: pinch to zoom (and pan with the midpoint)
 * - two-finger tap: cancel / deselect (the right click)
 *
 * Listeners run in the capture phase and stop the events there, so nothing inside the
 * element (such as the classic engine's own SDL touch handling) sees them.
 */
export interface TouchHandlers {
  tap?(x: number, y: number): void;
  doubleTap?(x: number, y: number): void;
  pan?(dx: number, dy: number, x: number, y: number): void;
  panEnd?(): void;
  pinch?(factor: number, cx: number, cy: number): void;
  boxStart?(x: number, y: number): void;
  boxMove?(x: number, y: number): void;
  boxEnd?(x: number, y: number): void;
  boxCancel?(): void;
  twoFingerTap?(x: number, y: number): void;
}

const MOVE = 10, LONG_PRESS = 450, DOUBLE_TAP = 320;

export function attachTouchGestures(el: HTMLElement, h: TouchHandlers) {
  const pts = new Map<number, { x: number; y: number }>();
  let mode: 'idle' | 'pending' | 'pan' | 'box' | 'pinch' | 'done' = 'idle';
  let start = { x: 0, y: 0, t: 0 }, last = { x: 0, y: 0 };
  let pinch = { dist: 0, mx: 0, my: 0, moved: false, t: 0 };
  let lastTap = { x: -1e9, y: -1e9, t: -1e9 };
  let timer = 0;

  const local = (t: Touch) => { const r = el.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const pair = () => {
    const [a, b] = [...pts.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const clear = () => { clearTimeout(timer); timer = 0; };
  const stop = (ev: TouchEvent) => { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); };

  function down(ev: TouchEvent) {
    stop(ev);
    for (const t of Array.from(ev.changedTouches)) pts.set(t.identifier, local(t));
    if (pts.size === 1 && mode === 'idle') {
      const p = [...pts.values()][0];
      start = { ...p, t: performance.now() }; last = p; mode = 'pending';
      timer = window.setTimeout(() => {
        if (mode !== 'pending') return;
        mode = 'box'; navigator.vibrate?.(12); h.boxStart?.(start.x, start.y);
      }, LONG_PRESS);
    } else if (pts.size >= 2) {
      clear();
      if (mode === 'box') h.boxCancel?.();
      if (mode === 'pan') h.panEnd?.();
      const quick = mode === 'pending' || mode === 'idle';
      mode = 'pinch';
      pinch = { ...pair(), moved: !quick, t: performance.now() };
    }
  }

  function move(ev: TouchEvent) {
    stop(ev);
    for (const t of Array.from(ev.changedTouches)) if (pts.has(t.identifier)) pts.set(t.identifier, local(t));
    if (mode === 'pinch' && pts.size >= 2) {
      const now = pair();
      if (Math.abs(now.dist - pinch.dist) > 2 || Math.hypot(now.mx - pinch.mx, now.my - pinch.my) > 2) {
        if (Math.abs(now.dist - pinch.dist) > MOVE || Math.hypot(now.mx - pinch.mx, now.my - pinch.my) > MOVE) pinch.moved = true;
        if (pinch.moved) {
          if (pinch.dist > 0) h.pinch?.(now.dist / pinch.dist, now.mx, now.my);
          h.pan?.(now.mx - pinch.mx, now.my - pinch.my, now.mx, now.my);
          pinch = { ...pinch, ...now };
        }
      }
      return;
    }
    if (pts.size !== 1) return;
    const p = [...pts.values()][0];
    if (mode === 'pending' && Math.hypot(p.x - start.x, p.y - start.y) > MOVE) { clear(); mode = 'pan'; }
    if (mode === 'pan') h.pan?.(p.x - last.x, p.y - last.y, p.x, p.y);
    else if (mode === 'box') h.boxMove?.(p.x, p.y);
    last = p;
  }

  function up(ev: TouchEvent) {
    stop(ev);
    const ended = Array.from(ev.changedTouches).map(t => ({ ...local(t), id: t.identifier }));
    for (const t of ended) pts.delete(t.id);
    if (pts.size > 0) {
      // A finger left a pinch: stop panning with the other one until all are lifted.
      if (mode === 'pinch' && pts.size === 1) mode = pinch.moved ? 'done' : 'pinch';
      return;
    }
    clear();
    const p = ended[ended.length - 1] ?? last;
    const now = performance.now();
    if (ev.type === 'touchcancel') {
      if (mode === 'box') h.boxCancel?.();
      if (mode === 'pan') h.panEnd?.();
    } else if (mode === 'pending') {
      if (now - lastTap.t < DOUBLE_TAP && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) { h.tap?.(p.x, p.y); h.doubleTap?.(p.x, p.y); lastTap = { x: -1e9, y: -1e9, t: -1e9 }; }
      else { h.tap?.(p.x, p.y); lastTap = { ...p, t: now }; }
    } else if (mode === 'pan') h.panEnd?.();
    else if (mode === 'box') h.boxEnd?.(p.x, p.y);
    else if (mode === 'pinch' && !pinch.moved && now - pinch.t < 400) h.twoFingerTap?.(pinch.mx, pinch.my);
    mode = 'idle';
  }

  const opts = { capture: true, passive: false } as const;
  el.addEventListener('touchstart', down, opts);
  el.addEventListener('touchmove', move, opts);
  el.addEventListener('touchend', up, opts);
  el.addEventListener('touchcancel', up, opts);
  return () => {
    clear();
    el.removeEventListener('touchstart', down, opts);
    el.removeEventListener('touchmove', move, opts);
    el.removeEventListener('touchend', up, opts);
    el.removeEventListener('touchcancel', up, opts);
  };
}

/** Phones and tablets: a coarse primary pointer, or touch with no hover. */
export function isTouchDevice() {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
}

/** Go full screen and turn to landscape where the browser allows it (needs a user gesture). */
export async function goLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* Not allowed here (iPhone Safari, or no recent gesture). */ }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> };
    await o?.lock?.('landscape');
  } catch { /* Unsupported, or only allowed in full screen. */ }
}
