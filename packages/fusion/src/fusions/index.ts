// Community fusions. Each is a rule pack built from the classic packs plus its own maps and
// mechanics (see docs/fusions/AUTHORING.md). Add new fusions to this list and give them a
// game style entry in packages/contracts (STYLES) so they appear in the lobby.
import type { RulePack } from '../rules';
import { conquerPack } from './conquer';
import { leviathanPack } from './leviathan';

export const FUSIONS: RulePack[] = [leviathanPack, conquerPack];
export { leviathanPack, conquerPack };
