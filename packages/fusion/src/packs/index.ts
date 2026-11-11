// The classics replicated on this engine, in release order. One list, so everything that
// works over "every pack the platform has" — the lobby, the knowledgebase, the Custom
// Mashup — picks a new one up from the same place.
import type { RulePack } from '../rules.js';
import { dunePack } from './dune.js';
import { ra1Pack } from './ra1.js';
import { ra2Pack } from './ra2.js';
import { tdPack } from './td.js';

export const CLASSIC_PACKS: RulePack[] = [tdPack, dunePack, ra1Pack, ra2Pack];
export { dunePack, ra1Pack, ra2Pack, tdPack };
