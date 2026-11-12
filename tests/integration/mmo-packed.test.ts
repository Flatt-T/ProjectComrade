// PW14 integration tests: packed buildings — pack/unpack world actions, audit
// rows, compound 'packed' state, invalid-site safety and packedBuilding barter
// — against REAL PostgreSQL and the REAL region runner. Requires
// MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { buildableTerrain, LEPTONS } from '../../packages/fusion/src/index.js';
import { PERSISTENT_RULES_V1, mmoEntityId, type BarterOffer, type MmoCommandMessage, type MmoWorldAction } from '../../packages/contracts/src/index.js';

/** The runner's live sim type (dist Game) — src/dist Game are distinct declarations. */
type LiveGame = NonNullable<RegionRunner['currentGame']>;

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const IT_TIMEOUT = 30_000;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 15000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Ctx {
  fx: FixtureWorld;
  runner: RegionRunner;
  service: RegionService;
}

async function worldAction(
  ctx: Ctx, playerId: string, action: MmoWorldAction,
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  const commandId = randomUUID();
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const tail = await journalTail(ctx.fx.regionId);
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
      [ctx.fx.regionId, commandId]);
    result = (ev?.application_result ?? undefined) as typeof result;
    return result !== undefined;
  });
  return (result ?? {}) as { accepted: boolean; reason?: string };
}

function offer(playerId: string, regionId: string, toId: string, give: BarterOffer['give'], want: BarterOffer['want']): BarterOffer {
  return {
    offerId: randomUUID(), regionId, fromId: playerId, toId, give, want,
    createdAtMs: Date.now(), expiresAtMs: Date.now() + 30 * 60 * 1000,
  };
}

const game = (ctx: Ctx) => ctx.runner.currentGame!;
const durableId = (ctx: Ctx, simId: number) => mmoEntityId(ctx.fx.regionId, simId);

/** First free buildable w×h footprint, as top-left cell coords. */
function findSite(g: LiveGame, w: number, h: number, avoid?: { x: number; y: number }, minDist = 0): { x: number; y: number } {
  for (let cy = 1; cy < g.map.h - h - 1; cy++) {
    for (let cx = 1; cx < g.map.w - w - 1; cx++) {
      if (avoid && Math.max(Math.abs(cx - avoid.x), Math.abs(cy - avoid.y)) < minDist) continue;
      let ok = true;
      for (let y = cy; y < cy + h && ok; y++) for (let x = cx; x < cx + w && ok; x++) {
        const i = y * g.map.w + x;
        if (g.map.occupied[i] || !buildableTerrain(g.pack, g.map, i)) ok = false;
      }
      if (ok) return { x: cx, y: cy };
    }
  }
  throw new Error('no free site on map');
}

/** Park the carrier on the footprint so the engine's adjacency check passes. */
function parkCarrierOn(g: LiveGame, simId: number, x: number, y: number) {
  const e = g.entities.get(simId)!;
  e.x = (x + 1) * LEPTONS; e.y = (y + 1) * LEPTONS;
}

