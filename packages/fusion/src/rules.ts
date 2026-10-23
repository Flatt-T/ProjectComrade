// Rule packs: a whole game expressed as data. Dune-style and RA2-style games are two
// packs; a fusion game is another pack that mixes their definitions. All lengths are in
// leptons (256 per cell) unless noted, all durations in ticks (15 per second).

export type Projection = 'ortho' | 'iso';
export type UnitKind = 'infantry' | 'vehicle';
export type QueueKind = 'structure' | 'defense' | 'infantry' | 'vehicle';

export interface TerrainDef {
  id: string;
  name: string;
  /** Can infantry / vehicles enter this terrain? */
  foot: boolean;
  vehicle: boolean;
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
  /** Regrows over time (RA2 ore). */
  regrows?: boolean;
  color: string;
  color2: string;
}

export interface WarheadDef {
  id: string;
  /** Damage percent against each armour type. Missing armour types take 100%. */
  vs: Record<string, number>;
}

export type WeaponVisual = 'bullet' | 'cannon' | 'missile' | 'laser' | 'tesla' | 'prism' | 'sonic' | 'flame' | 'artillery';

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
  /** Converts the target to the attacker's side for this many ticks (Deviator). */
  converts?: number;
  /** Restrict what the weapon will engage (e.g. attack dogs: infantry only). */
  targets?: ('infantry' | 'vehicle' | 'structure')[];
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
   * an entry may list alternatives separated by '|' (e.g. 'a-barracks|s-barracks').
   */
  prereqs: string[];
  /** Factions allowed to build it; omitted means every faction of the pack. */
  factions?: string[];
  /** Tech level 1..10; the lobby's tech setting caps what is available. */
  tech: number;
  harvester?: HarvesterDef;
  /** Deploys into this structure in place (MCV). */
  deploysTo?: string;
  crusher?: boolean;
  crushable?: boolean;
  /** Sprite key for the procedural renderer. */
  shape: string;
  /** AI hint. */
  role?: 'combat' | 'support' | 'scout' | 'siege';
  /** Self-heals slowly (Dune Ordos / RA2 veterancy stand-in). */
  regen?: number;
}

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
  /** Superweapon this building charges and fires. */
  superweapon?: SuperweaponDef;
  shape: string;
}

export type SuperweaponKind = 'missile' | 'storm' | 'ion';

export interface SuperweaponDef {
  id: string;
  name: string;
  kind: SuperweaponKind;
  /** Ticks to charge; charging pauses while the owner is low on power. */
  charge: number;
  damage: number;
  /** Blast radius in leptons. */
  radius: number;
  /** Ticks from launch to impact (missile flight, ion focusing, storm gathering). */
  delay: number;
  /** Storms: lightning strikes spread over `duration` ticks, each hitting `boltRadius`. */
  strikes?: number;
  duration?: number;
  boltRadius?: number;
  /** Only these factions get it from a shared building (e.g. the Harkonnen Palace). */
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
  sandworm?: { count: number; speed: number; sight: number; damage: number; appearAfter: number; eatChance: number };
  /** Spice blooms seed new fields over time. */
  bloom?: { everyTicks: number; radius: number; resource: string };
  /** Resource regrowth on existing cells (RA2 ore). */
  regrowth?: { everyTicks: number; amount: number; spreadChance: number };
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
  /** Credit line shown in-game: these are approximations of the classic values. */
  fidelityNote: string;
}

export function factionCanUse(def: { factions?: string[] }, faction: string): boolean {
  return !def.factions || def.factions.includes(faction);
}

export function prereqsMet(prereqs: string[], owned: Set<string>): boolean {
  return prereqs.every(entry => entry.split('|').some(id => owned.has(id)));
}

export function weaponCanTarget(w: WeaponDef, kind: 'infantry' | 'vehicle' | 'structure'): boolean {
  return !w.targets || w.targets.includes(kind);
}
