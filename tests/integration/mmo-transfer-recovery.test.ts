// PW18/PW30/PW29 crash-window proof: a loaded transport crosses a region
// boundary, the arrival commits (COMPLETED + ledger) AFTER the destination's
// last checkpoint, and the destination worker is then hard-killed before the
// next checkpoint. The restarted runner must restore carrier AND every
// passenger with owner, credits, receipts and a checksum identical to an
// uninterrupted control region. Real PostgreSQL, real Fusion sim.
// Requires MMO_TEST_DATABASE_URL.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  acquireRegionLease, createRegion, releaseRegionLease,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PACKS, LEPTONS, passable, type Entity } from '../../packages/fusion/src/index.js';
import { PERSISTENT_RULES_V1, MMO_PROTOCOL, mmoEntityId, type MmoCommandMessage, type MmoWorldAction } from '../../packages/contracts/src/index.js';

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

interface Side { regionId: string; runner: RegionRunner }
interface Ctx { fx: FixtureWorld; a: Side; bc: Side; bf: Side }

async function worldAction(
  ctx: Ctx, side: Side, playerId: string, action: MmoWorldAction,
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: side.runner.authorityEpoch! };
  const commandId = randomUUID();
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: side.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const tail = await journalTail(side.regionId);
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
      [side.regionId, commandId]);
    result = (ev?.application_result ?? undefined) as typeof result;
    return result !== undefined;
  });
  return (result ?? {}) as { accepted: boolean; reason?: string };
}

const usedRefs = new Set<string>();

/** A free vehicle-passable cell, biased to the map interior. */
function freeVehicleCell(g: { pack: Parameters<typeof passable>[0]; map: Parameters<typeof passable>[1] }): number {
  const w = g.map.w, h = g.map.h;
  for (let y = Math.floor(h / 2) - 10; y < h / 2 + 10; y++) {
    for (let x = Math.floor(w / 2) - 10; x < w / 2 + 10; x++) {
      const i = y * w + x;
      if (passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) return i;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) return i;
  }
  throw new Error('no vehicle cell');
}

/** Spawn a fresh transport + rider for p0 in region A (the fixture starter
 *  roster has no transport), normalize manifests, park at the NW edge. */
function loadedCarrier(ctx: Ctx): { carrier: Entity; rider: Entity; ref: string } {
  const g = ctx.a.runner.currentGame!;
  const carrier = g.spawnUnit('apc', 0, freeVehicleCell(g));
  const footType = Object.values(g.pack.units).find(u => u.kind === 'infantry')?.id ?? 'minigunner';
  const rider = g.spawnUnit(footType, 0, freeVehicleCell(g));
  // Normalize both transfers' manifests: same hp/xp/facing so the two
  // destinations receive byte-comparable cargo.
  for (const u of [carrier, rider]) {
    u.hp = Math.floor(u.maxHp / 2); u.xp = 0; u.rank = 0; u.ammo = 0;
    u.facing = 0; u.turret = 0; u.bound = 0;
  }
  carrier.passengers.push(rider.id);
  rider.carriedBy = carrier.id;
  rider.x = carrier.x; rider.y = carrier.y;
  const w = g.map.w;
  const spot = 2 * w + 2 + (usedRefs.size % 3);
  carrier.x = (spot % w) * LEPTONS + LEPTONS / 2;
  carrier.y = Math.floor(spot / w) * LEPTONS + LEPTONS / 2;
  const ref = mmoEntityId(ctx.a.regionId, carrier.id);
  usedRefs.add(ref);
  return { carrier, rider, ref };
}

const transferState = async (id: string) =>
  (await mmoOne<{ state: string }>('select state from region_transfer where transfer_id = $1', [id]))?.state;

interface SimGame {
  tick: number; checksum(): number; step(): void;
  entities: Map<number, { id: number; kind: string; type: string; owner: number; hp: number; x: number; y: number; facing: number; carriedBy: number; passengers: number[]; charge: number; xp: number; ammo: number; deployed: boolean; heldUntil: number; bound: number }>;
  players: { credits: number; pid?: string }[];
}
const gameOf = (r: RegionRunner) => (r as unknown as { game: SimGame }).game;

function arrivedCarrier(runner: RegionRunner, transferId: string) {
  return [...gameOf(runner).entities.values()].find(e => (e as { durableId?: string }).durableId === transferId);
}

