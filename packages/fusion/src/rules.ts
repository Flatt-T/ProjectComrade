// Rule packs: a whole game expressed as data. Dune-style and RA2-style games are two
// packs; a fusion game is another pack that mixes their definitions. All lengths are in
// leptons (256 per cell) unless noted, all durations in ticks (15 per second).

export type Projection = 'ortho' | 'iso';
export type UnitKind = 'infantry' | 'vehicle' | 'aircraft' | 'naval';
/** Movement class used for pathfinding and terrain checks. */
export type MoveClass = UnitKind | 'amphibious';
export type QueueKind = 'structure' | 'defense' | 'infantry' | 'vehicle' | 'aircraft' | 'naval' | 'starport';
export type TargetKind = 'infantry' | 'vehicle' | 'aircraft' | 'naval' | 'structure';

export interface TerrainDef {
  id: string;
  name: string;
  /** Can infantry / vehicles enter this terrain? */
  foot: boolean;
  vehicle: boolean;
  /** Navigable by ships. */
  water?: boolean;
  /** Can structures be placed here (before mechanic restrictions)? */
  buildable: boolean;
  /** Movement speed multiplier in percent. */
  speed: number;
  /** Open sand that sandworms roam (Dune mechanic). */
  sand?: boolean;
  /** Base colour and a second tone for procedural texturing. */
  color: string;
  color2: string;
}

export interface ResourceDef {
  id: string;
  name: string;
  /** Credits per unit harvested. */
  value: number;
  /** Maximum units a cell can hold. */
  max: number;
  /** Spreads into neighbouring cells over time (RA2 ore). */
  regrows?: boolean;
  /** Mined-out cells of an original field grow back one unit every this many ticks. */
  regrowEvery?: number;
  color: string;
  color2: string;
}

export interface WarheadDef {
  id: string;
  /** Damage percent against each armour type. Missing armour types take 100%. */
  vs: Record<string, number>;
}

export type WeaponVisual = 'bullet' | 'cannon' | 'missile' | 'laser' | 'tesla' | 'prism' | 'sonic' | 'flame' | 'artillery' | 'chrono' | 'psychic' | 'rad' | 'torpedo' | 'bomb';

export interface WeaponDef {
  id: string;
  damage: number;
  range: number;
  minRange?: number;
  /** Ticks between shots. */
  rof: number;
  warhead: string;
  /** Projectile speed in leptons/tick; 0 means the hit lands instantly. */
  speed: number;
  /** Splash radius in leptons; damage falls off linearly to the edge. */
  splash?: number;
  /** Shots per volley. */
  burst?: number;
  visual: WeaponVisual;
  /** Damages every unit in a line to the target (Sonic Tank). */
  line?: boolean;
  /**
   * Takes control of the target instead of damaging it: positive = ticks before it
   * reverts (Deviator), -1 = permanent (Yuri's mind control, one victim at a time).
   */
  converts?: number;
  /** What the weapon may engage. Omitted means ground targets only (no aircraft). */
  targets?: TargetKind[];
  /** Firing destroys the shooter (Demolition Truck, Crazy Ivan's bomb run). */
  suicide?: boolean;
}

export interface HarvesterDef {
  /** Units of resource carried when full. */
  capacity: number;
  /** Ticks per unit gathered. */
  gather: number;
  /** Ticks per unit unloaded at the refinery. */
  unload: number;
  /** Teleports home to unload instead of driving (RA2 Chrono Miner). */
  teleport?: boolean;
}

