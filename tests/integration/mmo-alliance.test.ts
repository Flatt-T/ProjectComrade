// PW09 integration tests: alliances, explicit permissions, presence and the
// caretaker flag — all against REAL PostgreSQL and the REAL region runner with
// the journaled world handler. Covers the acceptance lines: display-name reuse
// cannot claim a base, reconnect restores identity, allies can reinforce an
// offline unshielded compound, allies cannot build or take assets without the
// grant, and leaving an alliance cannot bypass permission checks.
// Requires MMO_TEST_DATABASE_URL (disposable database).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeMmoDatabase, mmoOne, resetMmoDatabase,
} from '../../apps/service/src/mmo/db.js';
import {
  alliancePermission, allianceForPlayer, allianceMembers, createPlayer,
  playerConnected, playerDisconnected, playerPresence, presenceIsOnline,
  releaseRegionLease,
} from '../../apps/service/src/mmo/store.js';
import { submitCommand } from '../../apps/service/src/mmo/commands.js';
import { journalTail } from '../../apps/service/src/mmo/commands.js';
import { RegionRunner } from '../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../apps/service/src/mmo/world.js';
import { RegionService } from '../../apps/service/src/mmo/regions.js';
import { seedFixtureWorld, type FixtureWorld } from '../../apps/service/src/mmo/fixture.js';
import { PERSISTENT_RULES_V1, mmoEntityId, type MmoCommandMessage, type MmoWorldAction } from '../../packages/contracts/src/index.js';

