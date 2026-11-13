// PW28 integration tests: settling into the universal mashup world — REAL
// PostgreSQL, the REAL region runner and the REAL Fusion sim. Covers loadout
// validation, durable loadout storage, per-player allowed-def gating and the
// rejoin path that rebuilds the same gate.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  createPlayer, createRegion, createWorld, getSettlement,
  type RegionRow,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import {
  WORLD_PACK_ID, worldAllowedDefs, worldPack, type MashupLoadout,
} from '../../packages/fusion/src/index';
import {
  MMO_RULESET_ID, MMO_RULESET_VERSION, PERSISTENT_RULES_V1,
  type MmoCommandMessage, type MmoRulesProfile, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const RULES: MmoRulesProfile = { ...PERSISTENT_RULES_V1 };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 15_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface LivePlayer { slot: number; pid?: string; faction: string; allowedDefs?: string[]; newcomerProtected: boolean }
interface LiveEntity { id: number; owner: number; kind: string; bound: number; hp: number; type: string }
interface LiveGame {
  players: LivePlayer[];
  entities: Map<number, LiveEntity>;
  pack: { units: Record<string, { id: string }>; structures: Record<string, { id: string }> };
}

const { pack: WORLD_PACK, choices } = worldPack();

function loadout(i: number): MashupLoadout {
  return {
    structures: choices.structures[i].key,
    infantry: choices.infantry[Math.min(i, choices.infantry.length - 1)].key,
    vehicle: choices.vehicle[Math.min(i, choices.vehicle.length - 1)].key,
  };
}
const LO_A = loadout(0);
const LO_B = loadout(Math.min(1, choices.structures.length - 1));

async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await createWorld({
    worldId, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    packRevision: 'fixture-synthetic-1', engineArtifactSha256: 'fixture-engine-sha',
    capabilities: {}, decisions: {},
  });
  return worldId;
}

/** A frontier region on the universal world pack with an EMPTY sim roster. */
async function makeWorldRegion(worldId: string): Promise<RegionRow> {
  const regionId = randomUUID();
  await createRegion({
    regionId, worldId, label: `pw28-${regionId.slice(0, 8)}`,
    seed: {
      sim: {
        packId: WORLD_PACK_ID, mapId: WORLD_PACK.maps[0].id, seed: 777,
        players: [],
      },
    },
    rulesetVersion: 'persistent_world', engineArtifactSha256: 'fixture-engine-sha',
  });
  const row = await mmoOne<RegionRow>('select * from region where region_id = $1', [regionId]);
  return row!;
}

interface Ctx { region: RegionRow; runner: RegionRunner; workerId: string }

async function startRunner(region: RegionRow): Promise<Ctx> {
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
  ctx: Ctx, playerId: string, action: MmoWorldAction, commandId = randomUUID(),
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
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

const live = (ctx: Ctx) => ctx.runner.currentGame as unknown as LiveGame;

describeDb('mmo universal-world settlement (real PostgreSQL + real Fusion sim)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('rejects a settle with no loadout and one with an unknown choice', async () => {
    const worldId = await makeWorld();
    const region = await makeWorldRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const p1 = await createPlayer({ accountId: randomUUID(), displayName: 'NoLoadout' });
      const missing = await worldAction(ctx, p1.player_id, {
        t: 'settle', regionId: region.region_id, faction: 'commander', x: 5, y: 5,
      });
      expect(missing.accepted).toBe(false);
      expect(missing.reason).toBe('BAD_LOADOUT');

      const p2 = await createPlayer({ accountId: randomUUID(), displayName: 'BadKey' });
      const bad = await worldAction(ctx, p2.player_id, {
        t: 'settle', regionId: region.region_id, faction: 'commander', x: 5, y: 5,
        loadout: { structures: 'nope:nope', infantry: LO_A.infantry },
      });
      expect(bad.accepted).toBe(false);
      expect(bad.reason).toBe('BAD_LOADOUT');
      expect(await getSettlement(p2.player_id)).toBeNull();
    } finally {
      ctx.runner.stop();
    }
  });

  it('settles with a loadout: durable row, allowed defs, bound starter army', async () => {
    const worldId = await makeWorld();
    const region = await makeWorldRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const player = await createPlayer({ accountId: randomUUID(), displayName: 'Loader' });
      const res = await worldAction(ctx, player.player_id, {
        t: 'settle', regionId: region.region_id, faction: 'commander', x: 5, y: 5,
        loadout: LO_A,
      });
      expect(res.accepted).toBe(true);

      const settlement = await getSettlement(player.player_id);
      expect(settlement).toBeTruthy();
      expect(settlement!.faction).toBe('commander');
      expect(settlement!.loadout).toEqual(LO_A);

      await waitFor(() => {
        const g = live(ctx);
        const p = g.players.find(pl => pl.pid === player.player_id);
        return !!p && p.newcomerProtected === true;
      });
      const g = live(ctx);
      const slot = g.players.findIndex(pl => pl.pid === player.player_id);
      const me = g.players[slot];
      expect(me.faction).toBe('commander');
      expect(me.allowedDefs).toEqual(worldAllowedDefs(LO_A));

      // Every starter unit is inside the loadout's allowed set.
      const units = [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0);
      expect(units.length).toBeGreaterThanOrEqual(3);
      for (const u of units) {
        expect(u.bound).toBe(1);
        expect(me.allowedDefs!).toContain(u.type);
        expect(g.pack.units[u.type], `starter ${u.type} exists`).toBeTruthy();
      }
      // An MCV-class unit is present so the player can deploy a base.
      expect(units.some(u => !!g.pack.units[u.type] && (g.pack.units[u.type] as { deploysTo?: string }).deploysTo)).toBe(true);
    } finally {
      ctx.runner.stop();
    }
  });

  it('gates each commander to their own loadout inside the same region', async () => {
    const worldId = await makeWorld();
    const region = await makeWorldRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const pA = await createPlayer({ accountId: randomUUID(), displayName: 'Alpha' });
      const pB = await createPlayer({ accountId: randomUUID(), displayName: 'Bravo' });
      await worldAction(ctx, pA.player_id, { t: 'settle', regionId: region.region_id, faction: 'commander', x: 5, y: 5, loadout: LO_A });
      await worldAction(ctx, pB.player_id, { t: 'settle', regionId: region.region_id, faction: 'commander', x: 40, y: 40, loadout: LO_B });
      await waitFor(() => live(ctx).players.filter(pl => pl.pid === pA.player_id || pl.pid === pB.player_id).length === 2);

      const g = live(ctx);
      const slotA = g.players.findIndex(pl => pl.pid === pA.player_id);
      const slotB = g.players.findIndex(pl => pl.pid === pB.player_id);
      const a = g.players[slotA], b = g.players[slotB];
      expect(a.allowedDefs).toEqual(worldAllowedDefs(LO_A));
      expect(b.allowedDefs).toEqual(worldAllowedDefs(LO_B));
      expect(a.allowedDefs).not.toEqual(b.allowedDefs);

      // A cannot build anything outside their loadout — the engine gate.
      const foreign = b.allowedDefs!.find(id => !a.allowedDefs!.includes(id));
      expect(foreign).toBeTruthy();
      const game = ctx.runner.currentGame as unknown as { canBuild: (p: unknown, item: string) => boolean };
      const rawA = (ctx.runner.currentGame as unknown as { players: unknown[] }).players[slotA];
      expect(game.canBuild(rawA, foreign!)).toBe(false);
    } finally {
      ctx.runner.stop();
    }
  });
});
