// Persistent-world universal pack (PW28): one static RulePack containing every
// selectable mashup choice from every registered pack, namespaced by choice.
//
// Unlike composeMashup — which builds a pack per match from per-seat loadouts —
// a persistent region is shared and long-lived: players settle at different
// times and the pack must be identical for every snapshot and journal replay.
// So the union is composed ONCE, deterministically, from the catalogue: every
// structures choice becomes a self-contained ladder (prerequisites bridged
// inside the choice, exactly like a mashup seat), and every unit choice gets
// prerequisite ALTERNATES spanning every structures choice's matching-role
// buildings plus a guaranteed service producer per queue. A player's
// MashupLoadout then resolves to a stable set of namespaced def ids
// (`allowedDefs`) the engine checks instead of factionCanUse — the same
// mechanism that keeps each commander's sidebar to their own choices.
import {
  RulePack, StructureDef, SuperweaponDef, UnitDef, UnitKind, WeaponDef, WarheadDef,
} from './rules.js';
import {
  MASHUP_ARMORS, MASHUP_PACKS, MASHUP_SLOT_LABEL, MASHUP_SLOTS, ROLE_FALLBACK,
  MashupChoice, MashupLoadout, MashupSlot, mashupCatalogue, resolveChoice, rolesOf, spreadWarhead,
} from './mashup.js';
import { tdPack } from './packs/td.js';

/** The pack id snapshots and region specs pin for the persistent universal world. */
export const WORLD_PACK_ID = 'mashup-world';

type Def = UnitDef | StructureDef;

const NEEDED_QUEUES: UnitKind[] = ['infantry', 'vehicle', 'aircraft', 'naval'];

/** Deterministic, URL/DB-safe namespacing: 'w-st-td-gdi-barracks'. */
const ns = (slot: string, choiceKey: string, id: string) =>
  `w-${slot}-${choiceKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}-${id}`;

const byTierDef = (a: StructureDef, b: StructureDef) => a.tech - b.tech || a.cost - b.cost || (a.id < b.id ? -1 : 1);
const cheapest = <T extends Def>(defs: T[]): T | undefined =>
  [...defs].sort((a, b) => a.tech - b.tech || a.cost - b.cost || (a.id < b.id ? -1 : 1))[0];

