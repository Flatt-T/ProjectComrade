import { PACKS, factionCanUse } from '../../../../packages/fusion/src/index';
import type { FactionDef, RulePack, StructureDef, SuperweaponDef, UnitDef } from '../../../../packages/fusion/src/index';
import { esc } from './escape';

export { PACKS };

const KIND_LABEL: Record<string, string> = {
  infantry: 'infantry',
  vehicle: 'vehicle',
  aircraft: 'aircraft',
  naval: 'naval',
};

const ROLE_LABEL: Record<string, string> = {
  combat: 'combat',
  support: 'support',
  scout: 'scout',
  siege: 'siege',
  antiair: 'anti-air',
};

const KIND_ORDER = ['infantry', 'vehicle', 'aircraft', 'naval'];

export interface SideFilter {
  packId: string;
  /** Pack faction id (gdi, soviet, atreides, america…). */
  factionId?: string;
  /** Shared side id for country packs (allies, soviets). */
  side?: string;
  displayName: string;
}

export function packById(id: string): RulePack {
  const pack = PACKS[id];
  if (!pack) throw new Error(`Unknown pack ${id}`);
  return pack;
}

export function structureName(pack: RulePack, id: string): string {
  return pack.structures[id]?.name ?? id;
}

export function unitName(pack: RulePack, id: string): string {
  return pack.units[id]?.name ?? id;
}

function timesWords(n: number): string {
  if (n === 1) return 'once';
  if (n === 2) return 'twice';
  if (n === 3) return 'three times';
  return `${n} times`;
}

/** Turn `weap@1` / `pyle|hand` into player-facing names. */
export function formatPrereq(pack: RulePack, entry: string): string {
  const alts = entry.split('|').map(alt => {
    const [id, need] = alt.split('@');
    const name = structureName(pack, id);
    const level = Number(need ?? 0);
    if (level > 0) return `${name}, upgraded ${timesWords(level)}`;
    return name;
  });
  if (alts.length === 1) return alts[0];
  return alts.slice(0, -1).join(', ') + ' or ' + alts[alts.length - 1];
}

export function formatPrereqs(pack: RulePack, prereqs: string[]): string {
  if (!prereqs.length) return '';
  return prereqs.map(p => formatPrereq(pack, p)).join('; ');
}

export function factionOf(pack: RulePack, id: string): FactionDef | undefined {
  return pack.factions.find(f => f.id === id);
}

export function countriesOnSide(pack: RulePack, side: string): FactionDef[] {
  return pack.factions.filter(f => f.side === side);
}

/** True when this def is available to the side page (house, country, or shared arsenal). */
export function matchesSide(pack: RulePack, def: { factions?: string[] }, filter: SideFilter): boolean {
  if (filter.factionId) {
    const faction = factionOf(pack, filter.factionId);
    return factionCanUse(def, filter.factionId, faction?.side ?? filter.side);
  }
  if (!filter.side) return !def.factions;
  if (!def.factions) return true;
  if (def.factions.includes(filter.side)) return true;
  const countryIds = countriesOnSide(pack, filter.side).map(f => f.id);
  return def.factions.some(id => countryIds.includes(id));
}

/** Country-only items (Sniper, Tesla Tank) — not the shared side arsenal. */
export function matchesCountryOnly(def: { factions?: string[] }, countryId: string, side: string): boolean {
  return !!def.factions?.includes(countryId) && !def.factions.includes(side);
}

export function unitsFor(pack: RulePack, filter: SideFilter): UnitDef[] {
  return Object.values(pack.units).filter(u => matchesSide(pack, u, filter));
}

export function structuresFor(pack: RulePack, filter: SideFilter): StructureDef[] {
  return Object.values(pack.structures).filter(s => matchesSide(pack, s, filter));
}

export function upgradeableFor(pack: RulePack, filter: SideFilter): StructureDef[] {
  return structuresFor(pack, filter).filter(s => (s.upgrades ?? 0) > 0);
}

function article(name: string): string {
  return /^[AEIOUaeiou]/.test(name) ? 'an' : 'a';
}

function belonging(displayName: string): string {
  if (displayName === 'Allies') return 'an Allied';
  if (displayName === 'Soviets') return 'a Soviet';
  if (displayName === 'GDI') return 'a GDI';
  if (displayName === 'Nod') return 'a Nod';
  if (displayName === 'Atreides') return 'an Atreides';
  if (displayName === 'Ordos') return 'an Ordos';
  return `a ${displayName}`;
}

