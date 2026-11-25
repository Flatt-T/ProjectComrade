import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { assertBetaDatabaseTargets, migrateBetaDatabase } from '../../apps/service/src/beta-db.js';
import { assertPlatformSchema, closeDatabase, type db } from '../../apps/service/src/db.js';
import { assertMmoSchema, closeMmoDatabase, mmoSchemaForBeta } from '../../apps/service/src/mmo/db.js';
import { MMO_MIGRATIONS } from '../../apps/service/src/mmo/schema.js';

type TestPool = ReturnType<typeof db>;
const { Pool } = createRequire(new URL('../../apps/service/package.json', import.meta.url))('pg') as {
  Pool: new (options: { connectionString: string }) => TestPool;
};
const configuredUrl = process.env.MMO_TEST_DATABASE_URL;
const testUrl = configuredUrl ? new URL(configuredUrl) : null;
const localDatabase = testUrl && ['localhost', '127.0.0.1', '[::1]'].includes(testUrl.hostname)
  && testUrl.pathname.startsWith('/comrade_mmo_');

describe.skipIf(!localDatabase)('managed beta migrations on a disposable PostgreSQL database', () => {
  it('upgrades the legacy layout with a separate role and leaves the app ready without DDL', async () => {
    const admin = new Pool({ connectionString: testUrl!.href });
    const betaUrl = new URL(testUrl!.href);
    betaUrl.pathname = '/comrade_beta';
    const roleUrl = (role: string) => {
      const url = new URL(betaUrl);
      url.searchParams.set('options', `-c role=${role}`);
      return url.href;
    };
    const previous = [process.env.COMRADE_CHANNEL, process.env.DATABASE_URL, process.env.MMO_DATABASE_URL];
    let migratorCreated = false;
    let appCreated = false;
    let databaseCreated = false;
    let migrator: TestPool | undefined;
    let runtime: TestPool | undefined;
    try {
      await admin.query('create role comrade_beta_migrator nologin');
      migratorCreated = true;
      await admin.query('create role comrade_beta_app nologin');
      appCreated = true;
      await admin.query('create database comrade_beta owner comrade_beta_migrator');
      databaseCreated = true;

      process.env.COMRADE_CHANNEL = 'beta';
      await expect(migrateBetaDatabase(admin)).rejects.toThrow('comrade_beta_migrator');
      migrator = new Pool({ connectionString: roleUrl('comrade_beta_migrator') });
      expect(await mmoSchemaForBeta(migrator)).toBe('mmo');

      const legacy = await migrator.connect();
      try {
        await legacy.query('set search_path to public');
        await legacy.query(`create table schema_migrations (
          version integer primary key, name text not null, applied_at timestamptz not null default now())`);
        for (const migration of MMO_MIGRATIONS.slice(0, -1)) {
          await legacy.query(migration.sql);
          await legacy.query('insert into schema_migrations (version, name) values ($1, $2)',
            [migration.version, migration.name]);
        }
      } finally {
        legacy.release();
      }
      expect(await mmoSchemaForBeta(migrator)).toBe('public');
      await migrateBetaDatabase(migrator);
      await migrateBetaDatabase(migrator);
      const physical = await migrator.query(
        "select to_regclass('public.region')::text as world, to_regclass('mmo.region')::text as duplicate");
      expect(physical.rows).toEqual([{ world: 'region', duplicate: null }]);

      await migrator.query('grant usage on schema comrade, public to comrade_beta_app');
      await migrator.query('grant select, insert, update, delete on all tables in schema comrade, public to comrade_beta_app');
      await migrator.query('grant usage on all sequences in schema comrade, public to comrade_beta_app');

      process.env.DATABASE_URL = roleUrl('comrade_beta_app');
      process.env.MMO_DATABASE_URL = roleUrl('comrade_beta_app');
      runtime = new Pool({ connectionString: process.env.DATABASE_URL });
      await assertBetaDatabaseTargets();
      await assertPlatformSchema();
      await assertMmoSchema();
      await expect(migrateBetaDatabase(runtime)).rejects.toThrow('comrade_beta_migrator');
      await expect(runtime.query('create table public.beta_privilege_probe (id integer)'))
        .rejects.toMatchObject({ code: '42501' });

      const latest = MMO_MIGRATIONS.at(-1)!;
      await migrator.query("update public.schema_migrations set name='unexpected migration' where version=$1",
        [latest.version]);
      await expect(assertMmoSchema()).rejects.toThrow('Unexpected public migration history');
    } finally {
      await Promise.allSettled([closeDatabase(), closeMmoDatabase(), migrator?.end(), runtime?.end()]);
      for (const [index, name] of ['COMRADE_CHANNEL', 'DATABASE_URL', 'MMO_DATABASE_URL'].entries()) {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      }
      try {
        if (databaseCreated) await admin.query('drop database comrade_beta');
        if (appCreated) await admin.query('drop role comrade_beta_app');
        if (migratorCreated) await admin.query('drop role comrade_beta_migrator');
      } finally {
        await admin.end();
      }
    }
  }, 35_000);
});
