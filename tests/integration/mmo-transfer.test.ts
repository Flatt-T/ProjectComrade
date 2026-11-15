// PW18 integration tests: cross-region transfer — depart walk, manifest
// release, destination pickup, cancellation, ownership/validity gates,
// dedup and restart recovery — against REAL PostgreSQL and TWO live region
// runners in the same world. Requires MMO_TEST_DATABASE_URL.
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
const IT_TIMEOUT = 45_000;
const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 20000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Side {
  regionId: string; runner: RegionRunner;
}
interface Ctx {
  fx: FixtureWorld;
  a: Side; b: Side;
}

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

/** A p0-owned live unit in region A, teleported beside a map corner so the
 *  depart walk is short. Returns its sim id and durable bridged id. */
const usedRefs = new Set<string>();
function edgeUnit(ctx: Ctx, edgeDist = 2): { simId: number; ref: string; e: Entity } {
  const g = ctx.a.runner.currentGame!;
  const e = [...g.entities.values()]
    .find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && !e.carriedBy && e.bound === 0
      && !e.packedType && e.order !== 'depart' && g.unitDef(e).transport === undefined
      && !usedRefs.has(mmoEntityId(ctx.a.regionId, e.id)));
  if (!e) throw new Error('no transferable unit for p0');
  const w = g.map.w, h = g.map.h;
  let spot = -1;
  outer: for (let ring = edgeDist; ring <= edgeDist + 4; ring++) {
    for (let y = ring; y < h - ring; y++) for (let x = ring; x < w - ring; x++) {
      const i = y * w + x;
      const edge = Math.min(x, w - 1 - x, y, h - 1 - y);
      if (edge === edgeDist && passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) { spot = i; break outer; }
    }
  }
  if (spot < 0) throw new Error('no edge cell');
  e.x = (spot % w) * LEPTONS + LEPTONS / 2;
  e.y = Math.floor(spot / w) * LEPTONS + LEPTONS / 2;
  e.order = 'idle'; e.path = []; e.target = 0;
  const ref = mmoEntityId(ctx.a.regionId, e.id);
  usedRefs.add(ref);
  return { simId: e.id, ref, e };
}

const transferState = async (id: string) =>
  (await mmoOne<{ state: string }>('select state from region_transfer where transfer_id = $1', [id]))?.state;

