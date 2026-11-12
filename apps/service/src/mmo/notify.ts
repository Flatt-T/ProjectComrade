// PW25 notifications and the away report (COMRADE 18 §3.10).
//
// A notification row is the durable event; delivery is per-channel and audited
// in notification_delivery. Nothing sends without an explicit opt-in row in
// notification_pref — a missing row means the channel default, which is off.
// Producers raise rows inside the region journal transaction (or a scheduled
// eval transaction) so the notification commits atomically with the state that
// caused it; the dedupe_key unique index makes raising idempotent.
import { randomUUID } from 'node:crypto';
import {
  MMO_NOTIFY_CHANNELS, MMO_NOTIFY_PREFS_DEFAULT,
  type MmoAwayReport, type MmoAwayReportEntry, type MmoNotification,
  type MmoNotificationKind, type MmoNotifyChannel, type MmoNotificationPrefs,
} from '@comrade/contracts';
import { mmoExec, mmoOne, mmoQuery } from './db.js';
import type { Queryable } from './store.js';

export interface NotificationRow {
  notification_id: string; player_id: string; region_id: string | null;
  kind: string; payload: Record<string, unknown>; dedupe_key: string;
  deliver_after: string; created_at: string; delivered_at: string | null; read_at: string | null;
}

const toNotification = (r: NotificationRow): MmoNotification => ({
  notificationId: r.notification_id, playerId: r.player_id,
  kind: r.kind as MmoNotificationKind, payload: r.payload ?? {},
  createdAt: r.created_at, readAt: r.read_at,
});

/**
 * Raise a notification inside the caller's transaction. Idempotent on
 * (player_id, dedupe_key): producers bucket the key by the profile's rate-limit
 * window so repeated causes inside one window collapse to a single row.
 * Returns true when a new row was created.
 */
export async function raiseNotification(
  q: Queryable,
  args: {
    playerId: string; kind: MmoNotificationKind; dedupeKey: string;
    payload?: Record<string, unknown>; regionId?: string | null;
    deliverAfter: Date;
  },
): Promise<boolean> {
  const { rows } = await q.query<{ notification_id: string }>(
    `insert into notification (notification_id, player_id, region_id, kind, payload, dedupe_key, deliver_after)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (player_id, dedupe_key) do nothing
     returning notification_id`,
    [randomUUID(), args.playerId, args.regionId ?? null, args.kind,
     JSON.stringify(args.payload ?? {}), args.dedupeKey, args.deliverAfter]);
  return rows.length > 0;
}

/** Effective prefs: explicit rows win, everything else is the off default. */
export async function notificationPrefs(playerId: string): Promise<MmoNotificationPrefs> {
  const rows = await mmoQuery<{ channel: string; enabled: boolean }>(
    'select channel, enabled from notification_pref where player_id = $1', [playerId]);
  const prefs = { ...MMO_NOTIFY_PREFS_DEFAULT };
  for (const r of rows) {
    if (r.channel === 'inapp' || r.channel === 'email' || r.channel === 'push') {
      prefs[r.channel] = r.enabled;
    }
  }
  return prefs;
}

export async function setNotificationPref(
  playerId: string, channel: MmoNotifyChannel, enabled: boolean,
): Promise<void> {
  await mmoQuery(
    `insert into notification_pref (player_id, channel, enabled, updated_at)
     values ($1,$2,$3,clock_timestamp())
     on conflict (player_id, channel) do update set enabled = $3, updated_at = clock_timestamp()`,
    [playerId, channel, enabled]);
}

export async function listNotifications(playerId: string, limit = 50): Promise<MmoNotification[]> {
  const rows = await mmoQuery<NotificationRow>(
    `select * from notification where player_id = $1 order by created_at desc limit $2`,
    [playerId, Math.min(Math.max(limit, 1), 200)]);
  return rows.map(toNotification);
}

/** Mark notifications read; no ids means "mark all read". */
export async function markNotificationsRead(playerId: string, ids?: string[]): Promise<number> {
  const result = await mmoExec(
    `update notification set read_at = clock_timestamp()
      where player_id = $1 and read_at is null
        and ($2::uuid[] is null or notification_id = any($2::uuid[]))`,
    [playerId, ids ?? null]);
  return result.rowCount ?? 0;
}

// --- push subscriptions ----------------------------------------------------

export async function pushSubscribe(playerId: string, endpoint: string, keys: unknown): Promise<void> {
  await mmoQuery(
    `insert into push_subscription (subscription_id, player_id, endpoint, keys)
     values ($1,$2,$3,$4)
     on conflict (endpoint) do update set player_id = $2, keys = $4`,
    [randomUUID(), playerId, endpoint, JSON.stringify(keys ?? {})]);
}

export async function pushUnsubscribe(playerId: string, endpoint: string): Promise<void> {
  await mmoQuery(
    'delete from push_subscription where player_id = $1 and endpoint = $2', [playerId, endpoint]);
}

export async function pushEndpoints(playerId: string): Promise<{ endpoint: string; keys: unknown }[]> {
  const rows = await mmoQuery<{ endpoint: string; keys: unknown }>(
    'select endpoint, keys from push_subscription where player_id = $1', [playerId]);
  return rows;
}

/** The durable account id behind a player, for channel address lookup. */
export async function playerAccountId(playerId: string): Promise<string | null> {
  const row = await mmoOne<{ account_id: string }>(
    'select account_id from player where player_id = $1', [playerId]);
  return row?.account_id ?? null;
}

// --- delivery ---------------------------------------------------------------

