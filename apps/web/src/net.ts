import type { AdBreak, ServerMessage } from '@comrade/contracts';
import type { TurnPacket, TurnTransport } from '../../../packages/fusion/src/session';
import { recordEvent } from './diagnostics';

type Listener = (message: ServerMessage) => void;

const RESUME_KEY = 'comrade-room-resume';
function savedResumeToken() {
  try { return sessionStorage.getItem(RESUME_KEY) || ''; } catch { return ''; }
}
function saveResumeToken(token: string) {
  try { sessionStorage.setItem(RESUME_KEY, token); } catch { /* storage may be disabled */ }
}

/**
 * One WebSocket for the whole visit. The lobby and the battle share it, so a lockstep
 * match keeps its connection when the lobby view unmounts. Turn packets that arrive
 * before the battle subscribes are buffered rather than lost.
 */
export interface ChatLine { from: string; name: string; text: string; to: 'all' | 'allies'; at: number }

export class RoomConnection {
  id = '';
  connected = false;
  private ws?: WebSocket;
  private listeners = new Set<Listener>();
  private turnHandler?: (slot: number, packet: TurnPacket) => void;
  /** Every turn received this match, replayed to a re-subscribing session so a remounted
   *  battle view never misses its opponents' opening turns. */
  private turnLog: { slot: number; packet: TurnPacket }[] = [];
  /** Chat this visit (lobby and match), newest last; capped. */
  chatLog: ChatLine[] = [];
  /** Bumped whenever the socket drops: a lockstep match cannot be rejoined. */
  drops = 0;
  /**
   * This player's private kick-off, sent as the match starts: the token that lets it report
   * its own result, and the advertisement it must watch (absent on the subscriber tiers).
   * Kept on the connection because the lobby unmounts before the battle view mounts.
   */
  match?: { matchId: string; reportToken: string; slot: number; ad?: AdBreak };
  /** The access token last sent to the service, so a reconnect re-identifies itself. */
  private token = '';
  /** Tab-scoped ticket that restores the same room seat and host authority after a drop. */
  private resumeToken = savedResumeToken();
  private closed = false;

  constructor(private url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) { this.open(); }

  private open() {
    const url = new URL(this.url);
    if (this.resumeToken) url.searchParams.set('resume', this.resumeToken);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      recordEvent('connected');
      // A reconnect has to say who it is again before anything else.
      if (this.token) this.send({ type: 'identify', token: this.token });
      this.emit({ version: 1, type: 'rooms', rooms: [] });
    };
    ws.onclose = () => {
      this.connected = false;
      recordEvent('disconnected');
      this.drops++;
      this.emit({ version: 1, type: 'error', message: 'Connection lost — reconnecting…' });
      if (!this.closed) setTimeout(() => this.open(), 2000);
    };
    ws.onmessage = event => {
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'welcome') {
        this.id = message.id;
        this.resumeToken = message.resumeToken;
        saveResumeToken(message.resumeToken);
      }
      if (message.type === 'error') recordEvent('server-error', { message: message.message });
      if (message.type === 'chat') this.chatLog = [...this.chatLog.slice(-99), { from: message.from, name: message.name, text: message.text, to: message.to, at: message.at }];
      if (message.type === 'match') {
        this.match = { matchId: message.matchId, reportToken: message.reportToken, slot: message.slot, ad: message.ad };
      }
      if (message.type === 'turn') {
        const packet: TurnPacket = { turn: message.turn, tick: message.tick, checksum: message.checksum, commands: message.commands as TurnPacket['commands'], final: message.final };
        if (this.turnLog.length < 50000) this.turnLog.push({ slot: message.slot, packet });
        this.turnHandler?.(message.slot, packet);
        return;
      }
      this.emit(message);
    };
  }

  private emit(message: ServerMessage) { for (const l of this.listeners) l(message); }

  on(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ version: 1, ...payload }));
  }

  /** Lockstep transport for the Fusion Engine over the room relay. */
  transport(): TurnTransport {
    return {
      send: packet => this.send({ type: 'turn', turn: packet.turn, tick: packet.tick, checksum: packet.checksum, commands: packet.commands }),
      subscribe: handler => {
        this.turnHandler = handler;
        for (const { slot, packet } of this.turnLog) handler(slot, packet);
        return () => { if (this.turnHandler === handler) this.turnHandler = undefined; };
      },
    };
  }

  /** Tell the service who we are, or that we have signed out. */
  identify(token: string) {
    if (token === this.token) return;
    this.token = token;
    this.send({ type: 'identify', ...(token ? { token } : {}) });
  }

  /** The token to put on a join, so the room knows the account from the first message. */
  get identity(): string { return this.token; }

  /** Forget buffered turns and the previous match's kick-off. */
  resetTurns() { this.turnLog = []; this.match = undefined; }

  close() { this.closed = true; this.ws?.close(); }
}
