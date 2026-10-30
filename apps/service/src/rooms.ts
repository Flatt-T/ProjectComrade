import { randomInt, randomUUID } from 'node:crypto';
import { log } from './ops.js';
import {
  DEFAULT_OPTIONS, MASHUP_STYLE, RoomOptions, RoomPlayer, RoomState, RoomSummary, Tier,
  factionAllowed, parseClientMessage, playKind, styleAllowed, styleInfo,
} from '@comrade/contracts';
import { accountBySub, touchGuest } from './accounts.js';
import { verifyAccessToken } from './auth.js';
import { platformEnabled } from './config.js';
import { activeSubscription, quotaFor, tierFromSubscription } from './entitlements.js';
import { beginMatch, type StartingAi, type StartingPlayer } from './matchstart.js';
import { lockFor } from './releases.js';

/**
 * Who a peer is, for quotas and history. A peer starts as a guest (its signed cookie came in
 * with the WebSocket upgrade) and becomes an account the moment it sends a valid token.
 */
interface Identity {
  accountId?: string;
  handle?: string;
  guestId?: string;
  tier: Tier;
  /** Start of this peer's allowance clock. Play quotas step every 24 hours from here. */
  anchor: Date;
  /** The style the `entitled` flag was last worked out for. */
  checkedFor?: string;
  entitled?: boolean;
}

interface Peer { send(message: string): void; room?: string; player: RoomPlayer; chat: number[]; identity: Identity }
interface Room {
  host: string;
  phase: 'lobby' | 'started';
  options: RoomOptions;
  members: Set<string>;
  /** Fixed at start: shared seed and player ids in lockstep slot order. */
  seed?: number;
  slots?: string[];
  /** Slots watching a pre-match advertisement, for everyone else's benefit. */
  adSlots?: number[];
  /** Set while a start is being checked, so two clicks cannot charge the room twice. */
  starting?: boolean;
  /** Last lockstep turn relayed for each player, so a drop can be finalised deterministically. */
  lastTurn: Map<string, number>;
}

export class RoomCoordinator {
  private peers = new Map<string, Peer>();
  private rooms = new Map<string, Room>();

