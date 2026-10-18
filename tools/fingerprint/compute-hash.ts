#!/usr/bin/env node
/**
 * File fingerprinting tool
 * Computes SHA-256 hashes of reference files
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

interface FileHash {
  path: string;
  size: number;
  sha256: string;
  error?: string;
}

function computeFileHash(filePath: string): FileHash {
  try {
    const resolvedPath = join(process.cwd(), filePath);
    
    if (!existsSync(resolvedPath)) {
      return {
        path: filePath,
        size: 0,
        sha256: '',
        error: 'File not found'
      };
    }

    const stats = statSync(resolvedPath);
    const content = readFileSync(resolvedPath);
    const hash = createHash('sha256');
    hash.update(content);
    const sha256 = hash.digest('hex');

    return {
      path: filePath,
      size: stats.size,
      sha256
    };
  } catch (e) {
    return {
      path: filePath,
      size: 0,
      sha256: '',
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node compute-hash.ts <file1> [file2] ...');
    console.log('Computes SHA-256 hashes for specified files');
    process.exit(1);
  }

  console.log('File Fingerprinting Tool');
  console.log('========================\n');

  const results: FileHash[] = [];

  for (const filePath of args) {
    const result = computeFileHash(filePath);
    results.push(result);
  }

  console.log('Results:');
  console.log('--------');
  for (const result of results) {
    if (result.error) {
      console.log(`✗ ${result.path}: ERROR - ${result.error}`);
    } else {
      console.log(`✓ ${result.path}`);
      console.log(`  Size: ${result.size} bytes`);
      console.log(`  SHA-256: ${result.sha256}`);
    }
    console.log();
  }

  // Output JSON for automation
  console.log('JSON Output:');
  console.log('------------');
  console.log(JSON.stringify(results, null, 2));
}

main();