export interface UnitDef {
  id: string;
  name: string;
  kind: UnitKind;
  cost: number;
  hp: number;
  armor: string;
  /** Leptons per tick at 100% terrain speed. */
  speed: number;
  /** Facing units per tick a vehicle can turn; infantry turn instantly. */
  turn?: number;
  /** Sight radius in cells. */
  sight: number;
  weapon?: string;
  /**
   * Structures that must exist before this can be built. Every entry is required;
   * an entry may list alternatives separated by '|' (e.g. 'a-barracks|s-barracks'),
   * and 'heavyfactory@1' additionally needs that building upgraded once.
   */
  prereqs: string[];
  /** Factions or sides allowed to build it; omitted means everyone in the pack. */
  factions?: string[];
  /** Tech level 1..10; the lobby's tech setting caps what is available. */
  tech: number;
  /** Production tab override (e.g. the Kirov rolls out of the War Factory). */
  queue?: QueueKind;
  harvester?: HarvesterDef;
  /** Deploys into this structure in place (MCV). */
  deploysTo?: string;
  crusher?: boolean;
  crushable?: boolean;
  /** Moves over both land and water. */
  amphibious?: boolean;
  /** Aircraft: shots before returning to an airfield to rearm (omitted = unlimited). */
  ammo?: number;
  /**
   * Sortie aircraft keep hunting until the magazine is empty, fly attack passes
   * instead of hovering, then restock and return to the fight.
   */
  sortie?: boolean;
  /** Fired when the primary weapon is out of range (Jedi Force, Sith lightning). */
  altWeapon?: string;
  /** Flying height in cells, for drawing. */
  altitude?: number;
  /** Dune Carryall: automatically airlifts harvesters. */
  carrier?: boolean;
  /** Carries this many passenger slots (infantry take 1, vehicles 3). */
  transport?: number;
  /** Only infantry may board (Night Hawk). */
  infantryOnly?: boolean;
  // ---- abilities
  /** Captures enemy buildings or fully repairs friendly ones, and is used up. */
  engineer?: boolean;
  /** Infiltrates enemy buildings for an effect that depends on the building. */
  spy?: boolean;
  /** Plants a charge on a building (or anything, for Crazy Ivan) that detonates after this many ticks. */
  c4?: number;
  /** Latches onto a vehicle and destroys it from inside, this much damage per second. */
  terror?: number;
  /** Becomes invisible to the enemy while standing still (Mirage Tank). */
  disguise?: boolean;
  /** Deploying swaps to this weapon and roots the unit (Desolator, GI sandbags). */
  deployWeapon?: string;
  /** Deploying lures sandworms (Thumper). */
  lure?: boolean;
  /** Explodes with this weapon when destroyed (Devastator, Demolition Truck, Kirov). */
  deathWeapon?: string;
  /** Used up by its special ability (Saboteur, Crazy Ivan's charge is not). Engineers and spies always are. */
  expendable?: boolean;
  /** Not copied by Cloning Vats. */
  noClone?: boolean;
  /** Sold at the Dune Starport at the fluctuating CHOAM price. */
  starport?: boolean;
  /** Sprite key for the procedural renderer. */
  shape: string;
  /** AI hint. */
  role?: 'combat' | 'support' | 'scout' | 'siege' | 'antiair';
  /** Self-heals slowly. */
  regen?: number;
}

export type InfiltrationEffect = 'steal' | 'blackout' | 'reshroud' | 'veteran';

export interface StructureDef {
  id: string;
  name: string;
  cost: number;
  hp: number;
  armor: string;
  /** Footprint in cells. */
  w: number;
  h: number;
  /** Positive generates power, negative consumes it. */
  power: number;
  sight: number;
  prereqs: string[];
  factions?: string[];
  tech: number;
  /** Sidebar tab it appears under. */
  queue: 'structure' | 'defense';
  /** Production queue this building enables. */
  produces?: QueueKind;
  /** The building that places other buildings. */
  constructionYard?: boolean;
  /** Harvesters unload here; dock is relative to the top-left cell. */
  refinery?: { dockX: number; dockY: number; freeUnit?: string };
  /** Credit storage it adds. */
  storage?: number;
  weapon?: string;
  /** Weapon goes offline when the owner is low on power. */
  needsPower?: boolean;
  radar?: boolean;
  /** Floor tile (Dune concrete); occupies no blocking footprint once placed. */
  floor?: boolean;
  wall?: boolean;
  /** Must be built on water (shipyards). */
  onWater?: boolean;
  /** Aircraft land here to rearm. */
  airfield?: boolean;
  /** Repairs friendly vehicles parked next to it (Service Depot, Repair Pad). */
  repairPad?: boolean;
  /** Every infantry unit trained also produces a free copy (Cloning Vats). */
  cloning?: boolean;
  /** Extra percent on every harvester load (Ore Purifier). */
  incomeBonus?: number;
  /** Shrouds the area from enemies (Gap Generator), radius in cells. */
  gap?: number;
  /** Reveals the whole map to its owner (Spy Satellite Uplink). */
  satellite?: boolean;
  /** Reveals enemy units within this radius in cells (Psychic Sensor). */
  sensor?: number;
  /** Explodes with this weapon when destroyed (Nuclear Reactor). */
  deathWeapon?: string;
  /** Percent off every vehicle, aircraft and ship (Industrial Plant); does not stack. */
  costReduction?: number;
  /** Number of upgrades the building offers (Dune factories), and their price. */
  upgrades?: number;
  upgradeCost?: number;
  /** What a spy achieves inside it; derived from the building's role when omitted. */
  infiltrate?: InfiltrationEffect;
  /** Superweapon this building charges and fires; a list gives each faction its own (Dune palaces). */
  superweapon?: SuperweaponDef | SuperweaponDef[];
  shape: string;
}

export type SuperweaponKind = 'missile' | 'storm' | 'ion' | 'laser' | 'tractor' | 'shield' | 'reinforce' | 'paradrop' | 'chrono' | 'curtain' | 'reveal';

