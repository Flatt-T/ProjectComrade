import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LaunchRequest, MASHUP_STYLE, styleInfo } from '@comrade/contracts';
import {
  Command, Entity, Game, LocalSession, LockstepSession, PACKS, PlayerSetup, QueueKind, RulePack, Session,
  TICKS_PER_SECOND, composeMashup, mashupMap, wholePackLoadout,
} from '../../../packages/fusion/src/index';
import { FusionRenderer, drawIcon } from '../../../packages/fusion/src/render';
import type { RoomConnection } from './net';
import TechTree from './TechTree';
import { enterBattleHelp, helpAvailable, helpOpen, toggleHelp, typingIn } from './help';
import { recordAction, recordEvent, recordNotice, setMatchSnapshot } from './diagnostics';
import Chat from './Chat';
import { attachTouchGestures, goLandscape, isTouchDevice, trackVisibleHeight } from './touch';
import { AudioSettings, FusionAudio, loadAudioSettings, saveAudioSettings } from '../../../packages/fusion/src/audio';
import AdBreak from './AdBreak';
import Share, { shareTextFor } from './Share';
import { api } from './api';
import type { MatchRecord } from '@comrade/contracts';

/** Notices that have an EVA voice line (the meaning keys of the sound tables). */
const EVA_FOR: Record<string, string> = {
  'Construction complete': 'construction', 'Unit ready': 'unitReady', 'Low power': 'lowPower', 'Our base is under attack': 'baseAttack',
  'Insufficient funds': 'funds', 'Cannot deploy here': 'cannotDeploy', 'Select the destination': 'selectTarget', 'Building in progress': 'inProgress',
  'Building captured': 'captured', 'Building infiltrated': 'infiltrated',
};

type Mode = 'normal' | 'place' | 'sell' | 'repair' | 'attackMove' | 'super';
interface SuperView { id: number; name: string; frac: number; ready: boolean; kind: string; paused: boolean }
const ALL_TABS: { id: QueueKind; label: string }[] = [
  { id: 'structure', label: 'Base' }, { id: 'defense', label: 'Defence' }, { id: 'infantry', label: 'Infantry' }, { id: 'vehicle', label: 'Vehicles' },
  { id: 'aircraft', label: 'Air' }, { id: 'naval', label: 'Navy' }, { id: 'starport', label: 'Starport' },
];
/** Sidebar tabs this game uses: air, navy and the Starport only where the pack has them. */
function tabsFor(pack: RulePack) {
  const units = Object.values(pack.units);
  return ALL_TABS.filter(t => t.id === 'starport' ? units.some(u => u.starport) : ['aircraft', 'naval'].includes(t.id) ? units.some(u => (u.queue ?? u.kind) === t.id) : true);
}
/** Display name for a sidebar item, including upgrades and Starport orders. */
function itemName(pack: RulePack, item: string) {
  const base = item.replace(/^(upgrade|starport):/, '');
  const name = (pack.units[base] ?? pack.structures[base])?.name ?? base;
  return item.startsWith('upgrade:') ? `Upgrade ${name}` : name;
}
const RANKS = ['', ' · Veteran', ' · Elite'];

interface QueueView { items: string[]; paid: number; ready: boolean }
interface UiState {
  tick: number; credits: number; storage: number; powerGen: number; powerUse: number; radar: boolean;
  options: Record<QueueKind, string[]>; queues: Record<QueueKind, QueueView>; costs: Record<string, number>; soundLocked: boolean; help: { available: boolean; open: boolean };
  selection: { name: string; hp: number; max: number; count: number; deploy: boolean; unload: boolean; own: boolean; structure: boolean } | null;
  status: string; over: boolean; won: boolean; defeated: boolean; stats: { built: number; lost: number; killed: number; harvested: number };
  supers: SuperView[];
}

declare global {
  interface Window { comradeFusion?: { game: Game; slot: number; renderer: FusionRenderer; issue(cmd: Command): void; audio?: FusionAudio } }
}

