// MMO durable store: the only write paths for persistent-world records.
//
// Conventions follow COMRADE 14: every region-state write goes through the fence
// (owner_worker_id + authority_epoch + unexpired lease + monotone tick), the journal
// event, its outbox row and any economy_operation/asset_ledger effects commit in one
// transaction, and retries deduplicate on stable IDs rather than double-applying.
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { mmoExec, mmoOne, mmoQuery, mmoTransaction } from './db.js';
import { parseBarterOffer, type BarterOffer, type MmoOperation } from '@comrade/contracts';

export class MmoStoreError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const uuid = () => randomUUID();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Key-sorted JSON so canonical payloads compare equal regardless of key order. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

// ---------------------------------------------------------------------------
// Row shapes (bigint columns arrive as strings from pg)
// ---------------------------------------------------------------------------

export interface WorldRow { world_id: string; ruleset_id: string; ruleset_version: number; pack_revision: string; engine_artifact_sha256: string; }
export interface RegionRow {
  region_id: string; world_id: string; authority_epoch: string; owner_worker_id: string | null;
  lease_expires_at: Date | null; last_committed_seq: string; last_committed_tick: string;
  lifecycle: 'recovering' | 'active' | 'quiescent' | 'checkpointing' | 'inactive' | 'failed';
  started_at_ms?: string | null;
  seed?: unknown;
  ruleset_version?: string;
  engine_artifact_sha256?: string;
}
export interface PlayerRow { player_id: string; account_id: string; display_name: string; }
export interface ProtectionRow {
  compound_id: string; player_id: string; kind: 'NEWCOMER' | 'OFFLINE_EARNED' | 'RECOVERY';
  status: 'armed' | 'active' | 'ended'; generation: string; armed_seconds: string;
  online_ms: string; online_since_ms: string | null; lapse_at_ms: string | null;
  started_at_ms: string | null; ends_at_ms: string | null;
  milestone_power: string; milestone_barracks: string;
}
export interface TransferRow {
  transfer_id: string; entity_id: string; source_region_id: string; dest_region_id: string;
  state: 'PREPARED' | 'SOURCE_RELEASED' | 'DESTINATION_ACCEPTED' | 'COMPLETED' | 'CANCELLED' | 'RECOVERY_REQUIRED';
}

// ---------------------------------------------------------------------------
// World, players, regions
// ---------------------------------------------------------------------------

export async function createWorld(args: {
  worldId?: string; rulesetId: string; rulesetVersion: number; packRevision: string;
  engineArtifactSha256: string; capabilities?: unknown; decisions?: unknown;
}): Promise<WorldRow> {
  const id = args.worldId ?? uuid();
  await mmoQuery(
    `insert into world (world_id, ruleset_id, ruleset_version, pack_revision, engine_artifact_sha256, capabilities, decisions)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, args.rulesetId, args.rulesetVersion, args.packRevision, args.engineArtifactSha256,
     JSON.stringify(args.capabilities ?? {}), JSON.stringify(args.decisions ?? {})]);
  return (await mmoOne<WorldRow>('select * from world where world_id = $1', [id]))!;
}

export async function createPlayer(args: { playerId?: string; accountId: string; displayName: string }): Promise<PlayerRow> {
  const id = args.playerId ?? uuid();
  await mmoQuery(
    `insert into player (player_id, account_id, display_name) values ($1,$2,$3)
     on conflict (player_id) do nothing`,
    [id, args.accountId, args.displayName]);
  const row = await mmoOne<PlayerRow>('select * from player where player_id = $1', [id]);
  if (!row) throw new MmoStoreError('PLAYER_CONFLICT', 'player id already used by another account');
  return row;
}

export async function joinWorld(worldId: string, playerId: string): Promise<void> {
  await mmoQuery(
    `insert into world_member (world_id, player_id) values ($1,$2) on conflict do nothing`,
    [worldId, playerId]);
}

/**
 * Persist recomputed power scores for a world's members (PW23). Called by the
 * region runner at checkpoints; scores are derived read-model state, so a plain
 * upsert is correct — the journal remains the authority for asset changes.
 */
export async function updateMemberPowerScores(
  worldId: string, scores: { playerId: string; score: number }[],
): Promise<void> {
  for (const s of scores) {
    await mmoQuery(
      `update world_member set power_score = $3
        where world_id = $1 and player_id = $2`,
      [worldId, s.playerId, Math.max(0, Math.round(s.score))]);
  }
}

/** Power scores of a world's members, for frontier spawn-band checks (PW23). */
export async function memberPowerScores(worldId: string): Promise<{ playerId: string; score: number }[]> {
  const rows = await mmoQuery<{ player_id: string; power_score: string }>(
    `select player_id, power_score from world_member where world_id = $1`, [worldId]);
  return rows.map(r => ({ playerId: r.player_id, score: Number(r.power_score) }));
}

export async function createRegion(args: {
  regionId?: string; worldId: string; label?: string; seed?: unknown;
  rulesetVersion: string; engineArtifactSha256: string;
}): Promise<RegionRow> {
  const id = args.regionId ?? uuid();
  await mmoQuery(
    `insert into region (region_id, world_id, label, seed, ruleset_version, engine_artifact_sha256)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, args.worldId, args.label ?? '', JSON.stringify(args.seed ?? {}), args.rulesetVersion, args.engineArtifactSha256]);
  return (await mmoOne<RegionRow>('select * from region where region_id = $1', [id]))!;
}