export function describeUnit(pack: RulePack, unit: UnitDef, displayName: string): string {
  const kind = KIND_LABEL[unit.queue && KIND_LABEL[unit.queue] ? unit.queue : unit.kind] ?? unit.kind;
  const role = unit.role ? `${ROLE_LABEL[unit.role] ?? unit.role} ` : '';
  const bits = [
    `The ${unit.name} is ${belonging(displayName)} ${role}${kind}.`,
    `It costs ${unit.cost} credits and has ${unit.hp} hit points.`,
  ];
  const needs = formatPrereqs(pack, unit.prereqs);
  if (needs) bits.push(`You need ${needs}.`);
  if (unit.tech > 1) bits.push(`Tech level ${unit.tech}.`);
  if (unit.harvester) {
    bits.push(unit.harvester.teleport
      ? 'It harvests the field and teleports home to unload.'
      : 'It harvests the field and unloads at a refinery.');
  }
  if (unit.engineer) bits.push('It captures an enemy building or repairs one of yours, and is used up.');
  if (unit.spy) bits.push('It infiltrates an enemy building.');
  if (unit.starport) bits.push('You buy it from the Starport at a changing CHOAM price.');
  if (unit.deploysTo) bits.push(`It deploys into a ${structureName(pack, unit.deploysTo)}.`);
  if (unit.transport) {
    bits.push(unit.infantryOnly
      ? `It carries ${unit.transport} infantry.`
      : `It carries ${unit.transport} passenger slots.`);
  }
  if (unit.disguise) bits.push('It can hide in plain sight.');
  if (unit.lure) bits.push('Deploying it lures sandworms.');
  if (unit.ammo) bits.push(`It returns to an airfield after ${unit.ammo} shots.`);
  return bits.join(' ');
}

export function describeStructure(pack: RulePack, building: StructureDef, displayName: string): string {
  const kind = building.queue === 'defense' ? 'defence' : 'building';
  const bits = [
    `The ${building.name} is ${article(kind)} ${kind} for ${displayName}.`,
    `It costs ${building.cost} credits.`,
  ];
  if (building.power > 0) bits.push(`It generates ${building.power} power.`);
  if (building.power < 0) bits.push(`It uses ${-building.power} power.`);
  const needs = formatPrereqs(pack, building.prereqs);
  if (needs) bits.push(`You need ${needs}.`);
  if (building.tech > 1) bits.push(`Tech level ${building.tech}.`);
  if ((building.upgrades ?? 0) > 0) {
    bits.push(`You can upgrade it ${timesWords(building.upgrades ?? 1)} for ${building.upgradeCost ?? 0} credits each time.`);
  }
  if (building.produces) bits.push(`It trains ${building.produces}.`);
  if (building.constructionYard) bits.push('This is your construction yard. Protect it.');
  if (building.refinery) bits.push('Harvesters unload here.');
  if (building.storage) bits.push(`It stores ${building.storage} credits.`);
  if (building.airfield) bits.push('Aircraft rearm here.');
  if (building.repairPad) bits.push('Damaged vehicles repair here.');
  if (building.onWater) bits.push('Build it on water.');
  if (building.floor) bits.push('Lay this slab before you build, or the structure starts at half health.');
  if (building.wall) bits.push('A wall section.');
  if (building.gap) bits.push('It hides the area from the enemy while it has power.');
  if (building.satellite) bits.push('It reveals the map.');
  if (building.incomeBonus) bits.push(`Harvester loads are worth ${building.incomeBonus}% more.`);
  if (building.costReduction) bits.push(`Vehicles, aircraft and ships cost ${building.costReduction}% less.`);
  if (building.cloning) bits.push('Every infantry you train also produces a free copy.');
  return bits.join(' ');
}

function prereqMentions(entry: string, structureId: string, level: number): boolean {
  return entry.split('|').some(alt => {
    const [id, need] = alt.split('@');
    return id === structureId && Number(need ?? 0) === level;
  });
}

