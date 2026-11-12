// Frontier spawn selection (PW23, COMRADE 18 §2.4): a newcomer joins the newest
// region whose members all stay inside the configured power band; when no
// region qualifies a new frontier region is generated. Power scores are the
// world_member read model the region runner refreshes at checkpoints.
import { randomInt, randomUUID } from 'node:crypto';
import { PACKS } from '@comrade/fusion';
import { PERSISTENT_RULES_V1, spawnRegionInBand, type MmoRulesProfile } from '@comrade/contracts';
import { mmoOne, mmoQuery } from './db.js';
import { createRegion, joinWorld, memberPowerScores, type RegionRow } from './store.js';

interface RegionSeedSim {
  sim?: { players?: { playerId: string }[] };
}

/** Scores of the players rostered in a region's sim spec. */
async function regionMemberScores(worldId: string, region: RegionRow): Promise<number[]> {
  const sim = (region.seed as RegionSeedSim | null)?.sim;
  const ids = (sim?.players ?? []).map(p => p.playerId).filter(Boolean);
  if (!ids.length) return [];
  const scores = await memberPowerScores(worldId);
  const byId = new Map(scores.map(s => [s.playerId, s.score]));
  return ids.map(id => byId.get(id) ?? 0);
}

/**
 * Newest-first frontier scan. Returns the first region inside the power band,
 * or null when every region is too strong — the caller then generates a new
 * frontier region. `baselineScore` is the joiner's own score, or the profile's
 * cohort baseline for a player with no scored assets yet.
 */
export async function selectSpawnRegion(
  worldId: string, baselineScore: number, rules: MmoRulesProfile,
): Promise<RegionRow | null> {
  const regions = await mmoQuery<RegionRow>(
    `select * from region where world_id = $1 order by created_at desc`, [worldId]);
  for (const region of regions) {
    const scores = await regionMemberScores(worldId, region);
    if (spawnRegionInBand(scores, baselineScore, rules.spawnRegionPowerBandRatio)) return region;
  }
  return null;
}

/**
 * Ensure the player has a spawn region: join the newest in-band frontier
 * region, or create a fresh one when none qualifies (or the world has none).
 * The new region embeds a Fusion sim spec like the fixture, rostered with the
 * joining player; region lifecycle starts 'recovering' for the runner to claim.
 */
export async function ensureSpawnRegion(args: {
  worldId: string; playerId: string; displayName: string;
  rules?: MmoRulesProfile; playerScore?: number; faction?: string;
}): Promise<{ region: RegionRow; created: boolean }> {
  const rules = args.rules ?? PERSISTENT_RULES_V1;
  const baseline = (args.playerScore ?? 0) > 0 ? args.playerScore! : rules.spawnCohortBaselineScore;
  const existing = await selectSpawnRegion(args.worldId, baseline, rules);
  await joinWorld(args.worldId, args.playerId);
  if (existing) return { region: existing, created: false };
  const pack = PACKS['td'];
  const regionId = randomUUID();
  const sim = {
    packId: pack.id, mapId: pack.maps[0].id, seed: randomInt(1, 0x7fffffff),
    players: [{
      playerId: args.playerId, name: args.displayName,
      faction: args.faction ?? pack.factions[0].id,
    }],
  };
  const region = await createRegion({
    regionId, worldId: args.worldId, label: `frontier-${regionId.slice(0, 8)}`,
    seed: { sim }, rulesetVersion: 'persistent_world', engineArtifactSha256: 'persistent-engine',
  });
  return { region, created: true };
}

/** Convenience for tests and provisioning: does a world have any region yet? */
export async function worldHasRegions(worldId: string): Promise<boolean> {
  const row = await mmoOne<{ n: string }>(
    'select count(*)::text as n from region where world_id = $1', [worldId]);
  return Number(row?.n ?? 0) > 0;
}
