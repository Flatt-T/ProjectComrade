// Persistent-world (MMO beta) Postgres access and migrations.
//
// This is deliberately a separate pool and schema from the classic `comrade` schema in
// ../db.ts: the beta database is `comrade_beta` on the shared host and the live
// `comrade` schema must never receive MMO tables. The pool only exists when
// MMO_DATABASE_URL is configured, so production deployments that do not set it behave
// exactly as before — persistent mode stays inert until the beta environment opts in.
//
// Authority model (COMRADE 13/14, journal-first per COMRADE 18 §2.2): the region
// simulation owns in-region assets; Postgres holds accounts/world membership,
// alliances, shield and power-up inventories, trade offers, the ladder,
// cross-region transfers, the region journal and snapshots. `mmo.asset_ledger` is an
// append-only audit of ownership-affecting operations — immutable causes, never a
// second writable copy of entity state.
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { MMO_MIGRATIONS } from './schema.js';

export const MMO_SCHEMA = 'mmo';

let pool: Pool | undefined;

export function mmoDatabaseConfigured(): boolean { return !!process.env.MMO_DATABASE_URL; }

export function mmoDb(): Pool {
  if (!pool) {
    const connectionString = process.env.MMO_DATABASE_URL;
    if (!connectionString) throw new Error('MMO_DATABASE_URL is not configured');
    pool = new Pool({
      connectionString,
      max: Number(process.env.MMO_DATABASE_POOL_MAX || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=(require|verify)/.test(connectionString)
        ? { rejectUnauthorized: process.env.MMO_DATABASE_SSL_VERIFY === 'true' }
        : undefined,
    });
    pool.on('connect', client => { void client.query(`set search_path to ${MMO_SCHEMA}, public`); });
  }
  return pool;
}

export async function mmoQuery<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await mmoDb().query<T>(text, values);
  return result.rows;
}

export async function mmoOne<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T | undefined> {
  return (await mmoQuery<T>(text, values))[0];
}

/** Full query result (rows + rowCount) for writes that must inspect affected rows. */
export async function mmoExec(text: string, values: unknown[] = []): Promise<QueryResult> {
  return mmoDb().query(text, values);
}

/** Run a unit of work in a transaction on the MMO pool, rolling back on any error. */
export async function mmoTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await mmoDb().connect();
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

/** Create the mmo schema if missing and apply any migrations this build is ahead on. */
export async function mmoMigrate(): Promise<void> {
  const client = await mmoDb().connect();
  try {
    await client.query(`create schema if not exists ${MMO_SCHEMA}`);
    await client.query(`set search_path to ${MMO_SCHEMA}, public`);
    await client.query(`create table if not exists schema_migrations (
      version integer primary key, name text not null, applied_at timestamptz not null default now())`);
    const { rows } = await client.query<{ version: number }>('select version from schema_migrations');
    const applied = new Set(rows.map(r => r.version));
    for (const migration of MMO_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query('insert into schema_migrations (version, name) values ($1, $2)', [migration.version, migration.name]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

/** Drop and recreate the mmo schema. Test-only helper for disposable databases. */
export async function resetMmoDatabase(): Promise<void> {
  const client = await mmoDb().connect();
  try {
    await client.query('begin');
    await client.query(`drop schema if exists ${MMO_SCHEMA} cascade`);
    await client.query(`create schema ${MMO_SCHEMA}`);
    await client.query(`set search_path to ${MMO_SCHEMA}, public`);
    await client.query(`create table schema_migrations (
      version integer primary key, name text not null, applied_at timestamptz not null default now())`);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  await mmoMigrate();
}

export async function closeMmoDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
