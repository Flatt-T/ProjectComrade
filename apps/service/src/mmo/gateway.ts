// MMO WebSocket gateway (PW08): the `/mmo` endpoint that connects browsers to
// authoritative regions. A subscriber gets a versioned snapshot plus the ordered
// sim-command stream; commands go through submitCommand under the region fence and
// results return on the same journal position. The whole gateway is inert unless
// MMO_DATABASE_URL is configured — classic `/ws` play is untouched.
//
// Authentication: the upgrade cookies identify the player. A valid platform session
// maps to the account; otherwise the signed guest cookie maps to a derived guest
// identity. The client never asserts its own playerId — the server injects it.
//
// Visibility: the beta client runs the same deterministic sim, so the snapshot
// necessarily contains full engine state including other players' hidden units.
// Fog of war is enforced at render time only; this exposure is documented in
// docs/persistent-world/DECISIONS.md (DEC-IMPL-9).
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  MMO_CAPABILITIES_MILESTONE1, MMO_DECISIONS_OPEN, MMO_PROTOCOL, MMO_RULESET_ID,
  PERSISTENT_RULES_V1, parseMmoClientMessage,
  type MmoCommandResult, type MmoServerMessage, type MmoWorldConfig,
} from '@comrade/contracts';
import { mmoOne } from './db.js';
import { journalTail } from './commands.js';
import { submitCommand } from './commands.js';
import { MmoStoreError, playerConnected, playerDisconnected, playersSeen } from './store.js';
import { dispatchOutbox, type OutboxEnvelope } from './bus.js';
import { identityUuid, type RegionIdentity, type RegionService } from './regions.js';
import { guestIdFromCookieHeader, parseSessionCookie } from '../auth.js';
import { authEnabled } from '../config.js';
import * as cognito from '../cognito.js';
import { accountBySub } from '../accounts.js';
import { log } from '../ops.js';

const OBSERVE_MS = 2_000;
const DISPATCH_MS = 250;
const MAX_SUBSCRIPTIONS = 4;

interface Sub { regionId: string; playerId: string; slot: number | null }

interface Conn {
  ws: WebSocket;
  id: string;
  identity?: RegionIdentity;
  sessionId: string;
  subs: Map<string, Sub>;
  /** Durable player ids this socket currently holds presence for (PW09). */
  present: Set<string>;
  lastPresenceSweep: number;
  messages: number;
  interval?: ReturnType<typeof setInterval>;
}

function send(ws: WebSocket, message: MmoServerMessage) {
  if (ws.readyState !== ws.OPEN) return;
  try { ws.send(JSON.stringify(message)); } catch { /* socket died mid-send */ }
}
function sendError(ws: WebSocket, code: string, message: string) {
  send(ws, { protocol: MMO_PROTOCOL, type: 'error', code, message });
}

/** Resolve the connection's durable identity from its upgrade cookies. */
async function resolveIdentity(header: string | undefined): Promise<RegionIdentity | undefined> {
  const sessionRaw = /(?:^|;\s*)cmrd_session=([^;]+)/.exec(header ?? '')?.[1];
  if (sessionRaw && authEnabled()) {
    try {
      const parsed = parseSessionCookie(decodeURIComponent(sessionRaw));
      const tokens = await cognito.refresh(parsed.refreshToken, parsed.username);
      const user = await cognito.getUser(tokens.accessToken);
      if (user.sub) {
        const account = await accountBySub(user.sub);
        if (account) {
          return {
            accountId: account.id,
            displayName: account.display_name || account.handle || 'Commander',
            kind: 'account',
          };
        }
      }
    } catch { /* fall through to guest identity */ }
  }
  const guest = guestIdFromCookieHeader(header);
  if (guest) {
    return { accountId: identityUuid('guest', guest), displayName: `Guest-${guest.slice(0, 6)}`, kind: 'guest' };
  }
  return undefined;
}

export class MmoGateway {
  private wss: WebSocketServer;
  private conns = new Set<Conn>();
  private service: RegionService;
  private observeTimer?: ReturnType<typeof setInterval>;
  private dispatchTimer?: ReturnType<typeof setInterval>;
  private readonly workerId = randomUUID();

