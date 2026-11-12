// Migration-backed synthetic fixture world for tests and local beta bring-up.
// Every identifier is generated fresh per call — fixtures are original synthetic data,
// never copied assets or player data.
import { randomUUID, randomInt } from 'node:crypto';
import { PACKS } from '@comrade/fusion';
import {
  acquireRegionLease, createPlayer, createRegion, createWorld, joinWorld, type RegionRow,
} from './store.js';
import { mmoMigrate, mmoQuery } from './db.js';
import { MMO_PROTOCOL, MMO_RULESET_ID, MMO_RULESET_VERSION, type MmoCapabilities } from '@comrade/contracts';

export interface FixtureWorld {
  worldId: string;
  regionId: string;
  region: RegionRow;
  players: { playerId: string; accountId: string; displayName: string }[];
  workerId: string;
  epoch: string;
}

/**
 * Apply migrations and seed one world with a fenced region and two synthetic players.
 * The returned lease fence is live for `leaseMs`; callers needing longer should
 * re-acquire. Region lifecycle starts 'recovering' — promote it explicitly.
 */
export async function seedFixtureWorld(args?: {
  workerId?: string; leaseMs?: number; playerCount?: number; capabilities?: MmoCapabilities;
  /** Map preset for the embedded sim (default: the pack's first map). */
  mapId?: string;
  /** Override the embedded Fusion sim spec; `null` skips embedding one. */
  sim?: import('./runner.js').RegionSimSpec | null;
}): Promise<FixtureWorld> {
  await mmoMigrate();
  const worldId = randomUUID();
  const regionId = randomUUID();
  const workerId = args?.workerId ?? randomUUID();
  await createWorld({
    worldId, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    packRevision: 'fixture-synthetic-1', engineArtifactSha256: 'fixture-engine-sha',
    capabilities: args?.capabilities ?? {}, decisions: {},
  });
  await createRegion({
    regionId, worldId, label: 'fixture-region', seed: { fixture: true },
    rulesetVersion: MMO_PROTOCOL, engineArtifactSha256: 'fixture-engine-sha',
  });
  const count = args?.playerCount ?? 2;
  const players = [];
  for (let i = 0; i < count; i++) {
    const player = await createPlayer({
      accountId: randomUUID(), displayName: `FixtureCommander${i + 1}`,
    });
    await joinWorld(worldId, player.player_id);
    players.push({ playerId: player.player_id, accountId: player.account_id, displayName: player.display_name });
  }
  // Embed the Fusion sim spec the region runner needs (PW07). TD is the default
  // persistent pack; factions rotate so every player gets a distinct side.
  if (args?.sim !== null) {
    const sim = args?.sim ?? (() => {
      const pack = PACKS['td'];
      return {
        packId: pack.id, mapId: args?.mapId ?? pack.maps[0].id, seed: randomInt(1, 0x7fffffff),
        players: players.map((p, i) => ({
          playerId: p.playerId, name: p.displayName,
          faction: pack.factions[i % pack.factions.length].id,
        })),
      };
    })();
    await mmoQuery(
      `update region set seed = seed || $2::jsonb where region_id = $1`,
      [regionId, JSON.stringify({ sim })]);
  }
  const lease = await acquireRegionLease({ regionId, workerId, leaseMs: args?.leaseMs ?? 60_000 });
  await mmoQuery(`update region set lifecycle = 'active' where region_id = $1`, [regionId]);
  const region = (await mmoQuery<RegionRow>('select * from region where region_id = $1', [regionId]))[0];
  return { worldId, regionId, region, players, workerId, epoch: lease.epoch };
}
