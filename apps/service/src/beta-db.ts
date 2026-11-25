import type { Pool } from 'pg';
import { betaDeployment } from './config.js';
import { databaseConfigured, db, migrate } from './db.js';
import { mmoDatabaseConfigured, mmoDb, mmoMigrate, mmoSchemaForBeta } from './mmo/db.js';

const BETA_DATABASE = 'comrade_beta';
const BETA_ROLE = 'comrade_beta_app';
const MIGRATOR_ROLE = 'comrade_beta_migrator';
const IDENTITY = 'select current_database() as database, current_user as role';
type DatabaseIdentity = { database: string; role: string };

export async function assertBetaDatabaseTargets(): Promise<void> {
  if (!betaDeployment()) return;
  if (!databaseConfigured() || !mmoDatabaseConfigured()) {
    throw new Error('Beta requires both platform and persistent world database connections');
  }

  const results = await Promise.all([
    db().query<DatabaseIdentity>(IDENTITY),
    mmoDb().query<DatabaseIdentity>(IDENTITY),
  ]);
  for (const [index, result] of results.entries()) {
    const target = result.rows[0];
    if (target?.database !== BETA_DATABASE || target.role !== BETA_ROLE) {
      const label = index === 0 ? 'Platform' : 'Persistent world';
      throw new Error(`${label} database must use ${BETA_DATABASE} as ${BETA_ROLE} on beta`);
    }
  }
}

/** Deployment-only migration path. Runtime credentials cannot satisfy the target check. */
export async function migrateBetaDatabase(target: Pool): Promise<void> {
  if (!betaDeployment()) throw new Error('Managed migrations require the beta deployment');
  const { rows } = await target.query<DatabaseIdentity>(IDENTITY);
  const identity = rows[0];
  if (identity?.database !== BETA_DATABASE || identity.role !== MIGRATOR_ROLE) {
    throw new Error('Beta migrations require comrade_beta as comrade_beta_migrator');
  }
  const worldSchema = await mmoSchemaForBeta(target);
  await migrate(target);
  await mmoMigrate(target, worldSchema);
}
