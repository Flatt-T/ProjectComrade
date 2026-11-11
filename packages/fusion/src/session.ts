// Sessions drive a Game in real time. LocalSession steps it for skirmish against the AI;
// LockstepSession synchronises human players over a relay: every client runs the same
// deterministic simulation and only commands travel over the network.
import { TICKS_PER_SECOND } from './core.js';
import type { Command, Game } from './game.js';

export type SessionStatus = 'running' | 'waiting' | 'desync';

export interface Session {
  readonly game: Game;
  readonly slot: number;
  /**
   * Highest turn the relay stood in for while this client was disconnected. Turn packets
   * at or below it must carry no commands: every other client already applied the relay's
   * empty synthetic turns, so sending real orders for them would desynchronise the match.
   */
  heldUntil?: number;
  issue(cmd: Command): void;
  /** Advance by elapsed wall time; returns render interpolation 0..1. */
  update(dtMs: number): number;
  status(): SessionStatus;
  /** Slots holding up a lockstep match (empty when nothing is waited on). */
  waitingFor?(): number[];
  dispose(): void;
}

const STEP_MS = 1000 / TICKS_PER_SECOND;
// A tick costs ~0.05 ms, so a throttled or backgrounded tab can catch up two seconds of
// simulation per frame and keep real-time speed (vital in lockstep, where one slow
// client would otherwise stall everyone).
const MAX_STEPS_PER_FRAME = TICKS_PER_SECOND * 2;

export class LocalSession implements Session {
  private acc = 0;
  constructor(readonly game: Game, readonly slot: number, private speedPercent = 100) {}
  issue(cmd: Command) { this.game.enqueue(this.slot, cmd); }
  update(dtMs: number): number {
    const step = (STEP_MS * 100) / this.speedPercent;
    const most = Math.ceil((MAX_STEPS_PER_FRAME * this.speedPercent) / 100);
    this.acc += dtMs;
    let n = 0;
    while (this.acc >= step && n < most) { this.game.step(); this.acc -= step; n++; }
    if (n === most) this.acc = 0; // Never spiral after a stall (e.g. tab hidden).
    return Math.min(1, this.acc / step);
  }
  status(): SessionStatus { return 'running'; }
  dispose() { /* nothing to release */ }
}

export interface TurnPacket { turn: number; tick: number; checksum: number; commands: Command[]; final?: boolean; synthetic?: boolean }

export interface TurnTransport {
  send(packet: TurnPacket): void;
  /** Subscribe to peers' packets; returns an unsubscribe function. */
  subscribe(handler: (slot: number, packet: TurnPacket) => void): () => void;
}

export const TURN_TICKS = 3;
export const INPUT_DELAY_TURNS = 2;

export class LockstepSession implements Session {
  private acc = 0;
  private local: Command[] = [];
  private turns = new Map<number, Map<number, Command[]>>();
  private dropped = new Map<number, number>();
  private mySums = new Map<number, number>();
  /** Peer checksums that arrived before this client reached that tick. */
  private peerSums = new Map<number, number[]>();
  private waiting = false;
  private desynced = false;
  private unsubscribe: () => void;
  heldUntil?: number;

  /** `humans` lists the slots driven by people; AI slots run inside the simulation. */
  constructor(readonly game: Game, readonly slot: number, private humans: number[], private transport: TurnTransport, private speedPercent = 100) {
    this.unsubscribe = transport.subscribe((from, packet) => this.receive(from, packet));
    // Prime the pipeline: the first turns carry no commands.
    for (let t = 0; t < INPUT_DELAY_TURNS; t++) this.sendTurn(t);
  }

  issue(cmd: Command) { this.local.push(cmd); }

  private sendTurn(turn: number) {
    const held = this.heldUntil !== undefined && turn <= this.heldUntil;
    const packet: TurnPacket = { turn, tick: this.game.tick, checksum: this.game.checksum(), commands: held ? [] : this.local };
    if (!held) this.local = [];
    this.store(this.slot, packet);
    this.mySums.set(packet.tick, packet.checksum);
    for (const theirs of this.peerSums.get(packet.tick) ?? []) if (theirs !== packet.checksum) this.desynced = true;
    this.peerSums.delete(packet.tick);
    this.transport.send(packet);
  }

  private store(slot: number, packet: TurnPacket) {
    const bucket = this.turns.get(packet.turn) ?? new Map<number, Command[]>();
    bucket.set(slot, packet.commands.map(parseCommand).filter((c): c is Command => !!c));
    this.turns.set(packet.turn, bucket);
  }

  private receive(slot: number, packet: TurnPacket) {
    if (slot === this.slot || !this.humans.includes(slot)) return;
    // A packet for a turn this client already stepped is history (e.g. a reconnect
    // replay), not a command; every client makes the same call because ticks agree.
    if (packet.turn * TURN_TICKS < this.game.tick) return;
    this.store(slot, packet);
    if (packet.final) { this.dropped.set(slot, packet.turn); return; }
    // A synthetic turn is the relay standing in for a disconnected commander: there is
    // no sender checksum to compare, and every client sees the same empty command list.
    if (packet.synthetic) return;
    const mine = this.mySums.get(packet.tick);
    if (mine === undefined) this.peerSums.set(packet.tick, [...(this.peerSums.get(packet.tick) ?? []), packet.checksum]);
    else if (mine !== packet.checksum) this.desynced = true;
  }

  private ready(turn: number): boolean {
    const bucket = this.turns.get(turn);
    return this.humans.every(s => {
      const final = this.dropped.get(s);
      if (final !== undefined && turn > final) return true;
      return !!bucket?.has(s);
    });
  }

