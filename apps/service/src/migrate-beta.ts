import { Pool } from 'pg';
import { betaDeployment } from './config.js';
import { migrateBetaDatabase } from './beta-db.js';

async function run() {
  if (!betaDeployment()) throw new Error('Managed migrations require the beta deployment');
  const connectionString = process.env.COMRADE_BETA_MIGRATOR_URL;
  if (!connectionString) throw new Error('The beta migrator connection is missing');
  const target = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    await migrateBetaDatabase(target);
    console.info('Beta migration histories are current');
  } finally {
    await target.end();
  }
}

void run().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  console.error('Beta migrations failed', typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : '');
  process.exitCode = 1;
});
