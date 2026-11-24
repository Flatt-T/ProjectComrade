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
