import React, { useEffect, useRef, useState } from 'react';
import {
  CreditsPreset, GameStyle, LaunchRequest, MapInfo,
  RoomOptions, RoomState, RoomSummary, ServerMessage, STYLES,
} from '@comrade/contracts';

const CREDIT_LABELS: Record<CreditsPreset, string> = { low: 'Low (3000)', standard: 'Standard (6000)', high: 'High (12000)' };
const CODE_WORDS = ['fox', 'hawk', 'bear', 'wolf', 'echo', 'nova', 'iron', 'rook', 'kilo', 'zulu'];
const randomCode = () => `${CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]}-${Math.floor(1000 + Math.random() * 8999)}`;
const styleName = (id: GameStyle) => STYLES.find(s => s.id === id)?.name ?? id;

export default function Lobby({ onLaunch }: { onLaunch: (launch: LaunchRequest, mapName: string) => void }) {
  const socket = useRef<WebSocket>();
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('comrade-name') || '');
  const [entered, setEntered] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [maps, setMaps] = useState<MapInfo[]>([]);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('room') || '');
  const [copied, setCopied] = useState(false);
  const myId = useRef<string>('');
  const launched = useRef(false);

  useEffect(() => {
    fetch('/content/td/manifest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(m => m?.maps && setMaps(m.maps)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    socket.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => { setConnected(false); setRoom(null); };
    ws.onmessage = event => {
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'welcome') myId.current = message.id;
      else if (message.type === 'rooms') setRooms(message.rooms);
      else if (message.type === 'room') { setRoom(message); setError(''); }
      else if (message.type === 'error') setError(message.message);
    };
    return () => ws.close();
  }, []);

  const send = (payload: object) => socket.current?.readyState === WebSocket.OPEN && socket.current.send(JSON.stringify({ version: 1, ...payload }));
  const me = room?.players.find(p => p.id === myId.current);
  const isHost = !!me?.host;

  // When the host starts, every client in the room launches the configured scenario.
  useEffect(() => {
    if (room?.phase === 'started' && me && !launched.current) {
      launched.current = true;
      const mapName = maps.find(m => m.id === room.options.map)?.name ?? room.options.map;
      onLaunch({ version: 1, type: 'launch', map: room.options.map, faction: me.faction, style: room.options.style, settings: room.options.settings }, mapName);
    }
  }, [room, me, maps]);

  function enter() {
    const trimmed = name.trim();
    if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(trimmed)) { setError('Enter a name (letters, numbers, 1-24 chars).'); return; }
    localStorage.setItem('comrade-name', trimmed); setEntered(true); setError('');
    if (joinCode) join(joinCode);
  }
  function join(code: string) {
    const normalized = code.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (!/^[a-z0-9-]{3,32}$/.test(normalized)) { setError('Invalid game code.'); return; }
    send({ type: 'join', room: normalized, name: name.trim() || 'Commander', faction: 'gdi' });
  }
  const createGame = () => send({ type: 'join', room: randomCode(), name: name.trim() || 'Commander', faction: 'gdi' });
  const configure = (patch: Partial<RoomOptions>) => room && send({ type: 'configure', options: { ...room.options, ...patch } });
  const configureSettings = (patch: Partial<RoomOptions['settings']>) => room && send({ type: 'configure', options: { ...room.options, settings: { ...room.options.settings, ...patch } } });
  function copyLink() {
    if (!room) return;
    navigator.clipboard?.writeText(`${location.origin}/?room=${room.room}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined);
  }

  // Name gate.
  if (!entered) return <div className="lobby-gate">
    <p className="eyebrow">COMMANDER IDENTIFICATION</p>
    <h2>Enter your callsign</h2>
    <p>No account, no install. Pick a name and jump straight into a lobby.</p>
    <input value={name} maxLength={24} placeholder="Commander" onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()} aria-label="Your name" />
    <button className="deploy" onClick={enter}>ENTER THE WAR ROOM →</button>
    {error && <small className="lobby-error">{error}</small>}
  </div>;

  // In a room.
  if (room) {
    const chosenMap = maps.find(m => m.id === room.options.map);
    const playable = STYLES.filter(s => s.playable);
    const othersReady = room.players.filter(p => p.id !== room.host).every(p => p.ready);
    return <div className="lobby-room">
      <div className="room-main">
        <div className="room-head"><div><p className="eyebrow">WAR ROOM</p><h2>{room.room}</h2></div>
          <div className="room-actions"><button onClick={copyLink}>{copied ? 'LINK COPIED ✓' : 'COPY INVITE LINK'}</button><button onClick={() => { send({ type: 'leave' }); setRoom(null); }}>LEAVE</button></div></div>
        <p className="room-share">Invite link: <code>{location.origin}/?room={room.room}</code></p>

        <div className="players">
          {room.players.map(p => <div key={p.id} className={`player ${p.faction}`}>
            <span className="pname">{p.name}{p.host && <em> · HOST</em>}{p.id === myId.current && <em> · YOU</em>}</span>
            <span className="pfaction">{p.faction.toUpperCase()}</span>
            <span className={p.ready ? 'pready on' : 'pready'}>{p.id === room.host ? 'HOST' : p.ready ? 'READY' : 'NOT READY'}</span>
          </div>)}
          {Array.from({ length: Math.max(0, room.options.maxPlayers - room.players.length) }).map((_, i) =>
            <div key={`open-${i}`} className="player open"><span className="pname">Open slot</span><span className="pfaction">—</span><span className="pready">WAITING</span></div>)}
        </div>

        <div className="faction-pick">
          <span className="eyebrow">YOUR SIDE</span>
          <div className="factions">
            <button className={me?.faction === 'gdi' ? 'selected gdi' : 'gdi'} onClick={() => send({ type: 'faction', faction: 'gdi' })}><b>GDI</b><span>Global Defense Initiative</span><small>Heavy armour. Superior firepower.</small></button>
            <button className={me?.faction === 'nod' ? 'selected nod' : 'nod'} onClick={() => send({ type: 'faction', faction: 'nod' })}><b>NOD</b><span>Brotherhood of Nod</span><small>Speed. Subterfuge. Strength through unity.</small></button>
          </div>
        </div>

        <div className="room-launch">
          {isHost
            ? <button className="deploy" disabled={!othersReady} onClick={() => send({ type: 'start' })}>START OPERATION →</button>
            : <button className="deploy" onClick={() => send({ type: 'ready', ready: !me?.ready })}>{me?.ready ? 'CANCEL READY' : 'READY UP ✓'}</button>}
          <small>{isHost ? (othersReady ? 'All commanders ready. Launch when you are.' : 'Waiting for the other commanders to ready up.') : 'Ready up — the host launches the match.'} Each commander drops into the configured battlefield. Live shared simulation is the next milestone.</small>
        </div>
        {error && <small className="lobby-error">{error}</small>}
      </div>

      <aside className="room-config">
        <p className="eyebrow">MATCH SETUP{!isHost && ' · HOST CONTROLLED'}</p>
        <label>Game style<select disabled={!isHost} value={room.options.style} onChange={e => configure({ style: e.target.value as GameStyle })}>
          {playable.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>Battlefield<select disabled={!isHost} value={room.options.map} onChange={e => configure({ map: e.target.value })}>
          {maps.map(m => <option key={m.id} value={m.id}>{m.name} · {m.theater.toLowerCase()}</option>)}
        </select></label>
        {chosenMap && <p className="map-blurb">{chosenMap.description}</p>}
        <label>Visibility<select disabled={!isHost} value={room.options.visibility} onChange={e => configure({ visibility: e.target.value as RoomOptions['visibility'] })}>
          <option value="public">Public — listed for anyone</option>
          <option value="invite">Invite only — link required</option>
        </select></label>
        <label>Max players<select disabled={!isHost} value={room.options.maxPlayers} onChange={e => configure({ maxPlayers: Number(e.target.value) })}>
          {[2, 3, 4].map(n => <option key={n} value={n}>{n} commanders</option>)}
        </select></label>
        <label>Starting credits<select disabled={!isHost} value={room.options.settings.credits} onChange={e => configureSettings({ credits: e.target.value as CreditsPreset })}>
          {(['low', 'standard', 'high'] as CreditsPreset[]).map(c => <option key={c} value={c}>{CREDIT_LABELS[c]}</option>)}
        </select></label>
        <label>Tech level<select disabled={!isHost} value={room.options.settings.techLevel} onChange={e => configureSettings({ techLevel: Number(e.target.value) })}>
          {[3, 6, 10, 15].map(n => <option key={n} value={n}>Level {n}{n === 15 ? ' (full)' : ''}</option>)}
        </select></label>
        {!isHost && <small>Only the host can change these.</small>}
      </aside>
    </div>;
  }

  // Lobby browser.
  const openRooms = rooms.filter(r => r.phase === 'lobby' && r.players < r.maxPlayers);
  return <div className="lobby-browser">
    <div className="lobby-left">
      <p className="eyebrow">WAR ROOM · {connected ? 'ONLINE' : 'CONNECTING…'}</p>
      <h2>Public games</h2>
      <div className="room-list">
        {openRooms.length === 0 && <p className="empty">No public games right now. Create one and share the link.</p>}
        {openRooms.map(r => <button key={r.room} className="room-row" onClick={() => join(r.room)}>
          <span className="rr-code">{r.room}</span>
          <span className="rr-meta">{styleName(r.style)} · {maps.find(m => m.id === r.map)?.name ?? r.map}</span>
          <span className="rr-count">{r.players}/{r.maxPlayers}</span>
          <span className="rr-host">host {r.hostName}</span>
        </button>)}
      </div>
    </div>
    <aside className="lobby-right">
      <p className="eyebrow">COMMANDER {name.trim().toUpperCase() || 'ANON'}</p>
      <h2>Jump in</h2>
      <button className="deploy" onClick={createGame}>CREATE A NEW GAME →</button>
      <p className="divider">or join by code</p>
      <div className="join-row">
        <input value={joinCode} placeholder="e.g. fox-7421" onChange={e => setJoinCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && join(joinCode)} aria-label="Game code" />
        <button onClick={() => join(joinCode)}>JOIN</button>
      </div>
      <small>Share a game's link and your friends drop straight into the same war room — no sign-up.</small>
      {error && <small className="lobby-error">{error}</small>}
    </aside>
  </div>;
}