export async function getRegion(regionId: string): Promise<RegionRow | undefined> {
  return mmoOne<RegionRow>('select * from region where region_id = $1', [regionId]);
}

export async function setRegionLifecycle(regionId: string, lifecycle: RegionRow['lifecycle']): Promise<void> {
  await mmoQuery('update region set lifecycle = $2 where region_id = $1', [regionId, lifecycle]);
}

// ---------------------------------------------------------------------------
// Region lease and fence (COMRADE 14 §3)
// ---------------------------------------------------------------------------

export interface Lease { workerId: string; epoch: string; expiresAt: Date }

/**
 * Take or renew region authority. Locks the region row, refuses to steal an unexpired
 * lease, and increments the epoch on every ownership change. Returns the fence the
 * caller must present on every subsequent write.
 */
export async function acquireRegionLease(args: {
  regionId: string; workerId: string; leaseMs?: number; forceTakeover?: boolean;
}): Promise<Lease> {
  const leaseMs = args.leaseMs ?? 30_000;
  return mmoTransaction(async tx => {
    const { rows } = await tx.query<RegionRow>(
      'select * from region where region_id = $1 for update', [args.regionId]);
    const region = rows[0];
    if (!region) throw new MmoStoreError('NO_REGION', 'unknown region');
    const now = await tx.query<{ now: Date }>('select clock_timestamp() as now');
    const held = region.owner_worker_id !== null
      && region.lease_expires_at !== null
      && region.lease_expires_at > now.rows[0].now
      && region.owner_worker_id !== args.workerId;
    if (held && !args.forceTakeover) {
      throw new MmoStoreError('LEASE_HELD', 'region lease held by another worker');
    }
    const sameOwner = region.owner_worker_id === args.workerId;
    const epoch = sameOwner ? BigInt(region.authority_epoch) : BigInt(region.authority_epoch) + 1n;
    const expires = new Date(now.rows[0].now.getTime() + leaseMs);
    await tx.query(
      `update region set owner_worker_id = $2, lease_expires_at = $3, authority_epoch = $4,
         lifecycle = case when lifecycle = 'failed' then 'recovering' else lifecycle end
       where region_id = $1`,
      [args.regionId, args.workerId, expires, epoch.toString()]);
    return { workerId: args.workerId, epoch: epoch.toString(), expiresAt: expires };
  });
}

/**
 * The fence every journal/operation write must pass: correct owner, current epoch,
 * unexpired lease, monotone tick. Returns the committed event sequence to use.
 */
export async function fenceRegion(tx: PoolClient, args: {
  regionId: string; workerId: string; epoch: string | bigint; tick: number | bigint;
}): Promise<string> {
  const tick = BigInt(args.tick);
  const { rows } = await tx.query<{ last_committed_seq: string }>(
    `update region
        set last_committed_seq = last_committed_seq + 1,
            last_committed_tick = greatest(last_committed_tick, $4)
      where region_id = $1
        and owner_worker_id = $2
        and authority_epoch = $3
        and lease_expires_at > clock_timestamp()
        and last_committed_tick <= $4
      returning last_committed_seq`,
    [args.regionId, args.workerId, args.epoch.toString(), tick.toString()]);
  if (rows.length !== 1) {
    throw new MmoStoreError('FENCE_LOST', 'region authority lost or stale tick');
  }
  return rows[0].last_committed_seq;
}

/**
 * Verify — without consuming a journal sequence — that the caller still holds region
 * authority. Used by apply-side writes (operation receipts, inventory effects) which
 * must not advance last_committed_seq.
 */
