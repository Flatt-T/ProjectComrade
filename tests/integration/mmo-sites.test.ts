// PW24 integration tests: capturable sites and the ladder against REAL
// PostgreSQL and the REAL region runner. Sites must spawn neutral, flip
// ownership deterministically, and every flip/award must land in the journal
// (economy_operation) and the materialized ladder_board — rebuildable from
// the journal alone. Requires MMO_TEST_DATABASE_URL (disposable database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { ladderBoard, rebuildLadderBoards, releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PERSISTENT_RULES_V1 } from '../../packages/contracts/src/index.js';

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

describeDb('mmo capturable sites + ladder (real PostgreSQL + runner)', () => {
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
    for (const pl of g.players) pl.newcomerProtected = false;
  }, 60_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  it('spawns 2-4 neutral sites that cannot be damaged or shielded', async () => {
    const g = ctx.runner.currentGame!;
    const sites = [...g.entities.values()].filter(e => e.kind === 'structure' && g.structDef(e).site);
    expect(sites.length).toBeGreaterThanOrEqual(PERSISTENT_RULES_V1.sitesPerRegion.min);
    expect(sites.length).toBeLessThanOrEqual(PERSISTENT_RULES_V1.sitesPerRegion.max);
    expect(sites.every(s => s.owner === -1)).toBe(true);
    const site = sites[0];
    const hp = site.hp;
    g.damage(site, 99999, 0);
    expect(site.hp).toBe(hp);
    g.enqueue(0, { t: 'setShield', compound: site.id, on: true });
    g.step();
    expect(site.shielded).toBe(false);
  }, IT_TIMEOUT);

  it('a parked unit captures the site and the flip is journaled once', async () => {
    const g = ctx.runner.currentGame!;
    const regionId = ctx.fx.regionId;
    const site = [...g.entities.values()].find(e => e.kind === 'structure' && g.structDef(e).site && e.owner === -1)!;
    expect(site).toBeTruthy();
    const unit = [...g.entities.values()].find(
      e => e.owner === 0 && e.kind === 'unit' && e.hp > 0 && !g.isAircraft(e) && !e.carriedBy)!;
    expect(unit).toBeTruthy();
    unit.x = unit.px = (site.cx + site.w / 2) * 256;
    unit.y = unit.py = (site.cy + site.h / 2) * 256;

    const opsBefore = await mmoOne<{ n: string }>(
      `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SITE_CAPTURE'`, [regionId]);

    await waitFor(() => site.owner === 0, 15_000, 50);
    await waitFor(async () => {
      const row = await mmoOne<{ n: string }>(
        `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SITE_CAPTURE'`, [regionId]);
      return Number(row?.n ?? 0) > Number(opsBefore?.n ?? 0);
    });

    const op = await mmoOne<{ canonical_action: { siteId?: string; ownerId?: string | null } }>(
      `select canonical_action from economy_operation
        where region_id = $1 and kind = 'SITE_CAPTURE' order by committed_at desc limit 1`, [regionId]);
    expect(op).toBeTruthy();
    // Exactly one capture op for this flip — stepping on must not duplicate.
    await sleep(100);
    const opsAfter = await mmoOne<{ n: string }>(
      `select count(*)::text as n from economy_operation where region_id = $1 and kind = 'SITE_CAPTURE'`, [regionId]);
    expect(Number(opsAfter?.n ?? 0)).toBe(Number(opsBefore?.n ?? 0) + 1);
  }, IT_TIMEOUT);

  it('ladder boards materialize and rebuild exactly from the journal', async () => {
    const worldId = ctx.fx.worldId;
    // Give the awards a moment to drain, then read both periods.
    await waitFor(async () => {
      const rows = await ladderBoard(worldId, 'player', 'all', 50);
      return rows.length > 0;
    });
    const [allRows, d30Rows] = await Promise.all([
      ladderBoard(worldId, 'player', 'all', 50),
      ladderBoard(worldId, 'player', '30d', 50),
    ]);
    expect(allRows.length).toBeGreaterThan(0);
    // Fresh world: every award is inside the 30-day window, so totals match.
    expect(d30Rows.map(r => r.points)).toEqual(allRows.map(r => r.points));

    // Journal reconstruction: wipe the materialized rows and rebuild — the
    // totals must come back identical because they derive from
    // economy_operation LADDER_AWARD rows alone.
    const before = await mmoQuery<{ subject_id: string; points: string }>(
      `select subject_id, points::text from ladder_board where world_id = $1 and board = 'player' and period = 'all'`, [worldId]);
    await rebuildLadderBoards(worldId);
    const after = await mmoQuery<{ subject_id: string; points: string }>(
      `select subject_id, points::text from ladder_board where world_id = $1 and board = 'player' and period = 'all' order by subject_id`, [worldId]);
    const norm = (rows: { subject_id: string; points: string }[]) =>
      rows.map(r => `${r.subject_id}:${r.points}`).sort();
    expect(norm(after)).toEqual(norm(before));
    // Sanity: at least one award exists in the journal for this region.
    const awards = await mmoOne<{ n: string }>(
      `select count(*)::text as n from economy_operation o join region r on r.region_id = o.region_id
        where r.world_id = $1 and o.kind = 'LADDER_AWARD'`, [worldId]);
    expect(Number(awards?.n ?? 0)).toBeGreaterThan(0);
  }, IT_TIMEOUT);

  it('site-hold time pays ladder points to the outgoing holder on loss', async () => {
    const g = ctx.runner.currentGame!;
    const worldId = ctx.fx.worldId;
    // Find a site still owned by a player and have the other slot take it.
    const site = [...g.entities.values()].find(e => e.kind === 'structure' && g.structDef(e).site && e.owner >= 0)!;
    expect(site).toBeTruthy();
    const holder = site.owner;
    const taker = holder === 0 ? 1 : 0;
    // Hold points pay per whole in-game minute (900 sim ticks ≈ 4.5s here);
    // let the current holder bank at least one minute before the flip.
    await sleep(6_000);
    const unit = [...g.entities.values()].find(
      e => e.owner === taker && e.kind === 'unit' && e.hp > 0 && !g.isAircraft(e) && !e.carriedBy)!;
    expect(unit).toBeTruthy();
    // Survive the holder's base defenses for the duration of the capture.
    unit.maxHp = 1_000_000; unit.hp = 1_000_000;
    // Clear the holder's units to the corner farthest from the site so the
    // taker can't auto-engage them instead of holding the capture radius.
    const farX = site.cx > g.map.w / 2 ? 4 : g.map.w - 5;
    const farY = site.cy > g.map.h / 2 ? 4 : g.map.h - 5;
    for (const e of [...g.entities.values()]) {
      if (e.kind === 'unit' && e.owner === holder) { e.x = e.px = farX * 256; e.y = e.py = farY * 256; }
    }
    unit.x = unit.px = (site.cx + site.w / 2) * 256;
    unit.y = unit.py = (site.cy + site.h / 2) * 256;
    unit.order = 'idle'; unit.target = 0; unit.path = []; unit.stillTicks = 0;
    const before = site.owner;
    await waitFor(() => site.owner === taker, 15_000, 50);
    expect(before).not.toBe(taker);
    // The SITE_CAPTURE op records the flip; hold-time points for the holder
    // land as a LADDER_AWARD with reason site_hold.
    await waitFor(async () => {
      const row = await mmoOne<{ n: string }>(
        `select count(*)::text as n from economy_operation o join region r on r.region_id = o.region_id
          where r.world_id = $1 and o.kind = 'LADDER_AWARD'
            and o.canonical_action->>'reason' like 'site_hold:%'`, [worldId]);
      return Number(row?.n ?? 0) > 0;
    });
  }, IT_TIMEOUT);
});
