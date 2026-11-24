import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { createHash } from 'crypto';
import { loadLedger, validateLedger, validateAsset, validatePackageManifest } from '../../tools/fingerprint/validate-rights';

describe('Rights validation', () => {
  it('should load ledger without errors', () => {
    const ledger = loadLedger();
    expect(ledger.size).toBeGreaterThan(0);
  });

  it('should validate ledger structure', () => {
    const ledger = loadLedger();
    const result = validateLedger(ledger);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject ledger entries with unverified public distribution', () => {
    const ledger = loadLedger();

    for (const [, entry] of ledger) {
      if (entry.category === 'game-assets') {
        // Game assets should be blocked or conditional-unverified
        const isBlocked = entry.publicDistribution === 'blocked-until-approval' ||
                         entry.status === 'conditional-unverified-public-distribution' ||
                         entry.status === 'blocked-public-distribution-unknown';

        expect(isBlocked).toBe(true);
      }
    }
  });

  it('should validate that source code has licence evidence', () => {
    const ledger = loadLedger();

    for (const [, entry] of ledger) {
      if (entry.category === 'source-code' && (entry.item.includes('EA') || entry.item.includes('Vanilla'))) {
        expect(entry.licenceSnapshot).toBeDefined();
        expect(entry.licenceHash).toBeDefined();
        
        // Verify licence snapshot file exists
        const snapshotPath = join(process.cwd(), entry.licenceSnapshot!);
        expect(existsSync(snapshotPath)).toBe(true);
      }
    }
  });

  it('should recompute and verify licence snapshot hashes', () => {
    const ledger = loadLedger();

    for (const [, entry] of ledger) {
      if (entry.licenceSnapshot && entry.licenceHash) {
        const snapshotPath = join(process.cwd(), entry.licenceSnapshot);
        
        // Skip if snapshot file doesn't exist (e.g., "not-available" placeholders)
        if (!existsSync(snapshotPath)) {
          continue;
        }
        
        const content = readFileSync(snapshotPath, 'utf-8');
        const hash = createHash('sha256');
        hash.update(content);
        const computedHash = hash.digest('hex').toUpperCase();
        
        expect(computedHash).toBe(entry.licenceHash);
      }
    }
  });

  it('should reject classic asset files by default', () => {
    const ledger = loadLedger();
    
    // Test a classic asset pattern
    const result = validateAsset('CONQUER.MIX', ledger);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('public distribution is blocked');
  });

  it('allows only exact hashes from the explicitly bundled freeware pack', () => {
    const ledger = loadLedger();
    const pack = ledger.get('ledger-017')!;
    const hash = pack.assetHashes!['CONQUER.MIX'];
    expect(validateAsset('CONQUER.MIX', ledger, hash).valid).toBe(true);
    expect(validateAsset('CONQUER.MIX', ledger, '0'.repeat(64)).valid).toBe(false);
    expect(validateAsset('unknown.mix', ledger, hash).valid).toBe(false);
  });

  it('should allow non-asset files', () => {
    const ledger = loadLedger();
    
    const result = validateAsset('package.json', ledger);
    expect(result.valid).toBe(true);
  });

  it('allows exact original fixture bytes in a test bundle and refuses them in a public bundle', () => {
    const root = mkdtempSync(join(tmpdir(), 'comrade-package-'));
    const ledger = loadLedger();
    const manifest = join(root, 'package.json');
    const fixture = 'test-synthetic-asset.mix';
    const fixtureHash = ledger.get('ledger-016')!.assetHashes!['TEST-SYNTHETIC-ASSET.MIX'];
    const contents = 'Project Comrade original packaging fixture v1';
    try {
      writeFileSync(join(root, fixture), contents);
      writeFileSync(manifest, JSON.stringify({ files: [{ name: fixture, sha256: fixtureHash }] }));
      expect(validatePackageManifest(manifest, ledger, 'test')).toEqual({ valid: true, errors: [] });
      expect(validatePackageManifest(manifest, ledger).valid).toBe(false);

      writeFileSync(join(root, fixture), 'Unreviewed asset bytes');
      expect(validatePackageManifest(manifest, ledger, 'test').errors).toEqual([
        `Asset ${fixture} does not match its manifest SHA-256.`,
      ]);

      const unreviewed = 'test-placeholder.texture';
      writeFileSync(join(root, fixture), contents);
      writeFileSync(join(root, unreviewed), contents);
      writeFileSync(manifest, JSON.stringify({ files: [fixture, unreviewed] }));
      expect(validatePackageManifest(manifest, ledger, 'test').errors).toEqual([
        `Asset ${unreviewed} has no approved ledger hash for test packaging.`,
      ]);
      expect(validateAsset('test-placeholder.mix', ledger, fixtureHash, 'test').valid).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
