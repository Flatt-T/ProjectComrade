import { randomUUID } from 'node:crypto';
import { DEFAULT_OPTIONS, parseClientMessage, RoomOptions, RoomPlayer, RoomState, RoomSummary, STYLES } from '@comrade/contracts';

interface Peer { send(message: string): void; room?: string; player: RoomPlayer }
interface Room { host: string; phase: 'lobby' | 'started'; options: RoomOptions; members: Set<string> }

export class RoomCoordinator {
  private peers = new Map<string, Peer>();
  private rooms = new Map<string, Room>();

  connect(send: (message: string) => void) {
    const id = randomUUID();
    this.peers.set(id, { send, player: { id, name: 'Commander', faction: 'gdi', ready: false, host: false } });
    send(JSON.stringify({ version: 1, type: 'welcome', id, capabilities: ['rooms', 'public-list', 'configure'], gameplay: 'lobby-presence' }));
    this.sendLobbyList(id);
    return id;
  }

  private styleName(id: string) { return STYLES.find(s => s.id === id)?.name ?? id; }

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
      room.phase = 'lobby';
      for (const member of room.members) this.peers.get(member)!.player.ready = false;
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
        if (!room) { room = { host: id, phase: 'lobby', options: { ...DEFAULT_OPTIONS }, members: new Set() }; this.rooms.set(message.room, room); }
        peer.player = { id, name: message.name, faction: message.faction, ready: false, host };
        peer.room = message.room; room.members.add(id);
        this.broadcast(message.room); this.broadcastLobbyList(); return;
      }
      if (!peer.room) throw new Error('Join a room first');
      const room = this.rooms.get(peer.room)!;
      if (message.type === 'configure') {
        if (room.host !== id) throw new Error('Only the host can configure the match');
        if (room.phase !== 'lobby') throw new Error('Match already started');
        if (message.options.maxPlayers < room.members.size) throw new Error('Cannot reduce below current player count');
        room.options = message.options;
        for (const member of room.members) this.peers.get(member)!.player.ready = false;
        this.broadcast(peer.room); this.broadcastLobbyList(); return;
      }
      if (message.type === 'faction') { peer.player.faction = message.faction; peer.player.ready = false; this.broadcast(peer.room); return; }
      if (message.type === 'ready' && room.phase === 'lobby') { peer.player.ready = message.ready; this.broadcast(peer.room); return; }
      if (message.type === 'start') {
        if (room.host !== id) throw new Error('Only the host can start the match');
        if (room.phase !== 'lobby') throw new Error('Match already started');
        const others = [...room.members].filter(m => m !== id);
        if (others.some(m => !this.peers.get(m)!.player.ready)) throw new Error('All players must be ready');
        // Lobby presence and configuration are coordinated; each client launches the
        // configured scenario. Shared deterministic simulation is the next gate.
        room.phase = 'started';
        this.broadcast(peer.room); this.broadcastLobbyList(); return;
      }
      throw new Error('Invalid room transition');
    } catch (error) {
      peer.send(JSON.stringify({ version: 1, type: 'error', message: error instanceof Error ? error.message : 'Invalid message' }));
    }
  }
}
