import React, { useEffect, useRef, useState } from 'react';
import {
  AILevel, CreditsPreset, DEFAULT_SETTINGS, GameStyle, LaunchRequest, MapInfo, RoomOptions, RoomState, RoomSummary, STYLES, styleInfo, WORMS_MAX,
} from '@comrade/contracts';
import { PACKS } from '../../../packages/fusion/src/index';
import type { RoomConnection } from './net';
import Chat from './Chat';

interface LobbyMap { id: string; name: string; description: string; maxPlayers: number; detail: string }

const CREDIT_LABELS: Record<string, Record<CreditsPreset, string>> = {
  'td-classic': { low: 'Low (3000)', standard: 'Standard (6000)', high: 'High (12000)' },
};
const CODE_WORDS = ['fox', 'hawk', 'bear', 'wolf', 'echo', 'nova', 'iron', 'rook', 'kilo', 'zulu'];
const randomCode = () => `${CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]}-${Math.floor(1000 + Math.random() * 8999)}`;

function creditLabels(style: GameStyle): Record<CreditsPreset, string> {
  const info = styleInfo(style);
  if (info.engine === 'fusion' && info.pack) {
    const c = PACKS[info.pack].startCredits;
    return { low: `Low (${c.low})`, standard: `Standard (${c.standard})`, high: `High (${c.high})` };
  }
  return CREDIT_LABELS[style] ?? CREDIT_LABELS['td-classic'];
}

function factionColor(style: GameStyle, faction: string): string | undefined {
  const info = styleInfo(style);
  return info.pack ? PACKS[info.pack].factions.find(f => f.id === faction)?.color : undefined;
}

