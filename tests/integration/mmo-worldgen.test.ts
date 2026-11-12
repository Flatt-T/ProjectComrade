// PW16 integration tests: frontier regions are procedurally generated —
// versioned spec + seed stored in the region row, diagnostics recorded,
// runner boots the generated map, and newcomers settle onto viable land.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { createPlayer, createWorld, getSettlement, playerConnected, updateMemberPowerScores, type RegionRow } from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { ensureSpawnRegion } from '../../apps/service/src/mmo/spawn.js';
import { PACKS, WORLDGEN_VERSION, isWater, passable, buildableTerrain } from '../../packages/fusion/src/index';
import {
  MMO_RULESET_ID, MMO_RULESET_VERSION, PERSISTENT_RULES_V1,
  type MmoCommandMessage, type MmoRulesProfile, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';
import type { WorldgenSpec } from '../../packages/fusion/src/index';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const RULES: MmoRulesProfile = {
  ...PERSISTENT_RULES_V1,
  setupProtectionOnlineMs: 1_500,
  setupProtectionLapseMs: 4_000,
  offlineAfterMs: 400,
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 10_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface SimSpec { packId: string; mapId: string; seed: number; worldgen?: WorldgenSpec; players: { playerId: string }[] }
interface RegionSeed { sim?: SimSpec; worldgen?: { version: number; acceptedAttempt: number; landBridges: number; rejected: unknown[] } }

async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await createWorld({
    worldId, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    packRevision: 'fixture-synthetic-1', engineArtifactSha256: 'fixture-engine-sha',
    capabilities: {}, decisions: {},
  });
  return worldId;
}

async function startRunner(region: RegionRow): Promise<{ region: RegionRow; runner: RegionRunner; workerId: string }> {
  const workerId = randomUUID();
  const runner = new RegionRunner({
    regionId: region.region_id, workerId, leaseMs: 60_000,
    tickMs: TICK_MS, pollMs: 20,
    rules: RULES, worldHandler: createWorldHandler(RULES),
    quiescence: { enabled: false },
  });
  await runner.start();
  return { region, runner, workerId };
}

async function worldAction(
  ctx: { region: RegionRow; workerId: string; runner: RegionRunner },
  playerId: string, action: MmoWorldAction, commandId = randomUUID(),
): Promise<{ accepted: boolean; reason?: string }> {
  const fence = { workerId: ctx.workerId, epoch: ctx.runner.authorityEpoch! };
  const tail = await journalTail(ctx.region.region_id);
  const tick = tail ? BigInt(tail.tick) : 0n;
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: ctx.region.region_id, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  await submitCommand({ playerId, rawMessage, fence, tick });
  let result: { accepted?: boolean; reason?: string } | undefined;
  await waitFor(async () => {
    const ev = await mmoOne<{ application_result: unknown }>(
      `select application_result from region_event
        where region_id = $1 and payload->>'commandId' = $2 and applied_at is not null`,
      [ctx.region.region_id, commandId]);
    result = (ev?.application_result ?? undefined) as typeof result;
    return result !== undefined;
  });
  return (result ?? {}) as { accepted: boolean; reason?: string };
}

describeDb('mmo frontier worldgen (real PostgreSQL + real Fusion sim)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('creates frontier regions with a versioned worldgen spec and diagnostics', async () => {
    const worldId = await makeWorld();
    const { region } = await ensureSpawnRegion({
      worldId, playerId: randomUUID(), displayName: 'Prober', rules: RULES,
    });
    const seed = region.seed as RegionSeed;
    expect(seed.sim?.mapId).toBe('worldgen');
    expect(seed.sim?.worldgen?.version).toBe(WORLDGEN_VERSION);
    expect(seed.sim?.worldgen?.width).toBe(RULES.worldgen!.width);
    expect(seed.worldgen?.version).toBe(WORLDGEN_VERSION);
    expect(seed.worldgen?.rejected.length).toBeGreaterThanOrEqual(0);
  });

  it('boots the generated map on the runner and settles a newcomer onto viable land', async () => {
    const worldId = await makeWorld();
    const player = await createPlayer({ accountId: randomUUID(), displayName: 'Islander' });
    await playerConnected(player.player_id, Date.now());
    const { region } = await ensureSpawnRegion({
      worldId, playerId: player.player_id, displayName: 'Islander', rules: RULES, roster: false,
    });
    const ctx = await startRunner(region);
    try {
      const game = ctx.runner.currentGame!;
      const spec = (region.seed as RegionSeed).sim!.worldgen!;
      expect(game.worldgenSpec).toBeTruthy();
      expect(game.map.w).toBe(spec.width);
      expect(game.map.h).toBe(spec.height);
      // The generated map really has water and land.
      let water = 0, land = 0;
      for (let i = 0; i < game.map.w * game.map.h; i++) {
        if (isWater(game.pack, game.map, i)) water++; else if (passable(game.pack, game.map, i, 'vehicle')) land++;
      }
      expect(water).toBeGreaterThan(0);
      expect(land).toBeGreaterThan(0);

      const res = await worldAction(ctx, player.player_id, {
        t: 'settle', regionId: region.region_id, faction: 'gdi', x: 48, y: 48,
      });
      expect(res.accepted).toBe(true);
      const settlement = await getSettlement(player.player_id);
      expect(settlement).toBeTruthy();
      // The settled cell is vehicle-capable, unoccupied-terrain buildable land
      // (the MCV itself occupies it, so check terrain not occupancy).
      const pack = PACKS['td'];
      const cell = settlement!.cell_y * spec.width + settlement!.cell_x;
      expect(pack.terrains[game.map.terrain[cell]].vehicle).toBe(true);
      expect(isWater(pack, game.map, cell)).toBe(false);
      expect(buildableTerrain(pack, game.map, cell)).toBe(true);
      // Bound starter army joined the sim.
      await waitFor(() => {
        const g = ctx.runner.currentGame!;
        const slot = g.players.findIndex(p => p.pid === player.player_id);
        if (slot < 0) return false;
        return [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0).length === 16;
      });
    } finally {
      ctx.runner.stop();
    }
  });

  it('appends a distinct frontier region when demand exceeds the band', async () => {
    const worldId = await makeWorld();
    const p1 = await createPlayer({ accountId: randomUUID(), displayName: 'Vet' });
    const first = await ensureSpawnRegion({
      worldId, playerId: p1.player_id, displayName: 'Vet', rules: RULES,
    });
    // Push the incumbent's power beyond baseline * bandRatio so the region is
    // out of band for a same-cohort newcomer.
    const ceiling = PERSISTENT_RULES_V1.spawnCohortBaselineScore * PERSISTENT_RULES_V1.spawnRegionPowerBandRatio;
    await updateMemberPowerScores(worldId, [{ playerId: p1.player_id, score: ceiling + 1 }]);
    const second = await ensureSpawnRegion({
      worldId, playerId: randomUUID(), displayName: 'Newcomer', rules: RULES, roster: false,
    });
    expect(second.created).toBe(true);
    expect(second.region.region_id).not.toBe(first.region.region_id);
    const s1 = (first.region.seed as RegionSeed).sim!;
    const s2 = (second.region.seed as RegionSeed).sim!;
    expect(s2.worldgen?.version).toBe(WORLDGEN_VERSION);
    // Different seeds → different generated land (spec terrain picks may coincide).
    expect(s2.seed).not.toBe(s1.seed);
  });
});
