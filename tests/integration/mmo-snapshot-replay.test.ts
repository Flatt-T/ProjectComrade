// PW30 (THU-2441) integration tests: snapshot recovery replays EVERY committed
// journal event after the checkpoint — including rows already marked applied —
// at its recorded tick, against REAL PostgreSQL and the REAL Fusion sim.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { mmoEntityId, MMO_PROTOCOL, type MmoCommandMessage } from '../../packages/contracts/src/index.js';
import { PACKS } from '../../packages/fusion/src/index';
import { submitCommand } from '../../apps/service/src/mmo/commands.js';
import { acquireRegionLease } from '../../apps/service/src/mmo/store.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 3_600_000; // freeze wall-clock ticking: the sim only advances via journal ticks and manual steps
const POLL_MS = 15;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15000, stepMs = 20): Promise<void> {
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
  fx: FixtureWorld, workerId: string, epoch: string,
  action: MmoCommandMessage['action'], commandId = randomUUID(),
) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = await mmoOne<{ last_committed_tick: string }>(
      'select last_committed_tick from region where region_id = $1', [fx.regionId]);
    try {
      return await submitCommand({
        playerId: fx.players[0].playerId,
        rawMessage: { ...commandMessage(fx, action, epoch), commandId },
        fence: { workerId, epoch },
        tick: BigInt(r!.last_committed_tick) + 1n,
      });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('stale tick'))) throw e;
      await sleep(15);
    }
  }
  throw new Error('submitFresh exhausted retries');
}

async function eventApplied(fx: FixtureWorld, eventSeq: string): Promise<boolean> {
  const ev = await mmoOne<{ applied_at: Date | null }>(
    'select applied_at from region_event where region_id = $1 and event_seq = $2',
    [fx.regionId, eventSeq]);
  return ev?.applied_at != null;
}

interface SimGame {
  tick: number; checksum(): number;
  entities: Map<number, { id: number; kind: string; type: string; owner: number; hp: number; x: number; y: number; cx: number; cy: number; order: string; path: number[] }>;
  players: { credits: number; slot: number }[];
  step(): void;
}
function gameOf(runner: RegionRunner): SimGame {
  return (runner as unknown as { game: SimGame }).game;
}
function unitSimId(runner: RegionRunner, slot = 0): number {
  const g = gameOf(runner);
  const e = [...g.entities.values()].find(e => e.kind === 'unit' && e.owner === slot && e.hp > 0);
  if (!e) throw new Error('no live unit for slot ' + slot);
  return e.id;
}
function moveAction(fx: FixtureWorld, runner: RegionRunner, x: number, y: number): MmoCommandMessage['action'] {
  return { t: 'move', entityIds: [mmoEntityId(fx.regionId, unitSimId(runner))], x, y };
}
const dumpGame = (g: SimGame) => ({
  tick: g.tick, credits: g.players.map(p => p.credits),
  ents: [...g.entities.values()].map(e => [e.id, e.type, e.kind, e.owner, e.cx, e.cy, Math.round(e.x), Math.round(e.y), e.hp]).sort((a, b) => Number(a[0]) - Number(b[0])),
});
function expectChecksumEqual(gC: SimGame, gF: SimGame) {
  if (gF.checksum() !== gC.checksum()) {
    console.log('CONTROL', JSON.stringify(dumpGame(gC)));
    console.log('FAULTED', JSON.stringify(dumpGame(gF)));
  }
  expect(gF.checksum()).toBe(gC.checksum());
}
async function journalTail(fx: FixtureWorld) {
  const row = await mmoOne<{ last_committed_seq: string; last_committed_tick: string }>(
    'select last_committed_seq, last_committed_tick from region where region_id = $1', [fx.regionId]);
  return row!;
}
async function commandJournalTail(fx: FixtureWorld) {
  const rows = await mmoQuery<{ simulation_tick: string; resolved: unknown; payload: unknown }>(
    `select simulation_tick::text, resolved, payload from region_event
      where region_id = $1 and event_kind = 'command' order by simulation_tick, event_seq`, [fx.regionId]);
  return rows.map(r => {
    const p = r.payload as { action?: { t?: string; x?: number; y?: number; entityIds?: string[] } };
    const a = p?.action ?? {};
    return {
      tick: r.simulation_tick,
      // Action identity + target coords + trailing sim ids (durable id
      // prefixes, playerIds and commandIds legitimately differ per region).
      t: a.t, x: a.x, y: a.y,
      sims: (a.entityIds ?? []).map(id => id.slice(-12)),
    };
  });
}
async function snapshotCount(fx: FixtureWorld): Promise<number> {
  const row = await mmoOne<{ n: string }>(
    'select count(*)::text as n from region_snapshot where region_id = $1', [fx.regionId]);
  return Number(row?.n ?? 0);
}

