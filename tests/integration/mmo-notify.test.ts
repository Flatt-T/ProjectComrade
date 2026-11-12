// PW25 integration tests: opt-in rate-limited notifications and the away
// report — REAL PostgreSQL, the REAL region runner and the REAL Fusion sim.
// Covers: compound-under-attack dedupe, shield-ending warning, storage-full,
// superweapon-nearby, per-channel opt-in gating at dispatch, unsubscribe
// stopping every channel, and the away report matching durable state.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, mmoQuery, mmoTransaction, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  playerConnected, playerDisconnected, releaseRegionLease, scheduleJob,
} from '../../apps/service/src/mmo/store.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import {
  PERSISTENT_RULES_V1, mmoEntityId,
  type MmoRulesProfile,
} from '../../packages/contracts/src/index.js';
import {
  awayReportFor, dispatchDueNotifications, listNotifications,
  markNotificationsRead, notificationPrefs, raiseNotification, setNotificationPref,
  type NotificationRow, type NotificationSenders,
} from '../../apps/service/src/mmo/notify.js';

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

interface LiveEntity {
  id: number; type: string; kind: string; owner: number; hp: number;
  battleAt: number; x: number; y: number;
}
interface LivePlayer { slot: number; pid?: string; credits: number; storage: number }
interface LiveGame {
  map: { w: number; h: number; occupied: ArrayLike<number> };
  entities: Map<number, LiveEntity>;
  players: LivePlayer[];
  strikes: { tick: number; x: number; y: number; owner: number; damage: number; radius: number; kind: string; name: string }[];
  tick: number;
  spawnStructure(type: string, owner: number, cx: number, cy: number): LiveEntity;
  cellIndex(x: number, y: number): number;
  damage(target: LiveEntity, amount: number, by: number, source?: number): void;
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

async function spawnYard(ctx: Ctx, slot: number) {
  const g = live(ctx);
  const spot = freeSpot(g);
  return g.spawnStructure('fact', slot, spot.x, spot.y);
}

async function pokeNotify(ctx: Ctx) {
  await scheduleJob({
    regionId: ctx.fx.regionId, kind: 'notify_eval', dueAtMs: Date.now(),
    dedupeKey: `notify_eval:${ctx.fx.regionId}:test:${randomUUID()}`,
    payload: { reason: 'test' },
  });
}

async function notificationsFor(playerId: string): Promise<NotificationRow[]> {
  return mmoQuery<NotificationRow>(
    'select * from notification where player_id = $1 order by created_at', [playerId]);
}

/** Make every pending notification due now so the dispatcher can claim it. */
async function makeDue(playerId: string) {
  await mmoQuery(
    `update notification set deliver_after = clock_timestamp() - interval '1 second'
      where player_id = $1 and delivered_at is null`, [playerId]);
}

describeDb('mmo notifications + away report (real PostgreSQL + runner + Fusion sim)', () => {
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
      log: (event, data) => { if (event === 'job-error' || event === 'poll-error') console.log('[runner]', event, data); },
    });
    await runner.start();
    ctx = { fx, runner };
  }, 30_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p0 = () => ctx.fx.players[0], p1 = () => ctx.fx.players[1];

  it('compound under attack raises one deduped notification per window', async () => {
    const slot = 0;
    const yard = await spawnYard(ctx, slot);
    // Wait for compound sync so the durable roster knows the yard.
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from compound where compound_id = $1',
        [mmoEntityId(ctx.fx.regionId, yard.id)]);
      return !!r;
    });
    const g = live(ctx);
    // Simulate incoming fire: damage() stamps battleAt on the entity.
    g.damage(yard, 50, 1);
    await pokeNotify(ctx);
    await waitFor(async () =>
      (await notificationsFor(p0().playerId))
        .some(n => n.kind === 'compound_under_attack'));
    // Repeated damage inside the same window must not spam.
    g.damage(yard, 50, 1);
    await pokeNotify(ctx);
    await sleep(400);
    const rows = (await notificationsFor(p0().playerId))
      .filter(n => n.kind === 'compound_under_attack');
    expect(rows.length).toBe(1);
    // deliver_after honours the configured delay.
    expect(new Date(rows[0].deliver_after).getTime()).toBeGreaterThan(Date.now() + 30_000);
  }, 30_000);

  it('active shield inside the warning window raises shield_ending once', async () => {
    const yard = await spawnYard(ctx, 1);
    const compoundId = mmoEntityId(ctx.fx.regionId, yard.id);
    await waitFor(async () => {
      const r = await mmoOne('select 1 as x from compound where compound_id = $1', [compoundId]);
      return !!r;
    });
    const endsAt = Date.now() + 10 * 60_000;
    await mmoQuery(
      `insert into protection_record
         (compound_id, player_id, kind, status, generation, armed_seconds, online_ms,
          online_since_ms, lapse_at_ms, started_at_ms, ends_at_ms, milestone_power, milestone_barracks, armed_at_ms)
       values ($1,$2,'OFFLINE_EARNED','active',1,3600,0,null,null,$3,$4,0,0,$3)
       on conflict (compound_id, kind) do update set status='active', ends_at_ms=$4`,
      [compoundId, p1().playerId, Date.now() - 60_000, endsAt]);
    await pokeNotify(ctx);
    await waitFor(async () =>
      (await notificationsFor(p1().playerId))
        .some(n => n.kind === 'shield_ending'));
    await pokeNotify(ctx);
    await sleep(400);
    const rows = (await notificationsFor(p1().playerId)).filter(n => n.kind === 'shield_ending');
    expect(rows.length).toBe(1);
  }, 30_000);

  it('storage at cap raises storage_full; a superweapon strike near base raises superweapon_nearby', async () => {
    const g = live(ctx);
    const p = g.players[0];
    p.storage = 100;
    p.credits = 100;
    await pokeNotify(ctx);
    await waitFor(async () =>
      (await notificationsFor(p0().playerId))
        .some(n => n.kind === 'storage_full'));

    // A strike owned by slot 1 on top of slot 0's yard notifies the defender
    // once per rate-limit window even though storms fan out into many strikes.
    const yard = [...g.entities.values()].find(e => e.owner === 0 && e.kind === 'structure')!;
    const bolts = [0, 1, 2].map(i => ({
      tick: g.tick + 100 + i, x: yard.x + i * 8, y: yard.y, owner: 1,
      damage: 0, radius: 40, kind: 'bolt' as const, name: 'Test Storm',
    }));
    g.strikes.push(...bolts);
    await pokeNotify(ctx);
    await waitFor(async () =>
      (await notificationsFor(p0().playerId))
        .some(n => n.kind === 'superweapon_nearby'));
    const supers = (await notificationsFor(p0().playerId))
      .filter(n => n.kind === 'superweapon_nearby');
    expect(supers.length).toBe(1);
    g.strikes.length = 0;
    p.storage = 0; p.credits = 0;
  }, 30_000);

  it('dispatch honours opt-in per channel; unsubscribing stops every channel', async () => {
    const playerId = p0().playerId;
    await makeDue(playerId);
    const calls: { channel: string; kind: string }[] = [];
    const senders: NotificationSenders = {
      inapp: async (_pid, n) => { calls.push({ channel: 'inapp', kind: n.kind }); return { status: 'sent' }; },
      email: async (_pid, n) => { calls.push({ channel: 'email', kind: n.kind }); return { status: 'sent' }; },
      push: async (_pid, n) => { calls.push({ channel: 'push', kind: n.kind }); return { status: 'sent' }; },
    };
    // Default: nothing opted in — dispatch marks delivered with zero sends.
    await dispatchDueNotifications(senders);
    expect(calls.length).toBe(0);
    const deliveries = await mmoQuery<{ channel: string }>(
      `select d.channel from notification_delivery d join notification n on n.notification_id = d.notification_id
        where n.player_id = $1`, [playerId]);
    expect(deliveries.length).toBe(0);

    // Opt in to inapp only: exactly the inapp channel fires.
    await setNotificationPref(playerId, 'inapp', true);
    await mmoQuery(
      `update notification set delivered_at = null, deliver_after = clock_timestamp() - interval '1 second'
        where player_id = $1`, [playerId]);
    calls.length = 0;
    await dispatchDueNotifications(senders);
    expect(calls.every(c => c.channel === 'inapp')).toBe(true);
    expect(calls.length).toBeGreaterThan(0);

    // Opt out again: a fresh notification sends nothing.
    await setNotificationPref(playerId, 'inapp', false);
    await mmoTransaction(tx => raiseNotification(tx, {
      playerId, kind: 'system', dedupeKey: `sys:${randomUUID()}`,
      deliverAfter: new Date(Date.now() - 1_000),
    }));
    const fresh = (await notificationsFor(playerId))
      .filter(n => n.kind === 'system').at(-1)!;
    expect(fresh).toBeTruthy();
    calls.length = 0;
    await dispatchDueNotifications(senders);
    const freshDeliveries = await mmoQuery<{ channel: string }>(
      `select channel from notification_delivery where notification_id = $1`, [fresh.notification_id]);
    expect(freshDeliveries.length).toBe(0);
    expect(calls.length).toBe(0);
  }, 30_000);

  it('prefs default off and markNotificationsRead works', async () => {
    const playerId = p1().playerId;
    const prefs = await notificationPrefs(playerId);
    expect(prefs).toEqual({ inapp: false, email: false, push: false });
    const list = await listNotifications(playerId);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(n => n.readAt === null)).toBe(true);
    const marked = await markNotificationsRead(playerId);
    expect(marked).toBe(list.length);
    expect((await listNotifications(playerId)).every(n => n.readAt !== null)).toBe(true);
  }, 30_000);

  it('away report covers the offline window and matches durable notifications', async () => {
    const playerId = p0().playerId;
    const before = await awayReportFor(playerId);
    expect(before.entries.length).toBe(0); // never disconnected in this suite yet

    const wentOffline = Date.now();
    await playerConnected(playerId, wentOffline - 60_000);
    await playerDisconnected(playerId, wentOffline);
    // Raise one notification "while offline" — after the disconnect timestamp.
    await mmoQuery(
      `insert into notification (notification_id, player_id, kind, dedupe_key, deliver_after, created_at)
       values ($1,$2,'compound_under_attack','away-test', clock_timestamp(), clock_timestamp())
       on conflict (player_id, dedupe_key) do nothing`,
      [randomUUID(), playerId]);

    const report = await awayReportFor(playerId);
    expect(report.since).not.toBeNull();
    const kinds = report.entries.map(e => e.kind);
    expect(kinds).toContain('notification:compound_under_attack');
    // Entries are ordered and every notification entry links back to its row.
    const notifEntries = report.entries.filter(e => e.notificationId !== null);
    expect(notifEntries.length).toBeGreaterThan(0);
    const times = report.entries.map(e => e.at);
    expect([...times].sort()).toEqual(times);
  }, 30_000);
});
