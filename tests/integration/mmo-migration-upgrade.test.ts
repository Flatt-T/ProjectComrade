import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMmoDatabase, mmoMigrate, mmoOne, mmoTransaction } from '../../apps/service/src/mmo/db.js';
import { MMO_MIGRATIONS } from '../../apps/service/src/mmo/schema.js';

const setupUrl = process.env.MMO_TEST_DATABASE_URL;
const describeDb = setupUrl ? describe : describe.skip;

describeDb('persistent-world migration restart and upgrade', () => {
  beforeAll(() => { process.env.MMO_DATABASE_URL = setupUrl; });
  afterAll(async () => { await closeMmoDatabase(); });

  it('serializes concurrent migrations from the previous beta schema', async () => {
    const previous = MMO_MIGRATIONS.slice(0, -1);
    await mmoTransaction(async tx => {
      await tx.query('drop schema if exists mmo cascade');
      await tx.query('create schema mmo');
      await tx.query('set local search_path to mmo, public');
      await tx.query(`create table schema_migrations (
        version integer primary key, name text not null, applied_at timestamptz not null default now())`);
      for (const migration of previous) {
        await tx.query(migration.sql);
        await tx.query('insert into schema_migrations (version, name) values ($1, $2)', [migration.version, migration.name]);
      }
    });
    expect(await mmoOne('select count(*)::integer as count from mmo.schema_migrations')).toEqual({ count: previous.length });

    await Promise.all([mmoMigrate(), mmoMigrate()]);
    await mmoMigrate();
    expect(await mmoOne('select count(*)::integer as count, max(version) as latest from mmo.schema_migrations'))
      .toEqual({ count: MMO_MIGRATIONS.length, latest: MMO_MIGRATIONS.at(-1)?.version });
  }, 30_000);
});
