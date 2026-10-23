import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LaunchRequest, styleInfo } from '@comrade/contracts';
import { Command, Entity, Game, LocalSession, LockstepSession, PACKS, QueueKind, RulePack, Session } from '../../../packages/fusion/src/index';
import { FusionRenderer, drawIcon } from '../../../packages/fusion/src/render';
import type { RoomConnection } from './net';

type Mode = 'normal' | 'place' | 'sell' | 'repair' | 'attackMove' | 'super';
interface SuperView { id: number; name: string; frac: number; ready: boolean; kind: string }
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
  options: Record<QueueKind, string[]>; queues: Record<QueueKind, QueueView>; costs: Record<string, number>;
  selection: { name: string; hp: number; max: number; count: number; deploy: boolean; own: boolean; structure: boolean } | null;
  status: string; over: boolean; won: boolean; defeated: boolean; stats: { built: number; lost: number; killed: number; harvested: number };
  supers: SuperView[];
}

declare global {
  interface Window { comradeFusion?: { game: Game; slot: number; renderer: FusionRenderer; issue(cmd: Command): void } }
}

export default function FusionBattle({ launch, mapName, conn, onExit }: { launch: LaunchRequest; mapName: string; conn: RoomConnection; onExit: () => void }) {
  const style = styleInfo(launch.style);
  const pack = PACKS[style.pack ?? 'dune'];
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
  const [messages, setMessages] = useState<{ text: string; at: number }[]>([]);
  const [modeView, setModeView] = useState<Mode>('normal');
  const [help, setHelp] = useState(false);

  const setup = useMemo(() => {
    const humans = launch.players?.length ? launch.players : [{ id: 'local', name: 'Commander', faction: launch.faction }];
    const preset = pack.maps.find(m => m.id === launch.map) ?? pack.maps[0];
    const aiCount = Math.max(0, Math.min(launch.settings.ai, preset.maxPlayers - humans.length));
    const players = humans.slice(0, preset.maxPlayers).map(h => ({ name: h.name, faction: h.faction, ai: false }));
    for (let i = 0; i < aiCount; i++) {
      const used = new Set(players.map(p => p.faction));
      const faction = pack.factions.find(f => !used.has(f.id)) ?? pack.factions[players.length % pack.factions.length];
      players.push({ name: `Computer ${i + 1}`, faction: faction.id, ai: true });
    }
    return {
      players, humans: Math.min(humans.length, preset.maxPlayers), mapId: preset.id,
      slot: Math.max(0, humans.findIndex(h => h.id === launch.you)),
      seed: launch.seed ?? Math.floor(Math.random() * 0x7ffffffe) + 1,
    };
  }, []);
  const slot = setup.slot;

  const say = (text: string) => setMessages(m => [...m.filter(x => performance.now() - x.at < 6000).slice(-3), { text, at: performance.now() }]);

  useEffect(() => {
    const game = new Game({ pack, mapId: setup.mapId, seed: setup.seed, players: setup.players, credits: launch.settings.credits, techLevel: launch.settings.techLevel });
    const humans = Array.from({ length: setup.humans }, (_, i) => i);
    const session: Session = setup.humans > 1 ? new LockstepSession(game, slot, humans, conn.transport()) : new LocalSession(game, slot);
    const renderer = new FusionRenderer(canvas.current!, game, slot);
    rig.current = { game, session, renderer };
    window.comradeFusion = { game, slot, renderer, issue: cmd => session.issue(cmd) };

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
    let prev: { ready: Record<string, boolean>; units: number; low: boolean; hp: number; over: boolean } | null = null;
    let lastAttackWarning = -1e9;
    const announced = new WeakSet<object>();
    const lastHp = new Map<number, number>();
    const readySupers = new Set<number>();
    const loop = (now: number) => {
      const dt = Math.min(2000, now - last); last = now;
      const alpha = session.update(dt);
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
      const me = game.players[slot];
      const radar = [...game.entities.values()].some(e => e.owner === slot && e.kind === 'structure' && pack.structures[e.type].radar) && !game.lowPower(slot);
      if (now - mmTimer > 200 && minimap.current) { mmTimer = now; renderer.drawMinimap(minimap.current, radar); }
      if (now - uiTimer > 250) {
        uiTimer = now;
        const options = {} as Record<QueueKind, string[]>;
        const queues = {} as Record<QueueKind, QueueView>;
        const costs: Record<string, number> = {};
        for (const t of tabs) {
          options[t.id] = game.buildOptions(me, t.id);
          for (const item of options[t.id]) costs[item] = game.costOf(item, me);
          const q = me.queues[t.id]; queues[t.id] = { items: [...q.items], paid: q.paid, ready: q.ready };
          for (const item of q.items) costs[item] ??= game.costOf(item, me);
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
          const ready = e.charge >= sw.charge;
          if (ready && !readySupers.has(e.id) && game.tick > 30) say(`${sw.name} ready`);
          if (ready) readySupers.add(e.id); else readySupers.delete(e.id);
          supers.push({ id: e.id, name: sw.name, frac: Math.min(1, e.charge / sw.charge), ready, kind: sw.kind });
        }
        for (const fx of game.effects) {
          if (fx.kind === 'infiltrate' && fx.owner !== slot && !announced.has(fx) && game.tick - fx.tick < fx.dur && game.entities.get([...game.entities.values()].find(e => e.kind === 'structure' && e.x === fx.x && e.y === fx.y)?.id ?? 0)?.owner === slot) { announced.add(fx); say('Building infiltrated'); }
          if (fx.kind === 'capture' && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say(fx.owner === slot ? 'Building captured' : 'Our building has been captured'); }
          if (fx.kind === 'promote' && fx.owner === slot && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say('Unit promoted'); }
          if (fx.kind === 'upgrade' && fx.owner === slot && !announced.has(fx) && game.tick - fx.tick < fx.dur) { announced.add(fx); say('Upgrade complete'); }
          if (announced.has(fx) || game.tick - fx.tick > fx.dur || !['superLaunch', 'ionCharge', 'stormClouds', 'paradrop', 'reinforce', 'chronoCharge', 'curtainCharge'].includes(fx.kind)) continue;
          announced.add(fx);
          const name = fx.color ?? 'Superweapon';
          if (fx.owner === slot) say(fx.kind === 'stormClouds' ? `${name} unleashed` : `${name} launched`);
          else say(fx.kind === 'stormClouds' ? `Warning: ${name} approaching` : `Warning: ${name} launched`);
        }
        prev = { ready: { structure: queues.structure.ready, defense: queues.defense.ready }, units, low, hp: myHp, over: game.over };
        setUi({
          tick: game.tick, credits: me.credits, storage: me.storage, powerGen: me.powerGen, powerUse: me.powerUse, radar, options, queues,
          selection: first ? { name: (firstDef?.name ?? first.type) + (first.kind === 'unit' ? RANKS[first.rank] ?? '' : ''), hp: first.hp, max: first.maxHp, count: sel.length, deploy: sel.some(e => e.kind === 'unit' && !!(pack.units[e.type].deploysTo || pack.units[e.type].deployWeapon || pack.units[e.type].lure)), own: first.owner === slot, structure: first.kind === 'structure' } : null,
          status: status === 'waiting' ? 'Waiting for other commanders…' : status === 'desync' ? 'Desynchronised — the match cannot continue' : '',
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
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
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
    };
    const keyup = (ev: KeyboardEvent) => keys.current.delete(ev.key);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); session.dispose();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      delete window.comradeFusion;
    };
  }, []);

  function setMode(m: Mode) {
    if (m !== 'super') superFrom.current = null;
    mode.current = m; setModeView(m);
    if (m !== 'place') placing.current = null;
  }

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
    const { game, renderer } = r;
    if (pt.dragging) {
      pt.dragging = false; renderer.dragBox = null;
      const x1 = Math.min(pt.sx, p.x), x2 = Math.max(pt.sx, p.x), y1 = Math.min(pt.sy, p.y), y2 = Math.max(pt.sy, p.y);
      const picked: number[] = [];
      for (const e of game.entities.values()) {
        if (e.owner !== slot || e.kind !== 'unit' || e.hp <= 0) continue;
        const s = renderer.toScreen(e.x, e.y);
        if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) picked.push(e.id);
      }
      renderer.selected = new Set(ev.shiftKey ? [...renderer.selected, ...picked] : picked);
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
    const mark = (color: string) => renderer.markers.push({ cx: cell.x, cy: cell.y, color, until: performance.now() + 450 });
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
      if (target && target.owner === slot && target.kind === 'structure') session.issue({ t: mode.current, id: target.id });
      return;
    }
    const units = [...renderer.selected].map(id => game.entities.get(id)).filter((e): e is Entity => !!e && e.owner === slot && e.kind === 'unit');
    if (mode.current === 'attackMove' && units.length) {
      session.issue({ t: 'attackMove', ids: units.map(u => u.id), x: cell.x, y: cell.y }); mark('#ff5a4a'); setMode('normal'); return;
    }
    // Ctrl+click: force-fire at anything clicked (even friendly), or at open ground.
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
        return target.owner === slot && (sdef.repairPad && d.kind !== 'infantry' && d.kind !== 'aircraft' || sdef.airfield && d.kind === 'aircraft');
      });
      if (enter.length) {
        session.issue({ t: 'enter', ids: enter.map(u => u.id), target: target.id });
        const rest = units.filter(u => !enter.includes(u));
        if (rest.length && enemy) session.issue({ t: 'attack', ids: rest.map(u => u.id), target: target.id });
        mark(enemy ? '#ffd24a' : '#7dff7a'); return;
      }
    }
    if (target && target.owner === slot) {
      // Clicking a selected MCV again deploys it (RA2 style).
      if (target.kind === 'unit' && renderer.selected.has(target.id) && renderer.selected.size === 1 && pack.units[target.type].deploysTo) {
        session.issue({ t: 'deploy', ids: [target.id] }); return;
      }
      if (shift && target.kind === 'unit') { if (renderer.selected.has(target.id)) renderer.selected.delete(target.id); else renderer.selected.add(target.id); }
      else renderer.selected = new Set([target.id]);
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
    const r = rig.current; if (!r) return;
    const p = local(ev);
    const target = r.renderer.pick(p.x, p.y);
    if (!target || target.owner !== slot || target.kind !== 'unit') return;
    const c = canvas.current!;
    const same = [...r.game.entities.values()].filter(e => {
      if (e.owner !== slot || e.type !== target.type || e.hp <= 0) return false;
      const s = r.renderer.toScreen(e.x, e.y);
      return s.x >= 0 && s.y >= 0 && s.x <= c.width && s.y <= c.height;
    });
    r.renderer.selected = new Set(same.map(e => e.id));
  }

  function onContextMenu(ev: React.MouseEvent) {
    ev.preventDefault();
    const r = rig.current; if (!r) return;
    if (mode.current !== 'normal') { setMode('normal'); return; }
    r.renderer.selected = new Set();
  }

  function onWheel(ev: React.WheelEvent) {
    const r = rig.current; if (!r) return;
    const p = local(ev);
    const cam = r.renderer.camera;
    const before = { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
    cam.zoom = Math.max(0.6, Math.min(2.2, cam.zoom * (ev.deltaY > 0 ? 0.9 : 1.1)));
    cam.x = before.x - p.x / cam.zoom; cam.y = before.y - p.y / cam.zoom;
    r.renderer.clampCamera();
  }

  function onMinimap(ev: React.MouseEvent) {
    const r = rig.current; if (!r || !ui?.radar) return;
    const rect = minimap.current!.getBoundingClientRect();
    r.renderer.minimapJump((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
  }

  function clickItem(item: string, queue: QueueKind) {
    const r = rig.current; if (!r) return;
    const q = r.game.players[slot].queues[queue];
    if ((queue === 'structure' || queue === 'defense') && q.ready && q.items[0] === item) { placing.current = item; mode.current = 'place'; setModeView('place'); return; }
    if ((queue === 'structure' || queue === 'defense') && q.items.length && q.items[0] !== item) { say('Building in progress'); return; }
    r.session.issue({ t: 'build', item });
    if (r.game.players[slot].credits < r.game.costOf(item, r.game.players[slot])) say('Insufficient funds');
  }
  function cancelItem(ev: React.MouseEvent, item: string) {
    ev.preventDefault();
    rig.current?.session.issue({ t: 'cancel', item });
  }

  const me = setup.players[slot];
  const faction = pack.factions.find(f => f.id === me?.faction) ?? pack.factions[0];
  const powerFrac = ui ? (ui.powerGen === 0 ? 0 : Math.min(1, ui.powerUse / Math.max(1, ui.powerGen))) : 0;
  const lowPower = !!ui && ui.powerUse > ui.powerGen;

  return <section className={`fusion-battle ${pack.projection}`} style={{ ['--house' as string]: faction.color, ['--house-accent' as string]: faction.accent }}>
    <div className="fusion-stage" ref={stage}>
      <canvas ref={canvas} className="fusion-canvas" tabIndex={0} aria-label={`${style.name} battlefield`}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onDoubleClick={onDoubleClick}
        onMouseLeave={() => { pointer.current.inside = false; pointer.current.down = false; if (rig.current) rig.current.renderer.dragBox = null; }}
        onContextMenu={onContextMenu} onWheel={onWheel} />
      <div className="fusion-hud-top">
        <span>{faction.name.toUpperCase()} · {mapName.toUpperCase()}</span>
        <span data-testid="fusion-tick">{ui ? `${Math.floor(ui.tick / 15 / 60)}:${String(Math.floor(ui.tick / 15) % 60).padStart(2, '0')}` : '0:00'}</span>
      </div>
      <div className="fusion-messages">{messages.filter(m => performance.now() - m.at < 5000).map(m => <p key={m.at}>{m.text}</p>)}</div>
      {ui?.status && <div className="fusion-banner">{ui.status}</div>}
      {modeView !== 'normal' && <div className="fusion-mode">{modeView === 'place' ? 'Click to place — right-click cancels' : modeView === 'sell' ? 'Sell mode — click a structure' : modeView === 'repair' ? 'Repair mode — click a structure' : modeView === 'super' ? (superFrom.current ? 'Choose the destination — right-click cancels' : 'Choose the target — right-click cancels') : 'Attack-move — click a destination'}</div>}
      {help && <div className="fusion-help" onClick={() => setHelp(false)}>
        <h3>Controls</h3>
        <p><b>Left click</b> select · order move / attack / harvest · <b>Right click</b> deselect / cancel</p>
        <p><b>Drag</b> box-select · <b>Shift</b>+click/drag add or remove · <b>Double-click</b> all of a type on screen</p>
        <p><b>Ctrl</b>+click force-fire (any target, or ground) · <b>Alt</b>+click force-move</p>
        <p><b>Ctrl+1–9</b> create team · <b>1–9</b> select (twice: centre) · <b>Shift+1–9</b> add team to selection · <b>Alt+1–9</b> add selection to team</p>
        <p><b>T</b> same type (twice: whole map) · <b>P</b> all combat units · <b>G</b> guard · <b>X</b> scatter · <b>S</b> stop · <b>D</b> deploy · <b>A</b> attack-move</p>
        <p><b>H</b> home · <b>Space</b> last alert · <b>Esc</b> cancel · <b>F1</b> this card</p>
        <p><b>Click a selected MCV</b> to deploy · <b>Wheel</b> zoom · <b>Arrows / screen edge</b> scroll</p>
        <p><b>Engineer</b> on a building: capture (enemy) or repair (own) · <b>Spy</b>: infiltrate · <b>Damaged vehicle</b> on a repair pad: repair · <b>Aircraft</b> on an airfield: rearm</p>
        <p><b>D</b> also digs in G.I.s, sets up Desolators and starts Thumpers · <b>Chronosphere</b>: pick the area, then the destination</p>
      </div>}
      {ui && (ui.over || ui.defeated) && <div className="fusion-over">
        <p className="eyebrow">{style.name.toUpperCase()}</p>
        <h2 className={ui.won ? 'victory' : 'defeat'}>{ui.won ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}</h2>
        <div className="fusion-stats"><span>Built <b>{ui.stats.built}</b></span><span>Destroyed <b>{ui.stats.killed}</b></span><span>Lost <b>{ui.stats.lost}</b></span><span>Harvested <b>{ui.stats.harvested}</b></span></div>
        <button className="deploy" onClick={onExit}>RETURN TO THE WAR ROOM →</button>
      </div>}
    </div>
    <aside className="fusion-sidebar">
      <div className="fusion-credits" data-testid="fusion-credits">{ui?.credits ?? 0}<small>{pack.resources[0].name}{ui && ui.storage > 0 ? ` · cap ${ui.storage}` : ''}</small></div>
      <div className="fusion-radar">
        <canvas ref={minimap} width={176} height={176} onClick={onMinimap} />
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
            {active && !q.ready && <span className="sweep" style={{ height: `${Math.round((1 - progress) * 100)}%` }} />}
            <span className="label">{active && q.ready ? 'READY' : name}</span>
            <span className="cost">{cost}</span>
            {count > 1 && <span className="count">{count}</span>}
          </button>;
        })}
        {ui && !ui.options[tab]?.length && <p className="fusion-empty">{tab === 'structure' || tab === 'defense' ? 'Deploy your MCV to build.' : tab === 'starport' ? 'Build a Starport to order from CHOAM.' : 'Build the right factory to unlock.'}</p>}
      </div>
      {ui?.supers.map(sp => <button key={sp.id} className={`fusion-super ${sp.ready ? 'ready' : ''}`} disabled={!sp.ready}
        onClick={() => { superId.current = sp.id; setMode('super'); }}>
        <span className="name">{sp.name}</span>
        <span className="bar"><i style={{ width: `${Math.round(sp.frac * 100)}%` }} /></span>
        <span className="state">{sp.ready ? (sp.kind === 'reinforce' || sp.kind === 'paradrop' ? 'READY — CLICK TO CALL IN' : 'READY — CLICK TO TARGET') : `${Math.round(sp.frac * 100)}%`}</span>
      </button>)}
      <div className="fusion-actions">
        <button className={modeView === 'sell' ? 'on' : ''} onClick={() => setMode(modeView === 'sell' ? 'normal' : 'sell')}>SELL</button>
        <button className={modeView === 'repair' ? 'on' : ''} onClick={() => setMode(modeView === 'repair' ? 'normal' : 'repair')}>REPAIR</button>
        <button onClick={() => setHelp(v => !v)}>KEYS</button>
      </div>
      {ui?.selection && <div className="fusion-selection">
        <b>{ui.selection.count > 1 ? `${ui.selection.count} selected` : ui.selection.name}</b>
        <span className="hp"><i style={{ width: `${Math.round((ui.selection.hp / ui.selection.max) * 100)}%` }} /></span>
        {ui.selection.own && ui.selection.deploy && <button onClick={() => { const r = rig.current; if (r) r.session.issue({ t: 'deploy', ids: [...r.renderer.selected] }); }}>DEPLOY</button>}
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