describeDb('mmo transfer arrival crash window (PW18+PW30, real PostgreSQL)', () => {
  let ctx: Ctx;
  const usurper = randomUUID();

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const pack = PACKS['td'];
    const mapId = 'td-tiberium-gardens';
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const p0 = fx.players[0];

    // Two IDENTICAL destination regions: same sim spec, same wall-clock
    // anchor — one is the uninterrupted control, one is hard-killed.
    const mkRegion = async (label: string) => {
      const regionId = randomUUID();
      await createRegion({
        regionId, worldId: fx.worldId, label,
        seed: { sim: {
          packId: pack.id, mapId, seed: 777,
          players: [{ playerId: p0.playerId, name: p0.displayName, faction: pack.factions[0].id }],
        } },
        rulesetVersion: MMO_PROTOCOL, engineArtifactSha256: 'fixture-engine-sha',
      });
      // Pin the wall-clock anchor identical so both runners tick in lockstep.
      await mmoQuery(`update region set started_at_ms = $2 where region_id = $1`,
        [regionId, Date.now()]);
      await acquireRegionLease({ regionId, workerId: fx.workerId, leaseMs: 300_000 });
      await mmoQuery(`update region set lifecycle = 'active' where region_id = $1`, [regionId]);
      return regionId;
    };
    const bcId = await mkRegion('dest-control');
    const bfId = await mkRegion('dest-faulted');

    const mk = (regionId: string) => new RegionRunner({
      regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      quiescence: { enabled: false },
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e.includes('fail') || e.includes('error')) console.log('RUNNER', e, JSON.stringify(d).slice(0, 400)); },
    });
    const runnerA = mk(fx.regionId);
    const runnerBc = mk(bcId);
    const runnerBf = mk(bfId);
    await runnerA.start();
    await runnerBc.start();
    await runnerBf.start();
    ctx = { fx, a: { regionId: fx.regionId, runner: runnerA }, bc: { regionId: bcId, runner: runnerBc }, bf: { regionId: bfId, runner: runnerBf } };

    await waitFor(() => ctx.a.runner.currentGame!.players.length >= 2);
    await waitFor(() => ctx.bc.runner.currentGame!.players.length >= 1);
    await waitFor(() => ctx.bf.runner.currentGame!.players.length >= 1);
  }, 90_000);

  afterAll(async () => {
    await ctx?.a.runner.stop().catch(() => undefined);
    await ctx?.bc.runner.stop().catch(() => undefined);
    await ctx?.bf.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p0 = () => ctx.fx.players[0].playerId;

  it('survives destination-worker termination after arrival commit, before next checkpoint', async () => {
    // Checkpoint the faulted destination BEFORE any arrival — the restart
    // must recover the post-checkpoint arrival from durable rows alone.
    await ctx.bf.runner.checkpoint('pre-transfer');
    const snapsBefore = await mmoOne<{ n: string }>(
      'select count(*)::text as n from region_snapshot where region_id = $1', [ctx.bf.regionId]);
    expect(Number(snapsBefore!.n)).toBe(1);

    // Two identical loaded transports leave region A for the two destinations.
    const t1 = loadedCarrier(ctx);
    const t2 = loadedCarrier(ctx);
    const m1 = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: t1.ref, destRegionId: ctx.bc.regionId });
    expect(m1.accepted).toBe(true);
    const id1 = m1.transferId as string;
    const m2 = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: t2.ref, destRegionId: ctx.bf.regionId });
    expect(m2.accepted).toBe(true);
    const id2 = m2.transferId as string;

    await waitFor(async () => (await transferState(id1)) === 'COMPLETED'
      && (await transferState(id2)) === 'COMPLETED', 45000);

    // Both carriers arrived with exactly one passenger each.
    for (const [side, tid] of [[ctx.bc, id1], [ctx.bf, id2]] as const) {
      const c = arrivedCarrier(side.runner, tid);
      expect(c, `carrier ${tid}`).toBeTruthy();
      expect(c!.passengers).toHaveLength(1);
      const cargo = gameOf(side.runner).entities.get(c!.passengers[0])!;
      expect(cargo.carriedBy).toBe(c!.id);
      expect(gameOf(side.runner).players[c!.owner].pid).toBe(p0());
    }

    // Normalize arrival cells/facing so the two destinations are comparable —
    // transferEntryCell is seeded by the (necessarily different) transfer id.
    for (const side of [ctx.bc, ctx.bf]) {
      const g = gameOf(side.runner);
      const tid = side === ctx.bc ? id1 : id2;
      const c = arrivedCarrier(side.runner, tid)!;
      const e = g.entities.get(c.id)!;
      e.x = 40 * LEPTONS; e.y = 40 * LEPTONS; e.facing = 0;
      for (const pid of e.passengers) {
        const p = g.entities.get(pid)!;
        p.x = e.x; p.y = e.y; p.facing = 0;
      }
    }

    const tickControl = gameOf(ctx.bc.runner).tick;
    const creditsControl = gameOf(ctx.bc.runner).players.map(p => p.credits);

    // HARD KILL the faulted destination: lease takeover with no checkpoint —
    // the runner fails on its next poll without writing a snapshot.
    await acquireRegionLease({ regionId: ctx.bf.regionId, workerId: usurper, leaseMs: 300_000, forceTakeover: true });
    await waitFor(async () =>
      (ctx.bf.runner as unknown as { isFailed: boolean }).isFailed, 15000, 30);
    // Confirm no post-arrival checkpoint was written during the kill window.
    const snapsAfter = await mmoOne<{ n: string; max_tick: string }>(
      'select count(*)::text as n, coalesce(max(tick),0)::text as max_tick from region_snapshot where region_id = $1',
      [ctx.bf.regionId]);
    expect(Number(snapsAfter!.n)).toBe(1);

    // Restart under the usurper worker: stale checkpoint + journal tail +
    // durable COMPLETED-transfer reconciliation must rebuild the arrival.
    const runnerBf2 = new RegionRunner({
      regionId: ctx.bf.regionId, workerId: usurper, leaseMs: 300_000,
      tickMs: TICK_MS, pollMs: POLL_MS,
      quiescence: { enabled: false },
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e.includes('fail') || e.includes('error')) console.log('RUNNER', e, JSON.stringify(d).slice(0, 400)); },
    });
    ctx.bf.runner = runnerBf2;
    await runnerBf2.start();

    // The carrier and its passenger are back, owned by p0, rebound durably.
    await waitFor(() => !!arrivedCarrier(runnerBf2, id2), 20000);
    const c2 = arrivedCarrier(runnerBf2, id2)!;
    expect(c2.passengers).toHaveLength(1);
    const cargo2 = gameOf(runnerBf2).entities.get(c2.passengers[0])!;
    expect(cargo2.carriedBy).toBe(c2.id);
    expect(gameOf(runnerBf2).players[c2.owner].pid).toBe(p0());

    // Receipts: both ledger legs + the transfer operation exist for BOTH ids.
    for (const tid of [id1, id2]) {
      const op = await mmoOne<{ kind: string }>(
        'select kind from economy_operation where operation_id = $1', [tid]);
      expect(op?.kind).toBe('REGION_TRANSFER');
      const ledger = await mmoQuery<{ kind: string; region_id: string }>(
        'select kind, region_id from asset_ledger where operation_id = $1 order by kind', [tid]);
      expect(ledger.map(l => l.kind)).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    }

    // Re-align the arrival cell on the restarted side, then wait for tick
    // parity with the uninterrupted control and compare checksums + credits.
    const g2 = gameOf(runnerBf2);
    const e2 = g2.entities.get(c2.id)!;
    e2.x = 40 * LEPTONS; e2.y = 40 * LEPTONS; e2.facing = 0;
    for (const pid of e2.passengers) {
      const p = g2.entities.get(pid)!;
      p.x = e2.x; p.y = e2.y; p.facing = 0;
    }
    // Wait for tick parity, then hash BOTH games synchronously — the runners
    // keep stepping on timers, so any await between the two checksum() calls
    // can straddle a tick boundary and make identical states compare unequal.
    let sums: { faulted: number; control: number } | undefined;
    await waitFor(() => {
      const gC = gameOf(ctx.bc.runner);
      const gF = gameOf(runnerBf2);
      if (gF.tick !== gC.tick) return false;
      sums = { faulted: gF.checksum(), control: gC.checksum() };
      return true;
    }, 30000, 25);
    if (sums!.faulted !== sums!.control) {
      // Diagnostic: first entity whose hashed fields differ.
      const fields = (e: { id: number; x: number; y: number; hp: number; owner: number; facing: number; charge: number; xp: number; ammo: number; carriedBy: number; deployed: boolean; passengers: number[]; heldUntil: number; bound: number }) =>
        [e.id, e.x, e.y, e.hp, e.owner, e.facing, e.charge, e.xp, e.ammo, e.carriedBy, e.deployed ? 1 : 0, e.passengers.length, e.heldUntil, e.bound];
      const cEnt = [...gameOf(ctx.bc.runner).entities.values()];
      const fEnt = [...gameOf(runnerBf2).entities.values()];
      const diffs = cEnt.map((c, i) => ({ c, f: fEnt[i] }))
        .filter(({ c, f }) => !f || JSON.stringify(fields(c)) !== JSON.stringify(fields(f as never)));
      console.log('CHECKSUM-DIFF tick', gameOf(runnerBf2).tick, 'entities', cEnt.length, fEnt.length,
        'first diffs', JSON.stringify(diffs.slice(0, 4).map(d => ({ c: fields(d.c), f: d.f ? fields(d.f as never) : null }))));
    }
    expect(sums!.faulted).toBe(sums!.control);
    expect(gameOf(runnerBf2).players.map(p => p.credits)).toEqual(creditsControl);
    expect(gameOf(runnerBf2).players[0].pid).toBe(p0());
    expect(tickControl).toBeGreaterThan(0);
  }, IT_TIMEOUT);
});
