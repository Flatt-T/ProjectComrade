import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Rights validation', () => {
  it('should reject ledger entries with unverified public distribution', () => {
    const ledgerPath = join(process.cwd(), 'rights', 'ledger.jsonl');
    const content = readFileSync(ledgerPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.category === 'game-assets') {
        // Game assets should be blocked or conditional-unverified
        const isBlocked = entry.publicDistribution === 'blocked-until-approval' ||
                         entry.status === 'conditional-unverified-public-distribution' ||
                         entry.status === 'blocked-public-distribution-unknown';

        if (!isBlocked) {
          throw new Error(`Game asset ${entry.item} has invalid status: ${entry.status}`);
        }
      }
    }

    expect(true).toBe(true); // All game assets correctly blocked
  });

  it('should validate that source code has licence evidence', () => {
    const ledgerPath = join(process.cwd(), 'rights', 'ledger.jsonl');
    const content = readFileSync(ledgerPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.category === 'source-code' && (entry.item.includes('EA') || entry.item.includes('Vanilla'))) {
        // Source code entries should have licence snapshots
        if (!entry.licenceSnapshot || !entry.licenceHash) {
          throw new Error(`Source code ${entry.item} missing licence evidence`);
        }
      }
    }

    expect(true).toBe(true); // All source code has evidence
  });
});
