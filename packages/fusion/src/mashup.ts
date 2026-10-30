// Custom Mashup: one match assembled out of several rule packs at once.
//
// A Gold commander does not choose a game style. They choose a battlefield, and then, slot by
// slot, whose buildings (with their upgrade progression), soldiers, vehicles, aircraft and
// ships they want to field. Every commander in the room chooses for themselves, so one match
// can be Dune buildings with Nod soldiers and Star Wars walkers on one side and Red Alert 2
// on the other.
//
// Nothing in here is authored per pack. The catalogue of choices is derived from the
// registered packs, so a pack added later becomes selectable the moment it joins
// MASHUP_PACKS — no mashup code, data or UI has to be touched for it.
//
// The engine plays exactly one RulePack per match, so a mashup is composed into exactly that:
// every chosen definition is copied into a single pack under a per-commander namespace
// ('p1-...'), tagged with that commander's synthetic faction, which is what keeps each
// sidebar to its own owner's choices. Composition is pure and order-stable — no clock, no
// randomness, no iteration over unordered sets — so every client in a lockstep match
// composes an identical pack from the same loadouts.
import {
  FactionDef, MapPreset, Mechanics, QueueKind, RulePack, StructureDef, SuperweaponDef, UnitDef, UnitKind,
  WarheadDef, WeaponDef, factionCanUse,
} from './rules';
import { CLASSIC_PACKS } from './packs';
import { FUSIONS } from './fusions';

/**
 * The packs a mashup may draw on, in catalogue order: every classic and every fusion the
 * platform has. A pack registered in CLASSIC_PACKS or FUSIONS is selectable here the same day,
 * with no mashup data to author.
 */
export const MASHUP_PACKS: RulePack[] = [...CLASSIC_PACKS, ...FUSIONS];

/** The pack id a composed mashup carries, so callers can recognise one. */
export const MASHUP_PACK_ID = 'mashup';

export type MashupSlot = 'structures' | 'infantry' | 'vehicle' | 'aircraft' | 'naval';
export const MASHUP_SLOTS: MashupSlot[] = ['structures', 'infantry', 'vehicle', 'aircraft', 'naval'];
/** Only buildings are compulsory: a commander with no navy simply has no navy. */
export const MASHUP_REQUIRED: MashupSlot[] = ['structures'];
export const MASHUP_SLOT_LABEL: Record<MashupSlot, string> = {
  structures: 'Buildings', infantry: 'Soldiers', vehicle: 'Vehicles', aircraft: 'Air', naval: 'Sea',
};
/** What a slot asks for, in the second person, for the lobby. */
export const MASHUP_SLOT_BLURB: Record<MashupSlot, string> = {
  structures: 'Your base, its tech ladder and every upgrade on it.',
  infantry: 'Who fights on foot.',
  vehicle: 'Tanks, walkers, harvesters and the deploying construction vehicle.',
  aircraft: 'Helicopters, jets, ornithopters and starfighters.',
  naval: 'Ships and submarines. They need a battlefield with water.',
};
const SLOT_KIND: Record<Exclude<MashupSlot, 'structures'>, UnitKind> = {
  infantry: 'infantry', vehicle: 'vehicle', aircraft: 'aircraft', naval: 'naval',
};

/** A commander's choices: the option key for each slot, absent where they took nothing. */
export type MashupLoadout = Partial<Record<MashupSlot, string>> & { structures: string };

/** One selectable set of definitions, derived from a pack (and usually one of its factions). */
export interface MashupChoice {
  key: string;
  packId: string;
  packName: string;
  /** The factions of that pack this set belongs to; the first one is the one composed with. */
  factionIds: string[];
  /** 'Nod', 'Allies', 'House Harkonnen' — or the pack's own name when every faction shares the set. */
  label: string;
  /** What is in it, shortest first: the three cheapest names, for the lobby. */
  blurb: string;
  /** How many of these can actually be built (tech 1..10). */
  count: number;
}

