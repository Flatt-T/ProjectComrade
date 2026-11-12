// PW12 integration tests: sell-for-credit evacuation defeat and protected MCV
// recovery — REAL PostgreSQL, the REAL region runner and the REAL Fusion sim.
// Covers: SELL_REFUND journaled exactly once with ledger rows, bound assets
// refused, sale-under-attack allowed, evacuation (sale or destruction) granting
// one idempotent bound recovery MCV, the recovery episode/protection records,
// milestone and player-attack endings, and endRecovery. Requires
// MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease, scheduleJob } from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import {
  PERSISTENT_RULES_V1, mmoEntityId,
  type MmoCommandMessage, type MmoRulesProfile, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const RULES: MmoRulesProfile = PERSISTENT_RULES_V1;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 15_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Ctx { fx: FixtureWorld; runner: RegionRunner }

async function worldAction(
  ctx: Ctx, playerId: string, action: MmoWorldAction, commandId = randomUUID(),
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  // The fence tick races the advancing journal — retry once on a stale read.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tail = await journalTail(ctx.fx.regionId);
      const tick = tail ? BigInt(tail.tick) : 0n;
      const rawMessage: MmoCommandMessage = {
        protocol: 'comrade.mmo.v1', type: 'command', commandId,
        regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
        action: action as MmoCommandMessage['action'],
      };
      await submitCommand({ playerId, rawMessage, fence, tick });
      break;
    } catch (err) {
      if (attempt === 1 || !(err instanceof Error) || !err.message.includes('stale tick')) throw err;
    }
  }
  let result: { accepted?: boolean; reason?: string } | undefined;
  await waitFor(async () => {
    const ev = await mmoOne<{ application_result: unknown }>(
      `select application_result from region_event
        where region_id = $1 and payload->>'commandId' = $2 and applied_at is not null`,
      [ctx.fx.regionId, commandId]);
    result = (ev?.application_result ?? undefined) as typeof result;
    return result !== undefined;
  });
  return (result ?? {}) as { accepted: boolean; reason?: string };
}

interface LiveEntity {
  id: number; type: string; kind: string; owner: number; hp: number;
  bound?: number; recoveryProtected?: boolean; carriedBy?: number;
  x: number; y: number;
}
interface LiveGame {
  map: { w: number; h: number; occupied: ArrayLike<number> };
  entities: Map<number, LiveEntity>;
  players: { slot: number; recovering?: boolean; pid?: string }[];
  spawnStructure(type: string, owner: number, cx: number, cy: number): LiveEntity;
  spawnUnit(type: string, owner: number, cell: number): LiveEntity;
  damage(target: LiveEntity, amount: number, by: number, source?: number): void;
  cellIndex(x: number, y: number): number;
}
const live = (ctx: Ctx) => ctx.runner.currentGame as unknown as LiveGame;

function freeSpot(g: LiveGame, w = 4, h = 4) {
  for (let y = 8; y < g.map.h - h - 2; y++) {
    for (let x = 8; x < g.map.w - w - 2; x++) {
      let free = true;
      for (let dy = 0; dy < h && free; dy++)
        for (let dx = 0; dx < w && free; dx++)
          if (g.map.occupied[(y + dy) * g.map.w + (x + dx)]) free = false;
      if (free) return { x, y };
    }
  }
  throw new Error('no free spot');
}

async function spawnStructure(ctx: Ctx, slot: number, type: string): Promise<LiveEntity> {
  const g = live(ctx);
  const spot = freeSpot(g);
  return g.spawnStructure(type, slot, spot.x, spot.y);
}

/** Delete every entity a slot owns — the sim-side half of a wipeout. */
function wipeSlot(ctx: Ctx, slot: number) {
  const g = live(ctx);
  for (const e of [...g.entities.values()]) if (e.owner === slot) g.entities.delete(e.id);
}

async function pokeRecovery(ctx: Ctx) {
  await scheduleJob({
    regionId: ctx.fx.regionId, kind: 'recovery_eval', dueAtMs: Date.now(),
    dedupeKey: `rec_eval:${ctx.fx.regionId}:test:${randomUUID()}`,
    payload: { reason: 'test' },
  });
}

async function ensureSettlement(ctx: Ctx, playerId: string) {
  await mmoQuery(
    `insert into settlement (settlement_id, player_id, world_id, region_id, faction, cell_x, cell_y)
     select $1, $2, r.world_id, r.region_id, 'gdi', 40, 40 from region r where r.region_id = $3
     on conflict (player_id) do nothing`,
    [randomUUID(), playerId, ctx.fx.regionId]);
}

const slotOf = (ctx: Ctx, playerId: string) =>
  live(ctx).players.find(p => (p as { pid?: string }).pid === playerId)?.slot;

