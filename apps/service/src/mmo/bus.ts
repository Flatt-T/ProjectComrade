// Transactional outbox dispatcher (PW06): the event bus is the outbox table plus this
// leased, ordered, at-least-once publisher. Delivery may repeat after a crash; effects
// and receipts deduplicate downstream by event/operation id — this is NOT end-to-end
// exactly-once and is never claimed to be.
//
// Ordering: rows are claimed in (region_id, event_seq) order and published sequentially.
// If a publish fails, every later undelivered event for that region is held back this
// pass (head-of-line blocking), so subscribers never see seq N+1 before seq N.
import { mmoQuery } from './db.js';

export interface OutboxEnvelope {
  outboxId: string;
  eventId: string;
  regionId: string;
  eventSeq: string;
  topic: string;
  payload: unknown;
  attempts: number;
}

interface OutboxRow {
  outbox_id: string; event_id: string; region_id: string; event_seq: string;
  topic: string; payload: unknown; attempts: number;
}

const toEnvelope = (r: OutboxRow): OutboxEnvelope => ({
  outboxId: r.outbox_id, eventId: r.event_id, regionId: r.region_id,
  eventSeq: r.event_seq, topic: r.topic, payload: r.payload, attempts: r.attempts,
});

/**
 * Lease a batch of deliverable outbox rows. SKIP LOCKED lets several dispatchers
 * cooperate; the (region_id, event_seq) ordering keeps per-region order claimable.
 */
export async function claimOutbox(args: {
  workerId: string; limit?: number; leaseMs?: number;
}): Promise<OutboxEnvelope[]> {
  const limit = Math.min(Math.max(args.limit ?? 64, 1), 500);
  const leaseMs = args.leaseMs ?? 30_000;
  const leaseUntil = new Date(Date.now() + leaseMs);
  const rows = await mmoQuery<OutboxRow>(
    `update outbox
        set lease_owner = $1, lease_until = $2, attempts = attempts + 1
      where outbox_id in (
        select o.outbox_id from outbox o
         where o.delivered_at is null
           and o.available_at <= clock_timestamp()
           and (o.lease_until is null or o.lease_until <= clock_timestamp())
           -- Head-of-line: never claim a region event while an earlier same-region
           -- event is still undelivered, regardless of batching or backoff state.
           and not exists (
             select 1 from outbox earlier
              where earlier.region_id = o.region_id
                and earlier.event_seq < o.event_seq
                and earlier.delivered_at is null)
         order by o.region_id, o.event_seq, o.outbox_id
         limit $3
         for update of o skip locked)
      returning outbox_id, event_id, region_id, event_seq, topic, payload, attempts`,
    [args.workerId, leaseUntil, limit]);
  return rows.map(toEnvelope);
}

export async function ackOutbox(outboxId: string): Promise<void> {
  await mmoQuery(
    `update outbox set delivered_at = clock_timestamp(), lease_owner = null, lease_until = null
      where outbox_id = $1 and delivered_at is null`,
    [outboxId]);
}

/** Return a failed row to the pending set with bounded exponential backoff. */
export async function releaseOutbox(outboxId: string, retryInMs: number): Promise<void> {
  const availableAt = new Date(Date.now() + retryInMs);
  await mmoQuery(
    `update outbox set lease_owner = null, lease_until = null, available_at = $2
      where outbox_id = $1 and delivered_at is null`,
    [outboxId, availableAt]);
}

export interface DispatchResult { delivered: number; failed: number }

/**
 * Claim and publish until the outbox is drained for this pass. The claim query only
 * returns each region's current head event(s), so this loops: publish → ack → claim
 * the next head. Per-region journal order is therefore preserved end to end while
 * still achieving throughput. A failing head is released with bounded backoff and
 * blocks its region until it succeeds; the loop ends when a full claim yields no
 * progress.
 *
 * Retry policy: backoff = min(250ms * 2^attempts, 30s); after `maxAttempts` the row is
 * parked for one hour per attempt — bounded rate, never dropped, order preserved.
 */
export async function dispatchOutbox(args: {
  workerId: string;
  publish: (envelope: OutboxEnvelope) => void | Promise<void>;
  limit?: number; leaseMs?: number; maxAttempts?: number; maxRounds?: number;
}): Promise<DispatchResult> {
  const maxAttempts = args.maxAttempts ?? 12;
  const maxRounds = args.maxRounds ?? 1_000;
  const result: DispatchResult = { delivered: 0, failed: 0 };
  for (let round = 0; round < maxRounds; round++) {
    const batch = await claimOutbox({ workerId: args.workerId, limit: args.limit, leaseMs: args.leaseMs });
    if (batch.length === 0) break;
    let progress = false;
    for (const envelope of batch) {
      try {
        await args.publish(envelope);
        await ackOutbox(envelope.outboxId);
        result.delivered++;
        progress = true;
      } catch {
        result.failed++;
        const backoff = envelope.attempts >= maxAttempts
          ? 3_600_000
          : Math.min(250 * 2 ** Math.min(envelope.attempts, 7), 30_000);
        await releaseOutbox(envelope.outboxId, backoff);
      }
    }
    if (!progress) break; // every claimed head failed; they are now in backoff
  }
  return result;
}

/** Diagnostics: pending/leased/delivered counts for tests and ops. */
export async function outboxStats() {
  const rows = await mmoQuery<{ pending: string; leased: string; delivered: string }>(
    `select
       count(*) filter (where delivered_at is null and (lease_until is null or lease_until <= clock_timestamp())) as pending,
       count(*) filter (where delivered_at is null and lease_until > clock_timestamp()) as leased,
       count(*) filter (where delivered_at is not null) as delivered
     from outbox`);
  return rows[0];
}