export function unlocksAt(pack: RulePack, structureId: string, level: number, filter: SideFilter): string[] {
  const names: string[] = [];
  for (const unit of unitsFor(pack, filter)) {
    if (unit.prereqs.some(p => prereqMentions(p, structureId, level))) names.push(unit.name);
  }
  for (const building of structuresFor(pack, filter)) {
    if (building.prereqs.some(p => prereqMentions(p, structureId, level))) names.push(building.name);
  }
  return [...new Set(names)];
}

export function describeUpgrade(pack: RulePack, building: StructureDef, filter: SideFilter): string {
  const levels = building.upgrades ?? 0;
  const cost = building.upgradeCost ?? 0;
  const parts = [`Upgrade the ${building.name} from the base tab.`];
  parts.push(`Each upgrade costs ${cost} credits, and this building can be upgraded ${timesWords(levels)}.`);
  for (let level = 1; level <= levels; level++) {
    const unlocked = unlocksAt(pack, building.id, level, filter);
    if (unlocked.length) {
      parts.push(`After you upgrade it ${timesWords(level)}, you can reach: ${unlocked.join(', ')}.`);
    }
  }
  return parts.join(' ');
}

export function superweaponsFor(pack: RulePack, filter: SideFilter): { building: StructureDef; power: SuperweaponDef }[] {
  const out: { building: StructureDef; power: SuperweaponDef }[] = [];
  for (const building of structuresFor(pack, filter)) {
    const list = building.superweapon ? [building.superweapon].flat() : [];
    for (const power of list) {
      if (power.factions) {
        if (filter.factionId) {
          if (!power.factions.includes(filter.factionId) && !(filter.side && power.factions.includes(filter.side))) continue;
        } else if (filter.side && !power.factions.includes(filter.side)) {
          continue;
        }
      }
      out.push({ building, power });
    }
  }
  return out;
}

export function describeSuperweapon(pack: RulePack, building: StructureDef, power: SuperweaponDef): string {
  const delivered = (power.units ?? []).map(id => unitName(pack, id));
  const unique = [...new Set(delivered)];
  const bits = [`The ${power.name} is fired from the ${building.name}.`];
  if (power.kind === 'missile') bits.push('It is a missile strike.');
  if (power.kind === 'storm') bits.push('It is a storm over the target.');
  if (power.kind === 'ion') bits.push('It is an ion beam from orbit.');
  if (power.kind === 'laser') bits.push('It fires a laser at the target.');
  if (power.kind === 'tractor') bits.push('It pulls enemy units into a lock and holds them.');
  if (power.kind === 'shield') bits.push('It raises a shield that protects your forces, including infantry.');
  if (power.kind === 'chrono') bits.push('Pick the area, then the destination.');
  if (power.kind === 'curtain') bits.push('It makes vehicles and buildings invulnerable; infantry do not survive it.');
  if (power.kind === 'reveal') bits.push('It reveals the target area.');
  if (power.kind === 'paradrop' || power.kind === 'reinforce') {
    bits.push(power.atBase
      ? `It delivers ${unique.join(', ') || 'reinforcements'} at your base.`
      : `It drops ${unique.join(', ') || 'reinforcements'} on the target.`);
  }
  bits.push('Charging pauses if you are low on power.');
  return bits.join(' ');
}

function groupUnits(units: UnitDef[]): { kind: string; units: UnitDef[] }[] {
  const byKind = new Map<string, UnitDef[]>();
  for (const unit of units) {
    const kind = unit.queue && KIND_LABEL[unit.queue] ? unit.queue : unit.kind;
    const list = byKind.get(kind) ?? [];
    list.push(unit);
    byKind.set(kind, list);
  }
  const kinds = [...KIND_ORDER.filter(k => byKind.has(k)), ...[...byKind.keys()].filter(k => !KIND_ORDER.includes(k))];
  return kinds.map(kind => ({ kind, units: (byKind.get(kind) ?? []).slice().sort((a, b) => a.tech - b.tech || a.cost - b.cost || a.name.localeCompare(b.name)) }));
}

export function unitsHtml(pack: RulePack, filter: SideFilter): string {
  const groups = groupUnits(unitsFor(pack, filter));
  const parts: string[] = [];
  for (const group of groups) {
    const label = KIND_LABEL[group.kind] ?? group.kind;
    parts.push(`<h3>${esc(label.charAt(0).toUpperCase() + label.slice(1))}</h3>`);
    parts.push('<ul>');
    for (const unit of group.units) {
      parts.push(`<li id="${esc(unit.id)}"><p>${esc(describeUnit(pack, unit, filter.displayName))}</p></li>`);
    }
    parts.push('</ul>');
  }
  return parts.join('\n');
}

