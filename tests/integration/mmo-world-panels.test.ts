// PW19 integration tests: the read models behind the world panels — roster,
// region browser and live-transfer list — against REAL PostgreSQL. Requires
// MMO_TEST_DATABASE_URL.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMmoDatabase, mmoQuery, resetMmoDatabase } from '../../apps/service/src/mmo/db.js';
import {
  bumpObjectiveProgress, createRegion, createTransfer, ensureObjectives, listObjectives,
  liveTransfersForPlayer, regionsForPlayerWorld, worldIdForPlayer, worldPlayersForPlayer,
} from '../../apps/service/src/mmo/store.js';
import { mmoDb } from '../../apps/service/src/mmo/db.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PACKS } from '../../packages/fusion/src/index.js';
import { MMO_PROTOCOL } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('mmo world panels (roster, regions, transfers)', () => {
  let fx: FixtureWorld;
  let destId: string;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const pack = PACKS['td'];
    fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
    destId = randomUUID();
    const p0 = fx.players[0];
    await createRegion({
      regionId: destId, worldId: fx.worldId, label: 'dest-region',
      seed: { sim: {
        packId: pack.id, mapId: 'td-tiberium-gardens', seed: 42,
        players: [{ playerId: p0.playerId, name: p0.displayName, faction: pack.factions[0].id }],
      } },
      rulesetVersion: MMO_PROTOCOL, engineArtifactSha256: 'fixture-engine-sha',
    });
    // Fixture members join the world unsettled; settle p0 at home and p1 in
    // the destination so the panel read models see real settlement rows.
    await mmoQuery(
      `insert into settlement (settlement_id, player_id, world_id, region_id, faction, cell_x, cell_y)
       values ($1,$2,$3,$4,'td',10,10), ($5,$6,$3,$7,'td',10,10)`,
      [randomUUID(), fx.players[0].playerId, fx.worldId, fx.regionId,
       randomUUID(), fx.players[1].playerId, destId]);
  }, 60_000);

  afterAll(async () => { await closeMmoDatabase(); });

  it('lists the world roster with display names and settlement regions', async () => {
    const p0 = fx.players[0].playerId;
    const roster = await worldPlayersForPlayer(p0);
    expect(roster.length).toBe(2);
    const self = roster.find(p => p.player_id === p0)!;
    expect(self.display_name).toBe(fx.players[0].displayName);
    expect(self.region_id).toBe(fx.regionId);
    const other = roster.find(p => p.player_id !== p0)!;
    expect(other.region_id).toBe(destId);
  });

  it('lists world regions with settled flags and roster sizes', async () => {
    const p0 = fx.players[0].playerId;
    const regions = await regionsForPlayerWorld(p0);
    expect(regions.length).toBe(2);
    const home = regions.find(r => r.region_id === fx.regionId)!;
    expect(home.settled).toBe(true);
    expect(home.players).toBe(1);
    const dest = regions.find(r => r.region_id === destId)!;
    expect(dest.settled).toBe(false); // p1 settled there, not p0
    expect(dest.players).toBe(1);
  });

  it('resolves the player world id from settlement', async () => {
    expect(await worldIdForPlayer(fx.players[0].playerId)).toBe(fx.worldId);
  });

  it('lists only live transfers owned by the player', async () => {
    const p0 = fx.players[0].playerId;
    const entityId = randomUUID();
    const made = await createTransfer({
      entityId, sourceRegionId: fx.regionId, destRegionId: destId,
      payload: { ownerPid: p0, type: 'tank' },
    });
    const mine = await liveTransfersForPlayer(p0);
    expect(mine.map(t => t.transfer_id)).toContain(made.transfer_id);
    // A transfer owned by someone else must not appear.
    const theirs = await liveTransfersForPlayer(fx.players[1].playerId);
    expect(theirs.map(t => t.transfer_id)).not.toContain(made.transfer_id);
    // Completed transfers drop off the live list.
    const { transitionTransfer } = await import('../../apps/service/src/mmo/store.js');
    await transitionTransfer(made.transfer_id, 'SOURCE_RELEASED');
    await transitionTransfer(made.transfer_id, 'DESTINATION_ACCEPTED');
    await transitionTransfer(made.transfer_id, 'COMPLETED');
    const after = await liveTransfersForPlayer(p0);
    expect(after.map(t => t.transfer_id)).not.toContain(made.transfer_id);
  });

  it('objectives: deterministic generation, idempotent ensure, progress bump', async () => {
    const p0 = fx.players[0].playerId;
    const args = {
      worldId: fx.worldId, playerId: p0,
      dailyCount: 3, dailySeconds: 7200, weeklySeconds: 36000,
    };
    await ensureObjectives(mmoDb(), args);
    await ensureObjectives(mmoDb(), args); // idempotent — no duplicates
    const rows = await listObjectives(p0);
    expect(rows.length).toBe(4); // 3 daily + 1 weekly
    expect(rows.filter(r => r.period === 'daily').length).toBe(3);
    expect(rows.filter(r => r.period === 'weekly').length).toBe(1);
    expect(new Set(rows.map(r => r.kind)).size).toBe(4); // distinct kinds per period set... daily may share with weekly
    // Bump every kind; only current-period active rows move, capped at target.
    for (const kind of ['site_capture', 'barter_complete', 'transfer_unit', 'unpack_building'] as const) {
      await bumpObjectiveProgress(mmoDb(), { playerId: p0, kind });
      await bumpObjectiveProgress(mmoDb(), { playerId: p0, kind });
    }
    const after = await listObjectives(p0);
    for (const r of after.filter(r => r.status === 'active')) {
      expect(r.progress).toBe(r.target);
    }
    // A different player has their own independent set.
    const other = await listObjectives(fx.players[1].playerId);
    expect(other.length).toBe(0);
  });
});