/** Weapons and warheads shared across the whole union, keyed by source pack. */
class WeaponBank {
  private weapons: Record<string, WeaponDef> = {};
  private warheads: Record<string, WarheadDef> = {};
  constructor(private packs: RulePack[]) {}
  weapon(pack: RulePack, id: string | undefined): string | undefined {
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
  get Weapons() { return this.weapons; }
  get Warheads() { return this.warheads; }
}

export interface WorldPackResult {
  pack: RulePack;
  /** The catalogue the loadout picker offers (deduplicated, catalogue order). */
  choices: Record<MashupSlot, MashupChoice[]>;
}

/**
 * Compose the universal persistent pack. Pure and order-stable: same inputs
 * always produce the same pack, so every region, snapshot and client agrees.
 */
export function composeWorldPack(packs: RulePack[] = MASHUP_PACKS): WorldPackResult {
  const catalogue = mashupCatalogue(packs);
  const bank = new WeaponBank(packs);
  const units: Record<string, UnitDef> = {};
  const structures: Record<string, StructureDef> = {};

  // -- 1. Structures: every choice becomes a self-contained ladder. ----------
  interface SeatStructure { id: string; def: StructureDef; from: RulePack; src: StructureDef }
  // role -> list of (choiceKey, SeatStructure) across ALL choices, for unit prereq alternates.
  const roleIndex = new Map<string, { choice: string; st: SeatStructure }[]>();

  for (const choice of catalogue.choices.structures) {
    const { pack, defs } = resolveChoice(choice.key, 'structures', packs);
    const seat: SeatStructure[] = [];
    for (const src of defs as StructureDef[]) {
      const id = ns('st', choice.key, src.id);
      if (seat.some(s => s.id === id)) continue;
      const def: StructureDef = { ...src, id, prereqs: [] };
      delete def.factions;
      delete def.doctrine;
      // freeUnit names a source-pack id; the engine resolves the owner's own
      // harvester on the universal pack instead.
      if (def.refinery) def.refinery = { dockX: def.refinery.dockX, dockY: def.refinery.dockY };
      def.weapon = bank.weapon(pack, src.weapon);
      def.deathWeapon = bank.weapon(pack, src.deathWeapon);
      seat.push({ id, def, from: pack, src });
    }
    // Bridge prerequisites onto this choice's own ladder (mashup seat logic).
    const byRole = new Map<string, SeatStructure[]>();
    for (const st of [...seat].sort((a, b) => byTierDef(a.def, b.def))) {
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
    const bridge = (prereqs: string[], from: RulePack): string[] => {
      const out: string[] = [];
      for (const entry of prereqs) {
        const alts: string[] = [];
        for (const alt of entry.split('|')) {
          const [id, level] = alt.split('@');
          const srcDef = from.structures[id];
          if (!srcDef) continue;
          for (const role of rolesOf(srcDef)) {
            const list = target(role);
            if (!list.length) continue;
            const sides = (s: StructureDef) => (s.factions ?? []).join(',');
            const peers = Object.values(from.structures)
              .filter(s => rolesOf(s).includes(role) && sides(s) === sides(srcDef)).sort(byTierDef);
            const rank = Math.max(0, peers.findIndex(s => s.id === srcDef.id));
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
    for (const st of seat) {
      st.def.prereqs = bridge(st.src.prereqs, st.from);
      structures[st.id] = st.def;
      for (const role of rolesOf(st.def)) {
        roleIndex.set(role, [...(roleIndex.get(role) ?? []), { choice: choice.key, st }]);
      }
    }
  }

  // Producers per queue across every structures choice — the alternates a unit
  // may name, and the pool service producers are picked from.
  const producersFor = (queue: string): SeatStructure[] =>
    [...roleIndex.entries()]
      .filter(([role]) => role === `produces:${queue}`)
      .flatMap(([, list]) => list.map(h => h.st))
      .filter(s => s.def.produces === queue);

  // -- 2. Service producers: one cheapest producer per pack per queue, open to
  //       every loadout so any chosen force can actually be fielded. ---------
  const svcStructures: StructureDef[] = [];
  for (const pack of packs) {
    for (const queue of NEEDED_QUEUES) {
      const candidates = Object.values(pack.structures)
        .filter(s => s.produces === queue || (queue === 'vehicle' && s.produces === 'starport'));
      const pick = cheapest(candidates as StructureDef[]);
      if (!pick) continue;
      const id = ns('svc', `${pack.id}-${queue}`, pick.id);
      if (structures[id]) continue;
      const def: StructureDef = { ...pick, id, prereqs: [], tech: 1 };
      delete def.factions;
      delete def.doctrine;
      def.weapon = bank.weapon(pack, pick.weapon);
      def.deathWeapon = bank.weapon(pack, pick.deathWeapon);
      structures[id] = def;
      svcStructures.push(def);
    }
  }

  // -- 3. Units: every non-structures choice, prereqs as cross-choice alternates.
  const addUnit = (slot: Exclude<MashupSlot, 'structures'>, choiceKey: string, pack: RulePack, src: UnitDef): string => {
    const id = ns(`u-${slot}`, choiceKey, src.id);
    if (units[id]) return id;
    const def: UnitDef = { ...src, id, prereqs: [...src.prereqs] };
    delete def.factions;
    delete def.doctrine;
    def.deploysTo = src.deploysTo ? 'yard' : undefined; // sentinel: engine resolves the player's own yard
    def.weapon = bank.weapon(pack, src.weapon);
    def.altWeapon = bank.weapon(pack, src.altWeapon);
    def.deployWeapon = bank.weapon(pack, src.deployWeapon);
    def.deathWeapon = bank.weapon(pack, src.deathWeapon);
    if (!MASHUP_ARMORS.includes(def.armor)) def.armor = 'heavy';
    // Re-point building prerequisites at role-matched candidates across EVERY
    // structures choice: the player only ever owns their own choice's ladder,
    // so the alternates collapse onto it — and onto service producers.
    const out: string[] = [];
    for (const entry of src.prereqs) {
      const alts: string[] = [];
      for (const alt of entry.split('|')) {
        const [pid, level] = alt.split('@');
        const srcDef = pack.structures[pid];
        if (!srcDef) continue;
        for (const role of rolesOf(srcDef)) {
          for (const hit of roleIndex.get(role) ?? []) {
            const want = Math.min(Number(level ?? 0), hit.st.def.upgrades ?? 0);
            const token = want > 0 ? `${hit.st.id}@${want}` : hit.st.id;
            if (!alts.includes(token)) alts.push(token);
          }
          // Service producers cover the bare 'produces:<queue>' role too.
          for (const svc of svcStructures) {
            if (svc.produces === role.slice('produces:'.length) || rolesOf(svc).includes(role)) {
              alts.push(svc.id);
            }
          }
          break; // first matching role wins, like the seat bridge
        }
      }
      const token = alts.join('|');
      if (token && !out.includes(token)) out.push(token);
    }
    // Guarantee a producer for this unit's queue exists among the alternates.
    const queue: string = def.queue ?? def.kind;
    const prodAlts = producersFor(queue).map(s => s.id);
    for (const svc of svcStructures) {
      if (svc.produces === queue) prodAlts.push(svc.id);
    }
    const prodEntry = [...new Set(prodAlts)].join('|');
    if (prodEntry) out.push(prodEntry);
    def.prereqs = out;
    units[id] = def;
    return id;
  };

  for (const slot of MASHUP_SLOTS) {
    if (slot === 'structures') continue;
    for (const choice of catalogue.choices[slot]) {
      const { pack, defs } = resolveChoice(choice.key, slot, packs);
      for (const u of defs as UnitDef[]) {
        if (u.tech > 10) continue;
        addUnit(slot, choice.key, pack, u);
      }
    }
  }

  // -- 4. Service units every loadout can field: the cheapest deployable MCV
  //       and harvester across all packs, plus each choice's own if present.
  const svcUnits: UnitDef[] = [];
  const mcvPick = cheapest(Object.values(packs).flatMap(p =>
    Object.values(p.units).filter(u => !!u.deploysTo)) as UnitDef[]);
  const harvPick = cheapest(Object.values(packs).flatMap(p =>
    Object.values(p.units).filter(u => !!u.harvester)) as UnitDef[]);
  const addSvcUnit = (src: UnitDef | undefined, tag: string) => {
    if (!src) return;
    const pack = packs.find(p => Object.values(p.units).includes(src))!;
    const id = ns('svc', tag, src.id);
    if (units[id]) return;
    const def: UnitDef = { ...src, id, prereqs: [] };
    delete def.factions;
    delete def.doctrine;
    if (src.deploysTo) def.deploysTo = 'yard';
    def.weapon = bank.weapon(pack, src.weapon);
    def.deathWeapon = bank.weapon(pack, src.deathWeapon);
    if (!MASHUP_ARMORS.includes(def.armor)) def.armor = 'heavy';
    units[id] = def;
    svcUnits.push(def);
  };
  addSvcUnit(mcvPick, 'mcv');
  addSvcUnit(harvPick, 'harvester');

  // -- 5. Superweapons: bridge delivered units onto the union like the seat
  //       composer does — nearest same-kind unit by cost across all choices.
  const allUnits = () => Object.values(units);
  const bridgeSw = (sw: SuperweaponDef, from: RulePack): SuperweaponDef | null => {
    const out: SuperweaponDef = { ...sw };
    delete out.factions;
    if (!sw.units?.length) return out;
    const delivered: string[] = [];
    for (const type of sw.units) {
      const src = from.units[type];
      if (!src) continue;
      const pool = allUnits().filter(u => u.kind === src.kind);
      const near = [...pool].sort((a, b) => Math.abs(a.cost - src.cost) - Math.abs(b.cost - src.cost) || (a.id < b.id ? -1 : 1))[0];
      if (near) delivered.push(near.id);
    }
    if (!delivered.length && (sw.kind === 'paradrop' || sw.kind === 'reinforce')) return null;
    out.units = delivered;
    return out;
  };
  // Re-resolve superweapons per choice, bridging delivered units onto the union.
  for (const choice of catalogue.choices.structures) {
    const { pack, defs } = resolveChoice(choice.key, 'structures', packs);
    for (const s of defs as StructureDef[]) {
      if (!s.superweapon) continue;
      const id = ns('st', choice.key, s.id);
      const def = structures[id];
      if (!def) continue;
      const list = ([] as SuperweaponDef[]).concat(s.superweapon)
        .map(sw => bridgeSw(sw, pack))
        .filter((sw): sw is SuperweaponDef => !!sw);
      if (list.length) def.superweapon = list.length === 1 ? list[0] : list;
      else delete def.superweapon;
    }
  }

  // -- 6. The arena: Tiberian Dawn supplies terrain, resources, mechanics and
  //       economy — the persistent worldgen is already tuned to it.
  const arena = tdPack;
  const factions = [{
    id: 'commander', name: 'Commander', side: 'commander',
    color: '#8a8f98', accent: '#dfe4ea',
    blurb: 'Custom loadout — every pack, every faction.',
    startUnits: [] as string[],
  }];

  return {
    pack: {
      id: WORLD_PACK_ID,
      name: 'Persistent World',
      projection: arena.projection,
      terrains: arena.terrains,
      resources: arena.resources,
      armors: MASHUP_ARMORS,
      warheads: bank.Warheads,
      weapons: bank.Weapons,
      units,
      structures,
      factions,
      maps: arena.maps,
      startCredits: arena.startCredits,
      buildTicksPer100: arena.buildTicksPer100,
      lowPowerProductionPercent: arena.lowPowerProductionPercent,
      extraFactoryBonus: arena.extraFactoryBonus,
      buildRadius: arena.buildRadius,
      sellRefundPercent: arena.sellRefundPercent,
      mechanics: arena.mechanics,
      veterancy: arena.veterancy,
      fidelityNote: `Persistent universal world: ${catalogue.choices.structures.length} building sets, ` +
        `${Object.values(catalogue.choices).reduce((n, s) => n + s.length, 0)} force sets across ${packs.length} packs.`,
    },
    choices: catalogue.choices,
  };
}

// ---------------------------------------------------------------------------
// Loadout → allowed definitions + starter grant
// ---------------------------------------------------------------------------

/** Cached composition: the catalogue and def-id maps are pure functions of the packs. */
let cached: WorldPackResult | undefined;
export function worldPack(packs: RulePack[] = MASHUP_PACKS): WorldPackResult {
  if (!cached) cached = composeWorldPack(packs);
  return cached;
}

/** The def id a choice's source def was namespaced to — must match composeWorldPack. */
export function worldDefId(slot: MashupSlot, choiceKey: string, srcId: string): string {
  return ns(slot === 'structures' ? 'st' : `u-${slot}`, choiceKey, srcId);
}

/** Validate a settle-time loadout; returns a problem string or null. */
export function worldLoadoutProblem(loadout: MashupLoadout | undefined, packs: RulePack[] = MASHUP_PACKS): string | null {
  if (!loadout?.structures) return 'Choose whose buildings you are fighting with.';
  for (const slot of MASHUP_SLOTS) {
    const key = loadout[slot];
    if (!key) continue;
    try { resolveChoice(key, slot, packs); } catch { return `${MASHUP_SLOT_LABEL[slot]}: that set is no longer available.`; }
  }
  const forces = MASHUP_SLOTS.some(s => s !== 'structures' && loadout[s]);
  if (!forces) return 'Choose at least one kind of force to fight with.';
  return null;
}

/** First catalogue choice per slot — the deterministic fallback loadout. */
export function defaultWorldLoadout(): MashupLoadout {
  const { choices } = worldPack();
  const out: MashupLoadout = { structures: choices.structures[0].key };
  for (const slot of ['infantry', 'vehicle', 'aircraft', 'naval'] as const) {
    if (choices[slot].length) out[slot] = choices[slot][0].key;
  }
  return out;
}

/**
 * Rebuild a stored settlement loadout (jsonb) into a valid MashupLoadout, or
 * fall back to the default when the row predates loadouts or is malformed.
 */
export function loadoutFromStored(value: unknown): MashupLoadout {
  const v = value as MashupLoadout | null | undefined;
  return v && !worldLoadoutProblem(v) ? v : defaultWorldLoadout();
}

/**
 * Every def id a loadout may build/field: the chosen sets' namespaced defs,
 * the service producers and service units every commander gets, and nothing
 * else. Deterministic — the same loadout always yields the same set.
 */
export function worldAllowedDefs(loadout: MashupLoadout, packs: RulePack[] = MASHUP_PACKS): string[] {
  const { pack } = worldPack(packs);
  const allowed = new Set<string>();
  for (const st of Object.values(pack.structures)) {
    if (st.id.startsWith('w-svc-')) allowed.add(st.id);
  }
  for (const u of Object.values(pack.units)) {
    if (u.id.startsWith('w-svc-')) allowed.add(u.id);
  }
  for (const slot of MASHUP_SLOTS) {
    const key = loadout[slot];
    if (!key) continue;
    const { defs } = resolveChoice(key, slot, packs);
    for (const d of defs as Def[]) allowed.add(worldDefId(slot, key, d.id));
  }
  return [...allowed].sort();
}

/**
 * The starter grant for a loadout: an MCV (own vehicle pick or the service
 * one), two of the cheapest armed infantry plus a support pick, and the
 * cheapest scout/vehicle — mirroring the mashup seat's opening army.
 */
export function worldStarterUnits(loadout: MashupLoadout, packs: RulePack[] = MASHUP_PACKS): string[] {
  const { pack } = worldPack(packs);
  const units = pack.units;
  const chosenUnits = (slot: Exclude<MashupSlot, 'structures'>): UnitDef[] => {
    const key = loadout[slot];
    if (!key) return [];
    const { defs } = resolveChoice(key, slot, packs);
    return (defs as UnitDef[]).map(u => units[worldDefId(slot, key, u.id)]).filter((u): u is UnitDef => !!u);
  };
  const svc = (tag: string) => Object.values(units).find(u => u.id.startsWith(`w-svc-${tag}-`));
  const start: string[] = [];
  // deploysTo is the 'yard' sentinel on every MCV-class unit; the engine resolves
  // the concrete yard per player at deploy time.
  const mcv = cheapest(chosenUnits('vehicle').filter(u => !!u.deploysTo)) ?? svc('mcv');
  if (mcv) start.push(mcv.id);
  const foot = chosenUnits('infantry').filter(u => u.tech <= 10 && !!u.weapon)
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  if (foot.length) {
    start.push(foot[0].id, foot[0].id);
    const support = foot.find(u => u.role === 'antiair') ?? foot[1] ?? foot[0];
    start.push(support.id);
  }
  const wheels = chosenUnits('vehicle').filter(u => u.tech <= 10 && !!u.weapon && u.id !== mcv?.id)
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1));
  const scout = wheels.find(u => u.role === 'scout') ?? wheels[0];
  if (scout) start.push(scout.id);
  if (start.length < 2) {
    const harv = svc('harvester');
    if (harv) start.push(harv.id);
  }
  return [...new Set(start)].filter(id => !!units[id]);
}
