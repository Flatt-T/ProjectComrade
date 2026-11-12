// PW13 integration tests: allied barter — free-priced offers, atomic
// settlement, reservations, permission gates and mid-battle unit handover —
// against REAL PostgreSQL and the REAL region runner with the journaled world
// handler. Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import { releaseRegionLease } from '../../apps/service/src/mmo/store.js';
import { submitCommand, journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PERSISTENT_RULES_V1, mmoEntityId, type BarterOffer, type MmoCommandMessage, type MmoWorldAction } from '../../packages/contracts/src/index.js';

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
  // The runner journals sim commands continuously, so the fence tick races —
  // retry with a fresh tail read on FENCE_LOST.
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

/** A live, unbound, unreserved unit owned by `slot`, as a durable barter ref. */
function liveUnit(ctx: Ctx, slot: number): { simId: number; ref: string } {
  const e = [...ctx.runner.currentGame!.entities.values()]
    .find(e => e.kind === 'unit' && e.owner === slot && e.hp > 0 && !e.carriedBy && e.bound === 0);
  if (!e) throw new Error(`no live unit for slot ${slot}`);
  return { simId: e.id, ref: mmoEntityId(ctx.fx.regionId, e.id) };
}

const creditsOf = (ctx: Ctx, slot: number) => ctx.runner.currentGame!.players[slot].credits;

async function offerStatus(offerId: string): Promise<string | undefined> {
  const row = await mmoOne<{ status: string }>('select status from trade_offer where offer_id = $1', [offerId]);
  return row?.status;
}

