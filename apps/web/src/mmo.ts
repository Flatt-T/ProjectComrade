// Persistent-world client transport (PW08): a dedicated /mmo socket carrying the
// versioned MMO protocol. The browser restores the authoritative Fusion snapshot and
// then runs the same deterministic sim; the server streams resolved sim commands in
// journal order and authoritative checksums for verification. Own orders are sent as
// durable-id intents and applied only when they come back on the sim stream — the
// client never predicts.
import {
  Game, restoreGame, registryPacks, TICKS_PER_SECOND,
  type Command, type Session, type SessionStatus,
} from '../../../packages/fusion/src/index';
import {
  MMO_PROTOCOL, mmoEntityId, type MmoAction, type MmoServerMessage,
} from '@comrade/contracts';

export interface SnapshotState {
  v: 1; seed: number; snapshot: string; bindings: [string, number][]; tick: number;
}

export interface MmoHandlers {
  onWelcome?(info: { playerId: string; sessionId: string; slot: number | null; regionId: string }): void;
  onSnapshot?(header: Extract<MmoServerMessage, { type: 'snapshot' }>): void;
  onSim?(atTick: number, slot: number, command: Command, key: string): void;
  onResult?(commandId: string, status: string, result: unknown): void;
  onObservation?(tick: number, checksum: number, epoch: string): void;
  onError?(code: string, message: string): void;
  onStatus?(connected: boolean): void;
}

export class MmoConnection {
  private ws?: WebSocket;
  connected = false;
  playerId = '';
  private listeners = new Set<(m: MmoServerMessage) => void>();
  private handlers: MmoHandlers;
  private regionId = '';
  private epoch = '0';
  private lastAppliedSeq = '0';
  private slot: number | null = null;
  private closed = false;
  private readonly url: string;