/** Identical sim spec across fixture worlds so engine checksums compare. */
async function pinIdenticalSim(fx: FixtureWorld) {
  await mmoQuery(
    `update region set seed = seed || $2::jsonb where region_id = $1`,
    [fx.regionId, JSON.stringify({
      sim: {
        packId: PACKS['td'].id, mapId: PACKS['td'].maps[0].id, seed: 777001,
        credits: 'standard',
        players: [{ playerId: fx.players[0].playerId, name: fx.players[0].displayName, faction: PACKS['td'].factions[0].id }],
      },
    })]);
}

function mkRunner(fx: FixtureWorld, workerId: string) {
  return new RegionRunner({
    regionId: fx.regionId, workerId, leaseMs: 300_000,
    tickMs: TICK_MS, pollMs: POLL_MS,
    quiescence: { enabled: false }, // deterministic: no mid-test hibernation
  });
}

async function hardKill(runner: RegionRunner, fx: FixtureWorld, usurper: string): Promise<void> {
  // Force a lease takeover with no checkpoint: the old runner loses its fence on
  // the next poll and fails without writing a snapshot — a hard kill. Its
  // timers are already stopped by fail(); stop() is deliberately NOT called
  // because it would write a fresh checkpoint and hide the tail-replay path.
  await acquireRegionLease({ regionId: fx.regionId, workerId: usurper, leaseMs: 300_000, forceTakeover: true });
  await waitFor(async () => (runner as unknown as { isFailed: boolean }).isFailed, 15000, 30);
}

