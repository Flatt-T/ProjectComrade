// PW33 (THU-2444): content fingerprint pinning — a region records the exact
// engine/pack/rules/worldgen content it was created under; a runner built from
// different content refuses to start before any restore or mutation.
// Requires MMO_TEST_DATABASE_URL.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMmoDatabase, mmoQuery, resetMmoDatabase } from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { seedFixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { RegionRunner, type RegionSimSpec } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { regionFingerprints } from '../../apps/service/src/mmo/fingerprints.js';
import { PERSISTENT_RULES_V1 } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const TICK_MS = 5;

describeDb('mmo content fingerprints (PW33, real PostgreSQL)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  });
  afterAll(async () => { await closeMmoDatabase(); });

  const mkRunner = (regionId: string, workerId: string) => new RegionRunner({
    regionId, workerId, leaseMs: 60_000, tickMs: TICK_MS, pollMs: 20,
    worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
    log: () => undefined,
  });

  it('starts under matching fingerprints and refuses a mismatched build', async () => {
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2 });
    const sim = (fx.region.seed as { sim?: RegionSimSpec }).sim;
    expect(sim).toBeTruthy();

    // Pin the region to the content this build resolves — the production path
    // (spawn.ts) does the same at creation.
    const fp = regionFingerprints(sim!, PERSISTENT_RULES_V1);
    await mmoQuery('update region set fingerprints = $2::jsonb where region_id = $1',
      [fx.regionId, JSON.stringify(fp)]);

    // Matching fingerprint: the runner starts and restores normally.
    const ok = mkRunner(fx.regionId, fx.workerId);
    await ok.start();
    expect(ok.currentGame).toBeTruthy();
    await ok.stop();
    await releaseRegionLease(fx.regionId, fx.workerId).catch(() => undefined);

    // Tamper the stored fingerprint — simulates a region created under
    // different engine/pack/rules/worldgen content. The mismatch is detected
    // after the lease is taken but before any restore or journal mutation.
    await mmoQuery('update region set fingerprints = $2::jsonb where region_id = $1',
      [fx.regionId, JSON.stringify({ ...fp, content: 'f'.repeat(64) })]);
    const badWorker = randomUUID();
    const bad = mkRunner(fx.regionId, badWorker);
    await expect(bad.start()).rejects.toMatchObject({ code: 'FINGERPRINT_MISMATCH' });
    await bad.stop().catch(() => undefined);
    await releaseRegionLease(fx.regionId, badWorker).catch(() => undefined);

    // A region with NO fingerprint (pre-pinning legacy) still starts — its
    // content is unverifiable, so it is never stamped with a false digest.
    await mmoQuery('update region set fingerprints = null where region_id = $1', [fx.regionId]);
    const legacy = mkRunner(fx.regionId, fx.workerId);
    await legacy.start();
    expect(legacy.currentGame).toBeTruthy();
    await legacy.stop();
    const after = await mmoQuery<{ fingerprints: unknown }>(
      'select fingerprints from region where region_id = $1', [fx.regionId]);
    expect(after[0].fingerprints).toBeNull();
  }, 60_000);

  it('fingerprints are deterministic and content-sensitive', async () => {
    const spec: RegionSimSpec = {
      packId: 'td', mapId: 'td-tiberium-gardens', seed: 42,
      players: [{ playerId: randomUUID(), name: 'A', faction: 'gdi' }],
    };
    const a = regionFingerprints(spec, PERSISTENT_RULES_V1);
    const b = regionFingerprints(spec, PERSISTENT_RULES_V1);
    expect(a.content).toBe(b.content);
    expect(a.engine).toBe(b.engine);

    // Any changed input must change the content hash.
    const otherSeed = regionFingerprints({ ...spec, seed: 43 }, PERSISTENT_RULES_V1);
    expect(otherSeed.content).not.toBe(a.content);
    // An unknown pack throws rather than producing a silent fingerprint.
    expect(() => regionFingerprints({ ...spec, packId: 'no-such-pack' }, PERSISTENT_RULES_V1))
      .toThrow(/unknown pack/);
    // Changed rules or worldgen inputs change the content hash too.
    const otherRules = regionFingerprints(spec, { ...PERSISTENT_RULES_V1, structureHpMultiplier: 2 });
    expect(otherRules.content).not.toBe(a.content);
    const otherGen = regionFingerprints({ ...spec, worldgen: { version: 1 } as never }, PERSISTENT_RULES_V1);
    expect(otherGen.content).not.toBe(a.content);
  });
});
