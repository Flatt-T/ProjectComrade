// Fusion: Holdouts — the dark-humour pack. Four groups who have decided, with no authority
// whatsoever, that this patch of coast is theirs, and who are each absolutely certain the
// other three are the unreasonable ones.
//
// The Compound stockpiles. Pelican Point Residents' Association enforces. Gull Reach runs a
// protection racket off the harbour wall. Vantage Risk Group was hired by someone, has not
// said by whom, and is billing all four of them.
//
// Mechanically this is the same asymmetric design as the Irregular Warfare pack — cheap
// numbers against expensive quality, concealment against standoff, drones split by tier —
// with the jokes aimed squarely at self-importance, paperwork and invoicing. The comedy is
// in the committee, never in a casualty.
import { MapFeature, MapField, MapPreset, RulePack } from '../rules';
import { mirror, quad } from '../packs/mapkit';

const LOCALS = ['preppers', 'hoa', 'pirates'];
const m2 = <T extends MapFeature | MapField>(items: T[], w: number, h: number) => mirror(items, w, h);

const maps: MapPreset[] = [
  {
    id: 'pelican-point', name: 'Pelican Point', width: 64, height: 64, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'A cul-de-sac development with sea views, a disputed verge and one shared bin store that nobody will admit to filling.',
    starts: [{ x: 10, y: 11 }, { x: 53, y: 52 }],
    features: [
      ...m2<MapFeature>([
        { terrain: 'lawn', shape: 'rect', x: 7, y: 8, w: 9, h: 7 },
        { terrain: 'tarmac', shape: 'ridge', x: 12, y: 14, x2: 30, y2: 30, r: 1 },
        { terrain: 'hedge', shape: 'circle', x: 22, y: 22, r: 3 },
        { terrain: 'scrub', shape: 'circle', x: 18, y: 40, r: 4 },
      ], 64, 64),
      { terrain: 'water', shape: 'rect', x: 0, y: 0, w: 64, h: 6 },
      { terrain: 'sand', shape: 'rect', x: 0, y: 6, w: 64, h: 3 },
      { terrain: 'tarmac', shape: 'rect', x: 28, y: 28, w: 8, h: 8 },
    ],
    fields: [
      ...m2<MapField>([{ x: 18, y: 18, r: 4, resource: 'scrap' }, { x: 12, y: 34, r: 3, resource: 'scrap' }], 64, 64),
      { x: 32, y: 32, r: 3, resource: 'valuables' },
      { x: 32, y: 14, r: 2, resource: 'valuables' },
    ],
  },
  {
    id: 'gull-reach', name: 'Gull Reach', width: 80, height: 80, maxPlayers: 4, base: 'clear', roughness: 2,
    description: "Four properties around a tidal inlet. The harbour wall is public, the slipway is contested, and the gulls are nobody's allies.",
    starts: [{ x: 12, y: 12 }, { x: 67, y: 67 }, { x: 67, y: 12 }, { x: 12, y: 67 }],
    features: [
      ...quad<MapFeature>([
        { terrain: 'lawn', shape: 'rect', x: 9, y: 9, w: 8, h: 8 },
        { terrain: 'hedge', shape: 'circle', x: 24, y: 14, r: 3 },
        { terrain: 'scrub', shape: 'circle', x: 30, y: 30, r: 3 },
      ], 80, 80),
      { terrain: 'water', shape: 'circle', x: 40, y: 40, r: 12 },
      { terrain: 'water', shape: 'ridge', x: 40, y: 0, x2: 40, y2: 28, r: 3 },
      { terrain: 'sand', shape: 'circle', x: 40, y: 40, r: 14 },
      { terrain: 'tarmac', shape: 'rect', x: 18, y: 39, w: 44, h: 2 },
    ],
    fields: [
      ...quad<MapField>([{ x: 22, y: 20, r: 4, resource: 'scrap' }, { x: 12, y: 30, r: 3, resource: 'scrap' }], 80, 80),
      { x: 40, y: 24, r: 3, resource: 'valuables' },
      { x: 40, y: 56, r: 3, resource: 'valuables' },
      { x: 24, y: 40, r: 2, resource: 'valuables' },
      { x: 56, y: 40, r: 2, resource: 'valuables' },
    ],
  },
  {
    id: 'allotment-wars', name: 'Allotment Wars', width: 72, height: 64, maxPlayers: 2, base: 'lawn', roughness: 3,
    description: 'Ninety-six rented plots, two sheds with delusions of grandeur, and a water butt that has been the subject of three separate inquiries.',
    starts: [{ x: 10, y: 32 }, { x: 61, y: 31 }],
    features: [
      ...m2<MapFeature>([
        { terrain: 'tarmac', shape: 'rect', x: 6, y: 29, w: 10, h: 5 },
        { terrain: 'hedge', shape: 'ridge', x: 22, y: 6, x2: 22, y2: 26, r: 1 },
        { terrain: 'hedge', shape: 'ridge', x: 22, y: 38, x2: 22, y2: 58, r: 1 },
        { terrain: 'scrub', shape: 'circle', x: 30, y: 12, r: 4 },
      ], 72, 64),
      { terrain: 'tarmac', shape: 'rect', x: 0, y: 31, w: 72, h: 2 },
      { terrain: 'clear', shape: 'circle', x: 36, y: 32, r: 7 },
    ],
    fields: [
      ...m2<MapField>([{ x: 18, y: 16, r: 4, resource: 'scrap' }, { x: 18, y: 48, r: 4, resource: 'scrap' }], 72, 64),
      { x: 36, y: 32, r: 3, resource: 'valuables' },
    ],
  },
  {
    id: 'retail-park', name: 'Retail Park Standoff', width: 96, height: 96, maxPlayers: 4, base: 'tarmac', roughness: 1,
    description: 'An out-of-town retail park with four anchor units, nine hundred parking spaces and a disabled bay that has started a war.',
    starts: [{ x: 14, y: 14 }, { x: 81, y: 81 }, { x: 81, y: 14 }, { x: 14, y: 81 }],
    features: [
      ...quad<MapFeature>([
        { terrain: 'lawn', shape: 'rect', x: 10, y: 10, w: 10, h: 9 },
        { terrain: 'hedge', shape: 'circle', x: 30, y: 18, r: 4 },
        { terrain: 'scrub', shape: 'circle', x: 18, y: 34, r: 4 },
        { terrain: 'clear', shape: 'circle', x: 34, y: 34, r: 4 },
      ], 96, 96),
      { terrain: 'tarmac', shape: 'rect', x: 44, y: 0, w: 8, h: 96 },
      { terrain: 'tarmac', shape: 'rect', x: 0, y: 44, w: 96, h: 8 },
      { terrain: 'lawn', shape: 'circle', x: 48, y: 48, r: 6 },
    ],
    fields: [
      ...quad<MapField>([{ x: 26, y: 24, r: 4, resource: 'scrap' }, { x: 14, y: 40, r: 3, resource: 'scrap' }], 96, 96),
      { x: 48, y: 30, r: 3, resource: 'valuables' },
      { x: 48, y: 66, r: 3, resource: 'valuables' },
      { x: 30, y: 48, r: 3, resource: 'valuables' },
      { x: 66, y: 48, r: 3, resource: 'valuables' },
    ],
  },
];

