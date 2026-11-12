// PW07 integration tests: the durable region runner against REAL PostgreSQL and the
// REAL Fusion sim. Covers journal-first command application, fenced job claiming,
// exactly-once scheduled effects, stale-worker rejection and snapshot/restore across
// a simulated restart. Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  acquireRegionLease, claimDueJobs, finishJob, latestSnapshot, listRegionEvents,
  mmoTransaction, reclaimExpiredJobs, scheduleJob, setRegionLifecycle,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner, type ClaimedJob } from '../../apps/service/src/mmo/runner.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { MMO_PROTOCOL, type MmoCommandMessage } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

function commandMessage(
  fx: FixtureWorld, action: MmoCommandMessage['action'], epoch: string = fx.epoch,
): MmoCommandMessage {
  return {
    protocol: MMO_PROTOCOL, type: 'command',
    commandId: randomUUID(), regionId: fx.regionId,
    seenEpoch: epoch, lastSeenEventSeq: '0', action,
  };
}

async function regionRow(regionId: string) {
  return mmoOne<{
    lifecycle: string; owner_worker_id: string | null; authority_epoch: string;
    last_committed_tick: string; started_at_ms: string | null;
  }>(
    'select lifecycle, owner_worker_id, authority_epoch, last_committed_tick, started_at_ms from region where region_id = $1',
    [regionId]);
}