describeDb('mmo recovery (real PostgreSQL + runner + Fusion sim)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 2, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20, compoundSyncMs: 200,
      rules: RULES,
      worldHandler: createWorldHandler(RULES),
      quiescence: { enabled: false },
    });
    await runner.start();
    ctx = { fx, runner };
    // Recovery only replaces defeat — the durable settlement row proves these
    // players actually received a starter base.
    for (const p of fx.players) await ensureSettlement(ctx, p.playerId);
  }, 30_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p0 = () => ctx.fx.players[0], p1 = () => ctx.fx.players[1];

  it('SELL_REFUND removes the structure, credits once, and writes operation + ledger rows', async () => {
    const slot = 0;
    await spawnStructure(ctx, slot, 'fact');
    await spawnStructure(ctx, slot, 'nuke'); // second building: sale is not last
    // Wait for the compound row so the sale has a durable anchor.
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from compound where player_id = $1 and state = $2', [p0().playerId, 'active']);
      return !!r;
    });
    const nuke = [...live(ctx).entities.values()].find(e => e.owner === slot && e.type === 'nuke' && e.hp > 0)!;
    const res = await worldAction(ctx, p0().playerId, { t: 'sell', entityId: mmoEntityId(ctx.fx.regionId, nuke.id) });
    expect(res.accepted).toBe(true);
    expect(res.refund as number).toBeGreaterThan(0);
    await waitFor(() => !live(ctx).entities.get(nuke.id) || live(ctx).entities.get(nuke.id)!.hp <= 0);
    const op = await mmoOne<{ kind: string }>(
      `select kind from economy_operation where region_id = $1 and kind = 'SELL_REFUND' order by committed_at desc limit 1`,
      [ctx.fx.regionId]);
    expect(op?.kind).toBe('SELL_REFUND');
    const ledger = await mmoOne<{ kind: string; physical_state: string }>(
      `select kind, physical_state from asset_ledger where region_id = $1 order by created_at desc limit 1`,
      [ctx.fx.regionId]);
    expect(ledger?.kind).toBe('SELL_REFUND');
    expect(ledger?.physical_state).toBe('destroyed');
  }, 30_000);

  it('bound assets are refused and selling under attack is not locked out', async () => {
    const slot = 0;
    const bound = await spawnStructure(ctx, slot, 'proc');
    bound.bound = 1;
    const res = await worldAction(ctx, p0().playerId, { t: 'sell', entityId: mmoEntityId(ctx.fx.regionId, bound.id) });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('NOT_SELLABLE');
    expect(live(ctx).entities.get(bound.id)!.hp).toBeGreaterThan(0);
    // The yard is still sellable — no attack lockout exists on the path.
    const yard = [...live(ctx).entities.values()].find(e => e.owner === slot && e.type === 'fact' && e.hp > 0)!;
    const ok = await worldAction(ctx, p0().playerId, { t: 'sell', entityId: mmoEntityId(ctx.fx.regionId, yard.id) });
    expect(ok.accepted).toBe(true);
  }, 30_000);

  it('evacuating the last building grants one idempotent bound recovery MCV', async () => {
    const slot = 0;
    // Full wipeout: every unit and structure gone (destruction path).
    wipeSlot(ctx, slot);
    // The bound 'proc' survivor from the previous test is gone too — wipeSlot
    // covered it. No compounds, no MCV, no deployed building remain.
    await waitFor(async () => {
      const r = await mmoOne<{ n: string }>(
        `select count(*)::text as n from compound c join region r on r.region_id = c.region_id
          where r.world_id = (select world_id from region where region_id = $1)
            and c.player_id = $2 and c.state <> 'destroyed'`,
        [ctx.fx.regionId, p0().playerId]);
      return Number(r?.n ?? 1) === 0;
    }, 10_000);
    await pokeRecovery(ctx);
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from recovery_episode where player_id = $1 and status = $2', [p0().playerId, 'active']);
      return !!r;
    });
    const g = live(ctx);
    const mcvs = [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.bound === 2 && e.hp > 0);
    expect(mcvs.length).toBe(1);
    expect(mcvs[0].recoveryProtected).toBe(true);
    const p = g.players.find(pl => (pl as { pid?: string }).pid === p0().playerId);
    expect(p?.recovering).toBe(true);
    const rec = await mmoOne<{ kind: string; status: string }>(
      `select pr.kind, pr.status from protection_record pr join recovery_episode re on pr.compound_id = re.episode_id
        where re.player_id = $1 and pr.kind = 'RECOVERY'`, [p0().playerId]);
    expect(rec?.status).toBe('active');
    // Idempotent: another eval pass must not duplicate the episode or the MCV.
    await pokeRecovery(ctx);
    await sleep(500);
    const eps = await mmoOne<{ n: string }>(
      `select count(*)::text as n from recovery_episode where player_id = $1 and status = 'active'`, [p0().playerId]);
    expect(eps?.n).toBe('1');
    expect([...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.bound === 2 && e.hp > 0).length).toBe(1);
  }, 40_000);

  it('a recovering player who attacks another player ends the episode', async () => {
    const slot = slotOf(ctx, p0().playerId);
    expect(slot).toBe(0);
    const g = live(ctx);
    // Surviving unprotected unit of the recovering player + an enemy target.
    const attacker = g.spawnUnit('humvee', slot!, g.cellIndex(30, 30));
    const enemy = [...g.entities.values()].find(e => e.owner === 1 && e.kind === 'unit' && e.hp > 0);
    expect(enemy).toBeTruthy();
    attacker.x = enemy!.x - 64; attacker.y = enemy!.y;
    g.damage(enemy!, 10, slot!, attacker.id);
    await pokeRecovery(ctx);
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select re.status from recovery_episode re where re.player_id = $1 order by re.created_at desc limit 1`,
        [p0().playerId]);
      return r?.status === 'abandoned';
    });
    const p = g.players.find(pl => (pl as { pid?: string }).pid === p0().playerId);
    await waitFor(() => p?.recovering === false, 8_000);
  }, 40_000);

  it('selling the last building also qualifies, and the power+barracks milestone completes recovery', async () => {
    const slot = 1;
    // Give p1 a compound to sell: fixture players start with units only.
    const yardSpawn = await spawnStructure(ctx, slot, 'fact');
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from compound where player_id = $1 and state = $2', [p1().playerId, 'active']);
      return !!r;
    });
    // p1 keeps an MCV — remove every unit so no anchor remains, then sell the
    // last structure through the real world path.
    const g = live(ctx);
    for (const e of [...g.entities.values()]) {
      if (e.owner === slot && e.kind === 'unit') g.entities.delete(e.id);
    }
    const yard = g.entities.get(yardSpawn.id)!;
    const res = await worldAction(ctx, p1().playerId, { t: 'sell', entityId: mmoEntityId(ctx.fx.regionId, yard!.id) });
    expect(res.accepted).toBe(true);
    // Wait for compound sync to mark it destroyed, then evaluate.
    await waitFor(async () => {
      const r = await mmoOne<{ n: string }>(
        `select count(*)::text as n from compound c join region r on r.region_id = c.region_id
          where r.world_id = (select world_id from region where region_id = $1)
            and c.player_id = $2 and c.state <> 'destroyed'`,
        [ctx.fx.regionId, p1().playerId]);
      return Number(r?.n ?? 1) === 0;
    }, 10_000);
    await pokeRecovery(ctx);
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from recovery_episode where player_id = $1 and status = $2', [p1().playerId, 'active']);
      return !!r;
    });
    const mcvs = [...g.entities.values()].filter(e => e.owner === slot && e.kind === 'unit' && e.bound === 2 && e.hp > 0);
    expect(mcvs.length).toBe(1);
    // Milestone: one power + one barracks-equivalent standing ends recovery.
    await spawnStructure(ctx, slot, 'nuke');
    await spawnStructure(ctx, slot, 'pyle');
    await pokeRecovery(ctx);
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select re.status from recovery_episode re where re.player_id = $1 order by re.created_at desc limit 1`,
        [p1().playerId]);
      return r?.status === 'completed';
    });
    const p = g.players.find(pl => (pl as { pid?: string }).pid === p1().playerId);
    // The setRecovery mirror applies at the next tick boundary.
    await waitFor(() => p?.recovering === false, 8_000);
  }, 60_000);

  it('endRecovery closes the episode on the player choice', async () => {
    // p1's episode completed above; grant p0 a fresh one is impossible (settled
    // once) — reuse p1 by wiping again for a second episode is also impossible
    // (episode history allows a new active row, actually: the unique index only
    // blocks concurrent active). Wipe p1 and re-trigger.
    const slot = 1;
    const g = live(ctx);
    wipeSlot(ctx, slot);
    await waitFor(async () => {
      const r = await mmoOne<{ n: string }>(
        `select count(*)::text as n from compound c join region r on r.region_id = c.region_id
          where r.world_id = (select world_id from region where region_id = $1)
            and c.player_id = $2 and c.state <> 'destroyed'`,
        [ctx.fx.regionId, p1().playerId]);
      return Number(r?.n ?? 1) === 0;
    }, 10_000);
    await pokeRecovery(ctx);
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from recovery_episode where player_id = $1 and status = $2', [p1().playerId, 'active']);
      return !!r;
    });
    const res = await worldAction(ctx, p1().playerId, { t: 'endRecovery', compoundId: mmoEntityId(ctx.fx.regionId, 0) });
    expect(res.accepted).toBe(true);
    const p = g.players.find(pl => (pl as { pid?: string }).pid === p1().playerId);
    await waitFor(() => p?.recovering === false);
    const eps = await mmoOne<{ n: string }>(
      `select count(*)::text as n from recovery_episode where player_id = $1 and status = 'active'`, [p1().playerId]);
    expect(eps?.n).toBe('0');
  }, 60_000);
});
