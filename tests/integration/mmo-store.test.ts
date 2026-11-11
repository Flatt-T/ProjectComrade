// PW05 integration tests: durable world records, journal, operations and the asset
// ledger against a REAL PostgreSQL (never mocked). Requires MMO_TEST_DATABASE_URL
// pointing at a disposable database; CI provides a postgres:16 service container.
// All fixtures are original synthetic data generated per run.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoMigrate, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  acquireRegionLease, adjustLadder, appendRegionEvent, claimDueJobs, closeRecoveryEpisode,
  commitOperation, consumeShieldSeconds, createRegion, createSettlement, createTradeOffer,
  createTransfer, finishJob, fenceRegion, getLadderEntry, getProtectionRecord, getRegion,
  getShieldBalance, grantShieldSeconds, latestSnapshot, listRegionEvents, markOperationApplied,
  mmoTransaction, openRecoveryEpisode, recordIntent, recordSnapshot, resolveTradeOffer,
  saveProtectionRecord, scheduleJob, transitionTransfer, type ProtectionRow,
} from '../../apps/service/src/mmo/store.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import type { BarterOffer, MmoOperation } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

let fx: FixtureWorld;
const ENT = randomUUID(), ENT2 = randomUUID(), OP = randomUUID();

function sellOp(over: Partial<MmoOperation> = {}): MmoOperation {
  return { kind: 'SELL_REFUND', entityId: ENT, compoundId: randomUUID(), ...over } as MmoOperation;
}
function packOp(): MmoOperation {
  return { kind: 'PACK', entityId: ENT2 } as MmoOperation;
}

