#!/usr/bin/env node
/**
 * Reference file checklist tool
 * Generates checklist of required reference files for verification
 */

import { existsSync } from 'fs';
import { join } from 'path';

interface ReferenceFile {
  category: string;
  title: string;
  requiredFiles: string[];
  status: 'required' | 'optional';
}

const requiredFiles: ReferenceFile[] = [
  {
    category: 'TD-CLASSIC-001',
    title: 'Tiberian Dawn Classic',
    requiredFiles: [
      'C&C95.exe',
      'CONQUER.MIX',
      'DESERT.MIX',
      'GENERAL.MIX',
      'SCENARIO.MIX',
      'SOUNDS.MIX',
      'TEMPERAT.MIX',
      'WINTER.MIX',
      'RULES.INI'
    ],
    status: 'required'
  },
  {
    category: 'RA1-CLASSIC-001',
    title: 'Red Alert 1 Classic (Base)',
    requiredFiles: [
      'RA95.exe',
      'ALLIES.MIX',
      'HRIDES.MIX',
      'MAIN.MIX',
      'LOCAL.MIX',
      'SOUNDS.MIX',
      'SOVIET.MIX',
      'RULES.INI'
    ],
    status: 'required'
  },
  {
    category: 'RA1-CLASSIC-001-CS',
    title: 'Red Alert 1 Counterstrike',
    requiredFiles: [
      'RA2.MIX'
    ],
    status: 'optional'
  },
  {
    category: 'RA1-CLASSIC-001-AM',
    title: 'Red Alert 1 Aftermath',
    requiredFiles: [
      'RA2.MIX'
    ],
    status: 'optional'
  },
  {
    category: 'D2K-CLASSIC-001',
    title: 'Dune 2000 Classic',
    requiredFiles: [
      'DUNE2000.exe',
      'DUNE2.MIX',
      'DUNE2A.MIX',
      'RULES.INI'
    ],
    status: 'required'
  },
  {
    category: 'RA2-CLASSIC-001',
    title: 'Red Alert 2 Classic (Base)',
    requiredFiles: [
      'RA2.EXE',
      'LOCAL.MIX',
      'RA2.MIX'
    ],
    status: 'optional'
  },
  {
    category: 'RA2-CLASSIC-001-YR',
    title: 'Red Alert 2 Yuri\'s Revenge',
    requiredFiles: [
      'RA2MD.EXE',
      'RA2MD.MIX'
    ],
    status: 'optional'
  }
];

function generateChecklist(basePath: string = '.') {
  console.log('Reference File Checklist');
  console.log('=======================\n');

  for (const ref of requiredFiles) {
    console.log(`${ref.category}: ${ref.title}`);
    console.log(`Status: ${ref.status}\n`);

    for (const file of ref.requiredFiles) {
      const fullPath = join(basePath, file);
      const exists = existsSync(fullPath);
      const status = exists ? '✓' : '✗';
      console.log(`  ${status} ${file}`);
    }
    console.log();
  }

  console.log('Legend:');
  console.log('  ✓ File present');
  console.log('  ✗ File missing');
  console.log('\nNote: This checklist does not verify file hashes. Use compute-hash.ts to generate SHA-256 hashes.');
}

function main() {
  const basePath = process.argv[2] || '.';
  generateChecklist(basePath);
}

main();
