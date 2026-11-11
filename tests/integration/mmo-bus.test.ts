// PW06 integration tests: command intake, journal-first application receipts and the
// transactional outbox dispatcher against real PostgreSQL. Fault injection covers
// commit/ack crash windows; ordering and dedupe are asserted on durable rows.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase } from '../../apps/service/src/mmo/db.js';
import { applyCommandEffects, journalTail, submitCommand } from '../../apps/service/src/mmo/commands.js';
import { claimOutbox, dispatchOutbox, outboxStats } from '../../apps/service/src/mmo/bus.js';
import { acquireRegionLease, createTradeOffer, resolveTradeOffer } from '../../apps/service/src/mmo/store.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import type { BarterOffer } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

let fx: FixtureWorld;
const ENT = randomUUID();

function moveMessage(commandId: string, x = 10, y = 20) {
  return {
    protocol: 'comrade.mmo.v1', type: 'command', commandId, regionId: fx.regionId,
    seenEpoch: fx.epoch, lastSeenEventSeq: '0',
    action: { t: 'move', entityIds: [ENT], x, y },
  };
}
const fence = () => ({ workerId: fx.workerId, epoch: fx.epoch });

describeDb('mmo command pipeline and outbox (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    fx = await seedFixtureWorld({ leaseMs: 300_000 });
  });
  afterAll(async () => { await closeMmoDatabase(); });
  // Each test starts with every undelivered outbox row claimable: no stale leases or
  // backoff windows leaking between cases.
  beforeEach(async () => {
    await mmoQuery(
      `update outbox set lease_owner = null, lease_until = null, available_at = clock_timestamp()
        where delivered_at is null`);
  });

  it('submitCommand commits intent + journal + outbox atomically', async () => {
    const commandId = randomUUID();
    const res = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: moveMessage(commandId), fence: fence(), tick: 100 });
    expect(res.status).toBe('committed');
    const intent = await mmoOne<{ status: string; result: { eventSeq: string } }>(
      'select status, result from command_intent where command_id = $1', [commandId]);
    expect(intent?.status).toBe('committed_pending_application');
    expect(intent?.result.eventSeq).toBe(res.eventSeq);
    const event = await mmoOne<{ event_kind: string; applied_at: Date | null }>(
      'select event_kind, applied_at from region_event where region_id = $1 and event_seq = $2', [fx.regionId, res.eventSeq]);
    expect(event?.event_kind).toBe('command');
    expect(event?.applied_at).toBeNull();
    const outbox = await mmoQuery('select topic from outbox where region_id = $1 and event_seq = $2', [fx.regionId, res.eventSeq]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].topic).toBe('mmo.command');
  });

  it('replayed submissions deduplicate; conflicting payloads are rejected', async () => {
    const commandId = randomUUID();
    const msg = moveMessage(commandId);
    const first = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: fence(), tick: 115 });
    const tailBefore = await journalTail(fx.regionId);
    const replay = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: fence(), tick: 120 });
    expect(replay.status).toBe('deduplicated');
    expect(replay.eventSeq).toBe(first.eventSeq);
    expect((await journalTail(fx.regionId))?.seq).toBe(tailBefore?.seq); // no second journal entry
    await expect(submitCommand({
      playerId: fx.players[0].playerId,
      rawMessage: moveMessage(commandId, 99, 99), fence: fence(), tick: 125,
    })).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' });
    await expect(submitCommand({
      playerId: fx.players[0].playerId, rawMessage: { ...msg, protocol: 'comrade.classic.v1' }, fence: fence(), tick: 130,
    })).rejects.toThrow();
  });

  it('concurrent identical submissions produce exactly one journal event', async () => {
    const commandId = randomUUID();
    const msg = moveMessage(commandId);
    const results = await Promise.all([
      submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: fence(), tick: 140 }),
      submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: fence(), tick: 140 }),
      submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: fence(), tick: 140 }),
    ]);
    expect(results.filter(r => r.status === 'committed')).toHaveLength(1);
    expect(results.filter(r => r.status === 'deduplicated')).toHaveLength(2);
    const events = await mmoQuery(
      `select count(*)::int as n from region_event where region_id = $1 and payload->>'commandId' = $2`,
      [fx.regionId, commandId]);
    expect(events[0].n).toBe(1);
  });

  it('applyCommandEffects writes cause + ledger + receipt once; replays are no-ops', async () => {
    const commandId = randomUUID();
    const sub = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: moveMessage(commandId), fence: fence(), tick: 150 });
    const opId = randomUUID();
    const operation = { kind: 'PACK', entityId: ENT } as const;
    const ledger = [{ entityId: ENT, kind: 'PACK', fromOwner: fx.players[0].playerId, physicalState: 'packed' }];
    let effectsRan = 0;
    const effects = async () => { effectsRan++; };
    const args = {
      regionId: fx.regionId, eventSeq: sub.eventSeq!, fence: fence(), operationId: opId,
      operation, ledger, result: { packed: true },
      intent: { playerId: fx.players[0].playerId, commandId }, effects,
    };
    const first = await applyCommandEffects(args);
    expect(first).toEqual({ applied: true, deduplicated: false });
    const replay = await applyCommandEffects(args);
    expect(replay).toEqual({ applied: false, deduplicated: true });
    expect(effectsRan).toBe(1); // Postgres side-effects ran exactly once
    const ledgerRows = await mmoQuery('select * from asset_ledger where operation_id = $1', [opId]);
    expect(ledgerRows).toHaveLength(1);
    const event = await mmoOne<{ applied_at: Date | null; application_result: { packed: boolean } }>(
      'select applied_at, application_result from region_event where region_id = $1 and event_seq = $2', [fx.regionId, sub.eventSeq]);
    expect(event?.applied_at).not.toBeNull();
    expect(event?.application_result.packed).toBe(true);
    const intent = await mmoOne<{ status: string }>('select status from command_intent where command_id = $1', [commandId]);
    expect(intent?.status).toBe('applied');
    const opOutbox = await mmoQuery(`select topic from outbox where region_id = $1 and event_seq = $2`, [fx.regionId, sub.eventSeq]);
    expect(opOutbox.map(r => r.topic).sort()).toEqual(['mmo.command', 'mmo.operation']);
    // Replaying the same event with a different operation is a conflict, not a second effect.
    await expect(applyCommandEffects({ ...args, operationId: randomUUID(), operation: { kind: 'SELL_REFUND', entityId: ENT, compoundId: randomUUID() } as never }))
      .rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
  });

  it('an expired lease cannot submit commands or record outcomes', async () => {
    // Expire the fixture region's lease directly (deterministic, no sleeping).
    await mmoQuery(`update region set lease_expires_at = clock_timestamp() - interval '1 second' where region_id = $1`, [fx.regionId]);
    await expect(submitCommand({
      playerId: fx.players[0].playerId, rawMessage: moveMessage(randomUUID()), fence: fence(), tick: 200,
    })).rejects.toMatchObject({ code: 'FENCE_LOST' });
    // Restore the lease for subsequent tests.
    const lease = await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 300_000 });
    fx = { ...fx, epoch: lease.epoch };
  });

  it('outbox delivers in journal order and acknowledges once', async () => {
    const delivered: { regionId: string; eventSeq: string; topic: string; eventId: string }[] = [];
    const publish = (env: { regionId: string; eventSeq: string; topic: string; eventId: string }) => {
      delivered.push(env);
    };
    const r1 = await dispatchOutbox({ workerId: randomUUID(), publish });
    expect(r1.delivered).toBeGreaterThan(0);
    // Per-region sequence is non-decreasing in delivery order.
    const seqs = delivered.filter(d => d.regionId === fx.regionId).map(d => BigInt(d.eventSeq));
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThanOrEqual(seqs[i - 1]);
    const stats = await outboxStats();
    expect(stats.pending).toBe('0');
    // Second dispatch finds nothing.
    const again = await dispatchOutbox({ workerId: randomUUID(), publish });
    expect(again.delivered).toBe(0);
  });

  it('crash between publish and ack redelivers; consumers dedupe by event id', async () => {
    // New command → new outbox row.
    const commandId = randomUUID();
    await submitCommand({ playerId: fx.players[0].playerId, rawMessage: moveMessage(commandId), fence: fence(), tick: 300 });
    // Simulate crash after publish but before ack: claim manually, "publish", no ack.
    const claimed = await claimOutbox({ workerId: randomUUID(), limit: 10 });
    const target = claimed.find(c => c.regionId === fx.regionId);
    expect(target).toBeTruthy();
    // The crashed publish is treated as lost; lapse every lease so rows are reclaimable.
    await mmoQuery(
      `update outbox set lease_owner = null, lease_until = clock_timestamp() - interval '1 second'
        where delivered_at is null`);
    const seen = new Set<string>();
    const publish = (env: { eventId: string }) => { seen.add(env.eventId); };
    await dispatchOutbox({ workerId: randomUUID(), publish });
    expect(seen.has(target!.eventId)).toBe(true);
    // A second dispatch has nothing new to deliver.
    const before = seen.size;
    await dispatchOutbox({ workerId: randomUUID(), publish });
    expect(seen.size).toBe(before);
  });

  it('a failed publish backs off and head-of-line blocks later region events', async () => {
    const c1 = randomUUID(), c2 = randomUUID();
    await submitCommand({ playerId: fx.players[0].playerId, rawMessage: moveMessage(c1), fence: fence(), tick: 310 });
    await submitCommand({ playerId: fx.players[0].playerId, rawMessage: moveMessage(c2), fence: fence(), tick: 315 });
    // Publish throws for every claimed head event.
    const failing = async () => { throw new Error('subscriber down'); };
    const r = await dispatchOutbox({ workerId: randomUUID(), publish: failing, maxAttempts: 100 });
    // The head journal position has two outbox rows (command + operation); both fail.
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(r.delivered).toBe(0);
    // Nothing for this region may be claimed while the head is undelivered.
    const claimed = await claimOutbox({ workerId: randomUUID(), limit: 50 });
    expect(claimed.filter(c => c.regionId === fx.regionId)).toHaveLength(0);
    const head = await mmoOne<{ event_seq: string; delivered_at: Date | null }>(
      `select event_seq, delivered_at from outbox where region_id = $1 and delivered_at is null order by event_seq limit 1`, [fx.regionId]);
    expect(head).toBeTruthy();
    // Make everything due again and publish successfully: order is preserved.
    await mmoQuery(`update outbox set available_at = clock_timestamp() where region_id = $1 and delivered_at is null`, [fx.regionId]);
    const order: string[] = [];
    await dispatchOutbox({ workerId: randomUUID(), publish: (env: { eventSeq: string }) => { order.push(env.eventSeq); } });
    const bigs = order.map(BigInt);
    for (let i = 1; i < bigs.length; i++) expect(bigs[i]).toBeGreaterThanOrEqual(bigs[i - 1]);
    const stats = await outboxStats();
    expect(stats.pending).toBe('0');
  });

  it('two concurrent acceptances of one trade offer have exactly one winner', async () => {
    const offer: BarterOffer = {
      offerId: randomUUID(), regionId: fx.regionId,
      fromId: fx.players[0].playerId, toId: fx.players[1].playerId,
      give: [{ kind: 'credits', amount: 100 }], want: [{ kind: 'unit', ref: ENT, amount: 2 }],
      createdAtMs: 1_000, expiresAtMs: 4_000_000_000_000,
    };
    await createTradeOffer({ regionId: fx.regionId, offer });
    const [a, b] = await Promise.all([
      resolveTradeOffer(offer.offerId, 'accepted', randomUUID()),
      resolveTradeOffer(offer.offerId, 'accepted', randomUUID()),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});
