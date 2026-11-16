// THU-2447 / THU-2448 — runtime art coverage manifest.
//
// Enumerates every structure and unit definition in each supported pack plus
// the composed universal persistent pack, resolves the renderer's art path
// (buildingMesh / wallMesh / hullMesh+turretMesh / infantry costume+inline),
// and flags defs whose shape falls through to a generic `default:` branch —
// the "unexplained placeholder" rows the acceptance criteria require zero of.
//
// Run with tsx (service devDependency) from the repo root or apps/service:
//   pnpm --filter @comrade/service exec tsx ../../tools/art-coverage.ts [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSIC_PACKS, FUSIONS, MASHUP_PACKS, composeWorldPack,
  type StructureDef, type UnitDef,
} from '../packages/fusion/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Slice a top-level `export function NAME(` body out of a source file. */
function fnSlice(src: string, name: string): string {
  const start = src.indexOf(`export function ${name}(`);
  if (start < 0) return '';
  const rest = src.slice(start);
  const next = rest.slice(20).search(/\nexport (function|const|class) /);
  return next < 0 ? rest : rest.slice(0, next + 20);
}

/** `case 'x':` labels inside a function slice (nested switches over-count slightly — documented). */
function caseLabels(slice: string): Set<string> {
  const out = new Set<string>();
  for (const m of slice.matchAll(/case '([^']+)'/g)) out.add(m[1]);
  for (const m of slice.matchAll(/case "([^"]+)"/g)) out.add(m[1]);
  return out;
}

const modelsSrc = read('packages/fusion/src/art/models.ts');
const costumeSrc = read('packages/fusion/src/art/costume.ts');
const renderSrc = read('packages/fusion/src/render.ts');

const buildingCases = caseLabels(fnSlice(modelsSrc, 'buildingMesh'));
const hullCases = caseLabels(fnSlice(modelsSrc, 'hullMesh'));
const turretCases = caseLabels(fnSlice(modelsSrc, 'turretMesh'));
const defenseCases = caseLabels(fnSlice(modelsSrc, 'defenseTurretMesh'));
const infantryCases = new Set([
  ...caseLabels(costumeSrc),
  // Inline silhouettes drawn procedurally in Renderer.drawInfantry.
  ...[...fnSlice(renderSrc, 'drawInfantry')
    .replace(/^export /gm, '')
    .matchAll(/shape === '([^']+)'/g)].map(m => m[1]),
]);
// drawInfantry is a private method — fnSlice won't find `export function`; fall back
// to the method slice if the export search missed it.
if (infantryCases.size <= 20) {
  const i = renderSrc.indexOf('private drawInfantry(');
  if (i >= 0) {
    const rest = renderSrc.slice(i);
    const next = rest.slice(10).search(/\n {2}(private|public) /);
    const body = next < 0 ? rest : rest.slice(0, next + 10);
    for (const m of body.matchAll(/shape === '([^']+)'/g)) infantryCases.add(m[1]);
    for (const m of body.matchAll(/shape !== '([^']+)'/g)) infantryCases.add(m[1]); // negative guards still imply the shape renders
  }
}

interface Row {
  pack: string; id: string; defId: string; kind: 'structure' | 'unit';
  shape: string; artPath: string; coverage: 'specific' | 'generic-fallback';
  detail?: string;
}

const rows: Row[] = [];
const seenDefIds = new Set<string>();

function addDefs(packId: string, structures: Record<string, StructureDef>, units: Record<string, UnitDef>) {
  for (const [id, d] of Object.entries(structures)) {
    const key = `${packId}|s|${id}`;
    if (seenDefIds.has(key)) continue;
    seenDefIds.add(key);
    if (d.wall) {
      rows.push({ pack: packId, id, defId: id, kind: 'structure', shape: 'wall', artPath: 'wallMesh', coverage: 'specific' });
      continue;
    }
    const specific = buildingCases.has(d.shape);
    rows.push({
      pack: packId, id, defId: id, kind: 'structure', shape: d.shape,
      artPath: `buildingMesh(${d.shape})`, coverage: specific ? 'specific' : 'generic-fallback',
      detail: specific ? undefined : 'shape hits buildingMesh default: plain team-striped box',
    });
  }
  for (const [id, d] of Object.entries(units)) {
    const key = `${packId}|u|${id}`;
    if (seenDefIds.has(key)) continue;
    seenDefIds.add(key);
    if (d.kind === 'infantry' || d.shape === 'rocketeer') {
      const specific = infantryCases.has(d.shape);
      rows.push({
        pack: packId, id, defId: id, kind: 'unit', shape: d.shape,
        artPath: `drawInfantry/infantryCostume(${d.shape})`,
        coverage: specific ? 'specific' : 'generic-fallback',
        detail: specific ? undefined : 'shape hits infantryCostume default: suit dyed in team colour',
      });
      continue;
    }
    const hullSpecific = hullCases.has(d.shape);
    const turretSpecific = turretCases.has(d.shape) || defenseCases.has(d.shape);
    rows.push({
      pack: packId, id, defId: id, kind: 'unit', shape: d.shape,
      artPath: `hullMesh(${d.shape})${turretSpecific || turretCases.size ? '+turretMesh' : ''}`,
      coverage: hullSpecific ? 'specific' : 'generic-fallback',
      detail: hullSpecific ? undefined : 'shape hits hullMesh default: generic tracked hull',
    });
  }
}

for (const pack of [...CLASSIC_PACKS, ...FUSIONS]) {
  addDefs(pack.id, pack.structures, pack.units);
}

const world = composeWorldPack(MASHUP_PACKS);
addDefs(world.pack.id, world.pack.structures as Record<string, StructureDef>, world.pack.units as Record<string, UnitDef>);

const fallback = rows.filter(r => r.coverage === 'generic-fallback');
const summary = {
  generatedAt: new Date().toISOString(),
  packs: [...CLASSIC_PACKS, ...FUSIONS].map(p => p.id).concat(world.pack.id),
  totalDefs: rows.length,
  structures: rows.filter(r => r.kind === 'structure').length,
  units: rows.filter(r => r.kind === 'unit').length,
  specificShapes: {
    building: buildingCases.size, hull: hullCases.size,
    turret: turretCases.size, defenseTurret: defenseCases.size, infantry: infantryCases.size,
  },
  genericFallback: fallback.length,
  fallbackByShape: [...new Set(fallback.map(r => `${r.artPath.split('(')[0]}:${r.shape}`))].sort(),
};

const out = process.argv[2] ?? join(ROOT, 'art-coverage.json');
writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`manifest -> ${out}`);
