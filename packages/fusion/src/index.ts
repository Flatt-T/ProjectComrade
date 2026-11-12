// Comrade Fusion Engine — one deterministic, data-driven RTS engine for the
// Dune-style and RA2-style games and for future fusion games built from both.
export * from './core.js';
export * from './rules.js';
export * from './map.js';
export * from './path.js';
export * from './game.js';
export * from './session.js';
export * from './mashup.js';
export * from './persistent.js';
export * from './worldgen.js';
export * from './starter.js';
export * from './recovery.js';
import { RulePack } from './rules.js';
import { CLASSIC_PACKS, dunePack, ra1Pack, ra2Pack, tdPack } from './packs/index.js';
import { FUSIONS, conquerPack, holdoutPack, irregularPack, leviathanPack } from './fusions/index.js';

export { dunePack, ra1Pack, ra2Pack, tdPack, leviathanPack, conquerPack, irregularPack, holdoutPack, FUSIONS, CLASSIC_PACKS };

/** Rule packs by id. A fusion game is registered here like any other pack. */
export const PACKS: Record<string, RulePack> = {
  ...Object.fromEntries(CLASSIC_PACKS.map(p => [p.id, p])),
  ...Object.fromEntries(FUSIONS.map(f => [f.id, f])),
};