describeDb('mmo snapshot tail replay (PW30, real PostgreSQL + real Fusion sim)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  }, 30000);
  afterAll(async () => { await closeMmoDatabase(); });

  it('control vs hard-killed runner with older checkpoint and applied rows after it', async () => {
    const control = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    const faulted = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    await pinIdenticalSim(control);
    await pinIdenticalSim(faulted);

    const runnerC = mkRunner(control, control.workerId);
    const runnerF = mkRunner(faulted, faulted.workerId);
    await runnerC.start();
    await runnerF.start();
    try {
      const epochC = await regionEpoch(control.regionId);
      const epochF = await regionEpoch(faulted.regionId);

      // Batch A: real gameplay (unit movement) — applied, then checkpointed.
      const cmdIds: string[] = [];
      const nextId = () => { const id = randomUUID(); cmdIds.push(id); return id; };
      const aC = await submitFresh(control, control.workerId, epochC, moveAction(control, runnerC, 12, 12), nextId());
      const aF = await submitFresh(faulted, faulted.workerId, epochF, moveAction(faulted, runnerF, 12, 12), nextId());
      await waitFor(async () => await eventApplied(control, aC.eventSeq!) && await eventApplied(faulted, aF.eventSeq!), 15000);
      await runnerF.checkpoint('manual');
      const snapSeq = (await mmoOne<{ n: string }>(
        'select last_applied_seq::text as n from region_snapshot where region_id = $1 order by created_at desc limit 1',
        [faulted.regionId]))!.n;

      // Batch B: more committed+applied events AFTER the checkpoint — the sim
      // effects live only in the journal tail the snapshot never saw.
      const bC1 = await submitFresh(control, control.workerId, epochC, moveAction(control, runnerC, 20, 20), nextId());
      const bF1 = await submitFresh(faulted, faulted.workerId, epochF, moveAction(faulted, runnerF, 20, 20), nextId());
      const bC2 = await submitFresh(control, control.workerId, epochC, { t: 'stop', entityIds: [mmoEntityId(control.regionId, unitSimId(runnerC))] }, nextId());
      const bF2 = await submitFresh(faulted, faulted.workerId, epochF, { t: 'stop', entityIds: [mmoEntityId(faulted.regionId, unitSimId(runnerF))] }, nextId());
      await waitFor(async () =>
        (await eventApplied(control, bC1.eventSeq!)) && (await eventApplied(control, bC2.eventSeq!))
        && (await eventApplied(faulted, bF1.eventSeq!)) && (await eventApplied(faulted, bF2.eventSeq!)), 15000);

      // Hard kill: lease takeover, no checkpoint. Journal tail stays ahead of snap.
      const usurper = randomUUID();
      await hardKill(runnerF, faulted, usurper);
      const tailBefore = await journalTail(faulted);
      expect(BigInt(tailBefore.last_committed_seq)).toBeGreaterThan(BigInt(snapSeq));

      // Restart under the usurper's fence: restore snap + replay the whole tail.
      const runnerF2 = mkRunner(faulted, usurper);
      await runnerF2.start();
      try {
        // Step both engines identically and compare authoritative checksums.
        const gC = gameOf(runnerC); const gF = gameOf(runnerF2);
        for (let i = 0; i < 60; i++) { gC.step(); gF.step(); }
        expect(gF.tick).toBe(gC.tick);
        expectChecksumEqual(gC, gF);
        // Replay is sim-only: the journal tail is byte-identical across the kill.
        expect(await journalTail(faulted)).toEqual(tailBefore);
        // Every submitted intent reached 'applied' exactly once (command_id is
        // a uuid — unique across both fixture players).
        for (const commandId of cmdIds) {
          const intent = await mmoOne<{ status: string }>(
            'select status from command_intent where command_id = $1', [commandId]);
          expect(intent?.status).toBe('applied');
        }
        // Each batch-B event fanned out exactly one applied receipt + one sim mirror.
        for (const seq of [bF1.eventSeq!, bF2.eventSeq!]) {
          const res = await mmoOne<{ n: string }>(
            `select count(*)::text as n from outbox where region_id = $1 and event_seq = $2 and topic = 'mmo.result'`,
            [faulted.regionId, seq]);
          const sim = await mmoOne<{ n: string }>(
            `select count(*)::text as n from outbox where region_id = $1 and event_seq = $2 and topic = 'mmo.sim'`,
            [faulted.regionId, seq]);
          expect(Number(res?.n)).toBe(1);
          expect(Number(sim?.n)).toBe(1);
        }
        // Player-visible balances match (credits are sim-authoritative).
        expect(gF.players.map(p => p.credits)).toEqual(gC.players.map(p => p.credits));

        // Post-restore command succeeds on the recovered runner.
        const epochF2 = await regionEpoch(faulted.regionId);
        const post = await submitFresh(faulted, usurper, epochF2, moveAction(faulted, runnerF2, 30, 30));
        expect(post.status).toBe('committed');
        await waitFor(async () => await eventApplied(faulted, post.eventSeq!), 15000);
        // Mirror the same order on the control so both sims stay identical.
        const epochC2 = await regionEpoch(control.regionId);
        const postC = await submitFresh(control, control.workerId, epochC2, moveAction(control, runnerC, 30, 30));
        expect(postC.status).toBe('committed');
        await waitFor(async () => await eventApplied(control, postC.eventSeq!), 15000);

        // Restart twice: stop-checkpoint then a third runner restores cleanly.
        const obs2 = { tick: gF.tick, checksum: gF.checksum() };
        await runnerF2.stop();
        const runnerF3 = mkRunner(faulted, usurper);
        await runnerF3.start();
        try {
          const gF3 = gameOf(runnerF3);
          expect(gF3.tick).toBe(obs2.tick);
          expect(gF3.checksum()).toBe(obs2.checksum);
          for (let i = 0; i < 30; i++) { gC.step(); gF3.step(); }
          // Wall-clock catch-up can leave the recovered sim one tick apart;
          // align ticks, then step until the move orders complete so both
          // units rest on identical cells before comparing checksums.
          for (let i = 0; i < 10 && gC.tick !== gF3.tick; i++) {
            if (gC.tick < gF3.tick) gC.step(); else gF3.step();
          }
          for (let i = 0; i < 600; i++) {
            gC.step(); gF3.step();
            const moving = (g: SimGame) => [...g.entities.values()].some(e => e.kind === 'unit' && e.hp > 0 && (e.order === 'move' || (e.path?.length ?? 0) > 0));
            if (i > 30 && !moving(gC) && !moving(gF3)) break;
          }
          expect(gF3.tick).toBe(gC.tick);
          expectChecksumEqual(gC, gF3);
        } finally {
          await runnerF3.stop().catch(() => undefined);
        }
      } finally {
        await runnerF2.stop().catch(() => undefined);
      }
    } finally {
      await runnerC.stop().catch(() => undefined);
    }
  }, 120000);

  it('genesis replay rebuilds the sim from the journal when every checkpoint is lost', async () => {
    const control = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    const faulted = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    await pinIdenticalSim(control);
    await pinIdenticalSim(faulted);

    const runnerC = mkRunner(control, control.workerId);
    const runnerF = mkRunner(faulted, faulted.workerId);
    await runnerC.start();
    await runnerF.start();
    try {
      const epochC = await regionEpoch(control.regionId);
      const epochF = await regionEpoch(faulted.regionId);
      // Same committed gameplay on both, including a same-boundary pair.
      const cmds: [FixtureWorld, string, RegionRunner][] = [
        [control, control.workerId, runnerC], [faulted, faulted.workerId, runnerF],
      ];
      const seqs: string[] = [];
      for (const [fx, wid, r] of cmds) {
        const ep = fx === control ? epochC : epochF;
        const r1 = await submitFresh(fx, wid, ep, moveAction(fx, r, 8, 8));
        const r2 = await submitFresh(fx, wid, ep, moveAction(fx, r, 14, 14));
        seqs.push(r1.eventSeq!, r2.eventSeq!);
      }
      await waitFor(async () =>
        (await eventApplied(control, seqs[0])) && (await eventApplied(control, seqs[1]))
        && (await eventApplied(faulted, seqs[2])) && (await eventApplied(faulted, seqs[3])), 15000);
      // Force an interval checkpoint on the faulted runner, then destroy ALL
      // checkpoints — recovery must rebuild from genesis + full journal replay.
      await runnerF.checkpoint('manual');
      expect(await snapshotCount(faulted)).toBeGreaterThan(0);
      await mmoQuery('delete from region_snapshot where region_id = $1', [faulted.regionId]);
      expect(await snapshotCount(faulted)).toBe(0);

      const usurper = randomUUID();
      await hardKill(runnerF, faulted, usurper);
      const runnerF2 = mkRunner(faulted, usurper);
      await runnerF2.start();
      try {
        const gC = gameOf(runnerC); const gF = gameOf(runnerF2);
        for (let i = 0; i < 60; i++) { gC.step(); gF.step(); }
        expect(gF.tick).toBe(gC.tick);
        expectChecksumEqual(gC, gF);
        // Command journal tails agree on execution ticks (raw seqs differ
        // because wall-clock scheduled evals interleave differently).
        expect(await commandJournalTail(faulted)).toEqual(await commandJournalTail(control));
      } finally {
        await runnerF2.stop().catch(() => undefined);
      }
    } finally {
      await runnerC.stop().catch(() => undefined);
    }
  }, 120000);

  it('a corrupt newest checkpoint falls back to the older verified one plus replay', async () => {
    const control = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    const faulted = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 1 });
    await pinIdenticalSim(control);
    await pinIdenticalSim(faulted);

    const runnerC = mkRunner(control, control.workerId);
    const runnerF = mkRunner(faulted, faulted.workerId);
    await runnerC.start();
    await runnerF.start();
    try {
      const epochC = await regionEpoch(control.regionId);
      const epochF = await regionEpoch(faulted.regionId);
      // Batch A → checkpoint snap1; batch B → checkpoint snap2 (newest).
      const aC = await submitFresh(control, control.workerId, epochC, moveAction(control, runnerC, 5, 5));
      const aF = await submitFresh(faulted, faulted.workerId, epochF, moveAction(faulted, runnerF, 5, 5));
      await waitFor(async () => await eventApplied(control, aC.eventSeq!) && await eventApplied(faulted, aF.eventSeq!), 15000);
      await runnerF.checkpoint('snap1');
      const bC = await submitFresh(control, control.workerId, epochC, moveAction(control, runnerC, 25, 25));
      const bF = await submitFresh(faulted, faulted.workerId, epochF, moveAction(faulted, runnerF, 25, 25));
      await waitFor(async () => await eventApplied(control, bC.eventSeq!) && await eventApplied(faulted, bF.eventSeq!), 15000);
      await runnerF.checkpoint('snap2');
      expect(await snapshotCount(faulted)).toBe(2);
      // Corrupt the newest payload digest: validation must reject it.
      await mmoQuery(
        `update region_snapshot set payload_sha256 = 'corrupt'
          where region_id = $1 and snapshot_id = (
            select snapshot_id from region_snapshot where region_id = $1
            order by last_applied_seq desc, created_at desc limit 1)`,
        [faulted.regionId]);

      const usurper = randomUUID();
      await hardKill(runnerF, faulted, usurper);
      const runnerF2 = mkRunner(faulted, usurper);
      await runnerF2.start();
      try {
        const gC = gameOf(runnerC); const gF = gameOf(runnerF2);
        for (let i = 0; i < 60; i++) { gC.step(); gF.step(); }
        expect(gF.tick).toBe(gC.tick);
        expectChecksumEqual(gC, gF);
      } finally {
        await runnerF2.stop().catch(() => undefined);
      }
    } finally {
      await runnerC.stop().catch(() => undefined);
    }
  }, 120000);
});
