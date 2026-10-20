import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { loadLedger, validateLedger, validateAsset } from '../../tools/fingerprint/validate-rights';

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

  it('should allow approved test scaffolding files', () => {
    const ledger = loadLedger();
    
    // Test a file that would be approved as test scaffolding
    const result = validateAsset('test-synthetic-asset.mix', ledger);
    expect(result.valid).toBe(true);
  });
});
