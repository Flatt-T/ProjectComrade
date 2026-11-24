import { publicUrl } from './config.js';
import { databaseConfigured, db } from './db.js';
import { mmoDatabaseConfigured, mmoDb } from './mmo/db.js';

const BETA_URL = 'https://beta.projectcomrade.co.uk';
const BETA_DATABASE = 'comrade_beta';
const BETA_ROLE = 'comrade_beta_app';

export async function assertBetaDatabaseTargets(): Promise<void> {
  if (process.env.COMRADE_CHANNEL !== 'beta' && publicUrl() !== BETA_URL) return;
  if (!databaseConfigured() || !mmoDatabaseConfigured()) {
    throw new Error('Beta requires both platform and persistent world database connections');
  }

  const identity = 'select current_database() as database, current_user as role';
  const results = await Promise.all([
    db().query<{ database: string; role: string }>(identity),
    mmoDb().query<{ database: string; role: string }>(identity),
  ]);
  for (const [index, result] of results.entries()) {
    const target = result.rows[0];
    if (target?.database !== BETA_DATABASE || target.role !== BETA_ROLE) {
      const label = index === 0 ? 'Platform' : 'Persistent world';
      throw new Error(`${label} database must use ${BETA_DATABASE} as ${BETA_ROLE} on beta`);
    }
  }
}