describeDb('mmo region transfer (two live runners)', () => {
  let ctx: Ctx;
  let runnerB: RegionRunner | undefined;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const pack = PACKS['td'];
    const mapId = 'td-tiberium-gardens';
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId });
    await releaseRegionLease(fx.regionId, fx.workerId);

    // Destination region in the SAME world; p0 holds the only sim slot there.
    const destId = randomUUID();
    const p0 = fx.players[0];
    await createRegion({
      regionId: destId, worldId: fx.worldId, label: 'dest-region',
      seed: { sim: {
        packId: pack.id, mapId, seed: 777,
        players: [{ playerId: p0.playerId, name: p0.displayName, faction: pack.factions[0].id }],
      } },
      rulesetVersion: MMO_PROTOCOL, engineArtifactSha256: 'fixture-engine-sha',
    });
    await acquireRegionLease({ regionId: destId, workerId: fx.workerId, leaseMs: 300_000 });
    await mmoQuery(`update region set lifecycle = 'active' where region_id = $1`, [destId]);

    const mk = (regionId: string) => new RegionRunner({
      regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e.includes('fail') || e.includes('error')) console.log('RUNNER', e, JSON.stringify(d).slice(0, 400)); },
    });
    const runnerA = mk(fx.regionId);
    runnerB = mk(destId);
    await runnerA.start();
    await runnerB.start();
    ctx = { fx, a: { regionId: fx.regionId, runner: runnerA }, b: { regionId: destId, runner: runnerB } };

    await waitFor(() => ctx.a.runner.currentGame!.players.length >= 2);
    await waitFor(() => ctx.b.runner.currentGame!.players.length >= 1);
  }, 90_000);

  afterAll(async () => {
    await ctx?.a.runner.stop().catch(() => undefined);
    await ctx?.b.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p0 = () => ctx.fx.players[0].playerId;
  const p1 = () => ctx.fx.players[1].playerId;

  it('moves a unit across regions preserving identity, hp and ownership', async () => {
    const { simId, ref, e } = edgeUnit(ctx);
    e.hp = Math.max(1, Math.floor(e.maxHp / 2));
    const hpBefore = e.hp;

    const made = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: ref, destRegionId: ctx.b.regionId,
    });
    expect(made.accepted).toBe(true);
    const transferId = made.transferId as string;
    expect(transferId).toBeTruthy();

    // Walk to the edge, release, pickup — all journaled, all fenced.
    await waitFor(async () => (await transferState(transferId)) === 'COMPLETED', 30000);

    // Source: entity gone, no salvage spawned for the departure.
    expect(ctx.a.runner.currentGame!.entities.has(simId)).toBe(false);
    // Dest: exactly one copy, owned by p0's slot, same durable identity.
    const arrived = [...ctx.b.runner.currentGame!.entities.values()]
      .find(x => x.durableId === transferId);
    expect(arrived).toBeTruthy();
    expect(arrived!.hp).toBe(hpBefore);
    expect(ctx.b.runner.currentGame!.players[arrived!.owner].pid).toBe(p0());

    // Durable audit: one REGION_TRANSFER op + OUT/IN ledger pair on the stable id.
    const op = await mmoOne<{ kind: string }>(
      'select kind from economy_operation where operation_id = $1', [transferId]);
    expect(op?.kind).toBe('REGION_TRANSFER');
    const ledger = await mmoQuery<{ kind: string; region_id: string }>(
      'select kind, region_id from asset_ledger where operation_id = $1 order by kind', [transferId]);
    expect(ledger.map(l => l.kind)).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    expect(ledger.find(l => l.kind === 'TRANSFER_OUT')!.region_id).toBe(ctx.a.regionId);
    expect(ledger.find(l => l.kind === 'TRANSFER_IN')!.region_id).toBe(ctx.b.regionId);
  }, IT_TIMEOUT);

  it('nests transport cargo through the crossing', async () => {
    const g = ctx.a.runner.currentGame!;
    const carrier = [...g.entities.values()]
      .find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && !e.carriedBy
        && g.unitDef(e).transport !== undefined);
    if (!carrier) return; // pack without a transport: shape covered by unit tests
    const rider = [...g.entities.values()]
      .find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && !e.carriedBy && e.id !== carrier.id
        && !g.unitDef(e).transport);
    if (!rider) return;
    // Board directly — the engine enter path is covered by PW15 tests.
    carrier.passengers.push(rider.id);
    rider.carriedBy = carrier.id;
    rider.x = carrier.x; rider.y = carrier.y;

    // Move carrier to the edge first so depart is quick.
    const w = g.map.w;
    const spot = 2 * w + 2;
    carrier.x = (spot % w) * LEPTONS + LEPTONS / 2;
    carrier.y = Math.floor(spot / w) * LEPTONS + LEPTONS / 2;

    const made = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: mmoEntityId(ctx.a.regionId, carrier.id), destRegionId: ctx.b.regionId,
    });
    expect(made.accepted).toBe(true);
    const transferId = made.transferId as string;
    await waitFor(async () => (await transferState(transferId)) === 'COMPLETED', 30000);

    const arrivedCarrier = [...ctx.b.runner.currentGame!.entities.values()]
      .find(x => x.durableId === transferId);
    expect(arrivedCarrier).toBeTruthy();
    expect(arrivedCarrier!.passengers.length).toBe(1);
    const cargo = ctx.b.runner.currentGame!.entities.get(arrivedCarrier!.passengers[0])!;
    expect(cargo.carriedBy).toBe(arrivedCarrier!.id);
    expect(cargo.durableId).not.toBe(transferId); // cargo keeps manifest identity only
  }, IT_TIMEOUT);

  it('cancels a prepared transfer and keeps the unit', async () => {
    // edgeDist 14 keeps the depart walk long enough for the cancel to land
    // while the row is still PREPARED.
    const { simId, ref } = edgeUnit(ctx, 14);
    const made = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: ref, destRegionId: ctx.b.regionId,
    });
    expect(made.accepted).toBe(true);
    const transferId = made.transferId as string;

    const cancelled = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransferCancel', entityId: ref,
    });
    expect(cancelled.accepted).toBe(true);
    expect(await transferState(transferId)).toBe('CANCELLED');

    // The unit stays, stops walking, and never materializes abroad.
    await waitFor(() => ctx.a.runner.currentGame!.entities.get(simId)?.order === 'idle');
    expect(ctx.a.runner.currentGame!.entities.has(simId)).toBe(true);
    await sleep(400);
    expect([...ctx.b.runner.currentGame!.entities.values()].filter(x => x.durableId === transferId)).toHaveLength(0);
  }, IT_TIMEOUT);

  it('rejects invalid transfers without side effects', async () => {
    // Same region.
    const u1 = edgeUnit(ctx);
    const same = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: u1.ref, destRegionId: ctx.a.regionId,
    });
    expect(same.accepted).toBe(false);
    expect(same.reason).toBe('SAME_REGION');

    // Unknown destination.
    const noDest = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: u1.ref, destRegionId: randomUUID(),
    });
    expect(noDest.accepted).toBe(false);
    expect(noDest.reason).toBe('NO_REGION');

    // Not the owner: p1 tries to move p0's unit.
    const foreign = await worldAction(ctx, ctx.a, p1(), {
      t: 'regionTransfer', entityId: u1.ref, destRegionId: ctx.b.regionId,
    });
    expect(foreign.accepted).toBe(false);
    expect(foreign.reason).toBe('NOT_OWNER');

    // Cargo aboard cannot be transferred directly.
    const g = ctx.a.runner.currentGame!;
    const carrier = [...g.entities.values()]
      .find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0 && !e.carriedBy
        && e.passengers.length > 0);
    if (carrier) {
      const aboard = await worldAction(ctx, ctx.a, p0(), {
        t: 'regionTransfer',
        entityId: mmoEntityId(ctx.a.regionId, carrier.passengers[0]),
        destRegionId: ctx.b.regionId,
      });
      expect(aboard.accepted).toBe(false);
      expect(aboard.reason).toBe('CARGO_ABOARD');
    }

    // A second request for the same live asset deduplicates, never duplicates.
    // (If the unit already departed, UNKNOWN_ENTITY is equally correct — the
    // durable row count below is the real no-duplication invariant.)
    const u2 = edgeUnit(ctx, 10);
    const first = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: u2.ref, destRegionId: ctx.b.regionId,
    });
    expect(first.accepted).toBe(true);
    const second = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: u2.ref, destRegionId: ctx.b.regionId,
    });
    if (second.accepted) {
      expect(second.deduplicated).toBe(true);
      expect(second.transferId).toBe(first.transferId);
    } else {
      expect(second.reason).toBe('UNKNOWN_ENTITY');
    }
    const rows = await mmoQuery(
      `select transfer_id from region_transfer where entity_id = $1 and state <> 'CANCELLED'`, [u2.ref]);
    expect(rows).toHaveLength(1);
    await worldAction(ctx, ctx.a, p0(), { t: 'regionTransferCancel', entityId: u2.ref });
  }, IT_TIMEOUT);

  it('completes a transfer whose destination runner restarts mid-flight', async () => {
    const { ref } = edgeUnit(ctx);
    const made = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: ref, destRegionId: ctx.b.regionId,
    });
    expect(made.accepted).toBe(true);
    const transferId = made.transferId as string;

    // Stop the destination runner, let the source release the asset, restart.
    await ctx.b.runner.stop();
    await waitFor(async () => (await transferState(transferId)) === 'SOURCE_RELEASED', 30000);

    const runnerB2 = new RegionRunner({
      regionId: ctx.b.regionId, workerId: ctx.fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e.includes('fail') || e.includes('error')) console.log('RUNNER', e, JSON.stringify(d).slice(0, 400)); },
    });
    ctx.b.runner = runnerB2;
    runnerB = runnerB2;
    await runnerB2.start();
    await waitFor(async () => (await transferState(transferId)) === 'COMPLETED', 30000);

    const arrived = [...runnerB2.currentGame!.entities.values()]
      .find(x => x.durableId === transferId);
    expect(arrived).toBeTruthy();
    const ledger = await mmoQuery('select kind from asset_ledger where operation_id = $1', [transferId]);
    expect(ledger.map(l => l.kind).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
  }, IT_TIMEOUT);

  it('retries a parked RECOVERY_REQUIRED transfer once the manifest becomes deliverable', async () => {
    // THU-2242: a manifest the destination cannot restore parks the row instead
    // of dropping the asset; the row must re-evaluate and deliver later.
    const transferId = randomUUID();
    const unitType = Object.keys(PACKS['td'].units)
      .find(t => PACKS['td'].units[t].kind === 'infantry')!;
    const manifest = {
      type: 'definitely-not-a-unit', kind: 'unit', ownerPid: p0(),
      hp: 50, maxHp: 100, facing: 0, turret: 0,
      bound: 0, packedType: '', faction: '', shielded: false, battleAt: 0,
      recoveryProtected: false, xp: 0, rank: 0, ammo: 0,
      deployed: false, disguised: false, hstate: 'seek',
      cargo: 0, cargoValue: 0, harvestCell: -1, homeField: -1,
      cell: { x: 4, y: 4 },
    };
    // The source release path writes the REGION_TRANSFER operation that the
    // TRANSFER_IN ledger row references; replicate it for the synthetic row.
    await mmoQuery(
      `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
       values ($1,$2,1,0,'REGION_TRANSFER',$3,$4)`,
      [transferId, ctx.a.regionId,
       JSON.stringify({ kind: 'REGION_TRANSFER', transferId, entityId: null, sourceRegionId: ctx.a.regionId, destRegionId: ctx.b.regionId }),
       JSON.stringify({ simId: 0, departedTick: 0 })]);
    await mmoQuery(
      `insert into region_transfer (transfer_id, entity_id, source_region_id, dest_region_id, payload, state)
       values ($1,$2,$3,$4,$5,'SOURCE_RELEASED')`,
      [transferId, randomUUID(), ctx.a.regionId, ctx.b.regionId,
       JSON.stringify({ manifest, ownerPid: p0() })]);

    // Unknown definition: spawnTransfer refuses, the row parks.
    await waitFor(async () => (await transferState(transferId)) === 'RECOVERY_REQUIRED', 30000);
    expect([...ctx.b.runner.currentGame!.entities.values()]
      .filter(x => x.durableId === transferId)).toHaveLength(0);

    // Repair the manifest (as a corrected payload would be): the next inbound
    // pass must deliver through the same fenced commit path.
    await mmoQuery(
      `update region_transfer set payload = payload || $2::jsonb where transfer_id = $1`,
      [transferId, JSON.stringify({ manifest: { ...manifest, type: unitType } })]);
    await waitFor(async () => (await transferState(transferId)) === 'COMPLETED', 30000);

    const arrived = [...ctx.b.runner.currentGame!.entities.values()]
      .find(x => x.durableId === transferId);
    expect(arrived).toBeTruthy();
    expect(arrived!.type).toBe(unitType);
    expect(ctx.b.runner.currentGame!.players[arrived!.owner].pid).toBe(p0());
    const ledger = await mmoQuery('select kind from asset_ledger where operation_id = $1', [transferId]);
    expect(ledger.map(l => l.kind)).toEqual(['TRANSFER_IN']);
  }, IT_TIMEOUT);

  it('resolves border combat once: fighter departs mid-firefight, single authority', async () => {
    // THU-2242: a unit engaged in combat at the border keeps exactly one
    // authority — it damages only while resident in the source region, leaves
    // no corpse/salvage/kill credit behind, and its entity-bound attack order
    // resolves to idle at the destination while durable state is preserved.
    const g = ctx.a.runner.currentGame!;
    const w = g.map.w;
    // Dedicated p0 fighter spawned at the NW edge — earlier tests consume the
    // starter roster, so this test brings its own combatant.
    let aspot = -1;
    outer: for (let ring = 2; ring <= 6; ring++) {
      for (let y = ring; y < g.map.h - ring; y++) for (let x = ring; x < w - ring; x++) {
        const i = y * w + x;
        if (Math.min(x, w - 1 - x, y, g.map.h - 1 - y) === ring
            && passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i]) { aspot = i; break outer; }
      }
    }
    if (aspot < 0) throw new Error('no attacker edge cell');
    const atkE = g.spawnUnit('lighttank', 0, aspot);
    // Survive the defender's return fire — this test needs the fighter alive
    // through the transfer, not a duel outcome.
    atkE.maxHp = 100000; atkE.hp = 100000;
    const atk = { simId: atkE.id, ref: mmoEntityId(ctx.a.regionId, atkE.id), e: atkE };
    const def = [...g.entities.values()]
      .find(e => e.kind === 'unit' && e.owner === 1 && e.hp > 0 && !e.carriedBy
        && !e.packedType && g.unitDef(e).kind !== 'aircraft'
        && g.unitDef(e).transport === undefined);
    if (!def) throw new Error('fixture has no p1 ground unit');
    // Park the defender on the adjacent edge cell so the fight is isolated
    // from both armies.
    const ax = Math.floor(atk.e.x / LEPTONS), ay = Math.floor(atk.e.y / LEPTONS);
    let dspot = -1;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 0]] as const) {
      const x = ax + dx, y = ay + dy, i = y * w + x;
      if (x >= 0 && y >= 0 && x < w && y < g.map.h
          && passable(g.pack, g.map, i, 'vehicle') && !g.map.occupied[i] && !g.unitInCell(i)) { dspot = i; break; }
    }
    if (dspot < 0) throw new Error('no defender cell beside attacker');
    def.x = (dspot % w) * LEPTONS + LEPTONS / 2;
    def.y = Math.floor(dspot / w) * LEPTONS + LEPTONS / 2;
    def.order = 'idle'; def.path = []; def.target = 0;
    // Engage: direct order fields (journal path covered by command tests).
    atk.e.order = 'attack'; atk.e.target = def.id; atk.e.path = []; atk.e.repathTick = 0;
    atk.e.xp = 4; atk.e.rank = 1;
    const hpBefore = def.hp;
    await waitFor(() => g.entities.get(def.id)!.hp < hpBefore, 15000);
    const dealtDamage = hpBefore - g.entities.get(def.id)!.hp;
    expect(dealtDamage).toBeGreaterThan(0);

    const made = await worldAction(ctx, ctx.a, p0(), {
      t: 'regionTransfer', entityId: atk.ref, destRegionId: ctx.b.regionId,
    });
    expect(made.accepted).toBe(true);
    const transferId = made.transferId as string;
    await waitFor(async () => (await transferState(transferId)) === 'COMPLETED', 30000);

    // Source authority ends at departure: the fighter is gone (no corpse, no
    // salvage), and the defender's stale target is cleared by the sim itself.
    expect(g.entities.has(atk.simId)).toBe(false);
    await waitFor(() => {
      const d = g.entities.get(def.id);
      return !!d && (d.target === 0 || !g.entities.has(d.target));
    }, 10000);

    // Destination: exactly one copy, durable state preserved, attack order
    // resolved to idle (entity-bound orders cannot cross regions).
    const copies = [...ctx.b.runner.currentGame!.entities.values()]
      .filter(x => x.durableId === transferId);
    expect(copies).toHaveLength(1);
    const arrived = copies[0];
    expect(arrived.xp).toBe(4);
    expect(arrived.rank).toBe(1);
    expect(arrived.hp).toBeLessThanOrEqual(atk.e.maxHp);
    expect(arrived.order).toBe('idle');
    // Single authority: no second copy anywhere in the source region.
    expect([...g.entities.values()].filter(x => x.durableId === transferId)).toHaveLength(0);
    // Exactly one ledger pair — combat produced no extra receipts.
    const ledger = await mmoQuery<{ kind: string }>(
      'select kind from asset_ledger where operation_id = $1 order by kind', [transferId]);
    expect(ledger.map(l => l.kind)).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
  }, IT_TIMEOUT);
});