describeDb('mmo region runner (real PostgreSQL + real Fusion sim)', () => {
  let fx: FixtureWorld;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    fx = await seedFixtureWorld({ leaseMs: 300_000 });
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('boots into active lifecycle, steps the sim and anchors wall-clock to ticks', async () => {
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
    });
    await runner.start();
    try {
      const row = await regionRow(fx.regionId);
      expect(row?.lifecycle).toBe('active');
      expect(row?.started_at_ms).not.toBeNull();
      const t0 = runner.currentGame!.tick;
      await waitFor(async () => (runner.currentGame?.tick ?? 0) > t0 + 5);
      expect(runner.stats.ticksStepped).toBeGreaterThan(5);
      expect(runner.stats.simMs).toBeGreaterThanOrEqual(0);
    } finally {
      await runner.stop();
    }
  });

  it('applies journaled commands in order and completes the intent exactly once', async () => {
    const seen: unknown[] = [];
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: async (_tx, action) => { seen.push(action); return { result: { pong: true } }; },
    });
    await runner.start();
    try {
      const row = await regionRow(fx.regionId);
      const tick = BigInt(row!.last_committed_tick);
      const epoch = row!.authority_epoch;
      const commandId = randomUUID();
      const msg: MmoCommandMessage = {
        ...commandMessage(fx, { t: 'ping', x: 12, y: 34 }, epoch), commandId,
      };
      const res = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: { workerId: fx.workerId, epoch }, tick });
      expect(res.status).toBe('committed');
      expect(res.eventSeq).toBeDefined();

      await waitFor(async () => {
        const intent = await mmoOne<{ status: string; result: unknown }>(
          'select status, result from command_intent where player_id = $1 and command_id = $2',
          [fx.players[0].playerId, commandId]);
        return intent?.status === 'applied';
      });
      expect(seen).toHaveLength(1);
      expect((seen[0] as { t: string }).t).toBe('ping');

      const event = await mmoOne<{ applied_at: Date | null; application_result: unknown }>(
        'select applied_at, application_result from region_event where region_id = $1 and event_seq = $2',
        [fx.regionId, res.eventSeq!]);
      expect(event?.applied_at).not.toBeNull();
      expect(event?.application_result).toMatchObject({ pong: true });

      // Re-submitting the same command deduplicates; the effect does not repeat.
      const again = await submitCommand({ playerId: fx.players[0].playerId, rawMessage: msg, fence: { workerId: fx.workerId, epoch }, tick });
      expect(again.status).toBe('deduplicated');
      await sleep(120);
      expect(seen).toHaveLength(1);
    } finally {
      await runner.stop();
    }
  });

  it('sim-commands resolve durable bindings and reject unknown entities without effect', async () => {
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
    });
    await runner.start();
    try {
      const row = await regionRow(fx.regionId);
      const tick = BigInt(row!.last_committed_tick);
      const epoch = row!.authority_epoch;
      // rally needs no entity binding — it is accepted into the sim queue.
      const okId = randomUUID();
      await submitCommand({
        playerId: fx.players[1].playerId,
        rawMessage: { ...commandMessage(fx, { t: 'rally', x: 5, y: 6 }, epoch), commandId: okId },
        fence: { workerId: fx.workerId, epoch }, tick,
      });
      // move with an unbound durable id is journaled then rejected at apply time.
      const badId = randomUUID();
      await submitCommand({
        playerId: fx.players[1].playerId,
        rawMessage: { ...commandMessage(fx, { t: 'move', entityIds: [randomUUID()], x: 1, y: 1 }, epoch), commandId: badId },
        fence: { workerId: fx.workerId, epoch }, tick: tick + 1n,
      });
      await waitFor(async () => {
        const rows = await mmoQuery<{ status: string }>(
          `select status from command_intent where player_id = $1 and command_id = any($2::uuid[])`,
          [fx.players[1].playerId, [okId, badId]]);
        return rows.length === 2 && rows.every(r => r.status === 'applied');
      });
      const bad = await mmoOne<{ result: { appliedResult?: { reason?: string } } }>(
        'select result from command_intent where player_id = $1 and command_id = $2',
        [fx.players[1].playerId, badId]);
      expect(JSON.stringify(bad?.result)).toContain('UNKNOWN_ENTITY');
    } finally {
      await runner.stop();
    }
  });

  it('runs due scheduled jobs exactly once with journal + outbox + completion atomic', async () => {
    const applied: string[] = [];
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      jobHandlers: {
        test_marker: async (tx, job: ClaimedJob) => {
          applied.push(String(job.job_id));
          await tx.query(
            `insert into effect_receipt (effect_key, kind) values ($1, 'test_marker') on conflict do nothing`,
            [`marker-${job.job_id}`]);
          return { marked: true };
        },
      },
    });
    await runner.start();
    try {
      // dedupeKey suppression: scheduling the same logical job twice yields one row.
      const due = Date.now() + 50;
      const first = await scheduleJob({ regionId: fx.regionId, kind: 'test_marker', dueAtMs: due, dedupeKey: 'marker-1', payload: { n: 1 } });
      const second = await scheduleJob({ regionId: fx.regionId, kind: 'test_marker', dueAtMs: due, dedupeKey: 'marker-1', payload: { n: 1 } });
      expect(second).toBe(first);
      const count = await mmoOne<{ n: string }>(
        `select count(*)::text as n from scheduled_job where region_id = $1 and dedupe_key = 'marker-1'`, [fx.regionId]);
      expect(count?.n).toBe('1');

      await waitFor(async () => {
        const job = await mmoOne<{ state: string }>('select state from scheduled_job where job_id = $1', [first]);
        return job?.state === 'done';
      }, 8000);
      expect(applied).toEqual([first]);
      const receipt = await mmoOne('select 1 as x from effect_receipt where effect_key = $1', [`marker-${first}`]);
      expect(receipt).toBeTruthy();
      const events = await listRegionEvents(fx.regionId, 0, 500);
      const sched = events.filter(e => e.event_kind === 'scheduled');
      expect(sched.length).toBeGreaterThanOrEqual(1);
      expect(sched.every(e => e.applied_at !== null)).toBe(true);
      const outbox = await mmoQuery('select 1 as x from outbox where topic = $1 limit 1', ['mmo.scheduled']);
      expect(outbox.length).toBeGreaterThanOrEqual(1);
    } finally {
      await runner.stop();
    }
  });

  it('shield_expire ends active protection through the default handler', async () => {
    const compoundId = randomUUID();
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
    });
    await runner.start();
    try {
      await mmoTransaction(async tx => {
        await tx.query(
          `insert into protection_record
             (compound_id, player_id, kind, status, generation, armed_seconds, online_ms,
              online_since_ms, lapse_at_ms, started_at_ms, ends_at_ms, milestone_power, milestone_barracks)
           values ($1,$2,'OFFLINE_EARNED','active',1,0,0,null,null,null,$3,0,0)`,
          [compoundId, fx.players[0].playerId, Date.now() + 60_000]);
      });
      await scheduleJob({
        regionId: fx.regionId, kind: 'shield_expire', dueAtMs: Date.now() + 30,
        payload: { compoundId },
      });
      await waitFor(async () => {
        const row = await mmoOne<{ status: string }>(
          'select status from protection_record where compound_id = $1', [compoundId]);
        return row?.status === 'ended';
      }, 8000);
    } finally {
      await runner.stop();
    }
  });

  it('fences claims by authority epoch: a stale epoch cannot claim region jobs', async () => {
    const jobId = await scheduleJob({
      regionId: fx.regionId, kind: 'test_marker', dueAtMs: Date.now() - 1, payload: {},
    });
    const stale = await claimDueJobs({
      regionId: fx.regionId, workerId: fx.workerId, nowMs: Date.now(), authorityEpoch: '999999',
    });
    expect(stale.find(j => j.job_id === jobId)).toBeUndefined();
    // The real epoch can claim it (then we release so later tests are unaffected).
    const lease = await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000 });
    const claimed = await claimDueJobs({
      regionId: fx.regionId, workerId: fx.workerId, nowMs: Date.now(), authorityEpoch: lease.epoch,
    });
    expect(claimed.find(j => j.job_id === jobId)).toBeDefined();
    await finishJob(jobId, 'cancelled');
    const row = await mmoOne<{ state: string }>('select state from scheduled_job where job_id = $1', [jobId]);
    expect(row?.state).toBe('cancelled');
  });

  it('a stale worker loses the fence, fails, and cannot clobber the new owner', async () => {
    const runnerA = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 1_000,
      tickMs: TICK_MS, pollMs: 15,
    });
    await runnerA.start();
    const ticksAtStart = runnerA.stats.ticksStepped;
    // A different worker force-takes the region: epoch bumps, A's fence is dead.
    const usurper = randomUUID();
    const leaseB = await acquireRegionLease({ regionId: fx.regionId, workerId: usurper, leaseMs: 60_000, forceTakeover: true });
    await waitFor(async () => runnerA.isFailed, 8000, 50);
    expect(runnerA.isFailed).toBe(true);
    const row = await regionRow(fx.regionId);
    expect(row?.owner_worker_id).toBe(usurper);
    expect(row?.lifecycle).not.toBe('failed'); // A must not clobber B's region
    const ticksFrozen = runnerA.stats.ticksStepped;
    await sleep(120);
    expect(runnerA.stats.ticksStepped).toBe(ticksFrozen);
    void ticksAtStart; void leaseB;
    // Hand the region back for subsequent tests.
    await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 300_000, forceTakeover: true });
    await setRegionLifecycle(fx.regionId, 'active');
  });

  it('checkpoints on stop and a new runner restores snapshot + replays the journal', async () => {
    const runnerA = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
    });
    await runnerA.start();
    await waitFor(async () => (runnerA.currentGame?.tick ?? 0) > 30);
    const tickA = runnerA.currentGame!.tick;
    await runnerA.stop();

    const snap = await latestSnapshot(fx.regionId);
    expect(snap).toBeTruthy();
    expect(BigInt(snap!.tick)).toBe(BigInt(tickA));
    expect(snap!.payload.length).toBeGreaterThan(100);

    // A command committed while no runner owns the sim replays on recovery.
    const lease = await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000 });
    const row = await regionRow(fx.regionId);
    const replayCommandId = randomUUID();
    const res = await submitCommand({
      playerId: fx.players[0].playerId,
      rawMessage: { ...commandMessage(fx, { t: 'ping', x: 1, y: 2 }, lease.epoch), commandId: replayCommandId },
      fence: { workerId: fx.workerId, epoch: lease.epoch },
      tick: BigInt(row!.last_committed_tick),
    });
    expect(res.status).toBe('committed');

    // A durable job scheduled before the "crash" fires after recovery.
    const jobKind = 'restart_marker';
    const fired: string[] = [];
    const runnerB = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      jobHandlers: {
        [jobKind]: async (_tx, job: ClaimedJob) => { fired.push(String(job.job_id)); return { ok: true }; },
      },
    });
    await scheduleJob({ regionId: fx.regionId, kind: jobKind, dueAtMs: Date.now() + 60, payload: {} });
    await runnerB.start();
    try {
      // The replayed ping is applied exactly once after restore.
      await waitFor(async () => {
        const intent = await mmoOne<{ status: string }>(
          'select status from command_intent where player_id = $1 and command_id = $2',
          [fx.players[0].playerId, replayCommandId]);
        return intent?.status === 'applied';
      });
      const event = await mmoOne<{ applied_at: Date | null; application_result: unknown; authority_epoch: string }>(
        'select applied_at, application_result, authority_epoch from region_event where region_id = $1 and event_seq = $2',
        [fx.regionId, res.eventSeq!]);
      expect(event?.applied_at).not.toBeNull();
      expect(BigInt(event!.authority_epoch)).toBe(BigInt(lease.epoch));

      // The pre-crash job fired under the new owner. The handler records before the
      // apply transaction commits, so wait for the durable 'done' state.
      await waitFor(async () => fired.length === 1, 8000);
      await waitFor(async () => {
        const job = await mmoOne<{ state: string }>(
          `select state from scheduled_job where region_id = $1 and kind = $2 order by created_at desc limit 1`,
          [fx.regionId, jobKind]);
        return job?.state === 'done';
      }, 8000);
      const job = await mmoOne<{ state: string }>(
        `select state from scheduled_job where region_id = $1 and kind = $2 order by created_at desc limit 1`,
        [fx.regionId, jobKind]);
      expect(job?.state).toBe('done');

      // Determinism across the restart is proven at engine level by the PW21
      // snapshot tests; here we verify the runner resumed past the checkpoint tick
      // and keeps stepping under the new epoch.
      expect(runnerB.currentGame!.tick).toBeGreaterThanOrEqual(tickA);
      await waitFor(async () => runnerB.currentGame!.tick > tickA + 10);
      expect(typeof runnerB.currentGame!.checksum()).toBe('number');
    } finally {
      await runnerB.stop();
    }
  });

  it('reclaimExpiredJobs returns crashed claims to pending for retry', async () => {
    const jobId = await scheduleJob({
      regionId: fx.regionId, kind: 'crash_marker', dueAtMs: Date.now() - 1, payload: {},
    });
    const lease = await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000 });
    const claimed = await claimDueJobs({
      regionId: fx.regionId, workerId: fx.workerId, nowMs: Date.now(), leaseMs: 50,
      authorityEpoch: lease.epoch,
    });
    expect(claimed.find(j => j.job_id === jobId)).toBeDefined();
    // Claim lease (50 ms) expires without finishJob — simulates a worker crash.
    await sleep(80);
    const reclaimed = await reclaimExpiredJobs({ nowMs: Date.now() + 100 });
    expect(reclaimed).toBeGreaterThanOrEqual(1);
    const row = await mmoOne<{ state: string; attempts: number }>(
      'select state, attempts from scheduled_job where job_id = $1', [jobId]);
    expect(row?.state).toBe('pending');
    expect(row?.attempts).toBe(1); // the crashed attempt counted; retry will claim again
    // Clean up: claim and cancel so no later runner fires an unknown kind forever.
    const again = await claimDueJobs({
      regionId: fx.regionId, workerId: fx.workerId, nowMs: Date.now(), leaseMs: 60_000,
      authorityEpoch: lease.epoch,
    });
    if (again.find(j => j.job_id === jobId)) await finishJob(jobId, 'cancelled');
  });
});
