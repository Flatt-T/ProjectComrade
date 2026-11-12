// Persistent-world region view (PW08): the browser restores the authoritative Fusion
// snapshot, runs the same deterministic sim locally, sends orders as durable intents
// over /mmo, and applies the server's resolved command stream in journal order.
// Authoritative checksums arrive as observations; a mismatch (or a lost event gap)
// triggers a fresh snapshot — the client never predicts its own state.
import React, { useEffect, useRef, useState } from 'react';
import {
  Entity, Game, PACKS, QueueKind, restoreGame,
} from '../../../packages/fusion/src/index';
import { FusionRenderer, drawIcon } from '../../../packages/fusion/src/render';
import { MmoConnection, PersistentSession, SnapshotState } from './mmo';
import { mmoEntityId } from '@comrade/contracts';
import type {
  BarterItem, MmoAwayReport, MmoNotification, MmoNotificationKind, MmoNotificationPrefs, MmoNotifyChannel,
} from '@comrade/contracts';
import { api } from './api';
import type {
  MmoAllianceResponse, MmoLadderResponse, MmoObjectivesResponse, MmoPlayersResponse,
  MmoProtectionResponse, MmoRegionsResponse, MmoTradeOffersResponse, MmoTransfersResponse,
} from './api';
import { typingIn } from './help';

