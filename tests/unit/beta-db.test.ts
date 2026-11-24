import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformQuery = vi.hoisted(() => vi.fn());
const worldQuery = vi.hoisted(() => vi.fn());
vi.mock('../../apps/service/src/db.js', () => ({
  databaseConfigured: () => Boolean(process.env.DATABASE_URL),
  db: () => ({ query: platformQuery }),
}));
vi.mock('../../apps/service/src/mmo/db.js', () => ({
  mmoDatabaseConfigured: () => Boolean(process.env.MMO_DATABASE_URL),
  mmoDb: () => ({ query: worldQuery }),
}));

import { assertBetaDatabaseTargets } from '../../apps/service/src/beta-db.js';

const identity = { rows: [{ database: 'comrade_beta', role: 'comrade_beta_app' }] };

describe('beta PostgreSQL identity', () => {
  beforeEach(() => {
    vi.stubEnv('COMRADE_CHANNEL', 'beta');
    vi.stubEnv('COMRADE_PUBLIC_URL', 'https://beta.projectcomrade.co.uk');
    vi.stubEnv('DATABASE_URL', 'platform-test');
    vi.stubEnv('MMO_DATABASE_URL', 'mmo-test');
    platformQuery.mockReset().mockResolvedValue(identity);
    worldQuery.mockReset().mockResolvedValue(identity);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('checks the database and role returned by both connections', async () => {
    await expect(assertBetaDatabaseTargets()).resolves.toBeUndefined();
    const sql = 'select current_database() as database, current_user as role';
    expect(platformQuery).toHaveBeenCalledExactlyOnceWith(sql);
    expect(worldQuery).toHaveBeenCalledExactlyOnceWith(sql);
  });

  it('rejects a production database when the canonical origin selects beta', async () => {
    vi.stubEnv('COMRADE_CHANNEL', 'production');
    platformQuery.mockResolvedValue({ rows: [{ database: 'comrade', role: 'comrade_beta_app' }] });
    await expect(assertBetaDatabaseTargets()).rejects.toThrow('Platform database must use comrade_beta');
  });

  it('rejects a production role as soon as the beta channel is set', async () => {
    vi.stubEnv('COMRADE_PUBLIC_URL', 'https://projectcomrade.co.uk');
    worldQuery.mockResolvedValue({ rows: [{ database: 'comrade_beta', role: 'comrade_app' }] });
    await expect(assertBetaDatabaseTargets()).rejects.toThrow('Persistent world database must use comrade_beta');
  });

  it('rejects a missing database connection on beta', async () => {
    vi.stubEnv('MMO_DATABASE_URL', '');
    await expect(assertBetaDatabaseTargets()).rejects.toThrow('Beta requires both');
    expect(worldQuery).not.toHaveBeenCalled();
    expect(platformQuery).not.toHaveBeenCalled();
  });

  it('leaves production and local database selection alone', async () => {
    vi.stubEnv('COMRADE_CHANNEL', 'production');
    vi.stubEnv('COMRADE_PUBLIC_URL', 'https://projectcomrade.co.uk');
    await expect(assertBetaDatabaseTargets()).resolves.toBeUndefined();
    expect(worldQuery).not.toHaveBeenCalled();
    expect(platformQuery).not.toHaveBeenCalled();
  });
});