export function structuresHtml(pack: RulePack, filter: SideFilter): string {
  const buildings = structuresFor(pack, filter)
    .slice()
    .sort((a, b) => Number(a.queue === 'defense') - Number(b.queue === 'defense') || a.tech - b.tech || a.cost - b.cost || a.name.localeCompare(b.name));
  const parts = ['<ul>'];
  for (const building of buildings) {
    parts.push(`<li id="${esc(building.id)}"><p>${esc(describeStructure(pack, building, filter.displayName))}</p></li>`);
  }
  parts.push('</ul>');
  return parts.join('\n');
}

export function upgradesHtml(pack: RulePack, filter: SideFilter): string {
  const buildings = upgradeableFor(pack, filter)
    .slice()
    .sort((a, b) => Number(!!b.constructionYard) - Number(!!a.constructionYard) || a.tech - b.tech || a.name.localeCompare(b.name));
  if (!buildings.length) return '<p>This side has no building upgrades.</p>';
  const parts: string[] = [];
  for (const building of buildings) {
    parts.push(`<h3>${esc(building.name)}</h3>`);
    parts.push(`<p>${esc(describeUpgrade(pack, building, filter))}</p>`);
  }
  return parts.join('\n');
}

export function superweaponsHtml(pack: RulePack, filter: SideFilter): string {
  const list = superweaponsFor(pack, filter);
  if (!list.length) return '<p>This side has no superweapon of its own.</p>';
  const parts = ['<ul>'];
  for (const { building, power } of list) {
    parts.push(`<li><p>${esc(describeSuperweapon(pack, building, power))}</p></li>`);
  }
  parts.push('</ul>');
  return parts.join('\n');
}

export function mapsHtml(pack: RulePack): string {
  const parts = ['<ul>'];
  for (const map of pack.maps) {
    parts.push(`<li><p><b>${esc(map.name)}</b> — ${esc(map.description)} Up to ${map.maxPlayers} players.</p></li>`);
  }
  parts.push('</ul>');
  return parts.join('\n');
}

export function creditsHtml(pack: RulePack): string {
  const c = pack.startCredits;
  return `<p>Starting credits: low ${c.low}, standard ${c.standard}, high ${c.high}. A second factory of the same kind doubles that queue's build rate. Low power halves production.</p>`;
}

export function countrySectionsHtml(pack: RulePack, side: string): string {
  const countries = countriesOnSide(pack, side);
  if (countries.length <= 1) return '';
  const parts: string[] = ['<h2>Countries</h2>'];
  for (const country of countries) {
    parts.push(`<h3>${esc(country.name)}</h3>`);
    parts.push(`<p>${esc(country.blurb)}</p>`);
    const specialUnits = Object.values(pack.units).filter(u => matchesCountryOnly(u, country.id, side));
    const specialBuildings = Object.values(pack.structures).filter(s => matchesCountryOnly(s, country.id, side));
    const specialPowers = Object.values(pack.structures).flatMap(s => {
      const list = s.superweapon ? [s.superweapon].flat() : [];
      return list.filter(p => p.factions?.includes(country.id)).map(p => `${p.name} from the ${s.name}`);
    });
    const names = [...specialUnits.map(u => u.name), ...specialBuildings.map(s => s.name), ...specialPowers];
    if (names.length) {
      parts.push(`<p>${esc(country.name)} adds: ${esc(names.join(', '))}.</p>`);
    }
    for (const unit of specialUnits) {
      parts.push(`<p>${esc(describeUnit(pack, unit, country.name))}</p>`);
    }
    for (const building of specialBuildings) {
      parts.push(`<p>${esc(describeStructure(pack, building, country.name))}</p>`);
    }
  }
  return parts.join('\n');
}

export function fidelityHtml(pack: RulePack): string {
  return `<p class="kb-note">${esc(pack.fidelityNote)}</p>`;
}

export function sideRoster(filter: SideFilter): { units: UnitDef[]; upgradeable: StructureDef[] } {
  const pack = packById(filter.packId);
  return { units: unitsFor(pack, filter), upgradeable: upgradeableFor(pack, filter) };
}
