import React, { useEffect, useRef, useState } from 'react';
import { EngineModule, loadEngine, mountBundledContent } from '../../../packages/client-runtime/src/engine';
import { EngineSnapshot, LaunchRequest, parseOrder, STYLES } from '@comrade/contracts';

declare global {
  interface Window { comrade?: { snapshot(): EngineSnapshot; order(value: unknown): number } }
}

export default function Battle({ launch, mapName, onExit }: { launch: LaunchRequest; mapName: string; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<EngineModule>();
  const started = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'error'>('loading');
  const [status, setStatus] = useState('Starting Vanilla Conquer…');
  const [snapshot, setSnapshot] = useState<EngineSnapshot>({ frame: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const log = (line: string) => setLogs(previous => [...previous.slice(-35), line]);

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

  const running = phase === 'playing';
  const faction = launch.faction;
  return <section className="game-layout">
    <div className="battlefield">
      <div className="screen-top"><span>{faction.toUpperCase()} COMMAND · {mapName.toUpperCase()}</span><span data-testid="engine-status">{status}</span></div>
      <canvas id="canvas" ref={canvas} width={640} height={400} tabIndex={0} aria-label="Command and Conquer battlefield" onContextMenu={e => e.preventDefault()} />
      {phase === 'loading' && <div className="loading" role="status"><span className="loader" /><h2>Establishing battlefield link</h2><p>{status}</p><small>Preparing engine and verifying bundled game files.</small></div>}
      {phase === 'error' && <div className="loading"><h2>Deployment interrupted</h2><p>{status}</p><button onClick={onExit}>Return to lobby</button></div>}
    </div>
    <aside className="command-panel"><p className="eyebrow">COMMAND BRIEFING</p><h2>{running ? 'Operations live' : 'Your orders'}</h2>
      <ol><li><b>Secure an economy</b><span>Select your harvester, then click Tiberium. It returns to the refinery to unload.</span></li><li><b>Expand the base</b><span>Use the original in-game sidebar to build. When ready, click a clear tile beside your base.</span></li><li><b>Eliminate the enemy</b><span>Select or drag-select troops, then click an enemy to attack. Destroy all opposing forces to win.</span></li></ol>
      <div className="controls"><span>SELECT / COMMAND</span><b>Left click</b><span>DESELECT / CANCEL</span><b>Right click</b><span>SCROLL THE MAP</span><b>Move pointer to edge</b><span>SELECT A GROUP</span><b>Drag on the battlefield</b></div>
      <div className="live-stats" data-testid="telemetry" data-frame={snapshot.frame}><span>CREDITS <b>{snapshot.credits ?? '—'}</b></span><span>POWER <b>{snapshot.power ?? '—'} / {snapshot.drain ?? '—'}</b></span><span>BUILDINGS <b>{snapshot.buildings ?? '—'}</b></span><span>HARVESTED <b>{snapshot.harvested ?? '—'}</b></span><span>SIMULATION <b>{snapshot.frame} ticks</b></span></div>
      {snapshot.won && <p className="victory">MISSION ACCOMPLISHED</p>}{snapshot.defeated && <p className="defeat">MISSION FAILED</p>}
      <button disabled={!running} onClick={() => engine.current?._comrade_audio?.()}>{snapshot.audioRunning ? 'SOUND ENABLED' : 'ENABLE GAME AUDIO'}</button>
      <button disabled={!running} onClick={() => canvas.current?.requestFullscreen()}>FULLSCREEN BATTLEFIELD ↗</button>
      <button onClick={onExit}>LEAVE OPERATION</button>
    </aside>
    <details><summary>Engine diagnostics</summary><pre>{logs.join('\n')}</pre></details>
  </section>;
}
