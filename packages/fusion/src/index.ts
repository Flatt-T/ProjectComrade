// Comrade Fusion Engine — one deterministic, data-driven RTS engine for the
// Dune-style and RA2-style games and for future fusion games built from both.
export * from './core';
export * from './rules';
export * from './map';
export * from './game';
export * from './session';
export * from './mashup';
import { RulePack } from './rules';
import { CLASSIC_PACKS, dunePack, ra1Pack, ra2Pack, tdPack } from './packs';
import { FUSIONS, conquerPack, holdoutPack, irregularPack, leviathanPack } from './fusions';

export { dunePack, ra1Pack, ra2Pack, tdPack, leviathanPack, conquerPack, irregularPack, holdoutPack, FUSIONS, CLASSIC_PACKS };

/** Rule packs by id. A fusion game is registered here like any other pack. */
export const PACKS: Record<string, RulePack> = {
  ...Object.fromEntries(CLASSIC_PACKS.map(p => [p.id, p])),
  ...Object.fromEntries(FUSIONS.map(f => [f.id, f])),
};
