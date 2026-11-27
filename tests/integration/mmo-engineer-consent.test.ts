// PW34: allied Engineer capture consent end-to-end on real PostgreSQL —
// request -> private fanout -> owner decision -> journaled consentGrant ->
// enter order -> capture + CAPTURE operation/ledger rows. Real runners, real
// Fusion sim, real journal. Requires MMO_TEST_DATABASE_URL.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import {
  PERSISTENT_RULES_V1, mmoEntityId,
  type MmoAction, type MmoCommandMessage,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const IT_TIMEOUT = 90_000;
const TICK_MS = 50;
const POLL_MS = 20;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 30000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Ctx { fx: FixtureWorld; regionId: string; runner: RegionRunner }

/** Journal one world or sim action as `playerId` and wait for its receipt. */
async function act(
  ctx: Ctx, playerId: string, action: MmoAction,
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  const commandId = randomUUID();
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: ctx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const tail = await journalTail(ctx.regionId);
    try {
      await submitCommand({ playerId, rawMessage, fence, tick: tail ? BigInt(tail.tick) : 0n });
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await sleep(20);
    }
  }
  let result: { accepted?: boolean; reason?: string } | undefined;
  await waitFor(async () => {
    const ev = await mmoOne<{ application_result: unknown }>(
      `select application_result from region_event
        where region_id = $1 and payload->>'commandId' = $2 and applied_at is not null`,
      [ctx.regionId, commandId]);
    result = (ev?.application_result ?? undefined) as typeof result;
    return result !== undefined;
  });
  return (result ?? {}) as { accepted: boolean; reason?: string };
}

/** Spawn an engineer for `slot` next to a structure owned by `bldOwner`. */
function engineerPair(ctx: Ctx, bldOwner: number, engOwner: number, cx: number, cy: number) {
  const g = ctx.runner.currentGame!;
  const bld = g.spawnStructure('pyle', bldOwner, cx, cy);
  const cell = g.cellIndex(cx + 2, cy + 1);
  const eng = g.spawnUnit('engineer', engOwner, cell);
  eng.path = []; eng.order = 'idle';
  return { bld, eng };
}

