// PW08 integration tests: the /mmo WebSocket gateway against REAL PostgreSQL, a REAL
// RegionRunner and REAL WebSocket clients. Covers guest identity provisioning,
// welcome+snapshot delivery, the ordered sim-command stream, command results,
// authoritative observations, stale-epoch rejection and reconnect resubscribe.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { createServer, type Server } from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { submitCommand } from '../../apps/service/src/mmo/commands.js';
import { MmoGateway } from '../../apps/service/src/mmo/gateway.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { journalTail } from '../../apps/service/src/mmo/commands.js';
import { MMO_PROTOCOL, type MmoServerMessage } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 8000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

function guestCookie(): string {
  const id = randomBytes(12).toString('base64url');
  const mac = createHmac('sha256', process.env.COMRADE_GUEST_SECRET!)
    .update(id).digest('base64url').slice(0, 24);
  return `cmrd_guest=${id}.${mac}`;
}

interface Client {
  ws: WebSocket;
  messages: MmoServerMessage[];
  send(payload: object): void;
  close(): void;
}

async function connect(port: number, cookie = guestCookie()): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mmo`, {
    headers: { cookie },
  });
  const messages: MmoServerMessage[] = [];
  ws.on('message', data => {
    try { messages.push(JSON.parse(data.toString()) as MmoServerMessage); } catch { /* ignore */ }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return {
    ws, messages,
    send: payload => ws.send(JSON.stringify({ protocol: MMO_PROTOCOL, ...payload })),
    close: () => ws.close(),
  };
}

const ofType = <T extends MmoServerMessage['type']>(messages: MmoServerMessage[], type: T) =>
  messages.filter(m => m.type === type) as Extract<MmoServerMessage, { type: T }>[];

describeDb('mmo gateway (real PostgreSQL + real WebSocket)', () => {
  let fx: FixtureWorld;
  let service: RegionService;
  let gateway: MmoGateway;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    process.env.COMRADE_GUEST_SECRET = 'mmo-gateway-test-secret';
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    fx = await seedFixtureWorld({ leaseMs: 300_000 });
    // The service owns its own runner worker id — release the fixture lease so it can
    // take the fence (the runner then renews it itself).
    await releaseRegionLease(fx.regionId, fx.workerId);

    service = new RegionService({
      runner: { tickMs: TICK_MS, pollMs: 20, leaseMs: 60_000, log: () => undefined },
      log: () => undefined,
    });
    gateway = new MmoGateway(service);
    gateway.start();
    server = createServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/mmo')) gateway.handleUpgrade(req, socket, head);
      else socket.destroy();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  }, 30_000);

  afterAll(async () => {
    await gateway.stop();
    await new Promise(resolve => server.close(resolve));
    await service.stopAll();
    await closeMmoDatabase();
  });

  it('welcomes a guest, provisions a durable player and streams snapshot + observations', async () => {
    const client = await connect(port);
    try {
      client.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
      await waitFor(() => ofType(client.messages, 'snapshot').length === 1);

      const welcomes = ofType(client.messages, 'welcome');
      expect(welcomes).toHaveLength(1);
      const welcome = welcomes[0];
      expect(welcome.playerId).toMatch(/^[0-9a-f-]{36}$/);
      expect(welcome.config.protocol).toBe(MMO_PROTOCOL);
      expect(welcome.config.capabilities.notifications).toBe(true);
      expect(welcome.config.decisions.paid_tiers).toBe('open');

      const snap = ofType(client.messages, 'snapshot')[0];
      expect(snap.regionId).toBe(fx.regionId);
      expect(BigInt(snap.lastAppliedSeq)).toBeGreaterThanOrEqual(0n);
      const state = snap.state as { v: number; seed: number; snapshot: string; bindings: [string, number][]; tick: number };
      expect(state.v).toBe(1);
      expect(typeof state.snapshot).toBe('string');
      expect(state.snapshot.length).toBeGreaterThan(100);
      expect(state.tick).toBeGreaterThanOrEqual(0);

      // The durable player row was provisioned and joined to the world.
      const player = await mmoOne<{ player_id: string }>(
        'select player_id from player where player_id = $1', [welcome.playerId]);
      expect(player?.player_id).toBe(welcome.playerId);

      // Authoritative observations flow to subscribers for checksum verification.
      await waitFor(() => ofType(client.messages, 'observation').length > 0, 10_000);
      const obs = ofType(client.messages, 'observation')[0];
      expect(obs.regionId).toBe(fx.regionId);
      expect(typeof obs.checksum).toBe('number');
    } finally {
      client.close();
    }
  });

  it('streams resolved sim commands and applied results to subscribers in order', async () => {
    const client = await connect(port);
    try {
      client.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
      await waitFor(() => ofType(client.messages, 'snapshot').length === 1);
      const fence = await service.fenceFor(fx.regionId);
      expect(fence).toBeTruthy();
      const tail = await journalTail(fx.regionId);
      const tick = tail ? BigInt(tail.tick) : 0n;

      // A journaled command from a fixture player resolves through the runner and its
      // sim intent fans out to every subscriber as an ordered mmo.sim event.
      const commandId = randomUUID();
      const res = await submitCommand({
        playerId: fx.players[0].playerId,
        rawMessage: {
          protocol: MMO_PROTOCOL, type: 'command', commandId, regionId: fx.regionId,
          seenEpoch: fence!.epoch, lastSeenEventSeq: '0',
          action: { t: 'rally', x: 7, y: 8 },
        },
        fence: fence!, tick,
      });
      expect(res.status).toBe('committed');

      await waitFor(() =>
        ofType(client.messages, 'event').some(e => e.eventKind === 'sim')
        && ofType(client.messages, 'commandResult').some(r => r.commandId === commandId && r.status === 'applied'),
      10_000);

      const simEvents = ofType(client.messages, 'event').filter(e => e.eventKind === 'sim');
      const ours = simEvents.find(e =>
        (e.payload as { command?: { t?: string } }).command?.t === 'rally');
      expect(ours).toBeTruthy();
      const payload = ours!.payload as { atTick: number; slot: number; command: { t: string; x?: number; y?: number } };
      expect(payload.command.t).toBe('rally');
      expect(payload.command.x).toBe(7);
      expect(payload.command.y).toBe(8);
      expect(payload.slot).toBe(0);

      const applied = ofType(client.messages, 'commandResult')
        .find(r => r.commandId === commandId && r.status === 'applied');
      expect(applied).toBeTruthy();
    } finally {
      client.close();
    }
  });

  it('rejects commands from players with no sim slot and stale epochs', async () => {
    const client = await connect(port);
    try {
      // Stale epoch on subscribe is refused before any snapshot is sent.
      client.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '987654', lastSeenEventSeq: '0' });
      await waitFor(() => ofType(client.messages, 'error').some(e => e.code === 'STALE_EPOCH'));

      // A fresh subscribe provisions the guest player — who is not in the sim roster —
      // so their command is journaled, applied and rejected authoritatively.
      client.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
      await waitFor(() => ofType(client.messages, 'snapshot').length === 1);

      const commandId = randomUUID();
      client.send({
        type: 'command', commandId, regionId: fx.regionId,
        seenEpoch: ofType(client.messages, 'snapshot')[0].epoch,
        lastSeenEventSeq: '0',
        action: { t: 'rally', x: 1, y: 2 },
      });
      await waitFor(() =>
        ofType(client.messages, 'commandResult').some(r => r.commandId === commandId && r.status === 'applied'),
        10_000);
      const result = ofType(client.messages, 'commandResult')
        .find(r => r.commandId === commandId && r.status === 'applied');
      expect(JSON.stringify(result?.result)).toContain('UNKNOWN_PLAYER');
    } finally {
      client.close();
    }
  });

  it('reconnects with a fresh snapshot and keeps the same durable player', async () => {
    const cookie = guestCookie();
    const first = await connect(port, cookie);
    first.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
    await waitFor(() => ofType(first.messages, 'welcome').length === 1);
    const playerId = ofType(first.messages, 'welcome')[0].playerId;
    const firstEpoch = ofType(first.messages, 'snapshot')[0].epoch;
    first.close();
    await sleep(50);

    // The same signed guest cookie re-identifies to the same durable player; the
    // resubscribe carries the last seen epoch and gets a fresh authoritative snapshot.
    const second = await connect(port, cookie);
    try {
      second.send({
        type: 'subscribe', regionId: fx.regionId,
        seenEpoch: firstEpoch, lastSeenEventSeq: '0',
      });
      await waitFor(() => ofType(second.messages, 'snapshot').length === 1);
      const welcome = ofType(second.messages, 'welcome')[0];
      expect(welcome.playerId).toBe(playerId);
      const snap = ofType(second.messages, 'snapshot')[0];
      expect(snap.regionId).toBe(fx.regionId);
      expect((snap.state as { snapshot: string }).snapshot.length).toBeGreaterThan(100);
    } finally {
      second.close();
    }
  });
});
