import React, { useRef, useState } from 'react';
import { EngineModule, loadEngine, mountGameFiles } from '../../../packages/client-runtime/src/engine';
import './style.css';

function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<EngineModule>();
  const [game, setGame] = useState<'td' | 'ra'>('td');
  const [state, setState] = useState('Ready to initialize');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const log = (line: string) => setLogs(previous => [...previous.slice(-99), line]);
  async function initialize() {
    setBusy(true);
    try {
      engine.current = await loadEngine(game, canvas.current!, log);
      engine.current.FS.writeFile('/comrade-probe', new Uint8Array([67, 48, 52]));
      if (engine.current.FS.readFile('/comrade-probe')[0] !== 67) throw new Error('MEMFS probe failed');
      setState('WASM initialized · MEMFS verified');
      log('WASM instance ready. main() has not started.');
    } catch (error) { setState('Initialization failed'); log(String(error)); }
    finally { setBusy(false); }
  }
  async function launch() {
    setBusy(true);
    try {
      const mounted = await mountGameFiles(engine.current!, files);
      log(`Mounted locally: ${mounted.join(', ')}`);
      setState('Engine starting · gameplay unverified');
      engine.current!.callMain([]);
    } catch (error) { setState('Engine stopped'); log(String(error)); }
    finally { setBusy(false); }
  }
  return <main>
    <header><b className="mark">C</b><span>PROJECT COMRADE</span><span className="badge">DEVELOPMENT / C04</span></header>
    <section className="intro"><p className="eyebrow">CLASSIC ENGINES. NEW FRONTIER.</p><h1>The battlefield,<br />back in your browser.</h1><p>Preserving the classics, one engine milestone at a time.<br />Initialize the engine and bring your own original game data.</p></section>
    <section className="workspace"><aside><p className="eyebrow">ENGINE WORKBENCH</p><h2>Choose your front</h2>
      <label htmlFor="game">Game engine</label><select id="game" value={game} disabled={busy || !!engine.current} onChange={event => setGame(event.target.value as 'td' | 'ra')}><option value="td">Command &amp; Conquer · Tiberian Dawn</option><option value="ra">Command &amp; Conquer · Red Alert</option></select>
      <button disabled={busy || !!engine.current} onClick={initialize}>{busy ? 'Working…' : '01 / Initialize WASM'}</button>
      <label htmlFor="data">Original game files</label><input id="data" type="file" multiple disabled={busy} onChange={event => setFiles(Array.from(event.target.files || []))} />
      <p className="hint">Select extracted game files, including MIX archives. Files stay in this browser session. Reload to change engines or clear imported data.</p>
      <button disabled={busy || !engine.current || !files.length} onClick={launch}>02 / Mount data &amp; start</button>
      <p role="status" data-testid="engine-status" className="status">{state}</p>
    </aside><div className="viewport"><div className="viewport-label">ENGINE OUTPUT <span>LOCAL SESSION</span></div><canvas ref={canvas} width={640} height={400} aria-label="Game engine canvas" /><div className="console" role="log" aria-label="Engine log">{logs.length ? logs.map((line, index) => <div key={index}>{line}</div>) : '> Awaiting engine initialization_'}</div></div></section>
    <footer><span>WASM + MEMFS / EXPERIMENTAL BUILD</span><span>Gameplay and reference fidelity await validation. Multiplayer and audio are pending.</span><a href="/engines/source.txt">Source &amp; licences ↗</a></footer>
  </main>;
}

export default App;
