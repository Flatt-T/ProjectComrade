import React, { useEffect, useRef, useState } from 'react';
import { EngineModule, loadEngine, mountBundledContent, stopEngine } from '../../../packages/client-runtime/src/engine';
import { EngineSnapshot, LaunchRequest, parseOrder, STYLES } from '@comrade/contracts';
import { createUpscaler, Upscaler } from './upscale';
import { attachTouchGestures, goLandscape, isTouchDevice, trackVisibleHeight } from './touch';
import { enterBattleHelp, toggleHelp } from './help';

/** Send a mouse event to the engine canvas, which SDL reads as the pointer. */
function mouse(el: HTMLElement, type: string, x: number, y: number, button = 0) {
  const r = el.getBoundingClientRect();
  const down = type === 'mousedown';
  el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, view: window, clientX: r.left + x, clientY: r.top + y, screenX: r.left + x, screenY: r.top + y,
    button, buttons: down ? (button === 2 ? 2 : 1) : 0,
  }));
}

declare global {
  interface Window { comrade?: { snapshot(): EngineSnapshot; order(value: unknown): number } }
}

export default function Battle({ launch, mapName, onExit }: { launch: LaunchRequest; mapName: string; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const engine = useRef<EngineModule>();
  const upscaler = useRef<Upscaler | null>(null);
  const started = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'error'>('loading');
  const [enhanced, setEnhanced] = useState(() => localStorage.getItem('comrade-enhanced') === '1');
  const [enhancedOk, setEnhancedOk] = useState(true);
  const [status, setStatus] = useState('Starting Vanilla Conquer…');
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({ frame: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const log = (line: string) => setLogs(previous => [...previous.slice(-35), line]);
  const [touch] = useState(isTouchDevice);
  const [drawer, setDrawer] = useState(false);
  const [rotateOk, setRotateOk] = useState(false);

  // Touch: the original engine only knows a mouse. Taps become clicks, a drag scrolls
  // the map by holding the pointer at the screen edge (as the original game scrolls),
  // hold-then-drag is a box select and a two-finger tap is the right click.
  // The help widget moves into this command panel while the battle runs.
  useEffect(() => enterBattleHelp(), []);
  useEffect(() => {
    if (!touch || !stack.current || !canvas.current) return;
    const c = canvas.current;
    void goLandscape();
    document.body.classList.add('touch-battle');
    const untrack = trackVisibleHeight();
    const inside = (on: boolean) => { if (engine.current) engine.current.comradePointerInside = on; };
    let idle = 0;
    const stopScroll = () => { clearTimeout(idle); inside(false); };
    const off = attachTouchGestures(stack.current, {
      tap: (x, y) => { inside(true); mouse(c, 'mousemove', x, y); mouse(c, 'mousedown', x, y); mouse(c, 'mouseup', x, y); },
      pan: (dx, dy) => {
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        const w = c.clientWidth, h = c.clientHeight;
        // The view follows the finger, so the pointer goes to the opposite edge. The engine
        // scrolls only on its very last pixel, which rounding can miss, so overshoot it.
        const ex = Math.abs(dx) > Math.abs(dy) * 0.4 ? (dx < 0 ? w + 3 : 0) : w / 2;
        const ey = Math.abs(dy) > Math.abs(dx) * 0.4 ? (dy < 0 ? h + 3 : 0) : h / 2;
        inside(true); mouse(c, 'mousemove', ex, ey);
        clearTimeout(idle); idle = window.setTimeout(stopScroll, 140);
      },
      panEnd: stopScroll,
      boxStart: (x, y) => { inside(true); mouse(c, 'mousemove', x, y); mouse(c, 'mousedown', x, y); },
      boxMove: (x, y) => mouse(c, 'mousemove', x, y),
      boxEnd: (x, y) => { mouse(c, 'mousemove', x, y); mouse(c, 'mouseup', x, y); },
      boxCancel: () => mouse(c, 'mouseup', c.clientWidth / 2, c.clientHeight / 2),
      twoFingerTap: (x, y) => { inside(true); mouse(c, 'mousemove', x, y); mouse(c, 'mousedown', x, y, 2); mouse(c, 'mouseup', x, y, 2); },
    });
    const once = () => { void goLandscape(); };
    window.addEventListener('touchend', once, { once: true });
    return () => {
      off(); stopScroll(); window.removeEventListener('touchend', once);
      document.body.classList.remove('touch-battle'); untrack();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [touch]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = engine.current;
      if (current?._comrade_snapshot) {
        try {
          const value = JSON.parse(current.UTF8ToString(current._comrade_snapshot()));
          setSnapshot(value);
          if (value.frame > 0) { setPhase('playing'); setStatus('Battlefield active'); }
        } catch { /* Initialization has not finished yet. */ }
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Leaving has to take the engine with it: an Emscripten module keeps its main loop (and
  // its audio) running even once this component and its canvas are gone.
  function leave() {
    const stopped = stopEngine(engine.current);
    engine.current = undefined;
    delete window.comrade;
    onExit();
    // Older engine builds export no way to stop; starting the page over is the only
    // thing that silences them.
    if (!stopped) location.reload();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const engineKind = STYLES.find(s => s.id === launch.style)?.engine === 'vanilla-ra' ? 'ra' : 'td';
        const current = await loadEngine(engineKind, canvas.current!, log, launch.faction);
        engine.current = current;
        await mountBundledContent(current, { faction: launch.faction, mapId: launch.map, settings: launch.settings }, setStatus);
        window.comrade = {
          snapshot: () => JSON.parse(current.UTF8ToString(current._comrade_snapshot!())),
          order: value => {
            const order = parseOrder(value);
            const action = ['move', 'attack', 'harvest', 'build', 'train', 'place'].indexOf(order.action);
            const targets = order.entities.length ? order.entities : [0];
            return targets.reduce((accepted, entity) => accepted + (current.ccall?.('comrade_order', 'number', ['number', 'number', 'number', 'string'], [action, entity, order.target ?? order.cell ?? -1, order.item || '']) || 0), 0);
          },
        };
        setStatus('Deploying forces…');
        current.callMain([]);
        canvas.current!.focus();
      } catch (error) { log(String(error)); setStatus(String(error)); setPhase('error'); }
    })();
  }, [launch]);

  // Enhanced render overlay: sample the engine canvas and upscale it with WebGL.
  useEffect(() => {
    upscaler.current?.stop();
    upscaler.current = null;
    if (phase === 'playing' && enhanced && canvas.current && display.current) {
      const up = createUpscaler(canvas.current, display.current);
      if (up) upscaler.current = up;
      else setEnhancedOk(false);
    }
    return () => { upscaler.current?.stop(); upscaler.current = null; };
  }, [phase, enhanced]);

  const running = phase === 'playing';
  const faction = launch.faction;
  const useEnhanced = enhanced && enhancedOk;
  return <section className={`game-layout${touch ? ' touch' : ''}${drawer ? ' drawer-open' : ''}`}>
    <div className="battlefield">
      <div className="screen-top"><span>{faction.toUpperCase()} COMMAND · {mapName.toUpperCase()}</span><span data-testid="engine-status">{status}</span></div>
      <div className={useEnhanced ? 'canvas-stack enhanced' : 'canvas-stack'} ref={stack}>
        <canvas id="canvas" ref={canvas} width={640} height={400} tabIndex={0} aria-label="Command and Conquer battlefield" onContextMenu={e => e.preventDefault()} />
        <canvas className="upscale-display" ref={display} style={{ display: useEnhanced ? 'block' : 'none' }} aria-hidden="true" />
      </div>
      {phase === 'loading' && <div className="loading" role="status"><span className="loader" /><h2>Establishing battlefield link</h2><p>{status}</p><small>Preparing engine and verifying bundled game files.</small></div>}
      {phase === 'error' && <div className="loading"><h2>Deployment interrupted</h2><p>{status}</p><button onClick={leave}>Return to lobby</button></div>}
      {touch && <div className="fusion-rotate" hidden={rotateOk}>
        <p>Turn your device sideways to command the battlefield.</p>
        <button onClick={() => void goLandscape()}>GO FULL SCREEN</button>
        <button onClick={() => setRotateOk(true)}>PLAY UPRIGHT</button>
      </div>}
    </div>
    {touch && <button className="fusion-drawer-toggle" onClick={() => setDrawer(v => !v)} aria-expanded={drawer} aria-label={drawer ? 'Hide the command panel' : 'Show the command panel'}>
      {drawer ? '▶' : '◀'}<span>{drawer ? 'HIDE' : 'MENU'}</span>
    </button>}
    <aside className="command-panel"><p className="eyebrow">COMMAND BRIEFING</p><h2>{running ? 'Operations live' : 'Your orders'}</h2>
      <ol><li><b>Secure an economy</b><span>Select your harvester, then click Tiberium. It returns to the refinery to unload.</span></li><li><b>Expand the base</b><span>Use the original in-game sidebar to build. When ready, click a clear tile beside your base.</span></li><li><b>Eliminate the enemy</b><span>Select or drag-select troops, then click an enemy to attack. Destroy all opposing forces to win.</span></li></ol>
      {touch ? <div className="controls"><span>SELECT / COMMAND</span><b>Tap</b><span>DESELECT / CANCEL</span><b>Two-finger tap</b><span>SCROLL THE MAP</span><b>Drag a finger</b><span>SELECT A GROUP</span><b>Hold, then drag</b></div>
      : <div className="controls"><span>SELECT / COMMAND</span><b>Left click</b><span>DESELECT / CANCEL</span><b>Right click</b><span>SCROLL THE MAP</span><b>Move pointer to edge</b><span>SELECT A GROUP</span><b>Drag on the battlefield</b></div>}
      <div className="live-stats" data-testid="telemetry" data-frame={snapshot.frame}><span>CREDITS <b>{snapshot.credits ?? '—'}</b></span><span>POWER <b>{snapshot.power ?? '—'} / {snapshot.drain ?? '—'}</b></span><span>BUILDINGS <b>{snapshot.buildings ?? '—'}</b></span><span>HARVESTED <b>{snapshot.harvested ?? '—'}</b></span><span>SIMULATION <b>{snapshot.frame} ticks</b></span></div>
      {snapshot.won && <p className="victory">MISSION ACCOMPLISHED</p>}{snapshot.defeated && <p className="defeat">MISSION FAILED</p>}
      <button disabled={!running} onClick={() => engine.current?._comrade_audio?.()}>{snapshot.audioRunning ? 'SOUND ENABLED' : 'ENABLE GAME AUDIO'}</button>
      <button disabled={!enhancedOk} onClick={() => setEnhanced(v => { try { localStorage.setItem('comrade-enhanced', v ? '0' : '1'); } catch { /* ignore */ } return !v; })} title={enhancedOk ? 'Toggle WebGL smoothing over the classic framebuffer' : 'WebGL is unavailable in this browser'}>{!enhancedOk ? 'ENHANCED VIEW UNAVAILABLE' : useEnhanced ? 'VIEW · ENHANCED (SMOOTH)' : 'VIEW · CLASSIC (SHARP)'}</button>
      <button disabled={!running} onClick={() => stack.current?.requestFullscreen()}>FULLSCREEN BATTLEFIELD ↗</button>
      <button onClick={() => toggleHelp()}>HELP &amp; REPORTS</button>
      <button onClick={leave}>LEAVE OPERATION</button>
    </aside>
    <details><summary>Engine diagnostics</summary><pre>{logs.join('\n')}</pre></details>
  </section>;
}
