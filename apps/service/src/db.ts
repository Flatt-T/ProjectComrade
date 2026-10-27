// Postgres access and schema migrations.
//
// The cluster's shared Postgres (postgres-core-01) hosts other services, so everything here
// lives in its own `comrade` schema and the pool sets `search_path` on every new connection.
// Migrations are embedded rather than read from disk: the published container copies only
// compiled JavaScript, so a .sql file would not survive the build.
//
// Without DATABASE_URL the service runs exactly as it did before billing existed: open,
// unmetered, no accounts. That keeps the live site working while the database, Cognito pool
// and Stripe products are being provisioned, and makes the rollout reversible.
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { log } from './ops.js';

export const SCHEMA = 'comrade';

let pool: Pool | undefined;

export function databaseConfigured(): boolean { return !!process.env.DATABASE_URL; }

export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // The cluster Postgres presents its own certificate; verification is opt-in so a
      // self-signed internal CA does not stop the service from starting.
      ssl: /sslmode=(require|verify)/.test(connectionString)
        ? { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY === 'true' }
        : undefined,
    });
    pool.on('error', error => log('db-error', { message: String(error).slice(0, 200) }));
    pool.on('connect', client => { void client.query(`set search_path to ${SCHEMA}, public`); });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await db().query<T>(text, values);
  return result.rows;
}

export async function one<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, values))[0];
}

/** Run a unit of work in a transaction, rolling back on any error. */
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try { await client.query('rollback'); } catch { /* the connection is going away anyway */ }
    throw error;
  } finally {
    client.release();
  }
}

