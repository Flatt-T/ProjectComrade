import React, { useState } from 'react';
import { LaunchRequest } from '@comrade/contracts';
import Lobby from './Lobby';
import Battle from './Battle';
import './style.css';

export default function App() {
  const [session, setSession] = useState<{ launch: LaunchRequest; mapName: string } | null>(null);

  return <main className="battle-shell">
    <header>
      <b className="mark">C</b>
      <div><strong>PROJECT COMRADE</strong><small>BROWSER RTS CLASSICS · TIBERIAN DAWN</small></div>
      <span className="badge">{session ? 'OPERATION LIVE' : 'WAR ROOM'}</span>
      <a href="https://github.com/Flatt-T/ProjectComrade">Source ↗</a>
    </header>

    {!session && <div className="battle-top">
      <div><p className="eyebrow">NO INSTALL · NO ACCOUNT</p><h1>Command the classics, in your browser</h1></div>
      <p className="mission-objective">Pick a callsign. Create or join a game.<br /><span>Share the link. Choose your side and deploy.</span></p>
    </div>}

    {session
      ? <Battle launch={session.launch} mapName={session.mapName} onExit={() => { setSession(null); history.replaceState(null, '', location.pathname); }} />
      : <Lobby onLaunch={(launch, mapName) => setSession({ launch, mapName })} />}

    <footer>
      <span>VANILLA CONQUER · CLASSIC RULES · 2× DISPLAY</span>
      <span>Classic freeware artwork, original Comrade maps. HD redrawn sprites are a later upgrade.</span>
      <a href="/content/td/manifest.json">Content credits ↗</a>
      <a href="/engines/source.txt">Engine licence ↗</a>
    </footer>
  </main>;
}