type Mode = 'normal' | 'place' | 'repair' | 'attackMove' | 'super' | 'sell';
const ALL_TABS: { id: QueueKind; label: string }[] = [
  { id: 'structure', label: 'Base' }, { id: 'defense', label: 'Defence' }, { id: 'infantry', label: 'Infantry' },
  { id: 'vehicle', label: 'Vehicles' }, { id: 'aircraft', label: 'Air' }, { id: 'naval', label: 'Navy' },
];
const RANKS = ['', ' · Veteran', ' · Elite'];
/** Shield durations offered in the panel (seconds). */
const SHIELD_PRESETS = [3600, 4 * 3600, 8 * 3600, 24 * 3600];
function fmtDur(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
const NOTE_TEXT: Record<MmoNotificationKind, string> = {
  compound_under_attack: 'Your compound is under attack',
  shield_ending: 'Your shield is ending soon',
  storage_full: 'Storage is full',
  superweapon_nearby: 'A superweapon was deployed near you',
  trade_offer: 'You have a trade offer',
  ally_call: 'An ally is calling for help',
  objective_done: 'Objective complete',
  system: 'Notification',
};

interface UiState {
  tick: number; credits: number; storage: number; powerGen: number; powerUse: number;
  options: Record<string, string[]>; costs: Record<string, number>;
  selection: { name: string; hp: number; max: number; count: number; own: boolean; structure: boolean; id: number; packed: boolean; packable: boolean } | null;
  status: string; connected: boolean; slot: number;
  supers: { id: number; name: string; frac: number; ready: boolean }[];
  recovering: boolean;
}

export default function PersistentWorld({ regionId, settled = true, onExit }: { regionId: string; settled?: boolean; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rig = useRef<{ game: Game; session: PersistentSession; renderer: FusionRenderer } | null>(null);
  const connRef = useRef<MmoConnection | null>(null);
  const mode = useRef<Mode>('normal');
  const placing = useRef<string | null>(null);
  const superId = useRef(0);
  const superFrom = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0, inside: false, down: false, sx: 0, sy: 0, dragging: false });
  const keys = useRef(new Set<string>());
  const [tab, setTab] = useState<QueueKind>('structure');
  const [ui, setUi] = useState<UiState | null>(null);
  const [modeView, setModeView] = useState<Mode>('normal');
  const [notice, setNotice] = useState('');
  // PW11: newcomers pick a faction, then the journaled `settle` action grants
  // the starter army and the one-hour setup protection window.
  const [needSettle, setNeedSettle] = useState(!settled);
  // Mirrors "the durable player owns a roster slot" for the polling effect,
  // which cannot see state updates. The ladder endpoint 400s pre-settlement.
  const rosteredRef = useRef(settled);
  // PW25: notification inbox, channel opt-ins and the offline timeline.
  const [notes, setNotes] = useState<MmoNotification[]>([]);
  const [prefs, setPrefs] = useState<MmoNotificationPrefs | null>(null);
  const [away, setAway] = useState<MmoAwayReport | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // PW27: earned-shield selection — armed records activate on the offline
  // transition; the panel shows live remaining hours from the durable record.
  const [prot, setProt] = useState<MmoProtectionResponse | null>(null);
  const [showShield, setShowShield] = useState(false);
  const [shieldCustom, setShieldCustom] = useState('');
  // PW13: barter inbox/outbox — offers are authored via the wire protocol;
  // this panel answers, cancels and lists them.
  const [offers, setOffers] = useState<MmoTradeOffersResponse | null>(null);
  const [showTrade, setShowTrade] = useState(false);
  // PW19: world roster, region browser, live transfers and alliance state —
  // every panel is read-only REST state plus journaled intents.
  const [players, setPlayers] = useState<MmoPlayersResponse | null>(null);
  const [regions, setRegions] = useState<MmoRegionsResponse | null>(null);
  const [transfers, setTransfers] = useState<MmoTransfersResponse | null>(null);
  const [alliance, setAlliance] = useState<MmoAllianceResponse | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showAlliance, setShowAlliance] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [barterTo, setBarterTo] = useState('');
  const [barterGive, setBarterGive] = useState('credits');
  const [barterGiveAmt, setBarterGiveAmt] = useState('100');
  const [barterWant, setBarterWant] = useState('credits');
  const [barterWantAmt, setBarterWantAmt] = useState('100');
  const [allyName, setAllyName] = useState('');
  // PW19: region/alliance chat — journaled world action, delivered back on the
  // event stream; the client renders, never authors state.
  const [chat, setChat] = useState<{ channel: string; fromId: string; fromName: string; text: string }[]>([]);
  const [chatChannel, setChatChannel] = useState<'region' | 'alliance'>('region');
  const [chatText, setChatText] = useState('');
  // PW19: daily/weekly objectives — progress is server-bumped; claims are
  // journaled world actions that grant earned shield seconds.
  const [objectives, setObjectives] = useState<MmoObjectivesResponse | null>(null);
  const [ladder, setLadder] = useState<MmoLadderResponse | null>(null);

  useEffect(() => {
    let game: Game | null = null;
    let renderer: FusionRenderer | null = null;
    let session: PersistentSession | null = null;
    let raf = 0;
    let uiTimer = 0, mmTimer = 0;
    let last = performance.now();
    let slot = 0;

    const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 4000); };

    const conn = new MmoConnection({
      onWelcome: info => {
        connRef.current = conn;
        if (info.slot !== null) slot = info.slot;
        else { rosteredRef.current = false; setNeedSettle(true); } // rostered nowhere yet — settle (or rejoin) first
      },
      onSnapshot: header => {
        const state = header.state as SnapshotState | undefined;
        if (!state?.snapshot) { flash('Region snapshot unavailable'); return; }
        try {
          game = restoreGame(state.snapshot, Object.values(PACKS));
        } catch { flash('Could not restore region state'); return; }
        // A fresh snapshot replaces the whole rig: it is the authoritative baseline.
        renderer = new FusionRenderer(canvas.current!, game, slot);
        session = new PersistentSession(game, slot, conn, regionId);
        rig.current = { game, session, renderer };
        // Read-only handle for beta scenario tooling: exposes the live rig so an
        // external driver can translate map cells to screen coordinates. The beta
        // contract already accepts modified clients, so this grants nothing new.
        (window as unknown as { __comradeWorld?: unknown }).__comradeWorld = rig.current;
        const start = game.mapPreset.starts[slot] ?? { x: game.map.w >> 1, y: game.map.h >> 1 };
        renderer.centerOn(start.x, start.y);
      },
      onSim: (atTick, fromSlot, command) => session?.applyRemote(atTick, fromSlot, command),
      onObservation: (tick, checksum) => {
        const g = rig.current?.game;
        if (!g) return;
        if (g.tick === tick && g.checksum() !== checksum) {
          flash('State diverged — resyncing');
          conn.resync();
        } else if (g.tick < tick - 900) {
          flash('Fell behind — resyncing');
          conn.resync();
        }
      },
      onResult: (_commandId, status, result) => {
        const r = result as { accepted?: boolean; reason?: string } | undefined;
        if (status !== 'applied' || r?.accepted === false) flash(`Order rejected${r?.reason ? `: ${r.reason}` : ''}`);
      },
      onError: (code, message) => flash(`${code}: ${message}`),
      onStatus: connected => setUi(u => u ? { ...u, connected } : { tick: 0, credits: 0, storage: 0, powerGen: 0, powerUse: 0, options: {}, costs: {}, selection: null, status: connected ? '' : 'Reconnecting…', connected, slot, supers: [], recovering: false }),
    });
    conn.subscribe(regionId);

    // PW25: live notifications arrive on the socket; the inbox, prefs and the
    // away report come from the durable API once per mount.
    const offNotes = conn.on(msg => {
      if (msg.type === 'event' && msg.eventKind === 'chat') {
        const p = msg.payload as { channel?: string; fromId?: string; fromName?: string; text?: string };
        if (p.text) {
          const text = p.text;
          setChat(cs => [...cs.slice(-49), {
            channel: p.channel ?? 'region', fromId: p.fromId ?? '',
            fromName: p.fromName ?? 'Commander', text,
          }]);
        }
        return;
      }
      if (msg.type !== 'notification') return;
      const n: MmoNotification = {
        notificationId: msg.notificationId, playerId: '', kind: msg.kind,
        payload: msg.payload ?? {}, createdAt: msg.createdAt, readAt: null,
      };
      setNotes(ns => [n, ...ns].slice(0, 30));
      flash(NOTE_TEXT[msg.kind] ?? 'New notification');
    });
    void api.mmoNotifications().then(r => {
      setPrefs(r.prefs);
      setNotes(r.notifications.slice(0, 30));
    }).catch(() => undefined);
    void api.mmoAwayReport().then(r => { if (r.entries.length) setAway(r); }).catch(() => undefined);
    const loadProt = () => void api.mmoProtection().then(setProt).catch(() => undefined);
    loadProt();
    const protTimer = window.setInterval(loadProt, 15_000);
    const loadOffers = () => void api.mmoTradeOffers().then(setOffers).catch(() => undefined);
    loadOffers();
    const offersTimer = window.setInterval(loadOffers, 15_000);
    // PW19: roster/regions/transfers/alliance refresh alongside offers.
    const loadWorld = () => {
      void api.mmoPlayers().then(setPlayers).catch(() => undefined);
      void api.mmoRegions().then(setRegions).catch(() => undefined);
      void api.mmoTransfers().then(setTransfers).catch(() => undefined);
      void api.mmoAlliance().then(setAlliance).catch(() => undefined);
      void api.mmoObjectives().then(setObjectives).catch(() => undefined);
      if (rosteredRef.current) void api.mmoLadder().then(setLadder).catch(() => undefined);
    };
    loadWorld();
    const worldTimer = window.setInterval(loadWorld, 15_000);

    const resize = () => {
      const el = stage.current!, c = canvas.current!;
      c.width = Math.max(320, el.clientWidth); c.height = Math.max(240, el.clientHeight);
      rig.current?.renderer.clampCamera();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (stage.current) observer.observe(stage.current);

    // Advance the simulation by wall time; a worker timer keeps a hidden tab stepping
    // so server observations keep lining up with the local checksum.
    const advance = (now: number) => {
      const dt = Math.min(2000, now - last); last = now;
      rig.current?.session.update(dt);
    };
    let ticker: Worker | null = null;
    try {
      ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
      ticker.onmessage = () => { if (document.hidden) advance(performance.now()); };
    } catch { ticker = null; }

    const loop = (now: number) => {
      const dt = Math.min(2000, now - last); last = now;
      const r = rig.current;
      if (r) {
        const sim = r.game;
        // PW11: the journaled join lands on the sim stream; once our durable pid
        // owns a slot, adopt it for orders, fog-of-war and the HUD.
        const mine = conn.playerId ? sim.players.findIndex(pl => pl.pid === conn.playerId) : -1;
        if (mine >= 0 && r.session.slot !== mine) {
          r.session.setSlot(mine); r.renderer.viewer = mine; slot = mine;
          rosteredRef.current = true;
          setNeedSettle(false);
          const home = [...sim.entities.values()].find(e => e.owner === mine && e.hp > 0);
          if (home) { const c = sim.cellOf(home); r.renderer.centerOn(c % sim.map.w, Math.floor(c / sim.map.w)); }
        }
        const alpha = r.session.update(dt);
        const p = pointer.current, c = canvas.current!;
        const speed = (Math.min(dt, 50) * 0.9) / r.renderer.camera.zoom;
        let dx = 0, dy = 0;
        if (keys.current.has('ArrowLeft') || p.inside && !p.down && p.x < 14) dx -= speed;
        if (keys.current.has('ArrowRight') || p.inside && !p.down && p.x > c.width - 14) dx += speed;
        if (keys.current.has('ArrowUp') || p.inside && !p.down && p.y < 14) dy -= speed;
        if (keys.current.has('ArrowDown') || p.inside && !p.down && p.y > c.height - 14) dy += speed;
        if (dx || dy) { r.renderer.camera.x += dx; r.renderer.camera.y += dy; r.renderer.clampCamera(); }
        if (mode.current === 'place' && placing.current) {
          const def = r.game.pack.structures[placing.current];
          const cell = r.renderer.screenToCell(p.x, p.y);
          r.renderer.ghost = { item: placing.current, x: cell.x - ((def.w - 1) >> 1), y: cell.y - ((def.h - 1) >> 1) };
        } else r.renderer.ghost = null;
        for (const id of [...r.renderer.selected]) { const e = r.game.entities.get(id); if (!e || e.hp <= 0) r.renderer.selected.delete(id); }
        r.renderer.draw(alpha);
        if (now - mmTimer > 200 && minimap.current) { mmTimer = now; r.renderer.drawMinimap(minimap.current, false); }
        if (now - uiTimer > 250) {
          uiTimer = now;
          const g = r.game, me = g.players[r.session.slot];
          if (me) {
            const options: Record<string, string[]> = {};
            const costs: Record<string, number> = {};
            for (const t of ALL_TABS) {
              const list = g.buildOptions(me, t.id);
              options[t.id] = [...list];
              for (const item of list) costs[item] = g.costOf(item, me);
            }
            const sel = [...r.renderer.selected].map(id => g.entities.get(id)).filter((e): e is Entity => !!e);
            const first = sel[0];
            const fd = first ? (first.kind === 'unit' ? g.pack.units[first.type] : g.pack.structures[first.type]) : undefined;
            const fsdef = first?.kind === 'structure' ? g.pack.structures[first.type] : undefined;
            const packable = !!first && first.kind === 'structure' && first.owner === r.session.slot && first.bound === 0
              && !!g.pack.units[`pack_${first.type}`] && !fsdef?.wall && !fsdef?.floor && !fsdef?.onWater;
            const supers: UiState['supers'] = [];
            for (const e of g.entities.values()) {
              if (e.owner !== r.session.slot || e.hp <= 0) continue;
              const sw = g.superweaponOf(e);
              if (!sw) continue;
              const need = g.chargeFor(sw);
              supers.push({ id: e.id, name: sw.name, frac: Math.min(1, e.charge / need), ready: e.charge >= need });
            }
            setUi({
              tick: g.tick, credits: me.credits, storage: me.storage, powerGen: me.powerGen, powerUse: me.powerUse,
              options, costs,
              selection: first ? { name: (fd?.name ?? first.type) + (first.kind === 'unit' ? RANKS[first.rank] ?? '' : ''), hp: first.hp, max: first.maxHp, count: sel.length, own: first.owner === r.session.slot, structure: first.kind === 'structure', id: first.id, packed: !!first.packedType, packable } : null,
              status: conn.connected ? '' : 'Reconnecting…', connected: conn.connected, slot: r.session.slot, supers,
              recovering: me.recovering === true,
            });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const keydown = (ev: KeyboardEvent) => {
      if (typingIn(ev.target)) return;
      keys.current.add(ev.key);
      const r = rig.current; if (!r) return;
      const { game, renderer, session } = r;
      const key = ev.key.toLowerCase();
      const sel = () => [...renderer.selected].filter(id => game.entities.get(id)?.owner === session.slot && game.entities.get(id)?.kind === 'unit');
      if (key === 's') { const ids = sel(); if (ids.length) session.issue({ t: 'stop', ids }); }
      else if (key === 'g') { const ids = sel(); if (ids.length) session.issue({ t: 'guard', ids }); }
      else if (key === 'x') { const ids = sel(); if (ids.length) session.issue({ t: 'scatter', ids }); }
      else if (key === 'd') { const ids = sel(); if (ids.length) session.issue({ t: 'deploy', ids }); }
      else if (key === 'a') { if (sel().length) { mode.current = 'attackMove'; setModeView('attackMove'); } }
      else if (key === 'r') { mode.current = 'repair'; setModeView('repair'); }
      else if (key === 'v') { mode.current = 'sell'; setModeView('sell'); }
      else if (ev.key === 'Escape') { mode.current = 'normal'; setModeView('normal'); placing.current = null; superId.current = 0; renderer.selected = new Set(); }
    };
    const keyup = (ev: KeyboardEvent) => keys.current.delete(ev.key);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);

    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); ticker?.terminate();
      offNotes();
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      session?.dispose(); conn.close(); rig.current = null;
      window.clearInterval(protTimer);
      window.clearInterval(offersTimer);
      window.clearInterval(worldTimer);
    };
  }, [regionId]);

  function toggleNotifyPref(channel: MmoNotifyChannel) {
    if (!prefs) return;
    const enabled = !prefs[channel];
    setPrefs({ ...prefs, [channel]: enabled });
    void api.mmoSetNotifyPref(channel, enabled)
      .then(r => setPrefs(r.prefs)).catch(() => setPrefs(p => p ? { ...p, [channel]: !enabled } : p));
  }

  function openNotes() {
    setShowNotes(v => !v);
    const unread = notes.filter(n => n.readAt === null).map(n => n.notificationId);
    if (unread.length) {
      setNotes(ns => ns.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      void api.mmoMarkNotificationsRead(unread).catch(() => undefined);
    }
  }

  function setMode(m: Mode) {
    mode.current = m; setModeView(m);
    if (m !== 'place') placing.current = null;
    if (m !== 'super') { superId.current = 0; superFrom.current = null; }
  }

  // PW12: the player's choice ends recovery early — ordinary vulnerability
  // returns at the next journal boundary. compoundId is advisory: the region
  // resolves the active recovery episode itself.
  function endRecovery() {
    const r = rig.current; if (!r) return;
    const own = [...r.game.entities.values()].find(e => e.owner === r.session.slot && e.hp > 0);
    const compoundId = own ? mmoEntityId(regionId, own.id) : mmoEntityId(regionId, 0);
    connRef.current?.command({ t: 'endRecovery', compoundId });
    setNotice('Ending recovery…');
    window.setTimeout(() => setNotice(''), 4000);
  }

  // PW27: arm/clear an earned-shield selection on a live compound. The action is
  // journaled; the armed record activates when the offline eval sees the owner
  // leave — nothing is applied optimistically here.
  function armShield(compoundId: string, seconds: number) {
    connRef.current?.command({ t: 'selectShield', compoundId, seconds });
    setNotice(`Shield selection sent (${fmtDur(seconds)}).`);
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoProtection().then(setProt).catch(() => undefined), 1500);
  }
  function disarmShield(compoundId: string) {
    connRef.current?.command({ t: 'clearShield', compoundId });
    setNotice('Shield selection cleared.');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoProtection().then(setProt).catch(() => undefined), 1500);
  }

  // PW13: answer, cancel or accept barter offers. Settlement is journaled and
  // atomic — the UI only sends the intent and refreshes the offer list.
  function barterAction(kind: 'barterAccept' | 'barterDecline' | 'barterCancel', offerId: string) {
    connRef.current?.command({ t: kind, offerId });
    setNotice(kind === 'barterAccept' ? 'Acceptance sent…' : 'Offer update sent.');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoTradeOffers().then(setOffers).catch(() => undefined), 1500);
  }
  const barterItemText = (i: BarterItem) =>
    `${i.kind}${i.ref ? ` ${i.ref.slice(0, 8)}` : ''} ×${i.amount}`;

  // PW19: author a barter offer. Both sides are explicit items; entity refs
  // come from the current single selection. The offer is journaled — nothing
  // is shown as traded until the recipient accepts and the commit lands.
  function sendBarterOffer() {
    const r = rig.current;
    if (!r || !players?.self || !barterTo) { setNotice('Pick a player first'); return; }
    const sel = ui?.selection;
    const selRef = sel && sel.own && sel.count === 1 ? mmoEntityId(regionId, sel.id) : null;
    const needSel = barterGive === 'unit' || barterGive === 'packedBuilding';
    if (needSel && !selRef) { setNotice('Select the unit or packed building to give first'); return; }
    const item = (kind: string, amt: string, ref?: string): BarterItem =>
      kind === 'unit' || kind === 'packedBuilding'
        ? { kind: kind as BarterItem['kind'], ref: ref as BarterItem['ref'], amount: 1 }
        : { kind: kind as BarterItem['kind'], amount: Math.max(1, Math.floor(Number(amt) || 1)) };
    const give: BarterItem[] = [item(barterGive, barterGiveAmt, selRef ?? undefined)];
    const want: BarterItem[] = [item(barterWant, barterWantAmt)];
    connRef.current?.command({
      t: 'barterOffer',
      offer: {
        offerId: crypto.randomUUID(), regionId,
        fromId: players.self, toId: barterTo,
        give, want, createdAtMs: Date.now(), expiresAtMs: Date.now() + 24 * 3600_000,
      },
    });
    setNotice('Offer sent — waiting for the other side.');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoTradeOffers().then(setOffers).catch(() => undefined), 1500);
  }

  // PW19: cross-region transfer of the selected unit — it walks to the map
  // edge, then the durable protocol carries it. Cancel is only possible while
  // the transfer is still PREPARED.
  function sendTransfer(destRegionId: string) {
    const r = rig.current;
    if (!r || !ui?.selection) { setNotice('Select a unit first'); return; }
    const e = r.game.entities.get(ui.selection.id);
    if (!e || e.owner !== r.session.slot || e.kind !== 'unit') { setNotice('Select one of your units'); return; }
    connRef.current?.command({
      t: 'regionTransfer', entityId: mmoEntityId(regionId, e.id), destRegionId,
    });
    setNotice('Transfer ordered — the unit is heading for the edge.');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoTransfers().then(setTransfers).catch(() => undefined), 1500);
  }
  function cancelTransfer(entityId: string) {
    connRef.current?.command({ t: 'regionTransferCancel', entityId });
    setNotice('Cancelling transfer…');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoTransfers().then(setTransfers).catch(() => undefined), 1500);
  }

  // PW19: chat is a journaled world action; the message appears for everyone
  // only when the fan-out envelope comes back on the event stream.
  function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    connRef.current?.command({ t: 'chat', channel: chatChannel, text });
    setChatText('');
  }

  // PW19: objective claims are journaled; the reward lands as earned shield
  // seconds only after the server accepts.
  function claimObjective(objectiveId: string) {
    connRef.current?.command({ t: 'objectiveClaim', objectiveId });
    setNotice('Claim sent…');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoObjectives().then(setObjectives).catch(() => undefined), 1500);
  }

  // PW19: alliance intents — create/invite/join/leave are journaled world
  // actions; permission grants remain leader/officer-only server-side.
  function allianceCommand(action: Parameters<NonNullable<typeof connRef.current>['command']>[0]) {
    connRef.current?.command(action);
    setNotice('Alliance update sent.');
    window.setTimeout(() => setNotice(''), 4000);
    window.setTimeout(() => void api.mmoAlliance().then(setAlliance).catch(() => undefined), 1500);
  }

  // PW14: pack the selected structure into its dedicated carrier, or redeploy a
  // carrier centered on its own cell. Both are journaled world actions; the
  // durable entity id is identical in every form, so barter refs stay stable.
  function packBuilding() {
    const r = rig.current; if (!r || !ui?.selection) return;
    connRef.current?.command({ t: 'pack', entityId: mmoEntityId(regionId, ui.selection.id) });
    setNotice('Packing…');
    window.setTimeout(() => setNotice(''), 4000);
  }
  function unpackBuilding() {
    const r = rig.current; if (!r || !ui?.selection) return;
    const e = r.game.entities.get(ui.selection.id);
    if (!e?.packedType) return;
    const sdef = r.game.pack.structures[e.packedType];
    if (!sdef) return;
    const c = r.game.cellOf(e);
    const cx = c % r.game.map.w, cy = Math.floor(c / r.game.map.w);
    connRef.current?.command({
      t: 'unpack', entityId: mmoEntityId(regionId, e.id),
      x: Math.max(0, cx - (sdef.w >> 1)), y: Math.max(0, cy - (sdef.h >> 1)),
    });
    setNotice('Redeploying…');
    window.setTimeout(() => setNotice(''), 4000);
  }

  // PW11: send the journaled settle intent; the server picks the spawn cell and
  // grants the starter army + one-hour setup protection. x/y are a preference —
  // 0,0 asks the authority for its own valid frontier cell.
  function chooseFaction(factionId: string) {
    connRef.current?.command({ t: 'settle', regionId, faction: factionId, x: 0, y: 0 });
    setNotice('Settling into the persistent world…');
    window.setTimeout(() => setNotice(''), 4000);
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
    r.renderer.hover = r.renderer.pick(p.x, p.y)?.id ?? 0;
  }
  function onMouseUp(ev: React.MouseEvent) {
    if (ev.button !== 0) return;
    const r = rig.current; if (!r) return;
    const pt = pointer.current;
    const p = local(ev);
    pt.down = false;
    if (pt.dragging) {
      pt.dragging = false; r.renderer.dragBox = null;
      const x1 = Math.min(pt.sx, p.x), x2 = Math.max(pt.sx, p.x), y1 = Math.min(pt.sy, p.y), y2 = Math.max(pt.sy, p.y);
      const picked: number[] = [];
      for (const e of r.game.entities.values()) {
        if (e.owner !== r.session.slot || e.kind !== 'unit' || e.hp <= 0) continue;
        const s = r.renderer.toScreen(e.x, e.y);
        if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) picked.push(e.id);
      }
      r.renderer.selected = new Set(ev.shiftKey ? [...r.renderer.selected, ...picked] : picked);
      return;
    }
    click(p.x, p.y, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey });
  }
  function onWheel(ev: React.WheelEvent) {
    const p = local(ev), r = rig.current; if (!r) return;
    const cam = r.renderer.camera;
    const before = { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y };
    cam.zoom = Math.max(0.6, Math.min(2.2, cam.zoom * (ev.deltaY > 0 ? 0.9 : 1.1)));
    cam.x = before.x - p.x / cam.zoom; cam.y = before.y - p.y / cam.zoom;
    r.renderer.clampCamera();
  }
  function onContextMenu(ev: React.MouseEvent) {
    ev.preventDefault();
    const r = rig.current; if (!r) return;
    if (mode.current !== 'normal') setMode('normal');
    else r.renderer.selected = new Set();
  }

  function click(x: number, y: number, mods: { shift: boolean; ctrl: boolean; alt: boolean }) {
    const r = rig.current; if (!r) return;
    const { game, renderer, session } = r;
    const pack = game.pack;
    const cell = renderer.screenToCell(x, y);
    const target = renderer.pick(x, y);
    const me = game.players[session.slot];
    const mark = (color: string) => renderer.markers.push({ cx: cell.x, cy: cell.y, color, until: performance.now() + 450 });
    if (!me) return;
    if (mode.current === 'place' && placing.current) {
      const item = placing.current, def = pack.structures[item];
      const px = cell.x - ((def.w - 1) >> 1), py = cell.y - ((def.h - 1) >> 1);
      if (game.canPlace(me, item, px, py)) { session.issue({ t: 'place', item, x: px, y: py }); setMode('normal'); }
      else setNotice('Cannot deploy here');
      return;
    }
    if (mode.current === 'super' && superId.current) {
      const s = game.entities.get(superId.current);
      const sw = s ? game.superweaponOf(s) : undefined;
      const cx = Math.max(0, cell.x), cy = Math.max(0, cell.y);
      if (sw?.kind === 'chrono' && !superFrom.current) { superFrom.current = { x: cx, y: cy }; mark('#8fd4ff'); return; }
      if (sw?.kind === 'chrono' && superFrom.current) session.issue({ t: 'super', id: superId.current, x: superFrom.current.x, y: superFrom.current.y, x2: cx, y2: cy });
      else session.issue({ t: 'super', id: superId.current, x: cx, y: cy });
      mark('#ff5a4a'); superId.current = 0; superFrom.current = null; setMode('normal');
      return;
    }
    if (mode.current === 'repair') {
      if (target && target.owner === session.slot && target.kind === 'structure') session.issue({ t: 'repair', id: target.id });
      return;
    }
    if (mode.current === 'sell') {
      // PW19: sell-for-credit is a journaled world action — the server
      // validates bound assets and credits the refund; nothing is optimistic.
      if (target && target.owner === session.slot && target.kind === 'structure' && target.hp > 0) {
        connRef.current?.command({ t: 'sell', entityId: mmoEntityId(regionId, target.id) });
        mark('#ffd24a');
      }
      return;
    }
    const units = [...renderer.selected].map(id => game.entities.get(id)).filter((e): e is Entity => !!e && e.owner === session.slot && e.kind === 'unit');
    if (mode.current === 'attackMove' && units.length) {
      session.issue({ t: 'attackMove', ids: units.map(u => u.id), x: cell.x, y: cell.y }); mark('#ff5a4a'); setMode('normal'); return;
    }
    const onField = cell.x >= 0 && cell.y >= 0 && cell.x < game.map.w && cell.y < game.map.h && game.map.res[cell.y * game.map.w + cell.x] > 0;
    if (mods.ctrl && onField) {
      const diggers = units.filter(u => pack.units[u.type].harvester);
      if (diggers.length) { session.issue({ t: 'harvest', ids: diggers.map(u => u.id), x: cell.x, y: cell.y, lock: true }); mark('#f2c14e'); return; }
    }
    if (mods.ctrl && units.length) {
      if (target && !(target.kind === 'unit' && renderer.selected.has(target.id))) session.issue({ t: 'attack', ids: units.map(u => u.id), target: target.id, force: true });
      else session.issue({ t: 'fireAt', ids: units.map(u => u.id), x: Math.max(0, cell.x), y: Math.max(0, cell.y) });
      mark('#ff5a4a'); return;
    }
    if (mods.alt && units.length) {
      session.issue({ t: 'move', ids: units.map(u => u.id), x: Math.max(0, cell.x), y: Math.max(0, cell.y) });
      mark('#7dff7a'); return;
    }
    if (target && target.kind === 'structure' && units.length) {
      const sdef = pack.structures[target.type];
      const enemy = game.isEnemy(session.slot, target.owner);
      const enter = units.filter(u => {
        const d = pack.units[u.type];
        if (d.engineer) return enemy || target.owner === session.slot && target.hp < target.maxHp;
        if (d.spy) return enemy;
        if (d.harvester && sdef.refinery && target.owner === session.slot) return true;
        return target.owner === session.slot && (sdef.repairPad && d.kind !== 'infantry' && d.kind !== 'aircraft' || sdef.airfield && d.kind === 'aircraft');
      });
      if (enter.length) {
        session.issue({ t: 'enter', ids: enter.map(u => u.id), target: target.id });
        const rest = units.filter(u => !enter.includes(u));
        if (rest.length && enemy) session.issue({ t: 'attack', ids: rest.map(u => u.id), target: target.id });
        mark(enemy ? '#ffd24a' : '#7dff7a'); return;
      }
    }
    if (target && target.kind === 'unit' && target.owner === session.slot && !renderer.selected.has(target.id) && pack.units[target.type].transport) {
      const boarders = units.filter(u => game.canBoard(u, target));
      if (boarders.length) { session.issue({ t: 'enter', ids: boarders.map(u => u.id), target: target.id }); mark('#7dff7a'); return; }
    }
    if (target && target.owner === session.slot) {
      if (target.kind === 'unit' && renderer.selected.has(target.id) && renderer.selected.size === 1 && pack.units[target.type].deploysTo) {
        session.issue({ t: 'deploy', ids: [target.id] }); return;
      }
      if (mods.shift && target.kind === 'unit') { if (renderer.selected.has(target.id)) renderer.selected.delete(target.id); else renderer.selected.add(target.id); }
      else renderer.selected = new Set([target.id]);
      return;
    }
    if (!units.length) { renderer.selected = target ? new Set([target.id]) : new Set(); return; }
    if (target && game.isEnemy(session.slot, target.owner)) {
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

  return <div className="fusion-battle">
    <div ref={stage} className="battle-stage">
      <canvas ref={canvas} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onDoubleClick={ev => {
          const p = local(ev), r = rig.current; if (!r || mode.current !== 'normal') return;
          const t = r.renderer.pick(p.x, p.y);
          if (t?.kind === 'unit' && t.owner === r.session.slot) {
            const same = [...r.game.entities.values()].filter(e => e.owner === r.session.slot && e.kind === 'unit' && e.type === t.type && e.hp > 0);
            r.renderer.selected = new Set(same.map(e => e.id));
          }
        }}
        onContextMenu={onContextMenu} onWheel={onWheel} />
      <canvas ref={minimap} className="minimap" width={180} height={180} />
      {notice && <div className="notice">{notice}</div>}
      {!ui && <div className="notice">Entering the persistent world…</div>}
      {away && <div className="settle-overlay">
        <div className="settle-card away-card">
          <h2>Away report</h2>
          <p className="away-since">While you were offline since {new Date(away.since ?? '').toLocaleString()}:</p>
          <div className="away-list">
            {away.entries.map((e, i) => (
              <div key={i} className="away-entry">
                <time>{new Date(e.at).toLocaleString()}</time>
                <span>{e.summary}</span>
              </div>
            ))}
          </div>
          <button className="settle-faction" onClick={() => setAway(null)}>Dismiss</button>
        </div>
      </div>}
      {needSettle && ui && (
        <div className="settle-overlay">
          <div className="settle-card">
            <h2>Found your settlement</h2>
            <p>Choose your faction. You will receive a starter army and one hour of setup protection.</p>
            <div className="settle-factions">
              {rig.current?.game.pack.factions.map(f => (
                <button key={f.id} className="settle-faction" style={{ borderColor: f.color }}
                  onClick={() => chooseFaction(f.id)}>
                  <strong>{f.name}</strong><span>{f.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    <aside className="sidebar">
      <div className="res-bar">
        {ui && <>
          <span className="res credits">⬡ {ui.credits}</span>
          <span className="res">⚡ {ui.powerGen}/{ui.powerUse}</span>
          <span className="res store">▣ {ui.storage}</span>
          <span className="res tick">t{ui.tick}</span>
        </>}
        <span className={`conn ${ui?.connected ? 'ok' : 'bad'}`}>{ui?.connected ? 'LIVE' : 'OFFLINE'}</span>
        {ui?.recovering && <span className="res recovering">RECOVERY</span>}
        <button className="notify-bell" onClick={openNotes} title="Notifications">
          {'\u{1F514}'}{notes.some(n => n.readAt === null) ? ' •' : ''}
        </button>
        <button className="notify-bell" onClick={() => setShowShield(v => !v)} title="Compound shield">
          {'\u{1F6E1}'}
        </button>
        <button className="notify-bell" onClick={() => setShowTrade(v => !v)} title="Trade offers">
          {'\u{1F91D}'}{offers && offers.incoming.length ? ' •' : ''}
        </button>
        <button className="notify-bell" onClick={() => setShowPlayers(v => !v)} title="Players & barter">
          {'\u{1F465}'}
        </button>
        <button className="notify-bell" onClick={() => setShowAlliance(v => !v)} title="Alliance">
          {'\u2691'}{alliance?.invites.length ? ' •' : ''}
        </button>
        <button className="notify-bell" onClick={() => setShowTransfer(v => !v)} title="Region transfer">
          {'\u27A1'}{transfers && transfers.transfers.length ? ' •' : ''}
        </button>
      </div>
      {showShield && <div className="notes-panel">
        <div className="notes-head"><b>Compound shield</b>
          <span className="notes-prefs">{prot
            ? `${fmtDur(prot.nightlySeconds)} free · ${fmtDur(prot.earnedSeconds)} earned`
            : '…'}</span>
        </div>
        {!prot && <div className="notes-empty">Loading…</div>}
        {prot && prot.compounds.filter(c => c.regionId === regionId).map(c => {
          const rec = c.record;
          const activeLeft = rec?.status === 'active' && rec.endsAt
            ? Math.max(0, Math.round((Date.parse(rec.endsAt) - Date.now()) / 1000)) : rec?.remainingSeconds ?? null;
          return <div key={c.compoundId} className="note">
            <span>
              {rec?.kind === 'NEWCOMER' ? 'Newcomer setup — ' : rec?.kind === 'RECOVERY' ? 'Recovery — ' : ''}
              {rec?.status === 'active' ? `Shielded — ${fmtDur(activeLeft)} left`
                : rec?.status === 'armed' ? `Armed ${fmtDur(rec.armedSeconds)} — starts when you go offline`
                : 'No shield'}
            </span>
            <span className="notes-prefs">
              {SHIELD_PRESETS.map(s => (
                <button key={s} disabled={!prot || s > prot.availableSeconds}
                  onClick={() => armShield(c.compoundId, s)}>{fmtDur(s)}</button>
              ))}
              <input className="shield-custom" type="number" min={60} step={60}
                placeholder="sec" value={shieldCustom}
                onChange={ev => setShieldCustom(ev.target.value)} />
              <button disabled={!prot || !shieldCustom || Number(shieldCustom) <= 0 || Number(shieldCustom) > prot.availableSeconds}
                onClick={() => { const s = Math.floor(Number(shieldCustom)); if (s > 0) armShield(c.compoundId, s); }}>Set</button>
              {rec?.status === 'armed' && <button onClick={() => disarmShield(c.compoundId)}>Clear</button>}
            </span>
          </div>;
        })}
        {prot && prot.compounds.filter(c => c.regionId === regionId).length === 0 &&
          <div className="notes-empty">No standing construction yard — build one first.</div>}
      </div>}
      {showTrade && <div className="notes-panel">
        <div className="notes-head"><b>Trade offers</b>
          <span className="notes-prefs">{offers ? `${offers.incoming.length} in · ${offers.outgoing.length} out` : '…'}</span>
        </div>
        {!offers && <div className="notes-empty">Loading…</div>}
        {offers && offers.incoming.length === 0 && offers.outgoing.length === 0 &&
          <div className="notes-empty">No open offers.</div>}
        {offers?.incoming.map(o => (
          <div key={o.offer_id} className="note">
            <span>
              <b>From {o.from_player_id.slice(0, 8)}</b> gives {o.payload.give.map(barterItemText).join(', ') || 'nothing'}
              {' → '}wants {o.payload.want.map(barterItemText).join(', ') || 'nothing'}
            </span>
            <span className="notes-prefs">
              <button onClick={() => barterAction('barterAccept', o.offer_id)}>Accept</button>
              <button onClick={() => barterAction('barterDecline', o.offer_id)}>Decline</button>
            </span>
          </div>
        ))}
        {offers?.outgoing.map(o => (
          <div key={o.offer_id} className="note">
            <span>
              <b>To {o.to_player_id.slice(0, 8)}</b> — you give {o.payload.give.map(barterItemText).join(', ') || 'nothing'}
              {' → '}want {o.payload.want.map(barterItemText).join(', ') || 'nothing'}
            </span>
            <span className="notes-prefs">
              <button onClick={() => barterAction('barterCancel', o.offer_id)}>Cancel</button>
            </span>
          </div>
        ))}
        <div className="notes-head"><b>New offer</b></div>
        <div className="note">
          <span>
            To{' '}
            <select value={barterTo} onChange={ev => setBarterTo(ev.target.value)}>
              <option value="">— pick player —</option>
              {players?.players.filter(p => p.player_id !== players.self).map(p => (
                <option key={p.player_id} value={p.player_id}>{p.display_name}</option>
              ))}
            </select>
          </span>
        </div>
        <div className="note">
          <span>
            Give{' '}
            <select value={barterGive} onChange={ev => setBarterGive(ev.target.value)}>
              <option value="credits">credits</option>
              <option value="shieldSeconds">shield seconds</option>
              <option value="unit">selected unit</option>
              <option value="packedBuilding">selected packed building</option>
            </select>
            {(barterGive === 'credits' || barterGive === 'shieldSeconds') &&
              <input className="shield-custom" type="number" min={1} value={barterGiveAmt}
                onChange={ev => setBarterGiveAmt(ev.target.value)} />}
          </span>
          <span className="notes-prefs">want</span>
          <span>
            <select value={barterWant} onChange={ev => setBarterWant(ev.target.value)}>
              <option value="credits">credits</option>
              <option value="shieldSeconds">shield seconds</option>
            </select>
            <input className="shield-custom" type="number" min={1} value={barterWantAmt}
              onChange={ev => setBarterWantAmt(ev.target.value)} />
            <button onClick={sendBarterOffer}>Send</button>
          </span>
        </div>
        {(barterGive === 'unit' || barterGive === 'packedBuilding') &&
          <div className="notes-empty">
            {ui?.selection && ui.selection.own && ui.selection.count === 1
              ? `Giving: ${ui.selection.name}` : 'Select one of your units or a packed carrier first.'}
          </div>}
      </div>}
      {showPlayers && <div className="notes-panel">
        <div className="notes-head"><b>Players</b>
          <span className="notes-prefs">{players ? `${players.players.length} in world` : '…'}</span>
        </div>
        {!players && <div className="notes-empty">Loading…</div>}
        {players?.players.filter(p => p.player_id !== players.self).map(p => (
          <div key={p.player_id} className="note">
            <span>
              <b>{p.display_name}</b>
              {p.region_id === regionId ? ' · in this region' : p.region_id ? ' · another region' : ' · not settled'}
            </span>
            <span className="notes-prefs">
              {p.region_id === regionId &&
                <button onClick={() => { setBarterTo(p.player_id); setShowTrade(true); }}>Trade</button>}
            </span>
          </div>
        ))}
        {players && players.players.length <= 1 &&
          <div className="notes-empty">No other players in this world yet.</div>}
        <div className="notes-head"><b>Objectives</b>
          <span className="notes-prefs">{objectives ? `${objectives.objectives.filter(o => o.status === 'active').length} active` : '…'}</span>
        </div>
        {!objectives && <div className="notes-empty">Loading…</div>}
        {objectives?.objectives.filter(o => o.status !== 'expired').map(o => (
          <div key={o.objectiveId} className="note">
            <span>
              <b>{o.period === 'weekly' ? 'Weekly' : 'Daily'}</b> — {o.title}
              {' '}({o.progress}/{o.target}) → {fmtDur(o.rewardSeconds)} earned shield
              {o.status === 'claimed' ? ' · claimed' : ''}
            </span>
            <span className="notes-prefs">
              {o.status === 'active' && o.progress >= o.target &&
                <button onClick={() => claimObjective(o.objectiveId)}>Claim</button>}
            </span>
          </div>
        ))}
        {objectives && objectives.objectives.every(o => o.status === 'expired') &&
          <div className="notes-empty">No objectives yet.</div>}
        <div className="notes-head"><b>Ladder · 30d</b></div>
        {!ladder && <div className="notes-empty">Loading…</div>}
        {ladder?.rows.slice(0, 10).map((r, i) => (
          <div key={r.subject_id} className="note">
            <span>{i + 1}. {players?.players.find(p => p.player_id === r.subject_id)?.display_name
              ?? r.subject_id.slice(0, 8)}</span>
            <span className="notes-prefs">{Number(r.points).toLocaleString()} pts</span>
          </div>
        ))}
        {ladder && ladder.rows.length === 0 &&
          <div className="notes-empty">No scored play yet.</div>}
      </div>}
      {showAlliance && <div className="notes-panel">
        <div className="notes-head"><b>Alliance</b>
          <span className="notes-prefs">{alliance?.alliance ? alliance.alliance.name : ''}</span>
        </div>
        {!alliance && <div className="notes-empty">Loading…</div>}
        {alliance?.invites.map(i => (
          <div key={i.alliance_id} className="note">
            <span>Invite to <b>{i.name}</b></span>
            <span className="notes-prefs">
              <button onClick={() => allianceCommand({ t: 'allianceJoin', allianceId: i.alliance_id })}>Join</button>
            </span>
          </div>
        ))}
        {alliance && !alliance.alliance && alliance.invites.length === 0 &&
          <div className="notes-empty">You are not in an alliance.</div>}
        {alliance && !alliance.alliance && (
          <div className="note">
            <span>
              Found <input value={allyName} maxLength={32} placeholder="Alliance name"
                onChange={ev => setAllyName(ev.target.value)} />
              <button disabled={allyName.trim().length < 2}
                onClick={() => allianceCommand({ t: 'allianceCreate', name: allyName.trim() })}>Create</button>
            </span>
          </div>
        )}
        {alliance?.alliance && (
          <>
            {alliance.members.map(m => (
              <div key={m.playerId} className="note">
                <span>
                  {players?.players.find(p => p.player_id === m.playerId)?.display_name ?? m.playerId.slice(0, 8)}
                  {' · '}{m.role}
                </span>
                {alliance.alliance!.role !== 'member' && m.role !== 'leader' && m.playerId !== players?.self &&
                  <span className="notes-prefs">
                    <button onClick={() => allianceCommand({ t: 'allianceKick', playerId: m.playerId })}>Kick</button>
                  </span>}
              </div>
            ))}
            {alliance.alliance!.role !== 'member' && (
              <div className="note">
                <span>
                  Invite{' '}
                  <select defaultValue="" onChange={ev => {
                    if (ev.target.value) allianceCommand({ t: 'allianceInvite', allianceId: alliance.alliance!.allianceId, playerId: ev.target.value });
                  }}>
                    <option value="">— pick player —</option>
                    {players?.players.filter(p => p.player_id !== players.self && !alliance.members.some(m => m.playerId === p.player_id)).map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.display_name}</option>
                    ))}
                  </select>
                </span>
              </div>
            )}
            <div className="note">
              <span className="notes-prefs">
                <button onClick={() => allianceCommand({ t: 'allianceLeave' })}>Leave alliance</button>
                {alliance.alliance!.role === 'leader' &&
                  <button onClick={() => allianceCommand({ t: 'allianceDisband' })}>Disband</button>}
              </span>
            </div>
          </>
        )}
      </div>}
      {showTransfer && <div className="notes-panel">
        <div className="notes-head"><b>Region transfer</b>
          <span className="notes-prefs">{transfers ? `${transfers.transfers.length} in transit` : '…'}</span>
        </div>
        {!transfers && <div className="notes-empty">Loading…</div>}
        {transfers?.transfers.map(t => (
          <div key={t.transferId} className="note">
            <span>
              Unit → {regions?.regions.find(r => r.region_id === t.destRegionId)?.label
                || t.destRegionId.slice(0, 8)} — {t.state.replace(/_/g, ' ').toLowerCase()}
            </span>
            <span className="notes-prefs">
              {t.state === 'PREPARED' &&
                <button onClick={() => cancelTransfer(t.entityId)}>Cancel</button>}
            </span>
          </div>
        ))}
        {transfers && transfers.transfers.length === 0 &&
          <div className="notes-empty">Nothing in transit — select a unit, then send it below.</div>}
        <div className="notes-head"><b>Destinations</b></div>
        {regions?.regions.filter(r => r.region_id !== regionId && r.lifecycle === 'active').map(r => (
          <div key={r.region_id} className="note">
            <span>{r.label || `Region ${r.region_id.slice(0, 8)}`} — {r.players} settled</span>
            <span className="notes-prefs">
              <button onClick={() => sendTransfer(r.region_id)}>Send selected unit</button>
            </span>
          </div>
        ))}
        {regions && regions.regions.filter(r => r.region_id !== regionId && r.lifecycle === 'active').length === 0 &&
          <div className="notes-empty">No other active regions in this world.</div>}
      </div>}
      {showNotes && <div className="notes-panel">
        <div className="notes-head">
          <b>Notifications</b>
          <span className="notes-prefs">
            {(['inapp', 'email', 'push'] as MmoNotifyChannel[]).map(ch => (
              <label key={ch}>
                <input type="checkbox" checked={prefs?.[ch] === true}
                  onChange={() => toggleNotifyPref(ch)} />{ch}
              </label>
            ))}
          </span>
        </div>
        {notes.length === 0 && <div className="notes-empty">Nothing yet.</div>}
        {notes.map(n => (
          <div key={n.notificationId} className={`note ${n.readAt ? '' : 'unread'}`}>
            <span>{NOTE_TEXT[n.kind] ?? n.kind}</span>
            <time>{new Date(n.createdAt).toLocaleString()}</time>
          </div>
        ))}
      </div>}
      <div className="tabs">
        {ALL_TABS.map(t => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <div className="build-list">
        {ui && (ui.options[tab] ?? []).map(item => {
          const cost = ui.costs[item] ?? 0;
          const afford = !cost || ui.credits >= cost;
          return <button key={item} disabled={!afford}
            className={placing.current === item ? 'on' : ''}
            onClick={() => { placing.current = item; setMode('place'); }}>
            <Icon game={rig.current?.game} item={item} color="#7dff7a" accent="#0a2a12" />
            {item.replace(/^(upgrade|starport):/, '')}
          </button>;
        })}
      </div>
      {ui?.selection && <div className="selection">
        <b>{ui.selection.name}</b>
        <span>{Math.max(0, Math.round(ui.selection.hp))}/{ui.selection.max} · ×{ui.selection.count}</span>
        <div className="hp"><i style={{ width: `${ui.selection.max ? (ui.selection.hp / ui.selection.max) * 100 : 0}%` }} /></div>
        {ui.selection.own && ui.selection.count === 1 && (ui.selection.packable || ui.selection.packed) && <div className="sel-actions">
          {ui.selection.packable && <button onClick={packBuilding}>Pack</button>}
          {ui.selection.packed && <button onClick={unpackBuilding}>Redeploy here</button>}
        </div>}
      </div>}
      {ui?.recovering && <div className="recovery-banner">
        <span>Rebuilding protected — yard, power, refinery and barracks only. Your MCV redeploys at the compound; other assets must be rebuilt or recovered.</span>
        <button onClick={endRecovery}>End recovery</button>
      </div>}
      {ui?.supers.length ? <div className="supers">
        {ui.supers.map(s => <div key={s.id} className={`super ${s.ready ? 'ready' : ''}`}>
          <span>{s.name}</span><i style={{ width: `${s.frac * 100}%` }} />
          {s.ready && <button onClick={() => { const r = rig.current; if (r) { superId.current = s.id; setMode('super'); } }}>Fire</button>}
        </div>)}
      </div> : null}
      {ui?.status && <div className="status-line">{ui.status}</div>}
      <div className="chat-box">
        <div className="chat-log">
          {chat.map((c, i) => (
            <div key={i} className={`chat-line ${c.channel}`}>
              <b>[{c.channel === 'alliance' ? 'A' : '#'}] {c.fromName}:</b> {c.text}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <select value={chatChannel} onChange={ev => setChatChannel(ev.target.value as 'region' | 'alliance')}>
            <option value="region">Region</option>
            <option value="alliance">Alliance</option>
          </select>
          <input value={chatText} maxLength={500} placeholder="Message…"
            onChange={ev => setChatText(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') sendChat(); }} />
          <button onClick={sendChat}>Send</button>
        </div>
      </div>
      <div className="modes">
        <button className={modeView === 'attackMove' ? 'on' : ''} onClick={() => setMode('attackMove')}>Attack-move (A)</button>
        <button className={modeView === 'repair' ? 'on' : ''} onClick={() => setMode('repair')}>Repair (R)</button>
        <button className={modeView === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>Sell (V)</button>
      </div>
      {modeView === 'sell' &&
        <div className="status-line">Sell mode — click your buildings for credits. Selling your last building starts protected recovery: your MCV redeploys at the compound.</div>}
      <button className="leave" onClick={onExit}>Leave region</button>
    </aside>
  </div>;
}

/** Sidebar cameo, drawn procedurally once per item (same helper the classic view uses). */
function Icon({ game, item, color, accent }: { game?: Game; item: string; color: string; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (game && ref.current) drawIcon(ref.current, game, item, color, accent); }, [game, item]);
  return <canvas ref={ref} width={64} height={48} className="cameo" />;
}