export default function Lobby({ conn, onLaunch }: { conn: RoomConnection; onLaunch: (launch: LaunchRequest, mapName: string) => void }) {
  const [connected, setConnected] = useState(conn.connected);
  const [name, setName] = useState(() => { try { return localStorage.getItem('comrade-name') || ''; } catch { return ''; } });
  const [entered, setEntered] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [tdMaps, setTdMaps] = useState<MapInfo[]>([]);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('room') || '');
  const [copied, setCopied] = useState(false);
  const launched = useRef(false);

  useEffect(() => {
    fetch('/content/td/manifest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(m => m?.maps && setTdMaps(m.maps)).catch(() => undefined);
  }, []);

  useEffect(() => conn.on(message => {
    setConnected(conn.connected);
    if (message.type === 'rooms') setRooms(message.rooms);
    else if (message.type === 'room') { setRoom(message); setError(''); }
    else if (message.type === 'error') setError(message.message);
  }), [conn]);

  // Ask for the public list once connected (the welcome may have arrived before mount).
  useEffect(() => { if (connected) conn.send({ type: 'list' }); }, [connected, conn]);

  const mapsFor = (style: GameStyle): LobbyMap[] => {
    const info = styleInfo(style);
    if (info.engine === 'fusion' && info.pack) {
      return PACKS[info.pack].maps.map(m => ({ id: m.id, name: m.name, description: m.description, maxPlayers: m.maxPlayers, detail: `${m.maxPlayers} players` }));
    }
    return tdMaps.map(m => ({ id: m.id, name: m.name, description: m.description, maxPlayers: m.maxPlayers, detail: m.theater.toLowerCase() }));
  };

  const me = room?.players.find(p => p.id === conn.id);
  const isHost = !!me?.host;

  // When the host starts, every client in the room launches the configured match.
  useEffect(() => {
    if (room?.phase !== 'started' || !me || launched.current) return;
    launched.current = true;
    const style = styleInfo(room.options.style);
    const map = mapsFor(room.options.style).find(m => m.id === room.options.map) ?? mapsFor(room.options.style)[0];
    const players = (room.slots ?? room.players.map(p => p.id)).map(id => {
      const p = room.players.find(x => x.id === id);
      return { id, name: p?.name ?? 'Commander', faction: p?.faction ?? style.factions[0].id, team: p?.team ?? 0 };
    });
    onLaunch({
      version: 1, type: 'launch', map: map?.id ?? room.options.map, faction: me.faction, style: room.options.style,
      settings: room.options.settings, seed: room.seed, players, you: conn.id,
    }, map?.name ?? room.options.map);
  }, [room, me]);

  function enter() {
    const trimmed = name.trim();
    if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(trimmed)) { setError('Enter a name (letters, numbers, 1-24 chars).'); return; }
    try { localStorage.setItem('comrade-name', trimmed); } catch { /* private mode */ }
    setEntered(true); setError('');
    if (joinCode) join(joinCode);
  }
  function join(code: string) {
    const normalized = code.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (!/^[a-z0-9-]{3,32}$/.test(normalized)) { setError('Invalid game code.'); return; }
    launched.current = false;
    conn.send({ type: 'join', room: normalized, name: name.trim() || 'Commander', faction: 'gdi' });
  }
  const createGame = () => { launched.current = false; conn.send({ type: 'join', room: randomCode(), name: name.trim() || 'Commander', faction: 'gdi' }); };
  const configure = (patch: Partial<RoomOptions>) => room && conn.send({ type: 'configure', options: { ...room.options, ...patch } });
  const configureSettings = (patch: Partial<RoomOptions['settings']>) => room && conn.send({ type: 'configure', options: { ...room.options, settings: { ...room.options.settings, ...patch } } });
  function changeStyle(style: GameStyle) {
    if (!room) return;
    const maps = mapsFor(style);
    const map = maps[0];
    configure({ style, map: map?.id ?? room.options.map, maxPlayers: Math.min(Math.max(room.options.maxPlayers, room.players.length), map?.maxPlayers ?? 4) });
  }
  function copyLink() {
    if (!room) return;
    navigator.clipboard?.writeText(`${location.origin}/?room=${room.room}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined);
  }

  if (!entered) return <div className="lobby-gate">
    <p className="eyebrow">COMMANDER IDENTIFICATION</p>
    <h2>Enter your callsign</h2>
    <p>No account, no install. Pick a name and jump straight into a lobby.</p>
    <input value={name} maxLength={24} placeholder="Commander" onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter()} aria-label="Your name" />
    <button className="deploy" onClick={enter}>ENTER THE WAR ROOM →</button>
    {error && <small className="lobby-error">{error}</small>}
  </div>;

  if (room) {
    const style = styleInfo(room.options.style);
    const maps = mapsFor(room.options.style);
    const chosenMap = maps.find(m => m.id === room.options.map) ?? maps[0];
    const othersReady = room.players.filter(p => p.id !== room.host).every(p => p.ready);
    const mapMax = chosenMap?.maxPlayers ?? 2;
    const aiMax = Math.max(0, mapMax - room.players.length);
    const fusion = style.engine === 'fusion';
    const hasWorms = fusion && !!style.pack && !!PACKS[style.pack]?.mechanics.sandworm;
    const worms = room.options.settings.worms ?? DEFAULT_SETTINGS.worms;
    return <div className="lobby-room">
      <div className="room-main">
        <div className="room-head"><div><p className="eyebrow">WAR ROOM · {style.name.toUpperCase()}</p><h2>{room.room}</h2></div>
          <div className="room-actions"><button onClick={copyLink}>{copied ? 'LINK COPIED ✓' : 'COPY INVITE LINK'}</button><button onClick={() => { conn.send({ type: 'leave' }); setRoom(null); }}>LEAVE</button></div></div>
        <p className="room-share">Invite link: <code>{location.origin}/?room={room.room}</code></p>

        <div className="players">
          {room.players.map(p => <div key={p.id} className={`player ${p.faction}`} style={{ borderLeftColor: factionColor(room.options.style, p.faction) }}>
            <span className="pname">{p.name}{p.host && <em> · HOST</em>}{p.id === conn.id && <em> · YOU</em>}</span>
            <span className="pfaction">{style.factions.find(f => f.id === p.faction)?.name.toUpperCase() ?? p.faction}</span>
            {p.id === conn.id
              ? <select className="pteam" aria-label="Your team" value={p.team ?? 0} onChange={e => conn.send({ type: 'team', team: Number(e.target.value) })}>
                  <option value={0}>No team</option>{[1, 2, 3, 4].map(t => <option key={t} value={t}>Team {t}</option>)}
                </select>
              : <span className="pteam">{p.team ? `TEAM ${p.team}` : ''}</span>}
            <span className={p.ready ? 'pready on' : 'pready'}>{p.id === room.host ? 'HOST' : p.ready ? 'READY' : 'NOT READY'}</span>
          </div>)}
          {fusion && Array.from({ length: Math.min(aiMax, room.options.settings.ai) }).map((_, i) =>
            <div key={`ai-${i}`} className="player ai"><span className="pname">Computer {i + 1}</span><span className="pfaction">AI</span><span className="pready on">READY</span></div>)}
          {Array.from({ length: Math.max(0, room.options.maxPlayers - room.players.length) }).map((_, i) =>
            <div key={`open-${i}`} className="player open"><span className="pname">Open slot</span><span className="pfaction">—</span><span className="pready">WAITING</span></div>)}
        </div>

        <div className="faction-pick">
          <span className="eyebrow">YOUR SIDE</span>
          <div className={`factions n${style.factions.length}`}>
            {style.factions.map(f => <button key={f.id} className={me?.faction === f.id ? 'selected' : ''} style={{ ['--house' as string]: factionColor(room.options.style, f.id) ?? (f.id === 'nod' ? '#ce745f' : '#d5bc68') }}
              onClick={() => conn.send({ type: 'faction', faction: f.id })}><b>{f.name.toUpperCase()}</b><span>{f.full}</span><small>{f.blurb}</small></button>)}
          </div>
        </div>

        <div className="room-launch">
          {isHost
            ? <button className="deploy" disabled={!othersReady} onClick={() => conn.send({ type: 'start' })}>START OPERATION →</button>
            : <button className="deploy" onClick={() => conn.send({ type: 'ready', ready: !me?.ready })}>{me?.ready ? 'CANCEL READY' : 'READY UP ✓'}</button>}
          <small>{isHost ? (othersReady ? 'All commanders ready. Launch when you are.' : 'Waiting for the other commanders to ready up.') : 'Ready up — the host launches the match.'}{' '}
            {fusion ? 'Fusion Engine matches are fully synchronized: everyone fights on the same battlefield.' : 'Classic C&C runs the original engine; each commander fights the built-in enemy on the configured map.'}</small>
        </div>
        {error && <small className="lobby-error">{error}</small>}
        <Chat conn={conn} team={me?.team ?? 0} />
      </div>

      <aside className="room-config">
        <p className="eyebrow">MATCH SETUP{!isHost && ' · HOST CONTROLLED'}</p>
        <label>Game style<select disabled={!isHost} value={room.options.style} onChange={e => changeStyle(e.target.value as GameStyle)}>
          {STYLES.map(s => <option key={s.id} value={s.id} disabled={!s.playable}>{s.name}{s.playable ? '' : ' (coming soon)'}</option>)}
        </select></label>
        <p className="map-blurb">{style.blurb}</p>
        <label>Battlefield<select disabled={!isHost} value={chosenMap?.id ?? ''} onChange={e => {
          const m = maps.find(x => x.id === e.target.value);
          configure({ map: e.target.value, maxPlayers: Math.max(room.players.length, Math.min(room.options.maxPlayers, m?.maxPlayers ?? 4)) });
        }}>
          {maps.map(m => <option key={m.id} value={m.id}>{m.name} · {m.detail}</option>)}
        </select></label>
        {chosenMap && <p className="map-blurb">{chosenMap.description}</p>}
        <label>Visibility<select disabled={!isHost} value={room.options.visibility} onChange={e => configure({ visibility: e.target.value as RoomOptions['visibility'] })}>
          <option value="public">Public — listed for anyone</option>
          <option value="invite">Invite only — link required</option>
        </select></label>
        <label>Human players<select disabled={!isHost} value={room.options.maxPlayers} onChange={e => configure({ maxPlayers: Number(e.target.value) })}>
          {[2, 3, 4].filter(n => n <= Math.max(2, fusion ? mapMax : 4)).map(n => <option key={n} value={n}>{n} commanders</option>)}
        </select></label>
        {fusion && <label>AI opponents<select disabled={!isHost} value={Math.min(room.options.settings.ai, aiMax)} onChange={e => configureSettings({ ai: Number(e.target.value) })}>
          {Array.from({ length: aiMax + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'None' : `${n} computer${n > 1 ? 's' : ''}`}</option>)}
        </select></label>}
        {fusion && <label>AI difficulty<select disabled={!isHost} value={room.options.settings.aiLevel} onChange={e => configureSettings({ aiLevel: e.target.value as AILevel })}>
          <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
        </select></label>}
        <label>Starting credits<select disabled={!isHost} value={room.options.settings.credits} onChange={e => configureSettings({ credits: e.target.value as CreditsPreset })}>
          {(['low', 'standard', 'high'] as CreditsPreset[]).map(c => <option key={c} value={c}>{creditLabels(room.options.style)[c]}</option>)}
        </select></label>
        <label>Tech level<select disabled={!isHost} value={room.options.settings.techLevel} onChange={e => configureSettings({ techLevel: Number(e.target.value) })}>
          {[3, 6, 10, 15].map(n => <option key={n} value={n}>Level {n}{n === 15 ? ' (full)' : ''}</option>)}
        </select></label>
        {hasWorms && <label>Sandworm activity · {worms === 0 ? 'Off' : `${worms}%`}
          <input type="range" min={0} max={WORMS_MAX} step={25} disabled={!isHost} value={worms} aria-label="Sandworm activity"
            onChange={e => configureSettings({ worms: Number(e.target.value) })} />
          <small>{worms === 0 ? 'No sandworms this match.' : worms < 100 ? 'Worms surface less often.' : worms > 100 ? 'Worms surface more often.' : 'Classic worm frequency.'}</small>
        </label>}
        {!isHost && <small>Only the host can change these.</small>}
      </aside>
    </div>;
  }

  const openRooms = rooms.filter(r => r.phase === 'lobby' && r.players < r.maxPlayers);
  return <div className="lobby-browser">
    <div className="lobby-left">
      <p className="eyebrow">WAR ROOM · {connected ? 'ONLINE' : 'CONNECTING…'}</p>
      <h2>Public games</h2>
      <div className="room-list">
        {openRooms.length === 0 && <p className="empty">No public games right now. Create one and share the link.</p>}
        {openRooms.map(r => <button key={r.room} className="room-row" onClick={() => join(r.room)}>
          <span className="rr-code">{r.room}</span>
          <span className="rr-meta">{styleInfo(r.style).name} · {mapsFor(r.style).find(m => m.id === r.map)?.name ?? r.map}</span>
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