/** Numbered, append-only schema steps. Never edit one that has shipped; add the next. */
const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'accounts, subscriptions, plays, matches, consent, votes, releases',
    sql: `
    create table accounts (
      id              uuid primary key default gen_random_uuid(),
      cognito_sub     text unique,
      handle          text not null,
      email           text not null,
      pending_email   text,
      email_verified  boolean not null default false,
      display_name    text,
      country         char(2),
      favourite_faction text,
      avatar          bytea,
      avatar_type     text,
      avatar_version  integer not null default 0,
      -- The allowance clock is anchored to registration, not midnight. Plays renew every 24 hours.
      week_anchor     timestamptz not null default now(),
      stripe_customer_id text unique,
      status          text not null default 'pending',
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      deleted_at      timestamptz,
      constraint accounts_status_check check (status in ('pending', 'active', 'deleted'))
    );
    -- Handles and emails are claimed case-insensitively, and only by live accounts, so a
    -- deleted account releases its callsign.
    create unique index accounts_handle_key on accounts (lower(handle)) where status <> 'deleted';
    create unique index accounts_email_key on accounts (lower(email)) where status <> 'deleted';

    create table account_events (
      id          bigserial primary key,
      account_id  uuid references accounts(id) on delete cascade,
      event       text not null,
      detail      jsonb not null default '{}'::jsonb,
      created_at  timestamptz not null default now()
    );
    create index account_events_account_idx on account_events (account_id, created_at desc);

    create table consents (
      account_id        uuid primary key references accounts(id) on delete cascade,
      terms             boolean not null default false,
      terms_version     text,
      personalised_ads  boolean not null default false,
      marketing_email   boolean not null default false,
      updated_at        timestamptz not null default now()
    );

    create table subscriptions (
      id                    text primary key,
      account_id            uuid not null references accounts(id) on delete cascade,
      tier                  text not null,
      status                text not null,
      price_id              text,
      lookup_key            text,
      unit_amount           integer,
      currency              text,
      current_period_end    timestamptz,
      cancel_at_period_end  boolean not null default false,
      pending_tier          text,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now()
    );
    create index subscriptions_account_idx on subscriptions (account_id, updated_at desc);

    -- Every Stripe event id we have already applied, so a redelivery changes nothing.
    create table stripe_events (
      id          text primary key,
      type        text not null,
      received_at timestamptz not null default now()
    );

    -- Unregistered visitors get a small device-bound allowance; this anchors their window.
    create table guests (
      id          text primary key,
      first_seen  timestamptz not null default now(),
      last_seen   timestamptz not null default now()
    );

    create table matches (
      id              uuid primary key default gen_random_uuid(),
      style           text not null,
      map             text not null,
      map_name        text not null,
      room            text,
      multiplayer     boolean not null default false,
      started_at      timestamptz not null,
      ended_at        timestamptz,
      duration_seconds integer,
      created_at      timestamptz not null default now()
    );
    create index matches_started_idx on matches (started_at desc);

    create table match_participants (
      match_id          uuid not null references matches(id) on delete cascade,
      slot              integer not null,
      account_id        uuid references accounts(id) on delete set null,
      name              text not null,
      faction           text not null,
      team              integer not null default 0,
      outcome           text,
      score             integer not null default 0,
      credits           integer not null default 0,
      harvested         integer not null default 0,
      spent             integer not null default 0,
      units_lost        integer not null default 0,
      units_killed      integer not null default 0,
      buildings_lost    integer not null default 0,
      buildings_killed  integer not null default 0,
      ai                boolean not null default false,
      -- Issued at kick-off and known only to that player's client, so a result can only ever
      -- be reported for the slot it was issued for — guests included.
      report_token      text,
      primary key (match_id, slot)
    );
    create index match_participants_account_idx on match_participants (account_id);
    create index match_participants_token_idx on match_participants (report_token);

    -- One row per play spent. Counting rows in the current window is the whole quota check.
    create table play_ledger (
      id          bigserial primary key,
      account_id  uuid references accounts(id) on delete cascade,
      guest_id    text references guests(id) on delete cascade,
      kind        text not null,
      tier        text not null,
      style       text not null,
      map         text,
      room        text,
      match_id    uuid references matches(id) on delete set null,
      created_at  timestamptz not null default now(),
      constraint play_ledger_subject_check check (account_id is not null or guest_id is not null),
      constraint play_ledger_kind_check check (kind in ('classic', 'fusion'))
    );
    create index play_ledger_account_idx on play_ledger (account_id, kind, created_at desc);
    create index play_ledger_guest_idx on play_ledger (guest_id, kind, created_at desc);

    create table ad_impressions (
      id          bigserial primary key,
      account_id  uuid references accounts(id) on delete set null,
      guest_id    text,
      token       text not null,
      provider    text,
      filled      boolean not null default false,
      seconds     integer not null default 0,
      created_at  timestamptz not null default now()
    );
    create index ad_impressions_created_idx on ad_impressions (created_at desc);

    create table proposals (
      id          text primary key,
      kind        text not null,
      title       text not null,
      summary     text not null default '',
      status      text not null default 'open',
      closes_at   timestamptz,
      issue_url   text,
      created_at  timestamptz not null default now()
    );

    create table proposal_votes (
      proposal_id text not null references proposals(id) on delete cascade,
      account_id  uuid not null references accounts(id) on delete cascade,
      value       smallint not null,
      created_at  timestamptz not null default now(),
      primary key (proposal_id, account_id),
      constraint proposal_votes_value_check check (value in (1, -1))
    );
    create index proposal_votes_account_idx on proposal_votes (account_id, created_at desc);

    -- Drives Gold early access: an item is Gold-only until published_at + the window.
    create table content_releases (
      id            text primary key,
      kind          text not null,
      published_at  timestamptz not null,
      created_at    timestamptz not null default now(),
      constraint content_releases_kind_check check (kind in ('map', 'pack', 'fusion'))
    );
    `,
  },
  {
    version: 2,
    name: 'bonus credits, advertisement earn sessions, pack lots',
    sql: `
    -- Extra matches earned by watching an advertisement or buying the battle pack.
    -- Counting unspent rows is the bonus; the daily allowance still counts play_ledger.
    create table credit_lots (
      lot_key     text primary key,
      account_id  uuid references accounts(id) on delete cascade,
      guest_id    text references guests(id) on delete cascade,
      source      text not null,
      created_at  timestamptz not null default now(),
      constraint credit_lots_subject_check check (account_id is not null or guest_id is not null),
      constraint credit_lots_source_check check (source in ('ad', 'pack'))
    );
    create index credit_lots_account_idx on credit_lots (account_id, created_at desc);
    create index credit_lots_guest_idx on credit_lots (guest_id, created_at desc);

    create table play_credits (
      id          uuid primary key default gen_random_uuid(),
      lot_key     text not null references credit_lots(lot_key) on delete cascade,
      account_id  uuid references accounts(id) on delete cascade,
      guest_id    text references guests(id) on delete cascade,
      kind        text not null,
      created_at  timestamptz not null default now(),
      spent_at    timestamptz,
      constraint play_credits_subject_check check (account_id is not null or guest_id is not null),
      constraint play_credits_kind_check check (kind in ('classic', 'fusion'))
    );
    create index play_credits_account_open_idx on play_credits (account_id, kind) where spent_at is null;
    create index play_credits_guest_open_idx on play_credits (guest_id, kind) where spent_at is null;
    create index play_credits_ad_cap_idx on play_credits (account_id, kind, created_at) where account_id is not null;
    create index play_credits_guest_cap_idx on play_credits (guest_id, kind, created_at) where guest_id is not null;

    create table ad_credit_sessions (
      token         text primary key,
      account_id    uuid references accounts(id) on delete cascade,
      guest_id      text,
      kind          text not null,
      seconds       integer not null,
      issued_at     timestamptz not null default now(),
      completed_at  timestamptz,
      constraint ad_credit_sessions_kind_check check (kind in ('classic', 'fusion'))
    );
    create index ad_credit_sessions_open_account_idx on ad_credit_sessions (account_id, kind) where completed_at is null;
    create index ad_credit_sessions_open_guest_idx on ad_credit_sessions (guest_id, kind) where completed_at is null;

    alter table play_ledger add column source text not null default 'allowance';
    alter table play_ledger add column credit_id uuid references play_credits(id) on delete set null;
    alter table play_ledger add constraint play_ledger_source_check check (source in ('allowance', 'bonus'));
    `,
  },
];

/** Create the schema if missing and apply any migrations this build is ahead on. */
export async function migrate(): Promise<void> {
  const client = await db().connect();
  try {
    await client.query(`create schema if not exists ${SCHEMA}`);
    await client.query(`set search_path to ${SCHEMA}, public`);
    await client.query(`create table if not exists schema_migrations (
      version integer primary key, name text not null, applied_at timestamptz not null default now())`);
    const { rows } = await client.query<{ version: number }>('select version from schema_migrations');
    const applied = new Set(rows.map(r => r.version));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      // One transaction per migration: a failure leaves the schema exactly as it was.
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query('insert into schema_migrations (version, name) values ($1, $2)', [migration.version, migration.name]);
        await client.query('commit');
        log('db-migrated', { version: migration.version, name: migration.name });
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
