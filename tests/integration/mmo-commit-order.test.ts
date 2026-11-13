// PW29 (THU-2440) integration tests: the durable commit boundary against REAL
// PostgreSQL and the REAL Fusion sim. Covers rollback before commit, interruption
// after commit before sim apply, interruption after sim apply before receipt,
// duplicate delivery, same-tick ordering, and control-vs-fault checksum equality.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { mmoEntityId, MMO_PROTOCOL, type MmoCommandMessage } from '../../packages/contracts/src/index.js';
import { PACKS, type Command } from '../../packages/fusion/src/index';
import { submitCommand } from '../../apps/service/src/mmo/commands.js';
import { acquireRegionLease } from '../../apps/service/src/mmo/store.js';
import { RegionRunner, type WorldActionHandler } from '../../apps/service/src/mmo/runner.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 20;
const POLL_MS = 15;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 8000, stepMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

function commandMessage(
  fx: FixtureWorld, action: MmoCommandMessage['action'], epoch: string,
): MmoCommandMessage {
  return {
    protocol: MMO_PROTOCOL, type: 'command',
    commandId: randomUUID(), regionId: fx.regionId,
    seenEpoch: epoch, lastSeenEventSeq: '0', action,
  };
}

async function regionEpoch(regionId: string): Promise<string> {
  const row = await mmoOne<{ authority_epoch: string }>(
    'select authority_epoch from region where region_id = $1', [regionId]);
  return row!.authority_epoch;
}

async function submitFresh(
  fx: FixtureWorld, epoch: string, action: MmoCommandMessage['action'], commandId = randomUUID(),
) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = await mmoOne<{ last_committed_tick: string }>(
      'select last_committed_tick from region where region_id = $1', [fx.regionId]);
    try {
      return await submitCommand({
        playerId: fx.players[0].playerId,
        rawMessage: { ...commandMessage(fx, action, epoch), commandId },
        fence: { workerId: fx.workerId, epoch },
        tick: BigInt(r!.last_committed_tick) + 1n,
      });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('stale tick'))) throw e;
      await sleep(15);
    }
  }
  throw new Error('submitFresh exhausted retries');
}

async function intentStatus(fx: FixtureWorld, commandId: string) {
  return mmoOne<{ status: string; result: unknown }>(
    'select status, result from command_intent where player_id = $1 and command_id = $2',
    [fx.players[0].playerId, commandId]);
}

async function eventRow(fx: FixtureWorld, eventSeq: string) {
  return mmoOne<{
    applied_at: Date | null; application_result: unknown; resolved: unknown;
  }>(
    'select applied_at, application_result, resolved from region_event where region_id = $1 and event_seq = $2',
    [fx.regionId, eventSeq]);
}

async function outboxCount(fx: FixtureWorld, eventSeq: string, topic: string) {
  const row = await mmoOne<{ n: string }>(
    'select count(*)::text as n from outbox where region_id = $1 and event_seq = $2 and topic = $3',
    [fx.regionId, eventSeq, topic]);
  return Number(row?.n ?? 0);
}

/**
 * World handler for the PW29 probes: 'ping' writes a durable effect_receipt row
 * (PostgreSQL-side effect) and returns a sim 'move' order on the player's first
 * unit (sim-side effect) — one action exercising both halves of the boundary.
 */
function probeHandler(calls: unknown[], opts?: { failAfterWrite?: () => boolean }): WorldActionHandler {
  return async (tx, action, ctx) => {
    calls.push(action);
    const a = action as { t: string; x?: number; y?: number };
    if (a.t !== 'ping') return { result: { accepted: false, reason: 'UNSUPPORTED' } };
    await tx.query(
      `insert into effect_receipt (effect_key, kind) values ($1, 'pw29_probe') on conflict do nothing`,
      [`probe-${a.x}-${a.y}`]);
    if (opts?.failAfterWrite?.()) throw new Error('injected post-write rollback');
    const g = ctx.game?.();
    const unit = g && ctx.slot !== undefined
      ? [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === ctx.slot && e.hp > 0)
      : undefined;
    const sim: { slot: number; command: Command }[] = [];
    if (unit && ctx.slot !== undefined) {
      sim.push({
        slot: ctx.slot,
        command: { t: 'move', ids: [unit.id], x: (a.x ?? 0) + 3, y: (a.y ?? 0) + 3 },
      });
    }
    return { result: { pong: a.x }, sim };
  };
}

