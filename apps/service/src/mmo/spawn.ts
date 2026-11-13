// Frontier spawn selection (PW23, COMRADE 18 §2.4): a newcomer joins the newest
// region whose members all stay inside the configured power band; when no
// region qualifies a new frontier region is generated. Power scores are the
// world_member read model the region runner refreshes at checkpoints.
import { randomInt, randomUUID } from 'node:crypto';
import { WORLDGEN_VERSION, buildableTerrain, generateMap, generateWorldMap, packById, passable, worldgenSpecFor, worldPack, type RulePack, type WorldgenSpec } from '@comrade/fusion';
import { MMO_WORLDGEN_DEFAULT, PERSISTENT_RULES_V1, spawnRegionInBand, type MmoRulesProfile } from '@comrade/contracts';
import { mmoOne, mmoQuery } from './db.js';
import { createRegion, getRegion, getSettlement, joinWorld, memberPowerScores, type RegionRow } from './store.js';

interface RegionSeedSim {
  sim?: { players?: { playerId: string }[]; packId?: string };
}

/** The pack a region's sim spec pins, or null when absent. */
function regionPackId(region: RegionRow): string | null {
  return (region.seed as RegionSeedSim | null)?.sim?.packId ?? null;
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
  // PW28: once any universal-world region exists, newcomers only ever join
  // mashup regions — a legacy 'td' region would deny them the full faction
  // roster. Worlds with no mashup region yet (fresh deploys, test fixtures)
  // keep the legacy scan so existing regions remain joinable.
  const universal = regions.filter(r => regionPackId(r) === worldPack().pack.id);
  const pool = universal.length ? universal : regions;
  for (const region of pool) {
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
  /**
   * PW11: false creates the frontier region with an EMPTY sim roster — the
   * newcomer then enters through the journaled `settle` action, which picks
   * faction/cell, writes the settlement row and grants the starter army.
   * Default true keeps the PW23 provisioning shape (player pre-rostered).
   */
  roster?: boolean;
}): Promise<{ region: RegionRow; created: boolean }> {
  const rules = args.rules ?? PERSISTENT_RULES_V1;
  const baseline = (args.playerScore ?? 0) > 0 ? args.playerScore! : rules.spawnCohortBaselineScore;
  const existing = await selectSpawnRegion(args.worldId, baseline, rules);
  await joinWorld(args.worldId, args.playerId);
  if (existing) return { region: existing, created: false };
  // PW28: every NEW frontier region runs the universal mashup world pack — all
  // factions' buildings and forces, gated per player by their settle loadout.
  // Regions created before this change keep their pinned packId ('td').
  const pack = worldPack().pack;
  const regionId = randomUUID();
  const players = args.roster === false ? [] : [{
    playerId: args.playerId, name: args.displayName,
    faction: args.faction ?? pack.factions[0].id,
  }];
  // PW16: frontier regions are procedurally generated, not preset maps. The
  // spec + seed are stored in the region seed; the runner and every snapshot
  // regenerate identical terrain. Diagnostics record which attempts were
  // rejected so bad generations are explainable after the fact.
  const seed = randomInt(1, 0x7fffffff);
  const worldgen = worldgenSpecFor(pack, rules.worldgen ?? MMO_WORLDGEN_DEFAULT, seed);
  const gen = generateWorldMap(pack, worldgen, seed);
  const sim = {
    packId: pack.id, mapId: 'worldgen', seed, worldgen, players,
  };
  const region = await createRegion({
    regionId, worldId: args.worldId, label: `frontier-${regionId.slice(0, 8)}`,
    seed: {
      sim,
      worldgen: {
        version: WORLDGEN_VERSION,
        acceptedAttempt: gen.report.attempts.length - 1,
        landBridges: gen.report.landBridges,
        rejected: gen.report.attempts.filter(a => a.reasons.length),
      },
    },
    rulesetVersion: 'persistent_world', engineArtifactSha256: 'persistent-engine',
  });
  return { region, created: true };
}

