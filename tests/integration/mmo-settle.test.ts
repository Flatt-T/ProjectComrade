// PW11 integration tests: newcomer settlement end-to-end — REAL PostgreSQL,
// the REAL region runner and the REAL Fusion sim. Covers first settlement
// (durable row + journaled join + bound starter grant + NEWCOMER protection),
// duplicate/retry idempotency, spawn separation, entry-region resolution, and
// the durable protection evaluator's online-hour and absolute-lapse endings.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  createPlayer, createRegion, createWorld, getSettlement, playerConnected,
  type RegionRow,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { enterPersistentWorld } from '../../apps/service/src/mmo/entry.js';
import { PACKS } from '../../packages/fusion/src/index';
import {
  MMO_RULESET_ID, MMO_RULESET_VERSION, PERSISTENT_RULES_V1, parseProtectionRecord,
  type MmoCommandMessage, type MmoRulesProfile, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
// Short protection deadlines keep the evaluator testable in seconds; the rest
// of the profile stays at production values.
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

interface LivePlayer { slot: number; pid?: string; newcomerProtected: boolean; credits: number }
interface LiveEntity { id: number; owner: number; kind: string; bound: number; hp: number }
interface LiveGame {
  players: LivePlayer[];
  entities: Map<number, LiveEntity>;
  slotForPlayer?: (pid: string) => number | undefined;
}

async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await createWorld({
    worldId, rulesetId: MMO_RULESET_ID, rulesetVersion: MMO_RULESET_VERSION,
    packRevision: 'fixture-synthetic-1', engineArtifactSha256: 'fixture-engine-sha',
    capabilities: {}, decisions: {},
  });
  return worldId;
}