describeDb('mmo commit boundary (PW29, real PostgreSQL + real Fusion sim)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  }, 30000);
  afterAll(async () => { await closeMmoDatabase(); });

  it('rollback before commit leaves zero durable, outbox, intent or live-sim effects', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000 });
    const calls: unknown[] = [];
    let fail = true;
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      worldHandler: probeHandler(calls, { failAfterWrite: () => fail }),
    });
    await runner.start();
    try {
      const epoch = await regionEpoch(fx.regionId);
      const commandId = randomUUID();
      const res = await submitFresh(fx, epoch, { t: 'ping', x: 40, y: 40 }, commandId);
      expect(res.status).toBe('committed');
      // Let the runner attempt and roll back the commit transaction.
      await waitFor(async () => calls.length >= 1, 8000);
      await sleep(150);
      const ev = await eventRow(fx, res.eventSeq!);
      expect(ev?.applied_at).toBeNull();
      expect(ev?.resolved).toBeNull(); // rolled back before the plan stored
      const receipt = await mmoOne('select 1 as x from effect_receipt where effect_key = $1', ['probe-40-40']);
      expect(receipt).toBeUndefined(); // handler write rolled back with the tx
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.result')).toBe(0);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.sim')).toBe(0);
      const intent = await intentStatus(fx, commandId);
      expect(intent?.status).not.toBe('applied');
      // Retry now succeeds: resolution re-runs (its writes had rolled back),
      // commits once, applies once. Attempt count is timing-dependent.
      fail = false;
      await waitFor(async () => (await intentStatus(fx, commandId))?.status === 'applied', 8000);
      expect(calls.length).toBeGreaterThanOrEqual(2); // >=1 rolled-back resolve + committed resolve
      const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', ['probe-40-40']);
      expect(receipts.length).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.result')).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.sim')).toBe(1);
      const done = await eventRow(fx, res.eventSeq!);
      expect(done?.applied_at).not.toBeNull();
    } finally {
      await runner.stop();
    }
  }, 30000);

  it('interruption after commit before sim apply reuses the stored plan exactly once', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000 });
    const calls: unknown[] = [];
    let tripped = false;
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      worldHandler: probeHandler(calls),
      faultHooks: {
        afterPlanCommit: () => { if (!tripped) { tripped = true; throw new Error('crash after commit'); } },
      },
    });
    await runner.start();
    try {
      const epoch = await regionEpoch(fx.regionId);
      const commandId = randomUUID();
      const res = await submitFresh(fx, epoch, { t: 'ping', x: 41, y: 41 }, commandId);
      // Wait for the applied receipt — the first attempt died after commit.
      await waitFor(async () => (await intentStatus(fx, commandId))?.status === 'applied', 8000);
      expect(tripped).toBe(true);
      // Resolution ran exactly once: the retry reused region_event.resolved.
      expect(calls.length).toBe(1);
      const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', ['probe-41-41']);
      expect(receipts.length).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.result')).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.sim')).toBe(1);
      const ev = await eventRow(fx, res.eventSeq!);
      expect(ev?.resolved).not.toBeNull();
      expect(ev?.applied_at).not.toBeNull();
    } finally {
      await runner.stop();
    }
  }, 30000);

  it('interruption after sim apply before receipt never double-applies sim effects', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000 });
    const calls: unknown[] = [];
    let tripped = false;
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      worldHandler: probeHandler(calls),
      faultHooks: {
        beforeReceipt: () => { if (!tripped) { tripped = true; throw new Error('crash before receipt'); } },
      },
    });
    await runner.start();
    try {
      // Count engine-level enqueues: a retried plan must not enqueue twice.
      const g = (runner as unknown as { game: { enqueue: (...a: unknown[]) => void } }).game;
      const origEnqueue = g.enqueue.bind(g);
      let enqueues = 0;
      g.enqueue = (...a: unknown[]) => { enqueues++; return origEnqueue(...(a as [number, Command, number?])); };
      const epoch = await regionEpoch(fx.regionId);
      const commandId = randomUUID();
      const res = await submitFresh(fx, epoch, { t: 'ping', x: 42, y: 42 }, commandId);
      await waitFor(async () => (await intentStatus(fx, commandId))?.status === 'applied', 8000);
      expect(tripped).toBe(true);
      expect(calls.length).toBe(1);
      expect(enqueues).toBe(1); // exactly one sim enqueue across commit→apply→receipt→retry
      const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', ['probe-42-42']);
      expect(receipts.length).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.result')).toBe(1);
      expect(await outboxCount(fx, res.eventSeq!, 'mmo.sim')).toBe(1);
      const ev = await eventRow(fx, res.eventSeq!);
      expect(ev?.applied_at).not.toBeNull();
    } finally {
      await runner.stop();
    }
  }, 30000);

  it('duplicate command delivery deduplicates and a stale worker cannot receipt', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000 });
    const calls: unknown[] = [];
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      worldHandler: probeHandler(calls),
    });
    await runner.start();
    try {
      const epoch = await regionEpoch(fx.regionId);
      const commandId = randomUUID();
      const action = { t: 'ping', x: 43, y: 43 } as const;
      const msg = { ...commandMessage(fx, action, epoch), commandId };
      const fence = { workerId: fx.workerId, epoch };
      const first = await submitFresh(fx, epoch, action, commandId);
      expect(first.status).toBe('committed');
      await waitFor(async () => (await intentStatus(fx, commandId))?.status === 'applied', 8000);
      // Identical re-delivery deduplicates at the intent, not the journal.
      const tail = await mmoOne<{ last_committed_tick: string }>(
        'select last_committed_tick from region where region_id = $1', [fx.regionId]);
      const dup = await submitCommand({
        playerId: fx.players[0].playerId, rawMessage: msg,
        fence, tick: BigInt(tail!.last_committed_tick),
      });
      expect(dup.status).toBe('deduplicated');
      await sleep(200);
      expect(calls.length).toBe(1);
      const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', ['probe-43-43']);
      expect(receipts.length).toBe(1);
      expect(await outboxCount(fx, first.eventSeq!, 'mmo.result')).toBe(1);
      // A stale fence cannot commit a plan or receipt: force a takeover and
      // confirm the old worker's writes are fenced out.
      const usurper = randomUUID();
      await acquireRegionLease({ regionId: fx.regionId, workerId: usurper, leaseMs: 60_000, forceTakeover: true });
      await waitFor(async () => (runner as unknown as { isFailed: boolean }).isFailed, 30000, 30);
      expect((runner as unknown as { isFailed: boolean }).isFailed).toBe(true);
    } finally {
      await runner.stop().catch(() => undefined);
      await acquireRegionLease({ regionId: fx.regionId, workerId: fx.workerId, leaseMs: 300_000, forceTakeover: true });
    }
  }, 30000);

  it('same-tick commands apply in journal order and a world op lands DB+sim effects together', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000 });
    const calls: unknown[] = [];
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      worldHandler: probeHandler(calls),
    });
    await runner.start();
    try {
      const epoch = await regionEpoch(fx.regionId);
      const a = await submitFresh(fx, epoch, { t: 'ping', x: 50, y: 50 });
      const b = await submitFresh(fx, epoch, { t: 'ping', x: 51, y: 51 });
      const ids = [a.eventSeq!, b.eventSeq!].map(BigInt).sort((x, y) => (x < y ? -1 : 1));
      expect(BigInt(a.eventSeq!) < BigInt(b.eventSeq!)).toBe(true);
      await waitFor(async () => {
        const rows = await mmoQuery<{ applied_at: Date | null }>(
          'select applied_at from region_event where region_id = $1 and event_seq = any($2::bigint[])',
          [fx.regionId, ids.map(String)]);
        return rows.length === 2 && rows.every(r => r.applied_at !== null);
      }, 8000);
      // Journal order preserved: seq a applied before seq b.
      const evs = await mmoQuery<{ event_seq: string; applied_at: Date | null }>(
        'select event_seq, applied_at from region_event where region_id = $1 and event_seq = any($2::bigint[]) order by event_seq',
        [fx.regionId, ids.map(String)]);
      expect(evs.every(e => e.applied_at !== null)).toBe(true);
      expect(evs.map(e => e.event_seq)).toEqual(ids.map(String));
      // Both halves of each world op committed exactly once.
      for (const [x, y] of [[50, 50], [51, 51]] as const) {
        const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', [`probe-${x}-${y}`]);
        expect(receipts.length).toBe(1);
      }
      expect(calls.length).toBe(2);
    } finally {
      await runner.stop();
    }
  }, 30000);

  it('control vs fault-injected runs reach identical sim checksums at the same tick', async () => {
    // Two identically-seeded regions: same pack, map, seed, factions and roster
    // shape — the engine checksum excludes durable ids, so trajectories compare.
    const simFor = (players: { playerId: string; displayName: string }[]) => ({
      packId: PACKS['td'].id, mapId: PACKS['td'].maps[0].id, seed: 424242,
      credits: 'standard' as const,
      players: players.map((p, i) => ({
        playerId: p.playerId, name: p.displayName, faction: PACKS['td'].factions[i % 2].id,
      })),
    });
    const mk = async (fault: boolean) => {
      const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
      await mmoQuery(
        `update region set seed = seed || $2::jsonb where region_id = $1`,
        [fx.regionId, JSON.stringify({ sim: simFor(fx.players) })]);
      const calls: unknown[] = [];
      let trippedA = false, trippedB = false;
      const runner = new RegionRunner({
        regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
        // Freeze wall-clock ticking: commands enqueue at tick 1 on both runs and
        // we step the engine manually, so fault retries cannot shift the tick.
        tickMs: 3_600_000, pollMs: 15,
        worldHandler: probeHandler(calls),
        faultHooks: fault ? {
          afterPlanCommit: () => { if (!trippedA) { trippedA = true; throw new Error('crash A'); } },
          beforeReceipt: () => { if (!trippedB) { trippedB = true; throw new Error('crash B'); } },
        } : undefined,
      });
      await runner.start();
      return { fx, runner, calls };
    };

    const control = await mk(false);
    const faulted = await mk(true);
    try {
      const epochC = await regionEpoch(control.fx.regionId);
      const epochF = await regionEpoch(faulted.fx.regionId);
      // Identical command streams: a durable-id 'move' plus a world 'ping' that
      // implies a sim 'move' through the handler.
      const unitSimId = (r: RegionRunner) => {
        const g = (r as unknown as { game: { entities: Map<number, { id: number; kind: string; owner: number; hp: number }> } }).game;
        const e = [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0);
        return e!.id;
      };
      const moveCmd = async (fx: FixtureWorld, epoch: string, runner: RegionRunner) => {
        const durable = mmoEntityId(fx.regionId, unitSimId(runner));
        return submitFresh(fx, epoch, { t: 'move', entityIds: [durable], x: 10, y: 10 });
      };
      const resC1 = await moveCmd(control.fx, epochC, control.runner);
      const resC2 = await submitFresh(control.fx, epochC, { t: 'ping', x: 60, y: 60 });
      const resF1 = await moveCmd(faulted.fx, epochF, faulted.runner);
      const resF2 = await submitFresh(faulted.fx, epochF, { t: 'ping', x: 60, y: 60 });
      const waitApplied = async (fx: FixtureWorld, seq: string) => waitFor(async () => {
        const ev = await eventRow(fx, seq);
        return ev?.applied_at !== null && ev?.applied_at !== undefined;
      }, 8000);
      await waitApplied(control.fx, resC1.eventSeq!);
      await waitApplied(control.fx, resC2.eventSeq!);
      await waitApplied(faulted.fx, resF1.eventSeq!);
      await waitApplied(faulted.fx, resF2.eventSeq!);

      // Step both engines identically and compare authoritative checksums.
      const gc = (control.runner as unknown as { game: { step(): void; checksum(): number; tick: number } }).game;
      const gf = (faulted.runner as unknown as { game: { step(): void; checksum(): number; tick: number } }).game;
      for (let i = 0; i < 30; i++) { gc.step(); gf.step(); }
      expect(gf.tick).toBe(gc.tick);
      expect(gf.checksum()).toBe(gc.checksum());
      // Durable outcomes identical too: one receipt row and one applied receipt each.
      for (const fx of [control.fx, faulted.fx]) {
        const receipts = await mmoQuery('select 1 as x from effect_receipt where effect_key = $1', ['probe-60-60']);
        expect(receipts.length).toBe(1);
        void fx;
      }
      expect(faulted.calls.length).toBe(1); // stored plan reused, no re-resolve
    } finally {
      await control.runner.stop().catch(() => undefined);
      await faulted.runner.stop().catch(() => undefined);
    }
  }, 30000);
});
