// PW10 integration tests: manual offline shields and the allied protection
// boundary — REAL PostgreSQL, the REAL region runner and the REAL Fusion sim.
// Covers the acceptance lines: explicit selection only (inventory alone never
// activates), offline-only activation with grace, login pause preserving unused
// time, authoritative expiry while absent, nightly-before-earned consumption,
// duplicate-command dedupe, ownership checks, and restart persistence.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, mmoTransaction, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  playerConnected, playerDisconnected, releaseRegionLease, shieldBalances,
  grantEarnedShieldSeconds,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler, pokeProtectionEval } from '../../apps/service/src/mmo/world.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import {
  PERSISTENT_RULES_V1, mmoEntityId,
  type MmoCommandMessage, type MmoRulesProfile, type MmoWorldAction,
} from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
// Short offline grace keeps the presence transitions testable in seconds.
const RULES: MmoRulesProfile = { ...PERSISTENT_RULES_V1, offlineAfterMs: 500 };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 10_000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

interface Ctx {
  fx: FixtureWorld;
  runner: RegionRunner;
}

async function worldAction(
  ctx: Ctx, playerId: string, action: MmoWorldAction, commandId = randomUUID(),
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  const tail = await journalTail(ctx.fx.regionId);
  const tick = tail ? BigInt(tail.tick) : 0n;
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  await submitCommand({ playerId, rawMessage, fence, tick });
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

/** Minimal structural view of the live sim the helpers need (avoids coupling
 *  the test to the engine's class identity across src/dist builds). */
interface LiveEntity { id: number; shielded?: boolean; hp: number }
interface LiveGame {
  map: { w: number; h: number; occupied: ArrayLike<number> };
  entities: { get(id: number): LiveEntity | undefined };
  spawnStructure(type: string, owner: number, cx: number, cy: number): LiveEntity;
  cellIndex(x: number, y: number): number;
}
const live = (ctx: Ctx) => ctx.runner.currentGame as unknown as LiveGame;

/** First free w×h cell area on the live map (structures only mark `occupied`). */
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

/** Spawn a construction yard for `slot` on the runner's live sim and wait for
 *  the durable compound row the runner's sync produces. */
async function makeCompound(ctx: Ctx, slot: number): Promise<{ compoundId: string; simId: number }> {
  const g = live(ctx);
  const spot = freeSpot(g);
  const yard = g.spawnStructure('fact', slot, spot.x, spot.y);
  const compoundId = mmoEntityId(ctx.fx.regionId, yard.id);
  await waitFor(async () => {
    const row = await mmoOne('select 1 as x from compound where compound_id = $1 and state = $2', [compoundId, 'active']);
    return !!row;
  }, 8000);
  return { compoundId, simId: yard.id };
}

function shielded(ctx: Ctx, simId: number): boolean {
  return live(ctx).entities.get(simId)?.shielded === true;
}

describeDb('mmo offline shields (real PostgreSQL + runner + Fusion sim)', () => {
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
  }, 30_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  // Presence is file-scoped state: a failed test must not leak an online
  // player into the next one. Backdate so the offline grace is already past.
  afterEach(async () => {
    const past = Date.now() - 60_000;
    await playerDisconnected(p0().playerId, past).catch(() => undefined);
    await playerDisconnected(p1().playerId, past).catch(() => undefined);
  });

  const p0 = () => ctx.fx.players[0], p1 = () => ctx.fx.players[1];

  it('selectShield arms explicitly; an absent owner activates it and expiry consumes nightly-first', async () => {
    const { compoundId, simId } = await makeCompound(ctx, 0);
    // Bring the owner online first: selection alone must only arm, never activate.
    await playerConnected(p0().playerId, Date.now());
    const sel = await worldAction(ctx, p0().playerId, { t: 'selectShield', compoundId, seconds: 10 });
    expect(sel.accepted).toBe(true);
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await sleep(300);
    expect(shielded(ctx, simId)).toBe(false);
    const rec = await mmoOne<{ status: string }>(
      `select status from protection_record where compound_id = $1 and kind = 'OFFLINE_EARNED'`, [compoundId]);
    expect(rec?.status).toBe('armed');

    // Go offline: grace is 500 ms in the test profile — poke at grace expiry.
    const offAt = Date.now();
    await playerDisconnected(p0().playerId, offAt);
    await pokeProtectionEval(ctx.fx.regionId, offAt + RULES.offlineAfterMs + 50);
    await waitFor(() => shielded(ctx, simId), 8000);
    const active = await mmoOne<{ status: string; started_at_ms: string }>(
      `select status, started_at_ms::text from protection_record where compound_id = $1`, [compoundId]);
    expect(active?.status).toBe('active');
    // startedAt backdates to the end of the grace window, not eval time.
    expect(Math.abs(Number(active!.started_at_ms) - (offAt + RULES.offlineAfterMs))).toBeLessThan(10_000);

    // Expiry is authoritative while the owner stays absent: the 10 s selection
    // ends ~10 s after activation and consumes 10 s of the nightly grant.
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select status from protection_record where compound_id = $1`, [compoundId]);
      return r?.status === 'ended';
    }, 20_000);
    await waitFor(() => !shielded(ctx, simId), 8000);
    const bal = await shieldBalances(p0().playerId);
    expect(bal.nightly.day).not.toBeNull();
    expect(Number(bal.nightly.seconds)).toBe(RULES.nightlyShieldSeconds - 10);
  }, 60_000);

  it('a returning owner pauses the shield and preserves unused time', async () => {
    const { compoundId, simId } = await makeCompound(ctx, 1);
    // p1 has no presence → offline → activates on the post-selection eval.
    const sel = await worldAction(ctx, p1().playerId, { t: 'selectShield', compoundId, seconds: 30 });
    expect(sel.accepted).toBe(true);
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await waitFor(() => shielded(ctx, simId), 8000);

    // Login mid-shield: the boundary drops, unused seconds stay armed. Let the
    // shield run >1 s first — paused seconds round up via ceil, so a sub-second
    // pause would still report the full 30 s armed.
    await sleep(1500);
    await playerConnected(p1().playerId, Date.now());
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await waitFor(async () => {
      const r = await mmoOne<{ status: string; armed_seconds: string }>(
        `select status, armed_seconds::text from protection_record where compound_id = $1`, [compoundId]);
      return r?.status === 'armed' && Number(r.armed_seconds) > 0 && Number(r.armed_seconds) < 30;
    }, 8000);
    await waitFor(() => !shielded(ctx, simId), 8000);

    // A running shield cannot be disarmed — only an armed selection can.
    // (p1 is online now so the record is armed; re-offline it would be active.)
    const clear = await worldAction(ctx, p1().playerId, { t: 'clearShield', compoundId });
    expect(clear.accepted).toBe(true);
    const rec = await mmoOne<{ status: string; armed_seconds: string }>(
      `select status, armed_seconds::text from protection_record where compound_id = $1`, [compoundId]);
    expect(rec?.status).toBe('ended');
    // Paused consumption: the seconds the shield actually ran came off nightly.
    const bal = await shieldBalances(p1().playerId);
    expect(Number(bal.nightly.seconds)).toBeLessThan(RULES.nightlyShieldSeconds);
    expect(Number(bal.nightly.seconds)).toBeGreaterThan(RULES.nightlyShieldSeconds - 30);
    await playerDisconnected(p1().playerId, Date.now());
  }, 60_000);

  it('rejects foreign compounds, overdrafts and dedupes repeat commands', async () => {
    const { compoundId } = await makeCompound(ctx, 0);
    // p1 cannot shield p0's compound.
    const foreign = await worldAction(ctx, p1().playerId, { t: 'selectShield', compoundId, seconds: 60 });
    expect(foreign.accepted).toBe(false);
    expect(foreign.reason).toBe('NO_COMPOUND');

    // 9 h exceeds the 8 h nightly grant with no earned balance left for p0.
    const over = await worldAction(ctx, p0().playerId, { t: 'selectShield', compoundId, seconds: 9 * 3600 });
    expect(over.accepted).toBe(false);
    expect(over.reason).toBe('INSUFFICIENT_SHIELD');

    // A valid selection committed twice under one command id applies once:
    // one record, armed total 60 s — re-arming replaces, never stacks.
    const commandId = randomUUID();
    const first = await worldAction(ctx, p0().playerId, { t: 'selectShield', compoundId, seconds: 60 }, commandId);
    expect(first.accepted).toBe(true);
    const dup = await worldAction(ctx, p0().playerId, { t: 'selectShield', compoundId, seconds: 60 }, commandId);
    expect(dup.accepted).toBe(true);
    const recs = await mmoOne<{ n: string }>(
      `select count(*)::text as n from protection_record where compound_id = $1`, [compoundId]);
    expect(recs?.n).toBe('1');
    const rec = await mmoOne<{ armed_seconds: string }>(
      `select armed_seconds::text from protection_record where compound_id = $1`, [compoundId]);
    expect(Number(rec?.armed_seconds)).toBe(60);
    // p0 is offline → the selection activates; clearShield correctly refuses
    // to disarm a running shield.
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select status from protection_record where compound_id = $1`, [compoundId]);
      return r?.status === 'active';
    }, 8000);
    const running = await worldAction(ctx, p0().playerId, { t: 'clearShield', compoundId });
    expect(running.accepted).toBe(false);
    expect(running.reason).toBe('SHIELD_ACTIVE');
  }, 60_000);

  it('earned shields stack without a cap and are consumed after nightly hours', async () => {
    const { compoundId, simId } = await makeCompound(ctx, 1);
    // Stock earned hours directly (crate/objective grants land in PW25; the
    // balance accounting is what PW10 owns).
    await mmoTransaction(async tx => {
      for (let i = 0; i < 3; i++) {
        await grantEarnedShieldSeconds(tx, {
          playerId: p1().playerId, seconds: 4 * 3600,
          effectKey: `test-grant-${i}-${randomUUID()}`,
          dailyCapSeconds: RULES.earnedShieldDailyCapSeconds, nowMs: Date.now(),
        });
      }
    });
    const bal = await shieldBalances(p1().playerId);
    expect(bal.earned.seconds).toBe(12n * 3600n);

    // Drain most of the nightly grant so consumption must dip into earned.
    await mmoTransaction(async tx => {
      await tx.query(
        `insert into shield_balance (player_id, kind, seconds_remaining, nightly_day)
         values ($1,'nightly',100,$2)
         on conflict (player_id, kind) do update set seconds_remaining = 100, nightly_day = $2`,
        [p1().playerId, new Date().toISOString().slice(0, 10)]);
    });

    // 10-minute selection: 100 s nightly + 500 s earned.
    const sel = await worldAction(ctx, p1().playerId, { t: 'selectShield', compoundId, seconds: 600 });
    expect(sel.accepted).toBe(true);
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await sleep(1500);
    await waitFor(() => shielded(ctx, simId), 8000);
    // Fast-forward the active interval: backdate start/end so the full 600 s
    // counts as elapsed. The eval's consumption path is identical — only the
    // wall-clock wait is skipped.
    const nowMs = Date.now();
    await mmoQuery(
      `update protection_record set started_at_ms = $2, ends_at_ms = $3
        where compound_id = $1 and status = 'active'`,
      [compoundId, nowMs - 605_000, nowMs - 5_000]);
    await pokeProtectionEval(ctx.fx.regionId, nowMs);
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select status from protection_record where compound_id = $1`, [compoundId]);
      return r?.status === 'ended';
    }, 20_000);
    const after = await shieldBalances(p1().playerId);
    // Nightly went to zero; earned gave up exactly 500 s (600 - 100).
    expect(Number(after.nightly.seconds)).toBe(0);
    expect(after.earned.seconds).toBe(12n * 3600n - 500n);
    expect(after.earned.todaySeconds).toBe(12n * 3600n); // the cap counts income, not spends
  }, 60_000);

  it('shield state survives a runner restart via snapshot + durable records', async () => {
    const { compoundId, simId } = await makeCompound(ctx, 0);
    const sel = await worldAction(ctx, p0().playerId, { t: 'selectShield', compoundId, seconds: 20 });
    expect(sel.accepted).toBe(true);
    await pokeProtectionEval(ctx.fx.regionId, Date.now());
    await waitFor(() => shielded(ctx, simId), 8000);

    // Restart: checkpoint on stop, restore on start — the boundary must return.
    await ctx.runner.stop();
    const runner2 = new RegionRunner({
      regionId: ctx.fx.regionId, workerId: ctx.fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20, compoundSyncMs: 200,
      rules: RULES, worldHandler: createWorldHandler(RULES),
      quiescence: { enabled: false },
    });
    await runner2.start();
    ctx.runner = runner2;
    await waitFor(() => shielded(ctx, simId), 8000);
    const rec = await mmoOne<{ status: string }>(
      `select status from protection_record where compound_id = $1`, [compoundId]);
    expect(rec?.status).toBe('active');
    // And it still expires on schedule after the restart — the chain job is
    // durable and the record carries absolute ends_at.
    await waitFor(async () => {
      const r = await mmoOne<{ status: string }>(
        `select status from protection_record where compound_id = $1`, [compoundId]);
      return r?.status === 'ended';
    }, 40_000);
    await waitFor(() => !shielded(ctx, simId), 8000);
  }, 90_000);
});