export async function assertRegionFence(tx: PoolClient, args: {
  regionId: string; workerId: string; epoch: string | bigint;
}): Promise<void> {
  const { rows } = await tx.query(
    `select region_id from region
      where region_id = $1 and owner_worker_id = $2 and authority_epoch = $3
        and lease_expires_at > clock_timestamp() for update`,
    [args.regionId, args.workerId, args.epoch.toString()]);
  if (rows.length !== 1) {
    throw new MmoStoreError('FENCE_LOST', 'region authority lost');
  }
}

// ---------------------------------------------------------------------------
// Journal + outbox
// ---------------------------------------------------------------------------

export type MmoEventKind = 'command' | 'scheduled' | 'protection' | 'operation' | 'transfer' | 'accrual' | 'world';

export interface AppendEventArgs {
  regionId: string; workerId: string; epoch: string | bigint; tick: number | bigint;
  kind: MmoEventKind; payload: unknown; eventId?: string; operationId?: string;
  outboxTopic?: string; outboxPayload?: unknown;
}

/**
 * Commit one ordered journal event under the fence, plus its outbox row, atomically.
 * This is the single write path for simulation-affecting inputs.
 */
export async function appendRegionEvent(tx: PoolClient, args: AppendEventArgs): Promise<{ eventSeq: string; eventId: string }> {
  const eventSeq = await fenceRegion(tx, args);
  const eventId = args.eventId ?? uuid();
  await tx.query(
    `insert into region_event (region_id, event_seq, authority_epoch, simulation_tick, event_id, event_kind, operation_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [args.regionId, eventSeq, args.epoch.toString(), args.tick.toString(), eventId, args.kind, args.operationId ?? null, JSON.stringify(args.payload)]);
  if (args.outboxTopic) {
    await tx.query(
      `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,$4,$5)`,
      [eventId, args.regionId, eventSeq, args.outboxTopic, JSON.stringify(args.outboxPayload ?? args.payload)]);
  }
  return { eventSeq, eventId };
}

// ---------------------------------------------------------------------------
// Economy operations: durable cause + asset ledger + journal, one transaction
// ---------------------------------------------------------------------------

export interface AssetLedgerEntry {
  entityId: string; kind: string; fromOwner?: string | null; toOwner?: string | null;
  physicalState: string; engineEntityKey?: string; detail?: unknown;
}

export interface CommitOperationArgs {
  operationId: string; regionId: string; workerId: string; epoch: string | bigint;
  tick: number | bigint; operation: MmoOperation;
  ledger: AssetLedgerEntry[]; result?: unknown; eventPayload?: unknown;
}

export interface CommitOperationResult { operationId: string; eventSeq: string; deduplicated: boolean }

/**
 * Commit a world operation journal-first: economy_operation row (deduplicated on
 * operation_id with canonical-payload verification), one asset_ledger row per touched
 * asset, the journal event and its outbox row — all in the caller's transaction.
 */
export async function commitOperation(tx: PoolClient, args: CommitOperationArgs): Promise<CommitOperationResult> {
  const kind = args.operation.kind;
  const canonical = canonicalize(args.operation);
  const existing = await tx.query<{ canonical_action: unknown }>(
    'select canonical_action from economy_operation where operation_id = $1 for update', [args.operationId]);
  if (existing.rows.length) {
    // jsonb normalizes key order on storage, so compare canonically, not as text.
    if (canonicalize(existing.rows[0].canonical_action) !== canonical) {
      throw new MmoStoreError('OPERATION_CONFLICT', 'operation id reused with a different payload');
    }
    return { operationId: args.operationId, eventSeq: '0', deduplicated: true };
  }
  const { eventSeq } = await appendRegionEvent(tx, {
    regionId: args.regionId, workerId: args.workerId, epoch: args.epoch, tick: args.tick,
    kind: 'operation', operationId: args.operationId,
    payload: args.eventPayload ?? { operation: args.operation, result: args.result ?? null },
    outboxTopic: 'mmo.operation',
    outboxPayload: { operationId: args.operationId, kind, result: args.result ?? null },
  });
  await tx.query(
    `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [args.operationId, args.regionId, args.epoch.toString(), args.tick.toString(), kind, canonical, args.result === undefined ? null : JSON.stringify(args.result)]);
  for (const entry of args.ledger) {
    await tx.query(
      `insert into asset_ledger (operation_id, entity_id, region_id, kind, from_owner, to_owner, physical_state, engine_entity_key, detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [args.operationId, entry.entityId, args.regionId, entry.kind, entry.fromOwner ?? null, entry.toOwner ?? null,
       entry.physicalState, entry.engineEntityKey ?? null, JSON.stringify(entry.detail ?? {})]);
  }
  return { operationId: args.operationId, eventSeq, deduplicated: false };
}

/** Record that the runner applied a committed operation (applied receipt). */
export async function markOperationApplied(operationId: string, appliedResult?: unknown): Promise<void> {
  await mmoQuery(
    `update economy_operation set runner_applied_at = clock_timestamp(), applied_result = coalesce($2, applied_result)
      where operation_id = $1 and runner_applied_at is null`,
    [operationId, appliedResult === undefined ? null : JSON.stringify(appliedResult)]);
}

// ---------------------------------------------------------------------------
// Command intents
// ---------------------------------------------------------------------------

export async function recordIntent(args: {
  playerId: string; commandId: string; regionId: string; request: unknown; commandKind: string;
}): Promise<'inserted' | 'duplicate'> {
  const payloadHash = sha256(JSON.stringify(args.request));
  const { rowCount } = await mmoExec(
    `insert into command_intent (player_id, command_id, region_id, payload_sha256, command_kind, request)
     values ($1,$2,$3,$4,$5,$6) on conflict (player_id, command_id) do nothing`,
    [args.playerId, args.commandId, args.regionId, payloadHash, args.commandKind, JSON.stringify(args.request)]);
  if (rowCount) return 'inserted';
  const existing = await mmoOne<{ payload_sha256: string }>(
    'select payload_sha256 from command_intent where player_id = $1 and command_id = $2', [args.playerId, args.commandId]);
  if (existing?.payload_sha256 !== payloadHash) {
    throw new MmoStoreError('COMMAND_CONFLICT', 'command id reused with a different payload');
  }
  return 'duplicate';
}

export async function markIntent(commandId: string, playerId: string, status: string, result?: unknown): Promise<void> {
  await mmoQuery(
    `update command_intent set status = $3, result = coalesce($4, result), updated_at = clock_timestamp()
      where player_id = $2 and command_id = $1`,
    [commandId, playerId, status, result === undefined ? null : JSON.stringify(result)]);
}

// ---------------------------------------------------------------------------
// Shield and power-up inventories (Postgres-authoritative, receipt-idempotent)
// ---------------------------------------------------------------------------

/**
 * Grant shield seconds to a balance kind ('nightly' | 'earned'). Idempotent on
 * effectKey: a retried transaction awards nothing twice.
 */
export async function grantShieldSeconds(tx: PoolClient, args: {
  playerId: string; kind: 'nightly' | 'earned'; seconds: number | bigint; effectKey: string; operationId?: string;
}): Promise<'granted' | 'duplicate'> {
  const seconds = BigInt(args.seconds);
  if (seconds <= 0n) throw new MmoStoreError('BAD_AMOUNT', 'shield grant must be positive');
  const receipt = await tx.query(
    `insert into effect_receipt (effect_key, operation_id, kind) values ($1,$2,'shield') on conflict do nothing returning effect_key`,
    [args.effectKey, args.operationId ?? null]);
  if (!receipt.rowCount) return 'duplicate';
  await tx.query(
    `insert into shield_balance (player_id, kind, seconds_remaining) values ($1,$2,$3)
     on conflict (player_id, kind) do update
       set seconds_remaining = shield_balance.seconds_remaining + $3, updated_at = clock_timestamp()`,
    [args.playerId, args.kind, seconds.toString()]);
  return 'granted';
}

/** Spend shield seconds with a generation fence: stale holders change nothing. */
export async function consumeShieldSeconds(tx: PoolClient, args: {
  playerId: string; kind: 'nightly' | 'earned'; seconds: number | bigint | string; expectedGeneration: number | bigint | string;
}): Promise<boolean> {
  const seconds = BigInt(args.seconds);
  const { rowCount } = await tx.query(
    `update shield_balance
        set seconds_remaining = seconds_remaining - $3, generation = generation + 1, updated_at = clock_timestamp()
      where player_id = $1 and kind = $2 and generation = $4 and seconds_remaining >= $3`,
    [args.playerId, args.kind, seconds.toString(), args.expectedGeneration.toString()]);
  return rowCount === 1;
}

export async function getShieldBalance(playerId: string, kind: 'nightly' | 'earned') {
  return mmoOne<{ seconds_remaining: string; generation: string }>(
    'select seconds_remaining, generation from shield_balance where player_id = $1 and kind = $2', [playerId, kind]);
}

export async function adjustPowerup(tx: PoolClient, args: {
  playerId: string; kind: string; delta: number | bigint; effectKey?: string; operationId?: string;
}): Promise<void> {
  if (args.effectKey) {
    const receipt = await tx.query(
      `insert into effect_receipt (effect_key, operation_id, kind) values ($1,$2,'powerup') on conflict do nothing returning effect_key`,
      [args.effectKey, args.operationId ?? null]);
    if (!receipt.rowCount) return;
  }
  const delta = BigInt(args.delta);
  await tx.query(
    `insert into powerup_balance (player_id, kind, count) values ($1,$2,$3)
     on conflict (player_id, kind) do update
       set count = powerup_balance.count + $3, updated_at = clock_timestamp()
     where powerup_balance.count + $3 >= 0`,
    [args.playerId, args.kind, delta.toString()]);
}

// ---------------------------------------------------------------------------
// Protection records (mirror of the comrade.mmo.v1 state machine)
// ---------------------------------------------------------------------------

export async function saveProtectionRecord(tx: PoolClient, record: ProtectionRow): Promise<void> {
  await tx.query(
    `insert into protection_record (compound_id, player_id, kind, status, generation, armed_seconds,
        online_ms, online_since_ms, lapse_at_ms, started_at_ms, ends_at_ms, milestone_power, milestone_barracks)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (compound_id) do update set
       status = excluded.status, generation = excluded.generation, armed_seconds = excluded.armed_seconds,
       online_ms = excluded.online_ms, online_since_ms = excluded.online_since_ms, lapse_at_ms = excluded.lapse_at_ms,
       started_at_ms = excluded.started_at_ms, ends_at_ms = excluded.ends_at_ms,
       milestone_power = excluded.milestone_power, milestone_barracks = excluded.milestone_barracks,
       updated_at = clock_timestamp()`,
    [record.compound_id, record.player_id, record.kind, record.status, record.generation, record.armed_seconds,
     record.online_ms, record.online_since_ms, record.lapse_at_ms, record.started_at_ms, record.ends_at_ms,
     record.milestone_power, record.milestone_barracks]);
}

export async function getProtectionRecord(compoundId: string): Promise<ProtectionRow | undefined> {
  return mmoOne<ProtectionRow>('select * from protection_record where compound_id = $1', [compoundId]);
}

// ---------------------------------------------------------------------------
// Trade offers
// ---------------------------------------------------------------------------

export async function createTradeOffer(args: {
  offerId?: string; regionId: string; offer: BarterOffer;
}): Promise<BarterOffer> {
  const offer = parseBarterOffer(args.offer); // contract validation before persistence
  const id = args.offerId ?? offer.offerId;
  await mmoQuery(
    `insert into trade_offer (offer_id, region_id, from_player_id, to_player_id, payload, expires_at)
     values ($1,$2,$3,$4,$5,to_timestamp($6 / 1000.0))`,
    [id, args.regionId, offer.fromId, offer.toId, JSON.stringify(offer), offer.expiresAtMs]);
  return offer;
}

export async function resolveTradeOffer(offerId: string, status: 'accepted' | 'declined' | 'cancelled' | 'expired' | 'settled', operationId?: string): Promise<boolean> {
  const { rowCount } = await mmoExec(
    `update trade_offer set status = $2, resolved_at = clock_timestamp(), operation_id = coalesce($3, operation_id)
      where offer_id = $1 and status = 'open'`,
    [offerId, status, operationId ?? null]);
  return rowCount === 1;
}

// ---------------------------------------------------------------------------
// Ladder
// ---------------------------------------------------------------------------

/** Apply a signed rating delta. Idempotent via effectKey when supplied. */
export async function adjustLadder(tx: PoolClient, args: {
  playerId: string; ratingDelta: number | bigint; effectKey?: string; operationId?: string;
}): Promise<void> {
  if (args.effectKey) {
    const receipt = await tx.query(
      `insert into effect_receipt (effect_key, operation_id, kind) values ($1,$2,'ladder') on conflict do nothing returning effect_key`,
      [args.effectKey, args.operationId ?? null]);
    if (!receipt.rowCount) return;
  }
  const delta = BigInt(args.ratingDelta);
  await tx.query(
    `insert into ladder_entry (player_id, rating, peak_rating, wins, losses)
     values ($1, greatest(0, 1000 + $2), greatest(0, 1000 + $2),
             case when $2 > 0 then 1 else 0 end, case when $2 < 0 then 1 else 0 end)
     on conflict (player_id) do update
       set rating = greatest(0, ladder_entry.rating + $2),
           wins = ladder_entry.wins + case when $2 > 0 then 1 else 0 end,
           losses = ladder_entry.losses + case when $2 < 0 then 1 else 0 end,
           peak_rating = greatest(ladder_entry.peak_rating, greatest(0, ladder_entry.rating + $2)),
           updated_at = clock_timestamp()`,
    [args.playerId, delta.toString()]);
}

export async function getLadderEntry(playerId: string) {
  return mmoOne<{ rating: string; wins: string; losses: string; peak_rating: string }>(
    'select rating, wins, losses, peak_rating from ladder_entry where player_id = $1', [playerId]);
}

// ---------------------------------------------------------------------------
// Cross-region transfers
// ---------------------------------------------------------------------------

const TRANSFER_TRANSITIONS: Record<string, string[]> = {
  PREPARED: ['SOURCE_RELEASED', 'CANCELLED'],
  SOURCE_RELEASED: ['DESTINATION_ACCEPTED', 'RECOVERY_REQUIRED'],
  DESTINATION_ACCEPTED: ['COMPLETED'],
  RECOVERY_REQUIRED: ['DESTINATION_ACCEPTED', 'CANCELLED'],
  COMPLETED: [], CANCELLED: [],
};

export async function createTransfer(args: {
  transferId?: string; entityId: string; sourceRegionId: string; destRegionId: string;
  payload?: unknown; sourceEpoch?: string | bigint;
}): Promise<TransferRow> {
  const id = args.transferId ?? uuid();
  try {
    await mmoQuery(
      `insert into region_transfer (transfer_id, entity_id, source_region_id, dest_region_id, payload, source_epoch)
       values ($1,$2,$3,$4,$5,$6)`,
      [id, args.entityId, args.sourceRegionId, args.destRegionId, JSON.stringify(args.payload ?? {}), args.sourceEpoch?.toString() ?? null]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new MmoStoreError('TRANSFER_ACTIVE', 'asset already has a live transfer');
    }
    throw error;
  }
  return (await mmoOne<TransferRow>('select * from region_transfer where transfer_id = $1', [id]))!;
}

export async function transitionTransfer(transferId: string, to: TransferRow['state']): Promise<TransferRow> {
  const current = await mmoOne<TransferRow>('select * from region_transfer where transfer_id = $1 for update', [transferId]);
  if (!current) throw new MmoStoreError('NO_TRANSFER', 'unknown transfer');
  const allowed = TRANSFER_TRANSITIONS[current.state] ?? [];
  if (!allowed.includes(to)) {
    throw new MmoStoreError('BAD_TRANSITION', `cannot move transfer ${current.state} -> ${to}`);
  }
  await mmoQuery(
    `update region_transfer set state = $2, updated_at = clock_timestamp(),
       completed_at = case when $2 in ('COMPLETED','CANCELLED') then clock_timestamp() else completed_at end
     where transfer_id = $1`,
    [transferId, to]);
  return (await mmoOne<TransferRow>('select * from region_transfer where transfer_id = $1', [transferId]))!;
}

// ---------------------------------------------------------------------------
// Recovery episodes and settlements (at-most-once)
// ---------------------------------------------------------------------------

export async function openRecoveryEpisode(args: {
  episodeId?: string; playerId: string; worldId: string; regionId: string; compoundId?: string;
}): Promise<{ episodeId: string; created: boolean }> {
  const id = args.episodeId ?? uuid();
  const { rowCount } = await mmoExec(
    `insert into recovery_episode (episode_id, player_id, world_id, region_id, compound_id)
     values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [id, args.playerId, args.worldId, args.regionId, args.compoundId ?? null]);
  if (rowCount) return { episodeId: id, created: true };
  const existing = await mmoOne<{ episode_id: string }>(
    `select episode_id from recovery_episode where player_id = $1 and status = 'active'`, [args.playerId]);
  if (existing) return { episodeId: existing.episode_id, created: false };
  throw new MmoStoreError('EPISODE_CONFLICT', 'recovery episode id conflict');
}