  connect(send: (message: string) => void, guestId?: string) {
    const id = randomUUID();
    this.peers.set(id, {
      send,
      player: { id, name: 'Commander', faction: 'gdi', ready: false, host: false, team: 0 },
      chat: [],
      identity: { guestId, tier: 'guest', anchor: new Date() },
    });
    send(JSON.stringify({ version: 1, type: 'welcome', id, capabilities: ['rooms', 'public-list', 'configure', 'lockstep', 'accounts'], gameplay: 'lobby-presence' }));
    this.sendLobbyList(id);
    // A guest's allowance clock starts the first time we see them, not the first time they play.
    if (guestId && platformEnabled()) {
      void touchGuest(guestId)
        .then(firstSeen => { const peer = this.peers.get(id); if (peer) peer.identity.anchor = firstSeen; })
        .catch(() => undefined);
    }
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
      ...(room.adSlots?.length ? { adSlots: room.adSlots } : {}),
    };
    const message = JSON.stringify(state);
    for (const id of room.members) this.peers.get(id)?.send(message);
  }

  private fail(id: string, message: string) {
    this.peers.get(id)?.send(JSON.stringify({ version: 1, type: 'error', message }));
  }

  // -------------------------------------------------------------------------
  // Identity and entitlement
  // -------------------------------------------------------------------------

  /** Attach an account to this peer, or drop back to guest when the token is absent. */
  private async identify(id: string, token: string | undefined) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (!token || !platformEnabled()) {
      peer.identity = { guestId: peer.identity.guestId, tier: 'guest', anchor: peer.identity.anchor };
      peer.player.handle = undefined;
      peer.player.tier = 'guest';
    } else {
      try {
        const { sub } = await verifyAccessToken(token);
        const account = await accountBySub(sub);
        if (!account) throw new Error('no account');
        const subscription = await activeSubscription(account.id);
        peer.identity = {
          accountId: account.id, handle: account.handle,
          tier: tierFromSubscription(subscription), anchor: account.week_anchor,
        };
        peer.player.handle = account.handle;
        peer.player.tier = peer.identity.tier;
        // A registered player is known by their callsign in the lobby.
        peer.player.name = account.display_name || account.handle;
      } catch {
        this.fail(id, 'That sign-in is no longer valid — sign in again');
        return;
      }
    }
    await this.refreshEntitlement(id);
    if (peer.room) this.broadcast(peer.room);
  }

  /** Work out whether this peer can still enter the room's current style. */
  private async refreshEntitlement(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (!platformEnabled()) { peer.player.entitled = true; peer.identity.entitled = true; return; }
    const room = peer.room ? this.rooms.get(peer.room) : undefined;
    const style = room?.options.style;
    if (!style) { peer.player.entitled = undefined; peer.identity.checkedFor = undefined; return; }
    const subject = peer.identity.accountId
      ? { accountId: peer.identity.accountId }
      : peer.identity.guestId ? { guestId: peer.identity.guestId } : undefined;
    if (!subject) { peer.player.entitled = true; return; }
    try {
      const quota = await quotaFor(subject, playKind(style), peer.identity.tier, peer.identity.anchor);
      const lock = await lockFor(room!.options.map, peer.identity.tier);
      const entitled = !lock.locked && styleAllowed(style, peer.identity.tier)
        && (quota.remaining === null || quota.remaining > 0);
      peer.identity.entitled = entitled;
      peer.identity.checkedFor = `${style}:${room!.options.map}`;
      peer.player.entitled = entitled;
    } catch (error) {
      // A database hiccup must not lock players out of their own lobby.
      log('entitlement-check-failed', { message: String(error).slice(0, 160) });
      peer.player.entitled = true;
    }
  }

  /** Re-check everyone in a room, then tell them. Used when the host changes the match. */
  private async refreshRoom(name: string) {
    const room = this.rooms.get(name);
    if (!room) return;
    await Promise.all([...room.members].map(id => this.refreshEntitlement(id)));
    this.broadcast(name);
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  private leave(id: string) {
    const peer = this.peers.get(id);
    const name = peer?.room;
    if (!name || !peer) return;
    peer.room = undefined;
    peer.player.host = false;
    const room = this.rooms.get(name)!;
    log('room-leave', { room: name, peer: id.slice(0, 8), phase: room.phase, remaining: room.members.size - 1 });
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

  // -------------------------------------------------------------------------
  // Starting a match
  // -------------------------------------------------------------------------

  /**
   * Check and charge everyone, then launch. Nothing is spent unless every commander in the
   * room can enter, and each player is sent its own kick-off privately: a report token and,
   * on the advertising tiers, the VAST waterfall to play over the opening thirty seconds.
   */
  private async start(id: string, name: string) {
    const room = this.rooms.get(name);
    const peer = this.peers.get(id);
    if (!room || !peer) return;
    const style = styleInfo(room.options.style);
    const members = [...room.members];
    const slots = members;
    const aiCount = style.engine === 'fusion' ? Math.max(0, Math.min(3, room.options.settings.ai)) : 0;

    const players: StartingPlayer[] = members.map((member, slot) => {
      const other = this.peers.get(member)!;
      return {
        peerId: member, slot, name: other.player.name, faction: other.player.faction,
        team: other.player.team ?? 0,
        accountId: other.identity.accountId, guestId: other.identity.guestId,
        tier: other.identity.tier, anchor: other.identity.anchor,
        loadout: other.player.loadout,
      };
    });
    const ai: StartingAi[] = Array.from({ length: aiCount }, (_, n) => ({
      slot: members.length + n,
      name: `Computer ${n + 1}`,
      faction: style.factions[(members.length + n) % style.factions.length].id,
      team: 0,
    }));

    let outcome;
    try {
      outcome = await beginMatch({
        style: room.options.style, map: room.options.map,
        mapName: room.options.map, room: name,
        multiplayer: style.lockstep && members.length > 1,
        players, ai,
      });
    } catch (error) {
      log('match-start-failed', { room: name, message: String(error).slice(0, 200) });
      room.starting = false;
      this.fail(id, 'The match could not be started — try again in a moment');
      return;
    }
    room.starting = false;

    // The room may have emptied or moved on while the checks were running.
    if (!this.rooms.get(name) || room.phase !== 'lobby') return;

    if (outcome.refusals.length) {
      for (const refusal of outcome.refusals) {
        this.fail(refusal.peerId, refusal.message.replace(`${refusal.name}: `, '').replace(`${refusal.name} has`, 'You have'));
      }
      this.fail(id, `Cannot start: ${outcome.refusals.map(r => r.message).join('; ')}`);
      await this.refreshRoom(name);
      return;
    }

    room.phase = 'started';
    room.seed = randomInt(1, 0x7fffffff);
    room.slots = slots;
    room.lastTurn = new Map();
    room.adSlots = players.filter(p => outcome!.starts.get(p.peerId)?.ad).map(p => p.slot);
    log('match-start', {
      room: name, style: room.options.style, map: room.options.map, players: members.length,
      ai: aiCount, aiLevel: room.options.settings.aiLevel, ads: room.adSlots.length,
    });
    this.broadcast(name);
    for (const player of players) {
      const start = outcome.starts.get(player.peerId);
      if (!start) continue;
      this.peers.get(player.peerId)?.send(JSON.stringify({
        version: 1, type: 'match', matchId: outcome.matchId ?? '', reportToken: start.reportToken,
        slot: player.slot, ...(start.ad ? { ad: start.ad } : {}),
      }));
    }
    this.broadcastLobbyList();
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  receive(id: string, raw: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try {
      const message = parseClientMessage(JSON.parse(raw));
      if (message.type === 'list') { this.sendLobbyList(id); return; }
      if (message.type === 'identify') { void this.identify(id, message.token); return; }
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
        peer.player = {
          id, name: message.name, faction, ready: false, host, team: 0,
          handle: peer.identity.handle, tier: peer.identity.tier,
        };
        peer.room = message.room; room.members.add(id);
        log(host ? 'room-create' : 'room-join', { room: message.room, peer: id.slice(0, 8), players: room.members.size, style: room.options.style });
        // A token on the join both identifies the peer and refreshes its allowance.
        if (message.token) void this.identify(id, message.token);
        else void this.refreshEntitlement(id).then(() => this.broadcast(message.room));
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
        if (platformEnabled() && !styleAllowed(message.options.style, peer.identity.tier)) {
          throw new Error('The Custom Mashup is a Gold game type — subscribe to Gold to build your own army');
        }
        const styleChanged = message.options.style !== room.options.style;
        const mapChanged = message.options.map !== room.options.map;
        room.options = message.options;
        const style = styleInfo(room.options.style);
        [...room.members].forEach((member, n) => {
          const player = this.peers.get(member)!.player;
          player.ready = false;
          if (styleChanged || !factionAllowed(style.id, player.faction)) player.faction = style.factions[n % style.factions.length].id;
          // Forces belong to the Custom Mashup; any other style fields its own roster.
          if (style.id !== MASHUP_STYLE) player.loadout = undefined;
        });
        // A different style or battlefield draws on a different allowance.
        if (styleChanged || mapChanged) void this.refreshRoom(peer.room);
        this.broadcast(peer.room); this.broadcastLobbyList(); return;
      }
      if (message.type === 'faction') {
        if (!factionAllowed(room.options.style, message.faction)) throw new Error('That side is not part of this game style');
        peer.player.faction = message.faction; peer.player.ready = false; this.broadcast(peer.room); return;
      }
      if (message.type === 'loadout') {
        if (room.phase !== 'lobby') throw new Error('Forces are fixed once the match starts');
        if (room.options.style !== MASHUP_STYLE) throw new Error('Only a Custom Mashup takes a choice of forces');
        peer.player.loadout = message.loadout; peer.player.ready = false; this.broadcast(peer.room); return;
      }
      if (message.type === 'team') {
        if (room.phase !== 'lobby') throw new Error('Teams are fixed once the match starts');
        peer.player.team = message.team; peer.player.ready = false; this.broadcast(peer.room); return;
      }
      if (message.type === 'chat') {
        // At most five messages in five seconds per player.
        const now = Date.now();
        peer.chat = peer.chat.filter(t => now - t < 5000);
        if (peer.chat.length >= 5) throw new Error('Slow down: too many messages');
        peer.chat.push(now);
        const team = peer.player.team ?? 0;
        const out = JSON.stringify({ version: 1, type: 'chat', from: id, name: peer.player.name, text: message.text, to: message.to, at: now });
        // Allied messages go only to teammates (and the sender), never to opponents.
        for (const member of room.members) {
          const other = this.peers.get(member);
          if (!other) continue;
          if (message.to === 'allies' && member !== id && (team === 0 || other.player.team !== team)) continue;
          other.send(out);
        }
        return;
      }
      if (message.type === 'ready' && room.phase === 'lobby') {
        // Somebody with nothing left today cannot hold the room at "ready".
        if (message.ready && room.options.style === MASHUP_STYLE && !peer.player.loadout) {
          throw new Error('Choose your forces first');
        }
        if (message.ready && peer.player.entitled === false) {
          throw new Error(`You have no ${playKind(room.options.style) === 'fusion' ? 'Fusion' : 'Classic'} matches left — watch an advertisement or buy a battle pack`);
        }
        peer.player.ready = message.ready; this.broadcast(peer.room); return;
      }
      if (message.type === 'recheck' && room.phase === 'lobby') {
        void this.refreshEntitlement(id).then(() => this.broadcast(peer.room!));
        return;
      }
      if (message.type === 'start') {
        if (room.host !== id) throw new Error('Only the host can start the match');
        if (room.phase !== 'lobby') throw new Error('Match already started');
        if (room.starting) throw new Error('Already starting');
        if (!styleInfo(room.options.style).playable) throw new Error('That game style is not playable yet');
        if (room.options.style === MASHUP_STYLE) {
          const unset = [...room.members].filter(m => !this.peers.get(m)!.player.loadout);
          if (unset.length) throw new Error('Every commander must choose their forces first');
        }
        const others = [...room.members].filter(m => m !== id);
        if (others.some(m => !this.peers.get(m)!.player.ready)) throw new Error('All players must be ready');
        // Marked synchronously so a second click cannot charge the room twice.
        room.starting = true;
        void this.start(id, peer.room);
        return;
      }
      throw new Error('Invalid room transition');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid message';
      log('rejected', { peer: id.slice(0, 8), room: peer.room, message });
      peer.send(JSON.stringify({ version: 1, type: 'error', message }));
    }
  }
}
