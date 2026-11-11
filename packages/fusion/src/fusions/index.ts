// Community fusions. Each is a rule pack built from the classic packs plus its own maps and
// mechanics (see docs/fusions/AUTHORING.md). Add new fusions to this list and give them a
// game style entry in packages/contracts (STYLES) so they appear in the lobby.
import type { RulePack } from '../rules.js';
import { conquerPack } from './conquer.js';
import { holdoutPack } from './holdout.js';
import { irregularPack } from './irregular.js';
import { leviathanPack } from './leviathan.js';

export const FUSIONS: RulePack[] = [leviathanPack, conquerPack, irregularPack, holdoutPack];
export { leviathanPack, conquerPack, irregularPack, holdoutPack };
