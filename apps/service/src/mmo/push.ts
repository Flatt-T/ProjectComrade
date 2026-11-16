// Web Push delivery for PW25 notifications (THU-2451).
//
// Uses the `web-push` library for the VAPID JWT + aes128gcm payload encryption
// the push protocol requires — hand-rolling that is not worth the risk. The
// channel stays inert until COMRADE_VAPID_* is configured; callers treat a
// missing config as 'skipped', never an error. Expired endpoints (404/410) are
// deleted so retries stop hitting dead subscriptions.
import webpush from 'web-push';
import { vapid } from '../config.js';
import { log } from '../ops.js';
import { mmoQuery } from './db.js';
import { notificationSummary, pushEndpoints } from './notify.js';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!vapid.configured()) return false;
  webpush.setVapidDetails(vapid.subject(), vapid.publicKey(), vapid.privateKey());
  configured = true;
  return true;
}

export interface PushDelivery {
  status: 'sent' | 'skipped' | 'failed';
  detail?: string;
}

/**
 * Deliver one notification to every stored subscription for the player. Returns
 * the aggregate status: 'sent' when at least one endpoint accepted it, 'skipped'
 * when unconfigured or no subscriptions exist, 'failed' when every endpoint
 * rejected it.
 */
export async function sendWebPush(
  playerId: string, n: { notification_id: string; kind: string; payload: Record<string, unknown>; created_at: string },
): Promise<PushDelivery> {
  if (!ensureConfigured()) return { status: 'skipped', detail: 'push-unconfigured' };
  const subs = await pushEndpoints(playerId);
  if (!subs.length) return { status: 'skipped', detail: 'no-subscription' };

  const summary = notificationSummary(n.kind, n.payload ?? {});
  const payload = JSON.stringify({
    notificationId: n.notification_id, kind: n.kind, summary,
    tag: `comrade-${n.notification_id}`,
  });

  let sent = 0, failed = 0, lastError = '';
  for (const sub of subs) {
    try {
      const keys = (sub.keys ?? {}) as { p256dh?: string; auth?: string };
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: keys as webpush.PushSubscription['keys'] },
        payload,
        { TTL: 3600, urgency: 'normal' },
      );
      sent++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Endpoint gone — drop it so future deliveries don't retry a dead URL.
        await mmoQuery('delete from push_subscription where endpoint = $1', [sub.endpoint])
          .catch(() => {});
      } else {
        failed++;
        lastError = error instanceof Error ? error.message : String(error);
        log('push-send-failed', { endpoint: sub.endpoint.slice(0, 60), statusCode, error: lastError.slice(0, 200) });
      }
    }
  }
  if (sent > 0) return { status: 'sent' };
  if (failed > 0) return { status: 'failed', detail: lastError.slice(0, 300) };
  return { status: 'skipped', detail: 'all-endpoints-expired' };
}