export const holdoutPack: RulePack = {
  id: 'holdout',
  name: 'Holdouts',
  projection: 'ortho',
  fidelityNote: 'Fusion: original comic factions on the Comrade Fusion Engine. Every group, place and machine is invented; any resemblance to your neighbours is a matter between you and them.',
  terrains: [
    { id: 'clear', name: 'Rough Ground', foot: true, vehicle: true, buildable: true, speed: 100, color: '#77864c', color2: '#687644' },
    { id: 'lawn', name: 'Immaculate Lawn', foot: true, vehicle: true, buildable: true, speed: 110, color: '#4f8a3e', color2: '#427a33' },
    { id: 'tarmac', name: 'Tarmac', foot: true, vehicle: true, buildable: true, speed: 130, color: '#55565a', color2: '#4a4b4f' },
    { id: 'sand', name: 'Shingle', foot: true, vehicle: true, buildable: true, speed: 85, color: '#bfae8c', color2: '#a89a78' },
    { id: 'hedge', name: 'Leylandii', foot: false, vehicle: false, buildable: false, speed: 100, color: '#23431f', color2: '#1a3517' },
    { id: 'scrub', name: 'Brambles', foot: true, vehicle: false, buildable: false, speed: 60, color: '#4e5c33', color2: '#404c2a' },
    { id: 'water', name: 'The Sea', foot: false, vehicle: false, water: true, buildable: false, speed: 100, color: '#2a5880', color2: '#234b70' },
  ],
  resources: [
    { id: 'scrap', name: 'Scrap', value: 25, max: 12, regrows: true, regrowEvery: 300, color: '#8a7a5c', color2: '#6a5c42' },
    { id: 'valuables', name: 'Valuables', value: 55, max: 10, regrowEvery: 640, color: '#d2b24a', color2: '#a0862c' },
  ],
  armors: ['none', 'wood', 'light', 'heavy', 'building'],
  warheads: {
    sa: { id: 'sa', vs: { none: 100, wood: 60, light: 25, heavy: 10, building: 10 } },
    hollowpoint: { id: 'hollowpoint', vs: { none: 100, wood: 20, light: 10, heavy: 5, building: 5 } },
    he: { id: 'he', vs: { none: 90, wood: 100, light: 75, heavy: 50, building: 100 } },
    ap: { id: 'ap', vs: { none: 25, wood: 75, light: 100, heavy: 100, building: 50 } },
    flak: { id: 'flak', vs: { none: 100, wood: 75, light: 60, heavy: 25, building: 10 } },
    // Nuisance: ruins a person's whole afternoon and does nothing at all to a wall.
    nuisance: { id: 'nuisance', vs: { none: 130, wood: 30, light: 15, heavy: 5, building: 2 } },
    shaped: { id: 'shaped', vs: { none: 60, wood: 100, light: 100, heavy: 110, building: 140 } },
  },
  weapons: {
    huntingrifle: { id: 'huntingrifle', damage: 14, range: 1024, rof: 24, warhead: 'sa', speed: 0, visual: 'bullet' },
    shotgun: { id: 'shotgun', damage: 26, range: 640, rof: 22, warhead: 'sa', speed: 0, splash: 48, visual: 'bullet' },
    crossbow: { id: 'crossbow', damage: 62, range: 1536, rof: 50, warhead: 'hollowpoint', speed: 96, visual: 'bullet' },
    sidearm: { id: 'sidearm', damage: 18, range: 896, rof: 18, warhead: 'sa', speed: 0, visual: 'bullet' },
    carbine: { id: 'carbine', damage: 19, range: 1152, rof: 17, warhead: 'sa', speed: 0, visual: 'bullet' },
    precisionrifle: { id: 'precisionrifle', damage: 78, range: 1664, rof: 46, warhead: 'hollowpoint', speed: 0, visual: 'bullet' },
    // The Association's small arms. Loud, legal, and surprisingly hard to ignore.
    airhorn: { id: 'airhorn', damage: 20, range: 768, rof: 16, warhead: 'nuisance', speed: 0, splash: 64, visual: 'sonic' },
    leafblower: { id: 'leafblower', damage: 30, range: 576, rof: 24, warhead: 'nuisance', speed: 0, splash: 96, visual: 'flame' },
    strimmer: { id: 'strimmer', damage: 38, range: 448, rof: 20, warhead: 'nuisance', speed: 0, splash: 72, visual: 'flame' },
    // A strongly worded vote. The target serves the Association until the minutes are filed.
    clipboard: { id: 'clipboard', damage: 0, range: 1152, rof: 90, warhead: 'nuisance', speed: 0, converts: 900, visual: 'psychic', targets: ['infantry', 'vehicle', 'naval'] },
    sprinkler: { id: 'sprinkler', damage: 34, range: 1664, minRange: 384, rof: 74, warhead: 'nuisance', speed: 26, splash: 160, visual: 'artillery' },
    mowerblades: { id: 'mowerblades', damage: 34, range: 1152, rof: 48, warhead: 'ap', speed: 64, splash: 40, visual: 'cannon' },
    grapnel: { id: 'grapnel', damage: 44, range: 1024, rof: 52, warhead: 'ap', speed: 40, splash: 32, visual: 'missile' },
    harpoon: { id: 'harpoon', damage: 58, range: 1408, rof: 60, warhead: 'ap', speed: 48, splash: 40, visual: 'missile' },
    flaregun: { id: 'flaregun', damage: 24, range: 1536, rof: 30, warhead: 'flak', speed: 60, burst: 2, visual: 'missile', targets: ['aircraft'] },
    scattergun: { id: 'scattergun', damage: 24, range: 1408, rof: 18, warhead: 'flak', speed: 64, burst: 2, visual: 'bullet', targets: ['infantry', 'vehicle', 'aircraft', 'structure'] },
    mortartube: { id: 'mortartube', damage: 44, range: 1600, minRange: 384, rof: 80, warhead: 'he', speed: 26, splash: 112, visual: 'artillery' },
    // What a hobby drone can carry, and the reason it is the dearest thing in the hut.
    eggdrop: { id: 'eggdrop', damage: 84, range: 1280, rof: 95, warhead: 'he', speed: 0, splash: 128, visual: 'bomb' },
    noticecharge: { id: 'noticecharge', damage: 170, range: 192, rof: 100, warhead: 'shaped', speed: 0, splash: 176, visual: 'bomb', suicide: true },
    gasbottle: { id: 'gasbottle', damage: 360, range: 256, rof: 100, warhead: 'shaped', speed: 0, splash: 400, visual: 'bomb', suicide: true },
    trapblast: { id: 'trapblast', damage: 140, range: 0, rof: 10, warhead: 'he', speed: 0, splash: 240, visual: 'bomb' },
    autocannon: { id: 'autocannon', damage: 27, range: 1280, rof: 16, warhead: 'ap', speed: 72, burst: 2, visual: 'cannon' },
    heavymg: { id: 'heavymg', damage: 24, range: 1280, rof: 16, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    observerpod: { id: 'observerpod', damage: 88, range: 1408, rof: 66, warhead: 'he', speed: 44, splash: 108, visual: 'missile' },
    helimissile: { id: 'helimissile', damage: 54, range: 1408, rof: 34, warhead: 'ap', speed: 50, splash: 48, burst: 2, visual: 'missile', targets: ['infantry', 'vehicle', 'naval', 'structure'] },
    helidoorgun: { id: 'helidoorgun', damage: 22, range: 1152, rof: 14, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    boatgun: { id: 'boatgun', damage: 34, range: 1280, rof: 42, warhead: 'he', speed: 48, splash: 48, visual: 'cannon' },
    deckgun: { id: 'deckgun', damage: 46, range: 1536, rof: 46, warhead: 'he', speed: 52, splash: 64, burst: 2, visual: 'cannon' },
    cctv: { id: 'cctv', damage: 20, range: 1152, rof: 16, warhead: 'sa', speed: 0, visual: 'bullet' },
    gatepost: { id: 'gatepost', damage: 40, range: 1280, rof: 46, warhead: 'ap', speed: 72, splash: 32, visual: 'cannon' },
  },
  units: {
    // ---- shared
    van: { id: 'van', name: 'Site Van', kind: 'vehicle', cost: 4500, hp: 540, armor: 'heavy', speed: 20, turn: 5, sight: 3, prereqs: ['shed'], tech: 6, deploysTo: 'yard', crusher: true, shape: 'mcv' },
    skiploader: { id: 'skiploader', name: 'Skip Loader', kind: 'vehicle', cost: 1300, hp: 560, armor: 'heavy', speed: 22, turn: 6, sight: 3, prereqs: ['shed'], tech: 2, crusher: true, shape: 'harvester', harvester: { capacity: 28, gather: 6, unload: 3 } },
    handyman: { id: 'handyman', name: 'Handyman', kind: 'infantry', cost: 450, hp: 25, armor: 'none', speed: 12, sight: 3, prereqs: ['hut|suite'], tech: 3, crushable: true, engineer: true, shape: 'engineer', role: 'support' },

    // ---- The Compound: everything was bought in bulk in 2011 and is still in its wrapper
    survivalist: { id: 'survivalist', name: 'Survivalist', kind: 'infantry', cost: 85, hp: 50, armor: 'none', speed: 14, sight: 3, weapon: 'huntingrifle', prereqs: ['hut'], factions: ['preppers'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    bowman: { id: 'bowman', name: 'Crossbow Enthusiast', kind: 'infantry', cost: 260, hp: 45, armor: 'none', speed: 13, sight: 6, weapon: 'crossbow', prereqs: ['hut'], factions: ['preppers'], tech: 3, crushable: true, disguise: true, shape: 'commando', role: 'combat' },
    shotgunner: { id: 'shotgunner', name: 'Gate Warden', kind: 'infantry', cost: 170, hp: 60, armor: 'none', speed: 12, sight: 3, weapon: 'shotgun', prereqs: ['hut'], factions: LOCALS, tech: 2, crushable: true, shape: 'infantry-elite', role: 'combat' },
    tubeteam: { id: 'tubeteam', name: 'Tube Crew', kind: 'infantry', cost: 370, hp: 50, armor: 'none', speed: 10, sight: 3, weapon: 'mortartube', prereqs: ['hut', 'mast'], factions: LOCALS, tech: 4, crushable: true, shape: 'infantry-elite', role: 'siege' },
    // The expensive end of the hut: a hobby drone, a crate of eggs and two very calm people.
    eggdrone: { id: 'eggdrone', name: 'Egg Drone Crew', kind: 'infantry', cost: 680, hp: 35, armor: 'none', speed: 11, sight: 7, weapon: 'eggdrop', prereqs: ['hut', 'pantry'], factions: ['preppers'], tech: 6, crushable: true, shape: 'probe', role: 'siege' },
    bugout: { id: 'bugout', name: 'Bug-Out Truck', kind: 'vehicle', cost: 320, hp: 140, armor: 'light', speed: 54, turn: 18, sight: 5, weapon: 'heavymg', prereqs: ['shed'], factions: LOCALS, tech: 2, shape: 'humvee', role: 'scout' },
    quadbike: { id: 'quadbike', name: 'Quad Bike', kind: 'vehicle', cost: 260, hp: 110, armor: 'light', speed: 62, turn: 20, sight: 6, weapon: 'sidearm', prereqs: ['shed'], factions: LOCALS, tech: 1, shape: 'trike', role: 'scout' },
    ploughbus: { id: 'ploughbus', name: 'Plough Bus', kind: 'vehicle', cost: 620, hp: 300, armor: 'heavy', speed: 34, turn: 9, sight: 4, weapon: 'shotgun', prereqs: ['shed'], factions: ['preppers'], tech: 4, transport: 6, infantryOnly: true, crusher: true, shape: 'apc', role: 'support' },
    gaswagon: { id: 'gaswagon', name: 'Gas Bottle Wagon', kind: 'vehicle', cost: 950, hp: 150, armor: 'light', speed: 42, turn: 12, sight: 4, weapon: 'gasbottle', prereqs: ['shed', 'pantry'], factions: ['preppers'], tech: 7, expendable: true, shape: 'demotruck', role: 'siege' },

    // ---- Pelican Point Residents' Association: the law is whatever was minuted
    resident: { id: 'resident', name: 'Concerned Resident', kind: 'infantry', cost: 90, hp: 45, armor: 'none', speed: 14, sight: 4, weapon: 'airhorn', prereqs: ['hut'], factions: ['hoa'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    blower: { id: 'blower', name: 'Leaf-Blower Brigade', kind: 'infantry', cost: 230, hp: 60, armor: 'none', speed: 12, sight: 3, weapon: 'leafblower', prereqs: ['hut'], factions: ['hoa'], tech: 3, crushable: true, shape: 'infantry-elite', role: 'combat' },
    // The notice is served by hand, and the structure it is served on does not survive it.
    officer: { id: 'officer', name: 'Bylaw Enforcement Officer', kind: 'infantry', cost: 420, hp: 55, armor: 'none', speed: 15, sight: 4, weapon: 'noticecharge', prereqs: ['hut', 'bylaw'], factions: ['hoa'], tech: 5, crushable: true, expendable: true, shape: 'officer', role: 'siege' },
    strimmerteam: { id: 'strimmerteam', name: 'Strimmer Team', kind: 'infantry', cost: 300, hp: 65, armor: 'none', speed: 11, sight: 3, weapon: 'strimmer', prereqs: ['hut', 'bylaw'], factions: ['hoa'], tech: 4, crushable: true, shape: 'infantry-elite', role: 'combat' },
    chair: { id: 'chair', name: 'Chair of the Committee', kind: 'infantry', cost: 1500, hp: 90, armor: 'none', speed: 13, sight: 6, weapon: 'clipboard', prereqs: ['hut', 'gazebo'], factions: ['hoa'], tech: 9, crushable: true, noClone: true, shape: 'yuri', role: 'support' },
    noisedrone: { id: 'noisedrone', name: 'Noise Complaint Drone', kind: 'infantry', cost: 700, hp: 35, armor: 'none', speed: 12, sight: 8, weapon: 'eggdrop', prereqs: ['hut', 'mast'], factions: ['hoa'], tech: 6, crushable: true, shape: 'probe', role: 'siege' },
    committeesuv: { id: 'committeesuv', name: 'Committee SUV', kind: 'vehicle', cost: 520, hp: 200, armor: 'light', speed: 50, turn: 15, sight: 6, weapon: 'heavymg', prereqs: ['shed'], factions: ['hoa'], tech: 3, shape: 'humvee', role: 'scout' },
    // The Association's main battle tank. It has a cup holder.
    mower: { id: 'mower', name: 'Ride-On Mower', kind: 'vehicle', cost: 760, hp: 360, armor: 'heavy', speed: 28, turn: 9, sight: 4, weapon: 'mowerblades', prereqs: ['shed@1'], factions: ['hoa'], tech: 5, crusher: true, shape: 'tank-turret', role: 'combat' },
    sprinklerrig: { id: 'sprinklerrig', name: 'Sprinkler Rig', kind: 'vehicle', cost: 880, hp: 180, armor: 'light', speed: 26, turn: 7, sight: 6, weapon: 'sprinkler', prereqs: ['shed@1', 'mast'], factions: ['hoa'], tech: 6, shape: 'siege-turret', role: 'siege' },

    // ---- Gull Reach: a protection racket with a slipway
    deckhand: { id: 'deckhand', name: 'Deckhand', kind: 'infantry', cost: 85, hp: 48, armor: 'none', speed: 14, sight: 3, weapon: 'huntingrifle', prereqs: ['hut'], factions: ['pirates'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    // A boarding party does not shoot your vehicle. It gets in and makes it theirs, loudly.
    boarder: { id: 'boarder', name: 'Boarding Party', kind: 'infantry', cost: 480, hp: 70, armor: 'none', speed: 16, sight: 4, weapon: 'grapnel', prereqs: ['hut', 'fishhouse'], factions: ['pirates'], tech: 5, crushable: true, terror: 22, shape: 'infantry-elite', role: 'combat' },
    navigator: { id: 'navigator', name: 'Navigator', kind: 'infantry', cost: 540, hp: 30, armor: 'none', speed: 15, sight: 6, prereqs: ['hut', 'mast'], factions: ['pirates'], tech: 5, crushable: true, spy: true, disguise: true, shape: 'spy', role: 'support' },
    gullcam: { id: 'gullcam', name: 'Gull-Cam Crew', kind: 'infantry', cost: 690, hp: 35, armor: 'none', speed: 12, sight: 8, weapon: 'eggdrop', prereqs: ['hut', 'fishhouse'], factions: ['pirates'], tech: 6, crushable: true, shape: 'probe', role: 'siege' },
    flatbed: { id: 'flatbed', name: 'Flatbed', kind: 'vehicle', cost: 560, hp: 240, armor: 'heavy', speed: 38, turn: 11, sight: 4, weapon: 'scattergun', prereqs: ['shed'], factions: ['pirates'], tech: 4, transport: 6, infantryOnly: true, shape: 'apc', role: 'support' },
    harpoontruck: { id: 'harpoontruck', name: 'Harpoon Truck', kind: 'vehicle', cost: 740, hp: 170, armor: 'light', speed: 44, turn: 14, sight: 6, weapon: 'harpoon', prereqs: ['shed@1'], factions: ['pirates'], tech: 5, shape: 'buggy', role: 'combat' },
    gunskiff: { id: 'gunskiff', name: 'Gun Skiff', kind: 'naval', cost: 340, hp: 210, armor: 'light', speed: 46, turn: 10, sight: 6, weapon: 'boatgun', prereqs: ['jetty'], factions: ['pirates'], tech: 3, shape: 'ship-patrol', role: 'combat' },
    jetski: { id: 'jetski', name: 'Jet Ski', kind: 'naval', cost: 220, hp: 120, armor: 'light', speed: 64, turn: 14, sight: 7, weapon: 'sidearm', prereqs: ['jetty'], factions: ['pirates'], tech: 2, shape: 'waveskimmer', role: 'scout' },
    tender: { id: 'tender', name: 'Harbour Tender', kind: 'naval', cost: 640, hp: 320, armor: 'heavy', speed: 34, turn: 8, sight: 5, prereqs: ['jetty'], factions: ['pirates'], tech: 4, transport: 8, shape: 'hovercraft', role: 'support' },
    mothership: { id: 'mothership', name: 'The Mothership', kind: 'naval', cost: 1600, hp: 620, armor: 'heavy', speed: 24, turn: 5, sight: 7, weapon: 'deckgun', prereqs: ['jetty', 'fishhouse'], factions: ['pirates'], tech: 8, transport: 6, shape: 'ship-destroyer', role: 'siege' },

    // ---- Vantage Risk Group: excellent, insured, and billing by the quarter hour
    operator: { id: 'operator', name: 'Operator', kind: 'infantry', cost: 220, hp: 70, armor: 'none', speed: 14, sight: 4, weapon: 'carbine', prereqs: ['suite'], factions: ['vantage'], tech: 1, crushable: true, shape: 'officer', role: 'combat' },
    teamlead: { id: 'teamlead', name: 'Team Lead', kind: 'infantry', cost: 620, hp: 60, armor: 'none', speed: 14, sight: 7, weapon: 'precisionrifle', prereqs: ['suite', 'mast'], factions: ['vantage'], tech: 5, crushable: true, shape: 'commando', role: 'combat' },
    liaison: { id: 'liaison', name: 'Client Liaison', kind: 'infantry', cost: 600, hp: 30, armor: 'none', speed: 15, sight: 5, prereqs: ['suite', 'mast'], factions: ['vantage'], tech: 5, crushable: true, spy: true, disguise: true, shape: 'spy', role: 'support' },
    breacher: { id: 'breacher', name: 'Breaching Specialist', kind: 'infantry', cost: 1150, hp: 100, armor: 'none', speed: 16, sight: 5, weapon: 'carbine', prereqs: ['suite', 'opsroom'], factions: ['vantage'], tech: 8, crushable: true, c4: 35, shape: 'commando', role: 'combat' },
    armouredsuv: { id: 'armouredsuv', name: 'Armoured SUV', kind: 'vehicle', cost: 760, hp: 320, armor: 'heavy', speed: 46, turn: 14, sight: 6, weapon: 'heavymg', prereqs: ['shed'], factions: ['vantage'], tech: 3, transport: 4, infantryOnly: true, shape: 'humvee', role: 'scout' },
    protected: { id: 'protected', name: 'Protected Carrier', kind: 'vehicle', cost: 1050, hp: 400, armor: 'heavy', speed: 38, turn: 11, sight: 5, weapon: 'autocannon', prereqs: ['shed'], factions: ['vantage'], tech: 5, transport: 5, infantryOnly: true, crusher: true, shape: 'apc', role: 'combat' },
    recovery: { id: 'recovery', name: 'Asset Recovery Vehicle', kind: 'vehicle', cost: 1450, hp: 480, armor: 'heavy', speed: 32, turn: 9, sight: 5, weapon: 'autocannon', prereqs: ['shed@1'], factions: ['vantage'], tech: 7, crusher: true, shape: 'hovertank', role: 'combat' },
    aaturretveh: { id: 'aaturretveh', name: 'Counter-UAS Truck', kind: 'vehicle', cost: 620, hp: 190, armor: 'light', speed: 44, turn: 14, sight: 7, weapon: 'scattergun', prereqs: ['shed', 'mast'], factions: ['vantage'], tech: 5, shape: 'quad', role: 'antiair' },
    // Fixed-wing, vehicle-tier, and it appears on the invoice as a line item.
    observer: { id: 'observer', name: 'Observation Platform', kind: 'aircraft', cost: 1450, hp: 130, armor: 'light', speed: 50, sight: 11, weapon: 'observerpod', prereqs: ['shed@1', 'mast'], factions: ['vantage'], tech: 8, queue: 'vehicle', altitude: 3, shape: 'drone', role: 'siege' },
    chopper: { id: 'chopper', name: 'Charter Helicopter', kind: 'aircraft', cost: 1250, hp: 140, armor: 'light', speed: 54, sight: 5, weapon: 'helidoorgun', ammo: 8, prereqs: ['heliport'], factions: ['vantage'], tech: 7, altitude: 2, transport: 8, infantryOnly: true, shape: 'helicopter', role: 'support' },
    gunship: { id: 'gunship', name: 'Escort Gunship', kind: 'aircraft', cost: 1750, hp: 170, armor: 'light', speed: 58, sight: 6, weapon: 'helimissile', altWeapon: 'helidoorgun', ammo: 8, prereqs: ['heliport', 'opsroom'], factions: ['vantage'], tech: 9, altitude: 2, shape: 'apache', role: 'combat' },
    launch: { id: 'launch', name: 'Fast Launch', kind: 'naval', cost: 1100, hp: 440, armor: 'heavy', speed: 38, turn: 8, sight: 7, weapon: 'deckgun', prereqs: ['jetty'], factions: ['vantage'], tech: 5, shape: 'ship-destroyer', role: 'siege' },
  },
  structures: {
    yard: { id: 'yard', name: 'Site Office', cost: 4500, hp: 1000, armor: 'building', w: 3, h: 3, power: 0, sight: 5, prereqs: [], tech: 99, queue: 'structure', constructionYard: true, upgrades: 1, upgradeCost: 1400, shape: 'conyard' },
    genny: { id: 'genny', name: 'Generator Shed', cost: 300, hp: 380, armor: 'building', w: 2, h: 2, power: 100, sight: 3, prereqs: [], tech: 1, queue: 'structure', shape: 'tdpower' },
    offgrid: { id: 'offgrid', name: 'Off-Grid Array', cost: 650, hp: 420, armor: 'building', w: 2, h: 2, power: 220, sight: 3, prereqs: ['genny', 'yard@1'], tech: 4, queue: 'structure', shape: 'advpower' },
    sorting: { id: 'sorting', name: 'Sorting Yard', cost: 1900, hp: 880, armor: 'building', w: 3, h: 3, power: -40, sight: 4, prereqs: ['genny'], tech: 1, queue: 'structure', storage: 1200, refinery: { dockX: 1, dockY: 3, freeUnit: 'skiploader' }, shape: 'refinery' },
    lockup: { id: 'lockup', name: 'Lock-Up', cost: 150, hp: 320, armor: 'building', w: 2, h: 1, power: -10, sight: 2, prereqs: ['sorting'], tech: 2, queue: 'structure', storage: 6000, shape: 'silo' },
    shed: { id: 'shed', name: 'The Big Shed', cost: 1900, hp: 800, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['sorting'], tech: 2, queue: 'structure', produces: 'vehicle', upgrades: 1, upgradeCost: 1100, shape: 'heavyfactory' },
    ramp: { id: 'ramp', name: 'The Ramp', cost: 1100, hp: 760, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['shed'], tech: 5, queue: 'structure', repairPad: true, shape: 'repairpad' },
    mast: { id: 'mast', name: 'CB Mast', cost: 900, hp: 460, armor: 'building', w: 2, h: 2, power: -40, sight: 9, prereqs: ['sorting'], tech: 3, queue: 'structure', radar: true, shape: 'radar' },
    hut: { id: 'hut', name: 'Volunteer Hut', cost: 280, hp: 420, armor: 'building', w: 2, h: 2, power: -20, sight: 3, prereqs: ['genny'], factions: LOCALS, tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    suite: { id: 'suite', name: 'Briefing Suite', cost: 640, hp: 620, armor: 'building', w: 3, h: 2, power: -30, sight: 4, prereqs: ['genny'], factions: ['vantage'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    jetty: { id: 'jetty', name: 'Jetty', cost: 880, hp: 740, armor: 'building', w: 3, h: 3, power: -20, sight: 4, prereqs: ['sorting'], factions: ['pirates', 'vantage'], tech: 3, queue: 'structure', produces: 'naval', onWater: true, shape: 'shipyard' },
    heliport: { id: 'heliport', name: 'Rooftop Heliport', cost: 1400, hp: 420, armor: 'building', w: 2, h: 2, power: -20, sight: 4, prereqs: ['mast', 'shed'], factions: ['vantage'], tech: 7, queue: 'structure', produces: 'aircraft', airfield: true, shape: 'helipad' },
    // The concealment mechanic, in its natural habitat: nobody can see over it, by design.
    hedgerow: { id: 'hedgerow', name: 'Privacy Hedge', cost: 800, hp: 520, armor: 'building', w: 2, h: 2, power: -20, sight: 4, prereqs: ['sorting'], tech: 4, queue: 'structure', gap: 5, shape: 'gap' },

    // ---- what each holdout has that the others cannot get planning permission for
    pantry: { id: 'pantry', name: 'Deep Pantry', cost: 1500, hp: 760, armor: 'building', w: 3, h: 2, power: -30, sight: 3, prereqs: ['hut', 'sorting'], factions: ['preppers'], tech: 6, queue: 'structure', incomeBonus: 15, shape: 'temple',
      superweapon: { id: 'bugoutconvoy', name: 'Bug-Out Convoy', kind: 'reinforce', charge: 4200, damage: 0, radius: 0, delay: 20, atBase: true, units: ['bugout', 'bugout', 'survivalist', 'shotgunner'] } },
    siren: { id: 'siren', name: 'Air-Raid Siren', cost: 950, hp: 440, armor: 'building', w: 1, h: 2, power: -50, sight: 8, prereqs: ['mast', 'hut'], factions: ['preppers'], tech: 7, queue: 'structure', needsPower: true, shape: 'sensor',
      superweapon: { id: 'everybodylook', name: 'Everybody Look', kind: 'reveal', charge: 2400, damage: 0, radius: 3584, delay: 10, duration: 900 } },
    bylaw: { id: 'bylaw', name: 'Bylaw Office', cost: 1200, hp: 680, armor: 'building', w: 2, h: 2, power: -40, sight: 4, prereqs: ['hut', 'mast'], factions: ['hoa'], tech: 5, queue: 'structure', shape: 'lab',
      // Grandfather clause: for ninety seconds, the rules do not apply to what was already there.
      superweapon: { id: 'grandfatherclause', name: 'Grandfather Clause', kind: 'curtain', charge: 5400, damage: 0, radius: 768, delay: 15, duration: 1350 } },
    gazebo: { id: 'gazebo', name: 'The Gazebo', cost: 2600, hp: 720, armor: 'building', w: 3, h: 3, power: -120, sight: 6, prereqs: ['bylaw', 'yard@1'], factions: ['hoa'], tech: 8, queue: 'structure', needsPower: true, shape: 'palace',
      superweapon: { id: 'extraordinarymeeting', name: 'Extraordinary General Meeting', kind: 'paradrop', charge: 5000, damage: 0, radius: 0, delay: 30, units: ['resident', 'resident', 'blower', 'strimmerteam'] } },
    fishhouse: { id: 'fishhouse', name: 'The Fish House', cost: 1700, hp: 800, armor: 'building', w: 3, h: 3, power: -40, sight: 5, prereqs: ['sorting', 'mast'], factions: ['pirates'], tech: 6, queue: 'structure', incomeBonus: 22, shape: 'starport',
      superweapon: [
        { id: 'everyonebacktotheboats', name: 'Everyone Back to the Boats', kind: 'reinforce', charge: 4200, damage: 0, radius: 0, delay: 20, atBase: true, units: ['deckhand', 'deckhand', 'shotgunner', 'boarder'] },
        { id: 'spyglass', name: 'Spyglass', kind: 'reveal', charge: 2400, damage: 0, radius: 4096, delay: 10, duration: 1050 },
      ] },
    opsroom: { id: 'opsroom', name: 'Operations Room', cost: 3200, hp: 700, armor: 'building', w: 3, h: 3, power: -150, sight: 8, prereqs: ['mast', 'shed@1'], factions: ['vantage'], tech: 9, queue: 'structure', needsPower: true, radar: true, shape: 'ioncannon',
      superweapon: [
        { id: 'billablestrike', name: 'Billable Precision Strike', kind: 'ion', charge: 4600, damage: 1400, radius: 384, delay: 40 },
        { id: 'scopecreep', name: 'Scope Creep', kind: 'paradrop', charge: 5200, damage: 0, radius: 0, delay: 30, units: ['operator', 'operator', 'teamlead', 'breacher'] },
      ] },

    // ---- defences, all of them technically within the rules
    cctv: { id: 'cctv', name: 'CCTV Post', cost: 400, hp: 420, armor: 'building', w: 1, h: 1, power: -10, sight: 7, prereqs: ['hut|suite'], tech: 2, queue: 'defense', weapon: 'cctv', shape: 'gtower' },
    gate: { id: 'gate', name: 'Automatic Gate', cost: 700, hp: 480, armor: 'building', w: 1, h: 1, power: -20, sight: 7, prereqs: ['shed'], tech: 4, queue: 'defense', weapon: 'gatepost', shape: 'turret' },
    flarepost: { id: 'flarepost', name: 'Flare Post', cost: 780, hp: 400, armor: 'building', w: 2, h: 1, power: -30, sight: 8, prereqs: ['mast'], tech: 5, queue: 'defense', weapon: 'flaregun', needsPower: true, shape: 'samsite' },
    sprinklertower: { id: 'sprinklertower', name: 'Sprinkler Tower', cost: 950, hp: 440, armor: 'building', w: 1, h: 2, power: -40, sight: 8, prereqs: ['mast', 'shed'], tech: 6, queue: 'defense', weapon: 'sprinkler', needsPower: true, shape: 'atower' },
    trap: { id: 'trap', name: 'Garden Trap', cost: 120, hp: 140, armor: 'wood', w: 1, h: 1, power: 0, sight: 2, prereqs: ['hut'], factions: LOCALS, tech: 3, queue: 'defense', deathWeapon: 'trapblast', shape: 'minelayer' },
    fence: { id: 'fence', name: 'Boundary Fence', cost: 60, hp: 380, armor: 'building', w: 1, h: 1, power: 0, sight: 0, prereqs: [], tech: 1, queue: 'defense', wall: true, shape: 'wall' },
  },
  factions: [
    { id: 'preppers', name: 'The Compound', side: 'holdout', color: '#6f7a3a', accent: '#cdd890',
      blurb: 'Twelve years of preparation and no plan. Hunting rifles, a crossbow, a bus with a plough and a hobby drone carrying eggs.',
      startUnits: ['van', 'survivalist', 'survivalist', 'shotgunner', 'quadbike'] },
    { id: 'hoa', name: 'Pelican Point', side: 'holdout', color: '#2f7fa8', accent: '#a8dcf0',
      blurb: "The Residents' Association. Air horns, leaf blowers, a ride-on mower with ideas, and a Chair whose vote you will find yourself agreeing with.",
      startUnits: ['van', 'resident', 'resident', 'resident', 'committeesuv'] },
    { id: 'pirates', name: 'Gull Reach', side: 'holdout', color: '#a8562f', accent: '#f0b48c',
      blurb: 'A protection racket with a slipway. Skiffs, jet skis, boarding parties who take your vehicle rather than destroy it, and a mothership with one working engine.',
      startUnits: ['van', 'deckhand', 'deckhand', 'shotgunner', 'bugout'] },
    { id: 'vantage', name: 'Vantage Risk Group', side: 'contractor', color: '#4a4f58', accent: '#b8bec8',
      blurb: 'Hired by a client they will not name. Immaculate kit, a fixed-wing observation platform, an escort gunship, and an invoice that arrives whatever happens.',
      startUnits: ['van', 'operator', 'operator', 'armouredsuv'] },
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