export async function closeRecoveryEpisode(episodeId: string, status: 'completed' | 'abandoned'): Promise<void> {
  await mmoQuery(
    `update recovery_episode set status = $2, ended_at = clock_timestamp() where episode_id = $1 and status = 'active'`,
    [episodeId, status]);
}

export async function createSettlement(args: {
  settlementId?: string; playerId: string; worldId: string; regionId: string;
  faction: string; cellX: number; cellY: number;
}): Promise<{ settlementId: string; created: boolean }> {
  const id = args.settlementId ?? uuid();
  const { rowCount } = await mmoExec(
    `insert into settlement (settlement_id, player_id, world_id, region_id, faction, cell_x, cell_y)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (player_id) do nothing`,
    [id, args.playerId, args.worldId, args.regionId, args.faction, args.cellX, args.cellY]);
  if (rowCount) return { settlementId: id, created: true };
  const existing = await mmoOne<{ settlement_id: string }>('select settlement_id from settlement where player_id = $1', [args.playerId]);
  return { settlementId: existing?.settlement_id ?? id, created: false };
}

// ---------------------------------------------------------------------------
// Snapshots and scheduled jobs
// ---------------------------------------------------------------------------

export async function recordSnapshot(args: {
  snapshotId?: string; regionId: string; epoch: string | bigint; lastAppliedSeq: number | bigint;
  lastCommittedSeq: number | bigint; tick: number | bigint; engineArtifactSha256: string;
  rulesetVersion: string; format: string; payload: Buffer; payloadSha256?: string;
}): Promise<string> {
  const id = args.snapshotId ?? uuid();
  const digest = args.payloadSha256 ?? sha256(args.payload.toString('hex'));
  await mmoQuery(
    `insert into region_snapshot (snapshot_id, region_id, authority_epoch, last_applied_seq, last_committed_seq,
        tick, engine_artifact_sha256, ruleset_version, format, payload, payload_sha256)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, args.regionId, args.epoch.toString(), args.lastAppliedSeq.toString(), args.lastCommittedSeq.toString(),
     args.tick.toString(), args.engineArtifactSha256, args.rulesetVersion, args.format, args.payload, digest]);
  return id;
}

export async function latestSnapshot(regionId: string) {
  return mmoOne<{
    snapshot_id: string; authority_epoch: string; last_applied_seq: string; last_committed_seq: string;
    tick: string; engine_artifact_sha256: string; ruleset_version: string; format: string;
    payload: Buffer; payload_sha256: string;
  }>('select * from region_snapshot where region_id = $1 order by last_applied_seq desc, created_at desc limit 1', [regionId]);
}

export async function scheduleJob(args: {
  jobId?: string; regionId: string; kind: string; dueAtMs: number | bigint;
  generation?: number | bigint; payload?: unknown; dedupeKey?: string;
}): Promise<string> {
  const id = args.jobId ?? uuid();
  if (args.dedupeKey) {
    // Duplicate suppression: the same logical deadline scheduled twice resolves to
    // the one durable job, so a retried transaction cannot double-fire it.
    const existing = await mmoOne<{ job_id: string }>(
      'select job_id from scheduled_job where region_id = $1 and dedupe_key = $2',
      [args.regionId, args.dedupeKey]);
    if (existing) return existing.job_id;
  }
  await mmoQuery(
    `insert into scheduled_job (job_id, region_id, kind, due_at_ms, generation, payload, dedupe_key)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (region_id, dedupe_key) where dedupe_key is not null do nothing`,
    [id, args.regionId, args.kind, args.dueAtMs.toString(), (args.generation ?? 0).toString(),
     JSON.stringify(args.payload ?? {}), args.dedupeKey ?? null]);
  if (args.dedupeKey) {
    const row = await mmoOne<{ job_id: string }>(
      'select job_id from scheduled_job where region_id = $1 and dedupe_key = $2',
      [args.regionId, args.dedupeKey]);
    if (row) return row.job_id;
  }
  return id;
}

/**
 * Claim due jobs for a worker; claiming never applies the effect by itself.
 * When `authorityEpoch` is given the claim is fenced: only jobs in regions the
 * worker currently owns at that epoch (unexpired lease) can be claimed, so a stale
 * worker cannot even hold another owner's work.
 */
export async function claimDueJobs(args: {
  regionId?: string; workerId: string; nowMs: number | bigint; leaseMs?: number;
  limit?: number; authorityEpoch?: string | bigint;
}): Promise<{ job_id: string; kind: string; generation: string; payload: unknown; due_at_ms: string; attempts: number }[]> {
  const leaseMs = args.leaseMs ?? 30_000;
  const until = BigInt(args.nowMs) + BigInt(leaseMs);
  return mmoQuery(
    `update scheduled_job j
        set state = 'claimed', claimed_by = $2, claimed_until_ms = $3,
            attempts = attempts + 1
      where j.job_id in (
        select s.job_id from scheduled_job s
         where s.state = 'pending' and s.due_at_ms <= $1
           and ($4::uuid is null or s.region_id = $4)
           and ($6::bigint is null or exists (
             select 1 from region r
              where r.region_id = s.region_id and r.owner_worker_id = $2
                and r.authority_epoch = $6 and r.lease_expires_at > clock_timestamp()))
         order by s.due_at_ms limit $5
         for update skip locked)
      returning j.job_id, j.kind, j.generation, j.payload, j.due_at_ms, j.attempts`,
    [args.nowMs.toString(), args.workerId, until.toString(), args.regionId ?? null,
     args.limit ?? 32, args.authorityEpoch?.toString() ?? null]);
}

export async function finishJob(jobId: string, state: 'done' | 'cancelled'): Promise<void> {
  await mmoQuery(`update scheduled_job set state = $2 where job_id = $1 and state = 'claimed'`, [jobId, state]);
}

/** finishJob inside a caller's transaction (journal + effects + completion atomic). */
export async function finishJobTx(tx: PoolClient, jobId: string, state: 'done' | 'cancelled'): Promise<void> {
  await tx.query(`update scheduled_job set state = $2 where job_id = $1 and state = 'claimed'`, [jobId, state]);
}

/**
 * Return a claimed job to pending (e.g. its sim boundary has not been reached yet).
 * The claim attempt is refunded — the job was never actually applied.
 */
export async function releaseJobClaim(jobId: string): Promise<void> {
  await mmoQuery(
    `update scheduled_job set state = 'pending', claimed_by = null, claimed_until_ms = null,
        attempts = greatest(attempts - 1, 0)
      where job_id = $1 and state = 'claimed'`, [jobId]);
}

/**
 * Requeue jobs whose claim lease expired (worker crash mid-apply). Safe to run on every
 * scheduler pass; claiming alone never applies an effect.
 */
export async function reclaimExpiredJobs(args: { nowMs: number | bigint; limit?: number }): Promise<number> {
  const rows = await mmoQuery<{ job_id: string }>(
    `update scheduled_job set state = 'pending', claimed_by = null, claimed_until_ms = null
      where job_id in (
        select job_id from scheduled_job
         where state = 'claimed' and claimed_until_ms <= $1
         order by claimed_until_ms limit $2
         for update skip locked)
      returning job_id`,
    [args.nowMs.toString(), args.limit ?? 256]);
  return rows.length;
}

/** Journal events still awaiting application, in authoritative order. */
export async function listUnappliedRegionEvents(regionId: string, kinds: string[], limit = 256) {
  return mmoQuery<{
    event_seq: string; event_kind: string; payload: unknown; simulation_tick: string;
    authority_epoch: string; event_id: string;
  }>(
    `select event_seq, event_kind, payload, simulation_tick, authority_epoch, event_id
       from region_event
      where region_id = $1 and applied_at is null and event_kind = any($2)
      order by event_seq limit $3`,
    [regionId, kinds, limit]);
}

/** Record the wall-clock instant the region's sim epoch zero corresponds to. */
export async function setRegionSimStart(regionId: string, startedAtMs: number | bigint): Promise<void> {
  await mmoQuery('update region set started_at_ms = $2 where region_id = $1', [regionId, startedAtMs.toString()]);
}

/** Hand the region back to the pool: lease cleared, lifecycle quiescent. */
export async function releaseRegionLease(regionId: string, workerId: string): Promise<void> {
  await mmoQuery(
    `update region set owner_worker_id = null, lease_expires_at = null, lifecycle = 'quiescent'
      where region_id = $1 and owner_worker_id = $2`, [regionId, workerId]);
}

export async function listRegionEvents(regionId: string, afterSeq = 0, limit = 100) {
  return mmoQuery<{ event_seq: string; event_kind: string; payload: unknown; operation_id: string | null; applied_at: Date | null }>(
    `select event_seq, event_kind, payload, operation_id, applied_at from region_event
      where region_id = $1 and event_seq > $2 order by event_seq limit $3`,
    [regionId, afterSeq, limit]);
}

/** Fetch one journal event for update inside a transaction. */
export async function getRegionEventForUpdate(tx: PoolClient, regionId: string, eventSeq: string | bigint) {
  const { rows } = await tx.query<{
    event_seq: string; event_kind: string; payload: unknown; operation_id: string | null;
    applied_at: Date | null; application_result: unknown; authority_epoch: string; simulation_tick: string;
  }>(
    `select event_seq, event_kind, payload, operation_id, applied_at, application_result, authority_epoch, simulation_tick
       from region_event where region_id = $1 and event_seq = $2 for update`,
    [regionId, eventSeq.toString()]);
  return rows[0];
}

/** Mark a journal event applied exactly once; returns false if already applied. */
export async function markRegionEventApplied(tx: PoolClient, args: {
  regionId: string; eventSeq: string | bigint; result?: unknown; operationId?: string;
}): Promise<boolean> {
  const { rowCount } = await tx.query(
    `update region_event set applied_at = clock_timestamp(), application_result = $3,
       operation_id = coalesce(operation_id, $4)
      where region_id = $1 and event_seq = $2 and applied_at is null`,
    [args.regionId, args.eventSeq.toString(), args.result === undefined ? null : JSON.stringify(args.result), args.operationId ?? null]);
  return rowCount === 1;
}

// Re-export for tests that drive the whole stack through one entry point.
export { mmoTransaction };
