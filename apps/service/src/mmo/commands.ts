// Command intake and journal application for the persistent world (PW06).
//
// Journal-first ordering (COMRADE 18 §2.2): a client command is validated against the
// comrade.mmo.v1 contract, recorded as a command_intent and appended to the region
// journal under the fence — all in one transaction. The region runner then applies
// journaled inputs in order; commands with PostgreSQL side-effects (shield consumption,
// trade settlement, ladder, transfers, recovery, settlements) go through
// applyCommandEffects, which writes the economy_operation cause, the asset ledger, the
// inventory changes and the applied receipt atomically and exactly once.
import type { PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { parseMmoClientMessage, type MmoClientMessage, type MmoOperation } from '@comrade/contracts';
import { mmoOne } from './db.js';
import {
  appendRegionEvent, assertRegionFence, canonicalize, getRegionEventForUpdate,
  markRegionEventApplied, mmoTransaction,
  type AssetLedgerEntry,
} from './store.js';
import { MmoStoreError } from './store.js';

export interface RegionFence { workerId: string; epoch: string | bigint }

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface SubmitResult {
  status: 'committed' | 'deduplicated';
  commandId: string;
  regionId: string;
  eventSeq?: string;
}

/**
 * Validate and journal one client command. The intent row and the journal event commit
 * in the same transaction, so a crash can never leave an accepted intent without its
 * journal entry or vice versa. Re-submitting the same commandId with an identical
 * payload deduplicates; a different payload is a conflict.
 */
export async function submitCommand(args: {
  playerId: string; rawMessage: unknown; fence: RegionFence; tick: number | bigint;
}): Promise<SubmitResult> {
  const message = parseMmoClientMessage(args.rawMessage) as MmoClientMessage;
  if (message.type !== 'command') throw new MmoStoreError('BAD_MESSAGE', 'only command messages are accepted');
  const { action } = message;
  const payloadHash = sha256(JSON.stringify(action));

  // The journal tick must be >= last_committed_tick (fenceRegion enforces
  // monotonicity). The caller's tail read is stale by definition: runner-originated
  // events (scheduled jobs, accrual, shield transitions) commit continuously at the
  // live sim tick, so a command that loses that race fails FENCE_LOST and is dropped.
  // Re-read the tail inside each attempt and retry the rolled-back transaction —
  // the intent dedup check makes resubmission safe.
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await submitCommandOnce(args, message, payloadHash);
    } catch (error) {
      lastError = error;
      if (!(error instanceof MmoStoreError) || error.code !== 'FENCE_LOST') throw error;
    }
  }
  throw lastError;
}

async function submitCommandOnce(args: {
  playerId: string; rawMessage: unknown; fence: RegionFence; tick: number | bigint;
}, message: MmoClientMessage & { type: 'command' }, payloadHash: string): Promise<SubmitResult> {
  const { commandId, regionId, action } = message;

  return mmoTransaction(async tx => {
    // Lock the intent row first: stable lock order is intent → region fence → event.
    const selectIntent = () => tx.query<{ payload_sha256: string; status: string; result: { eventSeq?: string } | null }>(
      `select payload_sha256, status, result from command_intent
        where player_id = $1 and command_id = $2 for update`,
      [args.playerId, commandId]);
    let existing = await selectIntent();
    if (!existing.rows.length) {
      // Concurrent identical submissions race here: both see no row, both insert.
      // ON CONFLICT waits out the in-flight twin, then we lock and dedup-check.
      const ins = await tx.query(
        `insert into command_intent (player_id, command_id, region_id, payload_sha256, command_kind, request, status)
         values ($1,$2,$3,$4,'command',$5,'received')
         on conflict (player_id, command_id) do nothing
         returning player_id`,
        [args.playerId, commandId, regionId, payloadHash, JSON.stringify(action)]);
      if (!ins.rows.length) existing = await selectIntent();
    }
    if (existing.rows.length) {
      const prior = existing.rows[0];
      if (prior.payload_sha256 !== payloadHash) {
        throw new MmoStoreError('COMMAND_CONFLICT', 'command id reused with a different payload');
      }
      if (prior.status === 'committed_pending_application' || prior.status === 'applied') {
        return { status: 'deduplicated' as const, commandId, regionId, eventSeq: prior.result?.eventSeq };
      }
      // 'received'/'accepted'/'rejected' cannot survive a committed transaction; treat
      // as a fresh submission (the previous attempt rolled back).
    }

    // Reject commands issued against a stale connection/authority epoch, and read
    // the freshest journal tick in the same transaction — runner-originated events
    // advance last_committed_tick continuously, so the caller's earlier tail read
    // would lose the fenceRegion monotonicity check whenever one lands in between.
    const regionRow = await tx.query<{ authority_epoch: string; last_committed_tick: string }>(
      'select authority_epoch, last_committed_tick from region where region_id = $1', [regionId]);
    const currentEpoch = regionRow.rows[0]?.authority_epoch;
    if (currentEpoch !== undefined && BigInt(message.seenEpoch) !== BigInt(currentEpoch)) {
      throw new MmoStoreError('STALE_EPOCH', 'command seenEpoch does not match the region authority epoch');
    }
    const tick = regionRow.rows[0]
      ? BigInt(regionRow.rows[0].last_committed_tick)
      : BigInt(args.tick);

    const { eventSeq, eventId } = await appendRegionEvent(tx, {
      regionId, workerId: args.fence.workerId, epoch: args.fence.epoch, tick,
      kind: 'command', payload: { commandId, playerId: args.playerId, action },
      outboxTopic: 'mmo.command',
      outboxPayload: { commandId, playerId: args.playerId, regionId },
    });
    await tx.query(
      `update command_intent set status = 'committed_pending_application', result = $3, updated_at = clock_timestamp()
        where player_id = $1 and command_id = $2`,
      [args.playerId, commandId, JSON.stringify({ eventSeq, eventId })]);
    return { status: 'committed' as const, commandId, regionId, eventSeq };
  });
}

