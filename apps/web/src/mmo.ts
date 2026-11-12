// Persistent-world client transport (PW08): a dedicated /mmo socket carrying the
// versioned MMO protocol. The browser restores the authoritative Fusion snapshot and
// then runs the same deterministic sim; the server streams resolved sim commands in
// journal order and authoritative checksums for verification. Own orders are sent as
// durable-id intents and applied only when they come back on the sim stream — the
// client never predicts.
import {
  Game, PACKS, restoreGame, TICKS_PER_SECOND,
  type Command, type RulePack, type Session, type SessionStatus,
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
  onSim?(atTick: number, slot: number, command: Command): void;
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
      }
      if (message.type === 'event' && message.eventKind === 'sim') {
        const p = message.payload as { atTick?: number; slot?: number; command?: Command };
        if (p.command && p.slot !== undefined) this.handlers.onSim?.(Number(p.atTick ?? message.tick), p.slot, p.command);
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

  /** The server resolved and journaled this command — apply it at its tick. */
  applyRemote(atTick: number, fromSlot: number, cmd: Command) {
    this.game.enqueue(fromSlot, cmd, Math.max(atTick, this.game.tick + 1));
  }

  update(dtMs: number): number {
    this.acc += dtMs;
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS_PER_FRAME) { this.game.step(); this.acc -= STEP_MS; n++; }
    if (n === MAX_STEPS_PER_FRAME) this.acc = 0;
    return Math.min(1, this.acc / STEP_MS);
  }

  status(): SessionStatus { return 'running'; }
  waitingFor?(): number[] { return []; }
  dispose() { this.unsub?.(); }
}

/** Restore a region snapshot into a runnable Game (packs by id). */
export function gameFromSnapshot(state: SnapshotState): Game {
  const packs = Object.values(PACKS) as RulePack[];
  return restoreGame(state.snapshot, packs);
}