/** Convenience for tests and provisioning: does a world have any region yet? */
export async function worldHasRegions(worldId: string): Promise<boolean> {
  const row = await mmoOne<{ n: string }>(
    'select count(*)::text as n from region where world_id = $1', [worldId]);
  return Number(row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Newcomer spawn placement (PW11)
// ---------------------------------------------------------------------------

/** Cells within this radius must hold reachable resources for a viable spawn. */
const RESOURCE_RADIUS_CELLS = 14;

function spawnMap(packId: string, mapId: string, seed: number, worldgen?: WorldgenSpec): { pack: RulePack; map: ReturnType<typeof generateMap> } {
  const pack = packById(packId);
  if (!pack) throw new Error(`unknown pack ${packId}`);
  if (worldgen) return { pack, map: generateWorldMap(pack, worldgen, seed).map };
  const preset = pack.maps.find(m => m.id === mapId) ?? pack.maps[0];
  return { pack, map: generateMap(pack, preset, seed) };
}

/** Resource units within RESOURCE_RADIUS_CELLS of cell `i` (Chebyshev). */
function nearbyResources(map: ReturnType<typeof generateMap>, i: number): number {
  const cx = i % map.w, cy = Math.floor(i / map.w), r = RESOURCE_RADIUS_CELLS;
  let total = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(map.h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(map.w - 1, cx + r); x++) {
      total += map.res[y * map.w + x];
    }
  }
  return total;
}

/** Minimum cell distance from `i` to any keep-away cell (Infinity when none). */
function minSeparation(map: { w: number }, i: number, keepAway: number[]): number {
  if (!keepAway.length) return Infinity;
  const cx = i % map.w, cy = Math.floor(i / map.w);
  let best = Infinity;
  for (const k of keepAway) {
    const dx = Math.abs(cx - (k % map.w)), dy = Math.abs(cy - Math.floor(k / map.w));
    best = Math.min(best, Math.max(dx, dy));
  }
  return best;
}

/**
 * A spawn cell must be on land a vehicle can use, on buildable terrain with a
 * free cell, with resources close enough for the starter harvester to work.
 */
function viableCell(pack: RulePack, map: ReturnType<typeof generateMap>, i: number): boolean {
  if (!passable(pack, map, i, 'vehicle') || !buildableTerrain(pack, map, i)) return false;
  return nearbyResources(map, i) > 0;
}

export interface SpawnPick { cell: number; x: number; y: number; adjusted: boolean }

/** FNV-1a over seed+salt: deterministic per-player "random" index for spawn spread. */
function pickHash(seed: number, salt: string): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** How many top-resource max-separation candidates the salted pick chooses among. */
const SPREAD_CANDIDATES = 24;

/**
 * Choose the newcomer's spawn cell (PW11): the client's requested cell when it
 * is viable, otherwise the best valid cell — maximum practical travel
 * separation from every existing player's assets, then richest nearby
 * resources, deterministic scan order. `separationCells` is the profile's
 * minimum; when no cell reaches it the maximum available separation wins.
 *
 * With `salt` (the settling player's id) the pick is still deterministic but
 * spreads newcomers: instead of always the single richest max-separation
 * cell, it chooses among the top SPREAD_CANDIDATES resource cells by a
 * seed+salt hash, so players land at varied positions across the far side of
 * the map rather than piling onto one spot.
 */
export function pickSpawnCell(args: {
  packId: string; mapId: string; seed: number; worldgen?: WorldgenSpec;
  keepAwayCells?: number[]; separationCells?: number; preferCell?: number;
  salt?: string;
}): SpawnPick {
  const { pack, map } = spawnMap(args.packId, args.mapId, args.seed, args.worldgen);
  const keepAway = args.keepAwayCells ?? [];
  const separation = args.separationCells ?? PERSISTENT_RULES_V1.spawnSeparationCells;
  const finish = (cell: number, adjusted: boolean): SpawnPick => ({
    cell, x: cell % map.w, y: Math.floor(cell / map.w), adjusted,
  });
  const prefer = args.preferCell;
  if (prefer !== undefined && prefer >= 0 && prefer < map.w * map.h
    && viableCell(pack, map, prefer) && minSeparation(map, prefer, keepAway) >= separation) {
    return finish(prefer, false);
  }
  let best = -1, bestSep = -1, bestRes = -1;
  const tied: { i: number; res: number }[] = [];
  for (let i = 0; i < map.w * map.h; i++) {
    if (!viableCell(pack, map, i)) continue;
    const sep = minSeparation(map, i, keepAway);
    const res = nearbyResources(map, i);
    // Primary: separation (capped at the required distance so ties break on
    // resources); secondary: reachable resources; tertiary: scan order.
    const sepScore = Math.min(sep, separation);
    if (sepScore > bestSep) {
      best = i; bestSep = sepScore; bestRes = res;
      tied.length = 0; tied.push({ i, res });
    } else if (sepScore === bestSep) {
      tied.push({ i, res });
      if (res > bestRes) { bestRes = res; best = i; }
    }
  }
  if (args.salt !== undefined && tied.length > 1) {
    // Deterministic per-player spread: richest max-separation cells first,
    // then a seed+salt hash picks one — replay-safe because the salt is the
    // durable player id.
    tied.sort((a, b) => b.res - a.res || a.i - b.i);
    const top = tied.slice(0, SPREAD_CANDIDATES);
    best = top[pickHash(args.seed, args.salt) % top.length].i;
  }
  if (best < 0) {
    // No cell satisfies every constraint (tiny or resource-poor map): fall back
    // to the first vehicle-passable buildable cell so settlement can never stall.
    for (let i = 0; i < map.w * map.h; i++) {
      if (passable(pack, map, i, 'vehicle') && buildableTerrain(pack, map, i)) { best = i; break; }
    }
  }
  return finish(best >= 0 ? best : 0, true);
}

/**
 * The region a player should enter (PW11): their settlement region when one
 * exists, otherwise the newest in-band frontier region or a fresh one with an
 * empty roster — the journaled `settle` action then grants the starter army.
 */
export async function ensureEntryRegion(args: {
  worldId: string; playerId: string; displayName: string;
  rules?: MmoRulesProfile;
}): Promise<{ region: RegionRow; created: boolean; settled: boolean }> {
  const settlement = await getSettlement(args.playerId);
  if (settlement) {
    const region = await getRegion(settlement.region_id);
    if (region) return { region, created: false, settled: true };
  }
  const spawn = await ensureSpawnRegion({ ...args, roster: false });
  return { ...spawn, settled: false };
}