describeDb('mmo durable store (real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    fx = await seedFixtureWorld({ leaseMs: 300_000 });
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('migrations apply and fixture identities reload unchanged', async () => {
    const region = await getRegion(fx.regionId);
    expect(region?.authority_epoch).toBe(fx.epoch);
    expect(region?.lifecycle).toBe('active');
    const players = await mmoQuery<{ player_id: string; account_id: string; display_name: string }>(
      'select * from player order by display_name');
    expect(players).toHaveLength(2);
    expect(players[0].account_id).not.toBe(players[0].player_id); // auth id != display identity
    expect(players[0].display_name).toMatch(/^FixtureCommander/);
    // Re-running migrations is a no-op.
    await mmoMigrate();
  });

  it('journal events commit in order under the fence and fan out to the outbox', async () => {
    const tick = 100;
    const a = await mmoTransaction(tx => appendRegionEvent(tx, {
      regionId: fx.regionId, workerId: fx.workerId, epoch: fx.epoch, tick, kind: 'command',
      payload: { t: 'move' }, outboxTopic: 'mmo.command', outboxPayload: { t: 'move' },
    }));
    const b = await mmoTransaction(tx => appendRegionEvent(tx, {
      regionId: fx.regionId, workerId: fx.workerId, epoch: fx.epoch, tick: tick + 15, kind: 'world',
      payload: { note: 'second' },
    }));
    expect(BigInt(b.eventSeq)).toBe(BigInt(a.eventSeq) + 1n);
    const events = await listRegionEvents(fx.regionId, 0);
    expect(events.map(e => e.event_kind)).toEqual(['command', 'world']);
    const outbox = await mmoQuery<{ topic: string; delivered_at: Date | null }>(
      'select topic, delivered_at from outbox where region_id = $1', [fx.regionId]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].topic).toBe('mmo.command');
    expect(outbox[0].delivered_at).toBeNull();
  });

  it('a stale epoch or wrong worker cannot write to the journal', async () => {
    await expect(mmoTransaction(tx => fenceRegion(tx, {
      regionId: fx.regionId, workerId: fx.workerId, epoch: '999', tick: 1,
    }))).rejects.toMatchObject({ code: 'FENCE_LOST' });
    await expect(mmoTransaction(tx => fenceRegion(tx, {
      regionId: fx.regionId, workerId: randomUUID(), epoch: fx.epoch, tick: 1,
    }))).rejects.toMatchObject({ code: 'FENCE_LOST' });
    // A tick behind the committed tail is also stale.
    await expect(mmoTransaction(tx => fenceRegion(tx, {
      regionId: fx.regionId, workerId: fx.workerId, epoch: fx.epoch, tick: 0,
    }))).rejects.toMatchObject({ code: 'FENCE_LOST' });
  });

  it('lease takeover bumps the epoch and locks out the old writer', async () => {
    const regionId = randomUUID();
    const worldId = fx.worldId;
    await createRegion({ regionId, worldId, rulesetVersion: 'comrade.mmo.v1', engineArtifactSha256: 'x' });
    const w1 = randomUUID(), w2 = randomUUID();
    const l1 = await acquireRegionLease({ regionId, workerId: w1, leaseMs: 60_000 });
    // Second worker cannot steal a live lease.
    await expect(acquireRegionLease({ regionId, workerId: w2, leaseMs: 60_000 }))
      .rejects.toMatchObject({ code: 'LEASE_HELD' });
    // Forced takeover increments the epoch; w1's fence is dead.
    const l2 = await acquireRegionLease({ regionId, workerId: w2, leaseMs: 60_000, forceTakeover: true });
    expect(BigInt(l2.epoch)).toBe(BigInt(l1.epoch) + 1n);
    await expect(mmoTransaction(tx => fenceRegion(tx, {
      regionId, workerId: w1, epoch: l1.epoch, tick: 1,
    }))).rejects.toMatchObject({ code: 'FENCE_LOST' });
    const seq = await mmoTransaction(tx => fenceRegion(tx, {
      regionId, workerId: w2, epoch: l2.epoch, tick: 1,
    }));
    expect(BigInt(seq)).toBe(1n);
  });

  it('operation commit is atomic, idempotent on retry and conflict-checked', async () => {
    const opId = OP;
    const args = {
      operationId: opId, regionId: fx.regionId, workerId: fx.workerId, epoch: fx.epoch, tick: 200,
      operation: sellOp(), result: { credits: '500' },
      ledger: [{ entityId: ENT, kind: 'SELL_REFUND', fromOwner: fx.players[0].playerId, physicalState: 'destroyed' }],
    };
    const first = await mmoTransaction(tx => commitOperation(tx, args));
    expect(first.deduplicated).toBe(false);
    // Identical retry: no second event, no second ledger row.
    const retry = await mmoTransaction(tx => commitOperation(tx, args));
    expect(retry.deduplicated).toBe(true);
    const ledger = await mmoQuery('select * from asset_ledger where operation_id = $1', [opId]);
    expect(ledger).toHaveLength(1);
    const ops = await mmoQuery('select * from economy_operation where operation_id = $1', [opId]);
    expect(ops).toHaveLength(1);
    // Conflicting reuse of the same operation id is rejected.
    await expect(mmoTransaction(tx => commitOperation(tx, {
      ...args, operation: packOp(),
    }))).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    // PACK and SELL_REFUND are distinct immutable causes in the ledger.
    const packId = randomUUID();
    await mmoTransaction(tx => commitOperation(tx, {
      operationId: packId, regionId: fx.regionId, workerId: fx.workerId, epoch: fx.epoch, tick: 215,
      operation: packOp(), result: { carrierId: ENT },
      ledger: [{ entityId: ENT2, kind: 'PACK', fromOwner: fx.players[0].playerId, physicalState: 'packed' }],
    }));
    const kinds = await mmoQuery<{ kind: string }>(
      'select kind from asset_ledger where entity_id in ($1,$2) order by kind', [ENT, ENT2]);
    expect(kinds.map(k => k.kind).sort()).toEqual(['PACK', 'SELL_REFUND']);
    // Applied receipt is recorded once.
    await markOperationApplied(opId, { credits: '500', applied: true });
    const op = await mmoOne<{ runner_applied_at: Date | null; applied_result: { applied: boolean } }>(
      'select runner_applied_at, applied_result from economy_operation where operation_id = $1', [opId]);
    expect(op?.runner_applied_at).not.toBeNull();
    expect(op?.applied_result.applied).toBe(true);
  });

  it('nightly and earned shield balances stay separate; retries cannot double-grant', async () => {
    const p = fx.players[0].playerId;
    await mmoTransaction(async tx => {
      expect(await grantShieldSeconds(tx, { playerId: p, kind: 'nightly', seconds: 8 * 3600, effectKey: 'nightly-1', operationId: OP })).toBe('granted');
      expect(await grantShieldSeconds(tx, { playerId: p, kind: 'earned', seconds: 3600, effectKey: 'earned-1' })).toBe('granted');
    });
    // Retried grant with the same effect key awards nothing.
    await mmoTransaction(async tx => {
      expect(await grantShieldSeconds(tx, { playerId: p, kind: 'nightly', seconds: 8 * 3600, effectKey: 'nightly-1' })).toBe('duplicate');
    });
    const nightly = await getShieldBalance(p, 'nightly');
    const earned = await getShieldBalance(p, 'earned');
    expect(nightly?.seconds_remaining).toBe(String(8 * 3600));
    expect(earned?.seconds_remaining).toBe('3600');
    // Consumption is generation-fenced: a stale generation spends nothing.
    await mmoTransaction(async tx => {
      expect(await consumeShieldSeconds(tx, { playerId: p, kind: 'earned', seconds: 600, expectedGeneration: '999' })).toBe(false);
      expect(await consumeShieldSeconds(tx, { playerId: p, kind: 'earned', seconds: 600, expectedGeneration: earned!.generation })).toBe(true);
    });
    expect((await getShieldBalance(p, 'earned'))?.seconds_remaining).toBe('3000');
  });

  it('protection records round-trip all three reasons with distinct fields', async () => {
    const mk = (kind: 'NEWCOMER' | 'OFFLINE_EARNED' | 'RECOVERY', over: Partial<ProtectionRow> = {}): ProtectionRow => ({
      compound_id: randomUUID(), player_id: fx.players[1].playerId, kind, status: 'active',
      generation: '1', armed_seconds: '0', online_ms: '0', online_since_ms: null,
      lapse_at_ms: null, started_at_ms: null, ends_at_ms: null,
      milestone_power: '0', milestone_barracks: '0', ...over,
    });
    await mmoTransaction(async tx => {
      await saveProtectionRecord(tx, mk('NEWCOMER', { online_ms: '60000', online_since_ms: '1700000000000', lapse_at_ms: '1700086400000' }));
      await saveProtectionRecord(tx, mk('OFFLINE_EARNED', { status: 'armed', armed_seconds: '7200' }));
      await saveProtectionRecord(tx, mk('RECOVERY'));
    });
    const rows = await mmoQuery<{ compound_id: string; kind: string; status: string; armed_seconds: string; online_ms: string; lapse_at_ms: string | null }>(
      'select * from protection_record order by kind');
    expect(rows).toHaveLength(3);
    const byKind = Object.fromEntries(rows.map(r => [r.kind, r]));
    expect(byKind.NEWCOMER.status).toBe('active');
    expect(byKind.NEWCOMER.online_ms).toBe('60000');
    expect(byKind.NEWCOMER.lapse_at_ms).toBe('1700086400000');
    expect(byKind.OFFLINE_EARNED.status).toBe('armed');
    expect(byKind.OFFLINE_EARNED.armed_seconds).toBe('7200');
    expect(byKind.RECOVERY.status).toBe('active');
    // Reloading preserves the protection reason and its timers.
    const reloaded = await getProtectionRecord(byKind.OFFLINE_EARNED.compound_id);
    expect(reloaded?.kind).toBe('OFFLINE_EARNED');
    expect(reloaded?.armed_seconds).toBe('7200');
  });

  it('trade offers validate the contract, resolve once and record the operation', async () => {
    const offer: BarterOffer = {
      offerId: randomUUID(), regionId: fx.regionId,
      fromId: fx.players[0].playerId, toId: fx.players[1].playerId,
      give: [{ kind: 'unit', ref: ENT, amount: 4 }],
      want: [{ kind: 'credits', amount: 250 }],
      createdAtMs: 1_000, expiresAtMs: 4_000_000_000_000,
    };
    await expect(createTradeOffer({ regionId: fx.regionId, offer: { ...offer, toId: offer.fromId } }))
      .rejects.toThrow(); // self-trade rejected by contract validator
    await createTradeOffer({ regionId: fx.regionId, offer });
    expect(await resolveTradeOffer(offer.offerId, 'accepted', OP)).toBe(true);
    expect(await resolveTradeOffer(offer.offerId, 'settled')).toBe(false); // already resolved
  });

  it('ladder adjustments are receipt-idempotent', async () => {
    const p = fx.players[1].playerId;
    await mmoTransaction(async tx => {
      await adjustLadder(tx, { playerId: p, ratingDelta: 24, effectKey: 'ladder-1', operationId: OP });
      await adjustLadder(tx, { playerId: p, ratingDelta: 24, effectKey: 'ladder-1' }); // retry: no-op
    });
    const entry = await getLadderEntry(p);
    expect(entry?.rating).toBe('1024');
    expect(entry?.wins).toBe('1');
  });

  it('a live transfer is unique per asset and follows the state machine', async () => {
    const entityId = randomUUID();
    const dest = await createRegion({ worldId: fx.worldId, rulesetVersion: 'comrade.mmo.v1', engineArtifactSha256: 'x' });
    const t1 = await createTransfer({ entityId, sourceRegionId: fx.regionId, destRegionId: dest.region_id, payload: { hp: '80' } });
    await expect(createTransfer({ entityId, sourceRegionId: fx.regionId, destRegionId: dest.region_id }))
      .rejects.toMatchObject({ code: 'TRANSFER_ACTIVE' });
    await expect(transitionTransfer(t1.transfer_id, 'COMPLETED')).rejects.toMatchObject({ code: 'BAD_TRANSITION' });
    await transitionTransfer(t1.transfer_id, 'SOURCE_RELEASED');
    await transitionTransfer(t1.transfer_id, 'DESTINATION_ACCEPTED');
    const done = await transitionTransfer(t1.transfer_id, 'COMPLETED');
    expect(done.state).toBe('COMPLETED');
    // Completed transfers release the entity for a new one.
    const t2 = await createTransfer({ entityId, sourceRegionId: fx.regionId, destRegionId: dest.region_id });
    expect(t2.state).toBe('PREPARED');
    await transitionTransfer(t2.transfer_id, 'CANCELLED');
  });

  it('recovery episodes and settlements are at-most-once per player', async () => {
    const p = fx.players[0].playerId;
    const e1 = await openRecoveryEpisode({ playerId: p, worldId: fx.worldId, regionId: fx.regionId });
    expect(e1.created).toBe(true);
    const e2 = await openRecoveryEpisode({ playerId: p, worldId: fx.worldId, regionId: fx.regionId });
    expect(e2.created).toBe(false);
    expect(e2.episodeId).toBe(e1.episodeId);
    await closeRecoveryEpisode(e1.episodeId, 'completed');
    const e3 = await openRecoveryEpisode({ playerId: p, worldId: fx.worldId, regionId: fx.regionId });
    expect(e3.created).toBe(true);
    await closeRecoveryEpisode(e3.episodeId, 'abandoned');

    const s1 = await createSettlement({ playerId: p, worldId: fx.worldId, regionId: fx.regionId, faction: 'gdi', cellX: 10, cellY: 20 });
    expect(s1.created).toBe(true);
    const s2 = await createSettlement({ playerId: p, worldId: fx.worldId, regionId: fx.regionId, faction: 'nod', cellX: 1, cellY: 1 });
    expect(s2.created).toBe(false);
    expect(s2.settlementId).toBe(s1.settlementId);
  });

  it('snapshots record applied vs committed positions distinctly', async () => {
    const payload = Buffer.from('synthetic-snapshot-bytes');
    const id = await recordSnapshot({
      regionId: fx.regionId, epoch: fx.epoch, lastAppliedSeq: 2, lastCommittedSeq: 5,
      tick: 300, engineArtifactSha256: 'fixture-engine-sha', rulesetVersion: 'comrade.mmo.v1',
      format: 'fusion-v1', payload,
    });
    expect(id).toBeTruthy();
    const snap = await latestSnapshot(fx.regionId);
    expect(snap?.last_applied_seq).toBe('2');
    expect(snap?.last_committed_seq).toBe('5'); // durable tail ahead of applied position
    expect(snap?.payload.equals(payload)).toBe(true);
  });

  it('scheduled jobs are claimed under lease and finished explicitly', async () => {
    const jobId = await scheduleJob({ regionId: fx.regionId, kind: 'shield_expiry', dueAtMs: 1_000, generation: 3, payload: { compoundId: randomUUID() } });
    const worker = randomUUID();
    const claimed = await claimDueJobs({ regionId: fx.regionId, workerId: worker, nowMs: 2_000 });
    expect(claimed.map(j => j.job_id)).toContain(jobId);
    // A second claim sees nothing pending.
    const again = await claimDueJobs({ regionId: fx.regionId, workerId: randomUUID(), nowMs: 2_000 });
    expect(again.map(j => j.job_id)).not.toContain(jobId);
    await finishJob(jobId, 'done');
    const job = await mmoOne<{ state: string }>('select state from scheduled_job where job_id = $1', [jobId]);
    expect(job?.state).toBe('done');
  });

  it('command intents deduplicate by id and reject conflicting payloads', async () => {
    const p = fx.players[0].playerId;
    const commandId = randomUUID();
    const request = { t: 'move', entityIds: [ENT], x: 1, y: 2 };
    expect(await recordIntent({ playerId: p, commandId, regionId: fx.regionId, request, commandKind: 'command' })).toBe('inserted');
    expect(await recordIntent({ playerId: p, commandId, regionId: fx.regionId, request, commandKind: 'command' })).toBe('duplicate');
    await expect(recordIntent({ playerId: p, commandId, regionId: fx.regionId, request: { t: 'attack' }, commandKind: 'command' }))
      .rejects.toMatchObject({ code: 'COMMAND_CONFLICT' });
  });
});
