// MMO schema migrations. Numbered, append-only — never edit a shipped version; add the
// next. Mirrors the conventions of ../db.ts (embedded SQL so it survives the container
// build, one transaction per migration).
//
// Scope per COMRADE 18 §2.2: durable records are world membership, alliances, shield
// and power-up inventories, trade offers, ladder, cross-region transfers, region
// journal and snapshots. In-region units/buildings/credits live in the Fusion sim;
// mmo.asset_ledger is the append-only audit of ownership-affecting causes.
export const MMO_MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'worlds, regions, players, alliances, compounds, inventories, journal, operations, ledger, transfers, offers, ladder, recovery, settlements',
    sql: `
    create table world (
      world_id               uuid primary key,
      ruleset_id             text not null,
      ruleset_version        integer not null check (ruleset_version > 0),
      pack_revision          text not null,
      engine_artifact_sha256 text not null,
      capabilities           jsonb not null default '{}'::jsonb,
      decisions              jsonb not null default '{}'::jsonb,
      created_at             timestamptz not null default clock_timestamp()
    );

    create table world_member (
      world_id   uuid not null references world(world_id),
      player_id  uuid not null,
      joined_at  timestamptz not null default clock_timestamp(),
      primary key (world_id, player_id)
    );

    -- Authentication identity (account_id) stays separate from the display name.
    create table player (
      player_id    uuid primary key,
      account_id   uuid not null unique,
      display_name text not null,
      created_at   timestamptz not null default clock_timestamp()
    );
    create index player_display_name_idx on player (lower(display_name));

    -- One fenced writer per region; the epoch increments on every ownership change.
    create table region (
      region_id               uuid primary key,
      world_id                uuid not null references world(world_id),
      label                   text not null default '',
      seed                    jsonb not null default '{}'::jsonb,
      authority_epoch         bigint not null default 0 check (authority_epoch >= 0),
      owner_worker_id         uuid,
      lease_expires_at        timestamptz,
      last_committed_seq      bigint not null default 0 check (last_committed_seq >= 0),
      last_committed_tick     bigint not null default 0 check (last_committed_tick >= 0),
      lifecycle               text not null default 'recovering'
        check (lifecycle in ('recovering', 'active', 'quiescent', 'failed')),
      ruleset_version         text not null,
      engine_artifact_sha256  text not null,
      created_at              timestamptz not null default clock_timestamp()
    );
    create index region_world_idx on region (world_id);

    create table alliance (
      alliance_id     uuid primary key,
      world_id        uuid not null references world(world_id),
      name            text not null,
      owner_player_id uuid not null,
      max_members     integer not null default 10 check (max_members between 1 and 50),
      created_at      timestamptz not null default clock_timestamp(),
      disbanded_at    timestamptz
    );

    create table alliance_member (
      alliance_id uuid not null references alliance(alliance_id),
      player_id   uuid not null,
      role        text not null default 'member' check (role in ('leader', 'officer', 'member')),
      joined_at   timestamptz not null default clock_timestamp(),
      left_at     timestamptz,
      primary key (alliance_id, player_id)
    );
    -- A player belongs to at most one alliance at a time.
    create unique index alliance_member_one_active on alliance_member (player_id) where left_at is null;

    -- Durable compound identity. The compound's sim state (buildings, queues) lives in
    -- the region snapshot/journal; this row only anchors who owns it and where.
    create table compound (
      compound_id uuid primary key,
      player_id   uuid not null,
      region_id   uuid not null references region(region_id),
      state       text not null default 'active'
        check (state in ('active', 'packed', 'in_transit', 'destroyed')),
      created_at  timestamptz not null default clock_timestamp(),
      updated_at  timestamptz not null default clock_timestamp()
    );
    create index compound_player_live_idx on compound (player_id) where state <> 'destroyed';

    -- Shield hours and power-ups are Postgres-authoritative inventories. The free
    -- nightly allowance and earned shields are separate rows so they can never be
    -- conflated (COMRADE 18 §3).
    create table shield_balance (
      player_id         uuid not null,
      kind              text not null check (kind in ('nightly', 'earned')),
      seconds_remaining bigint not null default 0 check (seconds_remaining >= 0),
      generation        bigint not null default 0 check (generation >= 0),
      updated_at        timestamptz not null default clock_timestamp(),
      primary key (player_id, kind)
    );

    create table powerup_balance (
      player_id uuid not null,
      kind      text not null,
      count     bigint not null default 0 check (count >= 0),
      updated_at timestamptz not null default clock_timestamp(),
      primary key (player_id, kind)
    );

    -- Durable protection record per compound, mirroring the comrade.mmo.v1 contract
    -- state machine. Times are epoch milliseconds (bigint), matching the wire counters.
    create table protection_record (
      compound_id       uuid primary key,
      player_id         uuid not null,
      kind              text not null check (kind in ('NEWCOMER', 'OFFLINE_EARNED', 'RECOVERY')),
      status            text not null check (status in ('armed', 'active', 'ended')),
      generation        bigint not null default 0 check (generation >= 0),
      armed_seconds     bigint not null default 0 check (armed_seconds >= 0),
      online_ms         bigint not null default 0 check (online_ms >= 0),
      online_since_ms   bigint check (online_since_ms >= 0),
      lapse_at_ms       bigint check (lapse_at_ms >= 0),
      started_at_ms     bigint check (started_at_ms >= 0),
      ends_at_ms        bigint check (ends_at_ms >= 0),
      milestone_power   bigint not null default 0 check (milestone_power >= 0),
      milestone_barracks bigint not null default 0 check (milestone_barracks >= 0),
      updated_at        timestamptz not null default clock_timestamp()
    );
    create index protection_player_idx on protection_record (player_id);

    -- Free-price barter offers. payload is the canonical comrade.mmo.v1 BarterOffer;
    -- acceptance is an economy_operation, never a client assertion.
    create table trade_offer (
      offer_id       uuid primary key,
      region_id      uuid not null references region(region_id),
      from_player_id uuid not null,
      to_player_id   uuid not null,
      payload        jsonb not null,
      status         text not null default 'open'
        check (status in ('open', 'accepted', 'declined', 'cancelled', 'expired', 'settled')),
      created_at     timestamptz not null default clock_timestamp(),
      expires_at     timestamptz not null,
      resolved_at    timestamptz,
      operation_id   uuid,
      check (from_player_id <> to_player_id)
    );
    create index trade_offer_inbox_idx on trade_offer (to_player_id) where status = 'open';

    create table ladder_entry (
      player_id   uuid primary key,
      rating      bigint not null default 1000 check (rating >= 0),
      wins        bigint not null default 0 check (wins >= 0),
      losses      bigint not null default 0 check (losses >= 0),
      peak_rating bigint not null default 1000 check (peak_rating >= 0),
      updated_at  timestamptz not null default clock_timestamp()
    );

    -- Cross-region asset transfer state machine. At most one live transfer may exist
    -- per stable asset identity, so two regions can never both claim it.
    create table region_transfer (
      transfer_id       uuid primary key,
      entity_id         uuid not null,
      source_region_id  uuid not null references region(region_id),
      dest_region_id    uuid not null references region(region_id),
      state             text not null default 'PREPARED' check (state in
        ('PREPARED', 'SOURCE_RELEASED', 'DESTINATION_ACCEPTED', 'COMPLETED', 'CANCELLED', 'RECOVERY_REQUIRED')),
      payload           jsonb not null default '{}'::jsonb,
      source_epoch      bigint,
      created_at        timestamptz not null default clock_timestamp(),
      updated_at        timestamptz not null default clock_timestamp(),
      completed_at      timestamptz,
      check (source_region_id <> dest_region_id)
    );
    create unique index region_transfer_one_live on region_transfer (entity_id)
      where state in ('PREPARED', 'SOURCE_RELEASED', 'DESTINATION_ACCEPTED', 'RECOVERY_REQUIRED');

    -- Every simulation-affecting input is journaled here first (journal-first). The
    -- intent row records what the client asked for; the event row is the ordered
    -- authoritative input the sim replays.
    create table command_intent (
      player_id       uuid not null,
      command_id      uuid not null,
      region_id       uuid not null references region(region_id),
      payload_sha256  text not null,
      command_kind    text not null,
      request         jsonb not null,
      status          text not null default 'received' check (status in
        ('received', 'accepted', 'committed_pending_application', 'applied', 'rejected')),
      result          jsonb,
      created_at      timestamptz not null default clock_timestamp(),
      updated_at      timestamptz not null default clock_timestamp(),
      primary key (player_id, command_id)
    );

    -- The durable cause of every committed world operation. Retries deduplicate on
    -- operation_id and must present the identical canonical action.
    create table economy_operation (
      operation_id          uuid primary key,
      region_id             uuid not null references region(region_id),
      authority_epoch       bigint not null check (authority_epoch > 0),
      simulation_tick       bigint not null check (simulation_tick >= 0),
      kind                  text not null check (kind in
        ('SELL_REFUND', 'PACK', 'UNPACK', 'DEPLOY', 'BARTER', 'SELECT_PROTECTION',
         'SHIELD_CONSUME', 'NEWCOMER_SPAWN', 'RECOVERY_GRANT', 'RECOVERY_TRANSITION',
         'SALVAGE_SPAWN', 'SITE_CAPTURE', 'LADDER_AWARD', 'DEFEAT')),
      canonical_action      jsonb not null,
      authoritative_result  jsonb,
      committed_at          timestamptz not null default clock_timestamp(),
      runner_applied_at     timestamptz,
      applied_result        jsonb
    );
    create index economy_operation_region_idx on economy_operation (region_id, committed_at);

    -- Append-only ownership ledger: one row per asset touched by an operation. This is
    -- the audit trail that makes a sale a destruction, a pack a form change and a
    -- barter an ownership change distinguishable forever.
    create table asset_ledger (
      ledger_id        bigserial primary key,
      operation_id     uuid not null references economy_operation(operation_id),
      entity_id        uuid not null,
      region_id        uuid not null references region(region_id),
      kind             text not null check (kind in
        ('SELL_REFUND', 'PACK', 'UNPACK', 'DEPLOY', 'BARTER', 'DESTROY', 'SPAWN',
         'TRANSFER_OUT', 'TRANSFER_IN', 'SALVAGE')),
      from_owner       uuid,
      to_owner         uuid,
      physical_state   text not null check (physical_state in
        ('deployed', 'packed', 'cargo', 'in_transit', 'destroyed', 'salvaged')),
      engine_entity_key text,
      detail           jsonb not null default '{}'::jsonb,
      created_at       timestamptz not null default clock_timestamp()
    );
    -- An operation records each asset at most once per kind: retries cannot duplicate.
    create unique index asset_ledger_once on asset_ledger (operation_id, entity_id, kind);
    create index asset_ledger_entity_idx on asset_ledger (entity_id, ledger_id);

    -- The ordered region journal. (region_id, event_seq) is the durable tail; the sim's
    -- last applied position is tracked separately on snapshots.
    create table region_event (
      region_id        uuid not null references region(region_id),
      event_seq        bigint not null check (event_seq > 0),
      authority_epoch  bigint not null check (authority_epoch > 0),
      simulation_tick  bigint not null check (simulation_tick >= 0),
      event_id         uuid not null unique,
      event_kind       text not null check (event_kind in
        ('command', 'scheduled', 'protection', 'operation', 'transfer', 'world')),
      operation_id     uuid,
      payload          jsonb not null,
      created_at       timestamptz not null default clock_timestamp(),
      primary key (region_id, event_seq)
    );
    create index region_event_kind_idx on region_event (region_id, event_kind, event_seq);

    -- Recovery snapshots. last_applied_seq is what the snapshot bytes actually
    -- represent; last_committed_seq is the durable journal tail at capture time. They
    -- are deliberately distinct (COMRADE 14 §6).
    create table region_snapshot (
      snapshot_id            uuid primary key,
      region_id              uuid not null references region(region_id),
      authority_epoch        bigint not null check (authority_epoch > 0),
      last_applied_seq       bigint not null check (last_applied_seq >= 0),
      last_committed_seq     bigint not null check (last_committed_seq >= last_applied_seq),
      tick                   bigint not null check (tick >= 0),
      engine_artifact_sha256 text not null,
      ruleset_version        text not null,
      format                 text not null,
      payload                bytea not null,
      payload_sha256         text not null,
      created_at             timestamptz not null default clock_timestamp()
    );
    create index region_snapshot_region_idx on region_snapshot (region_id, last_applied_seq desc);

    -- Transactional outbox: written in the same transaction as its source event.
    create table outbox (
      outbox_id     bigserial primary key,
      event_id      uuid not null unique,
      region_id     uuid not null,
      event_seq     bigint not null,
      topic         text not null,
      payload       jsonb not null,
      available_at  timestamptz not null default clock_timestamp(),
      lease_owner   uuid,
      lease_until   timestamptz,
      attempts      integer not null default 0 check (attempts >= 0),
      delivered_at  timestamptz,
      foreign key (region_id, event_seq) references region_event(region_id, event_seq)
    );
    create index outbox_pending_idx on outbox (available_at, outbox_id) where delivered_at is null;

    -- Durable scheduled jobs (shield expiry, build completion, transfer arrival). A
    -- claimed row routes to region authority; claiming alone applies nothing.
    create table scheduled_job (
      job_id           uuid primary key,
      region_id        uuid not null references region(region_id),
      kind             text not null,
      due_at_ms        bigint not null check (due_at_ms >= 0),
      generation       bigint not null default 0 check (generation >= 0),
      payload          jsonb not null default '{}'::jsonb,
      state            text not null default 'pending' check (state in ('pending', 'claimed', 'done', 'cancelled')),
      claimed_by       uuid,
      claimed_until_ms bigint,
      created_at       timestamptz not null default clock_timestamp()
    );
    create index scheduled_job_due_idx on scheduled_job (region_id, due_at_ms) where state = 'pending';

    -- At most one live recovery episode per player; the MCV grant is bound and is
    -- never re-issued while an episode is active (COMRADE 18 §3 anti-abuse).
    create table recovery_episode (
      episode_id              uuid primary key,
      player_id               uuid not null,
      world_id                uuid not null references world(world_id),
      region_id               uuid not null references region(region_id),
      compound_id             uuid,
      status                  text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
      mcv_granted_operation   uuid,
      created_at              timestamptz not null default clock_timestamp(),
      ended_at                timestamptz
    );
    create unique index recovery_episode_one_active on recovery_episode (player_id) where status = 'active';

    -- Newcomer settlement: at most one per player, ever.
    create table settlement (
      settlement_id uuid primary key,
      player_id     uuid not null unique,
      world_id      uuid not null references world(world_id),
      region_id     uuid not null references region(region_id),
      faction       text not null,
      cell_x        integer not null,
      cell_y        integer not null,
      created_at    timestamptz not null default clock_timestamp()
    );

    -- Idempotency receipts for Postgres-authoritative grants (shield hours, ladder
    -- adjustments outside a region operation, recovery MCVs). A retried transaction
    -- presents the same effect_key and changes nothing.
    create table effect_receipt (
      effect_key    text primary key,
      operation_id  uuid,
      kind          text not null,
      created_at    timestamptz not null default clock_timestamp()
    );
    `,
  },
  {
    version: 2,
    name: 'journal application receipts',
    sql: `
    -- Journal-first application tracking (PW06): a committed input is marked applied
    -- exactly once, with its authoritative result, in the same transaction as any
    -- PostgreSQL-side effects. Replays see applied_at and change nothing.
    alter table region_event
      add column applied_at timestamptz,
      add column application_result jsonb;
    create index region_event_unapplied_idx on region_event (region_id, event_seq)
      where applied_at is null;
    `,
  },
  {
    version: 3,
    name: 'region scheduler durability',
    sql: `
    -- PW07: durable offline scheduling. started_at_ms anchors wall-clock to sim ticks
    -- so a restarted region can reconstruct due work without a browser. Job attempts,
    -- last error and an optional dedupe key give claiming/retry/duplicate suppression.
    alter table region add column started_at_ms bigint;
    -- PW07 lifecycle adds checkpointing/inactive alongside the PW05 set.
    alter table region drop constraint region_lifecycle_check;
    alter table region add constraint region_lifecycle_check
      check (lifecycle in ('recovering', 'active', 'quiescent', 'checkpointing', 'inactive', 'failed'));
    alter table scheduled_job
      add column attempts integer not null default 0 check (attempts >= 0),
      add column last_error text,
      add column dedupe_key text;
    create unique index scheduled_job_dedupe_idx on scheduled_job (region_id, dedupe_key)
      where dedupe_key is not null;
    `,
  },
  {
    version: 4,
    name: 'quiescent accrual journal kind',
    sql: `
    -- PW22: hibernation wake applies the quiescent interval (capped harvest accrual
    -- plus arithmetic queue completion) as one journaled 'accrual' event, so the
    -- advance is exactly-once across crash and replay like every other input.
    alter table region_event drop constraint region_event_event_kind_check;
    alter table region_event add constraint region_event_event_kind_check
      check (event_kind in
        ('command', 'scheduled', 'protection', 'operation', 'transfer', 'accrual', 'world'));
    `,
  },
];
