// Recovery roles (PW12, COMRADE 18 §3.5): the structure categories a player may
// rebuild while under recovery protection, and the milestone they must reach to
// leave it. Roles are derived from StructureDef flags so every pack gets them
// without per-pack data:
//   construction-yard → def.constructionYard
//   power              → def.power > 0 (any power plant, basic or advanced)
//   refinery           → def.refinery (harvester docking)
//   barracks           → def.produces === 'infantry' (barracks-equivalent: the
//                        faction's own infantry producer counts)
import type { StructureDef, UnitDef } from './rules.js';

/** Role tags a structure definition satisfies. A def may satisfy several. */
export function structureRoles(def: StructureDef): string[] {
  const roles: string[] = [];
  if (def.constructionYard) roles.push('construction-yard');
  if (def.power > 0) roles.push('power');
  if (def.refinery) roles.push('refinery');
  if (def.produces === 'infantry') roles.push('barracks');
  return roles;
}

/** Whether the def is a mobile construction vehicle (deploys into a yard). */
export function isMcvUnit(def: UnitDef): boolean {
  return !!def.deploysTo;
}

/** Whether the def is a harvesting unit. */
export function isHarvesterUnit(def: UnitDef): boolean {
  return !!def.harvester;
}