describeDb('mmo engineer capture consent (PW34, real PostgreSQL)', () => {
  let ctx: Ctx;
  const p = () => ctx.fx.players.map(x => x.playerId);

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      quiescence: { enabled: false },
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e.includes('fail') || e.includes('error')) console.log('RUNNER', e, JSON.stringify(d).slice(0, 400)); },
    });
    await runner.start();
    ctx = { fx, regionId: fx.regionId, runner };
    await waitFor(() => ctx.runner.currentGame!.players.length >= 2);
  }, 90_000);

  afterAll(async () => {
    await ctx?.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  it.each([0, 1])('orders same-tick alliance, consent and enter effects for requester slot %i', async requesterSlot => {
    const fx = await seedFixtureWorld({ leaseMs: 60_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: 60_000, pollMs: POLL_MS, quiescence: { enabled: false },
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
    });
    try {
      await runner.start();
      const local = { fx, regionId: fx.regionId, runner };
      const ownerSlot = 1 - requesterSlot;
      const requester = fx.players[requesterSlot].playerId;
      const owner = fx.players[ownerSlot].playerId;
      const created = await act(local, owner, { t: 'allianceCreate', name: 'SameTickConsent' });
      expect(created.accepted).toBe(true);
      const allianceId = created.allianceId as string;
      expect((await act(local, owner, { t: 'allianceInvite', allianceId, playerId: requester })).accepted).toBe(true);
      expect((await act(local, requester, { t: 'allianceJoin', allianceId })).accepted).toBe(true);

      const { bld, eng } = engineerPair(local, ownerSlot, requesterSlot, 60, 60);
      const buildingId = mmoEntityId(fx.regionId, bld.id);
      const engineerId = mmoEntityId(fx.regionId, eng.id);
      const requested = await act(local, requester, { t: 'engineerRequest', buildingId, engineerId });
      expect(requested.accepted).toBe(true);
      const requestId = requested.requestId as string;
      expect((await act(local, owner, { t: 'engineerConsent', requestId, decision: 'accept' })).accepted).toBe(true);
      expect((await act(local, requester, { t: 'enter', entityIds: [engineerId], targetId: buildingId })).accepted).toBe(true);

      const game = runner.currentGame!;
      expect(game.tick).toBe(0);
      // Step only while the runner is idle. A poll suspended inside
      // drainCaptureEvents has already copied the (empty) capture queue; if
      // these synchronous steps then kill the engineer, its stale-grant sweep
      // invalidates the grant before the capture receipt can consume it. The
      // live runner never steps mid-drain (ticks share the busy guard), so the
      // test must not either. The steps below never yield.
      await waitFor(() => !(runner as unknown as { busy: boolean }).busy, 10_000, 1);
      game.step();
      expect(game.consents.some(grant => grant.requestId === requestId)).toBe(true);
      for (let tick = 0; tick < 120 && bld.owner !== requesterSlot; tick++) game.step();
      expect(bld.owner).toBe(requesterSlot);
      expect(game.entities.get(eng.id)?.hp ?? 0).toBeLessThanOrEqual(0);
      await waitFor(async () => (await mmoOne<{ state: string }>(
        'select state from engineer_consent where request_id = $1', [requestId]))?.state === 'consumed');
    } finally {
      await runner.stop();
    }
  }, IT_TIMEOUT);

  it('runs request -> accept -> consented capture with durable audit', async () => {
    const [owner, requester] = p();
    // Alliance so the pair is a legal consent request.
    const created = await act(ctx, owner, { t: 'allianceCreate', name: 'ConsentTest' });
    expect(created.accepted).toBe(true);
    const allianceId = created.allianceId as string;
    expect((await act(ctx, owner, { t: 'allianceInvite', allianceId, playerId: requester })).accepted).toBe(true);
    expect((await act(ctx, requester, { t: 'allianceJoin', allianceId })).accepted).toBe(true);
    // The durable receipt precedes the tick that mirrors membership into Fusion.
    await waitFor(() => {
      const [ownerSlot, requesterSlot] = ctx.runner.currentGame!.players;
      return ownerSlot.ally >= 0 && ownerSlot.ally === requesterSlot.ally;
    });

    const { bld, eng } = engineerPair(ctx, 0, 1, 60, 60);
    const engId = mmoEntityId(ctx.regionId, eng.id);
    const bldId = mmoEntityId(ctx.regionId, bld.id);

    // Request: accepted, private fanout to the owner only.
    const req = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(req.accepted).toBe(true);
    const requestId = req.requestId as string;
    expect(requestId).toBeTruthy();
    const dup = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(dup.requestId).toBe(requestId);
    expect(dup.deduplicated).toBe(true);

    // Only the owner may decide.
    const wrong = await act(ctx, requester, { t: 'engineerConsent', requestId, decision: 'accept' });
    expect(wrong.accepted).toBe(false);
    expect(wrong.reason).toBe('NOT_OWNER');

    // Owner accepts: the grant is journaled into the sim.
    const dec = await act(ctx, owner, { t: 'engineerConsent', requestId, decision: 'accept' });
    expect(dec.accepted).toBe(true);
    expect(dec.decision).toBe('accepted');
    await waitFor(() => ctx.runner.currentGame!.consents.some(grant =>
      grant.requestId === requestId && !grant.used));

    // Private traffic reached only the intended players.
    const priv = await mmoQuery<{ payload: { playerId?: string; kind?: string } }>(
      `select payload from outbox where region_id = $1 and topic = 'mmo.private'`, [ctx.regionId]);
    expect(priv.length).toBeGreaterThanOrEqual(2); // request -> owner, result -> requester
    for (const row of priv) {
      expect([owner, requester]).toContain(row.payload.playerId);
    }

    // The requester issues the normal enter order; the sim now permits it.
    const enter = await act(ctx, requester, { t: 'enter', entityIds: [engId], targetId: bldId });
    expect(enter.accepted).not.toBe(false);
    await waitFor(() => {
      const g = ctx.runner.currentGame!;
      const b = g.entities.get(bld.id)!;
      const e = g.entities.get(eng.id);
      return b.owner === 1 && (!e || e.hp <= 0);
    }, 30000, 50);

    // Durable audit: consent consumed, one CAPTURE operation, ledger rows.
    await waitFor(async () => {
      const row = await mmoOne<{ state: string }>(
        'select state from engineer_consent where request_id = $1', [requestId]);
      return row?.state === 'consumed';
    });
    const op = await mmoOne<{ operation_id: string }>(
      `select operation_id from economy_operation where region_id = $1 and kind = 'CAPTURE' order by committed_at desc limit 1`,
      [ctx.regionId]);
    expect(op).toBeTruthy();
    const ledger = await mmoQuery<{ kind: string; from_owner: string | null; to_owner: string | null }>(
      'select kind, from_owner, to_owner from asset_ledger where operation_id = $1 order by kind', [op!.operation_id]);
    expect(ledger.map(l => l.kind).sort()).toEqual(['CAPTURE', 'DESTROY']);
    const cap = ledger.find(l => l.kind === 'CAPTURE')!;
    expect(cap.from_owner).toBe(owner);
    expect(cap.to_owner).toBe(requester);
    // The DESTROY charge belongs to the Engineer's owner (the requester),
    // never the building's former owner.
    const dead = ledger.find(l => l.kind === 'DESTROY')!;
    expect(dead.from_owner).toBe(requester);
    expect(dead.to_owner).toBeNull();
  }, IT_TIMEOUT);

  it('a declined consent leaves building and Engineer untouched', async () => {
    const [owner, requester] = p();
    const { bld, eng } = engineerPair(ctx, 0, 1, 60, 80);
    const engId = mmoEntityId(ctx.regionId, eng.id);
    const bldId = mmoEntityId(ctx.regionId, bld.id);

    const req = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(req.accepted).toBe(true);
    const requestId = req.requestId as string;
    const dec = await act(ctx, owner, { t: 'engineerConsent', requestId, decision: 'decline' });
    expect(dec.accepted).toBe(true);
    expect(dec.decision).toBe('declined');

    // The requester is told privately.
    const priv = await mmoQuery<{ payload: { kind?: string; decision?: string; playerId?: string } }>(
      `select payload from outbox where region_id = $1 and topic = 'mmo.private'
         and payload->>'requestId' = $2`, [ctx.regionId, requestId]);
    expect(priv.some(r => r.payload.kind === 'engineer-consent-result' && r.payload.decision === 'declined' && r.payload.playerId === requester)).toBe(true);

    // A late enter order finds no consent — rejected at issue, both survive.
    await act(ctx, requester, { t: 'enter', entityIds: [engId], targetId: bldId });
    await sleep(800);
    const g = ctx.runner.currentGame!;
    expect(g.entities.get(bld.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    const row = await mmoOne<{ state: string }>(
      'select state from engineer_consent where request_id = $1', [requestId]);
    expect(row?.state).toBe('declined');
  }, IT_TIMEOUT);

  it('engineerConsentList recovers state for both parties and withdrawal cancels a pending request', async () => {
    const [owner, requester] = p();
    const { bld, eng } = engineerPair(ctx, 0, 1, 30, 55);
    const engId = mmoEntityId(ctx.regionId, eng.id);
    const bldId = mmoEntityId(ctx.regionId, bld.id);

    const req = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(req.accepted).toBe(true);
    const requestId = req.requestId as string;

    // Both parties recover the pending request from durable state — this is
    // the mount/reconnect read the client uses to rebuild its queues.
    const asRequester = await act(ctx, requester, { t: 'engineerConsentList' });
    expect(asRequester.accepted).toBe(true);
    const mine = (asRequester.requests as { requestId: string; state: string; role: string; otherName: string }[])
      .find(r => r.requestId === requestId);
    expect(mine?.state).toBe('pending');
    expect(mine?.role).toBe('requester');
    expect(mine?.otherName).toBeTruthy();
    const asOwner = await act(ctx, owner, { t: 'engineerConsentList' });
    const theirs = (asOwner.requests as { requestId: string; state: string; role: string }[])
      .find(r => r.requestId === requestId);
    expect(theirs?.state).toBe('pending');
    expect(theirs?.role).toBe('owner');

    // Withdrawal before use: requester cancels; owner sees it close.
    const cancel = await act(ctx, requester, { t: 'engineerCancel', requestId });
    expect(cancel.accepted).toBe(true);
    await waitFor(async () => {
      const row = await mmoOne<{ state: string }>(
        'select state from engineer_consent where request_id = $1', [requestId]);
      return row?.state === 'cancelled';
    });
    const after = await act(ctx, owner, { t: 'engineerConsentList' });
    const closed = (after.requests as { requestId: string; state: string }[])
      .find(r => r.requestId === requestId);
    expect(closed?.state).toBe('cancelled');
    // A decided/cancelled request cannot be decided again.
    const late = await act(ctx, owner, { t: 'engineerConsent', requestId, decision: 'accept' });
    expect(late.accepted).toBe(false);
  }, IT_TIMEOUT);

  it('an alliance break after acceptance invalidates the grant durably and privately', async () => {
    const [owner, requester] = p();
    const { bld, eng } = engineerPair(ctx, 0, 1, 60, 100);
    const engId = mmoEntityId(ctx.regionId, eng.id);
    const bldId = mmoEntityId(ctx.regionId, bld.id);

    const req = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(req.accepted).toBe(true);
    const requestId = req.requestId as string;
    expect((await act(ctx, owner, { t: 'engineerConsent', requestId, decision: 'accept' })).accepted).toBe(true);
    await waitFor(() => (ctx.runner.currentGame!.consents?.length ?? 0) >= 1);

    // The requester leaves the alliance mid-walk: durable row invalidated,
    // sim grant destroyed by the setAlly resync, both parties notified.
    expect((await act(ctx, requester, { t: 'allianceLeave' })).accepted).toBe(true);
    await waitFor(async () => {
      const row = await mmoOne<{ state: string }>(
        'select state from engineer_consent where request_id = $1', [requestId]);
      return row?.state === 'invalidated';
    });
    await waitFor(() => !(ctx.runner.currentGame!.consents ?? []).some(c => c.requestId === requestId));
    const priv = await mmoQuery<{ payload: { kind?: string; decision?: string } }>(
      `select payload from outbox where region_id = $1 and topic = 'mmo.private'
         and payload->>'requestId' = $2 and payload->>'decision' = 'invalidated'`,
      [ctx.regionId, requestId]);
    expect(priv.length).toBeGreaterThanOrEqual(2); // requester AND owner told

    // Rejoining does not resurrect anything — a fresh request is required.
    const reReq = await act(ctx, requester, { t: 'engineerRequest', engineerId: engId, buildingId: bldId });
    expect(reReq.accepted).toBe(false); // no longer allied

    // And the dead grant cannot capture even if an enter order is forced.
    await act(ctx, requester, { t: 'enter', entityIds: [engId], targetId: bldId });
    await sleep(800);
    const g = ctx.runner.currentGame!;
    expect(g.entities.get(bld.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
  }, IT_TIMEOUT);
});