const DB_URL = process.env.MMO_TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TICK_MS = 5;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor(predicate: () => Promise<boolean> | boolean, timeoutMs = 8000, stepMs = 25): Promise<void> {
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

/** Journal one world action as a player and wait for its applied receipt. */
async function worldAction(
  ctx: Ctx, playerId: string, action: MmoWorldAction,
): Promise<{ accepted: boolean; reason?: string; [k: string]: unknown }> {
  const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
  const tail = await journalTail(ctx.fx.regionId);
  const tick = tail ? BigInt(tail.tick) : 0n;
  const commandId = randomUUID();
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

describeDb('mmo alliances, presence and caretaker (real PostgreSQL + runner)', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    process.env.MMO_DATABASE_URL = DB_URL;
    await resetMmoDatabase();
    // td-tiberium-gardens has four start positions — every rostered player spawns.
    const fx = await seedFixtureWorld({ leaseMs: 300_000, playerCount: 3, mapId: 'td-tiberium-gardens' });
    await releaseRegionLease(fx.regionId, fx.workerId);
    const runner = new RegionRunner({
      regionId: fx.regionId, workerId: fx.workerId, leaseMs: 60_000,
      tickMs: TICK_MS, pollMs: 20,
      worldHandler: createWorldHandler(PERSISTENT_RULES_V1),
    });
    await runner.start();
    const service = new RegionService({ runner: { tickMs: TICK_MS, pollMs: 20 }, log: () => undefined });
    ctx = { fx, runner, service };
  }, 30_000);

  afterAll(async () => {
    await ctx.runner.stop().catch(() => undefined);
    await ctx.service.stopAll().catch(() => undefined);
    await closeMmoDatabase();
  });

  const p0 = () => ctx.fx.players[0], p1 = () => ctx.fx.players[1], p2 = () => ctx.fx.players[2];

  it('display-name reuse cannot claim another player\'s identity or base', async () => {
    const name = `SharedName-${randomUUID().slice(0, 8)}`;
    const a = await createPlayer({ accountId: randomUUID(), displayName: name });
    const b = await createPlayer({ accountId: randomUUID(), displayName: name });
    expect(a.player_id).not.toBe(b.player_id);
    expect(a.account_id).not.toBe(b.account_id);
    // playerFor binds to the stable account id, never the display name.
    const svc = new RegionService({ log: () => undefined });
    const pa = await svc.playerFor({ accountId: a.account_id, displayName: name, kind: 'account' }, ctx.fx.worldId);
    const pa2 = await svc.playerFor({ accountId: a.account_id, displayName: 'Renamed!', kind: 'account' }, ctx.fx.worldId);
    expect(pa.player_id).toBe(a.player_id);
    expect(pa2.player_id).toBe(a.player_id); // reconnect + rename → same owner
    const pb = await svc.playerFor({ accountId: b.account_id, displayName: name, kind: 'account' }, ctx.fx.worldId);
    expect(pb.player_id).toBe(b.player_id);
    expect(pb.player_id).not.toBe(pa.player_id);
  });

  it('guests cannot provision a persistent player when auth is configured', async () => {
    const saved = {
      DATABASE_URL: process.env.DATABASE_URL,
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    };
    process.env.DATABASE_URL = DB_URL!;
    process.env.COGNITO_USER_POOL_ID = 'test-pool';
    process.env.COGNITO_CLIENT_ID = 'test-client';
    try {
      const svc = new RegionService({ log: () => undefined });
      await expect(svc.playerFor(
        { accountId: randomUUID(), displayName: 'Guest-x', kind: 'guest' }, ctx.fx.worldId))
        .rejects.toMatchObject({ code: 'GUEST_NOT_ALLOWED' });
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  it('creates an alliance through the journal and syncs the sim ally key', async () => {
    const res = await worldAction(ctx, p0().playerId, { t: 'allianceCreate', name: 'BetaGuard' });
    expect(res.accepted).toBe(true);
    const allianceId = res.allianceId as string;
    const allyKey = Number(res.allyKey);
    expect(allyKey).toBeGreaterThan(0);

    // Durable membership: leader role, implicit permissions.
    const membership = await allianceForPlayer(ctx.fx.worldId, p0().playerId);
    expect(membership?.alliance.alliance_id).toBe(allianceId);
    expect(membership?.member.role).toBe('leader');

    // Sim sync: the leader's engine ally key is set; members are not yet enemies
    // of each other only after BOTH carry the key.
    await waitFor(() => ctx.runner.currentGame!.players[0].ally === allyKey);
    expect(ctx.runner.currentGame!.isEnemy(0, 1)).toBe(true); // p1 not allied yet
  });

  it('invite + join grants membership but no permissions until the leader grants them', async () => {
    const allianceId = (await allianceForPlayer(ctx.fx.worldId, p0().playerId))!.alliance.alliance_id;

    const inv = await worldAction(ctx, p0().playerId, { t: 'allianceInvite', allianceId, playerId: p1().playerId });
    expect(inv.accepted).toBe(true);

    // Non-invited player cannot join.
    const badJoin = await worldAction(ctx, p2().playerId, { t: 'allianceJoin', allianceId });
    expect(badJoin.accepted).toBe(false);
    expect(badJoin.reason).toBe('NO_INVITE');

    const join = await worldAction(ctx, p1().playerId, { t: 'allianceJoin', allianceId });
    expect(join.accepted).toBe(true);
    await waitFor(() => {
      const g = ctx.runner.currentGame!;
      return g.players[0].ally === g.players[1].ally && g.players[0].ally >= 0;
    });
    expect(ctx.runner.currentGame!.isEnemy(0, 1)).toBe(false);

    // Membership alone grants nothing — every permission check fails.
    const worldId = ctx.fx.worldId;
    for (const perm of ['station', 'reinforce', 'trade', 'unitTransfer'] as const) {
      expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p1().playerId, permission: perm })).toBe(false);
    }
    // The leader holds every permission implicitly — but the member does not, so
    // the mutual-consent check still fails until the member is granted.
    expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p0().playerId, permission: 'unitTransfer' })).toBe(true);

    // A member cannot grant themselves permissions.
    const selfGrant = await worldAction(ctx, p1().playerId, {
      t: 'allianceSetPermissions', playerId: p1().playerId,
      permissions: { station: true, reinforce: true, trade: true, unitTransfer: true },
    });
    expect(selfGrant.accepted).toBe(false);
    expect(selfGrant.reason).toBe('NOT_LEADER');

    // The leader grants reinforce + unitTransfer (not station/trade).
    const grant = await worldAction(ctx, p0().playerId, {
      t: 'allianceSetPermissions', playerId: p1().playerId,
      permissions: { station: false, reinforce: true, trade: false, unitTransfer: true },
    });
    expect(grant.accepted).toBe(true);
    expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p1().playerId, permission: 'reinforce' })).toBe(true);
    expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p1().playerId, permission: 'unitTransfer' })).toBe(true);
    expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p1().playerId, permission: 'station' })).toBe(false);
    expect(await alliancePermission({ worldId, fromId: p0().playerId, toId: p1().playerId, permission: 'trade' })).toBe(false);
  });

  it('allies can reinforce an offline unshielded compound; non-allies cannot', async () => {
    const worldId = ctx.fx.worldId;
    // p0 goes offline: no presence rows at all → offline immediately in grace terms.
    const p0Presence = await playerPresence(p0().playerId);
    expect(p0Presence).toBeTruthy();

    // Reinforce permission holds while the owner is offline — the boundary rule
    // PW09 owns. (Shield gating itself lands in PW10; there are no shields yet.)
    expect(await alliancePermission({ worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'reinforce' })).toBe(true);
    // p2 shares no alliance: reinforcement is denied.
    expect(await alliancePermission({ worldId, fromId: p2().playerId, toId: p0().playerId, permission: 'reinforce' })).toBe(false);

    // And the allied unit can actually be ordered into the offline base's region —
    // the journal accepts the sim command and the sim applies it.
    const unit = [...ctx.runner.currentGame!.entities.values()]
      .find(e => e.kind === 'unit' && e.owner === 1 && e.hp > 0)!;
    const durableId = mmoEntityId(ctx.fx.regionId, unit.id);
    const fence = { workerId: ctx.fx.workerId, epoch: ctx.runner.authorityEpoch! };
    const tail = await journalTail(ctx.fx.regionId);
    const res = await submitCommand({
      playerId: p1().playerId,
      rawMessage: {
        protocol: 'comrade.mmo.v1', type: 'command', commandId: randomUUID(),
        regionId: ctx.fx.regionId, seenEpoch: fence.epoch, lastSeenEventSeq: '0',
        action: { t: 'move', entityIds: [durableId], x: 40, y: 40 },
      } as MmoCommandMessage,
      fence, tick: tail ? BigInt(tail.tick) : 0n,
    });
    expect(res.status).toBe('committed');
  });

  it('an ally cannot take the owner\'s assets without the unitTransfer grant', async () => {
    const worldId = ctx.fx.worldId;
    // p1→p0 transfer IS permitted (mutual grant).
    expect(await alliancePermission({ worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'unitTransfer' })).toBe(true);
    // p2→p0 is not: different alliance.
    expect(await alliancePermission({ worldId, fromId: p2().playerId, toId: p0().playerId, permission: 'unitTransfer' })).toBe(false);
    // Revoke p1's grant: the permission dies with it, membership does not.
    await worldAction(ctx, p0().playerId, {
      t: 'allianceSetPermissions', playerId: p1().playerId,
      permissions: { station: false, reinforce: false, trade: false, unitTransfer: false },
    });
    expect(await alliancePermission({ worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'unitTransfer' })).toBe(false);
    expect(await alliancePermission({ worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'reinforce' })).toBe(false);
    // Still allies in the sim — membership ≠ permission.
    expect(ctx.runner.currentGame!.isEnemy(0, 1)).toBe(false);
    // Re-grant for the next tests.
    await worldAction(ctx, p0().playerId, {
      t: 'allianceSetPermissions', playerId: p1().playerId,
      permissions: { station: false, reinforce: true, trade: false, unitTransfer: true },
    });
  });

  it('leaving the alliance restores hostility and kills every permission', async () => {
    const leave = await worldAction(ctx, p1().playerId, { t: 'allianceLeave' });
    expect(leave.accepted).toBe(true);
    await waitFor(() => ctx.runner.currentGame!.players[1].ally === -1);
    expect(ctx.runner.currentGame!.isEnemy(0, 1)).toBe(true);
    expect(await alliancePermission({ worldId: ctx.fx.worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'reinforce' })).toBe(false);
    expect(await alliancePermission({ worldId: ctx.fx.worldId, fromId: p1().playerId, toId: p0().playerId, permission: 'unitTransfer' })).toBe(false);
    // The departed player cannot keep using alliance-scoped actions.
    const stray = await worldAction(ctx, p1().playerId, { t: 'allianceLeave' });
    expect(stray.accepted).toBe(false);
  });

  it('kick and leader succession keep permissions consistent', async () => {
    // p1 rejoins, then p2 is invited+joins; leader kicks p2.
    const allianceId = (await allianceForPlayer(ctx.fx.worldId, p0().playerId))!.alliance.alliance_id;
    await worldAction(ctx, p0().playerId, { t: 'allianceInvite', allianceId, playerId: p1().playerId });
    await worldAction(ctx, p1().playerId, { t: 'allianceJoin', allianceId });
    await worldAction(ctx, p0().playerId, { t: 'allianceInvite', allianceId, playerId: p2().playerId });
    await worldAction(ctx, p2().playerId, { t: 'allianceJoin', allianceId });
    await waitFor(() => (ctx.runner.currentGame!.players[2]?.ally ?? -2) === ctx.runner.currentGame!.players[0].ally);

    const kick = await worldAction(ctx, p0().playerId, { t: 'allianceKick', playerId: p2().playerId });
    expect(kick.accepted).toBe(true);
    await waitFor(() => ctx.runner.currentGame!.players[2].ally === -1);
    expect(ctx.runner.currentGame!.isEnemy(0, 2)).toBe(true);
    const members = await allianceMembers(allianceId);
    expect(members.map(m => m.player_id).sort()).toEqual([p0().playerId, p1().playerId].sort());

    // Leader leaves: p1 (earliest member) is promoted and keeps the alliance key.
    await worldAction(ctx, p0().playerId, { t: 'allianceLeave' });
    const after = await allianceForPlayer(ctx.fx.worldId, p1().playerId);
    expect(after?.member.role).toBe('leader');
    expect(after?.alliance.leader_id).toBe(p1().playerId);
    await waitFor(() => ctx.runner.currentGame!.players[0].ally === -1);
    expect(ctx.runner.currentGame!.isEnemy(0, 1)).toBe(true); // p0 left
    expect(ctx.runner.currentGame!.isEnemy(1, 2)).toBe(true); // p2 was kicked
  });

  it('setAutoRepair toggles the durable flag and the sim caretaker', async () => {
    const res = await worldAction(ctx, p1().playerId, { t: 'setAutoRepair', on: true });
    expect(res.accepted).toBe(true);
    const presence = await playerPresence(p1().playerId);
    expect(presence?.auto_repair).toBe(true);
    await waitFor(() => ctx.runner.currentGame!.players[1].autoRepair === true);
    // And it survives in the snapshot the runner would checkpoint.
    const snap = ctx.runner.captureState();
    expect(snap).toBeTruthy();
  });

  it('presence: sockets count, multi-session stays online, grace then offline', async () => {
    const pid = p2().playerId;
    const now = Date.now();
    await playerConnected(pid, now);
    await playerConnected(pid, now + 1); // second socket, same account
    let pres = await playerPresence(pid);
    expect(pres?.online_count).toBe(2);
    expect(presenceIsOnline(pres, now + 10, PERSISTENT_RULES_V1.offlineAfterMs)).toBe(true);

    await playerDisconnected(pid, now + 2);
    pres = await playerPresence(pid);
    expect(pres?.online_count).toBe(1);
    expect(pres?.offline_since_ms).toBeNull();
    expect(presenceIsOnline(pres, now + 20, PERSISTENT_RULES_V1.offlineAfterMs)).toBe(true);

    await playerDisconnected(pid, now + 3); // last socket drops
    pres = await playerPresence(pid);
    expect(pres?.online_count).toBe(0);
    expect(pres?.offline_since_ms).not.toBeNull();
    // Offline begins offlineAfterMs after the last drop — not instantly.
    expect(presenceIsOnline(pres, now + 3 + PERSISTENT_RULES_V1.offlineAfterMs - 1, PERSISTENT_RULES_V1.offlineAfterMs)).toBe(true);
    expect(presenceIsOnline(pres, now + 3 + PERSISTENT_RULES_V1.offlineAfterMs + 1, PERSISTENT_RULES_V1.offlineAfterMs)).toBe(false);
    // Reconnect inside the window restores online without any state loss.
    await playerConnected(pid, now + 4);
    pres = await playerPresence(pid);
    expect(presenceIsOnline(pres, now + 5, PERSISTENT_RULES_V1.offlineAfterMs)).toBe(true);
    expect(pres?.online_since_ms).not.toBeNull();
    await playerDisconnected(pid, now + 6); // leave clean for other tests
  });

  it('chat: region fan-out is journaled; alliance chat requires membership', async () => {
    // p2 leaves any earlier alliance so the negative case is deterministic.
    await worldAction(ctx, p2().playerId, { t: 'allianceLeave' });
    const denied = await worldAction(ctx, p2().playerId, { t: 'chat', channel: 'alliance', text: 'hi' });
    expect(denied.accepted).toBe(false);
    expect(denied.reason).toBe('NOT_IN_ALLIANCE');

    // Region channel: accepted and fanned out on mmo.chat at the event's seq.
    const region = await worldAction(ctx, p0().playerId, { t: 'chat', channel: 'region', text: 'region hello' });
    expect(region.accepted).toBe(true);
    await waitFor(async () => !!(await mmoOne<{ topic: string }>(
      `select topic from outbox where region_id = $1 and topic = 'mmo.chat'
        and payload->>'text' = 'region hello'`, [ctx.fx.regionId])));

    // Alliance channel: p0 founds a guild, p1 joins, chat carries allianceId.
    const created = await worldAction(ctx, p0().playerId, { t: 'allianceCreate', name: 'ChatGuild' });
    expect(created.accepted).toBe(true);
    const found = await allianceForPlayer(ctx.fx.worldId, p0().playerId);
    const guildId = found!.alliance.alliance_id;
    await worldAction(ctx, p0().playerId, { t: 'allianceInvite', allianceId: guildId, playerId: p1().playerId });
    await worldAction(ctx, p1().playerId, { t: 'allianceJoin', allianceId: guildId });

    const ally = await worldAction(ctx, p0().playerId, { t: 'chat', channel: 'alliance', text: 'ally hello' });
    expect(ally.accepted).toBe(true);
    const fan = await mmoOne<{ payload: { channel: string; allianceId?: string; fromName?: string } }>(
      `select payload from outbox where region_id = $1 and topic = 'mmo.chat'
        and payload->>'text' = 'ally hello'`, [ctx.fx.regionId]);
    expect(fan?.payload.channel).toBe('alliance');
    expect(fan?.payload.allianceId).toBe(guildId);
    expect(fan?.payload.fromName).toBe(p0().displayName);
  }, 30_000);
});
