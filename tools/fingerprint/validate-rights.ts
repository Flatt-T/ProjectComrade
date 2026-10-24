#!/usr/bin/env node
/**
 * Rights validation tool
 * Validates that no unapproved public assets are included in the build
 */

import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';

export interface LedgerEntry {
  id: string;
  category: string;
  item: string;
  distributionClass: string;
  publicDistribution: string;
  status: string;
  licenceSnapshot?: string;
  licenceHash?: string;
  assetHashes?: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  entryId?: string;
}

const RIGHTS_LEDGER_PATH = join(process.cwd(), 'rights', 'ledger.jsonl');

export function loadLedger(): Map<string, LedgerEntry> {
  const ledger = new Map<string, LedgerEntry>();
  
  if (!existsSync(RIGHTS_LEDGER_PATH)) {
    throw new Error(`Rights ledger not found at ${RIGHTS_LEDGER_PATH}`);
  }

  const content = readFileSync(RIGHTS_LEDGER_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const seenIds = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const entry: LedgerEntry = JSON.parse(line);
      
      // Check for duplicate IDs
      if (seenIds.has(entry.id)) {
        throw new Error(`Duplicate ledger entry ID: ${entry.id}`);
      }
      seenIds.add(entry.id);
      
      ledger.set(entry.id, entry);
    } catch (e) {
      throw new Error(`Failed to parse ledger line: ${line}`);
    }
  }

  return ledger;
}

export function validateAsset(filename: string, ledger: Map<string, LedgerEntry>, fileHash?: string): ValidationResult {
  const lowerName = filename.toLowerCase();
  // The bundled TD freeware slice is an explicit, hash-scoped project decision.
  // It grants no blanket permission to retail media or other game packs.
  if (fileHash) {
    for (const [id, entry] of ledger) {
      if (entry.category === 'pinned-freeware-pack' && entry.status === 'project-authorized-pinned-freeware'
        && entry.assetHashes?.[basename(filename).toUpperCase()] === fileHash.toLowerCase()) {
        return { valid: true, entryId: id };
      }
    }
  }
  
  // Check if file appears to be classic game asset
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

  // Check if file is test scaffolding (synthetic/placeholder)
  const isTestScaffolding = lowerName.includes('test') || 
                           lowerName.includes('synthetic') || 
                           lowerName.includes('placeholder');

  if (isTestScaffolding) {
    // Test scaffolding must have a corresponding ledger entry with approved-test-scaffolding status
    for (const [, entry] of ledger) {
      if (entry.category === 'test-assets' && entry.status === 'approved-test-scaffolding') {
        return { valid: true };
      }
    }
    return { 
      valid: false, 
      reason: `File appears to be test scaffolding but no approved test-scaffolding entry found in ledger`,
      entryId: 'test-assets'
    };
  }

  // Check ledger for game assets - all should be blocked or conditional-unverified
  for (const [id, entry] of ledger) {
    if (entry.category === 'game-assets') {
      if (entry.publicDistribution === 'blocked-until-approval' || 
          entry.status === 'conditional-unverified-public-distribution' ||
          entry.status === 'blocked-public-distribution-unknown') {
        return {
          valid: false,
          reason: `File appears to be classic game asset but public distribution is blocked (ledger entry: ${id})`,
          entryId: id
        };
      }
    }
  }

  return { valid: true };
}

export function validateLedger(ledger: Map<string, LedgerEntry>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check source code entries have licence evidence
  for (const [, entry] of ledger) {
    if (entry.category === 'source-code' && (entry.item.includes('EA') || entry.item.includes('Vanilla'))) {
      if (!entry.licenceSnapshot || !entry.licenceHash) {
        errors.push(`Source code ${entry.item} (${entry.id}) missing licence evidence`);
      }
    }
  }

  // Check game assets are correctly blocked
  for (const [id, entry] of ledger) {
    if (entry.category === 'game-assets') {
      const isBlocked = entry.publicDistribution === 'blocked-until-approval' ||
                       entry.status === 'conditional-unverified-public-distribution' ||
                       entry.status === 'blocked-public-distribution-unknown';

      if (!isBlocked) {
        errors.push(`Game asset ${entry.item} (${id}) has unexpected status: ${entry.status}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validatePackageManifest(manifestPath: string, ledger: Map<string, LedgerEntry>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!existsSync(manifestPath)) {
    errors.push(`Package manifest not found at ${manifestPath}`);
    return { valid: false, errors };
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    
    // Validate each file in the manifest
    if (manifest.files && Array.isArray(manifest.files)) {
      for (const file of manifest.files) {
        const result = typeof file === 'string' ? validateAsset(file, ledger) : validateAsset(file.name, ledger, file.sha256);
        if (!result.valid) {
          errors.push(`File ${file}: ${result.reason}`);
        }
      }
    }
  } catch (e) {
    errors.push(`Failed to parse package manifest: ${e}`);
  }

  return { valid: errors.length === 0, errors };
}

function main() {
  console.log('Rights validation tool');
  console.log('=========================\n');

  try {
    const ledger = loadLedger();
    console.log(`Loaded ${ledger.size} ledger entries from ${RIGHTS_LEDGER_PATH}\n`);

    // Validate ledger structure
    const ledgerResult = validateLedger(ledger);
    if (!ledgerResult.valid) {
      console.error('Ledger validation failed:');
      for (const error of ledgerResult.errors) {
        console.error(`  ✗ ${error}`);
      }
      process.exit(1);
    }
    console.log('✓ Ledger structure validated\n');

    // Validate ledger entries
    let hasBlockedAssets = false;
    for (const [, entry] of ledger) {
      if (entry.category === 'game-assets') {
        if (entry.publicDistribution === 'blocked-until-approval' || 
            entry.status === 'conditional-unverified-public-distribution') {
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

    // Check provided file paths if any
    const filePaths = process.argv.slice(2);
    if (filePaths.length > 0) {
      console.log('\nValidating provided files:');
      let allValid = true;
      for (const filePath of filePaths) {
        if (!existsSync(filePath)) {
          console.log(`  ✗ ${filePath}: file not found`);
          allValid = false;
          continue;
        }

        const result = validateAsset(filePath, ledger, createHash('sha256').update(readFileSync(filePath)).digest('hex'));
        if (result.valid) {
          console.log(`  ✓ ${filePath}`);
        } else {
          console.log(`  ✗ ${filePath}: ${result.reason}`);
          allValid = false;
        }
      }

      if (!allValid) {
        console.log('\nAsset validation failed');
        process.exit(1);
      }
    }

    console.log('\nRights ledger validation complete');
  } catch (e) {
    console.error(`Error: ${e}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
