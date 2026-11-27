// PW32 (THU-2443): an accepted Engineer consent is a regional sim effect, but
// its request identity and grant history belong to the two participants.
// REAL PostgreSQL, REAL RegionRunner, REAL gateway and WebSocket clients:
// owner + requester (allied) and an unrelated observer. Asserts the actual
// outbound frames and fresh snapshots each socket receives before and after
// the grant is consumed, and that the observer's redacted engine state still
// converges with the authority through the consented capture.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { createServer, type Server } from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase } from '../../apps/service/src/mmo/db.js';
import { allianceMembers, releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { MmoGateway } from '../../apps/service/src/mmo/gateway.js';
import { RegionService, identityUuid } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { grantToken, snapshotStateFor } from '../../apps/service/src/mmo/grant-privacy.js';
import { registryPacks, restoreGame } from '../../packages/fusion/src/index.js';
import {
  MMO_PROTOCOL, mmoEntityId, type MmoServerMessage, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
// Tick and poll share one busy guard; equal intervals phase-lock and starve
// the poll that applies commands. Match the routing suite's 5 ms tick.
const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 15_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Client { ws: WebSocket; raw: string[]; messages: MmoServerMessage[]; send(p: object): void; close(): void }

async function connect(port: number, cookie: string): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mmo`, { headers: { cookie } });
  const raw: string[] = [];
  const messages: MmoServerMessage[] = [];
  ws.on('message', data => {
    const text = data.toString();
    raw.push(text);
    try { messages.push(JSON.parse(text) as MmoServerMessage); } catch { /* ignore */ }
  });
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
  return {
    ws, raw, messages,
    send: p => ws.send(JSON.stringify({ protocol: MMO_PROTOCOL, ...p })),
    close: () => ws.close(),
  };
}

const ofType = <T extends MmoServerMessage['type']>(messages: MmoServerMessage[], type: T) =>
  messages.filter(m => m.type === type) as Extract<MmoServerMessage, { type: T }>[];
const results = (c: Client, commandId: string) =>
  ofType(c.messages, 'commandResult').filter(r => r.status === 'applied' && r.commandId === commandId);
const grants = (c: Client) =>
  ofType(c.messages, 'event').filter(e => e.eventKind === 'sim'
    && (e.payload as { command?: { t?: string } }).command?.t === 'consentGrant')
    .map(e => (e.payload as { command: { requestId: string; engineer: number; building: number; owner: number; requester: number; ownerGen: number } }).command);
const snapshotEngine = (c: Client) => {
  const snaps = ofType(c.messages, 'snapshot');
  const state = snaps[snaps.length - 1].state as { snapshot: string };
  return JSON.parse(state.snapshot) as { state: { consents?: { requestId: string; used: boolean }[] } };
};

describeDb('mmo consent grant privacy (PW32, real PostgreSQL + gateway + WebSocket)', () => {
  let fx: FixtureWorld;
  let service: RegionService;
  let gateway: MmoGateway;
  let server: Server;
  let port: number;
  const clients: Client[] = [];

  async function playerCookie(i: number) {
    const id = randomBytes(12).toString('base64url');
    await mmoQuery('update player set account_id = $1 where player_id = $2',
      [identityUuid('guest', id), fx.players[i].playerId]);
    const mac = createHmac('sha256', process.env.COMRADE_GUEST_SECRET!).update(id).digest('base64url').slice(0, 24);
    return { cookie: `cmrd_guest=${id}.${mac}`, playerId: fx.players[i].playerId };
  }

  async function open(cookie: string) {
    const c = await connect(port, cookie);
    clients.push(c);
    const before = ofType(c.messages, 'snapshot').length;
    c.send({ type: 'subscribe', regionId: fx.regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
    await waitFor(() => ofType(c.messages, 'snapshot').length > before);
    return c;
  }

  async function act(c: Client, action: MmoWorldAction | Record<string, unknown>) {
    const commandId = randomUUID();
    const epoch = ofType(c.messages, 'snapshot')[0]?.epoch ?? '0';
    c.send({ type: 'command', commandId, regionId: fx.regionId, seenEpoch: epoch, lastSeenEventSeq: '0', action });
    await waitFor(() => results(c, commandId).length === 1);
    return results(c, commandId)[0].result as { accepted?: boolean; reason?: string; [k: string]: unknown };
  }

  beforeAll(async () => {
    process.env.COMRADE_GUEST_SECRET = 'mmo-grant-privacy-test-secret';
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  }, 30_000);

  beforeEach(async () => {
    fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 3, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20, leaseMs: 60_000, log: () => undefined }, log: () => undefined });
    gateway = new MmoGateway(service);
    gateway.start();
    server = createServer();
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/mmo')) gateway.handleUpgrade(req, socket, head); else socket.destroy();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  }, 30_000);

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await gateway.stop();
    await new Promise(resolve => server.close(resolve));
    await service.stopAll();
  });

  afterAll(() => closeMmoDatabase());

  it('scopes the request identity and grant history to the owner and requester', async () => {
    const owner = await playerCookie(0);
    const requester = await playerCookie(1);
    const observer = await playerCookie(2);
    const o = await open(owner.cookie);
    const r = await open(requester.cookie);
    const x = await open(observer.cookie);
    const runner = (await service.ensure(fx.regionId))!;
    const game = runner.currentGame!;
    const ownerSlot = runner.slotForPlayer(owner.playerId)!;
    const requesterSlot = runner.slotForPlayer(requester.playerId)!;
    const observerSlot = runner.slotForPlayer(observer.playerId)!;
    expect(new Set([ownerSlot, requesterSlot, observerSlot]).size).toBe(3);

    // Alliance between owner and requester; the observer stays unrelated.
    const created = await act(o, { t: 'allianceCreate', name: 'GrantPrivacy' });
    const allianceId = created.allianceId as string;
    expect((await act(o, { t: 'allianceInvite', allianceId, playerId: requester.playerId })).accepted).toBe(true);
    expect((await act(r, { t: 'allianceJoin', allianceId })).accepted).toBe(true);
    await waitFor(async () => (await allianceMembers(allianceId)).some(m => m.player_id === requester.playerId));

    const bld = game.spawnStructure('pyle', ownerSlot, 60, 60);
    const eng = game.spawnUnit('engineer', requesterSlot, game.cellIndex(62, 61));
    eng.path = []; eng.order = 'idle';
    const buildingId = mmoEntityId(fx.regionId, bld.id);
    const engineerId = mmoEntityId(fx.regionId, eng.id);

    const requested = await act(r, { t: 'engineerRequest', buildingId, engineerId });
    expect(requested.accepted).toBe(true);
    const requestId = requested.requestId as string;
    expect((await act(o, { t: 'engineerConsent', requestId, decision: 'accept' })).accepted).toBe(true);
    await waitFor(() => game.consents.some(c => c.requestId === requestId));
    await waitFor(() => grants(o).length === 1 && grants(r).length === 1 && grants(x).length === 1);

    // Live frames: participants get the real grant, the observer the opaque one
    // with every simulation-relevant field intact.
    const token = grantToken(fx.regionId, requestId);
    expect(grants(o)[0].requestId).toBe(requestId);
    expect(grants(r)[0].requestId).toBe(requestId);
    const seen = grants(x)[0];
    expect(seen.requestId).toBe(token);
    expect(seen).toMatchObject({ engineer: eng.id, building: bld.id, owner: ownerSlot, requester: requesterSlot });

    // Fresh snapshots while the grant is live.
    const x2 = await open(observer.cookie);
    const o2 = await open(owner.cookie);
    expect(snapshotEngine(x2).state.consents?.map(c => c.requestId)).toEqual([token]);
    expect(snapshotEngine(o2).state.consents?.map(c => c.requestId)).toEqual([requestId]);

    // Convergence: the observer's redacted engine state performs the same
    // consented capture as the authority, tick for tick.
    const state = runner.captureState()!;
    const packs = registryPacks();
    const full = restoreGame(state.snapshot, packs);
    const redacted = restoreGame(snapshotStateFor(state, fx.regionId, observerSlot).snapshot, packs);
    for (const g of [full, redacted]) g.enqueue(requesterSlot, { t: 'enter', ids: [eng.id], target: bld.id }, g.tick + 1);
    for (let i = 0; i < 160 && full.entities.get(bld.id)!.owner !== requesterSlot; i++) {
      full.step(); redacted.step();
      expect(redacted.checksum()).toBe(full.checksum());
    }
    expect(full.entities.get(bld.id)!.owner).toBe(requesterSlot);
    expect(redacted.entities.get(bld.id)!.owner).toBe(requesterSlot);

    // Consume the grant on the authority through the journaled enter order.
    expect((await act(r, { t: 'enter', entityIds: [engineerId], targetId: buildingId })).accepted).toBe(true);
    await waitFor(() => bld.owner === requesterSlot, 20_000);
    await waitFor(async () => (await mmoOne<{ state: string }>(
      'select state from engineer_consent where request_id = $1', [requestId]))?.state === 'consumed', 20_000);

    // After consumption: the observer's fresh snapshot carries no grant history
    // while the participants still see their own record.
    const x3 = await open(observer.cookie);
    const r3 = await open(requester.cookie);
    expect(snapshotEngine(x3).state.consents ?? []).toEqual([]);
    expect(snapshotEngine(r3).state.consents?.some(c => c.requestId === requestId && c.used)).toBe(true);

    // Byte-level: the request id never reached any observer socket.
    for (const c of [x, x2, x3]) expect(c.raw.some(frame => frame.includes(requestId))).toBe(false);
    // The public result — the ownership change — is still what the observer sees.
    expect(bld.owner).toBe(requesterSlot);
  }, 90_000);
});
