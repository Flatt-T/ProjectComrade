import React, { useMemo, useState } from 'react';
import { LaunchRequest, styleInfo } from '@comrade/contracts';
import Lobby from './Lobby';
import Battle from './Battle';
import FusionBattle from './FusionBattle';
import FusionRequests from './FusionRequests';
import { RoomConnection } from './net';
import './style.css';

export default function App() {
  // One connection for the whole visit: lockstep matches outlive the lobby view.
  const conn = useMemo(() => new RoomConnection(), []);
  const [session, setSession] = useState<{ launch: LaunchRequest; mapName: string } | null>(null);
  const [requests, setRequests] = useState(() => new URLSearchParams(location.search).get('view') === 'fusion-requests');
  const showRequests = (on: boolean) => { setRequests(on); history.replaceState(null, '', on ? '?view=fusion-requests' : location.pathname); };
  const fusion = session && styleInfo(session.launch.style).engine === 'fusion';

  function exit() {
    conn.send({ type: 'leave' });
    conn.resetTurns();
    setSession(null);
    history.replaceState(null, '', location.pathname);
  }

  return <main className={`battle-shell ${fusion ? 'wide' : ''}`}>
    <header>
      <b className="mark">C</b>
      <div><strong>PROJECT COMRADE</strong><small>BROWSER RTS CLASSICS · TIBERIAN DAWN · RED ALERT · DUNE · RED ALERT 2</small></div>
      <span className="badge">{session ? 'OPERATION LIVE' : 'WAR ROOM'}</span>
      {!session && <a href="?view=fusion-requests" onClick={e => { e.preventDefault(); showRequests(!requests); }}>{requests ? 'War room' : 'Fusion requests'}</a>}
      <a href="https://github.com/Flatt-T/ProjectComrade">Source ↗</a>
    </header>

    {!session && <div className="battle-top">
      <div><p className="eyebrow">NO INSTALL · NO ACCOUNT</p><h1>Command the classics, in your browser</h1></div>
      <p className="mission-objective">Pick a callsign. Create or join a game.<br /><span>Share the link. Choose your side and deploy.</span></p>
    </div>}

    {session
      ? fusion
        ? <FusionBattle launch={session.launch} mapName={session.mapName} conn={conn} onExit={exit} />
        : <Battle launch={session.launch} mapName={session.mapName} onExit={exit} />
      : requests ? <FusionRequests onBack={() => showRequests(false)} />
      : <Lobby conn={conn} onLaunch={(launch, mapName) => setSession({ launch, mapName })} />}

    <footer>
      <span>VANILLA CONQUER · COMRADE FUSION ENGINE</span>
      <span>Classic C&amp;C runs the original GPL engine with freeware artwork. The Fusion Engine styles — Tiberian Dawn, Red Alert, Dune and Red Alert 2 — are independent gameplay replications with original procedural art.</span>
      <a href="/content/td/manifest.json">Content credits ↗</a> <a href="/content/audio/manifest.json">Sound credits ↗</a>
      <a href="/engines/source.txt">Engine licence ↗</a>
    </footer>
  </main>;
}