  /** True while buffered turns sit further ahead than the normal input-delay pipeline. */
  private ahead(): boolean {
    const now = this.game.tick / TURN_TICKS;
    for (const t of this.turns.keys()) if (t > now + INPUT_DELAY_TURNS + 1) return true;
    return false;
  }

  update(dtMs: number): number {
    if (this.desynced) return 0;
    // Game speed is wall-clock pacing, not simulation: every client runs the same setting
    // from the launch, and turns are exchanged per tick, so lockstep is unaffected.
    const step = (STEP_MS * 100) / this.speedPercent;
    const most = Math.ceil((MAX_STEPS_PER_FRAME * this.speedPercent) / 100);
    this.acc += dtMs;
    let n = 0;
    const tickOnce = (): boolean => {
      if (this.game.tick % TURN_TICKS === 0) {
        const turn = this.game.tick / TURN_TICKS;
        if (!this.ready(turn)) { this.waiting = true; return false; }
        this.waiting = false;
        const bucket = this.turns.get(turn);
        // Same order on every client: by slot, then as issued.
        for (const s of [...this.humans].sort((a, b) => a - b)) for (const cmd of bucket?.get(s) ?? []) this.game.enqueue(s, cmd);
        this.turns.delete(turn);
        this.sendTurn(turn + INPUT_DELAY_TURNS);
        for (const tick of this.mySums.keys()) if (tick < this.game.tick - 600) this.mySums.delete(tick);
        for (const tick of this.peerSums.keys()) if (tick < this.game.tick - 600) this.peerSums.delete(tick);
      }
      this.game.step();
      return true;
    };
    while (this.acc >= step && n < most) {
      if (!tickOnce()) { this.acc = Math.min(this.acc, step); break; }
      this.acc -= step;
      n++;
    }
    if (n === most) this.acc = 0;
    // A reconnected commander has the missed turns buffered by the relay. Catch up as fast
    // as the CPU allows — wall-clock pacing would leave them permanently behind, because
    // everyone else kept playing on synthetic turns and never waits for them.
    let drained = 0;
    while (drained < 240 && this.ahead() && tickOnce()) drained++;
    return Math.min(1, this.acc / step);
  }

  status(): SessionStatus { return this.desynced ? 'desync' : this.waiting ? 'waiting' : 'running'; }
  /** Human slots whose turn this client is still waiting for. */
  waitingFor(): number[] {
    if (!this.waiting) return [];
    const turn = this.game.tick / TURN_TICKS, bucket = this.turns.get(turn);
    return this.humans.filter(s => s !== this.slot && !bucket?.has(s) && !(this.dropped.has(s) && turn > this.dropped.get(s)!));
  }
  dispose() { this.unsubscribe(); }
}

const ints = (v: unknown, max = 128): v is number[] => Array.isArray(v) && v.length <= max && v.every(n => Number.isSafeInteger(n) && n >= 0);
const int = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < 1e7;
const item = (v: unknown): v is string => typeof v === 'string' && /^(?:(?:upgrade|starport):)?[a-z0-9-]{1,32}$/.test(v);

/** Validate a command received from the network; anything malformed is dropped on every client. */
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.t) {
    case 'move': case 'attackMove':
      return ints(c.ids) && int(c.x) && int(c.y) ? { t: c.t, ids: c.ids, x: c.x, y: c.y } : null;
    case 'harvest':
      return ints(c.ids) && int(c.x) && int(c.y) ? { t: 'harvest', ids: c.ids, x: c.x, y: c.y, lock: c.lock === true } : null;
    case 'attack':
      return ints(c.ids) && int(c.target) ? { t: 'attack', ids: c.ids, target: c.target, force: c.force === true } : null;
    case 'fireAt':
      return ints(c.ids) && int(c.x) && int(c.y) ? { t: 'fireAt', ids: c.ids, x: c.x, y: c.y } : null;
    case 'enter':
      return ints(c.ids) && int(c.target) ? { t: 'enter', ids: c.ids, target: c.target } : null;
    case 'stop': case 'deploy': case 'guard': case 'scatter':
      return ints(c.ids) ? { t: c.t, ids: c.ids } : null;
    case 'build': case 'cancel':
      return item(c.item) ? { t: c.t, item: c.item } : null;
    case 'place':
      return item(c.item) && int(c.x) && int(c.y) ? { t: 'place', item: c.item, x: c.x, y: c.y } : null;
    case 'sell': case 'repair':
      return int(c.id) ? { t: c.t, id: c.id } : null;
    case 'super':
      if (!int(c.id) || !int(c.x) || !int(c.y)) return null;
      // Two-point powers (Chronosphere) carry a destination.
      return int(c.x2) && int(c.y2) ? { t: 'super', id: c.id, x: c.x, y: c.y, x2: c.x2, y2: c.y2 } : { t: 'super', id: c.id, x: c.x, y: c.y };
    case 'rally':
      return int(c.x) && int(c.y) ? { t: 'rally', x: c.x, y: c.y } : null;
    case 'surrender':
      return { t: 'surrender' };
    case 'join': {
      const p = c.player as Record<string, unknown> | undefined;
      if (!p || typeof p.name !== 'string' || p.name.length > 24 || typeof p.faction !== 'string' || p.faction.length > 32 || typeof p.ai !== 'boolean') return null;
      const level = p.level === 'easy' || p.level === 'normal' || p.level === 'hard' ? p.level : undefined;
      return { t: 'join', player: { name: p.name, faction: p.faction, ai: p.ai, team: int(p.team) ? p.team as number : undefined, level } };
    }
    case 'leave':
      return int(c.slot) ? { t: 'leave', slot: c.slot } : null;
    case 'transfer':
      return ints(c.ids) && int(c.to) ? { t: 'transfer', ids: c.ids, to: c.to } : null;
    default:
      return null;
  }
}
