import { randomUUID } from 'node:crypto';
import { MAP_ID, parseClientMessage, RoomPlayer, RoomState } from '@comrade/contracts';

interface Peer { send(message: string): void; room?: string; player: RoomPlayer }
export class RoomCoordinator {
  private peers = new Map<string, Peer>();
  private rooms = new Map<string, { host: string; phase: 'lobby' | 'started'; members: Set<string> }>();
  connect(send: (message: string) => void) {
    const id = randomUUID();
    this.peers.set(id, { send, player: { id, name: 'Commander', faction: 'gdi', ready: false } });
    send(JSON.stringify({ version: 1, type: 'welcome', id, capabilities: ['rooms'], gameplay: 'single-player' }));
    return id;
  }
  private broadcast(name: string) {
    const room = this.rooms.get(name);
    if (!room) return;
    const state: RoomState = { version: 1, type: 'room', room: name, host: room.host, phase: room.phase, map: MAP_ID, players: [...room.members].map(id => this.peers.get(id)!.player) };
    for (const id of room.members) this.peers.get(id)?.send(JSON.stringify(state));
  }
  private leave(id: string) {
    const peer = this.peers.get(id);
    const name = peer?.room;
    if (!name || !peer) return;
    peer.room = undefined;
    const room = this.rooms.get(name)!;
    room.members.delete(id);
    if (!room.members.size) this.rooms.delete(name);
    else {
      if (room.host === id) room.host = [...room.members][0];
      room.phase = 'lobby';
      for (const member of room.members) this.peers.get(member)!.player.ready = false;
      this.broadcast(name);
    }
  }
  disconnect(id: string) { this.leave(id); this.peers.delete(id); }
  receive(id: string, raw: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try {
      const message = parseClientMessage(JSON.parse(raw));
      if (message.type === 'leave') { this.leave(id); return; }
      if (message.type === 'join') {
        const existing = this.rooms.get(message.room);
        if (existing && (existing.members.size >= 4 || existing.phase !== 'lobby')) throw new Error('Room unavailable');
        if (!existing && this.rooms.size >= 64) throw new Error('Room capacity reached');
        this.leave(id);
        let room = this.rooms.get(message.room);
        if (!room) { room = { host: id, phase: 'lobby', members: new Set() }; this.rooms.set(message.room, room); }
        peer.player = { id, name: message.name, faction: message.faction, ready: false };
        peer.room = message.room; room.members.add(id); this.broadcast(message.room); return;
      }
      if (!peer.room) throw new Error('Join a room first');
      const room = this.rooms.get(peer.room)!;
      if (message.type === 'ready' && room.phase === 'lobby') peer.player.ready = message.ready;
      else if (message.type === 'start') {
        // The lobby contract is ready; native engine lockstep is a separate gate.
        throw new Error('Network simulation is not enabled in the single-player slice');
      } else throw new Error('Invalid room transition');
      this.broadcast(peer.room);
    } catch (error) {
      peer.send(JSON.stringify({ version: 1, type: 'error', message: error instanceof Error ? error.message : 'Invalid message' }));
    }
  }
}