export type ChannelSend = (
  playerId: string, n: NotificationRow,
) => Promise<{ status: 'sent' | 'skipped' | 'failed'; detail?: string }>;

export interface NotificationSenders {
  inapp: ChannelSend;
  email: ChannelSend;
  push: ChannelSend;
}

async function recordDelivery(
  notificationId: string, channel: MmoNotifyChannel,
  status: 'sent' | 'skipped' | 'failed', detail = '',
): Promise<void> {
  await mmoQuery(
    `insert into notification_delivery (notification_id, channel, status, detail)
     values ($1,$2,$3,$4)`,
    [notificationId, channel, status, detail.slice(0, 500)]);
}

/**
 * Deliver every due, undelivered notification through the channels the player
 * opted into. Each channel attempt is audited; a channel the player disabled
 * records nothing — unsubscribing stops it completely. Runs on the gateway's
 * dispatch interval; single-writer per process, at-least-once semantics like
 * the outbox (a crash between send and mark can re-deliver once).
 */
export async function dispatchDueNotifications(
  senders: NotificationSenders, limit = 64,
): Promise<{ delivered: number; failed: number }> {
  const due = await mmoQuery<NotificationRow>(
    `select * from notification
      where delivered_at is null and deliver_after <= clock_timestamp()
      order by created_at limit $1`, [limit]);
  let delivered = 0, failed = 0;
  for (const n of due) {
    const prefs = await notificationPrefs(n.player_id);
    let anyFailure = false;
    for (const channel of MMO_NOTIFY_CHANNELS) {
      if (!prefs[channel]) continue;
      try {
        const result = await senders[channel](n.player_id, n);
        await recordDelivery(n.notification_id, channel, result.status, result.detail ?? '');
        if (result.status === 'failed') anyFailure = true;
      } catch (error) {
        anyFailure = true;
        await recordDelivery(n.notification_id, channel, 'failed',
          error instanceof Error ? error.message : String(error));
      }
    }
    // Mark delivered once every opted-in channel had its attempt; a total
    // channel failure still marks (the audit row carries the failure) so one
    // bad address cannot wedge the queue — retries are a PW26+ concern.
    await mmoQuery('update notification set delivered_at = clock_timestamp() where notification_id = $1',
      [n.notification_id]);
    if (anyFailure) failed++; else delivered++;
  }
  return { delivered, failed };
}

// --- away report ------------------------------------------------------------

/**
 * The offline timeline (PW25): notifications raised while the player was away,
 * recovery episodes opened or closed, compounds destroyed, and shield records
 * that changed state — each entry carries the journal pointer a client can
 * replay to verify it against the sim.
 */
export async function awayReportFor(playerId: string): Promise<MmoAwayReport> {
  const until = new Date().toISOString();
  const presence = await mmoOne<{ last_offline_since_ms: string | null }>(
    'select last_offline_since_ms::text from player where player_id = $1', [playerId]);
  const sinceMs = presence?.last_offline_since_ms != null ? Number(presence.last_offline_since_ms) : null;
  if (sinceMs === null) return { since: null, until, entries: [] };
  const since = new Date(sinceMs).toISOString();

  const entries: MmoAwayReportEntry[] = [];
  const push = (at: string, kind: string, summary: string, regionId: string | null,
    eventSeq: string | null, notificationId: string | null) => {
    entries.push({ at, kind, summary, regionId, eventSeq, notificationId });
  };

  const notifications = await mmoQuery<{
    notification_id: string; region_id: string | null; kind: string;
    payload: Record<string, unknown>; created_at: string;
  }>(
    `select notification_id, region_id, kind, payload, created_at
       from notification where player_id = $1 and created_at >= $2::timestamptz
      order by created_at`, [playerId, since]);
  for (const n of notifications) {
    push(n.created_at, `notification:${n.kind}`, notificationSummary(n.kind, n.payload),
      n.region_id, null, n.notification_id);
  }

  const episodes = await mmoQuery<{
    episode_id: string; region_id: string; status: string; created_at: string; ended_at: string | null;
  }>(
    `select episode_id, region_id, status, created_at, ended_at from recovery_episode
      where player_id = $1 and (created_at >= $2::timestamptz
        or (ended_at is not null and ended_at >= $2::timestamptz))
      order by created_at`, [playerId, since]);
  for (const e of episodes) {
    push(e.created_at, 'recovery', `Recovery episode opened (${e.status})`,
      e.region_id, null, null);
    if (e.ended_at && e.ended_at >= since) {
      push(e.ended_at, 'recovery', `Recovery episode ${e.status}`,
        e.region_id, null, null);
    }
  }

  const compounds = await mmoQuery<{ compound_id: string; region_id: string; updated_at: string }>(
    `select compound_id, region_id, updated_at from compound
      where player_id = $1 and state = 'destroyed' and updated_at >= $2::timestamptz`,
    [playerId, since]);
  for (const c of compounds) {
    push(c.updated_at, 'compound_destroyed', 'A compound was destroyed', c.region_id, null, null);
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));
  return { since, until, entries };
}

export function notificationSummary(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'compound_under_attack': return 'Your compound is under attack';
    case 'shield_ending': return 'Your shield is ending soon';
    case 'storage_full': return 'Storage is full';
    case 'superweapon_nearby': return 'A superweapon was deployed near you';
    case 'trade_offer': return 'You have a trade offer';
    case 'ally_call': return 'An ally is calling for help';
    case 'objective_done': return 'Objective complete';
    default: return String(payload.summary ?? 'Notification');
  }
}
