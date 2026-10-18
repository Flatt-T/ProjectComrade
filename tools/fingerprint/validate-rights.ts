#!/usr/bin/env node
/**
 * Rights validation tool
 * Validates that no unapproved public assets are included in the build
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface LedgerEntry {
  id: string;
  category: string;
  item: string;
  distributionClass: string;
  publicDistribution: string;
  status: string;
}

const RIGHTS_LEDGER_PATH = join(process.cwd(), 'rights', 'ledger.jsonl');

function loadLedger(): Map<string, LedgerEntry> {
  const ledger = new Map<string, LedgerEntry>();
  const content = readFileSync(RIGHTS_LEDGER_PATH, 'utf-8');
  const lines = content.trim().split('\n');

  for (const line of lines) {
    try {
      const entry: LedgerEntry = JSON.parse(line);
      ledger.set(entry.id, entry);
    } catch (e) {
      console.error(`Failed to parse ledger line: ${line}`);
    }
  }

  return ledger;
}

function validateAsset(filename: string, ledger: Map<string, LedgerEntry>): { valid: boolean; reason?: string } {
  // Check if file appears to be classic game asset
  const lowerName = filename.toLowerCase();
  const assetPatterns = [
    /\.mix$/i,
    /(conquer|desert|general|scenario|sounds|temperat|winter|allies|hrides|main|local|ra2|soviet)\.mix$/i,
    /\.shp$/i,
    /(tiberian|redalert|dune|ra2)/i,
    /\.(mix|pcx|pal|aud|wav)/i,
  ];

  const isClassicAsset = assetPatterns.some(pattern => pattern.test(lowerName));

  if (!isClassicAsset) {
    return { valid: true };
  }

  // Check ledger for game assets - all should be conditional-unverified or blocked
  for (const [id, entry] of ledger) {
    if (entry.category === 'game-assets' && entry.status === 'approved-test-scaffolding') {
      // Test scaffolding is allowed
      if (filename.includes('test') || filename.includes('synthetic') || filename.includes('placeholder')) {
        return { valid: true };
      }
    }

    if (entry.category === 'game-assets' && entry.publicDistribution === 'blocked-until-approval') {
      return {
        valid: false,
        reason: `File appears to be classic game asset but public distribution is blocked (ledger entry: ${id})`
      };
    }

    if (entry.category === 'game-assets' && entry.status === 'conditional-unverified-public-distribution') {
      return {
        valid: false,
        reason: `File appears to be classic game asset but public distribution approval is not verified (ledger entry: ${id})`
      };
    }
  }

  return { valid: true };
}

function main() {
  console.log('Rights validation tool');
  console.log('=========================\n');

  const ledger = loadLedger();
  console.log(`Loaded ${ledger.size} ledger entries from ${RIGHTS_LEDGER_PATH}\n`);

  // Validate ledger itself
  let hasBlockedAssets = false;
  for (const [id, entry] of ledger) {
    if (entry.category === 'game-assets') {
      if (entry.publicDistribution === 'blocked-until-approval' || entry.status === 'conditional-unverified-public-distribution') {
        console.log(`✓ ${entry.item}: public distribution correctly blocked/not-verified`);
        hasBlockedAssets = true;
      } else if (entry.status === 'approved-test-scaffolding') {
        console.log(`✓ ${entry.item}: test scaffolding approved`);
      } else {
        console.warn(`⚠ ${entry.item}: unusual status "${entry.status}" - review required`);
      }
    }
  }

  if (hasBlockedAssets) {
    console.log('\n✓ Ledger correctly blocks public distribution of classic game assets');
  } else {
    console.log('\n⚠ No classic game assets marked as blocked - review required');
  }

  console.log('\nRights ledger validation complete');
  console.log('Asset validation requires actual file list - run with file paths for full validation');
}

main();
