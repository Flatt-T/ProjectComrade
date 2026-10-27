// Comrade Fusion Engine — one deterministic, data-driven RTS engine for the
// Dune-style and RA2-style games and for future fusion games built from both.
export * from './core';
export * from './rules';
export * from './map';
export * from './game';
export * from './session';
import { RulePack } from './rules';
import { dunePack } from './packs/dune';
import { ra1Pack } from './packs/ra1';
import { ra2Pack } from './packs/ra2';
import { tdPack } from './packs/td';
import { FUSIONS, conquerPack, leviathanPack } from './fusions';

export { dunePack, ra1Pack, ra2Pack, tdPack, leviathanPack, conquerPack, FUSIONS };

/** The classics replicated on this engine, in release order. A fusion game may draw on any of them. */
export const CLASSIC_PACKS: RulePack[] = [tdPack, dunePack, ra1Pack, ra2Pack];

/** Rule packs by id. A fusion game is registered here like any other pack. */
export const PACKS: Record<string, RulePack> = {
  ...Object.fromEntries(CLASSIC_PACKS.map(p => [p.id, p])),
  ...Object.fromEntries(FUSIONS.map(f => [f.id, f])),
};