export interface MashupMapChoice {
  mapId: string;
  packId: string;
  packName: string;
  name: string;
  description: string;
  maxPlayers: number;
  /** True when the battlefield has navigable water, so sea choices are worth making. */
  water: boolean;
}

export interface MashupCatalogue {
  maps: MashupMapChoice[];
  choices: Record<MashupSlot, MashupChoice[]>;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

type Def = UnitDef | StructureDef;

function setFor(pack: RulePack, slot: MashupSlot, faction?: FactionDef): Def[] {
  const usable = (def: Def) => !faction || factionCanUse(def, faction.id, faction.side);
  if (slot === 'structures') return Object.values(pack.structures).filter(usable);
  const kind = SLOT_KIND[slot];
  return Object.values(pack.units).filter(u => u.kind === kind && usable(u));
}

/** Buildable members of a set: the ones the tech ladder can actually reach. */
const reachable = (defs: Def[]) => defs.filter(d => d.tech <= 10);

function blurbFor(defs: Def[]): string {
  const names = [...reachable(defs)].sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1)).map(d => d.name);
  const head = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${head} and ${names.length - 3} more` : head || 'Nothing buildable';
}

/**
 * The selectable sets a pack offers for one slot. Factions whose set is identical are offered
 * together (named after their shared side where they have one), and a pack whose factions all
 * field the same things is offered once under the pack's own name.
 */
function choicesFor(pack: RulePack, slot: MashupSlot): MashupChoice[] {
  const groups: { sig: string; factions: FactionDef[]; defs: Def[] }[] = [];
  for (const faction of pack.factions) {
    const defs = setFor(pack, slot, faction);
    if (!reachable(defs).length) continue;
    const sig = defs.map(d => d.id).join(',');
    const found = groups.find(g => g.sig === sig);
    if (found) found.factions.push(faction);
    else groups.push({ sig, factions: [faction], defs });
  }
  if (!groups.length) return [];
  const whole = groups.length === 1 && groups[0].factions.length === pack.factions.length;
  return groups.map(group => {
    const sides = new Set(group.factions.map(f => f.side));
    const label = whole ? pack.name
      : group.factions.length > 1 && sides.size === 1 ? titleCase(group.factions[0].side)
        : group.factions.map(f => f.name).join(' / ');
    return {
      key: whole ? pack.id : `${pack.id}:${group.factions[0].id}`,
      packId: pack.id,
      packName: pack.name,
      factionIds: group.factions.map(f => f.id),
      label,
      blurb: blurbFor(group.defs),
      count: reachable(group.defs).length,
    };
  });
}

const titleCase = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);

/** Does this battlefield hold water a ship could sail on? */
export function mapHasWater(pack: RulePack, preset: MapPreset): boolean {
  const wet = new Set(pack.terrains.filter(t => t.water).map(t => t.id));
  return wet.has(preset.base) || preset.features.some(f => wet.has(f.terrain));
}

/**
 * Every choice a Custom Mashup offers, derived from the registered packs. Sets that are
 * identical to one an earlier pack already offers are left out, so a fusion that reuses a
 * classic's roster (Leviathan Isles is Red Alert 2's armies) contributes its battlefields
 * without doubling up the unit lists.
 */
export function mashupCatalogue(packs: RulePack[] = MASHUP_PACKS): MashupCatalogue {
  const choices = { structures: [], infantry: [], vehicle: [], aircraft: [], naval: [] } as Record<MashupSlot, MashupChoice[]>;
  const seen = new Map<MashupSlot, Set<string>>(MASHUP_SLOTS.map(s => [s, new Set<string>()]));
  const maps: MashupMapChoice[] = [];
  for (const pack of packs) {
    for (const slot of MASHUP_SLOTS) {
      for (const choice of choicesFor(pack, slot)) {
        const sig = signatureOf(pack, slot, choice);
        if (seen.get(slot)!.has(sig)) continue;
        seen.get(slot)!.add(sig);
        choices[slot].push(choice);
      }
    }
    for (const preset of pack.maps) {
      maps.push({
        mapId: preset.id, packId: pack.id, packName: pack.name, name: preset.name,
        description: preset.description, maxPlayers: preset.maxPlayers, water: mapHasWater(pack, preset),
      });
    }
  }
  return { maps, choices };
}

/** Two sets are the same set when they hold the same definitions, whichever pack offers them. */
function signatureOf(pack: RulePack, slot: MashupSlot, choice: MashupChoice): string {
  const faction = pack.factions.find(f => f.id === choice.factionIds[0]);
  return setFor(pack, slot, faction).map(d => `${d.id}:${d.name}:${d.cost}`).join(',');
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface Chosen { pack: RulePack; faction?: FactionDef; defs: Def[] }

/** Look an option key ('ra2:russia', or 'dune' for a whole pack) back up in the packs. */
function resolveChoice(key: string, slot: MashupSlot, packs: RulePack[]): Chosen {
  const [packId, factionId] = key.split(':');
  const pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error(`Unknown mashup pack ${packId}`);
  const faction = factionId ? pack.factions.find(f => f.id === factionId) : pack.factions[0];
  if (factionId && !faction) throw new Error(`Unknown mashup faction ${key}`);
  const defs = setFor(pack, slot, faction);
  if (!defs.length) throw new Error(`Mashup set ${key} has no ${slot}`);
  return { pack, faction, defs };
}

export function mashupMap(mapId: string, packs: RulePack[] = MASHUP_PACKS): { pack: RulePack; preset: MapPreset } {
  for (const pack of packs) {
    const preset = pack.maps.find(m => m.id === mapId);
    if (preset) return { pack, preset };
  }
  throw new Error(`Unknown mashup battlefield ${mapId}`);
}

/** A loadout drawn entirely from one pack and faction: what an AI commander is given. */
export function wholePackLoadout(packId: string, factionId?: string, packs: RulePack[] = MASHUP_PACKS): MashupLoadout {
  const pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error(`Unknown mashup pack ${packId}`);
  const faction = (factionId && pack.factions.find(f => f.id === factionId)) || pack.factions[0];
  const key = (slot: MashupSlot) => choicesFor(pack, slot).find(c => c.factionIds.includes(faction.id))?.key;
  const loadout: MashupLoadout = { structures: key('structures') ?? pack.id };
  for (const slot of MASHUP_SLOTS) {
    if (slot === 'structures') continue;
    const found = key(slot);
    if (found) loadout[slot] = found;
  }
  return loadout;
}

/** Everything a loadout needs to be playable: buildings, and something to fight with. */
export function mashupLoadoutProblem(loadout: MashupLoadout | undefined, packs: RulePack[] = MASHUP_PACKS): string | null {
  if (!loadout?.structures) return 'Choose whose buildings you are fighting with.';
  for (const slot of MASHUP_SLOTS) {
    const key = loadout[slot];
    if (!key) continue;
    try { resolveChoice(key, slot, packs); } catch { return `${MASHUP_SLOT_LABEL[slot]}: that set is no longer available.`; }
  }
  const forces = MASHUP_SLOTS.filter(s => s !== 'structures').some(s => loadout[s]);
  if (!forces) return 'Choose at least one kind of force to fight with.';
  return null;
}

// ---------------------------------------------------------------------------
// Armour
// ---------------------------------------------------------------------------

/**
 * Mashups share one armour vocabulary — the union of every pack's — because a Dune warhead
 * has to mean something sensible against a Red Alert 2 hull. Warheads are authored against
 * their own pack's armour list, so the missing entries are filled in on import: 'medium' and
 * 'wood' fall between their neighbours where both are known, and anything else borrows the
 * nearest armour class that warhead does define. Nothing is invented out of thin air, so a
 * tank never becomes paper because the shell came from another war.
 */
export const MASHUP_ARMORS = ['none', 'wood', 'light', 'medium', 'heavy', 'building'];
const ARMOR_NEIGHBOURS: Record<string, string[]> = {
  none: ['none', 'wood', 'light', 'medium', 'heavy', 'building'],
  wood: ['wood', 'none', 'light', 'medium', 'heavy', 'building'],
  light: ['light', 'medium', 'heavy', 'wood', 'none', 'building'],
  medium: ['medium', 'light', 'heavy', 'wood', 'none', 'building'],
  heavy: ['heavy', 'medium', 'light', 'building', 'wood', 'none'],
  building: ['building', 'heavy', 'medium', 'light', 'wood', 'none'],
};

export function spreadWarhead(warhead: WarheadDef, id = warhead.id): WarheadDef {
  const vs: Record<string, number> = {};
  for (const armor of MASHUP_ARMORS) {
    const known = warhead.vs[armor];
    if (known !== undefined) { vs[armor] = known; continue; }
    const between = armor === 'medium' ? ['light', 'heavy'] : armor === 'wood' ? ['none', 'light'] : null;
    if (between && warhead.vs[between[0]] !== undefined && warhead.vs[between[1]] !== undefined) {
      vs[armor] = Math.round((warhead.vs[between[0]] + warhead.vs[between[1]]) / 2);
      continue;
    }
    const nearest = ARMOR_NEIGHBOURS[armor].find(a => warhead.vs[a] !== undefined);
    vs[armor] = nearest === undefined ? 100 : warhead.vs[nearest];
  }
  return { id, vs };
}

// ---------------------------------------------------------------------------
// Roles: how one pack's tech ladder is read onto another's
// ---------------------------------------------------------------------------

/**
 * A prerequisite names a building in its own pack, which the commander may not have chosen.
 * Every building is therefore reduced to the role it plays — the thing that makes it a gate —
 * and the prerequisite is re-pointed at whichever of the commander's own buildings plays the
 * same role. A building can serve more than one role (Red Alert 2's Airforce Command HQ is
 * both radar and the air producer), so the roles are tried in order.
 */
function rolesOf(st: StructureDef): string[] {
  const roles: string[] = [];
  if (st.constructionYard) roles.push('yard');
  if (st.produces) roles.push(`produces:${st.produces}`);
  if (st.refinery) roles.push('refinery');
  if (st.power > 0) roles.push('power');
  if (st.radar) roles.push('radar');
  if (st.repairPad) roles.push('repair');
  if (st.storage) roles.push('silo');
  if (st.superweapon) roles.push('super');
  if (st.gap || st.satellite || st.sensor) roles.push('intel');
  if (st.wall) roles.push('wall');
  if (st.floor) roles.push('floor');
  if (st.queue === 'defense') roles.push('defense');
  // Laboratories and the like: no job but to stand there and unlock the next tier.
  if (!roles.length) roles.push('tech');
  return roles;
}

/** Where a role has no counterpart, these are tried next; an empty list drops the gate. */
const ROLE_FALLBACK: Record<string, string[]> = {
  power: ['yard'], refinery: ['yard'], silo: ['refinery', 'yard'],
  radar: ['tech'], tech: ['radar'], super: ['tech', 'radar'],
};

interface SeatStructure { id: string; def: StructureDef; from: RulePack; src: StructureDef }

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Commander colours, in seat order: the same four the classics use for player slots. */
const SEAT_COLORS: { color: string; accent: string }[] = [
  { color: '#2f6fd0', accent: '#a6c8ff' },
  { color: '#c2281f', accent: '#ffa497' },
  { color: '#3c9b44', accent: '#b2e8a9' },
  { color: '#d5bc68', accent: '#f6e7b0' },
];

const NEEDED_QUEUES: QueueKind[] = ['infantry', 'vehicle', 'aircraft', 'naval'];

export interface MashupSeatSummary {
  faction: string;
  /** What this commander fields, slot by slot, for the sidebar and the match record. */
  sets: Partial<Record<MashupSlot, string>>;
  /** Buildings imported because the chosen base had no producer for a chosen force. */
  bridged: string[];
}

export interface ComposedMashup {
  pack: RulePack;
  /** The synthetic faction id for each seat, in seat order. */
  factions: string[];
  seats: MashupSeatSummary[];
}

/**
 * Compose the one rule pack a mashup match plays: the battlefield's own world (terrain,
 * resources, mechanics, projection and economy) with each commander's chosen forces copied
 * in under their own namespace.
 */
export function composeMashup(mapId: string, loadouts: MashupLoadout[], packs: RulePack[] = MASHUP_PACKS): ComposedMashup {
  const { pack: arena, preset } = mashupMap(mapId, packs);
  const composer = new Composer(arena, packs);
  const seats = loadouts.slice(0, preset.maxPlayers).map((loadout, i) => composer.addSeat(i, loadout));
  return { pack: composer.finish(preset), factions: seats.map(s => s.faction), seats };
}

class Composer {
  private units: Record<string, UnitDef> = {};
  private structures: Record<string, StructureDef> = {};
  private weapons: Record<string, WeaponDef> = {};
  private warheads: Record<string, WarheadDef> = {};
  private factions: FactionDef[] = [];

  constructor(private arena: RulePack, private packs: RulePack[]) {}

  // ---- weapons

  /** Weapons and warheads are shared between seats that chose the same pack, so they are keyed by it. */
  private weapon(pack: RulePack, id: string | undefined): string | undefined {
    if (!id) return undefined;
    const src = pack.weapons[id];
    if (!src) return undefined;
    const key = `${pack.id}.${id}`;
    if (this.weapons[key]) return key;
    const warhead = `${pack.id}.${src.warhead}`;
    if (!this.warheads[warhead]) this.warheads[warhead] = spreadWarhead(pack.warheads[src.warhead], warhead);
    this.weapons[key] = { ...src, id: key, warhead };
    return key;
  }

  // ---- seats

  addSeat(index: number, loadout: MashupLoadout): MashupSeatSummary {
    const tag = `p${index + 1}`;
    const ns = (id: string) => `${tag}-${id}`;
    const chosen = {} as Partial<Record<MashupSlot, Chosen>>;
    for (const slot of MASHUP_SLOTS) {
      const key = loadout[slot];
      if (key) chosen[slot] = resolveChoice(key, slot, this.packs);
    }
    const base = chosen.structures;
    if (!base) throw new Error('A mashup loadout must choose whose buildings it fights with');

    // 1. The commander's own buildings, prerequisites still unresolved.
    const seat: SeatStructure[] = [];
    const take = (pack: RulePack, src: StructureDef) => {
      // An imported building can share an id with one of the base's own: give it its own.
      const id = seat.some(s => s.id === ns(src.id)) ? ns(`x-${src.id}`) : ns(src.id);
      if (seat.some(s => s.id === id)) return;
      // A mashup is a commander's own army: whatever they picked is theirs, doctrine or not.
      const def: StructureDef = { ...src, id, factions: [tag] };
      delete def.doctrine;
      seat.push({ id, def, from: pack, src });
    };
    for (const st of base.defs as StructureDef[]) take(base.pack, st);

    // 2. A force with nowhere to come from is no force: where the chosen base has no producer
    //    for something the commander picked, that producer is brought over from the pack the
    //    units themselves come from, and gated like any other building of theirs. Queues are
    //    taken from the units' own production tab, so a bomber that rolls out of a war factory
    //    asks for a war factory.
    const needs = new Map<QueueKind, Chosen>();
    for (const slot of MASHUP_SLOTS) {
      const set = slot === 'structures' ? undefined : chosen[slot];
      if (!set) continue;
      for (const u of set.defs as UnitDef[]) {
        if (u.tech > 10) continue;
        const queue = u.queue ?? u.kind;
        if (!needs.has(queue)) needs.set(queue, set);
      }
    }
    const bridged: string[] = [];
    for (const queue of NEEDED_QUEUES) {
      const set = needs.get(queue);
      if (!set || seat.some(s => s.def.produces === queue)) continue;
      const producer = cheapest(Object.values(set.pack.structures)
        .filter(s => s.produces === queue && (!set.faction || factionCanUse(s, set.faction.id, set.faction.side))));
      if (!producer) continue;
      take(set.pack, producer);
      bridged.push(producer.name);
    }

    // 3. Service vehicles: a base needs something to deploy it and something to mine with.
    //    If the chosen vehicles bring neither, the base's own pack supplies them.
    const vehicles = chosen.vehicle;
    const serviceFrom = (pick: (u: UnitDef) => boolean): { pack: RulePack; src: UnitDef } | undefined => {
      if (vehicles) {
        const own = cheapest((vehicles.defs as UnitDef[]).filter(pick));
        if (own) return { pack: vehicles.pack, src: own };
      }
      const fallback = cheapest(Object.values(base.pack.units)
        .filter(u => pick(u) && (!base.faction || factionCanUse(u, base.faction.id, base.faction.side))));
      return fallback ? { pack: base.pack, src: fallback } : undefined;
    };
    const yard = seat.find(s => s.def.constructionYard);
    const mcv = yard && serviceFrom(u => !!u.deploysTo);
    const harvester = serviceFrom(u => !!u.harvester);

    // 4. Index the commander's buildings by role, cheapest tier first, so a prerequisite on
    //    the second rung of one pack's ladder lands on the second rung of theirs.
    const byRole = new Map<string, SeatStructure[]>();
    for (const st of [...seat].sort(byTier)) {
      for (const role of rolesOf(st.def)) byRole.set(role, [...(byRole.get(role) ?? []), st]);
    }
    const target = (role: string): SeatStructure[] => {
      const direct = byRole.get(role);
      if (direct?.length) return direct;
      for (const next of ROLE_FALLBACK[role] ?? []) {
        const found = byRole.get(next);
        if (found?.length) return found;
      }
      return [];
    };

    // 5. Resolve every prerequisite onto the commander's own ladder.
    const bridge = (prereqs: string[], from: RulePack): string[] => {
      const out: string[] = [];
      for (const entry of prereqs) {
        const alts: string[] = [];
        for (const alt of entry.split('|')) {
          const [id, level] = alt.split('@');
          const src = from.structures[id];
          if (!src) continue;
          for (const role of rolesOf(src)) {
            const list = target(role);
            if (!list.length) continue;
            // Same rung of the ladder: a gate on a pack's heavy factory should not become a
            // gate on a light one. Rungs are counted among the buildings of that role open to
            // the same sides, so one side's barracks is not ranked behind another side's.
            const sides = (s: StructureDef) => (s.factions ?? []).join(',');
            const peers = Object.values(from.structures)
              .filter(s => rolesOf(s).includes(role) && sides(s) === sides(src)).sort(byTierDef);
            const rank = Math.max(0, peers.findIndex(s => s.id === src.id));
            const pick = list[Math.min(rank, list.length - 1)];
            const want = Math.min(Number(level ?? 0), pick.def.upgrades ?? 0);
            const token = want > 0 ? `${pick.id}@${want}` : pick.id;
            if (!alts.includes(token)) alts.push(token);
            break;
          }
        }
        const token = alts.join('|');
        if (token && !out.includes(token)) out.push(token);
      }
      return out;
    };

    const starport = seat.some(s => s.def.produces === 'starport');
    for (const st of seat) {
      const def = st.def;
      def.prereqs = bridge(st.src.prereqs, st.from);
      def.weapon = this.weapon(st.from, st.src.weapon);
      def.deathWeapon = this.weapon(st.from, st.src.deathWeapon);
      this.structures[st.id] = def;
    }

    // 6. The forces themselves.
    const imported = new Map<string, string>(); // source pack + id -> namespaced id
    const addUnit = (pack: RulePack, src: UnitDef): string => {
      const id = ns(src.id);
      imported.set(`${pack.id}/${src.id}`, id);
      if (this.units[id]) return id;
      const def: UnitDef = { ...src, id, factions: [tag], prereqs: bridge(src.prereqs, pack) };
      delete def.doctrine;
      def.weapon = this.weapon(pack, src.weapon);
      def.altWeapon = this.weapon(pack, src.altWeapon);
      def.deployWeapon = this.weapon(pack, src.deployWeapon);
      def.deathWeapon = this.weapon(pack, src.deathWeapon);
      if (!MASHUP_ARMORS.includes(def.armor)) def.armor = 'heavy';
      // A deploying vehicle deploys into this commander's own construction yard.
      if (src.deploysTo) {
        if (yard) def.deploysTo = yard.id; else delete def.deploysTo;
      }
      // The Starport is a Dune institution: without one, nothing is for sale.
      if (src.starport && !starport) delete def.starport;
      // Make sure the thing rolls out of the right building (the engine picks the factory a
      // unit names), adding the producer when the bridged gates do not mention one.
      const queue = def.queue ?? def.kind;
      const producers = target(`produces:${queue}`);
      if (producers.length && !def.prereqs.some(e => e.split('|').some(a => producers.some(p => p.id === a.split('@')[0])))) {
        def.prereqs = [...def.prereqs, producers[0].id];
      }
      this.units[id] = def;
      return id;
    };
    for (const slot of MASHUP_SLOTS) {
      const set = chosen[slot];
      if (!set || slot === 'structures') continue;
      for (const u of set.defs as UnitDef[]) addUnit(set.pack, u);
    }
    const mcvId = mcv && addUnit(mcv.pack, mcv.src);
    const harvesterId = harvester && addUnit(harvester.pack, harvester.src);

    // 7. Buildings that hand out units — refineries and superweapons — hand out this
    //    commander's units, substituting the nearest thing they chose for anything they did not.
    for (const st of seat) {
      const def = st.def;
      if (def.refinery) {
        const { dockX, dockY } = def.refinery;
        def.refinery = harvesterId ? { dockX, dockY, freeUnit: harvesterId } : { dockX, dockY };
      }
      if (st.src.superweapon) {
        const list = ([] as SuperweaponDef[]).concat(st.src.superweapon)
          .filter(sw => !base.faction || factionCanUse(sw, base.faction.id, base.faction.side))
          .map(sw => this.bridgeSuperweapon(sw, st.from, chosen, imported, addUnit))
          .filter((sw): sw is SuperweaponDef => !!sw);
        if (list.length) def.superweapon = list.length === 1 ? list[0] : list;
        else delete def.superweapon;
      }
    }

    // 8. The commander as a faction: colours, and what they start the match with.
    const start: string[] = [];
    if (mcvId) start.push(mcvId);
    const foot = sortedUnits(chosen.infantry, u => u.tech <= 10 && !!u.weapon);
    const wheels = sortedUnits(chosen.vehicle, u => u.tech <= 10 && !!u.weapon);
    if (foot.length) {
      start.push(ns(foot[0].id), ns(foot[0].id));
      const support = foot.find(u => u.role === 'antiair') ?? foot[1] ?? foot[0];
      start.push(ns(support.id));
    }
    if (wheels.length) start.push(ns((wheels.find(u => u.role === 'scout') ?? wheels[0]).id));
    if (start.length < 2 && harvesterId) start.push(harvesterId);

    const sets: MashupSeatSummary['sets'] = {};
    for (const slot of MASHUP_SLOTS) if (loadout[slot]) sets[slot] = loadout[slot];
    const colors = SEAT_COLORS[index % SEAT_COLORS.length];
    this.factions.push({
      id: tag, name: `Commander ${index + 1}`, side: tag, ...colors,
      blurb: MASHUP_SLOTS.filter(s => chosen[s]).map(s => `${MASHUP_SLOT_LABEL[s]}: ${chosen[s]!.faction?.name ?? chosen[s]!.pack.name}`).join(' · '),
      startUnits: start.filter(id => !!this.units[id]),
    });
    return { faction: tag, sets, bridged };
  }

  /**
   * A superweapon that delivers units delivers the commander's own: the same unit where they
   * chose that pack, otherwise the nearest thing of the same kind they did choose, by cost.
   */
  private bridgeSuperweapon(
    sw: SuperweaponDef, from: RulePack, chosen: Partial<Record<MashupSlot, Chosen>>,
    imported: Map<string, string>, addUnit: (pack: RulePack, src: UnitDef) => string,
  ): SuperweaponDef | null {
    const out: SuperweaponDef = { ...sw };
    delete out.factions;
    if (!sw.units?.length) return out;
    const units: string[] = [];
    for (const type of sw.units) {
      const src = from.units[type];
      if (!src) continue;
      const already = imported.get(`${from.id}/${type}`);
      if (already) { units.push(already); continue; }
      const slot = MASHUP_SLOTS.find(s => s !== 'structures' && SLOT_KIND[s as Exclude<MashupSlot, 'structures'>] === src.kind);
      const set = slot && chosen[slot];
      if (!set) continue;
      // Nearest by cost, so a drop of heavy armour stays a drop of heavy armour.
      const pool = (set.defs as UnitDef[]).filter(u => u.kind === src.kind);
      const near = [...pool].sort((a, b) => Math.abs(a.cost - src.cost) - Math.abs(b.cost - src.cost) || (a.id < b.id ? -1 : 1))[0];
      if (near) units.push(addUnit(set.pack, near));
    }
    if (!units.length && (sw.kind === 'paradrop' || sw.kind === 'reinforce')) return null;
    out.units = units;
    return out;
  }

  // ---- the finished pack

  finish(preset: MapPreset): RulePack {
    const arena = this.arena;
    const mechanics: Mechanics = { ...arena.mechanics };
    // Dune's concrete is a property of the ground, not of a side: one slab everybody may lay.
    if (arena.mechanics.concrete) {
      const src = arena.structures[arena.mechanics.concrete.structure];
      if (src) {
        const id = `${MASHUP_PACK_ID}-${src.id}`;
        const slab: StructureDef = { ...src, id, prereqs: [] };
        delete slab.factions;
        this.structures[id] = slab;
        mechanics.concrete = { ...arena.mechanics.concrete, structure: id };
      } else delete mechanics.concrete;
    }
    const sets = this.factions.map(f => f.blurb).join(' | ');
    return {
      id: MASHUP_PACK_ID,
      name: 'Custom Mashup',
      projection: arena.projection,
      terrains: arena.terrains,
      resources: arena.resources,
      armors: MASHUP_ARMORS,
      warheads: this.warheads,
      weapons: this.weapons,
      units: this.units,
      structures: this.structures,
      factions: this.factions,
      maps: [preset],
      startCredits: arena.startCredits,
      buildTicksPer100: arena.buildTicksPer100,
      lowPowerProductionPercent: arena.lowPowerProductionPercent,
      extraFactoryBonus: arena.extraFactoryBonus,
      buildRadius: arena.buildRadius,
      sellRefundPercent: arena.sellRefundPercent,
      mechanics,
      veterancy: arena.veterancy,
      fidelityNote: `Custom Mashup on ${preset.name}${preset.name === arena.name ? '' : ` (${arena.name})`}. ${sets}`,
    };
  }
}

const byTierDef = (a: StructureDef, b: StructureDef) => a.tech - b.tech || a.cost - b.cost || (a.id < b.id ? -1 : 1);
const byTier = (a: SeatStructure, b: SeatStructure) => byTierDef(a.def, b.def);
const cheapest = <T extends Def>(defs: T[]): T | undefined =>
  [...defs].sort((a, b) => a.tech - b.tech || a.cost - b.cost || (a.id < b.id ? -1 : 1))[0];

function sortedUnits(set: Chosen | undefined, pick: (u: UnitDef) => boolean): UnitDef[] {
  if (!set) return [];
  return (set.defs as UnitDef[]).filter(pick).sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
}
