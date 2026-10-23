import type { ServerMessage } from '@comrade/contracts';
import type { TurnPacket, TurnTransport } from '../../../packages/fusion/src/session';

type Listener = (message: ServerMessage) => void;

/**
 * One WebSocket for the whole visit. The lobby and the battle share it, so a lockstep
 * match keeps its connection when the lobby view unmounts. Turn packets that arrive
 * before the battle subscribes are buffered rather than lost.
 */
export class RoomConnection {
  id = '';
  connected = false;
  private ws?: WebSocket;
  private listeners = new Set<Listener>();
  private turnHandler?: (slot: number, packet: TurnPacket) => void;
  /** Every turn received this match, replayed to a re-subscribing session so a remounted
   *  battle view never misses its opponents' opening turns. */
  private turnLog: { slot: number; packet: TurnPacket }[] = [];
  /** Bumped whenever the socket drops: a lockstep match cannot be rejoined. */
  drops = 0;
  private closed = false;

  constructor(private url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) { this.open(); }

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.emit({ version: 1, type: 'rooms', rooms: [] }); };
    ws.onclose = () => {
      this.connected = false;
      this.drops++;
      this.emit({ version: 1, type: 'error', message: 'Connection lost — reconnecting…' });
      if (!this.closed) setTimeout(() => this.open(), 2000);
    };
    ws.onmessage = event => {
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      if (message.type === 'welcome') this.id = message.id;
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

  /** Forget buffered turns from a previous match. */
  resetTurns() { this.turnLog = []; }

  close() { this.closed = true; this.ws?.close(); }
}
