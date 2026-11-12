// PW17 integration tests: fixed factions, mixed forces and pack availability
// against REAL PostgreSQL and the REAL region runner. Requires
// MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
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
function findSite(g: LiveGame, w: number, h: number): { x: number; y: number } {
  for (let cy = 1; cy < g.map.h - h - 1; cy++) {
    for (let cx = 1; cx < g.map.w - w - 1; cx++) {
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

describeDb('mmo mixed factions (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    // Two players: fixture factions rotate gdi (slot 0) / nod (slot 1).
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
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
    await waitFor(() => ctx.runner.currentGame!.players.length >= 2);
    const g = ctx.runner.currentGame!;
    expect(g.players[0].faction).toBe('gdi');
    expect(g.players[1].faction).toBe('nod');
    for (const pl of g.players) pl.stats.harvested = 1_000_000_000;

    // Alliance so the packed-building barter is permitted.
    const p0 = fx.players[0].playerId, p1 = fx.players[1].playerId;
    const created = await worldAction(ctx, p0, { t: 'allianceCreate', name: 'MixedTest' });
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

  it('barters a packed nod barracks to the gdi player; it produces nod units', async () => {
    const g = game(ctx);
    const slot0 = g.players.findIndex(pl => pl.faction === 'gdi');
    const slot1 = g.players.findIndex(pl => pl.faction === 'nod');
    expect(slot0).toBe(0); expect(slot1).toBe(1);

    // Nod player builds a barracks directly on the live sim (fixture setup),
    // packs it and barters the carrier to the gdi player.
    const handDef = g.pack.structures['hand'];
    const site = findSite(g, handDef.w, handDef.h);
    const hand = g.spawnStructure('hand', slot1, site.x, site.y);
    expect(hand.faction).toBe('nod');
    const ref = durableId(ctx, hand.id);

    expect((await worldAction(ctx, p(1), { t: 'pack', entityId: ref })).accepted).toBe(true);
    await waitFor(() => g.entities.get(hand.id)?.packedType === 'hand');

    const o = offer(p(1), ctx.fx.regionId, p(0),
      [{ kind: 'packedBuilding', ref, amount: 1 }], [{ kind: 'credits', amount: 100 }]);
    expect((await worldAction(ctx, p(1), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    const accepted = await worldAction(ctx, p(0), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);
    await waitFor(() => g.entities.get(hand.id)?.owner === slot0);

    // Identity: same entity, same durable ref, creator faction preserved.
    const carrier = g.entities.get(hand.id)!;
    expect(carrier.faction).toBe('nod');
    expect(carrier.packedType).toBe('hand');
    expect(g.players[slot0].faction).toBe('gdi');
    expect(g.players[slot1].faction).toBe('nod');

    // Redeploy for the new owner at a fresh valid site, carrier parked on it.
    const site2 = findSite(g, handDef.w, handDef.h);
    carrier.x = (site2.x + 1) * LEPTONS; carrier.y = (site2.y + 1) * LEPTONS;
    const unpacked = await worldAction(ctx, p(0), { t: 'unpack', entityId: ref, x: site2.x, y: site2.y });
    expect(unpacked.accepted).toBe(true);
    await waitFor(() => {
      const e = g.entities.get(hand.id);
      return e?.kind === 'structure' && e.type === 'hand' && e.owner === slot0;
    });
    const deployed = g.entities.get(hand.id)!;
    expect(deployed.faction).toBe('nod'); // asset keeps its original faction

    // Mixed-force production: the gdi player can now field nod infantry
    // through the imported barracks — but not gdi-only infantry (no pyle),
    // and never the donor's structures in their own build menu.
    const p0sim = g.players[slot0];
    const infantry = g.buildOptions(p0sim, 'infantry');
    expect(infantry).toContain('flamethrower');
    expect(infantry).not.toContain('grenadier');
    expect(g.canBuild(p0sim, 'hand')).toBe(false);
    expect(g.buildOptions(p0sim, 'defense')).not.toContain('gun');

    // The nod player lost the building — it is no longer theirs.
    expect(g.entities.get(hand.id)!.owner).not.toBe(slot1);
  }, IT_TIMEOUT);
});
