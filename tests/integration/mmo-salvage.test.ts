// PW24 integration tests: salvage crates against REAL PostgreSQL and the REAL
// region runner. A destroyed asset must produce exactly one SALVAGE_SPAWN
// operation plus DESTROY/SALVAGE asset-ledger rows, and the crate must be a
// real sim entity that pays out on collection. Requires
// MMO_TEST_DATABASE_URL (disposable database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PERSISTENT_RULES_V1, mmoEntityId } from '../../packages/contracts/src/index.js';

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

interface Ctx { fx: FixtureWorld; runner: RegionRunner; service: RegionService }

describeDb('mmo salvage (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: () => undefined,
    });
    await runner.start();
    const service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20 }, log: () => undefined });
    ctx = { fx, runner, service };
    await waitFor(() => ctx.runner.currentGame!.players.length >= 2);
    const g = ctx.runner.currentGame!;
    // Fixture players spawn inside newcomer protection; salvage needs a real
    // kill, so lift it for the test (the protection system itself is covered
    // by the PW10/PW11 suites).
    for (const pl of g.players) pl.newcomerProtected = false;
  }, 60_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  it('a destroyed unit drops one audited salvage crate worth 25% of cost', async () => {
    const g = ctx.runner.currentGame!;
    const regionId = ctx.fx.regionId;
    const victimSlot = 1, killerSlot = 0;

    // Spawn a victim unit for player 1 on a free cell and kill it as player 0.
    let cell = -1;
    for (let i = 0; i < g.map.w * g.map.h && cell < 0; i++) {
      const x = i % g.map.w, y = Math.floor(i / g.map.w);
      if (x < 3 || y < 3 || x >= g.map.w - 3 || y >= g.map.h - 3) continue;
      if (!g.map.occupied[i]) cell = i;
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    const victim = g.spawnUnit('minigunner', victimSlot, cell);
    const expected = Math.floor(g.pack.units.minigunner.cost * PERSISTENT_RULES_V1.salvage.percentOfCost / 100);
    expect(expected).toBeGreaterThan(0);

    const opsBefore = await mmoOne<{ n: string }>(
      `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SALVAGE_SPAWN'`, [regionId]);

    g.damage(victim, victim.hp, killerSlot);
    g.step();

    const crate = g.crates.find(c => c.kind === 'salvage');
    expect(crate).toBeTruthy();
    expect(crate!.value).toBe(expected);
    const ev = g.salvageEvents.find(e => e.kind === 'spawn');
    expect(ev).toBeTruthy();

    // The runner's tick drain writes the durable audit rows.
    await waitFor(async () => {
      const row = await mmoOne<{ n: string }>(
        `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SALVAGE_SPAWN'`, [regionId]);
      return Number(row?.n ?? 0) > Number(opsBefore?.n ?? 0);
    });

    const op = await mmoOne<{ operation_id: string; canonical_action: { credits?: string }; simulation_tick: string }>(
      `select operation_id, canonical_action, simulation_tick from economy_operation
        where region_id = $1 and kind = 'SALVAGE_SPAWN' order by committed_at desc limit 1`, [regionId]);
    expect(op).toBeTruthy();
    expect(op!.canonical_action.credits).toBe(String(expected));

    const entityId = mmoEntityId(regionId, victim.id);
    const ledger = await mmoOne<{ kinds: string }>(
      `select string_agg(kind, ',' order by kind) as kinds from asset_ledger
        where operation_id = $1 and entity_id = $2`, [op!.operation_id, entityId]);
    expect(ledger?.kinds).toBe('DESTROY,SALVAGE');

    // Exactly once: stepping further must not duplicate the operation.
    await sleep(100);
    const opsAfter = await mmoOne<{ n: string }>(
      `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SALVAGE_SPAWN'`, [regionId]);
    expect(Number(opsAfter?.n ?? 0)).toBe(Number(opsBefore?.n ?? 0) + 1);
  }, IT_TIMEOUT);

  it('a collected crate pays its holder in credits', async () => {
    const g = ctx.runner.currentGame!;
    const slot = 0;
    const crate = g.crates.find(c => c.kind === 'salvage');
    expect(crate).toBeTruthy();
    // Find one of slot 0's live ground units and park it on the crate.
    const collector = [...g.entities.values()].find(
      e => e.owner === slot && e.kind === 'unit' && e.hp > 0 && !g.isAircraft(e));
    expect(collector).toBeTruthy();
    const before = g.players[slot].credits;
    collector!.x = collector!.px = (crate!.cell % g.map.w) * 256 + 128;
    collector!.y = collector!.py = Math.floor(crate!.cell / g.map.w) * 256 + 128;
    g.step();
    expect(g.players[slot].credits).toBe(before + crate!.value!);
    expect(g.crates.some(c => c.id === crate!.id)).toBe(false);
  }, IT_TIMEOUT);
});
