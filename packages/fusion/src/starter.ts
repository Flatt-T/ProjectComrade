// Newcomer starter grant (PW11, COMRADE 18 §2.4/§3.1): the versioned composition
// every first spawn receives — one MCV, one harvester, four main battle tanks,
// two light vehicles and eight infantry, plus credits equal to the profile's
// multiplier over the pack's standard skirmish start (resolved by the caller).
//
// The grant is faction-equivalent: each pack faction names (or derives) which
// of its own units fills each role, so a Nod newcomer never receives a GDI
// Rhino. FactionDef.starter carries explicit picks where authored; the derived
// fallback below keeps the grant defined for every pack.
import type { FactionDef, RulePack, UnitDef } from './rules.js';
import { factionCanUse } from './rules.js';

/** Bump when the grant composition or role-resolution rules change. */
export const NEWCOMER_STARTER_VERSION = 1;

export interface StarterLoadout {
  /** Expanded unit ids in grant order: MCV, harvester, 4 tanks, 2 lights, 8 infantry. */
  units: string[];
  /** Role → resolved unit id, for evidence and debugging. */
  picks: { mcv: string; harvester: string; battleTank: string; lightVehicle: string; infantry: string };
}

const usable = (pack: RulePack, faction: FactionDef) =>
  (def: UnitDef) => factionCanUse(def, faction.id, faction.side);

/** Lowest-tech then cheapest unit matching `pred` — the faction's standard-issue pick. */
function pick(pack: RulePack, faction: FactionDef, pred: (d: UnitDef) => boolean): UnitDef | undefined {
  const ok = usable(pack, faction);
  return Object.values(pack.units)
    .filter(d => ok(d) && pred(d))
    .sort((a, b) => a.tech - b.tech || a.cost - b.cost || a.id.localeCompare(b.id))[0];
}

/**
 * Resolve the faction-equivalent starter picks. Explicit `faction.starter`
 * entries win (validated against the pack); otherwise each role derives from
 * the faction's own roster:
 *  - mcv:        the deploysTo unit (construction vehicle)
 *  - harvester:  cheapest harvester-capable vehicle
 *  - battleTank: cheapest crusher combat vehicle (the standard battle tank,
 *                not siege/scout/transport)
 *  - lightVehicle: cheapest scout-role vehicle, else cheapest light support vehicle
 *  - infantry:   cheapest basic infantry
 */
export function starterPicks(pack: RulePack, faction: FactionDef) {
  const explicit = faction.starter;
  if (explicit) {
    const ids = [explicit.mcv, explicit.harvester, explicit.battleTank, explicit.lightVehicle, explicit.infantry];
    if (ids.every(id => {
      const d = pack.units[id];
      return !!d && factionCanUse(d, faction.id, faction.side);
    })) return { ...explicit };
    // A stale explicit pick must not silently grant the wrong unit — derive instead.
  }
  const mcv = pick(pack, faction, d => !!d.deploysTo)
    ?? Object.values(pack.units).find(d => d.deploysTo && usable(pack, faction)(d));
  const harvester = pick(pack, faction, d => !!d.harvester && d.kind === 'vehicle');
  const battleTank = pick(pack, faction, d =>
    d.kind === 'vehicle' && d.role === 'combat' && !!d.crusher && !!d.weapon && !d.deploysTo && !d.transport);
  const lightVehicle = pick(pack, faction, d =>
    d.kind === 'vehicle' && d.role === 'scout' && !d.harvester && !d.deploysTo)
    ?? pick(pack, faction, d =>
      d.kind === 'vehicle' && (d.role === 'scout' || d.role === 'support') && !d.harvester
      && !d.deploysTo && !d.transport && d.armor === 'light');
  const infantry = pick(pack, faction, d => d.kind === 'infantry' && !d.engineer && d.crushable !== false);
  const resolved = {
    mcv: mcv?.id ?? '', harvester: harvester?.id ?? '',
    battleTank: battleTank?.id ?? '', lightVehicle: lightVehicle?.id ?? '',
    infantry: infantry?.id ?? '',
  };
  // A pack that cannot fill every role cannot honour the grant — surface it
  // rather than spawning a partial or wrong-faction army.
  if (Object.values(resolved).some(id => !id)) {
    throw new Error(`starterLoadout: pack ${pack.id} faction ${faction.id} cannot fill every starter role`);
  }
  return resolved;
}

/** The full expanded starter unit list for one newcomer spawn. */
export function starterLoadout(pack: RulePack, faction: FactionDef): StarterLoadout {
  const picks = starterPicks(pack, faction);
  return {
    picks,
    units: [
      picks.mcv, picks.harvester,
      picks.battleTank, picks.battleTank, picks.battleTank, picks.battleTank,
      picks.lightVehicle, picks.lightVehicle,
      ...Array.from({ length: 8 }, () => picks.infantry),
    ],
  };
}
