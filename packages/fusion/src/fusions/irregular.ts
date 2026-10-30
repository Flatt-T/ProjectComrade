// Fusion: Irregular Warfare — asymmetric conflict as a rule pack, played straight.
//
// Four invented belligerents in an invented country, arranged along the axis that decides
// real irregular conflicts: how much money and sponsorship a force has. The Valley Cadres
// fight on foot with improvised means; the Coastal Syndicate buys what smuggling pays for;
// the Northern Vanguard fields a sponsor's surplus armour and a strike drone; the Mandate
// Force is the conventional army, with everything except cheap mistakes.
//
// Nothing here maps to a real organisation, and nothing here is a joke. The asymmetry is
// the subject: cheap irregular forces trade armour and air for numbers, concealment and
// standoff, and a conventional force's advantage is bought at a price per shot.
//
// Two deliberate design statements, both of them things the engine already expresses:
//  * Drones split by tier. A large fixed-wing drone is a vehicle-tier asset and rolls out
//    of the Workshop. A small quadcopter dropping a munition is a high-value infantry
//    unit — a two-person team, fragile, expensive, and lethal at standoff.
//  * Protected sites conceal. An Aid Station shrouds the ground around it rather than
//    shooting: a force that sites itself among protected structures is harder to see and
//    harder to answer. That is the tactical fact, given as a mechanic and nothing more.
import { MapFeature, MapField, MapPreset, RulePack } from '../rules';
import { mirror, quad } from '../packs/mapkit';

const IRREGULAR = ['cadres', 'coastal', 'vanguard'];
const m2 = <T extends MapFeature | MapField>(items: T[], w: number, h: number) => mirror(items, w, h);

const maps: MapPreset[] = [
  {
    id: 'wadi-road', name: 'Wadi Road', width: 64, height: 64, maxPlayers: 2, base: 'sand', roughness: 2,
    description: 'One metalled road through a dry valley. Whoever holds the road moves; whoever holds the high ground decides whether they arrive.',
    starts: [{ x: 9, y: 32 }, { x: 54, y: 31 }],
    features: [
      ...m2<MapFeature>([
        { terrain: 'urban', shape: 'rect', x: 6, y: 28, w: 7, h: 8 },
        { terrain: 'rough', shape: 'circle', x: 22, y: 18, r: 4 },
        { terrain: 'cliff', shape: 'ridge', x: 24, y: 10, x2: 24, y2: 24, r: 1 },
        { terrain: 'scrub', shape: 'circle', x: 20, y: 46, r: 3 },
      ], 64, 64),
      { terrain: 'road', shape: 'rect', x: 0, y: 31, w: 64, h: 2 },
      { terrain: 'urban', shape: 'rect', x: 28, y: 26, w: 8, h: 4 },
      { terrain: 'urban', shape: 'rect', x: 28, y: 34, w: 8, h: 4 },
    ],
    fields: [
      ...m2<MapField>([{ x: 16, y: 20, r: 4, resource: 'crude' }, { x: 14, y: 44, r: 3, resource: 'crude' }], 64, 64),
      { x: 32, y: 32, r: 4, resource: 'crude' },
      { x: 30, y: 20, r: 2, resource: 'contraband' },
      { x: 33, y: 43, r: 2, resource: 'contraband' },
    ],
  },
  {
    id: 'delta-channels', name: 'Delta Channels', width: 80, height: 80, maxPlayers: 4, base: 'clear', roughness: 2,
    description: 'A silted river delta. Boats reach everywhere, roads reach almost nowhere, and the contraband is out in the channels.',
    starts: [{ x: 12, y: 12 }, { x: 67, y: 67 }, { x: 67, y: 12 }, { x: 12, y: 67 }],
    features: [
      ...quad<MapFeature>([
        { terrain: 'urban', shape: 'rect', x: 9, y: 9, w: 8, h: 8 },
        { terrain: 'scrub', shape: 'circle', x: 26, y: 12, r: 4 },
        { terrain: 'rough', shape: 'circle', x: 30, y: 30, r: 3 },
      ], 80, 80),
      { terrain: 'water', shape: 'ridge', x: 0, y: 40, x2: 80, y2: 40, r: 3 },
      { terrain: 'water', shape: 'ridge', x: 40, y: 0, x2: 40, y2: 80, r: 3 },
      { terrain: 'water', shape: 'circle', x: 40, y: 40, r: 7 },
      { terrain: 'road', shape: 'rect', x: 18, y: 38, w: 44, h: 1 },
    ],
    fields: [
      ...quad<MapField>([{ x: 22, y: 20, r: 4, resource: 'crude' }, { x: 12, y: 30, r: 3, resource: 'crude' }], 80, 80),
      { x: 40, y: 26, r: 3, resource: 'contraband' },
      { x: 40, y: 54, r: 3, resource: 'contraband' },
      { x: 26, y: 40, r: 2, resource: 'contraband' },
      { x: 54, y: 40, r: 2, resource: 'contraband' },
    ],
  },
  {
    id: 'ridge-villages', name: 'Ridge Villages', width: 72, height: 64, maxPlayers: 2, base: 'clear', roughness: 3,
    description: 'Terraced villages on two ridges with a wooded valley between them. Vehicles take the long way round; people do not.',
    starts: [{ x: 10, y: 10 }, { x: 61, y: 53 }],
    features: [
      ...m2<MapFeature>([
        { terrain: 'urban', shape: 'rect', x: 7, y: 7, w: 8, h: 7 },
        { terrain: 'urban', shape: 'rect', x: 22, y: 14, w: 5, h: 4 },
        { terrain: 'cliff', shape: 'ridge', x: 20, y: 4, x2: 32, y2: 20, r: 1 },
        { terrain: 'scrub', shape: 'circle', x: 26, y: 34, r: 5 },
        { terrain: 'rough', shape: 'circle', x: 16, y: 26, r: 3 },
      ], 72, 64),
      { terrain: 'scrub', shape: 'circle', x: 36, y: 32, r: 6 },
      { terrain: 'road', shape: 'ridge', x: 12, y: 12, x2: 60, y2: 52, r: 1 },
    ],
    fields: [
      ...m2<MapField>([{ x: 20, y: 22, r: 4, resource: 'crude' }, { x: 10, y: 40, r: 3, resource: 'crude' }], 72, 64),
      { x: 36, y: 16, r: 3, resource: 'contraband' },
      { x: 36, y: 48, r: 3, resource: 'contraband' },
    ],
  },
  {
    id: 'border-crossing', name: 'Border Crossing', width: 96, height: 96, maxPlayers: 4, base: 'sand', roughness: 2,
    description: 'A customs post on the only paved crossing for a hundred miles. Everything of value has to come through the middle, and everyone knows it.',
    starts: [{ x: 14, y: 14 }, { x: 81, y: 81 }, { x: 81, y: 14 }, { x: 14, y: 81 }],
    features: [
      ...quad<MapFeature>([
        { terrain: 'urban', shape: 'rect', x: 10, y: 10, w: 9, h: 9 },
        { terrain: 'rough', shape: 'circle', x: 30, y: 16, r: 5 },
        { terrain: 'scrub', shape: 'circle', x: 16, y: 34, r: 4 },
        { terrain: 'cliff', shape: 'ridge', x: 34, y: 26, x2: 26, y2: 34, r: 1 },
      ], 96, 96),
      { terrain: 'road', shape: 'rect', x: 0, y: 47, w: 96, h: 2 },
      { terrain: 'road', shape: 'rect', x: 47, y: 0, w: 2, h: 96 },
      { terrain: 'urban', shape: 'rect', x: 42, y: 42, w: 12, h: 12 },
    ],
    fields: [
      ...quad<MapField>([{ x: 26, y: 24, r: 4, resource: 'crude' }, { x: 14, y: 40, r: 3, resource: 'crude' }], 96, 96),
      { x: 48, y: 30, r: 3, resource: 'contraband' },
      { x: 48, y: 66, r: 3, resource: 'contraband' },
      { x: 30, y: 48, r: 3, resource: 'contraband' },
      { x: 66, y: 48, r: 3, resource: 'contraband' },
    ],
  },
];