describeDb('mmo barter (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 4, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
      log: (e, d) => { if (e === 'poll-error') console.log('POLLERR', String(d?.error).slice(0, 600)); },
    });
    await runner.start();
    const service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20 }, log: () => undefined });
    ctx = { fx, runner, service };

    // PW26 harvest gate: give every rostered player a harvested-credits record
    // far above the starter grant so barter is permitted (the gate itself is
    // exercised separately below).
    await waitFor(() => ctx.runner.currentGame!.players.length >= 4);
    for (const pl of ctx.runner.currentGame!.players) pl.stats.harvested = 1_000_000_000;

    // Alliance: p0 leads, p1 joins with trade+unitTransfer, p2 joins without
    // trade, p3 stays outside — one member per permission case.
    const p0 = fx.players[0].playerId, p1 = fx.players[1].playerId, p2 = fx.players[2].playerId;
    const created = await worldAction(ctx, p0, { t: 'allianceCreate', name: 'BarterGuild' });
    expect(created.accepted).toBe(true);
    const allianceId = created.allianceId as string;
    for (const member of [p1, p2]) {
      expect((await worldAction(ctx, p0, { t: 'allianceInvite', allianceId, playerId: member })).accepted).toBe(true);
      expect((await worldAction(ctx, member, { t: 'allianceJoin', allianceId })).accepted).toBe(true);
    }
    expect((await worldAction(ctx, p0, {
      t: 'allianceSetPermissions', playerId: p1,
      permissions: { station: false, reinforce: false, trade: true, unitTransfer: true },
    })).accepted).toBe(true);
  }, 60_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p = (i: number) => ctx.fx.players[i].playerId;

  it('rejects offers to non-allies and members without the trade grant', async () => {
    const toOutsider = offer(p(0), ctx.fx.regionId, p(3), [{ kind: 'credits', amount: 10 }], []);
    const r1 = await worldAction(ctx, p(0), { t: 'barterOffer', offer: toOutsider });
    expect(r1.accepted).toBe(false);
    expect(r1.reason).toBe('NOT_ALLIED');

    const toNoTrade = offer(p(0), ctx.fx.regionId, p(2), [{ kind: 'credits', amount: 10 }], []);
    const r2 = await worldAction(ctx, p(0), { t: 'barterOffer', offer: toNoTrade });
    expect(r2.accepted).toBe(false);
    expect(r2.reason).toBe('TRADE_NOT_GRANTED');
  }, IT_TIMEOUT);

  it('settles a credits barter atomically with a BARTER audit row', async () => {
    const before0 = creditsOf(ctx, 0), before1 = creditsOf(ctx, 1);
    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount: 500 }], [{ kind: 'credits', amount: 300 }]);
    const made = await worldAction(ctx, p(0), { t: 'barterOffer', offer: o });
    expect(made.accepted).toBe(true);
    expect(await offerStatus(o.offerId)).toBe('open');

    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);
    expect(accepted.settled).toBe(true);
    expect(await offerStatus(o.offerId)).toBe('settled');

    await waitFor(() => creditsOf(ctx, 0) === before0 - 200 && creditsOf(ctx, 1) === before1 + 200);

    const op = await mmoOne<{ kind: string }>(
      `select kind from economy_operation where operation_id = $1`, [accepted.operationId]);
    expect(op?.kind).toBe('BARTER');
    const ledger = await mmoQuery('select * from asset_ledger where operation_id = $1', [accepted.operationId]);
    expect(ledger.length).toBe(0); // credits-only: no entity assets moved
  }, IT_TIMEOUT);

  it('hands a unit over mid-battle preserving identity, hp and position', async () => {
    const u = liveUnit(ctx, 0);
    const e = ctx.runner.currentGame!.entities.get(u.simId)!;
    // Put the unit on a move order so state is non-trivial at handover.
    e.order = 'move'; e.hp = Math.floor(e.maxHp / 2);
    const hpBefore = e.hp, xBefore = e.x, yBefore = e.y;

    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], [{ kind: 'credits', amount: 50 }]);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);

    await waitFor(() => ctx.runner.currentGame!.entities.get(u.simId)?.owner === 1);
    const after = ctx.runner.currentGame!.entities.get(u.simId)!;
    expect(after.hp).toBe(hpBefore);
    expect(after.x).toBe(xBefore);
    expect(after.y).toBe(yBefore);

    // The durable audit distinguishes the barter ownership change.
    const ledger = await mmoQuery<{ kind: string; from_owner: string; to_owner: string; physical_state: string }>(
      `select kind, from_owner, to_owner, physical_state from asset_ledger
        where operation_id = $1 and entity_id = $2`, [accepted.operationId, u.ref]);
    expect(ledger.length).toBe(1);
    expect(ledger[0].kind).toBe('BARTER');
    expect(ledger[0].from_owner).toBe(p(0));
    expect(ledger[0].to_owner).toBe(p(1));
    expect(ledger[0].physical_state).toBe('deployed');

    // The former owner's orders lose authority: a move command for the old
    // slot no longer applies (own() filters by owner).
    const goalBefore = after.goal;
    const tail = await journalTail(ctx.fx.regionId);
    const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
    await submitCommand({
      playerId: p(0),
      rawMessage: {
        protocol: 'comrade.mmo.v1', type: 'command', commandId: randomUUID(),
        regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
        action: { t: 'move', entityIds: [u.ref], x: 10, y: 10 },
      } as MmoCommandMessage,
      fence, tick: tail ? BigInt(tail.tick) : 0n,
    });
    await sleep(100);
    expect(ctx.runner.currentGame!.entities.get(u.simId)!.goal).toBe(goalBefore);

    // And the new owner CAN command it.
    const tail2 = await journalTail(ctx.fx.regionId);
    await submitCommand({
      playerId: p(1),
      rawMessage: {
        protocol: 'comrade.mmo.v1', type: 'command', commandId: randomUUID(),
        regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
        action: { t: 'stop', entityIds: [u.ref] },
      } as MmoCommandMessage,
      fence, tick: tail2 ? BigInt(tail2.tick) : 0n,
    });
    await waitFor(() => ctx.runner.currentGame!.entities.get(u.simId)!.order === 'idle');
  }, IT_TIMEOUT);

  it('rejects a duplicate acceptance of a settled offer', async () => {
    const u = liveUnit(ctx, 0);
    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], []);
    await worldAction(ctx, p(0), { t: 'barterOffer', offer: o });
    const first = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(first.accepted).toBe(true);
    const second = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('OFFER_NOT_OPEN');
    expect(await offerStatus(o.offerId)).toBe('settled');
  }, IT_TIMEOUT);

  it('decline and cancel resolve without moving assets', async () => {
    const before0 = creditsOf(ctx, 0), before1 = creditsOf(ctx, 1);
    const declined = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount: 100 }], [{ kind: 'credits', amount: 100 }]);
    await worldAction(ctx, p(0), { t: 'barterOffer', offer: declined });
    const d = await worldAction(ctx, p(1), { t: 'barterDecline', offerId: declined.offerId });
    expect(d.accepted).toBe(true);
    expect(await offerStatus(declined.offerId)).toBe('declined');

    const cancelled = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount: 100 }], []);
    await worldAction(ctx, p(0), { t: 'barterOffer', offer: cancelled });
    const c = await worldAction(ctx, p(0), { t: 'barterCancel', offerId: cancelled.offerId });
    expect(c.accepted).toBe(true);
    expect(await offerStatus(cancelled.offerId)).toBe('cancelled');

    // Only the recipient may decline; only the offerer may cancel.
    const wrongDecline = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount: 10 }], []);
    await worldAction(ctx, p(0), { t: 'barterOffer', offer: wrongDecline });
    const wd = await worldAction(ctx, p(0), { t: 'barterDecline', offerId: wrongDecline.offerId });
    expect(wd.accepted).toBe(false);
    expect(wd.reason).toBe('NOT_RECIPIENT');
    await worldAction(ctx, p(0), { t: 'barterCancel', offerId: wrongDecline.offerId });

    expect(creditsOf(ctx, 0)).toBe(before0);
    expect(creditsOf(ctx, 1)).toBe(before1);
  }, IT_TIMEOUT);

  it('reserves a unit across concurrent open offers', async () => {
    const u = liveUnit(ctx, 0);
    const first = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], []);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: first })).accepted).toBe(true);
    const second = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], [{ kind: 'credits', amount: 5 }]);
    const r = await worldAction(ctx, p(0), { t: 'barterOffer', offer: second });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('UNIT_RESERVED');
    await worldAction(ctx, p(0), { t: 'barterCancel', offerId: first.offerId });
  }, IT_TIMEOUT);

  it('rejects settlement when a unit dies before acceptance', async () => {
    const u = liveUnit(ctx, 0);
    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], []);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    ctx.runner.currentGame!.entities.get(u.simId)!.hp = 0;
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(false);
    expect(accepted.reason).toBe('GIVE_UNIT_NOT_TRANSFERABLE');
    expect(await offerStatus(o.offerId)).toBe('open'); // offerer may still cancel
    await worldAction(ctx, p(0), { t: 'barterCancel', offerId: o.offerId });
  }, IT_TIMEOUT);

  it('rejects settlement when the offerer can no longer cover the credits', async () => {
    const amount = Math.max(100, Math.floor(creditsOf(ctx, 0) / 2));
    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount }], []);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    ctx.runner.currentGame!.players[0].credits = 10;
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(false);
    expect(accepted.reason).toBe('GIVE_INSUFFICIENT_CREDITS');
    await worldAction(ctx, p(0), { t: 'barterCancel', offerId: o.offerId });
    ctx.runner.currentGame!.players[0].credits = amount * 4;
  }, IT_TIMEOUT);

  it('moves only earned shield hours — never the free nightly grant', async () => {
    await mmoQuery(
      `insert into shield_balance (player_id, kind, seconds_remaining) values ($1,'earned',1000)
       on conflict (player_id, kind) do update set seconds_remaining = 1000`, [p(0)]);
    // Offering more than the earned balance is rejected outright.
    const tooMuch = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'shieldSeconds', amount: 5000 }], []);
    const r0 = await worldAction(ctx, p(0), { t: 'barterOffer', offer: tooMuch });
    expect(r0.accepted).toBe(false);
    expect(r0.reason).toBe('INSUFFICIENT_SHIELD');

    const o = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'shieldSeconds', amount: 400 }], [{ kind: 'credits', amount: 10 }]);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);

    const bal = async (pid: string, kind: string) => Number((await mmoOne<{ s: string }>(
      `select seconds_remaining::text as s from shield_balance where player_id = $1 and kind = $2`, [pid, kind]))?.s ?? 0);
    await waitFor(async () => (await bal(p(0), 'earned')) === 600 && (await bal(p(1), 'earned')) === 400);
    // The free nightly grant was never touched.
    expect(await bal(p(0), 'nightly')).toBe(0);
  }, IT_TIMEOUT);

  it('rejects bound units and enforces the harvest gate', async () => {
    const u = liveUnit(ctx, 0);
    const e = ctx.runner.currentGame!.entities.get(u.simId)!;
    e.bound = 1;
    const bound = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'unit', ref: u.ref, amount: 1 }], []);
    const rb = await worldAction(ctx, p(0), { t: 'barterOffer', offer: bound });
    expect(rb.accepted).toBe(false);
    expect(rb.reason).toBe('UNIT_NOT_TRANSFERABLE');
    e.bound = 0;

    // PW26: no sending assets/credits until the starter grant is harvested.
    const harvested = ctx.runner.currentGame!.players[0].stats.harvested;
    ctx.runner.currentGame!.players[0].stats.harvested = 0;
    const gated = offer(p(0), ctx.fx.regionId, p(1), [{ kind: 'credits', amount: 10 }], []);
    const rg = await worldAction(ctx, p(0), { t: 'barterOffer', offer: gated });
    expect(rg.accepted).toBe(false);
    expect(rg.reason).toBe('HARVEST_GATE');
    ctx.runner.currentGame!.players[0].stats.harvested = harvested;
  }, IT_TIMEOUT);

  it('settles a power-up exchange through the durable balance', async () => {
    const kind = randomUUID(); // power-up kinds are item ids; the balance key is the ref
    await mmoQuery(
      `insert into powerup_balance (player_id, kind, count) values ($1,$2,3)
       on conflict (player_id, kind) do update set count = 3`, [p(0), kind]);
    const o = offer(p(0), ctx.fx.regionId, p(1),
      [{ kind: 'powerUp', ref: kind, amount: 2 }], [{ kind: 'credits', amount: 25 }]);
    expect((await worldAction(ctx, p(0), { t: 'barterOffer', offer: o })).accepted).toBe(true);
    const accepted = await worldAction(ctx, p(1), { t: 'barterAccept', offerId: o.offerId });
    expect(accepted.accepted).toBe(true);
    const count = async (pid: string) => Number((await mmoOne<{ c: string }>(
      'select count::text as c from powerup_balance where player_id = $1 and kind = $2', [pid, kind]))?.c ?? 0);
    await waitFor(async () => (await count(p(0))) === 1 && (await count(p(1))) === 2);
  }, IT_TIMEOUT);
});