export default function FusionBattle({ launch, mapName, conn, onExit }: { launch: LaunchRequest; mapName: string; conn: RoomConnection; onExit: () => void }) {
  const style = styleInfo(launch.style);
  /**
   * A Custom Mashup has no rule pack of its own: it is composed here, on every client, from
   * the battlefield and the loadouts the launch carries. Composition is deterministic, so
   * every client in the match plays the same pack — which is what lockstep needs.
   */
  const composed = useMemo(() => {
    if (launch.style !== MASHUP_STYLE) return null;
    const { pack: arena, preset } = mashupMap(launch.map);
    const seats = (launch.players?.length ? launch.players : [{ id: 'local', name: 'Commander', faction: launch.faction }]).slice(0, preset.maxPlayers);
    const aiCount = Math.max(0, Math.min(launch.settings.ai, preset.maxPlayers - seats.length));
    // A commander who somehow arrived without choices, and every computer opponent, fields one
    // pack whole — the battlefield's own, so they look at home on it.
    const house = (n: number) => wholePackLoadout(arena.id, arena.factions[n % arena.factions.length].id);
    const loadouts = [
      ...seats.map((p, i) => p.loadout ?? house(i)),
      ...Array.from({ length: aiCount }, (_, i) => house(seats.length + i)),
    ];
    return composeMashup(launch.map, loadouts);
  }, []);
  const pack = composed?.pack ?? PACKS[style.pack ?? 'dune'];
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<{ game: Game; session: Session; renderer: FusionRenderer } | null>(null);
  const mode = useRef<Mode>('normal');
  const placing = useRef<string | null>(null);
  const superId = useRef<number>(0);
  /** Chronosphere: the first click picks what to move, the second where to. */
  const superFrom = useRef<{ x: number; y: number } | null>(null);
  const tabs = useMemo(() => tabsFor(pack), [pack]);
  /** Last place our forces took damage, for Space (jump to alert). */
  const lastAlert = useRef<{ x: number; y: number } | null>(null);
  const groups = useRef(new Map<number, number[]>());
  const pointer = useRef({ x: 0, y: 0, inside: false, down: false, sx: 0, sy: 0, dragging: false });
  const keys = useRef(new Set<string>());
  const [tab, setTab] = useState<QueueKind>('structure');
  const [ui, setUi] = useState<UiState | null>(null);
  /**
   * The pre-match advertisement, if this player's tier watches one. The simulation starts on
   * the first tick regardless; `adLock` holds this player's orders back until it finishes, so
   * their base sits idle for thirty seconds while every peer's lockstep carries on normally.
   */
  const [ad, setAd] = useState(() => conn.match?.ad);
  const adLock = useRef(!!conn.match?.ad);
  /** The match as the service recorded it, once the result has been reported. */
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const reported = useRef(false);
  const [messages, setMessages] = useState<{ text: string; at: number }[]>([]);
  const [modeView, setModeView] = useState<Mode>('normal');
  const [help, setHelp] = useState(false);
  const [tree, setTree] = useState(false);
  /** Phones and tablets: full-screen landscape, gestures, and the sidebar in a drawer. */
  const [touch] = useState(isTouchDevice);
  const touchRef = useRef(touch);
  const [drawer, setDrawer] = useState(() => !touch || window.innerWidth >= 1000);
  const [rotateOk, setRotateOk] = useState(false);
  /** Touch placement: the first tap moves the outline, a tap on the outline builds. */
  const touchGhost = useRef(false);
  const boxing = useRef(false);

  const setup = useMemo(() => {
    const humans = launch.players?.length ? launch.players : [{ id: 'local', name: 'Commander', faction: launch.faction }];
    const preset = pack.maps.find(m => m.id === launch.map) ?? pack.maps[0];
    const aiCount = Math.max(0, Math.min(launch.settings.ai, preset.maxPlayers - humans.length));
    // Humans who picked the same team in the lobby are allies; everyone else fights alone.
    // In a mashup every seat is its own faction, composed from that commander's own choices.
    const players: PlayerSetup[] = humans.slice(0, preset.maxPlayers).map((h, i) => ({ name: h.name, faction: composed?.factions[i] ?? h.faction, ai: false, team: h.team ? 100 + h.team : i }));
    for (let i = 0; i < aiCount; i++) {
      const used = new Set(players.map(p => p.faction));
      const faction = composed ? pack.factions[players.length] ?? pack.factions[0]
        : pack.factions.find(f => !used.has(f.id)) ?? pack.factions[players.length % pack.factions.length];
      players.push({ name: `Computer ${i + 1}`, faction: faction.id, ai: true, level: launch.settings.aiLevel ?? 'normal', team: players.length });
    }
    return {
      players, humans: Math.min(humans.length, preset.maxPlayers), mapId: preset.id,
      slot: Math.max(0, humans.findIndex(h => h.id === launch.you)),
      seed: launch.seed ?? Math.floor(Math.random() * 0x7ffffffe) + 1,
    };
  }, []);
  const slot = setup.slot;

  const audio = useRef<FusionAudio | null>(null);
  const [sound, setSound] = useState<AudioSettings>(loadAudioSettings);
  const [soundOpen, setSoundOpen] = useState(false);
  const say = (text: string, meaning = EVA_FOR[text]) => {
    setMessages(m => [...m.filter(x => performance.now() - x.at < 6000).slice(-3), { text, at: performance.now() }]);
    recordNotice(text);
    if (meaning) audio.current?.eva(meaning);
  };
  const changeSound = (patch: Partial<AudioSettings>) => setSound(s => {
    const next = { ...s, ...patch };
    saveAudioSettings(next); audio.current?.apply(next);
    return next;
  });
  /** Own units currently selected, for spoken replies. */
  const selectedUnits = () => {
    const r = rig.current; if (!r) return [];
    return [...r.renderer.selected].map(id => r.game.entities.get(id)).filter((e): e is Entity => !!e && e.owner === slot && e.kind === 'unit');
  };

  useEffect(() => {
    const s = launch.settings;
    const game = new Game({
      pack, mapId: setup.mapId, seed: setup.seed, players: setup.players,
      credits: s.credits, techLevel: s.techLevel, worms: s.worms ?? 100,
      renewal: s.renewal, superCharge: s.superCharge, crates: s.crates,
      doctrine: s.doctrine ?? 'irregular',
    });
    const humans = Array.from({ length: setup.humans }, (_, i) => i);
    const session: Session = setup.humans > 1 ? new LockstepSession(game, slot, humans, conn.transport(), s.speed) : new LocalSession(game, slot, s.speed);
    const renderer = new FusionRenderer(canvas.current!, game, slot);
    rig.current = { game, session, renderer };
    const leaveHelp = enterBattleHelp();
    const sfx = new FusionAudio(game, slot, loadAudioSettings());
    audio.current = sfx;
    void sfx.load();
    // Browsers only start audio after the player interacts with the page.
    const wake = () => sfx.resume();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    sfx.resume();
    window.comradeFusion = { game, slot, renderer, issue: cmd => session.issue(cmd), audio: sfx };
    // Every command the player issues goes into the report diagnostics, with the game tick.
    const send = session.issue.bind(session);
    session.issue = cmd => {
      // Orders are dropped while the advertisement plays — the sim is running, this player
      // just is not commanding yet. Turn packets keep flowing, so nobody else is held up.
      if (adLock.current) return;
      recordAction({ tick: game.tick, ...cmd });
      send(cmd);
    };
    recordEvent('match-start', { style: launch.style, map: setup.mapId, players: setup.players.length, humans: setup.humans, slot });
    setMatchSnapshot(() => {
      const me = game.players[slot];
      const mine = [...game.entities.values()].filter(e => e.owner === slot && e.hp > 0);
      return {
        style: launch.style, map: setup.mapId, seed: setup.seed, tick: game.tick, slot, status: session.status(),
        waitingFor: session.waitingFor?.() ?? [], over: game.over, sound: sfx.unlocked,
        me: me && { faction: me.faction, credits: me.credits, power: `${me.powerGen}/${me.powerUse}`, units: mine.filter(e => e.kind === 'unit').length, structures: mine.filter(e => e.kind === 'structure').length, defeated: me.defeated },
        players: game.players.map(p => ({ faction: p.faction, ai: !!p.ai, team: p.team, defeated: p.defeated })),
        checksum: game.checksum(),
      };
    });


    const resize = () => {
      const el = stage.current!, c = canvas.current!;
      c.width = Math.max(320, el.clientWidth); c.height = Math.max(240, el.clientHeight);
      renderer.clampCamera();
    };
    resize();
    const start = game.mapPreset.starts[slot];
    renderer.centerOn(start.x, start.y);
    const observer = new ResizeObserver(resize);
    observer.observe(stage.current!);

    let last = performance.now(), raf = 0, uiTimer = 0, mmTimer = 0;
    const drops = conn.drops;
    // Advance the simulation by wall time. Shared by the frame loop and the background
    // ticker, so a hidden tab keeps playing (and keeps sending its lockstep turns).
    const advance = (now: number) => {
      const dt = Math.min(2000, now - last); last = now;
      return session.update(dt);
    };
    // Browsers stop requestAnimationFrame in background tabs, which would freeze this
    // player's turns and stall every other commander. A worker timer is not throttled.
    let ticker: Worker | null = null;
    try {
      ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
      ticker.onmessage = () => { if (document.hidden) advance(performance.now()); };
    } catch { ticker = null; }
    let prev: { ready: Record<string, boolean>; units: number; low: boolean; hp: number; over: boolean; lost: number; structures: number; options: number } | null = null;
    let lastLossWarning = -1e9, lastSilos = -1e9;
    let lastAttackWarning = -1e9;
    const announced = new WeakSet<object>();
    const lastHp = new Map<number, number>();
    const readySupers = new Set<number>();
    const loop = (now: number) => {
      const dt = Math.min(2000, now - last);
      const alpha = advance(now);
      // Scrolling: arrow keys and screen edges.
      const speed = (Math.min(dt, 50) * 0.9) / renderer.camera.zoom;
      const p = pointer.current, c = canvas.current!;
      let dx = 0, dy = 0;
      if (keys.current.has('ArrowLeft') || p.inside && !p.down && p.x < 14) dx -= speed;
      if (keys.current.has('ArrowRight') || p.inside && !p.down && p.x > c.width - 14) dx += speed;
      if (keys.current.has('ArrowUp') || p.inside && !p.down && p.y < 14) dy -= speed;
      if (keys.current.has('ArrowDown') || p.inside && !p.down && p.y > c.height - 14) dy += speed;
      if (dx || dy) { renderer.camera.x += dx; renderer.camera.y += dy; renderer.clampCamera(); }
      if (mode.current === 'place' && placing.current) {
        const def = pack.structures[placing.current];
        const cell = renderer.screenToCell(p.x, p.y);
        renderer.ghost = { item: placing.current, x: cell.x - ((def.w - 1) >> 1), y: cell.y - ((def.h - 1) >> 1) };
      } else renderer.ghost = null;
      for (const id of [...renderer.selected]) { const e = game.entities.get(id); if (!e || e.hp <= 0) renderer.selected.delete(id); }
      renderer.draw(alpha);
      sfx.update({ toScreen: (x, y) => renderer.toScreen(x, y), width: canvas.current!.width, height: canvas.current!.height });
      const me = game.players[slot];
      const radar = [...game.entities.values()].some(e => e.owner === slot && e.kind === 'structure' && pack.structures[e.type].radar) && !game.lowPower(slot);
      if (now - mmTimer > 200 && minimap.current) { mmTimer = now; renderer.drawMinimap(minimap.current, radar); }
      if (now - uiTimer > 250) {
        uiTimer = now;
        const options = {} as Record<QueueKind, string[]>;
        const queues = {} as Record<QueueKind, QueueView>;
        const costs: Record<string, number> = {};
        for (const t of tabs) {
          const q = me.queues[t.id];
          const building = q.items.filter(i => !game.canBuild(me, i));
          options[t.id] = [...building, ...game.buildOptions(me, t.id)];
          for (const item of options[t.id]) costs[item] = game.costOf(item, me);
          queues[t.id] = { items: [...q.items], paid: q.paid, ready: q.ready };
        }
        const sel = [...renderer.selected].map(id => game.entities.get(id)).filter((e): e is Entity => !!e);
        const first = sel[0];
        const firstDef = first ? (first.kind === 'unit' ? pack.units[first.type] : pack.structures[first.type]) : undefined;
        const status = session.status();
        const myHp = [...game.entities.values()].reduce((n, e) => n + (e.owner === slot ? e.hp : 0), 0);
        const units = [...game.entities.values()].filter(e => e.owner === slot && e.kind === 'unit').length;
        const low = game.lowPower(slot);
        // EVA-style notices.
        if (prev) {
          for (const t of ['structure', 'defense'] as QueueKind[]) if (queues[t].ready && !prev.ready[t]) say('Construction complete');
          if (units > prev.units && game.tick > 30) say('Unit ready');
          if (low && !prev.low) say('Low power');
          if (myHp < prev.hp - 40 && now - lastAttackWarning > 12000) { lastAttackWarning = now; say('Our base is under attack'); }
          if (me.credits === 0 && tabs.some(t => queues[t.id].items.length && !queues[t.id].ready)) { if (Math.floor(now / 4000) % 4 === 0) say('Insufficient funds'); }
        }
        for (const e of game.entities.values()) {
          if (e.owner !== slot) continue;
          const before = lastHp.get(e.id);
          if (before !== undefined && e.hp < before) lastAlert.current = { x: Math.floor(e.x / 256), y: Math.floor(e.y / 256) };
          lastHp.set(e.id, e.hp);
        }
        // Superweapon status and alerts (own launches, enemy launches, storms).
        const supers: SuperView[] = [];
        for (const e of game.entities.values()) {
          if (e.owner !== slot || e.hp <= 0) continue;
          const sw = game.superweaponOf(e);
          if (!sw) continue;
          const need = game.chargeFor(sw);
          const ready = e.charge >= need;
          if (ready && !readySupers.has(e.id) && game.tick > 30) say(`${sw.name} ready`, `ready:${sw.kind}`);
          if (ready) readySupers.add(e.id); else readySupers.delete(e.id);
          supers.push({ id: e.id, name: sw.name, frac: Math.min(1, e.charge / need), ready, kind: sw.kind, paused: !ready && low });
        }
        for (const fx of game.effects) {
          if (fx.kind === 'infiltrate' && fx.owner !== slot && !announced.has(fx) && game.tick - fx.tick < fx.dur && game.entities.get([...game.entities.values()].find(e => e.kind === 'structure' && e.x === fx.x && e.y === fx.y)?.id ?? 0)?.owner === slot) { announced.add(fx); say('Building infiltrated'); }
          if (fx.kind === 'infiltrate' && fx.owner === slot && fx.color === 'steal' && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say('Credits stolen', 'stolen'); }
          if (fx.kind === 'capture' && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say(fx.owner === slot ? 'Building captured' : 'Our building has been captured'); }
          if (fx.kind === 'promote' && fx.owner === slot && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say('Unit promoted'); }
          if (fx.kind === 'upgrade' && fx.owner === slot && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say('Upgrade complete'); }
          if (announced.has(fx) || game.tick - fx.tick > fx.dur || !['superLaunch', 'ionCharge', 'laserCharge', 'tractorCharge', 'shieldCharge', 'stormClouds', 'paradrop', 'reinforce', 'chronoCharge', 'curtainCharge'].includes(fx.kind)) continue;
          announced.add(fx);
          const name = fx.color ?? 'Superweapon';
          const kind = fx.kind === 'superLaunch' ? 'missile' : fx.kind === 'ionCharge' ? 'ion' : fx.kind === 'laserCharge' ? 'laser' : fx.kind === 'tractorCharge' ? 'tractor' : fx.kind === 'shieldCharge' ? 'shield' : '';
          if (['paradrop', 'reinforce'].includes(fx.kind)) { if (fx.owner === slot) say(`${name} on the way`, 'reinforcements'); continue; }
          if (['chronoCharge', 'curtainCharge', 'shieldCharge', 'tractorCharge'].includes(fx.kind)) { say(fx.owner === slot ? `${name} activated` : `Warning: ${name} activated`, kind && `ready:${kind}`); continue; }
          const ours = fx.kind === 'stormClouds' ? `${name} unleashed` : fx.kind === 'laserCharge' || fx.kind === 'ionCharge' ? `${name} firing` : `${name} launched`;
          const theirs = fx.kind === 'stormClouds' ? `Warning: ${name} approaching` : fx.kind === 'laserCharge' || fx.kind === 'ionCharge' ? `Warning: ${name} firing` : `Warning: ${name} launched`;
          if (fx.owner === slot) say(ours, kind && `launch:${kind}`);
          else say(theirs, kind && `incoming:${kind}`);
        }
        const structures = [...game.entities.values()].filter(e => e.owner === slot && e.kind === 'structure').length;
        const optionCount = tabs.reduce((n, t) => n + options[t.id].length, 0);
        if (prev && sfx) {
          if (me.stats.lost > prev.lost && now - lastLossWarning > 8000) { lastLossWarning = now; sfx.eva(structures < prev.structures ? 'structureLost' : 'unitLost'); }
          if (optionCount > prev.options && game.tick > 60) sfx.eva('newOptions');
          if (me.storage > 0 && me.credits >= me.storage * 0.95 && now - lastSilos > 20000) { lastSilos = now; sfx.eva('silos'); }
          if (game.over && !prev.over) sfx.eva(game.winnerTeam === me.team ? 'won' : 'lost');
        }
        prev = { ready: { structure: queues.structure.ready, defense: queues.defense.ready }, units, low, hp: myHp, over: game.over, lost: me.stats.lost, structures, options: optionCount };
        setUi({
          tick: game.tick, credits: me.credits, storage: me.storage, powerGen: me.powerGen, powerUse: me.powerUse, radar, options, queues, soundLocked: !sfx.unlocked, help: { available: helpAvailable(), open: helpOpen() },
          selection: first ? { name: (firstDef?.name ?? first.type) + (first.kind === 'unit' ? RANKS[first.rank] ?? '' : ''), hp: first.hp, max: first.maxHp, count: sel.length, deploy: sel.some(e => e.kind === 'unit' && !!(pack.units[e.type].deploysTo || pack.units[e.type].deployWeapon || pack.units[e.type].lure || e.passengers.length)), unload: sel.some(e => e.passengers.length > 0), own: first.owner === slot, structure: first.kind === 'structure' } : null,
          status: conn.drops !== drops && status !== 'running' ? 'Connection to the match was lost — it cannot be rejoined'
            : status === 'waiting' ? `Waiting for ${(session.waitingFor?.() ?? []).map(s => game.players[s]?.name).filter(Boolean).join(', ') || 'other commanders'}…`
            : status === 'desync' ? 'Desynchronised — the match cannot continue' : '',
          over: game.over, won: game.over && game.winnerTeam === me.team, defeated: me.defeated, stats: { ...me.stats }, supers, costs,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Classic C&C / RA2 keyboard map.
    let lastGroup = { n: 0, at: 0 }, lastT = 0, lastP = 0;
    const ownUnits = () => [...game.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0);
    const onScreen = (e: Entity) => {
      const s = renderer.toScreen(e.x, e.y), c = canvas.current!;
      return s.x >= 0 && s.y >= 0 && s.x <= c.width && s.y <= c.height;
    };
    const centre = (ids: number[]) => {
      const list = ids.map(id => game.entities.get(id)).filter((e): e is Entity => !!e);
      if (!list.length) return;
      const x = list.reduce((n, e) => n + e.x, 0) / list.length, y = list.reduce((n, e) => n + e.y, 0) / list.length;
      renderer.centerOn(Math.floor(x / 256), Math.floor(y / 256));
    };
    const keydown = (ev: KeyboardEvent) => {
      if (typingIn(ev.target)) return;
      keys.current.add(ev.key);
      const now = performance.now();
      const sel = () => [...renderer.selected].filter(id => game.entities.get(id)?.owner === slot && game.entities.get(id)?.kind === 'unit');
      const digit = /^Digit([1-9])$/.exec(ev.code);
      const key = ev.key.toLowerCase();
      if (digit) {
        const n = Number(digit[1]);
        ev.preventDefault();
        const team = (groups.current.get(n) ?? []).filter(id => (game.entities.get(id)?.hp ?? 0) > 0 && game.entities.get(id)?.owner === slot);
        if (ev.ctrlKey || ev.metaKey) { groups.current.set(n, sel()); say(`Team ${n} created`); }
        else if (ev.altKey) { groups.current.set(n, [...new Set([...team, ...sel()])]); say(`Added to team ${n}`); }
        else if (ev.shiftKey) renderer.selected = new Set([...renderer.selected, ...team]);
        else {
          renderer.selected = new Set(team);
          // Press a team number twice to centre the camera on it.
          if (lastGroup.n === n && now - lastGroup.at < 450) centre(team);
          lastGroup = { n, at: now };
        }
        return;
      }
      if (ev.key === 'Alt') { ev.preventDefault(); return; }
      if (key === 't') {
        // Same type: on screen, or across the map on a double tap.
        const types = new Set(sel().map(id => game.entities.get(id)!.type));
        if (types.size) renderer.selected = new Set(ownUnits().filter(e => types.has(e.type) && (now - lastT < 450 || onScreen(e))).map(e => e.id));
        lastT = now;
      } else if (key === 'p') {
        // All combat units: on screen, or across the map on a double tap.
        const combat = ownUnits().filter(e => { const d = pack.units[e.type]; return d.weapon && !d.harvester && !d.deploysTo; });
        renderer.selected = new Set(combat.filter(e => now - lastP < 450 || onScreen(e)).map(e => e.id));
        lastP = now;
      } else if (key === 's') { const ids = sel(); if (ids.length) session.issue({ t: 'stop', ids }); }
      else if (key === 'g') { const ids = sel(); if (ids.length) { session.issue({ t: 'guard', ids }); say('Guarding'); } }
      else if (key === 'x') { const ids = sel(); if (ids.length) session.issue({ t: 'scatter', ids }); }
      else if (key === 'd') { const ids = sel(); if (ids.length) session.issue({ t: 'deploy', ids }); }
      else if (key === 'a') { if (sel().length) setMode('attackMove'); }
      else if (key === 'h' || ev.key === 'Home') { const st = game.mapPreset.starts[slot]; renderer.centerOn(st.x, st.y); }
      else if (ev.key === ' ') { ev.preventDefault(); if (lastAlert.current) renderer.centerOn(lastAlert.current.x, lastAlert.current.y); }
      else if (ev.key === 'Escape') { setMode('normal'); renderer.selected = new Set(); }
      else if (ev.key === '?' || ev.key === 'F1') { ev.preventDefault(); setHelp(v => !v); }
      else if (ev.key === 'F2') { ev.preventDefault(); setTree(v => !v); }
      else if (key === 'm') changeSound({ muted: !loadAudioSettings().muted });
    };
    const keyup = (ev: KeyboardEvent) => keys.current.delete(ev.key);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); session.dispose(); ticker?.terminate();
      window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake);
      sfx.dispose(); audio.current = null; leaveHelp();
      setMatchSnapshot(null); recordEvent('match-end', { tick: game.tick });
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      delete window.comradeFusion;
    };
  }, []);

  function setMode(m: Mode) {
    if (m !== 'super') superFrom.current = null;
    mode.current = m; setModeView(m);
    if (m !== 'place') placing.current = null;
    if (touchRef.current && m !== 'normal') {
      // Show the map for targeting; start a building's outline in the middle of it.
      if (window.innerWidth < 1000) setDrawer(false);
      if (m === 'place' && canvas.current) { Object.assign(pointer.current, { x: canvas.current.width / 2, y: canvas.current.height / 2 }); touchGhost.current = true; }
    }
  }

  /** Classic hotkeys, for the on-screen touch buttons. */
  const press = (key: string, code = '') => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code }));
  };

  function zoomAt(x: number, y: number, factor: number) {
    const r = rig.current; if (!r) return;
    const cam = r.renderer.camera;
    const before = { x: x / cam.zoom + cam.x, y: y / cam.zoom + cam.y };
    cam.zoom = Math.max(0.6, Math.min(2.2, cam.zoom * factor));
    cam.x = before.x - x / cam.zoom; cam.y = before.y - y / cam.zoom;
    r.renderer.clampCamera();
  }

  function boxSelect(sx: number, sy: number, ex: number, ey: number, add: boolean) {
    const r = rig.current; if (!r) return;
    const { game, renderer } = r;
    const x1 = Math.min(sx, ex), x2 = Math.max(sx, ex), y1 = Math.min(sy, ey), y2 = Math.max(sy, ey);
    const picked: number[] = [];
    for (const e of game.entities.values()) {
      if (e.owner !== slot || e.kind !== 'unit' || e.hp <= 0) continue;
      const s = renderer.toScreen(e.x, e.y);
      if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) picked.push(e.id);
    }
    renderer.selected = new Set(add ? [...renderer.selected, ...picked] : picked);
    audio.current?.reply(selectedUnits(), 'select');
  }

  function selectSameType(x: number, y: number) {
    const r = rig.current; if (!r) return;
    const target = r.renderer.pick(x, y);
    if (!target || target.owner !== slot || target.kind !== 'unit') return;
    const c = canvas.current!;
    const same = [...r.game.entities.values()].filter(e => {
      if (e.owner !== slot || e.type !== target.type || e.hp <= 0) return false;
      const s = r.renderer.toScreen(e.x, e.y);
      return s.x >= 0 && s.y >= 0 && s.x <= c.width && s.y <= c.height;
    });
    r.renderer.selected = new Set(same.map(e => e.id));
  }

  /** Right click: leave the current mode, or clear the selection. */
  function cancelOrDeselect() {
    const r = rig.current; if (!r) return;
    if (mode.current !== 'normal') { setMode('normal'); return; }
    r.renderer.selected = new Set();
  }

  function touchTap(x: number, y: number) {
    const r = rig.current; if (!r) return;
    const pt = pointer.current;
    if (mode.current === 'place' && placing.current) {
      const def = pack.structures[placing.current], at = r.renderer.screenToCell(pt.x, pt.y), cell = r.renderer.screenToCell(x, y);
      const g = { x: at.x - ((def.w - 1) >> 1), y: at.y - ((def.h - 1) >> 1) };
      const onGhost = touchGhost.current && cell.x >= g.x && cell.x < g.x + def.w && cell.y >= g.y && cell.y < g.y + def.h;
      if (!onGhost) { Object.assign(pt, { x, y }); touchGhost.current = true; return; }
      click(pt.x, pt.y, { shift: false, ctrl: false, alt: false });
      return;
    }
    Object.assign(pt, { x, y });
    click(x, y, { shift: false, ctrl: false, alt: false });
  }

  // Latest handlers for the gesture listener, which is attached once.
  const gestures = useRef({ touchTap, zoomAt, boxSelect, selectSameType, cancelOrDeselect });
  gestures.current = { touchTap, zoomAt, boxSelect, selectSameType, cancelOrDeselect };
  useEffect(() => {
    if (!touch) return;
    void goLandscape();
    document.body.classList.add('touch-battle');
    const untrack = trackVisibleHeight();
    const box = { x: 0, y: 0 };
    const off = attachTouchGestures(canvas.current!, {
      tap: (x, y) => gestures.current.touchTap(x, y),
      doubleTap: (x, y) => { if (mode.current === 'normal') gestures.current.selectSameType(x, y); },
      pan: (dx, dy) => {
        const r = rig.current; if (!r) return;
        r.renderer.camera.x -= dx / r.renderer.camera.zoom; r.renderer.camera.y -= dy / r.renderer.camera.zoom;
        r.renderer.clampCamera();
      },
      pinch: (f, x, y) => gestures.current.zoomAt(x, y, f),
      boxStart: (x, y) => {
        Object.assign(box, { x, y });
        boxing.current = mode.current === 'normal';
        if (boxing.current && rig.current) rig.current.renderer.dragBox = { x1: x, y1: y, x2: x, y2: y };
      },
      boxMove: (x, y) => { if (boxing.current && rig.current) rig.current.renderer.dragBox = { x1: box.x, y1: box.y, x2: x, y2: y }; },
      boxEnd: (x, y) => {
        if (rig.current) rig.current.renderer.dragBox = null;
        if (!boxing.current) { gestures.current.touchTap(x, y); return; }
        boxing.current = false;
        // A long press that never moved selects everything of that type on screen.
        if (Math.hypot(x - box.x, y - box.y) < 12) gestures.current.selectSameType(x, y);
        else gestures.current.boxSelect(box.x, box.y, x, y, false);
      },
      boxCancel: () => { boxing.current = false; if (rig.current) rig.current.renderer.dragBox = null; },
      twoFingerTap: () => gestures.current.cancelOrDeselect(),
    });
    // Fallback: some browsers only allow full screen from inside a tap.
    const once = () => { void goLandscape(); };
    window.addEventListener('touchend', once, { once: true });
    return () => {
      off(); window.removeEventListener('touchend', once);
      document.body.classList.remove('touch-battle'); untrack();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const local = (ev: React.MouseEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

  function onMouseDown(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const p = local(ev);
    Object.assign(pointer.current, { down: true, sx: p.x, sy: p.y, dragging: false });
  }
  function onMouseMove(ev: React.MouseEvent) {
    const p = local(ev);
    const pt = pointer.current;
    Object.assign(pt, { x: p.x, y: p.y, inside: true });
    const r = rig.current; if (!r) return;
    if (pt.down && mode.current === 'normal' && Math.hypot(p.x - pt.sx, p.y - pt.sy) > 6) pt.dragging = true;
    r.renderer.dragBox = pt.dragging ? { x1: pt.sx, y1: pt.sy, x2: p.x, y2: p.y } : null;
    // Classic cursor feedback.
    const target = r.renderer.pick(p.x, p.y);
    r.renderer.hover = target?.id ?? 0;
    const hasUnits = [...r.renderer.selected].some(id => r.game.entities.get(id)?.owner === slot && r.game.entities.get(id)?.kind === 'unit');
    let cursor = 'default';
    if (mode.current === 'place') cursor = 'cell';
    else if (mode.current === 'sell') cursor = 'alias';
    else if (mode.current === 'repair') cursor = 'help';
    else if (mode.current === 'attackMove' || mode.current === 'super') cursor = 'crosshair';
    else if (target && target.owner === slot && !keys.current.has('Control') && !keys.current.has('Meta')) cursor = 'pointer';
    else if (hasUnits && (keys.current.has('Control') || keys.current.has('Meta'))) cursor = 'crosshair';
    else if (hasUnits && keys.current.has('Alt')) cursor = 'move';
    else if (target && hasUnits && r.game.isEnemy(slot, target.owner)) cursor = 'crosshair';
    else if (hasUnits) cursor = 'move';
    canvas.current!.style.cursor = cursor;
  }
  function onMouseUp(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const r = rig.current; if (!r) return;
    const pt = pointer.current;
    const p = local(ev);
    pt.down = false;
    if (pt.dragging) {
      pt.dragging = false; r.renderer.dragBox = null;
      boxSelect(pt.sx, pt.sy, p.x, p.y, ev.shiftKey);
      return;
    }
    click(p.x, p.y, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey });
  }

  function click(x: number, y: number, mods: { shift: boolean; ctrl: boolean; alt: boolean }) {
    const shift = mods.shift;
    const r = rig.current; if (!r) return;
    const { game, renderer, session } = r;
    const cell = renderer.screenToCell(x, y);
    const target = renderer.pick(x, y);
    const me = game.players[slot];
    const mark = (color: string) => {
      renderer.markers.push({ cx: cell.x, cy: cell.y, color, until: performance.now() + 450 });
      if (mode.current !== 'super') audio.current?.reply(selectedUnits(), 'order');
    };
    if (mode.current === 'place' && placing.current) {
      const item = placing.current, def = pack.structures[item];
      const px = cell.x - ((def.w - 1) >> 1), py = cell.y - ((def.h - 1) >> 1);
      if (game.canPlace(me, item, px, py)) { session.issue({ t: 'place', item, x: px, y: py }); setMode('normal'); }
      else say('Cannot deploy here');
      return;
    }
    if (mode.current === 'super' && superId.current) {
      const s = game.entities.get(superId.current);
      const sw = s ? game.superweaponOf(s) : undefined;
      const x = Math.max(0, cell.x), y = Math.max(0, cell.y);
      if (sw?.kind === 'chrono' && !superFrom.current) { superFrom.current = { x, y }; mark('#8fd4ff'); say('Select the destination'); return; }
      if (sw?.kind === 'chrono' && superFrom.current) session.issue({ t: 'super', id: superId.current, x: superFrom.current.x, y: superFrom.current.y, x2: x, y2: y });
      else session.issue({ t: 'super', id: superId.current, x, y });
      mark('#ff5a4a'); superId.current = 0; superFrom.current = null; setMode('normal');
      return;
    }
    if (mode.current === 'sell' || mode.current === 'repair') {
      if (target && target.owner === slot && target.kind === 'structure') {
        session.issue({ t: mode.current, id: target.id });
        audio.current?.eva(mode.current === 'sell' ? 'sold' : 'repairing');
      }
      return;
    }
    const units = [...renderer.selected].map(id => game.entities.get(id)).filter((e): e is Entity => !!e && e.owner === slot && e.kind === 'unit');
    if (mode.current === 'attackMove' && units.length) {
      session.issue({ t: 'attackMove', ids: units.map(u => u.id), x: cell.x, y: cell.y }); mark('#ff5a4a'); setMode('normal'); return;
    }
    // Ctrl+click: force-fire at anything clicked (even friendly), or at open ground.
    const onField = cell.x >= 0 && cell.y >= 0 && cell.x < game.map.w && cell.y < game.map.h && game.map.res[cell.y * game.map.w + cell.x] > 0;
    if (mods.ctrl && onField) {
      // Ctrl: work this field and come back to it after every delivery.
      const diggers = units.filter(u => pack.units[u.type].harvester);
      if (diggers.length) {
        session.issue({ t: 'harvest', ids: diggers.map(u => u.id), x: cell.x, y: cell.y, lock: true });
        say('Harvesting');
        mark('#f2c14e'); return;
      }
    }
    if (mods.ctrl && units.length) {
      if (target && !(target.kind === 'unit' && renderer.selected.has(target.id))) session.issue({ t: 'attack', ids: units.map(u => u.id), target: target.id, force: true });
      else session.issue({ t: 'fireAt', ids: units.map(u => u.id), x: Math.max(0, cell.x), y: Math.max(0, cell.y) });
      mark('#ff5a4a'); return;
    }
    // Alt+click: force-move, even onto an enemy, without engaging.
    if (mods.alt && units.length) {
      session.issue({ t: 'move', ids: units.map(u => u.id), x: Math.max(0, cell.x), y: Math.max(0, cell.y) });
      mark('#7dff7a'); return;
    }
    if (target && target.kind === 'structure' && units.length) {
      const sdef = pack.structures[target.type];
      const enemy = game.isEnemy(slot, target.owner);
      const enter = units.filter(u => {
        const d = pack.units[u.type];
        if (d.engineer) return enemy || target.owner === slot && target.hp < target.maxHp;
        if (d.spy) return enemy;
        if (d.harvester && sdef.refinery && target.owner === slot) return true;
        return target.owner === slot && (sdef.repairPad && d.kind !== 'infantry' && d.kind !== 'aircraft' || sdef.airfield && d.kind === 'aircraft');
      });
      if (enter.length) {
        session.issue({ t: 'enter', ids: enter.map(u => u.id), target: target.id });
        const rest = units.filter(u => !enter.includes(u));
        if (rest.length && enemy) session.issue({ t: 'attack', ids: rest.map(u => u.id), target: target.id });
        mark(enemy ? '#ffd24a' : '#7dff7a'); return;
      }
    }
    // Clicking your own transport with units selected loads them aboard.
    if (target && target.kind === 'unit' && target.owner === slot && !renderer.selected.has(target.id) && pack.units[target.type].transport) {
      const boarders = units.filter(u => game.canBoard(u, target));
      if (boarders.length) { session.issue({ t: 'enter', ids: boarders.map(u => u.id), target: target.id }); mark('#7dff7a'); return; }
    }
    if (target && target.owner === slot) {
      // Clicking a selected MCV again deploys it (RA2 style).
      if (target.kind === 'unit' && renderer.selected.has(target.id) && renderer.selected.size === 1 && pack.units[target.type].deploysTo) {
        session.issue({ t: 'deploy', ids: [target.id] }); return;
      }
      if (shift && target.kind === 'unit') { if (renderer.selected.has(target.id)) renderer.selected.delete(target.id); else renderer.selected.add(target.id); }
      else renderer.selected = new Set([target.id]);
      if (target.kind === 'unit') audio.current?.reply([target], 'select');
      return;
    }
    if (!units.length) { renderer.selected = target ? new Set([target.id]) : new Set(); return; }
    if (target && game.isEnemy(slot, target.owner)) {
      session.issue({ t: 'attack', ids: units.map(u => u.id), target: target.id }); mark('#ff5a4a'); return;
    }
    const i = cell.y * game.map.w + cell.x;
    const harvesters = units.filter(u => pack.units[u.type].harvester);
    if (cell.x >= 0 && cell.y >= 0 && cell.x < game.map.w && cell.y < game.map.h && game.map.res[i] > 0 && harvesters.length) {
      session.issue({ t: 'harvest', ids: harvesters.map(u => u.id), x: cell.x, y: cell.y });
      const others = units.filter(u => !pack.units[u.type].harvester);
      if (others.length) session.issue({ t: 'move', ids: others.map(u => u.id), x: cell.x, y: cell.y });
      mark('#f2c14e'); return;
    }
    session.issue({ t: 'move', ids: units.map(u => u.id), x: Math.max(0, cell.x), y: Math.max(0, cell.y) });
    mark('#7dff7a');
  }

  function onDoubleClick(ev: React.MouseEvent) {
    const p = local(ev);
    selectSameType(p.x, p.y);
  }

  function onContextMenu(ev: React.MouseEvent) {
    ev.preventDefault();
    cancelOrDeselect();
  }

  function onWheel(ev: React.WheelEvent) {
    const p = local(ev);
    zoomAt(p.x, p.y, ev.deltaY > 0 ? 0.9 : 1.1);
  }

  /** Radar: click, or press and drag, to move the view. */
  function onMinimap(ev: React.PointerEvent) {
    const r = rig.current; if (!r || !ui?.radar) return;
    if (ev.type === 'pointermove' && !ev.buttons) return;
    if (ev.type === 'pointerdown') minimap.current!.setPointerCapture?.(ev.pointerId);
    const rect = minimap.current!.getBoundingClientRect();
    r.renderer.minimapJump(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height)));
  }

  function clickItem(item: string, queue: QueueKind) {
    const r = rig.current; if (!r) return;
    const q = r.game.players[slot].queues[queue];
    if ((queue === 'structure' || queue === 'defense') && q.ready && q.items[0] === item) { placing.current = item; setMode('place'); return; }
    if ((queue === 'structure' || queue === 'defense') && q.items.length && q.items[0] !== item) { say('Building in progress'); return; }
    r.session.issue({ t: 'build', item });
    audio.current?.ui('click');
    if (r.game.players[slot].credits < r.game.costOf(item, r.game.players[slot])) say('Insufficient funds');
    else if (!q.items.length) audio.current?.eva(queue === 'infantry' ? 'training' : 'building');
  }
  function cancelItem(ev: React.MouseEvent, item: string) {
    ev.preventDefault();
    rig.current?.session.issue({ t: 'cancel', item });
    audio.current?.eva('cancelled');
  }

  const me = setup.players[slot];
  const faction = pack.factions.find(f => f.id === me?.faction) ?? pack.factions[0];
  const powerFrac = ui ? (ui.powerGen === 0 ? 0 : Math.min(1, ui.powerUse / Math.max(1, ui.powerGen))) : 0;
  const lowPower = !!ui && ui.powerUse > ui.powerGen;

  const ownUnitsSelected = !!ui?.selection?.own && !ui.selection.structure;

  // Report this player's own result once, as soon as the match is decided. The service holds
  // the match record and the slot this token speaks for, so nobody can report for anyone else.
  useEffect(() => {
    if (!ui || !(ui.over || ui.defeated) || reported.current) return;
    const kickoff = conn.match;
    if (!kickoff?.matchId) return;
    reported.current = true;
    api.reportResult(kickoff.matchId, {
      reportToken: kickoff.reportToken,
      outcome: ui.won ? 'won' : 'lost',
      credits: ui.credits,
      harvested: ui.stats.harvested,
      spent: 0,
      unitsLost: ui.stats.lost,
      unitsKilled: ui.stats.killed,
      buildingsLost: 0,
      buildingsKilled: 0,
      durationSeconds: Math.round(ui.tick / TICKS_PER_SECOND),
    }).then(setRecord).catch(() => undefined);
  }, [ui, conn]);

  const matchOver = !!ui && (ui.over || ui.defeated);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useEffect(() => {
    if (!matchOver) return;
    const timer = window.setTimeout(() => exitRef.current(), 4000);
    return () => clearTimeout(timer);
  }, [matchOver]);

  return <section className={`fusion-battle ${pack.projection}${touch ? ' touch' : ''}${drawer ? ' drawer-open' : ''}`} style={{ ['--house' as string]: faction.color, ['--house-accent' as string]: faction.accent }}>
    {ad && <AdBreak ad={ad} onDone={() => { adLock.current = false; setAd(undefined); }} />}
    <div className="fusion-stage" ref={stage}>
      <canvas ref={canvas} className="fusion-canvas" tabIndex={0} aria-label={`${style.name} battlefield`}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onDoubleClick={onDoubleClick}
        onMouseLeave={() => { pointer.current.inside = false; pointer.current.down = false; if (rig.current) rig.current.renderer.dragBox = null; }}
        onContextMenu={onContextMenu} onWheel={onWheel} />
      <div className="fusion-hud-top">
        <span>{faction.name.toUpperCase()} · {mapName.toUpperCase()}</span>
        <span data-testid="fusion-tick">{ui ? `${Math.floor(ui.tick / 15 / 60)}:${String(Math.floor(ui.tick / 15) % 60).padStart(2, '0')}` : '0:00'}</span>
      </div>
      {ui?.soundLocked && !sound.muted && <button className="fusion-sound-unlock" onClick={() => audio.current?.resume()}>🔇 Click anywhere to enable sound</button>}
      <Chat conn={conn} team={launch.players?.find(p => p.id === launch.you)?.team ?? 0} overlay onMessage={() => audio.current?.ui('click')} />
      <div className="fusion-messages">{messages.filter(m => performance.now() - m.at < 5000).map(m => <p key={m.at}>{m.text}</p>)}</div>
      {ui?.status && <div className="fusion-banner">{ui.status}</div>}
      {touch && <div className="fusion-touch-hud" aria-hidden={drawer}>
        <b>{ui?.credits ?? 0}</b><span className={lowPower ? 'low' : ''}>⚡ {ui?.powerGen ?? 0}/{ui?.powerUse ?? 0}</span>
      </div>}
      {touch && <div className="fusion-touch-bar">
        {modeView !== 'normal' && <button className="cancel" onClick={() => setMode('normal')}>✕ CANCEL</button>}
        {modeView === 'normal' && ownUnitsSelected && <>
          <button onClick={() => setMode('attackMove')}>ATTACK-MOVE</button>
          <button onClick={() => press('s')}>STOP</button>
          <button onClick={() => press('g')}>GUARD</button>
          <button onClick={() => press('x')}>SCATTER</button>
          {ui?.selection?.deploy && <button onClick={() => press('d')}>{ui.selection.unload ? 'UNLOAD' : 'DEPLOY'}</button>}
          <button onClick={cancelOrDeselect}>CLEAR</button>
        </>}
        {modeView === 'normal' && !ownUnitsSelected && <>
          <button onClick={() => { press('p'); press('p'); }}>ALL ARMY</button>
          <button onClick={() => press('h')}>BASE</button>
          <button onClick={() => press(' ')}>ALERT</button>
        </>}
      </div>}
      {touch && <div className="fusion-rotate" hidden={rotateOk}>
        <p>Turn your device sideways to command the battlefield.</p>
        <button onClick={() => void goLandscape()}>GO FULL SCREEN</button>
        <button onClick={() => setRotateOk(true)}>PLAY UPRIGHT</button>
      </div>}
      {modeView !== 'normal' && <div className="fusion-mode">{touch && modeView === 'place' ? 'Tap to move the outline — tap it again to build'
        : touch && modeView === 'super' ? (superFrom.current ? 'Tap the destination' : 'Tap the target')
        : touch && modeView === 'attackMove' ? 'Attack-move — tap a destination'
        : touch && (modeView === 'sell' || modeView === 'repair') ? `${modeView === 'sell' ? 'Sell' : 'Repair'} mode — tap a structure`
        : modeView === 'place' ? 'Click to place — right-click cancels' : modeView === 'sell' ? 'Sell mode — click a structure' : modeView === 'repair' ? 'Repair mode — click a structure' : modeView === 'super' ? (superFrom.current ? 'Choose the destination — right-click cancels' : 'Choose the target — right-click cancels') : 'Attack-move — click a destination'}</div>}
      {tree && rig.current && <TechTree game={rig.current.game} slot={slot} color={faction.color} accent={faction.accent} onClose={() => setTree(false)} />}
      {help && touch && <div className="fusion-help" onClick={() => setHelp(false)}>
        <h3>Touch controls</h3>
        <p><b>Tap</b> select · tap again to order move / attack / harvest</p>
        <p><b>Drag</b> move the map · <b>Pinch</b> zoom · <b>Radar</b> tap or drag to jump</p>
        <p><b>Hold, then drag</b> box-select · <b>Hold</b> or <b>double-tap</b> a unit: all of that type on screen</p>
        <p><b>Two-finger tap</b> deselect / cancel</p>
        <p><b>Buildings</b>: tap a ready one in the drawer, tap the map to move the outline, tap the outline to build</p>
        <p><b>Tap a selected MCV</b> to deploy · the bar at the bottom has stop, guard, scatter and deploy</p>
      </div>}
      {help && !touch && <div className="fusion-help" onClick={() => setHelp(false)}>
        <h3>Controls</h3>
        <p><b>Left click</b> select · order move / attack / harvest · <b>Right click</b> deselect / cancel</p>
        <p><b>Drag</b> box-select · <b>Shift</b>+click/drag add or remove · <b>Double-click</b> all of a type on screen</p>
        <p><b>Ctrl</b>+click force-fire (any target, or ground) · <b>Alt</b>+click force-move</p>
        <p><b>Ctrl+1–9</b> create team · <b>1–9</b> select (twice: centre) · <b>Shift+1–9</b> add team to selection · <b>Alt+1–9</b> add selection to team</p>
        <p><b>T</b> same type (twice: whole map) · <b>P</b> all combat units · <b>G</b> guard · <b>X</b> scatter · <b>S</b> stop · <b>D</b> deploy · <b>A</b> attack-move</p>
        <p><b>H</b> home · <b>Space</b> last alert · <b>Esc</b> cancel · <b>F1</b> this card · <b>F2</b> tech tree · <b>M</b> mute</p>
        <p><b>Click a selected MCV</b> to deploy · <b>Wheel</b> zoom · <b>Arrows / screen edge</b> scroll</p>
        <p><b>Engineer</b> on a building: capture (enemy) or repair (own) · <b>Spy</b>: infiltrate · <b>Damaged vehicle</b> on a repair pad: repair · <b>Aircraft</b> on an airfield: rearm · <b>Units</b> on your transport: board (<b>D</b> unloads)</p>
        <p><b>D</b> also digs in G.I.s, sets up Desolators and starts Thumpers · <b>Chronosphere</b>: pick the area, then the destination</p>
      </div>}
      {ui && (ui.over || ui.defeated) && <div className="fusion-over">
        <p className="eyebrow">{style.name.toUpperCase()}</p>
        <h2 className={ui.won ? 'victory' : 'defeat'}>{ui.won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}</h2>
        <div className="fusion-stats"><span>Built <b>{ui.stats.built}</b></span><span>Destroyed <b>{ui.stats.killed}</b></span><span>Lost <b>{ui.stats.lost}</b></span><span>Harvested <b>{ui.stats.harvested}</b></span>
          {record?.you && <span>Score <b>{record.you.score.toLocaleString('en-GB')}</b></span>}</div>
        {record && <Share url={`/match/${record.id}`} text={shareTextFor(record)} compact />}
        <p>Returning to the war room…</p>
        <button className="deploy" onClick={onExit}>RETURN TO THE WAR ROOM →</button>
      </div>}
    </div>
    {touch && <button className="fusion-drawer-toggle" onClick={() => setDrawer(v => !v)} aria-expanded={drawer} aria-label={drawer ? 'Hide the build panel' : 'Show the build panel'}>
      {drawer ? '▶' : '◀'}<span>{drawer ? 'HIDE' : 'BUILD'}</span>{!drawer && tabs.some(t => ui?.queues[t.id].ready) && <i className="dot" />}
    </button>}
    <aside className="fusion-sidebar">
      <div className="fusion-credits" data-testid="fusion-credits">{ui?.credits ?? 0}<small>{pack.resources[0].name}{ui && ui.storage > 0 ? ` · cap ${ui.storage}` : ''}</small></div>
      <div className="fusion-radar">
        <canvas ref={minimap} width={176} height={176} onPointerDown={onMinimap} onPointerMove={onMinimap} />
        <div className={`fusion-power ${lowPower ? 'low' : ''}`} title={`Power ${ui?.powerGen ?? 0} / drain ${ui?.powerUse ?? 0}`}>
          <i style={{ height: `${Math.round(powerFrac * 100)}%` }} />
        </div>
      </div>
      <div className={`fusion-tabs n${tabs.length}`}>{tabs.map(t => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
        {t.label}{ui?.queues[t.id].ready ? ' ●' : ''}</button>)}</div>
      <div className="fusion-items">
        {(ui?.options[tab] ?? []).map(item => {
          const name = itemName(pack, item), cost = ui!.costs[item] ?? 0;
          const q = ui!.queues[tab];
          const active = q.items[0] === item;
          const count = q.items.filter(i => i === item).length;
          const progress = active ? Math.min(1, q.paid / Math.max(1, cost)) : 0;
          return <button key={item} className={`fusion-item ${active && q.ready ? 'ready' : ''} ${item.startsWith('upgrade:') ? 'upgrade' : ''}`} title={`${name} — ${cost}`} data-item={item}
            onClick={() => clickItem(item, tab)} onContextMenu={e => cancelItem(e, item)}>
            <Icon game={rig.current?.game} item={item} color={faction.color} accent={faction.accent} />
            {active && !q.ready && <>
              <span className="sweep" style={{ height: `${Math.round((1 - progress) * 100)}%` }} />
              <span className="fill" style={{ height: `${Math.round(progress * 100)}%` }} />
              <span className="pct">{Math.round(progress * 100)}%</span>
            </>}
            <span className="label">{active && q.ready ? 'READY' : name}</span>
            <span className="cost">{cost}</span>
            {count > 0 && <span className="count">[{count}]</span>}
          </button>;
        })}
        {ui && !ui.options[tab]?.length && <p className="fusion-empty">{tab === 'structure' || tab === 'defense' ? 'Deploy your MCV to build.' : tab === 'starport' ? 'Build a Starport to order from CHOAM.' : 'Build the right factory to unlock.'}</p>}
      </div>
      {ui?.supers.map(sp => <button key={sp.id} className={`fusion-super ${sp.ready ? 'ready' : ''}`} disabled={!sp.ready}
        onClick={() => { superId.current = sp.id; setMode('super'); }}>
        <span className="name">{sp.name}</span>
        <span className="bar"><i style={{ width: `${Math.round(sp.frac * 100)}%` }} /></span>
        <span className="state">{sp.ready ? (sp.kind === 'reinforce' || sp.kind === 'paradrop' ? 'READY — CLICK TO CALL IN' : 'READY — CLICK TO TARGET') : sp.paused ? `${Math.round(sp.frac * 100)}% — PAUSED, LOW POWER` : `${Math.round(sp.frac * 100)}%`}</span>
      </button>)}
      <div className="fusion-actions">
        <button className={modeView === 'sell' ? 'on' : ''} onClick={() => setMode(modeView === 'sell' ? 'normal' : 'sell')}>SELL</button>
        <button className={modeView === 'repair' ? 'on' : ''} onClick={() => setMode(modeView === 'repair' ? 'normal' : 'repair')}>REPAIR</button>
        <button onClick={() => setHelp(v => !v)}>KEYS</button>
        <button className={tree ? 'on' : ''} onClick={() => setTree(v => !v)}>TECH</button>
      </div>
      <div className="fusion-sound">
        <button className={sound.muted ? 'on' : ''} onClick={() => { changeSound({ muted: !sound.muted }); audio.current?.resume(); if (sound.muted) setTimeout(() => audio.current?.ui('click'), 60); }} aria-pressed={sound.muted}>{sound.muted ? 'SOUND OFF' : ui?.soundLocked ? 'SOUND: CLICK' : 'SOUND ON'}</button>
        <button className={soundOpen ? 'on' : ''} onClick={() => setSoundOpen(v => !v)} aria-expanded={soundOpen}>VOLUME</button>
        <button className={ui?.help.open ? 'on' : ''} disabled={!ui?.help.available} onClick={() => toggleHelp()} aria-pressed={!!ui?.help.open} title={ui?.help.available ? 'Help, problem reports and requests' : 'Help is loading'}>HELP</button>
        {soundOpen && <div className="fusion-volume">
          {(['master', 'effects', 'voices'] as const).map(k => <label key={k}><span>{k === 'master' ? 'Master' : k === 'effects' ? 'Effects' : 'Voices'}</span>
            <input type="range" min={0} max={1} step={0.05} value={sound[k]} onChange={e => changeSound({ [k]: Number(e.target.value) })} /></label>)}
        </div>}
      </div>
      {ui?.selection && <div className="fusion-selection">
        <b>{ui.selection.count > 1 ? `${ui.selection.count} selected` : ui.selection.name}</b>
        <span className="hp"><i style={{ width: `${Math.round((ui.selection.hp / ui.selection.max) * 100)}%` }} /></span>
        {ui.selection.own && ui.selection.deploy && <button onClick={() => { const r = rig.current; if (r) r.session.issue({ t: 'deploy', ids: [...r.renderer.selected] }); }}>{ui.selection.unload ? 'UNLOAD' : 'DEPLOY'}</button>}
      </div>}
      <p className="fusion-fidelity">{pack.fidelityNote}</p>
      <button className="fusion-leave" onClick={() => { rig.current?.session.issue({ t: 'surrender' }); onExit(); }}>LEAVE OPERATION</button>
    </aside>
  </section>;
}

/** Sidebar cameo, drawn procedurally once per item. */
function Icon({ game, item, color, accent }: { game?: Game; item: string; color: string; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (game && ref.current) drawIcon(ref.current, game, item, color, accent); }, [game, item]);
  return <canvas ref={ref} width={64} height={48} className="cameo" />;
}