/** A frontier region with an EMPTY sim roster — the PW11 settle path fills it. */
async function makeFrontierRegion(worldId: string): Promise<RegionRow> {
  const pack = PACKS['td'];
  const regionId = randomUUID();
  await createRegion({
    regionId, worldId, label: `pw11-${regionId.slice(0, 8)}`,
    seed: {
      sim: {
        packId: pack.id, mapId: pack.maps[0].id, seed: 4242,
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
const settlementOf = (pid: string) => getSettlement(pid);
const protectionOf = async (pid: string) => {
  const s = await settlementOf(pid);
  return s?.protection ? parseProtectionRecord(s.protection) : null;
};

describeDb('mmo newcomer settlement (real PostgreSQL + real Fusion sim)', () => {
  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
  });
  afterAll(async () => { await closeMmoDatabase(); });

  it('settles a newcomer: durable row, journaled join, bound starter grant, NEWCOMER protection', async () => {
    const worldId = await makeWorld();
    const region = await makeFrontierRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const player = await createPlayer({ accountId: randomUUID(), displayName: 'Settler' });
      await playerConnected(player.player_id, Date.now());
      const res = await worldAction(ctx, player.player_id, {
        t: 'settle', regionId: region.region_id, faction: 'gdi', x: 5, y: 5,
      });
      expect(res.accepted).toBe(true);

      const settlement = await settlementOf(player.player_id);
      expect(settlement).toBeTruthy();
      expect(settlement!.region_id).toBe(region.region_id);
      expect(settlement!.faction).toBe('gdi');
      const prot = await protectionOf(player.player_id);
      expect(prot?.kind).toBe('NEWCOMER');
      expect(prot?.status).toBe('active');

      // The journaled join applied: durable pid owns a slot with bound starters.
      await waitFor(() => {
        const g = live(ctx);
        const p = g.players.find(pl => pl.pid === player.player_id);
        return !!p && p.newcomerProtected === true;
      });
      const g = live(ctx);
      const slot = g.players.findIndex(pl => pl.pid === player.player_id);
      const units = [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0);
      // MCV + harvester + 4 tanks + 2 lights + 8 infantry = 16 bound units.
      expect(units.length).toBe(16);
      expect(units.every(u => u.bound === 1)).toBe(true);
      const me = g.players[slot];
      expect(me.credits).toBe(PACKS['td'].startCredits.standard * PERSISTENT_RULES_V1.starterCreditsMultiplier);

      // Durable audit row for the grant.
      const op = await mmoOne<{ kind: string }>(
        `select kind from economy_operation where region_id = $1 and kind = 'NEWCOMER_SPAWN'`,
        [region.region_id]);
      expect(op?.kind).toBe('NEWCOMER_SPAWN');
    } finally {
      ctx.runner.stop();
    }
  });

  it('is idempotent: a retried settle never duplicates the settlement or the army', async () => {
    const worldId = await makeWorld();
    const region = await makeFrontierRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const player = await createPlayer({ accountId: randomUUID(), displayName: 'Retry' });
      const action: MmoWorldAction = { t: 'settle', regionId: region.region_id, faction: 'nod', x: 5, y: 5 };
      const first = await worldAction(ctx, player.player_id, action);
      expect(first.accepted).toBe(true);
      const second = await worldAction(ctx, player.player_id, action);
      expect(second.accepted).toBe(true);
      const rows = await mmoQuery('select settlement_id from settlement where player_id = $1', [player.player_id]);
      expect(rows.length).toBe(1);
      await waitFor(() => {
        const g = live(ctx);
        return g.players.filter(pl => pl.pid === player.player_id).length === 1;
      });
      const g = live(ctx);
      const slot = g.players.findIndex(pl => pl.pid === player.player_id);
      const units = [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.hp > 0);
      expect(units.length).toBe(16);
    } finally {
      ctx.runner.stop();
    }
  });

  it('separates the second newcomer from the first by the configured distance', async () => {
    const worldId = await makeWorld();
    const region = await makeFrontierRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const p1 = await createPlayer({ accountId: randomUUID(), displayName: 'First' });
      const p2 = await createPlayer({ accountId: randomUUID(), displayName: 'Second' });
      await worldAction(ctx, p1.player_id, { t: 'settle', regionId: region.region_id, faction: 'gdi', x: 10, y: 10 });
      await worldAction(ctx, p2.player_id, { t: 'settle', regionId: region.region_id, faction: 'nod', x: 10, y: 10 });
      const s1 = await settlementOf(p1.player_id);
      const s2 = await settlementOf(p2.player_id);
      expect(s1).toBeTruthy(); expect(s2).toBeTruthy();
      // Same preference cell: the second pick must land the full separation
      // band away — the 60×60 frontier map has room for it.
      const dist = Math.max(Math.abs(s1!.cell_x - s2!.cell_x), Math.abs(s1!.cell_y - s2!.cell_y));
      expect(dist).toBeGreaterThanOrEqual(PERSISTENT_RULES_V1.spawnSeparationCells);
    } finally {
      ctx.runner.stop();
    }
  });

  it('ends NEWCOMER protection at the online-hour threshold while the owner stays online', async () => {
    const worldId = await makeWorld();
    const region = await makeFrontierRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const player = await createPlayer({ accountId: randomUUID(), displayName: 'Online' });
      await playerConnected(player.player_id, Date.now());
      await worldAction(ctx, player.player_id, { t: 'settle', regionId: region.region_id, faction: 'gdi', x: 20, y: 20 });
      // Protection is active right after settle.
      expect((await protectionOf(player.player_id))?.status).toBe('active');
      // ~1.5 s of online time ends it (RULES.setupProtectionOnlineMs).
      await waitFor(async () => (await protectionOf(player.player_id))?.status === 'ended', 15_000);
      const g = live(ctx);
      const slot = g.players.findIndex(pl => pl.pid === player.player_id);
      await waitFor(() => g.players[slot]?.newcomerProtected === false, 5_000);
      expect(g.players[slot].newcomerProtected).toBe(false);
    } finally {
      ctx.runner.stop();
    }
  });

  it('lapses NEWCOMER protection at the absolute deadline even fully offline', async () => {
    const worldId = await makeWorld();
    const region = await makeFrontierRegion(worldId);
    const ctx = await startRunner(region);
    try {
      const player = await createPlayer({ accountId: randomUUID(), displayName: 'Absent' });
      // Never connected: online time can never accumulate; the 4 s lapse ends it.
      await worldAction(ctx, player.player_id, { t: 'settle', regionId: region.region_id, faction: 'nod', x: 30, y: 30 });
      expect((await protectionOf(player.player_id))?.status).toBe('active');
      await waitFor(async () => (await protectionOf(player.player_id))?.status === 'ended', 15_000);
    } finally {
      ctx.runner.stop();
    }
  });

  it('enterPersistentWorld returns the same frontier region and flips to settled', async () => {
    const identity = { accountId: randomUUID(), displayName: 'Walker', kind: 'account' as const };
    const first = await enterPersistentWorld(identity);
    expect(first.settled).toBe(false);
    expect(first.regionId).toBeTruthy();
    const second = await enterPersistentWorld(identity);
    expect(second.regionId).toBe(first.regionId);
    expect(second.settled).toBe(false); // still owes the settle action
    // Settle through the region runner, then entry reports settled.
    const region = (await mmoOne<RegionRow>('select * from region where region_id = $1', [first.regionId]))!;
    const ctx = await startRunner(region);
    try {
      await worldAction(ctx, first.playerId, { t: 'settle', regionId: first.regionId, faction: 'gdi', x: 1, y: 1 });
      const third = await enterPersistentWorld(identity);
      expect(third.regionId).toBe(first.regionId);
      expect(third.settled).toBe(true);
    } finally {
      ctx.runner.stop();
    }
  });
});