export interface ApplyEffectsArgs {
  regionId: string; eventSeq: string | bigint; fence: RegionFence;
  operationId: string; operation: MmoOperation;
  ledger: AssetLedgerEntry[]; result: unknown;
  intent?: { playerId: string; commandId: string };
  /** PostgreSQL-side inventory changes, run inside the same transaction. */
  effects?: (tx: PoolClient) => Promise<void>;
}

/**
 * Apply a journaled command's authoritative outcome and any PostgreSQL-side effects in
 * one transaction: economy_operation cause, asset_ledger rows, the applied receipt on
 * the journal event, intent completion and outbox notification. Exactly-once: a replay
 * sees applied_at set and returns deduplicated without repeating effects.
 */
export async function applyCommandEffects(args: ApplyEffectsArgs): Promise<{ applied: boolean; deduplicated: boolean }> {
  const canonical = canonicalize(args.operation);
  return mmoTransaction(async tx => {
    const event = await getRegionEventForUpdate(tx, args.regionId, args.eventSeq);
    if (!event) throw new MmoStoreError('NO_EVENT', 'journal event not found');
    if (event.applied_at) {
      // The event already carries its authoritative operation id; a replay must
      // present the same operation id AND payload or it is a conflict.
      if (event.operation_id && event.operation_id !== args.operationId) {
        throw new MmoStoreError('OPERATION_CONFLICT', 'applied event replayed with a different operation id');
      }
      const prior = await tx.query<{ canonical_action: unknown }>(
        'select canonical_action from economy_operation where operation_id = $1', [event.operation_id ?? args.operationId]);
      if (prior.rows.length && canonicalize(prior.rows[0].canonical_action) !== canonical) {
        throw new MmoStoreError('OPERATION_CONFLICT', 'applied event replayed with a different operation');
      }
      return { applied: false, deduplicated: true };
    }

    // Verify — without consuming a journal sequence — that the writer still holds
    // authority to record this outcome.
    await assertRegionFence(tx, { regionId: args.regionId, workerId: args.fence.workerId, epoch: args.fence.epoch });

    // Operation dedupe on operation_id with canonical-payload verification.
    const priorOp = await tx.query<{ canonical_action: unknown }>(
      'select canonical_action from economy_operation where operation_id = $1 for update', [args.operationId]);
    if (priorOp.rows.length) {
      if (canonicalize(priorOp.rows[0].canonical_action) !== canonical) {
        throw new MmoStoreError('OPERATION_CONFLICT', 'operation id reused with a different payload');
      }
    } else {
      await tx.query(
        `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result, runner_applied_at, applied_result)
         values ($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),$8)`,
        [args.operationId, args.regionId, event.authority_epoch, event.simulation_tick, args.operation.kind, canonical,
         JSON.stringify(args.result ?? null), JSON.stringify(args.result ?? null)]);
    }
    for (const entry of args.ledger) {
      await tx.query(
        `insert into asset_ledger (operation_id, entity_id, region_id, kind, from_owner, to_owner, physical_state, engine_entity_key, detail)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (operation_id, entity_id, kind) do nothing`,
        [args.operationId, entry.entityId, args.regionId, entry.kind, entry.fromOwner ?? null, entry.toOwner ?? null,
         entry.physicalState, entry.engineEntityKey ?? null, JSON.stringify(entry.detail ?? {})]);
    }
    if (!(await markRegionEventApplied(tx, { regionId: args.regionId, eventSeq: args.eventSeq, result: args.result, operationId: args.operationId }))) {
      throw new MmoStoreError('APPLY_RACE', 'journal event applied concurrently');
    }
    if (args.effects) await args.effects(tx);
    if (args.intent) {
      await tx.query(
        `update command_intent set status = 'applied', result = coalesce(result, '{}'::jsonb) || $3::jsonb, updated_at = clock_timestamp()
          where player_id = $1 and command_id = $2`,
        [args.intent.playerId, args.intent.commandId, JSON.stringify({ appliedResult: args.result ?? null })]);
    }
    // Notify subscribers of the committed outcome on the same journal position.
    await tx.query(
      `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.operation',$4)`,
      [randomUUID(), args.regionId, args.eventSeq.toString(), JSON.stringify({ operationId: args.operationId, kind: args.operation.kind, result: args.result ?? null })]);
    return { applied: true, deduplicated: false };
  });
}

/** Read the durable journal tail for a region (replay/audit). */
export async function journalTail(regionId: string) {
  const row = await mmoOne<{ last_committed_seq: string; last_committed_tick: string }>(
    'select last_committed_seq, last_committed_tick from region where region_id = $1', [regionId]);
  return row ? { seq: row.last_committed_seq, tick: row.last_committed_tick } : undefined;
}
