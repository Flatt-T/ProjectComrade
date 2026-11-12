// PW23 integration tests: power-score persistence through the real region
// runner/checkpoint path and frontier spawn-band selection against REAL
// PostgreSQL. Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase } from '../../apps/service/src/mmo/db.js';
import { createPlayer, createWorld, memberPowerScores, updateMemberPowerScores } from '../../apps/service/src/mmo/store.js';
import { ensureSpawnRegion, worldHasRegions } from '../../apps/service/src/mmo/spawn.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { MMO_RULESET_ID, MMO_RULESET_VERSION, PERSISTENT_RULES_V1 } from '../../packages/contracts/src/mmo.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 8000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

describeDb('mmo pacing (real PostgreSQL + real Fusion sim)', () => {
  let fx: FixtureWorld;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    fx = await seedFixtureWorld({ leaseMs: 300_000 });
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('persists recomputed power scores for world members at checkpoint', async () => {
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
    });
    await runner.start();
    try {
      await waitFor(async () => (runner.currentGame?.tick ?? 0) > 30);
    } finally {
      await runner.stop(); // stop checkpoints, which persists power scores
    }
    const scores = await memberPowerScores(fx.worldId);
    expect(scores.length).toBe(fx.players.length);
    // Every rostered player fields starting assets — score must be positive.
    for (const s of scores) expect(s.score).toBeGreaterThan(0);
    const raw = await mmoQuery<{ player_id: string; power_score: string }>(
      'select player_id, power_score from world_member where world_id = $1', [fx.worldId]);
    expect(raw.every(r => BigInt(r.power_score) > 0n)).toBe(true);
  });

  it('spawns newcomers into the newest in-band frontier region', async () => {
    const newcomer = await createPlayer({ accountId: randomUUID(), displayName: 'Newcomer' });
    // Region members score well under the cohort baseline ceiling — in band.
    await updateMemberPowerScores(fx.worldId, fx.players.map((p, i) => ({
      playerId: p.playerId, score: 10_000 + i * 1000,
    })));
    const joined = await ensureSpawnRegion({
      worldId: fx.worldId, playerId: newcomer.player_id, displayName: newcomer.display_name,
    });
    expect(joined.created).toBe(false);
    expect(joined.region.region_id).toBe(fx.regionId);
    // The newcomer is a world member even when joining an existing region.
    const member = await mmoOne('select 1 as x from world_member where world_id = $1 and player_id = $2',
      [fx.worldId, newcomer.player_id]);
    expect(member).toBeTruthy();
  });

  it('generates a new frontier region when every region is above the band', async () => {
    const newcomer2 = await createPlayer({ accountId: randomUUID(), displayName: 'Latecomer' });
    // Push every scored member beyond baseline * bandRatio (20000 * 4 = 80000).
    const ceiling = PERSISTENT_RULES_V1.spawnCohortBaselineScore * PERSISTENT_RULES_V1.spawnRegionPowerBandRatio;
    await updateMemberPowerScores(fx.worldId, [
      ...fx.players.map(p => ({ playerId: p.playerId, score: ceiling + 1 })),
      // The previous newcomer stays unscored (0) and does not disqualify alone —
      // but the fixture members do, so the region is out of band.
    ]);
    const spawned = await ensureSpawnRegion({
      worldId: fx.worldId, playerId: newcomer2.player_id, displayName: newcomer2.display_name,
    });
    expect(spawned.created).toBe(true);
    expect(spawned.region.region_id).not.toBe(fx.regionId);
    expect(spawned.region.world_id).toBe(fx.worldId);
    // The new frontier region is rostered with the joining player in its sim spec.
    const sim = (spawned.region.seed as { sim?: { players?: { playerId: string }[] } }).sim;
    expect(sim?.players?.map(p => p.playerId)).toContain(newcomer2.player_id);
    // And it is now the newest region — a same-cohort joiner lands there.
    const cohort3 = await createPlayer({ accountId: randomUUID(), displayName: 'Cohort3' });
    const third = await ensureSpawnRegion({
      worldId: fx.worldId, playerId: cohort3.player_id, displayName: cohort3.display_name,
    });
    expect(third.region.region_id).toBe(spawned.region.region_id);
  });

  it('an empty world gets a generated frontier region on first spawn', async () => {
    const worldId = randomUUID();
    await createWorld({
      worldId, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
      packRevision: 'fixture-synthetic-1', engineArtifactSha256: 'fixture-engine-sha',
      capabilities: {}, decisions: {},
    });
    expect(await worldHasRegions(worldId)).toBe(false);
    const first = await createPlayer({ accountId: randomUUID(), displayName: 'First' });
    const spawned = await ensureSpawnRegion({
      worldId, playerId: first.player_id, displayName: first.display_name,
    });
    expect(spawned.created).toBe(true);
    expect(await worldHasRegions(worldId)).toBe(true);
  });
});
