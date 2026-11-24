// PW32 integration tests: private routing at the transport boundary — REAL
// PostgreSQL, REAL RegionRunner and REAL WebSocket clients. Rostered fixture
// players are bound to signed guest cookies so their sockets carry real sim
// slots; assertions check exactly which sockets receive region-public sim/chat,
// alliance-private chat, player-private command results and reserved two-party
// 'private' events — including after membership removal and on a second session.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { createServer, type Server } from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { allianceMembers, createRegion, releaseRegionLease, setRegionLifecycle } from '../../apps/service/src/mmo/store.js';
import { MmoGateway } from '../../apps/service/src/mmo/gateway.js';
import { RegionService, identityUuid } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import {
  MMO_PROTOCOL, type MmoServerMessage, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Client {
  ws: WebSocket;
  messages: MmoServerMessage[];
  send(payload: object): void;
  close(): void;
}

async function connect(port: number, cookie: string): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mmo`, { headers: { cookie } });
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

const chats = (c: Client, text?: string) =>
  ofType(c.messages, 'event').filter(e => e.eventKind === 'chat')
    .filter(e => text === undefined || (e.payload as { text?: string }).text === text);
const privates = (c: Client, kind?: string) =>
  ofType(c.messages, 'event').filter(e => e.eventKind === 'private')
    .filter(e => kind === undefined || (e.payload as { kind?: string }).kind === kind);
const results = (c: Client, commandId?: string) =>
  ofType(c.messages, 'commandResult')
    .filter(r => r.status === 'applied')
    .filter(r => commandId === undefined || r.commandId === commandId);
const epochOf = (c: Client) => ofType(c.messages, 'snapshot')[0]?.epoch ?? '0';

describeDb('mmo private routing (real PostgreSQL + gateway + WebSocket)', () => {
  let fx: FixtureWorld;
  let service: RegionService;
  let gateway: MmoGateway;
  let server: Server;
  let port: number;
  const clients: Client[] = [];

  /** Signed guest cookie whose derived account is rebound to fixture player `i`. */
  async function playerCookie(i: number): Promise<{ cookie: string; playerId: string }> {
    const id = randomBytes(12).toString('base64url');
    const accountId = identityUuid('guest', id);
    await mmoQuery('update player set account_id = $1 where player_id = $2',
      [accountId, fx.players[i].playerId]);
    const mac = createHmac('sha256', process.env.COMRADE_GUEST_SECRET!)
      .update(id).digest('base64url').slice(0, 24);
    return { cookie: `cmrd_guest=${id}.${mac}`, playerId: fx.players[i].playerId };
  }

  async function subscribe(client: Client, regionId = fx.regionId) {
    client.send({ type: 'subscribe', regionId, seenEpoch: '0', lastSeenEventSeq: '0' });
    await waitFor(() => ofType(client.messages, 'snapshot').length === 1);
    return ofType(client.messages, 'welcome')[0];
  }

  function command(client: Client, action: MmoWorldAction | Record<string, unknown>): string {
    const commandId = randomUUID();
    client.send({
      type: 'command', commandId, regionId: fx.regionId,
      seenEpoch: epochOf(client), lastSeenEventSeq: '0', action,
    });
    return commandId;
  }

  async function formAlliance(founder: Client, member: Client, memberId: string) {
    const createId = command(founder, { t: 'allianceCreate', name: 'RouteGuild' });
    await waitFor(() => results(founder, createId).length === 1);
    const created = results(founder, createId)[0].result as { accepted?: boolean; allianceId?: string };
    expect(created.accepted).toBe(true);
    const allianceId = created.allianceId!;
    expect(allianceId).toBeTruthy();

    const inviteId = command(founder, { t: 'allianceInvite', allianceId, playerId: memberId });
    await waitFor(() => results(founder, inviteId).length === 1);
    expect(results(founder, inviteId)[0].result).toMatchObject({ accepted: true });
    const joinId = command(member, { t: 'allianceJoin', allianceId });
    await waitFor(() => results(member, joinId).length === 1);
    expect(results(member, joinId)[0].result).toMatchObject({ accepted: true });
    await waitFor(async () => (await allianceMembers(allianceId)).some(m => m.player_id === memberId));
    return allianceId;
  }

  beforeAll(async () => {
    process.env.COMRADE_GUEST_SECRET = 'mmo-private-routing-test-secret';
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  }, 30_000);

  beforeEach(async () => {
    fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 3, mapId: 'td-tiberium-gardens' });
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

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await gateway.stop();
    await new Promise(resolve => server.close(resolve));
    await service.stopAll();
  });

  afterAll(() => closeMmoDatabase());

  it('routes region chat publicly but alliance chat only to current members — both sessions', async () => {
    const alice = await playerCookie(0);
    const bob = await playerCookie(1);
    const carol = await playerCookie(2);
    const a1 = await connect(port, alice.cookie); clients.push(a1);
    const a2 = await connect(port, alice.cookie); clients.push(a2); // second session, same player
    const b = await connect(port, bob.cookie); clients.push(b);
    const c = await connect(port, carol.cookie); clients.push(c);

    const [wa1, wa2, wb, wc] = await Promise.all([subscribe(a1), subscribe(a2), subscribe(b), subscribe(c)]);
    expect(wa1.playerId).toBe(alice.playerId);
    expect(wa2.playerId).toBe(alice.playerId);
    expect(wb.playerId).toBe(bob.playerId);
    expect(wc.playerId).toBe(carol.playerId);
    expect(wa1.slots?.[0]).toBe(0);

    // Region channel: every subscriber receives it.
    command(a1, { t: 'chat', channel: 'region', text: 'all-hands' });
    await waitFor(() => chats(a1, 'all-hands').length === 1, 20_000);
    await waitFor(() => chats(a2, 'all-hands').length === 1
      && chats(b, 'all-hands').length === 1 && chats(c, 'all-hands').length === 1, 20_000);

    await formAlliance(a1, b, bob.playerId);

    // Alliance chat: alice's both sessions + bob receive; carol never does.
    command(a1, { t: 'chat', channel: 'alliance', text: 'ally-secret' });
    await waitFor(() => chats(a1, 'ally-secret').length === 1);
    await waitFor(() => chats(a2, 'ally-secret').length === 1 && chats(b, 'ally-secret').length === 1);
    await sleep(500);
    expect(chats(c, 'ally-secret')).toHaveLength(0);
  }, 60_000);

  it('delivers command results only to the issuing player\'s sessions', async () => {
    const alice = await playerCookie(0);
    const bob = await playerCookie(1);
    const carol = await playerCookie(2);
    const a1 = await connect(port, alice.cookie); clients.push(a1);
    const a2 = await connect(port, alice.cookie); clients.push(a2);
    const b = await connect(port, bob.cookie); clients.push(b);
    const c = await connect(port, carol.cookie); clients.push(c);
    await Promise.all([subscribe(a1), subscribe(a2), subscribe(b), subscribe(c)]);

    // Bob issues a command; only his sessions may see its result.
    const bobCmd = command(b, { t: 'chat', channel: 'region', text: 'bob-private-msg' });
    await waitFor(() => results(b, bobCmd).length === 1);
    await sleep(500);
    expect(results(a1, bobCmd)).toHaveLength(0);
    expect(results(a2, bobCmd)).toHaveLength(0);
    expect(results(c, bobCmd)).toHaveLength(0);
    // The same region chat is still public to everyone.
    await waitFor(() => chats(a1, 'bob-private-msg').length === 1 && chats(c, 'bob-private-msg').length === 1);
  }, 30_000);

  it('withholds alliance chat from a member removed before delayed delivery', async () => {
    const alice = await playerCookie(0);
    const bob = await playerCookie(1);
    const a1 = await connect(port, alice.cookie); clients.push(a1);
    const b = await connect(port, bob.cookie); clients.push(b);
    await Promise.all([subscribe(a1), subscribe(b)]);
    const allianceId = await formAlliance(a1, b, bob.playerId);

    // Journal an alliance-chat outbox row deliverable in ~3 s, then remove bob
    // before dispatch can claim it. Delivery-time membership must exclude him.
    const seq = await mmoOne<{ n: string }>(
      'select max(event_seq)::text as n from region_event where region_id = $1', [fx.regionId]);
    const next = seq!.n;
    await mmoQuery(
      `insert into outbox (event_id, region_id, event_seq, topic, payload, available_at)
       values ($1,$2,$3,'mmo.chat',$4::jsonb, clock_timestamp() + interval '3 seconds')`,
      [randomUUID(), fx.regionId, next, JSON.stringify({
        channel: 'alliance', allianceId, fromId: alice.playerId, fromName: 'Alice',
        text: 'delayed-secret', epoch: '0', eventSeq: next,
      })]);
    await mmoQuery(
      `update alliance_member set left_at = clock_timestamp()
        where alliance_id = $1 and player_id = $2 and left_at is null`,
      [allianceId, bob.playerId]);

    await waitFor(() => chats(a1, 'delayed-secret').length === 1, 15_000);
    await sleep(500);
    expect(chats(b, 'delayed-secret')).toHaveLength(0);
  }, 30_000);

  it('routes alliance chat across unequal region journals without exposing it to other players', async () => {
    const alice = await playerCookie(0);
    const bob = await playerCookie(1);
    const carol = await playerCookie(2);
    const source = await connect(port, alice.cookie);
    const invitee = await connect(port, bob.cookie);
    clients.push(source, invitee);
    await Promise.all([subscribe(source), subscribe(invitee)]);
    await formAlliance(source, invitee, bob.playerId);
    invitee.close();

    const remote = await createRegion({
      worldId: fx.worldId, seed: fx.region.seed, rulesetVersion: fx.region.ruleset_version!,
      engineArtifactSha256: fx.region.engine_artifact_sha256!,
    });
    await setRegionLifecycle(remote.region_id, 'active');
    await mmoQuery(
      `insert into settlement (settlement_id, player_id, world_id, region_id, faction, cell_x, cell_y)
       values ($1, $2, $3, $4, 'gdi', 1, 1), ($5, $6, $3, $7, 'nod', 1, 1)`,
      [randomUUID(), alice.playerId, fx.worldId, fx.regionId, randomUUID(), bob.playerId, remote.region_id]);
    const member = await connect(port, bob.cookie);
    const observer = await connect(port, carol.cookie);
    clients.push(member, observer);
    await Promise.all([subscribe(member, remote.region_id), subscribe(observer, remote.region_id)]);

    const text = 'cross-region alliance chat';
    const id = command(source, { t: 'chat', channel: 'alliance', text });
    await waitFor(() => results(source, id).length === 1);
    const result = results(source, id)[0];
    expect(result.result).toMatchObject({ accepted: true });
    await waitFor(() => chats(source, text).length === 1 && chats(member, text).length === 1);
    expect(chats(member, text)[0]).toMatchObject({ regionId: fx.regionId, eventSeq: result.eventSeq });
    expect(chats(observer, text)).toHaveLength(0);
    expect(await mmoOne(
      'select 1 from region_event where region_id = $1 and event_seq = $2',
      [remote.region_id, result.eventSeq])).toBeUndefined();
  }, 40_000);

  it('routes reserved mmo.private events only to named recipients', async () => {
    const alice = await playerCookie(0);
    const bob = await playerCookie(1);
    const carol = await playerCookie(2);
    const a1 = await connect(port, alice.cookie); clients.push(a1);
    const b = await connect(port, bob.cookie); clients.push(b);
    const c = await connect(port, carol.cookie); clients.push(c);
    await Promise.all([subscribe(a1), subscribe(b), subscribe(c)]);

    const ready = command(a1, { t: 'chat', channel: 'region', text: 'private fixture ready' });
    await waitFor(() => results(a1, ready).length === 1);
    const next = results(a1, ready)[0].eventSeq;
    expect(next).toBeTruthy();
    await mmoQuery(
      `insert into outbox (event_id, region_id, event_seq, topic, payload)
       values ($1,$2,$3,'mmo.private',$4::jsonb)`,
      [randomUUID(), fx.regionId, next, JSON.stringify({
        kind: 'engineer-consent-request', playerId: bob.playerId,
        requestId: randomUUID(), epoch: '0', eventSeq: next,
      })]);

    await waitFor(() => privates(b, 'engineer-consent-request').length === 1, 15_000);
    await sleep(500);
    expect(privates(a1)).toHaveLength(0);
    expect(privates(c)).toHaveLength(0);
  }, 30_000);
});
