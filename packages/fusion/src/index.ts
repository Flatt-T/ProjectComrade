// Comrade Fusion Engine — one deterministic, data-driven RTS engine for the
// Dune-style and RA2-style games and for future fusion games built from both.
export * from './core';
export * from './rules';
export * from './map';
export * from './game';
export * from './session';
import { RulePack } from './rules';
import { dunePack } from './packs/dune';
import { ra2Pack } from './packs/ra2';
import { FUSIONS, leviathanPack } from './fusions';

export { dunePack, ra2Pack, leviathanPack, FUSIONS };

/** Rule packs by id. A fusion game is registered here like any other pack. */
export const PACKS: Record<string, RulePack> = { dune: dunePack, ra2: ra2Pack, ...Object.fromEntries(FUSIONS.map(f => [f.id, f])) };
