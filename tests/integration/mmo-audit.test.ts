// PW26 integration tests: trade audit report + sign-up signals against REAL
// PostgreSQL and the REAL region runner. Requires MMO_TEST_DATABASE_URL
// (disposable database).
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import {
  bartersForAccount, recordSignupSignal, signupSignalsForAccount,
  signupSignalsSharingIp, tradeAuditReport,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PERSISTENT_RULES_V1, type BarterOffer, type MmoCommandMessage, type MmoWorldAction } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
const IT_TIMEOUT = 30_000;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 15000, stepMs = 25): Promise<void> {
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
  service: RegionService;
}

async function worldAction(
  ctx: Ctx, playerId: string, action: MmoWorldAction,
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  const commandId = randomUUID();
  const rawMessage: MmoCommandMessage = {
    protocol: 'comrade.mmo.v1', type: 'command', commandId,
    regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
    action: action as MmoCommandMessage['action'],
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const tail = await journalTail(ctx.fx.regionId);
    try {
      await submitCommand({ playerId, rawMessage, fence, tick: tail ? BigInt(tail.tick) : 0n });
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await sleep(20);
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

function offer(playerId: string, regionId: string, toId: string, give: BarterOffer['give'], want: BarterOffer['want']): BarterOffer {
  return {
    offerId: randomUUID(), regionId, fromId: playerId, toId, give, want,
    createdAtMs: Date.now(), expiresAtMs: Date.now() + 30 * 60 * 1000,
  };
}

const creditsOf = (ctx: Ctx, slot: number) => ctx.runner.currentGame!.players[slot].credits;

/** Settle a credits-only barter from slot a to slot b through the journaled path. */
async function settleCreditsBarter(ctx: Ctx, a: number, b: number, amount: number): Promise<string> {
  const pa = ctx.fx.players[a].playerId, pb = ctx.fx.players[b].playerId;
  const o = offer(pa, ctx.fx.regionId, pb, [{ kind: 'credits', amount }], []);
  const made = await worldAction(ctx, pa, { t: 'barterOffer', offer: o });
  expect(made.accepted).toBe(true);
  const accepted = await worldAction(ctx, pb, { t: 'barterAccept', offerId: o.offerId });
  expect(accepted.accepted).toBe(true);
  return o.offerId;
}

describeDb('mmo trade audit + signup signals (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 3, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: () => undefined,
    });
    await runner.start();
    const service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20 }, log: () => undefined });
    ctx = { fx, runner, service };

    await waitFor(() => ctx.runner.currentGame!.players.length >= 3);
    for (const pl of ctx.runner.currentGame!.players) pl.stats.harvested = 1_000_000_000;

    // Alliance so barters are permitted: p0 leads, p1 and p2 join with trade.
    const p0 = fx.players[0].playerId;
    const created = await worldAction(ctx, p0, { t: 'allianceCreate', name: 'AuditGuild' });
    expect(created.accepted).toBe(true);
    const allianceId = created.allianceId as string;
    for (const member of [fx.players[1].playerId, fx.players[2].playerId]) {
      expect((await worldAction(ctx, p0, { t: 'allianceInvite', allianceId, playerId: member })).accepted).toBe(true);
      expect((await worldAction(ctx, member, { t: 'allianceJoin', allianceId })).accepted).toBe(true);
    }
    for (const member of [fx.players[1].playerId, fx.players[2].playerId]) {
      expect((await worldAction(ctx, p0, {
        t: 'allianceSetPermissions', playerId: member,
        permissions: { station: false, reinforce: false, trade: true, unitTransfer: true },
      })).accepted).toBe(true);
    }
  }, 60_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  it('records sign-up signals once and finds duplicate accounts by ip hash', async () => {
    const [a, b] = ctx.fx.players;
    const ipHash = createHash('sha256').update('203.0.113.7').digest('hex');
    await recordSignupSignal({
      playerId: a.playerId, accountId: a.accountId, kind: 'account',
      ipHash, userAgent: 'AuditTest/1.0',
    });
    await recordSignupSignal({
      playerId: b.playerId, accountId: b.accountId, kind: 'account',
      ipHash, userAgent: 'AuditTest/1.0',
    });
    // First write wins — a second record for the same player must not overwrite.
    await recordSignupSignal({
      playerId: a.playerId, accountId: a.accountId, kind: 'account',
      ipHash: 'different', userAgent: 'Other/2.0',
    });

    const forA = await signupSignalsForAccount(a.accountId);
    expect(forA).toHaveLength(1);
    expect(forA[0].ip_hash).toBe(ipHash);
    expect(forA[0].user_agent).toBe('AuditTest/1.0');

    const sharing = await signupSignalsSharingIp(ipHash);
    expect(sharing.map(s => s.account_id).sort()).toEqual([a.accountId, b.accountId].sort());
  }, IT_TIMEOUT);

  it('makes every settled barter queryable by account', async () => {
    const amount = Math.min(1_000, creditsOf(ctx, 0));
    const offerId = await settleCreditsBarter(ctx, 0, 1, amount);

    const forFrom = await bartersForAccount(ctx.fx.worldId, ctx.fx.players[0].accountId);
    const forTo = await bartersForAccount(ctx.fx.worldId, ctx.fx.players[1].accountId);
    const foundFrom = forFrom.find(t => t.offer_id === offerId);
    const foundTo = forTo.find(t => t.offer_id === offerId);
    expect(foundFrom?.status).toBe('settled');
    expect(foundTo?.status).toBe('settled');
    expect(foundFrom?.from_account_id).toBe(ctx.fx.players[0].accountId);
    expect(foundTo?.to_account_id).toBe(ctx.fx.players[1].accountId);
    // The unrelated third account sees nothing.
    const forOther = await bartersForAccount(ctx.fx.worldId, ctx.fx.players[2].accountId);
    expect(forOther.find(t => t.offer_id === offerId)).toBeUndefined();
  }, IT_TIMEOUT);

  it('flags a scripted one-sided funnel between young accounts', async () => {
    // p1 sends its credits to p0 for nothing — the funnelling pattern.
    const amount = Math.min(1_000, creditsOf(ctx, 1));
    const offerId = await settleCreditsBarter(ctx, 1, 0, amount);

    const flags = await tradeAuditReport(ctx.fx.worldId, { minValue: 1, imbalanceRatio: 4 });
    const flag = flags.find(f => f.offer_id === offerId);
    expect(flag).toBeDefined();
    expect(flag!.both_young).toBe(true);
    expect(flag!.give_value).toBe(amount);
    expect(flag!.want_value).toBe(0);
    expect(flag!.imbalance).toBe(Infinity);
  }, IT_TIMEOUT);

  it('does not flag balanced trades or trades between older accounts', async () => {
    // Balanced trade: equal credits both ways stays under the imbalance ratio.
    const amount = Math.min(500, creditsOf(ctx, 2));
    const pa = ctx.fx.players[2].playerId, pb = ctx.fx.players[0].playerId;
    const o = offer(pa, ctx.fx.regionId, pb,
      [{ kind: 'credits', amount }], [{ kind: 'credits', amount }]);
    expect((await worldAction(ctx, pa, { t: 'barterOffer', offer: o })).accepted).toBe(true);
    expect((await worldAction(ctx, pb, { t: 'barterAccept', offerId: o.offerId })).accepted).toBe(true);

    let flags = await tradeAuditReport(ctx.fx.worldId, { minValue: 1, imbalanceRatio: 4 });
    expect(flags.find(f => f.offer_id === o.offerId)).toBeUndefined();

    // Age both accounts past the young window, then repeat the funnel — the
    // report must stop flagging (account age is the durable player row's age).
    await mmoQuery(
      `update player set created_at = clock_timestamp() - interval '60 days'
        where player_id = any($1::uuid[])`,
      [[ctx.fx.players[0].playerId, ctx.fx.players[1].playerId]]);
    const amount2 = Math.min(500, creditsOf(ctx, 2));
    const offerId2 = await settleCreditsBarter(ctx, 2, 0, amount2);

    flags = await tradeAuditReport(ctx.fx.worldId, { minValue: 1, imbalanceRatio: 4 });
    expect(flags.find(f => f.offer_id === offerId2)).toBeUndefined();
    // And the earlier young-account flag is gone too — age is evaluated live.
    expect(flags).toHaveLength(0);
  }, IT_TIMEOUT);
});
