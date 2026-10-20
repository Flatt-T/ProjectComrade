import React, { useEffect, useRef, useState } from 'react';
import { EngineModule, loadEngine, mountBundledContent } from '../../../packages/client-runtime/src/engine';
import { EngineSnapshot, Faction, parseLaunch, parseOrder, MAP_ID } from '@comrade/contracts';
import './style.css';
declare global {
  interface Window { comrade?: { snapshot(): EngineSnapshot; order(value: unknown): number } }
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<EngineModule>();
  const [faction, setFaction] = useState<Faction>('gdi');
  const [phase, setPhase] = useState<'briefing' | 'loading' | 'playing' | 'error'>('briefing');
  const [status, setStatus] = useState('All game content included');
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
  async function start() {
    if (phase !== 'briefing') return;
    const launch = parseLaunch({ version: 1, type: 'launch', map: MAP_ID, faction });
    setPhase('loading'); setStatus('Starting Vanilla Conquer…');
    try {
      const current = await loadEngine('td', canvas.current!, log, launch.faction);
      engine.current = current;
      await mountBundledContent(current, launch.faction, setStatus);
      window.comrade = {
        snapshot: () => JSON.parse(current.UTF8ToString(current._comrade_snapshot!())),
        order: value => {
          const order = parseOrder(value);
          const action = ['move','attack','harvest','build','train','place'].indexOf(order.action);
          const targets = order.entities.length ? order.entities : [0];
          return targets.reduce((accepted, entity) => accepted + (current.ccall?.('comrade_order', 'number', ['number','number','number','string'], [action, entity, order.target ?? order.cell ?? -1, order.item || '']) || 0), 0);
        },
      };
      setStatus('Deploying forces…');
      current.callMain([]);
      canvas.current!.focus();
    } catch (error) { log(String(error)); setStatus(String(error)); setPhase('error'); }
  }
  function audio() {
    engine.current?._comrade_audio?.();

  }
  const running = phase === 'playing';
  return <main className="battle-shell">
    <header><b className="mark">C</b><div><strong>PROJECT COMRADE</strong><small>TIBERIAN DAWN / FIRST CONTACT</small></div><span className="badge">PLAYABLE SLICE · 01</span><a href="https://github.com/Flatt-T/ProjectComrade">Source ↗</a></header>
    <div className="battle-top"><div><p className="eyebrow">THE CLASSIC FOUNDATION</p><h1>Tiberium Crossing</h1></div><p className="mission-objective">Harvest. Construct. Conquer.<br /><span>One battlefield. GDI versus the Brotherhood of Nod.</span></p></div>
    <section className="game-layout">
      <div className="battlefield">
        <div className="screen-top"><span>{faction.toUpperCase()} COMMAND UPLINK</span><span data-testid="engine-status">{status}</span></div>
        <canvas id="canvas" ref={canvas} width={640} height={400} tabIndex={0} aria-label="Command and Conquer battlefield" onContextMenu={e => e.preventDefault()} />
        {phase === 'briefing' && <div className="briefing">
          <p className="eyebrow">OPERATION / TIBERIUM CROSSING</p><h2>Choose your side.</h2><p>Establish a foothold, secure the Tiberium fields and destroy the opposing base. Your construction yard, refinery, harvester and initial forces are ready.</p>
          <div className="factions"><button className={faction === 'gdi' ? 'selected gdi' : 'gdi'} onClick={() => setFaction('gdi')}><b>GDI</b><span>Global Defense Initiative</span><small>Heavy armour. Superior firepower.</small></button><button className={faction === 'nod' ? 'selected nod' : 'nod'} onClick={() => setFaction('nod')}><b>NOD</b><span>Brotherhood of Nod</span><small>Speed. Subterfuge. Strength through unity.</small></button></div>
          <button className="deploy" onClick={start}>DEPLOY {faction.toUpperCase()} FORCES →</button><small>No installation. No file imports. Game content loads automatically.</small>
        </div>}
        {phase === 'loading' && <div className="loading" role="status"><span className="loader" /><h2>Establishing battlefield link</h2><p>{status}</p><small>Preparing engine and verifying bundled game files.</small></div>}
        {phase === 'error' && <div className="loading"><h2>Deployment interrupted</h2><p>{status}</p><button onClick={() => location.reload()}>Retry deployment</button></div>}
      </div>
      <aside className="command-panel"><p className="eyebrow">COMMAND BRIEFING</p><h2>{running ? 'Operations live' : 'Your orders'}</h2>
        <ol><li><b>Secure an economy</b><span>Select your harvester, then click Tiberium. It returns to the refinery to unload.</span></li><li><b>Expand the base</b><span>Use the original in-game sidebar to build. When ready, click a clear tile beside your base.</span></li><li><b>Eliminate the enemy</b><span>Select or drag-select troops, then click an enemy to attack. Destroy all opposing forces to win.</span></li></ol>
        <div className="controls"><span>SELECT / COMMAND</span><b>Left click</b><span>DESELECT / CANCEL</span><b>Right click</b><span>SCROLL THE MAP</span><b>Move pointer to edge</b><span>SELECT A GROUP</span><b>Drag on the battlefield</b></div>
        <div className="live-stats" data-testid="telemetry" data-frame={snapshot.frame}><span>CREDITS <b>{snapshot.credits ?? '—'}</b></span><span>POWER <b>{snapshot.power ?? '—'} / {snapshot.drain ?? '—'}</b></span><span>BUILDINGS <b>{snapshot.buildings ?? '—'}</b></span><span>HARVESTED <b>{snapshot.harvested ?? '—'}</b></span><span>SIMULATION <b>{snapshot.frame} ticks</b></span></div>
        {snapshot.won && <p className="victory">MISSION ACCOMPLISHED</p>}{snapshot.defeated && <p className="defeat">MISSION FAILED</p>}
        <button disabled={!running} onClick={audio}>{snapshot.audioRunning ? 'SOUND ENABLED' : 'ENABLE GAME AUDIO'}</button><button disabled={!running} onClick={() => canvas.current?.requestFullscreen()}>FULLSCREEN BATTLEFIELD ↗</button><button onClick={() => location.reload()}>NEW OPERATION</button>
      </aside>
    </section>
    <footer><span>VANILLA CONQUER · CLASSIC RULES · 2× DISPLAY</span><span>Classic freeware artwork, original Comrade map. HD redrawn sprites are a later upgrade.</span><a href="/content/td/manifest.json">Content credits ↗</a><a href="/engines/source.txt">Engine licence ↗</a></footer>
    <details><summary>Engine diagnostics</summary><pre>{logs.join('\n')}</pre></details>
  </main>;
}