describeDb('mmo packed buildings (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 3, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e === 'poll-error') console.log('POLLERR', String(d?.error).slice(0, 600)); },
    });
    await runner.start();
    const service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20 }, log: () => undefined });
    ctx = { fx, runner, service };
    await waitFor(() => ctx.runner.currentGame!.players.length >= 3);
    for (const pl of ctx.runner.currentGame!.players) pl.stats.harvested = 1_000_000_000;

    // p0 leads an alliance; p1 joins with trade + unitTransfer for the barter case.
    const p0 = fx.players[0].playerId, p1 = fx.players[1].playerId;
    const created = await worldAction(ctx, p0, { t: 'allianceCreate', name: 'CarrierGuild' });
    expect(created.accepted).toBe(true);
    const allianceId = created.allianceId as string;
    expect((await worldAction(ctx, p0, { t: 'allianceInvite', allianceId, playerId: p1 })).accepted).toBe(true);
    expect((await worldAction(ctx, p1, { t: 'allianceJoin', allianceId })).accepted).toBe(true);
    expect((await worldAction(ctx, p0, {
      t: 'allianceSetPermissions', playerId: p1,
      permissions: { station: false, reinforce: false, trade: true, unitTransfer: true },
    })).accepted).toBe(true);
  }, 60_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p = (i: number) => ctx.fx.players[i].playerId;

  it('packs a structure into its carrier and redeploys the same asset', async () => {
    const g = game(ctx);
    const site = findSite(g, 2, 2);
    const s = g.spawnStructure('pyle', 0, site.x, site.y);
    const ref = durableId(ctx, s.id);

    const packed = await worldAction(ctx, p(0), { t: 'pack', entityId: ref });
    expect(packed.accepted).toBe(true);
    await waitFor(() => {
      const e = g.entities.get(s.id);
      return e?.kind === 'unit' && e.packedType === 'pyle';
    });
    const carrier = g.entities.get(s.id)!;
    expect(carrier.type).toBe('pack_pyle');
    expect(carrier.hp).toBe(s.hp);

    // Audit: one PACK operation, one ledger row in 'packed' state.
    const op = await mmoOne<{ kind: string }>(
      `select kind from economy_operation where region_id = $1 and kind = 'PACK'
        and canonical_action->>'entityId' = $2 order by committed_at desc limit 1`, [ctx.fx.regionId, ref]);
    expect(op?.kind).toBe('PACK');
    const ledger = await mmoQuery<{ physical_state: string; kind: string }>(
      `select physical_state, kind from asset_ledger where entity_id = $1 order by ledger_id`, [ref]);
    expect(ledger.some(r => r.kind === 'PACK' && r.physical_state === 'packed')).toBe(true);

    // Redeploy at a fresh valid site.
    const site2 = findSite(g, 2, 2);
    parkCarrierOn(g, s.id, site2.x, site2.y);
    const unpacked = await worldAction(ctx, p(0), { t: 'unpack', entityId: ref, x: site2.x, y: site2.y });
    expect(unpacked.accepted).toBe(true);
    await waitFor(() => {
      const e = g.entities.get(s.id);
      return e?.kind === 'structure' && e.type === 'pyle' && e.packedType === '';
    });
    const e = g.entities.get(s.id)!;
    expect(e.cx).toBe(site2.x);
    expect(e.cy).toBe(site2.y);
    expect(e.hp).toBe(s.hp);

    const op2 = await mmoOne<{ kind: string }>(
      `select kind from economy_operation where region_id = $1 and kind = 'UNPACK'
        and canonical_action->>'entityId' = $2 order by committed_at desc limit 1`, [ctx.fx.regionId, ref]);
    expect(op2?.kind).toBe('UNPACK');
    const ledger2 = await mmoQuery<{ physical_state: string; kind: string }>(
      `select physical_state, kind from asset_ledger where entity_id = $1 order by ledger_id`, [ref]);
    expect(ledger2.some(r => r.kind === 'UNPACK' && r.physical_state === 'deployed')).toBe(true);
  }, IT_TIMEOUT);

  it('rejects an invalid unpack site without losing or duplicating the carrier', async () => {
    const g = game(ctx);
    const site = findSite(g, 3, 3);
    const s = g.spawnStructure('weap', 0, site.x, site.y);
    const ref = durableId(ctx, s.id);
    expect((await worldAction(ctx, p(0), { t: 'pack', entityId: ref })).accepted).toBe(true);
    await waitFor(() => g.entities.get(s.id)?.packedType === 'weap');

    // Far away AND not adjacent — the world handler rejects before journaling a sim command.
    const far = findSite(g, 3, 3);
    g.entities.get(s.id)!.x = (far.x + 1) * LEPTONS; g.entities.get(s.id)!.y = (far.y + 1) * LEPTONS;
    // Occupy the requested footprint with another structure so canPlace fails even though adjacent.
    const blocker = g.spawnStructure('nuke', 0, far.x, far.y);
    void blocker;
    const bad = await worldAction(ctx, p(0), { t: 'unpack', entityId: ref, x: far.x, y: far.y });
    // Carrier is adjacent to `far` but the footprint is occupied → INVALID_SITE.
    expect(bad.accepted).toBe(false);
    const e = g.entities.get(s.id)!;
    expect(e.kind).toBe('unit');
    expect(e.packedType).toBe('weap');
    expect(e.hp).toBe(s.hp);

    // A genuinely far site also rejects — the carrier's cell must be adjacent.
    const other = findSite(g, 3, 3, { x: 2, y: 2 }, 12);
    g.entities.get(s.id)!.x = 2 * LEPTONS; g.entities.get(s.id)!.y = 2 * LEPTONS;
    const bad2 = await worldAction(ctx, p(0), { t: 'unpack', entityId: ref, x: other.x, y: other.y });
    expect(bad2.accepted).toBe(false);
    expect(bad2.reason).toBe('INVALID_SITE');
    expect(g.entities.get(s.id)!.packedType).toBe('weap');
  }, IT_TIMEOUT);

  it('barters a packed building to an ally who redeploys it', async () => {
    const g = game(ctx);
    const site = findSite(g, 2, 2);
    const s = g.spawnStructure('hand', 0, site.x, site.y);
    const ref = durableId(ctx, s.id);
    expect((await worldAction(ctx, p(0), { t: 'pack', entityId: ref })).accepted).toBe(true);
    await waitFor(() => g.entities.get(s.id)?.packedType === 'hand');

    const o = offer(p(0), ctx.fx.regionId, p(1),
      [{ kind: 'packedBuilding', ref, amount: 1 }], [{ kind: 'credits', amount: 250 }]);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);

    await waitFor(() => g.entities.get(s.id)?.owner === 1);
    const carrier = g.entities.get(s.id)!;
    expect(carrier.packedType).toBe('hand');
    expect(carrier.kind).toBe('unit');

    // The ledger records the move in 'packed' physical state.
    const ledger = await mmoQuery<{ physical_state: string; from_owner: string; to_owner: string }>(
      `select physical_state, from_owner, to_owner from asset_ledger
        where operation_id = $1 and entity_id = $2`, [accepted.operationId, ref]);
    expect(ledger.length).toBe(1);
    expect(ledger[0].physical_state).toBe('packed');
    expect(ledger[0].from_owner).toBe(p(0));
    expect(ledger[0].to_owner).toBe(p(1));

    // The buyer redeploys it at their own site — same durable id throughout.
    const site2 = findSite(g, 2, 2);
    parkCarrierOn(g, s.id, site2.x, site2.y);
    const unpacked = await worldAction(ctx, p(1), { t: 'unpack', entityId: ref, x: site2.x, y: site2.y });
    expect(unpacked.accepted).toBe(true);
    await waitFor(() => {
      const e = g.entities.get(s.id);
      return e?.kind === 'structure' && e.type === 'hand' && e.owner === 1;
    });
    expect(g.entities.get(s.id)!.cx).toBe(site2.x);
  }, IT_TIMEOUT);

  it('marks a packed construction yard compound as packed, then active again', async () => {
    const g = game(ctx);
    const site = findSite(g, 3, 3);
    const yard = g.spawnStructure('fact', 2, site.x, site.y); // p2 owns it
    const ref = durableId(ctx, yard.id);
    const compoundId = ref; // compound_id IS the yard's durable entity id

    expect((await worldAction(ctx, p(2), { t: 'pack', entityId: ref })).accepted).toBe(true);
    await waitFor(async () => {
      const row = await mmoOne<{ state: string }>(
        'select state from compound where compound_id = $1', [compoundId]);
      return row?.state === 'packed';
    }, 20000);

    // While packed the yard is a unit — no compound power/shield projection.
    expect(g.entities.get(yard.id)!.kind).toBe('unit');

    const site2 = findSite(g, 3, 3);
    parkCarrierOn(g, yard.id, site2.x, site2.y);
    const unpacked = await worldAction(ctx, p(2), { t: 'unpack', entityId: ref, x: site2.x, y: site2.y });
    expect(unpacked.accepted).toBe(true);
    await waitFor(async () => {
      const row = await mmoOne<{ state: string }>(
        'select state from compound where compound_id = $1', [compoundId]);
      return row?.state === 'active';
    }, 20000);
    expect(g.entities.get(yard.id)!.kind).toBe('structure');
  }, IT_TIMEOUT);

  it('rejects packing bound assets, walls and non-owners', async () => {
    const g = game(ctx);
    const site = findSite(g, 1, 1);
    const wall = g.spawnStructure('sbag', 0, site.x, site.y);
    const wallRef = durableId(ctx, wall.id);
    const rw = await worldAction(ctx, p(0), { t: 'pack', entityId: wallRef });
    expect(rw.accepted).toBe(false);
    expect(rw.reason).toBe('NOT_PACKABLE');

    const boundSite = findSite(g, 2, 2);
    const bound = g.spawnStructure('pyle', 0, boundSite.x, boundSite.y);
    bound.bound = 1;
    const boundRef = durableId(ctx, bound.id);
    const rb = await worldAction(ctx, p(0), { t: 'pack', entityId: boundRef });
    expect(rb.accepted).toBe(false);
    expect(rb.reason).toBe('NOT_PACKABLE');
    bound.bound = 0;

    // p2 cannot pack p0's structure.
    const other = findSite(g, 2, 2);
    const foreign = g.spawnStructure('proc', 0, other.x, other.y);
    const foreignRef = durableId(ctx, foreign.id);
    const rf = await worldAction(ctx, p(2), { t: 'pack', entityId: foreignRef });
    expect(rf.accepted).toBe(false);
    expect(rf.reason).toBe('NOT_PACKABLE');
    // Cleanup so later tests keep free sites.
    foreign.hp = 0;
  }, IT_TIMEOUT);
});