export const irregularPack: RulePack = {
  id: 'irregular',
  name: 'Irregular Warfare',
  projection: 'ortho',
  fidelityNote: 'Fusion: original asymmetric-warfare armies on the Comrade Fusion Engine. Every belligerent, place and piece of equipment is invented; the doctrine each one fights by is the subject.',
  terrains: [
    { id: 'clear', name: 'Open Ground', foot: true, vehicle: true, buildable: true, speed: 100, color: '#7d8a4e', color2: '#6e7a44' },
    { id: 'road', name: 'Metalled Road', foot: true, vehicle: true, buildable: true, speed: 130, color: '#8b8a80', color2: '#7e7d73' },
    { id: 'urban', name: 'Built-Up Ground', foot: true, vehicle: true, buildable: true, speed: 85, color: '#a89c86', color2: '#948872' },
    { id: 'sand', name: 'Desert', foot: true, vehicle: true, buildable: true, speed: 90, color: '#c5ab74', color2: '#b49a64' },
    { id: 'scrub', name: 'Scrub', foot: true, vehicle: false, buildable: false, speed: 70, color: '#51632f', color2: '#425127' },
    { id: 'rough', name: 'Broken Ground', foot: true, vehicle: false, buildable: false, speed: 60, color: '#6d6f46', color2: '#60623c' },
    { id: 'cliff', name: 'Escarpment', foot: false, vehicle: false, buildable: false, speed: 100, color: '#5b5247', color2: '#4c443a' },
    { id: 'water', name: 'Channel', foot: false, vehicle: false, water: true, buildable: false, speed: 100, color: '#2d5d8c', color2: '#26527e' },
  ],
  resources: [
    // Crude is the war economy everyone taps; contraband is scarce, central and worth fighting over.
    { id: 'crude', name: 'Crude', value: 25, max: 12, regrows: true, regrowEvery: 330, color: '#3c3a36', color2: '#262522' },
    { id: 'contraband', name: 'Contraband', value: 55, max: 10, regrowEvery: 700, color: '#c9a33a', color2: '#9a7a22' },
  ],
  armors: ['none', 'wood', 'light', 'heavy', 'building'],
  warheads: {
    sa: { id: 'sa', vs: { none: 100, wood: 60, light: 25, heavy: 10, building: 10 } },
    hollowpoint: { id: 'hollowpoint', vs: { none: 100, wood: 20, light: 10, heavy: 5, building: 5 } },
    he: { id: 'he', vs: { none: 90, wood: 100, light: 75, heavy: 50, building: 100 } },
    ap: { id: 'ap', vs: { none: 25, wood: 75, light: 100, heavy: 100, building: 50 } },
    flak: { id: 'flak', vs: { none: 100, wood: 75, light: 60, heavy: 25, building: 10 } },
    sam: { id: 'sam', vs: { none: 50, wood: 100, light: 100, heavy: 75, building: 25 } },
    // A shaped charge against a building and almost nothing against a person in the open.
    shaped: { id: 'shaped', vs: { none: 60, wood: 100, light: 100, heavy: 110, building: 140 } },
  },
  weapons: {
    carbine: { id: 'carbine', damage: 12, range: 896, rof: 22, warhead: 'sa', speed: 0, visual: 'bullet' },
    rifle: { id: 'rifle', damage: 15, range: 1024, rof: 20, warhead: 'sa', speed: 0, visual: 'bullet' },
    servicerifle: { id: 'servicerifle', damage: 17, range: 1152, rof: 18, warhead: 'sa', speed: 0, visual: 'bullet' },
    marksman: { id: 'marksman', damage: 75, range: 1664, rof: 46, warhead: 'hollowpoint', speed: 0, visual: 'bullet' },
    pkm: { id: 'pkm', damage: 18, range: 1088, rof: 14, warhead: 'sa', speed: 0, visual: 'bullet' },
    dshk: { id: 'dshk', damage: 24, range: 1280, rof: 16, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    // An RPG is not an anti-aircraft weapon, however often it is pointed upward.
    rpg: { id: 'rpg', damage: 42, range: 1024, rof: 55, warhead: 'ap', speed: 36, splash: 40, visual: 'missile' },
    recoilless: { id: 'recoilless', damage: 45, range: 1280, rof: 55, warhead: 'ap', speed: 60, splash: 40, visual: 'cannon' },
    atgm: { id: 'atgm', damage: 66, range: 1536, rof: 72, warhead: 'ap', speed: 40, splash: 48, visual: 'missile' },
    javelin: { id: 'javelin', damage: 72, range: 1664, rof: 70, warhead: 'ap', speed: 44, splash: 48, visual: 'missile' },
    manpad: { id: 'manpad', damage: 58, range: 1792, rof: 46, warhead: 'sam', speed: 56, visual: 'missile', targets: ['aircraft'] },
    zu23: { id: 'zu23', damage: 26, range: 1536, rof: 18, warhead: 'flak', speed: 64, burst: 2, visual: 'bullet', targets: ['infantry', 'vehicle', 'aircraft', 'structure'] },
    mortar: { id: 'mortar', damage: 46, range: 1664, minRange: 384, rof: 78, warhead: 'he', speed: 26, splash: 112, visual: 'artillery' },
    // The quadcopter's munition: dropped from standoff, slow to reload, and it hurts.
    dropcharge: { id: 'dropcharge', damage: 88, range: 1280, rof: 95, warhead: 'he', speed: 0, splash: 128, visual: 'bomb' },
    chargevest: { id: 'chargevest', damage: 180, range: 192, rof: 100, warhead: 'shaped', speed: 0, splash: 192, visual: 'bomb', suicide: true },
    chargetruck: { id: 'chargetruck', damage: 380, range: 256, rof: 100, warhead: 'shaped', speed: 0, splash: 416, visual: 'bomb', suicide: true },
    buriedcharge: { id: 'buriedcharge', damage: 150, range: 0, rof: 10, warhead: 'he', speed: 0, splash: 256, visual: 'bomb' },
    tankgun: { id: 'tankgun', damage: 34, range: 1152, rof: 50, warhead: 'ap', speed: 64, splash: 40, visual: 'cannon' },
    mbtgun: { id: 'mbtgun', damage: 48, range: 1408, rof: 54, warhead: 'ap', speed: 70, splash: 48, visual: 'cannon' },
    autocannon: { id: 'autocannon', damage: 26, range: 1280, rof: 16, warhead: 'ap', speed: 72, burst: 2, visual: 'cannon' },
    gradrockets: { id: 'gradrockets', damage: 30, range: 1920, minRange: 384, rof: 88, warhead: 'he', speed: 40, splash: 96, burst: 4, visual: 'missile' },
    howitzer: { id: 'howitzer', damage: 74, range: 1920, minRange: 448, rof: 88, warhead: 'he', speed: 28, splash: 120, visual: 'artillery' },
    gunshipgun: { id: 'gunshipgun', damage: 22, range: 1152, rof: 14, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    gunshipmissile: { id: 'gunshipmissile', damage: 56, range: 1408, rof: 34, warhead: 'ap', speed: 50, splash: 48, burst: 2, visual: 'missile', targets: ['infantry', 'vehicle', 'naval', 'structure'] },
    // What a sponsor's strike drone carries: fewer, heavier shots than a helicopter's rack.
    dronemunition: { id: 'dronemunition', damage: 92, range: 1408, rof: 64, warhead: 'he', speed: 44, splash: 112, visual: 'missile' },
    boatgun: { id: 'boatgun', damage: 36, range: 1280, rof: 42, warhead: 'he', speed: 48, splash: 48, visual: 'cannon' },
    cutterguns: { id: 'cutterguns', damage: 46, range: 1536, rof: 46, warhead: 'he', speed: 52, splash: 64, burst: 2, visual: 'cannon' },
    pitgun: { id: 'pitgun', damage: 22, range: 1152, rof: 16, warhead: 'sa', speed: 0, visual: 'bullet' },
    postgun: { id: 'postgun', damage: 40, range: 1280, rof: 46, warhead: 'ap', speed: 72, splash: 32, visual: 'cannon' },
  },
  units: {
    // ---- shared: everybody digs, drives and repairs
    rig: { id: 'rig', name: 'Deployment Rig', kind: 'vehicle', cost: 4500, hp: 550, armor: 'heavy', speed: 18, turn: 5, sight: 3, prereqs: ['works'], tech: 6, deploysTo: 'yard', crusher: true, shape: 'mcv' },
    tanker: { id: 'tanker', name: 'Collection Tanker', kind: 'vehicle', cost: 1300, hp: 560, armor: 'heavy', speed: 22, turn: 6, sight: 3, prereqs: ['works'], tech: 2, crusher: true, shape: 'harvester', harvester: { capacity: 28, gather: 6, unload: 3 } },
    fixer: { id: 'fixer', name: 'Fixer', kind: 'infantry', cost: 450, hp: 25, armor: 'none', speed: 12, sight: 3, prereqs: ['muster|camp'], tech: 3, crushable: true, engineer: true, shape: 'engineer', role: 'support' },

    // ---- Valley Cadres: numbers, concealment and improvisation
    fighter: { id: 'fighter', name: 'Rifleman', kind: 'infantry', cost: 80, hp: 45, armor: 'none', speed: 14, sight: 3, weapon: 'carbine', prereqs: ['muster'], factions: ['cadres'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    gunner: { id: 'gunner', name: 'Machine Gunner', kind: 'infantry', cost: 180, hp: 55, armor: 'none', speed: 12, sight: 4, weapon: 'pkm', prereqs: ['muster'], factions: IRREGULAR, tech: 2, crushable: true, shape: 'infantry-elite', role: 'combat' },
    rpgteam: { id: 'rpgteam', name: 'RPG Team', kind: 'infantry', cost: 220, hp: 45, armor: 'none', speed: 12, sight: 4, weapon: 'rpg', prereqs: ['muster'], factions: IRREGULAR, tech: 3, crushable: true, shape: 'infantry-rocket', role: 'combat' },
    mortarteam: { id: 'mortarteam', name: 'Mortar Crew', kind: 'infantry', cost: 380, hp: 50, armor: 'none', speed: 10, sight: 3, weapon: 'mortar', prereqs: ['muster', 'net'], factions: IRREGULAR, tech: 4, crushable: true, shape: 'infantry-elite', role: 'siege' },
    sapper: { id: 'sapper', name: 'Sapper', kind: 'infantry', cost: 500, hp: 40, armor: 'none', speed: 13, sight: 3, prereqs: ['muster'], factions: IRREGULAR, tech: 4, crushable: true, c4: 30, shape: 'infantry', role: 'support' },
    // The charge-bearer: one use, short range, and the pack's cheapest way to open a wall.
    charger: { id: 'charger', name: 'Charge Bearer', kind: 'infantry', cost: 400, hp: 50, armor: 'none', speed: 15, sight: 3, weapon: 'chargevest', prereqs: ['muster', 'tunnel'], factions: ['cadres'], tech: 5, crushable: true, expendable: true, shape: 'infantry', role: 'siege' },
    // A quadcopter and the two people flying it: the expensive end of the infantry list.
    quadteam: { id: 'quadteam', name: 'Quadcopter Team', kind: 'infantry', cost: 700, hp: 35, armor: 'none', speed: 11, sight: 7, weapon: 'dropcharge', prereqs: ['muster', 'net'], factions: ['cadres'], tech: 6, crushable: true, shape: 'probe', role: 'siege' },
    pickup: { id: 'pickup', name: 'Armed Pickup', kind: 'vehicle', cost: 300, hp: 130, armor: 'light', speed: 56, turn: 18, sight: 5, weapon: 'dshk', prereqs: ['works'], factions: IRREGULAR, tech: 2, shape: 'humvee', role: 'scout' },
    gunwagon: { id: 'gunwagon', name: 'Recoilless Wagon', kind: 'vehicle', cost: 480, hp: 140, armor: 'light', speed: 50, turn: 16, sight: 5, weapon: 'recoilless', prereqs: ['works'], factions: IRREGULAR, tech: 3, shape: 'buggy', role: 'combat' },
    bus: { id: 'bus', name: 'Plated Bus', kind: 'vehicle', cost: 600, hp: 260, armor: 'heavy', speed: 36, turn: 10, sight: 4, weapon: 'pkm', prereqs: ['works'], factions: IRREGULAR, tech: 4, transport: 6, infantryOnly: true, shape: 'apc', role: 'support' },
    chargetruck: { id: 'chargetruck', name: 'Charge Truck', kind: 'vehicle', cost: 1000, hp: 150, armor: 'light', speed: 44, turn: 12, sight: 4, weapon: 'chargetruck', prereqs: ['works', 'tunnel|wharf'], factions: ['cadres', 'coastal'], tech: 7, expendable: true, shape: 'demotruck', role: 'siege' },

    // ---- Coastal Syndicate: smuggling money buys reach
    crew: { id: 'crew', name: 'Crewman', kind: 'infantry', cost: 90, hp: 45, armor: 'none', speed: 14, sight: 3, weapon: 'rifle', prereqs: ['muster'], factions: ['coastal'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    smuggler: { id: 'smuggler', name: 'Smuggler', kind: 'infantry', cost: 550, hp: 30, armor: 'none', speed: 15, sight: 5, prereqs: ['muster', 'net'], factions: ['coastal'], tech: 5, crushable: true, spy: true, disguise: true, shape: 'spy', role: 'support' },
    // Bought off a shelf rather than built in a shed: steadier, further, dearer.
    quadbought: { id: 'quadbought', name: 'Commercial Quadcopter', kind: 'infantry', cost: 800, hp: 35, armor: 'none', speed: 12, sight: 8, weapon: 'dropcharge', prereqs: ['muster', 'wharf'], factions: ['coastal'], tech: 6, crushable: true, shape: 'probe', role: 'siege' },
    technical: { id: 'technical', name: 'Twin-Gun Technical', kind: 'vehicle', cost: 420, hp: 150, armor: 'light', speed: 54, turn: 18, sight: 5, weapon: 'zu23', prereqs: ['works'], factions: ['coastal'], tech: 3, shape: 'quad', role: 'antiair' },
    // A fixed-wing drone is vehicle-tier kit and comes off the Workshop floor, not a strip.
    surveydrone: { id: 'surveydrone', name: 'Survey Drone', kind: 'aircraft', cost: 700, hp: 90, armor: 'light', speed: 48, sight: 10, prereqs: ['works', 'net'], factions: ['coastal'], tech: 5, queue: 'vehicle', altitude: 3, shape: 'drone', role: 'scout' },
    skiff: { id: 'skiff', name: 'Gun Skiff', kind: 'naval', cost: 360, hp: 220, armor: 'light', speed: 44, turn: 10, sight: 6, weapon: 'boatgun', prereqs: ['dock'], factions: ['coastal'], tech: 3, shape: 'ship-patrol', role: 'combat' },
    dhow: { id: 'dhow', name: 'Dhow', kind: 'naval', cost: 650, hp: 320, armor: 'heavy', speed: 34, turn: 8, sight: 5, prereqs: ['dock'], factions: ['coastal'], tech: 4, transport: 8, shape: 'hovercraft', role: 'support' },
    trawler: { id: 'trawler', name: 'Armed Trawler', kind: 'naval', cost: 900, hp: 420, armor: 'heavy', speed: 28, turn: 6, sight: 6, weapon: 'cutterguns', prereqs: ['dock', 'net'], factions: ['coastal'], tech: 6, shape: 'ship-destroyer', role: 'siege' },

    // ---- Northern Vanguard: a sponsor's surplus, and the kit that comes with sponsorship
    regular: { id: 'regular', name: 'Regular', kind: 'infantry', cost: 120, hp: 55, armor: 'none', speed: 14, sight: 4, weapon: 'rifle', prereqs: ['muster'], factions: ['vanguard'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    atgmteam: { id: 'atgmteam', name: 'ATGM Team', kind: 'infantry', cost: 400, hp: 45, armor: 'none', speed: 11, sight: 5, weapon: 'atgm', prereqs: ['muster', 'net'], factions: ['vanguard'], tech: 5, crushable: true, shape: 'infantry-rocket', role: 'combat' },
    manpadteam: { id: 'manpadteam', name: 'MANPAD Team', kind: 'infantry', cost: 450, hp: 45, armor: 'none', speed: 12, sight: 6, weapon: 'manpad', prereqs: ['muster', 'net'], factions: ['vanguard'], tech: 5, crushable: true, shape: 'infantry-rocket', role: 'antiair' },
    raider: { id: 'raider', name: 'Raider', kind: 'infantry', cost: 900, hp: 90, armor: 'none', speed: 16, sight: 5, weapon: 'marksman', prereqs: ['muster', 'rocketpad'], factions: ['vanguard'], tech: 8, crushable: true, c4: 30, shape: 'commando', role: 'combat' },
    quadmunition: { id: 'quadmunition', name: 'Munition Quadcopter', kind: 'infantry', cost: 950, hp: 40, armor: 'none', speed: 12, sight: 9, weapon: 'dropcharge', prereqs: ['muster', 'dronebay'], factions: ['vanguard'], tech: 7, crushable: true, shape: 'probe', role: 'siege' },
    oldtank: { id: 'oldtank', name: 'Surplus Tank', kind: 'vehicle', cost: 800, hp: 380, armor: 'heavy', speed: 26, turn: 8, sight: 4, weapon: 'tankgun', prereqs: ['works@1'], factions: ['vanguard'], tech: 5, crusher: true, shape: 'tank-turret', role: 'combat' },
    carrier: { id: 'carrier', name: 'Wheeled Carrier', kind: 'vehicle', cost: 700, hp: 280, armor: 'heavy', speed: 42, turn: 12, sight: 4, weapon: 'autocannon', prereqs: ['works'], factions: ['vanguard'], tech: 4, transport: 6, infantryOnly: true, crusher: true, shape: 'apc', role: 'support' },
    guntruck: { id: 'guntruck', name: 'AA Gun Truck', kind: 'vehicle', cost: 520, hp: 160, armor: 'light', speed: 46, turn: 14, sight: 6, weapon: 'zu23', prereqs: ['works'], factions: ['vanguard'], tech: 4, shape: 'quad', role: 'antiair' },
    rockettruck: { id: 'rockettruck', name: 'Rocket Truck', kind: 'vehicle', cost: 900, hp: 170, armor: 'light', speed: 32, turn: 8, sight: 6, weapon: 'gradrockets', prereqs: ['works@1', 'net'], factions: ['vanguard'], tech: 6, shape: 'launcher', role: 'siege' },
    strikedrone: { id: 'strikedrone', name: 'Strike Drone', kind: 'aircraft', cost: 1300, hp: 120, armor: 'light', speed: 46, sight: 9, weapon: 'dronemunition', prereqs: ['works@1', 'dronebay'], factions: ['vanguard'], tech: 8, queue: 'vehicle', altitude: 3, shape: 'drone', role: 'siege' },

    // ---- Mandate Force: everything works, and everything costs
    rifleman: { id: 'rifleman', name: 'Infantryman', kind: 'infantry', cost: 200, hp: 70, armor: 'none', speed: 14, sight: 4, weapon: 'servicerifle', prereqs: ['camp'], factions: ['mandate'], tech: 1, crushable: true, shape: 'officer', role: 'combat' },
    missileteam: { id: 'missileteam', name: 'Missile Team', kind: 'infantry', cost: 500, hp: 60, armor: 'none', speed: 12, sight: 5, weapon: 'javelin', prereqs: ['camp'], factions: ['mandate'], tech: 4, crushable: true, shape: 'infantry-rocket', role: 'combat' },
    marksmanteam: { id: 'marksmanteam', name: 'Marksman', kind: 'infantry', cost: 600, hp: 55, armor: 'none', speed: 14, sight: 7, weapon: 'marksman', prereqs: ['camp', 'net'], factions: ['mandate'], tech: 5, crushable: true, shape: 'commando', role: 'combat' },
    pioneer: { id: 'pioneer', name: 'Pioneer', kind: 'infantry', cost: 1100, hp: 100, armor: 'none', speed: 16, sight: 5, weapon: 'servicerifle', prereqs: ['camp', 'opscell'], factions: ['mandate'], tech: 8, crushable: true, c4: 35, shape: 'commando', role: 'combat' },
    mrap: { id: 'mrap', name: 'MRAP', kind: 'vehicle', cost: 700, hp: 300, armor: 'heavy', speed: 44, turn: 14, sight: 6, weapon: 'dshk', prereqs: ['works'], factions: ['mandate'], tech: 3, transport: 4, infantryOnly: true, shape: 'humvee', role: 'scout' },
    ifv: { id: 'ifv', name: 'IFV', kind: 'vehicle', cost: 1000, hp: 380, armor: 'heavy', speed: 38, turn: 11, sight: 5, weapon: 'autocannon', prereqs: ['works'], factions: ['mandate'], tech: 5, transport: 5, infantryOnly: true, crusher: true, shape: 'apc', role: 'combat' },
    mbt: { id: 'mbt', name: 'Main Battle Tank', kind: 'vehicle', cost: 1600, hp: 560, armor: 'heavy', speed: 28, turn: 8, sight: 5, weapon: 'mbtgun', prereqs: ['works@1'], factions: ['mandate'], tech: 7, crusher: true, shape: 'tank-turret', role: 'combat' },
    spg: { id: 'spg', name: 'Self-Propelled Gun', kind: 'vehicle', cost: 1400, hp: 240, armor: 'light', speed: 24, turn: 6, sight: 6, weapon: 'howitzer', prereqs: ['works@1', 'net'], factions: ['mandate'], tech: 7, shape: 'siege-turret', role: 'siege' },
    patroldrone: { id: 'patroldrone', name: 'Patrol Drone', kind: 'aircraft', cost: 1500, hp: 130, armor: 'light', speed: 50, sight: 11, weapon: 'dronemunition', prereqs: ['works@1', 'net'], factions: ['mandate'], tech: 8, queue: 'vehicle', altitude: 3, shape: 'drone', role: 'siege' },
    gunship: { id: 'gunship', name: 'Attack Helicopter', kind: 'aircraft', cost: 1700, hp: 170, armor: 'light', speed: 58, sight: 6, weapon: 'gunshipmissile', altWeapon: 'gunshipgun', ammo: 8, prereqs: ['pad'], factions: ['mandate'], tech: 8, altitude: 2, shape: 'apache', role: 'combat' },
    lift: { id: 'lift', name: 'Transport Helicopter', kind: 'aircraft', cost: 1300, hp: 140, armor: 'light', speed: 52, sight: 5, prereqs: ['pad'], factions: ['mandate'], tech: 7, altitude: 2, transport: 8, infantryOnly: true, shape: 'helicopter', role: 'support' },
    cutter: { id: 'cutter', name: 'Patrol Cutter', kind: 'naval', cost: 1100, hp: 460, armor: 'heavy', speed: 34, turn: 7, sight: 7, weapon: 'cutterguns', prereqs: ['dock'], factions: ['mandate'], tech: 5, shape: 'ship-destroyer', role: 'siege' },
  },
  structures: {
    // ---- the ladder everyone climbs
    yard: { id: 'yard', name: 'Yard', cost: 4500, hp: 1000, armor: 'building', w: 3, h: 3, power: 0, sight: 5, prereqs: [], tech: 99, queue: 'structure', constructionYard: true, upgrades: 1, upgradeCost: 1400, shape: 'conyard' },
    gen: { id: 'gen', name: 'Generator', cost: 300, hp: 380, armor: 'building', w: 2, h: 2, power: 100, sight: 3, prereqs: [], tech: 1, queue: 'structure', shape: 'tdpower' },
    grid: { id: 'grid', name: 'Grid Tap', cost: 650, hp: 420, armor: 'building', w: 2, h: 2, power: 220, sight: 3, prereqs: ['gen', 'yard@1'], tech: 4, queue: 'structure', shape: 'advpower' },
    depot: { id: 'depot', name: 'Collection Depot', cost: 1900, hp: 880, armor: 'building', w: 3, h: 3, power: -40, sight: 4, prereqs: ['gen'], tech: 1, queue: 'structure', storage: 1200, refinery: { dockX: 1, dockY: 3, freeUnit: 'tanker' }, shape: 'refinery' },
    cache: { id: 'cache', name: 'Buried Cache', cost: 150, hp: 320, armor: 'building', w: 2, h: 1, power: -10, sight: 2, prereqs: ['depot'], tech: 2, queue: 'structure', storage: 6000, shape: 'silo' },
    works: { id: 'works', name: 'Workshop', cost: 1900, hp: 800, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['depot'], tech: 2, queue: 'structure', produces: 'vehicle', upgrades: 1, upgradeCost: 1100, shape: 'heavyfactory' },
    shop: { id: 'shop', name: 'Repair Shop', cost: 1100, hp: 760, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['works'], tech: 5, queue: 'structure', repairPad: true, shape: 'repairpad' },
    net: { id: 'net', name: 'Signals Net', cost: 900, hp: 480, armor: 'building', w: 2, h: 2, power: -40, sight: 9, prereqs: ['depot'], tech: 3, queue: 'structure', radar: true, shape: 'radar' },
    // The concealment mechanic: a protected site shrouds the ground around it and never shoots.
    aid: { id: 'aid', name: 'Aid Station', cost: 800, hp: 600, armor: 'building', w: 2, h: 2, power: -20, sight: 4, prereqs: ['depot'], tech: 4, queue: 'structure', gap: 5, shape: 'gap' },
    muster: { id: 'muster', name: 'Muster House', cost: 280, hp: 420, armor: 'building', w: 2, h: 2, power: -20, sight: 3, prereqs: ['gen'], factions: IRREGULAR, tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    camp: { id: 'camp', name: 'Forward Camp', cost: 600, hp: 620, armor: 'building', w: 3, h: 2, power: -30, sight: 4, prereqs: ['gen'], factions: ['mandate'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    dock: { id: 'dock', name: 'Working Dock', cost: 900, hp: 760, armor: 'building', w: 3, h: 3, power: -20, sight: 4, prereqs: ['depot'], factions: ['coastal', 'mandate'], tech: 3, queue: 'structure', produces: 'naval', onWater: true, shape: 'shipyard' },
    pad: { id: 'pad', name: 'Helipad', cost: 1400, hp: 420, armor: 'building', w: 2, h: 2, power: -20, sight: 4, prereqs: ['net', 'works'], factions: ['mandate'], tech: 7, queue: 'structure', produces: 'aircraft', airfield: true, shape: 'helipad' },

    // ---- what each belligerent has that the others do not
    tunnel: { id: 'tunnel', name: 'Tunnel Mouth', cost: 1500, hp: 700, armor: 'building', w: 2, h: 2, power: -30, sight: 3, prereqs: ['muster', 'net'], factions: ['cadres'], tech: 6, queue: 'structure', shape: 'temple',
      superweapon: { id: 'tunnelraid', name: 'Tunnel Raid', kind: 'reinforce', charge: 4200, damage: 0, radius: 0, delay: 20, units: ['fighter', 'fighter', 'gunner', 'rpgteam'] } },
    spotnet: { id: 'spotnet', name: 'Spotter Network', cost: 1000, hp: 450, armor: 'building', w: 2, h: 2, power: -50, sight: 8, prereqs: ['net', 'muster'], factions: ['cadres'], tech: 7, queue: 'structure', needsPower: true, shape: 'sensor',
      superweapon: { id: 'spotterreport', name: 'Spotter Report', kind: 'reveal', charge: 2400, damage: 0, radius: 3584, delay: 10, duration: 900 } },
    wharf: { id: 'wharf', name: "Smuggler's Wharf", cost: 1800, hp: 820, armor: 'building', w: 3, h: 3, power: -40, sight: 5, prereqs: ['depot', 'net'], factions: ['coastal'], tech: 6, queue: 'structure', incomeBonus: 20, shape: 'starport',
      superweapon: [
        { id: 'harbourrun', name: 'Harbour Run', kind: 'reinforce', charge: 4200, damage: 0, radius: 0, delay: 20, atBase: true, units: ['technical', 'technical', 'crew', 'crew'] },
        { id: 'nightrun', name: 'Night Run', kind: 'paradrop', charge: 4800, damage: 0, radius: 0, delay: 30, units: ['crew', 'crew', 'rpgteam', 'smuggler'] },
      ] },
    rocketpad: { id: 'rocketpad', name: 'Rocket Pad', cost: 3000, hp: 800, armor: 'building', w: 3, h: 3, power: -120, sight: 5, prereqs: ['works@1', 'net'], factions: ['vanguard'], tech: 8, queue: 'structure', needsPower: true, shape: 'missilesilo',
      // Big and inaccurate: a wide radius for its damage, and a long wait between shots.
      superweapon: { id: 'rocketstrike', name: 'Rocket Strike', kind: 'missile', charge: 6200, damage: 850, radius: 1024, delay: 85 } },
    dronebay: { id: 'dronebay', name: 'Drone Bay', cost: 1600, hp: 620, armor: 'building', w: 3, h: 2, power: -60, sight: 6, prereqs: ['works', 'net'], factions: ['vanguard'], tech: 7, queue: 'structure', needsPower: true, shape: 'dropship',
      superweapon: { id: 'dronesweep', name: 'Drone Sweep', kind: 'reveal', charge: 2400, damage: 0, radius: 4608, delay: 10, duration: 1200 } },
    opscell: { id: 'opscell', name: 'Air Operations Cell', cost: 3200, hp: 700, armor: 'building', w: 3, h: 3, power: -150, sight: 8, prereqs: ['net', 'works@1'], factions: ['mandate'], tech: 9, queue: 'structure', needsPower: true, radar: true, shape: 'ioncannon',
      superweapon: [
        // Precise rather than large: most of the damage of a rocket strike inside a third of the area.
        { id: 'precisionstrike', name: 'Precision Strike', kind: 'ion', charge: 4600, damage: 1400, radius: 384, delay: 40 },
        { id: 'airassault', name: 'Air Assault', kind: 'paradrop', charge: 5200, damage: 0, radius: 0, delay: 30, units: ['rifleman', 'rifleman', 'missileteam', 'missileteam'] },
      ] },

    // ---- field defences
    pit: { id: 'pit', name: 'Fighting Pit', cost: 400, hp: 420, armor: 'building', w: 1, h: 1, power: -10, sight: 6, prereqs: ['muster|camp'], tech: 2, queue: 'defense', weapon: 'pitgun', shape: 'gtower' },
    post: { id: 'post', name: 'Gun Post', cost: 700, hp: 460, armor: 'building', w: 1, h: 1, power: -20, sight: 7, prereqs: ['works'], tech: 4, queue: 'defense', weapon: 'postgun', shape: 'turret' },
    aapost: { id: 'aapost', name: 'AA Post', cost: 800, hp: 400, armor: 'building', w: 2, h: 1, power: -30, sight: 8, prereqs: ['net'], tech: 5, queue: 'defense', weapon: 'manpad', needsPower: true, shape: 'samsite' },
    atgmpost: { id: 'atgmpost', name: 'ATGM Post', cost: 1000, hp: 420, armor: 'building', w: 1, h: 2, power: -40, sight: 8, prereqs: ['net', 'works'], tech: 6, queue: 'defense', weapon: 'atgm', needsPower: true, shape: 'atower' },
    // Cheap, harmless and lethal the moment it is shot: the cost of clearing a road.
    charge: { id: 'charge', name: 'Buried Charge', cost: 120, hp: 140, armor: 'wood', w: 1, h: 1, power: 0, sight: 2, prereqs: ['muster'], factions: IRREGULAR, tech: 3, queue: 'defense', deathWeapon: 'buriedcharge', shape: 'minelayer' },
    hesco: { id: 'hesco', name: 'Hesco Barrier', cost: 60, hp: 400, armor: 'building', w: 1, h: 1, power: 0, sight: 0, prereqs: [], tech: 1, queue: 'defense', wall: true, shape: 'wall' },
  },
  factions: [
    { id: 'cadres', name: 'Valley Cadres', side: 'irregulars', color: '#8a6b3c', accent: '#e0c08a',
      blurb: 'Rural cadres with no sponsor. Cheap infantry in depth, mortars, buried charges, tunnels and a quadcopter they built themselves.',
      startUnits: ['rig', 'fighter', 'fighter', 'fighter', 'gunner', 'pickup'] },
    { id: 'coastal', name: 'Coastal Syndicate', side: 'irregulars', color: '#2f8a7a', accent: '#8fe0d0',
      blurb: 'Smuggling pays for everything. Technicals, skiffs, a bought survey drone, informants and a wharf that keeps the money coming.',
      startUnits: ['rig', 'crew', 'crew', 'crew', 'technical'] },
    { id: 'vanguard', name: 'Northern Vanguard', side: 'irregulars', color: '#b03a2e', accent: '#ffa89c',
      blurb: 'Sponsored and connected. Surplus armour, rocket trucks, MANPADs, a fixed-wing strike drone and a rocket that lands near what it was aimed at.',
      startUnits: ['rig', 'regular', 'regular', 'regular', 'guntruck'] },
    { id: 'mandate', name: 'Mandate Force', side: 'state', color: '#3a6ea8', accent: '#a8c8f0',
      blurb: 'The conventional intervention force. Armour, helicopters and a precision strike — all of it excellent, all of it expensive, none of it quick to replace.',
      startUnits: ['rig', 'rifleman', 'rifleman', 'mrap'] },
  ],
  maps,
  startCredits: { low: 3000, standard: 6000, high: 12000 },
  buildTicksPer100: 60,
  lowPowerProductionPercent: 50,
  extraFactoryBonus: 100,
  buildRadius: 3,
  sellRefundPercent: 50,
  mechanics: {
    regrowth: { everyTicks: 200, amount: 1, spreadChance: 6 },
  },
  veterancy: { veteran: 2, elite: 4, firepower: 10, armour: 10 },
};
