import type { Pool, PoolClient } from 'pg';

/** Serialize migrations for this schema while keeping each migration transactional. */
export async function withMigrationLock(
  pool: Pool, schema: string, migrate: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('projectcomrade'), hashtext($1))", [schema]);
    await migrate(client);
  } finally {
    // Close the session so the lock is released even after a connection or SQL error.
    client.release(true);
  }
}

/** Runtime startup reads the schema history without requiring DDL privileges. */
export async function assertSchemaHistory(
  pool: Pool, schema: 'comrade' | 'mmo' | 'public',
  expected: readonly { version: number; name: string }[],
): Promise<void> {
  const { rows } = await pool.query<{ version: number; name: string }>(
    `select version, name from ${schema}.schema_migrations order by version`);
  if (rows.length !== expected.length || rows.some((row, i) =>
    row.version !== expected[i].version || row.name !== expected[i].name)) {
    throw new Error(`Unexpected ${schema} migration history for this release`);
  }
}
