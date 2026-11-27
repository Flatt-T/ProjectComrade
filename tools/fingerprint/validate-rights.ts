#!/usr/bin/env node
/**
 * Rights validation tool
 * Validates that no unapproved public assets are included in the build
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const RIGHTS_LEDGER_PATH = fileURLToPath(new URL('../../rights/ledger.jsonl', import.meta.url));
type PackageMode = 'public' | 'test';

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

/** Match only the exact bytes approved for this distribution mode. */
function approvedAsset(
  filename: string, ledger: Map<string, LedgerEntry>, fileHash: string | undefined, mode: PackageMode,
): LedgerEntry | undefined {
  if (!fileHash || !/^[a-f0-9]{64}$/i.test(fileHash)) return undefined;
  const name = filename.replaceAll('\\', '/').toUpperCase();
  const hash = fileHash.toLowerCase();
  for (const entry of ledger.values()) {
    const pinned = entry.category === 'pinned-freeware-pack'
      && entry.status === 'project-authorized-pinned-freeware'
      && entry.publicDistribution === 'project-authorized-pinned-pack';
    const testFixture = mode === 'test' && entry.category === 'test-assets'
      && entry.status === 'approved-test-scaffolding';
    if ((pinned || testFixture) && (
      entry.assetHashes?.[name] === hash || entry.assetHashes?.[basename(name)] === hash
    )) return entry;
  }
  return undefined;
}

export function validateAsset(
  filename: string, ledger: Map<string, LedgerEntry>, fileHash?: string, mode: PackageMode = 'public',
): ValidationResult {
  const approval = approvedAsset(filename, ledger, fileHash, mode);
  if (approval) return { valid: true, entryId: approval.id };

  // The loose-file command accepts repository code and metadata. The package
  // command treats every declared entry as an asset regardless of its extension.
  const looksLikeAsset = /\.(mix|shp|pcx|pal|aud|wav|png|jpe?g|webp|svg|ogg|mp3|glb|gltf|woff2?|ttf)$/i.test(filename)
    || /(tiberian|redalert|dune|ra2)/i.test(filename);
  if (!looksLikeAsset) return { valid: true };

  return { valid: false, reason: 'No approved ledger hash for this asset; public distribution is blocked.' };
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

export function validatePackageManifest(
  manifestPath: string, ledger: Map<string, LedgerEntry>, mode: PackageMode = 'public',
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { files?: unknown };
    if (!Array.isArray(manifest?.files) || manifest.files.length === 0) {
      return { valid: false, errors: ['The package manifest must list its asset files.'] };
    }
    const root = realpathSync(dirname(resolve(manifestPath)));
    for (const file of manifest.files as unknown[]) {
      const declared = typeof file === 'string' ? { name: file } : file as { name?: unknown; sha256?: unknown } | null;
      const name = declared?.name;
      if (typeof name !== 'string' || !name || /[\\:]/.test(name)
          || name.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
        errors.push('The package manifest contains an invalid relative asset path.');
        continue;
      }

      try {
        const path = realpathSync(resolve(root, name));
        const fromRoot = relative(root, path);
        if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep) || !statSync(path).isFile()) {
          errors.push(`Asset ${name} is outside the package or is not a file.`);
          continue;
        }
        const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
        if (declared.sha256 !== undefined && (typeof declared.sha256 !== 'string' || declared.sha256.toLowerCase() !== hash)) {
          errors.push(`Asset ${name} does not match its manifest SHA-256.`);
          continue;
        }
        if (!approvedAsset(name, ledger, hash, mode)) errors.push(`Asset ${name} has no approved ledger hash for ${mode} packaging.`);
      } catch {
        errors.push(`Asset ${name} cannot be read.`);
      }
    }
  } catch {
    errors.push('The package manifest cannot be read as JSON.');
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
    if (filePaths[0] === '--package-manifest') {
      const [, manifest, mode] = filePaths;
      if (!manifest || filePaths.length > 3 || (mode !== undefined && mode !== 'test' && mode !== 'public')) {
        console.error('Usage: validate-rights.ts --package-manifest <file> [public|test]');
        process.exit(1);
      }
      const result = validatePackageManifest(manifest, ledger, mode);
      if (!result.valid) {
        for (const error of result.errors) console.error(error);
        process.exit(1);
      }
      console.log('Package assets verified against the rights ledger.');
      return;
    }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