  constructor(handlers: MmoHandlers, url?: string) {
    this.handlers = handlers;
    this.url = url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mmo`;
    this.open();
  }

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.handlers.onStatus?.(true); this.resubscribe(); };
    ws.onclose = () => {
      this.connected = false;
      this.handlers.onStatus?.(false);
      if (!this.closed) setTimeout(() => this.open(), 2000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = event => {
      let message: MmoServerMessage;
      try { message = JSON.parse(event.data) as MmoServerMessage; } catch { return; }
      if (message.type === 'welcome') {
        this.playerId = message.playerId;
        const idx = message.regions.indexOf(this.regionId);
        this.slot = idx >= 0 ? message.slots?.[idx] ?? null : null;
        this.handlers.onWelcome?.({ playerId: message.playerId, sessionId: message.sessionId, slot: this.slot, regionId: this.regionId });
      }
      if (message.type === 'snapshot') {
        this.epoch = message.epoch;
        this.lastAppliedSeq = message.lastAppliedSeq;
        this.handlers.onSnapshot?.(message);
      }
      if (message.type === 'event' && message.eventKind === 'sim') {
        const p = message.payload as { atTick?: number; slot?: number; command?: Command };
        if (p.command && p.slot !== undefined) {
          // Dedupe identity: journal position plus the effect's own content so
          // same-sequence multi-effects each apply exactly once.
          const key = `${message.regionId}:${message.eventSeq}:${p.atTick}:${p.slot}:${JSON.stringify(p.command)}`;
          this.handlers.onSim?.(Number(p.atTick ?? message.tick), p.slot, p.command, key);
        }
      }
      if (message.type === 'commandResult') {
        this.handlers.onResult?.(message.commandId, message.status, message.result);
      }
      if (message.type === 'observation') {
        this.handlers.onObservation?.(Number(message.tick), message.checksum, message.epoch);
      }
      if (message.type === 'error') this.handlers.onError?.(message.code, message.message);
      for (const l of this.listeners) l(message);
    };
  }

  on(listener: (m: MmoServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ protocol: MMO_PROTOCOL, ...payload }));
  }

  /** (Re)subscribe to a region; seenEpoch '0' always yields a fresh snapshot. */
  subscribe(regionId: string, fresh = false) {
    this.regionId = regionId;
    this.send({
      type: 'subscribe', regionId,
      seenEpoch: fresh ? '0' : this.epoch,
      lastSeenEventSeq: this.lastAppliedSeq,
    });
  }

  private resubscribe() { if (this.regionId) this.subscribe(this.regionId); }

  /** Ask for a fresh snapshot (gap recovery / checksum mismatch). */
  resync() { if (this.regionId) this.subscribe(this.regionId, true); }

  command(action: MmoAction) {
    if (!this.regionId) return;
    this.send({
      type: 'command', commandId: crypto.randomUUID(), regionId: this.regionId,
      seenEpoch: this.epoch, lastSeenEventSeq: this.lastAppliedSeq, action,
    });
  }

  get region() { return this.regionId; }
  get mySlot() { return this.slot; }

  close() { this.closed = true; this.ws?.close(); }
}

// ---------------------------------------------------------------------------
// PersistentSession: the client-side half of the authoritative-region contract.
// ---------------------------------------------------------------------------

const STEP_MS = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = TICKS_PER_SECOND * 2;

/** Translate a Fusion command into its durable-id MMO intent for the wire. */
export function commandToMmo(regionId: string, cmd: Command): MmoAction | null {
  const ids = (list: number[]) => list.map(id => mmoEntityId(regionId, id));
  const one = (id: number) => mmoEntityId(regionId, id);
  switch (cmd.t) {
    case 'move': case 'attackMove': case 'fireAt':
      return { t: cmd.t, entityIds: ids(cmd.ids), x: cmd.x, y: cmd.y };
    case 'attack':
      return { t: 'attack', entityIds: ids(cmd.ids), targetId: one(cmd.target), force: cmd.force };
    case 'guard': case 'scatter': case 'stop': case 'deploy':
      return { t: cmd.t, entityIds: ids(cmd.ids) };
    case 'harvest':
      return { t: 'harvest', entityIds: ids(cmd.ids), x: cmd.x, y: cmd.y, lock: cmd.lock };
    case 'enter':
      return { t: 'enter', entityIds: ids(cmd.ids), targetId: one(cmd.target) };
    case 'build': case 'cancel':
      return { t: cmd.t, item: cmd.item };
    case 'place':
      return { t: 'place', item: cmd.item, x: cmd.x, y: cmd.y };
    case 'repair':
      return { t: 'repair', entityId: one(cmd.id) };
    case 'sell':
      // PW12: sale for credit is a journaled world action (SELL_REFUND), not a
      // bare sim command — the durable side audits it and may trigger recovery.
      return { t: 'sell', entityId: one(cmd.id) };
    case 'rally':
      return { t: 'rally', x: cmd.x, y: cmd.y };
    case 'super': {
      const base = { t: 'super' as const, entityId: one(cmd.id), x: cmd.x, y: cmd.y };
      return cmd.x2 !== undefined && cmd.y2 !== undefined ? { ...base, x2: cmd.x2, y2: cmd.y2 } : base;
    }
    default:
      return null; // join/leave/transfer/sell are world-side intents, not sim commands
  }
}

export class PersistentSession implements Session {
  private acc = 0;
  private readonly conn: MmoConnection;
  private readonly regionId: string;
  private unsub?: () => void;
  /** Live sim slot — starts null-ish for newcomers and is set when their journaled join lands (PW11). */
  slot: number;

  // PW31 (THU-2442): tick-ordered presentation buffer. The client sim trails
  // the authoritative tick by RENDER_DELAY_TICKS so every journaled effect still
  // arrives while its execution tick is applicable; commands apply at their
  // original atTick in journal order, deduplicated by effect identity. Checksums
  // are recorded per tick so delayed observations still compare.
  private pendingFx: { atTick: number; order: number; slot: number; cmd: Command; key: string }[] = [];
  private fxOrder = 0;
  private seenFx = new Set<string>();
  private checksumHist = new Map<number, number>();
  private serverTickBase = 0;
  private serverTickAt = 0;
  private haveServerTick = false;
  private epoch = '';
  private pendingObs: { tick: number; sum: number }[] = [];
  private resyncCooldownUntil = 0;
  /** Set by the host to request one authoritative resnapshot (debounced here). */
  onNeedResync?: () => void;

  constructor(
    readonly game: Game, slot: number,
    conn: MmoConnection, regionId: string,
  ) {
    this.slot = slot;
    this.conn = conn;
    this.regionId = regionId;
    this.unsub = conn.on(() => undefined); // keep the socket's listener set warm
  }

  setSlot(slot: number) { this.slot = slot; }

  /** Player orders leave as durable intents; the sim stream applies them back. */
  issue(cmd: Command) {
    const action = commandToMmo(this.regionId, cmd);
    if (action) this.conn.command(action);
  }

  /**
   * The server resolved and journaled this command at `atTick`. Buffer it in
   * tick order; it is enqueued for its original tick during update(). An
   * effect whose tick has already passed cannot be applied faithfully — the
   * only correct recovery is an authoritative resnapshot.
   */
  applyRemote(atTick: number, fromSlot: number, cmd: Command, key = '') {
    if (key) {
      if (this.seenFx.has(key)) return;
      this.seenFx.add(key);
      if (this.seenFx.size > 16384) this.seenFx.clear();
    }
    if (atTick <= this.game.tick) { this.needResync(); return; }
    const fx = { atTick, order: this.fxOrder++, slot: fromSlot, cmd, key };
    // Insert sorted by (atTick, arrival order) — journal order within a tick.
    let lo = 0, hi = this.pendingFx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.pendingFx[mid];
      if (m.atTick < atTick || (m.atTick === atTick && m.order < fx.order)) lo = mid + 1; else hi = mid;
    }
    this.pendingFx.splice(lo, 0, fx);
    if (this.pendingFx.length > 4096) this.needResync();
  }

  /** Authoritative tick anchor: snapshot restore or a fresh observation. */
  noteServerTick(tick: number, atMs: number, epoch?: string) {
    if (epoch !== undefined && this.epoch && epoch !== this.epoch) {
      this.resetTracking();
    }
    if (epoch) this.epoch = epoch;
    this.serverTickBase = tick;
    this.serverTickAt = atMs;
    this.haveServerTick = true;
  }

  /** A fresh snapshot replaced the whole sim — drop every buffer and history. */
  resetTracking() {
    this.pendingFx = [];
    this.seenFx.clear();
    this.checksumHist.clear();
    this.pendingObs = [];
    this.haveServerTick = false;
    this.resyncCooldownUntil = 0;
  }

  /** Estimated authoritative tick right now (observations arrive ~2 s apart). */
  private serverTickEstimate(nowMs: number): number {
    if (!this.haveServerTick) return this.game.tick;
    return this.serverTickBase + Math.floor((nowMs - this.serverTickAt) * TICKS_PER_SECOND / 1000);
  }

  /**
   * Compare an authoritative observation against the checksum recorded for the
   * same tick. Future ticks are held until the local sim reaches them; past
   * ticks compare against per-tick history so a delayed checksum can no longer
   * slip through uncompared.
   */
  observeChecksum(tick: number, sum: number, epoch: string, nowMs: number) {
    if (epoch && this.epoch && epoch !== this.epoch) { this.needResync(); return; }
    if (epoch) this.epoch = epoch;
    this.noteServerTick(tick, nowMs, epoch || undefined);
    if (tick > this.game.tick) {
      this.pendingObs.push({ tick, sum });
      if (this.pendingObs.length > 64) this.pendingObs.shift();
      return;
    }
    const local = tick === this.game.tick ? this.game.checksum() : this.checksumHist.get(tick);
    if (local !== undefined && local !== sum) this.needResync();
  }

  private needResync() {
    const now = performance.now();
    if (now < this.resyncCooldownUntil) return;
    this.resyncCooldownUntil = now + 5000;
    this.onNeedResync?.();
  }

  update(dtMs: number): number {
    this.acc += dtMs;
    const now = performance.now();
    // Trail the authoritative tick by a fixed render delay so journaled effects
    // still land on their original tick. Before the first observation the sim
    // free-runs from the snapshot tick (same wall rate as the server).
    const horizon = this.haveServerTick
      ? this.serverTickEstimate(now) - RENDER_DELAY_TICKS
      : Number.MAX_SAFE_INTEGER;
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS_PER_FRAME && this.game.tick < horizon) {
      const next = this.game.tick + 1;
      // Release every effect scheduled for the tick we are about to enter, in
      // journal order. Anything older is unrecoverable locally.
      while (this.pendingFx.length && this.pendingFx[0].atTick <= next) {
        const fx = this.pendingFx.shift()!;
        if (fx.atTick < next) { this.needResync(); continue; }
        this.game.enqueue(fx.slot, fx.cmd, fx.atTick);
      }
      this.game.step();
      this.checksumHist.set(this.game.tick, this.game.checksum());
      if (this.checksumHist.size > 8192) {
        const oldest = this.checksumHist.keys().next().value;
        if (oldest !== undefined) this.checksumHist.delete(oldest);
      }
      // Compare any held observations this tick just reached.
      for (let i = this.pendingObs.length - 1; i >= 0; i--) {
        const o = this.pendingObs[i];
        if (o.tick <= this.game.tick) {
          this.pendingObs.splice(i, 1);
          const local = o.tick === this.game.tick ? this.game.checksum() : this.checksumHist.get(o.tick);
          if (local !== undefined && local !== o.sum) this.needResync();
        }
      }
      this.acc -= STEP_MS; n++;
    }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    return Math.min(1, this.acc / STEP_MS);
  }

  status(): SessionStatus { return 'running'; }
  waitingFor?(): number[] { return []; }
  dispose() { this.unsub?.(); }
}

/** How far behind the authoritative tick the client sim trails (≈0.67 s). */
const RENDER_DELAY_TICKS = 10;

/** Restore a region snapshot into a runnable Game (packs by id). */
export function gameFromSnapshot(state: SnapshotState): Game {
  return restoreGame(state.snapshot, registryPacks());
}
