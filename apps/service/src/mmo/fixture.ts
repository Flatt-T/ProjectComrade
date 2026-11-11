// Migration-backed synthetic fixture world for tests and local beta bring-up.
// Every identifier is generated fresh per call — fixtures are original synthetic data,
// never copied assets or player data.
import { randomUUID } from 'node:crypto';
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
  const lease = await acquireRegionLease({ regionId, workerId, leaseMs: args?.leaseMs ?? 60_000 });
  await mmoQuery(`update region set lifecycle = 'active' where region_id = $1`, [regionId]);
  const region = (await mmoQuery<RegionRow>('select * from region where region_id = $1', [regionId]))[0];
  return { worldId, regionId, region, players, workerId, epoch: lease.epoch };
}
