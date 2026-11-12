// Persistent-world entry (PW11): resolves which region a player should enter.
// A settled player returns to their settlement region; a newcomer gets the
// newest in-band frontier region (or a fresh empty one) and settles through the
// journaled `settle` action — never a duplicated grant or restarted clock.
import {
  MMO_CAPABILITIES_MILESTONE1, MMO_DECISIONS_OPEN, MMO_RULESET_ID,
  MMO_RULESET_VERSION, PERSISTENT_RULES_V1,
} from '@comrade/contracts';
import { mmoOne } from './db.js';
import { createPlayer, createWorld, MmoStoreError, recordSignupSignal } from './store.js';
import { persistentPackRevision } from './packs.js';
import { ensureEntryRegion } from './spawn.js';
import type { RegionIdentity } from './regions.js';
import { authEnabled } from '../config.js';

/** The single beta world: the oldest row, created on first entry when absent. */
async function betaWorldId(): Promise<string> {
  const existing = await mmoOne<{ world_id: string }>(
    'select world_id from world order by created_at limit 1');
  if (existing) return existing.world_id;
  const world = await createWorld({
    rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    packRevision: persistentPackRevision('td'), engineArtifactSha256: 'persistent-engine',
    capabilities: MMO_CAPABILITIES_MILESTONE1, decisions: MMO_DECISIONS_OPEN,
  });
  return world.world_id;
}

/**
 * Provision (or fetch) the durable player and pick their entry region.
 * `settled:false` means the client must still send the journaled `settle`
 * world action after subscribing (it has no sim slot until that applies).
 */
export async function enterPersistentWorld(identity: RegionIdentity): Promise<{
  regionId: string; playerId: string; settled: boolean;
}> {
  // Same durable-layer guest guard as RegionService.playerFor (PW09).
  if (identity.kind === 'guest' && authEnabled() && process.env.MMO_ALLOW_GUESTS !== '1') {
    throw new MmoStoreError('GUEST_NOT_ALLOWED', 'Persistent worlds require a registered account');
  }
  const worldId = await betaWorldId();
  let player = await mmoOne<{ player_id: string; display_name: string }>(
    'select player_id, display_name from player where account_id = $1', [identity.accountId]);
  if (!player) {
    const created = await createPlayer({ accountId: identity.accountId, displayName: identity.displayName });
    player = { player_id: created.player_id, display_name: created.display_name };
    // PW26: capture sign-up signals once, at durable-player creation.
    await recordSignupSignal({
      playerId: player.player_id, accountId: identity.accountId, kind: identity.kind,
      ipHash: identity.signup?.ipHash, userAgent: identity.signup?.userAgent,
    }).catch(() => undefined);
  }
  const { region, settled } = await ensureEntryRegion({
    worldId, playerId: player.player_id, displayName: player.display_name,
    rules: PERSISTENT_RULES_V1,
  });
  return { regionId: region.region_id, playerId: player.player_id, settled };
}