  constructor(service: RegionService) {
    this.service = service;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 262144 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  /** Upgrade handler for the main HTTP server (path '/mmo'). */
  handleUpgrade(req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) {
    this.wss.handleUpgrade(req, socket, head, ws => this.wss.emit('connection', ws, req));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    ws.on('error', () => ws.terminate());
    const conn: Conn = {
      ws, id: randomUUID().slice(0, 8), sessionId: randomUUID(),
      subs: new Map(), present: new Set(), lastPresenceSweep: 0, messages: 0,
    };
    this.conns.add(conn);
    conn.interval = setInterval(() => {
      conn.messages = 0;
      // Presence heartbeat (PW09): an open socket with a live sweep counts as
      // online; last_seen refreshes at most once per 5 s per connection.
      if (conn.present.size && Date.now() - conn.lastPresenceSweep >= 5_000) {
        conn.lastPresenceSweep = Date.now();
        void playersSeen([...conn.present], conn.lastPresenceSweep).catch(() => undefined);
      }
    }, 1000);
    log('mmo-connect', { peer: conn.id });

    void resolveIdentity(req.headers.cookie).then(identity => {
      conn.identity = identity;
      if (!identity) sendError(ws, 'UNAUTHENTICATED', 'Sign in or allow guest play to enter the persistent world');
    });

    ws.on('message', data => {
      if (++conn.messages > 30) { ws.close(1008, 'Message rate exceeded'); return; }
      void this.onMessage(conn, data.toString());
    });
    ws.on('close', () => {
      if (conn.interval) clearInterval(conn.interval);
      this.conns.delete(conn);
      // PW09: dropping the last socket starts the offline grace period; other
      // live sockets for the same account keep the player online.
      const now = Date.now();
      for (const playerId of conn.present) {
        void playerDisconnected(playerId, now).catch(() => undefined);
      }
      log('mmo-disconnect', { peer: conn.id, presence: conn.present.size });
    });
  }

  private async onMessage(conn: Conn, raw: string) {
    let message;
    try { message = parseMmoClientMessage(JSON.parse(raw)); }
    catch (error) { sendError(conn.ws, 'BAD_MESSAGE', String(error).slice(0, 120)); return; }
    try {
      if (message.type === 'subscribe') await this.subscribe(conn, message.regionId, message.seenEpoch);
      else if (message.type === 'command') await this.command(conn, message);
    } catch (error) {
      if (error instanceof MmoStoreError) sendError(conn.ws, error.code, error.message);
      else sendError(conn.ws, 'INTERNAL', String(error).slice(0, 160));
    }
  }

  private async subscribe(conn: Conn, regionId: string, seenEpoch: string) {
    if (!conn.identity) { sendError(conn.ws, 'UNAUTHENTICATED', 'No durable identity'); return; }
    // PW09 / COMRADE 18: guests cannot own a persistent base. When platform auth
    // is configured the derived guest identity is rejected; auth-disabled dev
    // deployments (and MMO_ALLOW_GUESTS=1) keep guest subscriptions for testing.
    if (conn.identity.kind === 'guest' && authEnabled() && process.env.MMO_ALLOW_GUESTS !== '1') {
      sendError(conn.ws, 'GUEST_NOT_ALLOWED', 'Persistent worlds require a registered account');
      return;
    }
    if (conn.subs.size >= MAX_SUBSCRIPTIONS && !conn.subs.has(regionId)) {
      sendError(conn.ws, 'TOO_MANY_REGIONS', 'Subscription limit reached'); return;
    }
    const region = await this.service.regionInfo(regionId);
    if (!region) { sendError(conn.ws, 'NO_REGION', 'Unknown region'); return; }

    const runner = await this.service.ensure(regionId);
    if (!runner || !runner.currentGame) { sendError(conn.ws, 'REGION_UNAVAILABLE', 'Region runner is not live'); return; }
    const epoch = runner.authorityEpoch ?? '0';
    if (seenEpoch !== '0' && BigInt(seenEpoch) !== BigInt(epoch)) {
      sendError(conn.ws, 'STALE_EPOCH', 'Region authority changed; resubscribe for a fresh snapshot');
      return;
    }

    const player = await this.service.playerFor(conn.identity, region.world_id);
    const slot = runner.slotForPlayer(player.player_id) ?? null;
    conn.subs.set(regionId, { regionId, playerId: player.player_id, slot });
    // PW09 presence: one authenticated socket with a live heartbeat per count.
    // Re-subscribing on the same socket does not double-count.
    if (!conn.present.has(player.player_id)) {
      conn.present.add(player.player_id);
      const now = Date.now();
      await playerConnected(player.player_id, now).catch(() => undefined);
      conn.lastPresenceSweep = now;
    }

    const world = await mmoOne<{
      ruleset_version: number;
      capabilities: Partial<MmoWorldConfig['capabilities']>;
      decisions: Partial<MmoWorldConfig['decisions']>;
    }>('select ruleset_version, capabilities, decisions from world where world_id = $1', [region.world_id]);
    const config: MmoWorldConfig = {
      protocol: MMO_PROTOCOL, rulesetId: MMO_RULESET_ID,
      rulesetVersion: world?.ruleset_version ?? 1, profile: PERSISTENT_RULES_V1,
      capabilities: { ...MMO_CAPABILITIES_MILESTONE1, ...(world?.capabilities ?? {}) },
      decisions: { ...MMO_DECISIONS_OPEN, ...(world?.decisions ?? {}) },
    };

    const snap = await this.service.snapshotFor(regionId);
    if (!snap) { sendError(conn.ws, 'SNAPSHOT_FAILED', 'Could not capture region state'); return; }

    send(conn.ws, {
      protocol: MMO_PROTOCOL, type: 'welcome', playerId: player.player_id,
      sessionId: conn.sessionId, config, regions: [...conn.subs.keys()],
      slots: [...conn.subs.values()].map(s => s.slot),
    });
    send(conn.ws, snap.header);
    log('mmo-subscribe', { peer: conn.id, regionId: regionId.slice(0, 8), slot });
  }

  private async command(conn: Conn, message: {
    commandId: string; regionId: string; seenEpoch: string; action: unknown;
  }) {
    const sub = conn.subs.get(message.regionId);
    if (!sub) { sendError(conn.ws, 'NOT_SUBSCRIBED', 'Subscribe to the region before sending commands'); return; }
    const fence = await this.service.fenceFor(message.regionId);
    if (!fence) { sendError(conn.ws, 'REGION_UNAVAILABLE', 'Region runner is not live'); return; }
    const tail = await journalTail(message.regionId);
    const tick = tail ? BigInt(tail.tick) : 0n;
    const result = await submitCommand({
      playerId: sub.playerId,
      rawMessage: {
        protocol: MMO_PROTOCOL, type: 'command', commandId: message.commandId,
        regionId: message.regionId, seenEpoch: message.seenEpoch,
        lastSeenEventSeq: '0', action: message.action,
      },
      fence, tick,
    });
    const ack: MmoCommandResult = {
      protocol: MMO_PROTOCOL, type: 'commandResult', commandId: message.commandId,
      status: 'committed_pending_application',
      regionId: message.regionId, epoch: fence.epoch,
      eventSeq: result.eventSeq ?? null, tick: tick.toString(),
    };
    send(conn.ws, ack);
  }

  /** Route one delivered outbox envelope to subscribed sockets. */
  private publish(envelope: OutboxEnvelope) {
    const message = this.toClientMessage(envelope);
    if (!message) return; // topics not destined for browsers are acked and dropped here
    for (const conn of this.conns) {
      if (!conn.subs.has(envelope.regionId)) continue;
      try { send(conn.ws, message); } catch { conn.ws.terminate(); }
    }
  }

  private toClientMessage(envelope: OutboxEnvelope): MmoServerMessage | null {
    const payload = envelope.payload as Record<string, unknown>;
    const epoch = String(payload.epoch ?? '0');
    if (envelope.topic === 'mmo.sim') {
      return {
        protocol: MMO_PROTOCOL, type: 'event', regionId: envelope.regionId,
        eventSeq: envelope.eventSeq, epoch, tick: String(payload.atTick ?? 0),
        eventKind: 'sim', payload,
      };
    }
    if (envelope.topic === 'mmo.result') {
      const result: MmoCommandResult = {
        protocol: MMO_PROTOCOL, type: 'commandResult',
        commandId: String(payload.commandId ?? ''), status: 'applied',
        regionId: envelope.regionId, epoch,
        eventSeq: envelope.eventSeq, tick: payload.tick !== undefined ? String(payload.tick) : null,
        result: payload.result,
      };
      return result;
    }
    return null;
  }

  /** Push authoritative observations so clients can verify their sim checksum. */
  private observe() {
    for (const conn of this.conns) {
      for (const regionId of conn.subs.keys()) {
        void this.service.observationFor(regionId).then(obs => {
          if (obs) send(conn.ws, {
            protocol: MMO_PROTOCOL, type: 'observation', regionId,
            epoch: obs.epoch, tick: String(obs.tick), checksum: obs.checksum,
          });
        });
      }
    }
  }

  /** Start the outbox dispatcher and observation heartbeat. Idempotent. */
  start() {
    if (this.dispatchTimer) return;
    this.dispatchTimer = setInterval(() => {
      void dispatchOutbox({
        workerId: this.workerId, publish: env => this.publish(env), limit: 128,
      }).catch(error => log('mmo-dispatch-error', { error: String(error).slice(0, 200) }));
    }, DISPATCH_MS);
    this.dispatchTimer.unref?.();
    this.observeTimer = setInterval(() => this.observe(), OBSERVE_MS);
    this.observeTimer.unref?.();
  }

  async stop() {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.observeTimer) clearInterval(this.observeTimer);
    for (const conn of this.conns) conn.ws.terminate();
    this.conns.clear();
  }
}