export interface SuperweaponDef {
  id: string;
  name: string;
  kind: SuperweaponKind;
  /** Ticks to charge; charging pauses while the owner is low on power. */
  charge: number;
  damage: number;
  /** Blast or effect radius in leptons. */
  radius: number;
  /** Ticks from launch to impact (missile flight, ion/laser focusing, storm gathering). */
  delay: number;
  /** Storms: lightning strikes spread over `duration` ticks, each hitting `boltRadius`. */
  strikes?: number;
  /** Storm length, Iron Curtain / planetary shield, or tractor lock. */
  duration?: number;
  boltRadius?: number;
  /** Reinforcements and paradrops: the units delivered. */
  units?: string[];
  /** Reinforcements appear beside the building rather than at the target (Saboteur). */
  atBase?: boolean;
  /** Only these factions or sides get it from a shared building (e.g. the Harkonnen Palace). */
  factions?: string[];
}

export interface FactionDef {
  id: string;
  name: string;
  side: string;
  color: string;
  accent: string;
  blurb: string;
  startUnits: string[];
}

export interface MapField { x: number; y: number; r: number; resource: string; amount?: number }
export interface MapFeature {
  /** Terrain id painted by this feature. */
  terrain: string;
  shape: 'circle' | 'rect' | 'ridge';
  x: number; y: number;
  r?: number; w?: number; h?: number;
  /** Ridges run to this end point. */
  x2?: number; y2?: number;
}
export interface MapPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  maxPlayers: number;
  /** Base terrain id painted first. */
  base: string;
  /** Player start cells, in slot order. */
  starts: { x: number; y: number }[];
  features: MapFeature[];
  fields: MapField[];
  /** Amount of procedural texture variation (decorative terrain sprinkled from features). */
  roughness?: number;
}

export interface Mechanics {
  /** Structures may only be placed on these terrains (Dune: rock). */
  buildOn?: string[];
  /** Concrete slabs: placements not fully on concrete start at this HP percent. */
  concrete?: { structure: string; uncoveredStartPercent: number };
  sandworm?: {
    count: number; speed: number; sight: number; damage: number; appearAfter: number; eatChance: number;
    /** Terrain ids worms move through (default: terrains marked `sand`). Fusions may add 'water'. */
    habitat?: string[];
    /** Worms surface and prowl within this many cells of resource fields. */
    nearResources?: number;
    /** Visual / biome form per terrain id (Conquer: tusken on sand, ewok in trees, opee in water). */
    form?: Record<string, string>;
  };
  /** Spice blooms seed new fields over time. */
  bloom?: { everyTicks: number; radius: number; resource: string };
  /** Resource regrowth on existing cells (RA2 ore). */
  regrowth?: { everyTicks: number; amount: number; spreadChance: number };
  /** Dune Starport: CHOAM prices drift between these percentages every `every` ticks. */
  market?: { min: number; max: number; every: number };
}

export interface Veterancy {
  /** Experience (value of kills) needed, as a multiple of the unit's own cost. */
  veteran: number;
  elite: number;
  /** Damage and armour bonus per rank, in percent. */
  firepower: number;
  armour: number;
}

export interface RulePack {
  id: string;
  name: string;
  projection: Projection;
  terrains: TerrainDef[];
  resources: ResourceDef[];
  armors: string[];
  warheads: Record<string, WarheadDef>;
  weapons: Record<string, WeaponDef>;
  units: Record<string, UnitDef>;
  structures: Record<string, StructureDef>;
  factions: FactionDef[];
  maps: MapPreset[];
  startCredits: { low: number; standard: number; high: number };
  /** Ticks to build 100 credits' worth at full power with one factory. */
  buildTicksPer100: number;
  lowPowerProductionPercent: number;
  /** Production speed bonus per additional factory of the same type, in percent. */
  extraFactoryBonus: number;
  /** Cells from an existing friendly structure where new structures may be placed. */
  buildRadius: number;
  sellRefundPercent: number;
  mechanics: Mechanics;
  veterancy?: Veterancy;
  /** Credit line shown in-game: these are approximations of the classic values. */
  fidelityNote: string;
}

/** Lists name factions (countries/houses) or whole sides; either matches. */
export function factionCanUse(def: { factions?: string[] }, faction: string, side?: string): boolean {
  return !def.factions || def.factions.includes(faction) || (!!side && def.factions.includes(side));
}

/** `owned` maps structure type to the player's upgrade level for it (0 when not upgraded). */
export function prereqsMet(prereqs: string[], owned: Map<string, number> | Set<string>): boolean {
  const level = (id: string) => owned instanceof Map ? owned.get(id) : owned.has(id) ? 0 : undefined;
  return prereqs.every(entry => entry.split('|').some(alt => {
    const [id, need] = alt.split('@');
    const have = level(id);
    return have !== undefined && have >= Number(need ?? 0);
  }));
}

export function weaponCanTarget(w: WeaponDef, kind: TargetKind): boolean {
  return w.targets ? w.targets.includes(kind) : kind !== 'aircraft';
}
