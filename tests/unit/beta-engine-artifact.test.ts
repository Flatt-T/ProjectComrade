import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engineFingerprint } from '../../apps/service/src/mmo/fingerprints.js';

const KNOWN_BYTES = 'd762fef75c1f348ef519cef0b81f28fed42da6189f8005534e16707d1f3221fb';
const OLD_CHECKPOINT_ENGINE = 'ef42e0e3b2405da1fa149d181c8e4496ba436c85';
let directory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) {
    await unlink(join(directory, 'engine.sha256'));
    await rmdir(directory);
  }
  directory = undefined;
});

async function packagedBeta(digest: string) {
  directory = await mkdtemp(join(tmpdir(), 'comrade-engine-test-'));
  const manifest = join(directory, 'engine.sha256');
  await writeFile(manifest, digest + '\n');
  vi.stubEnv('COMRADE_CHANNEL', 'beta');
  vi.stubEnv('COMRADE_ENGINE_ARTIFACT_PATH', manifest);
  vi.stubEnv('COMRADE_ENGINE_SHA', undefined);
  return manifest;
}

describe('packaged beta engine fingerprint', () => {
  it('retains the verified legacy identity across app-only deployments', async () => {
    await packagedBeta(KNOWN_BYTES);
    vi.stubEnv('COMRADE_COMMIT', '18f6b2a19794a31979e9640364a0dc3ee41c5dfd');
    expect(engineFingerprint()).toBe(OLD_CHECKPOINT_ENGINE);
    vi.stubEnv('COMRADE_COMMIT', 'a'.repeat(40));
    expect(engineFingerprint()).toBe(OLD_CHECKPOINT_ENGINE);
  });

  it('pins a different compiled engine to its own artifact digest', async () => {
    const other = 'a'.repeat(64);
    const manifest = await packagedBeta(other);
    expect(engineFingerprint()).toBe(other);
    await writeFile(manifest, 'invalid');
    expect(() => engineFingerprint()).toThrow('Invalid beta engine artifact fingerprint');
  });

  it('preserves the existing engine override and release identity on production', async () => {
    await packagedBeta(KNOWN_BYTES);
    vi.stubEnv('COMRADE_CHANNEL', 'production');
    vi.stubEnv('COMRADE_COMMIT', 'f'.repeat(40));
    expect(engineFingerprint()).toBe('f'.repeat(40));
    vi.stubEnv('COMRADE_ENGINE_SHA', 'e'.repeat(40));
    expect(engineFingerprint()).toBe('e'.repeat(40));
  });
});
