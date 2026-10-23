import { randomInt, randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, factionAllowed, parseClientMessage, RoomOptions, RoomPlayer, RoomState, RoomSummary, styleInfo } from '@comrade/contracts';

interface Peer { send(message: string): void; room?: string; player: RoomPlayer }
interface Room {
  host: string;
  phase: 'lobby' | 'started';
  options: RoomOptions;
  members: Set<string>;
  /** Fixed at start: shared seed and player ids in lockstep slot order. */
  seed?: number;
  slots?: string[];
  /** Last lockstep turn relayed for each player, so a drop can be finalised deterministically. */
  lastTurn: Map<string, number>;
}

export class RoomCoordinator {
  private peers = new Map<string, Peer>();
  private rooms = new Map<string, Room>();

  connect(send: (message: string) => void) {
    const id = randomUUID();
    this.peers.set(id, { send, player: { id, name: 'Commander', faction: 'gdi', ready: false, host: false } });
    send(JSON.stringify({ version: 1, type: 'welcome', id, capabilities: ['rooms', 'public-list', 'configure', 'lockstep'], gameplay: 'lobby-presence' }));
    this.sendLobbyList(id);
    return id;
  }

  private summaries(): RoomSummary[] {
    return [...this.rooms.entries()]
      .filter(([, room]) => room.options.visibility === 'public')
      .map(([name, room]) => ({
        room: name, hostName: this.peers.get(room.host)?.player.name ?? 'Commander',
        style: room.options.style, map: room.options.map,
        players: room.members.size, maxPlayers: room.options.maxPlayers, phase: room.phase,
      }));
  }

  private sendLobbyList(id: string) {
    this.peers.get(id)?.send(JSON.stringify({ version: 1, type: 'rooms', rooms: this.summaries() }));
  }

  // Everyone browsing the lobby (not yet in a room) sees live public rooms.
  private broadcastLobbyList() {
    const message = JSON.stringify({ version: 1, type: 'rooms', rooms: this.summaries() });
    for (const peer of this.peers.values()) if (!peer.room) peer.send(message);
  }

  private broadcast(name: string) {
    const room = this.rooms.get(name);
    if (!room) return;
    const state: RoomState = {
      version: 1, type: 'room', room: name, host: room.host, phase: room.phase,
      options: room.options, players: [...room.members].map(id => this.peers.get(id)!.player),
      ...(room.seed !== undefined ? { seed: room.seed, slots: room.slots } : {}),
    };
    const message = JSON.stringify(state);
    for (const id of room.members) this.peers.get(id)?.send(message);
  }

  private leave(id: string) {
    const peer = this.peers.get(id);
    const name = peer?.room;
    if (!name || !peer) return;
    peer.room = undefined;
    peer.player.host = false;
    const room = this.rooms.get(name)!;
    room.members.delete(id);
    if (!room.members.size) this.rooms.delete(name);
    else {
      if (room.host === id) { room.host = [...room.members][0]; this.peers.get(room.host)!.player.host = true; }
      if (room.phase === 'started') {
        // Tell the remaining clients exactly which turn the departed player surrenders on.
        const slot = room.slots?.indexOf(id) ?? -1;
        if (slot >= 0 && styleInfo(room.options.style).lockstep) {
          const final = JSON.stringify({ version: 1, type: 'turn', slot, turn: (room.lastTurn.get(id) ?? -1) + 1, tick: 0, checksum: 0, commands: [{ t: 'surrender' }], final: true });
          for (const member of room.members) this.peers.get(member)?.send(final);
        }
      } else {
        for (const member of room.members) this.peers.get(member)!.player.ready = false;
      }
      this.broadcast(name);
    }
    this.broadcastLobbyList();
  }

  disconnect(id: string) { this.leave(id); this.peers.delete(id); }

  receive(id: string, raw: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try {
      const message = parseClientMessage(JSON.parse(raw));
      if (message.type === 'list') { this.sendLobbyList(id); return; }
      if (message.type === 'leave') { this.leave(id); this.sendLobbyList(id); return; }
      if (message.type === 'join') {
        const existing = this.rooms.get(message.room);
        if (existing && (existing.members.size >= existing.options.maxPlayers || existing.phase !== 'lobby')) throw new Error('Room unavailable');
        if (!existing && this.rooms.size >= 64) throw new Error('Room capacity reached');
        this.leave(id);
        let room = this.rooms.get(message.room);
        const host = !room;
        if (!room) { room = { host: id, phase: 'lobby', options: { ...DEFAULT_OPTIONS }, members: new Set(), lastTurn: new Map() }; this.rooms.set(message.room, room); }
        const style = styleInfo(room.options.style);
        const faction = factionAllowed(style.id, message.faction) ? message.faction : style.factions[room.members.size % style.factions.length].id;
        peer.player = { id, name: message.name, faction, ready: false, host };
        peer.room = message.room; room.members.add(id);
        this.broadcast(message.room); this.broadcastLobbyList(); return;
      }
      if (!peer.room) throw new Error('Join a room first');
      const room = this.rooms.get(peer.room)!;
      if (message.type === 'turn') {
        if (room.phase !== 'started' || !styleInfo(room.options.style).lockstep) throw new Error('No lockstep match in progress');
        const slot = room.slots?.indexOf(id) ?? -1;
        if (slot < 0) throw new Error('Not a player in this match');
        room.lastTurn.set(id, Math.max(room.lastTurn.get(id) ?? -1, message.turn));
        const relay = JSON.stringify({ ...message, slot });
        for (const member of room.members) if (member !== id) this.peers.get(member)?.send(relay);
        return;
      }
      if (message.type === 'configure') {
        if (room.host !== id) throw new Error('Only the host can configure the match');
        if (room.phase !== 'lobby') throw new Error('Match already started');
        if (message.options.maxPlayers < room.members.size) throw new Error('Cannot reduce below current player count');
        const styleChanged = message.options.style !== room.options.style;
        room.options = message.options;
        const style = styleInfo(room.options.style);
        [...room.members].forEach((member, n) => {
          const player = this.peers.get(member)!.player;
          player.ready = false;
          if (styleChanged || !factionAllowed(style.id, player.faction)) player.faction = style.factions[n % style.factions.length].id;
        });
        this.broadcast(peer.room); this.broadcastLobbyList(); return;
      }
      if (message.type === 'faction') {
        if (!factionAllowed(room.options.style, message.faction)) throw new Error('That side is not part of this game style');
        peer.player.faction = message.faction; peer.player.ready = false; this.broadcast(peer.room); return;
      }
      if (message.type === 'ready' && room.phase === 'lobby') { peer.player.ready = message.ready; this.broadcast(peer.room); return; }
      if (message.type === 'start') {
        if (room.host !== id) throw new Error('Only the host can start the match');
        if (room.phase !== 'lobby') throw new Error('Match already started');
        if (!styleInfo(room.options.style).playable) throw new Error('That game style is not playable yet');
        const others = [...room.members].filter(m => m !== id);
        if (others.some(m => !this.peers.get(m)!.player.ready)) throw new Error('All players must be ready');
        room.phase = 'started';
        room.seed = randomInt(1, 0x7fffffff);
        room.slots = [...room.members];
        room.lastTurn = new Map();
        this.broadcast(peer.room); this.broadcastLobbyList(); return;
      }
      throw new Error('Invalid room transition');
    } catch (error) {
      peer.send(JSON.stringify({ version: 1, type: 'error', message: error instanceof Error ? error.message : 'Invalid message' }));
    }
  }
}
