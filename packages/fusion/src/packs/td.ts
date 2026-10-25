// Tiberian Dawn rule pack: the first classic brought onto the Fusion Engine.
//
// The four two-player battlefields are the same battlefields the original-engine slice
// ships (tools/create-map.py authors them as INI/BIN pairs): same size, same theatre,
// same base anchors, same Tiberium field centres and the same tree cells, converted to
// Fusion map features so a commander fights the identical ground on either engine.
// Unit and structure values approximate the classic from public knowledge and are tuned
// over time. Every part of this pack is available to fusion games as plain data.
import { MapFeature, MapField, MapPreset, RulePack } from '../rules';
import { mirror, quad } from './mapkit';

/** The authored scenarios are 60x60 inside a 64-cell grid at an offset of 2. */
const S = 60;
const o = (x: number, y: number) => ({ x: x - 2, y: y - 2 });
/** One tree cell, placed exactly (no edge jitter). */
const tree = (x: number, y: number): MapFeature => ({ terrain: 'trees', shape: 'rect', x: x - 2, y: y - 2, w: 1, h: 1 });
/** A Tiberium field centre, matching the authored ellipse. */
const tib = (x: number, y: number): MapField => ({ x: x - 2, y: y - 2, r: 4, resource: 'tiberium' });

const maps: MapPreset[] = [
  {
    id: 'tiberium-crossing', name: 'Tiberium Crossing', width: S, height: S, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'The classic foundation. Twin bases, a contested central Tiberium field.',
    starts: [o(10, 11), o(47, 44)],
    features: [tree(26, 8), tree(27, 9), tree(28, 10), tree(29, 11), tree(30, 12), tree(32, 45), tree(33, 46), tree(34, 47), tree(35, 48), tree(37, 15), tree(39, 16), tree(25, 43), tree(23, 44)],
    fields: [tib(18, 24), tib(43, 32), tib(28, 29)],
  },
  {
    id: 'canyon-clash', name: 'Canyon Clash', width: S, height: S, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'Bases pressed into opposite corners with rich flanking Tiberium.',
    starts: [o(7, 7), o(49, 48)],
    features: [tree(20, 20), tree(21, 21), tree(22, 22), tree(40, 40), tree(41, 39), tree(42, 38), tree(30, 14), tree(31, 15), tree(33, 46), tree(34, 45), tree(12, 33), tree(50, 28)],
    fields: [tib(14, 40), tib(46, 16), tib(30, 30)],
  },
  {
    id: 'tiberium-isles', name: 'Tiberium Isles', width: S, height: S, maxPlayers: 2, base: 'snow', roughness: 2,
    description: 'A winter theatre with scattered Tiberium pockets across broken ground.',
    starts: [o(9, 45), o(48, 9)],
    features: [tree(28, 18), tree(29, 19), tree(30, 20), tree(18, 38), tree(19, 37), tree(44, 24), tree(45, 23), tree(36, 44), tree(37, 43), tree(22, 10), tree(40, 12)],
    fields: [tib(16, 16), tib(45, 45), tib(30, 24), tib(24, 40)],
  },
  {
    id: 'desert-standoff', name: 'Desert Standoff', width: S, height: S, maxPlayers: 2, base: 'sand', roughness: 2,
    description: 'A wide desert expanse. Long sightlines reward armour and early expansion.',
    starts: [o(11, 25), o(45, 25)],
    features: [tree(27, 20), tree(28, 21), tree(26, 28), tree(34, 30), tree(20, 16), tree(38, 38), tree(31, 24), tree(24, 36), tree(33, 14)],
    fields: [tib(27, 12), tib(27, 44), tib(16, 30), tib(40, 18)],
  },
  // Fusion-only battlefields: the same ruleset on ground the original slice has no scenario for.
  {
    id: 'td-tiberium-gardens', name: 'Tiberium Gardens', width: 80, height: 80, maxPlayers: 4, base: 'clear', roughness: 2,
    description: 'Four bases around a great Tiberium garden, with wooded ridges between them.',
    starts: [{ x: 11, y: 11 }, { x: 68, y: 68 }, { x: 68, y: 11 }, { x: 11, y: 68 }],
    features: quad<MapFeature>([
      { terrain: 'trees', shape: 'circle', x: 28, y: 10, r: 2 },
      { terrain: 'trees', shape: 'circle', x: 10, y: 28, r: 2 },
      { terrain: 'rough', shape: 'circle', x: 26, y: 26, r: 3 },
      { terrain: 'cliff', shape: 'ridge', x: 32, y: 22, x2: 22, y2: 32, r: 1 },
      { terrain: 'road', shape: 'ridge', x: 14, y: 14, x2: 34, y2: 34, r: 1 },
    ], 80, 80),
    fields: [
      { x: 40, y: 40, r: 7, resource: 'tiberium' },
      ...quad<MapField>([{ x: 22, y: 14, r: 4, resource: 'tiberium' }, { x: 14, y: 22, r: 4, resource: 'tiberium' }, { x: 34, y: 34, r: 3, resource: 'tiberium' }], 80, 80),
    ],
  },
  {
    id: 'td-river-crossing', name: 'River Crossing', width: 72, height: 64, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'A river splits the valley with two fords. Gunboats patrol the water.',
    starts: [{ x: 9, y: 32 }, { x: 62, y: 31 }],
    features: [
      ...mirror<MapFeature>([
        { terrain: 'trees', shape: 'circle', x: 20, y: 12, r: 3 },
        { terrain: 'trees', shape: 'circle', x: 18, y: 50, r: 3 },
        { terrain: 'rough', shape: 'circle', x: 28, y: 28, r: 2 },
      ], 72, 64),
      { terrain: 'water', shape: 'ridge', x: 36, y: 0, x2: 36, y2: 22, r: 2 },
      { terrain: 'water', shape: 'ridge', x: 36, y: 28, x2: 36, y2: 36, r: 2 },
      { terrain: 'water', shape: 'ridge', x: 36, y: 42, x2: 36, y2: 63, r: 2 },
      { terrain: 'road', shape: 'rect', x: 33, y: 24, w: 7, h: 3 },
      { terrain: 'road', shape: 'rect', x: 33, y: 38, w: 7, h: 3 },
    ],
    fields: mirror<MapField>([
      { x: 22, y: 20, r: 4, resource: 'tiberium' },
      { x: 22, y: 44, r: 4, resource: 'tiberium' },
      { x: 30, y: 32, r: 3, resource: 'tiberium' },
    ], 72, 64),
  },
];

export const tdPack: RulePack = {
  id: 'td',
  name: 'Tiberian Dawn Style',
  projection: 'ortho',
  fidelityNote: 'Independent replication of Tiberian Dawn skirmish gameplay on the Fusion Engine. The two-player battlefields match the original-engine scenarios cell for cell; unit values approximate the classic and are tuned over time.',
  terrains: [
    { id: 'clear', name: 'Clear', foot: true, vehicle: true, buildable: true, speed: 100, color: '#5f7f3b', color2: '#557433' },
    { id: 'road', name: 'Road', foot: true, vehicle: true, buildable: true, speed: 120, color: '#8b8a80', color2: '#7e7d73' },
    { id: 'sand', name: 'Sand', foot: true, vehicle: true, buildable: true, speed: 90, color: '#c0a86e', color2: '#b09a60' },
    { id: 'snow', name: 'Snow', foot: true, vehicle: true, buildable: true, speed: 90, color: '#d6dde2', color2: '#c2cbd2' },
    { id: 'rough', name: 'Rocks', foot: true, vehicle: false, buildable: false, speed: 60, color: '#6d6f46', color2: '#60623c' },
    { id: 'trees', name: 'Trees', foot: false, vehicle: false, buildable: false, speed: 100, color: '#2f5423', color2: '#25461b' },
    { id: 'cliff', name: 'Cliff', foot: false, vehicle: false, buildable: false, speed: 100, color: '#5b5247', color2: '#4c443a' },
    { id: 'water', name: 'Water', foot: false, vehicle: false, water: true, buildable: false, speed: 100, color: '#2d5d8c', color2: '#26527e' },
  ],
  resources: [
    // Tiberium spreads from the fields it starts in, as it does in the classic.
    { id: 'tiberium', name: 'Tiberium', value: 25, max: 12, regrows: true, regrowEvery: 300, color: '#53c23a', color2: '#2f8f26' },
  ],
  armors: ['none', 'wood', 'light', 'heavy', 'building'],
  warheads: {
    sa: { id: 'sa', vs: { none: 100, wood: 60, light: 25, heavy: 10, building: 10 } },
    hollowpoint: { id: 'hollowpoint', vs: { none: 100, wood: 20, light: 10, heavy: 5, building: 5 } },
    he: { id: 'he', vs: { none: 90, wood: 100, light: 75, heavy: 50, building: 100 } },
    ap: { id: 'ap', vs: { none: 25, wood: 75, light: 100, heavy: 100, building: 50 } },
    fire: { id: 'fire', vs: { none: 100, wood: 100, light: 60, heavy: 40, building: 90 } },
    laser: { id: 'laser', vs: { none: 90, wood: 100, light: 100, heavy: 100, building: 80 } },
    sam: { id: 'sam', vs: { none: 50, wood: 100, light: 100, heavy: 75, building: 25 } },
    nuke: { id: 'nuke', vs: { none: 100, wood: 100, light: 100, heavy: 100, building: 100 } },
  },
  weapons: {
    minigun: { id: 'minigun', damage: 15, range: 1024, rof: 20, warhead: 'sa', speed: 0, visual: 'bullet' },
    grenade: { id: 'grenade', damage: 30, range: 1024, minRange: 128, rof: 50, warhead: 'he', speed: 24, splash: 96, visual: 'artillery' },
    dragon: { id: 'dragon', damage: 40, range: 1280, rof: 50, warhead: 'ap', speed: 40, burst: 2, visual: 'missile', targets: ['infantry', 'vehicle', 'aircraft', 'structure'] },
    flamethrower: { id: 'flamethrower', damage: 32, range: 640, rof: 30, warhead: 'fire', speed: 0, splash: 80, visual: 'flame' },
    chemspray: { id: 'chemspray', damage: 40, range: 704, rof: 30, warhead: 'fire', speed: 0, splash: 96, visual: 'flame' },
    sniper: { id: 'sniper', damage: 80, range: 1536, rof: 40, warhead: 'hollowpoint', speed: 0, visual: 'bullet' },
    vulcan: { id: 'vulcan', damage: 18, range: 1024, rof: 14, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    chaingun: { id: 'chaingun', damage: 15, range: 1024, rof: 16, warhead: 'sa', speed: 0, visual: 'bullet' },
    '75mm': { id: '75mm', damage: 25, range: 1152, rof: 44, warhead: 'ap', speed: 64, splash: 32, visual: 'cannon' },
    '90mm': { id: '90mm', damage: 30, range: 1152, rof: 50, warhead: 'ap', speed: 64, splash: 40, visual: 'cannon' },
    '120mm': { id: '120mm', damage: 40, range: 1280, rof: 60, warhead: 'ap', speed: 60, splash: 48, burst: 2, visual: 'cannon' },
    '155mm': { id: '155mm', damage: 70, range: 1792, minRange: 384, rof: 80, warhead: 'he', speed: 28, splash: 112, visual: 'artillery' },
    mlrsrockets: { id: 'mlrsrockets', damage: 35, range: 1792, minRange: 256, rof: 70, warhead: 'he', speed: 40, splash: 96, burst: 2, visual: 'missile', targets: ['infantry', 'vehicle', 'aircraft', 'structure'] },
    ssmrockets: { id: 'ssmrockets', damage: 60, range: 2048, minRange: 512, rof: 100, warhead: 'he', speed: 36, splash: 128, burst: 2, visual: 'missile' },
    flametongue: { id: 'flametongue', damage: 55, range: 768, rof: 40, warhead: 'fire', speed: 0, splash: 128, visual: 'flame' },
    orcarockets: { id: 'orcarockets', damage: 45, range: 1280, rof: 30, warhead: 'ap', speed: 48, splash: 48, burst: 2, visual: 'missile' },
    apachegun: { id: 'apachegun', damage: 20, range: 1152, rof: 14, warhead: 'sa', speed: 0, burst: 2, visual: 'bullet' },
    gunturret: { id: 'gunturret', damage: 40, range: 1280, rof: 44, warhead: 'ap', speed: 72, splash: 32, visual: 'cannon' },
    towergun: { id: 'towergun', damage: 20, range: 1024, rof: 16, warhead: 'sa', speed: 0, visual: 'bullet' },
    towerrockets: { id: 'towerrockets', damage: 40, range: 1792, rof: 50, warhead: 'ap', speed: 44, burst: 2, visual: 'missile', targets: ['infantry', 'vehicle', 'aircraft', 'structure'] },
    obelisklaser: { id: 'obelisklaser', damage: 200, range: 1792, rof: 90, warhead: 'laser', speed: 0, visual: 'laser' },
    samsite: { id: 'samsite', damage: 50, range: 1792, rof: 40, warhead: 'sam', speed: 56, burst: 2, visual: 'missile', targets: ['aircraft'] },
    bombs: { id: 'bombs', damage: 120, range: 256, rof: 70, warhead: 'he', speed: 0, splash: 288, visual: 'bomb' },
    boatgun: { id: 'boatgun', damage: 50, range: 1536, rof: 60, warhead: 'he', speed: 48, splash: 64, burst: 2, visual: 'missile' },
  },
  units: {
    // ---- infantry
    minigunner: { id: 'minigunner', name: 'Minigunner', kind: 'infantry', cost: 100, hp: 50, armor: 'none', speed: 14, sight: 3, weapon: 'minigun', prereqs: ['pyle|hand'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    grenadier: { id: 'grenadier', name: 'Grenadier', kind: 'infantry', cost: 160, hp: 50, armor: 'none', speed: 14, sight: 3, weapon: 'grenade', prereqs: ['pyle'], factions: ['gdi'], tech: 2, crushable: true, shape: 'infantry-elite', role: 'combat' },
    rocketsoldier: { id: 'rocketsoldier', name: 'Rocket Soldier', kind: 'infantry', cost: 300, hp: 45, armor: 'none', speed: 12, sight: 4, weapon: 'dragon', prereqs: ['pyle|hand'], tech: 3, crushable: true, shape: 'infantry-rocket', role: 'antiair' },
    flamethrower: { id: 'flamethrower', name: 'Flamethrower', kind: 'infantry', cost: 200, hp: 70, armor: 'none', speed: 13, sight: 3, weapon: 'flamethrower', prereqs: ['hand'], factions: ['nod'], tech: 3, crushable: true, shape: 'infantry-elite', role: 'combat' },
    chemwarrior: { id: 'chemwarrior', name: 'Chem Warrior', kind: 'infantry', cost: 300, hp: 70, armor: 'none', speed: 13, sight: 3, weapon: 'chemspray', prereqs: ['hand', 'tmpl'], factions: ['nod'], tech: 7, crushable: true, shape: 'infantry-elite', role: 'combat' },
    engineer: { id: 'engineer', name: 'Engineer', kind: 'infantry', cost: 500, hp: 25, armor: 'none', speed: 12, sight: 3, prereqs: ['pyle|hand'], tech: 3, crushable: true, engineer: true, shape: 'engineer', role: 'support' },
    commando: { id: 'commando', name: 'Commando', kind: 'infantry', cost: 1000, hp: 80, armor: 'none', speed: 16, sight: 5, weapon: 'sniper', prereqs: ['pyle|hand', 'eye|tmpl'], tech: 8, crushable: true, c4: 25, shape: 'infantry-elite', role: 'combat' },
    // ---- vehicles
    humvee: { id: 'humvee', name: 'Hum-vee', kind: 'vehicle', cost: 400, hp: 150, armor: 'light', speed: 50, turn: 16, sight: 5, weapon: 'vulcan', prereqs: ['weap'], factions: ['gdi'], tech: 2, shape: 'humvee', role: 'scout' },
    buggy: { id: 'buggy', name: 'Nod Buggy', kind: 'vehicle', cost: 300, hp: 140, armor: 'light', speed: 54, turn: 18, sight: 5, weapon: 'chaingun', prereqs: ['afld'], factions: ['nod'], tech: 2, shape: 'buggy', role: 'scout' },
    bike: { id: 'bike', name: 'Recon Bike', kind: 'vehicle', cost: 500, hp: 160, armor: 'light', speed: 62, turn: 20, sight: 5, weapon: 'dragon', prereqs: ['afld'], factions: ['nod'], tech: 4, shape: 'bike', role: 'scout' },
    apc: { id: 'apc', name: 'APC', kind: 'vehicle', cost: 700, hp: 200, armor: 'heavy', speed: 42, turn: 12, sight: 4, weapon: 'vulcan', prereqs: ['weap'], factions: ['gdi'], tech: 4, transport: 5, infantryOnly: true, crusher: true, shape: 'apc', role: 'support' },
    lighttank: { id: 'lighttank', name: 'Light Tank', kind: 'vehicle', cost: 600, hp: 300, armor: 'heavy', speed: 32, turn: 10, sight: 4, weapon: '75mm', prereqs: ['afld'], factions: ['nod'], tech: 4, crusher: true, shape: 'tank-turret', role: 'combat' },
    mediumtank: { id: 'mediumtank', name: 'Medium Tank', kind: 'vehicle', cost: 800, hp: 400, armor: 'heavy', speed: 26, turn: 8, sight: 4, weapon: '90mm', prereqs: ['weap'], factions: ['gdi'], tech: 5, crusher: true, shape: 'tank-turret', role: 'combat' },
    flametank: { id: 'flametank', name: 'Flame Tank', kind: 'vehicle', cost: 800, hp: 300, armor: 'heavy', speed: 34, turn: 10, sight: 3, weapon: 'flametongue', prereqs: ['afld', 'hand'], factions: ['nod'], tech: 6, crusher: true, shape: 'flametank', role: 'combat' },
    stealthtank: { id: 'stealthtank', name: 'Stealth Tank', kind: 'vehicle', cost: 900, hp: 300, armor: 'light', speed: 40, turn: 12, sight: 5, weapon: 'dragon', prereqs: ['afld@1', 'tmpl'], factions: ['nod'], tech: 8, disguise: true, shape: 'tank-turret', role: 'combat' },
    artillery: { id: 'artillery', name: 'Artillery', kind: 'vehicle', cost: 450, hp: 75, armor: 'light', speed: 24, turn: 6, sight: 5, weapon: '155mm', prereqs: ['afld'], factions: ['nod'], tech: 5, shape: 'siege-turret', role: 'siege' },
    mlrs: { id: 'mlrs', name: 'Rocket Launcher', kind: 'vehicle', cost: 800, hp: 150, armor: 'light', speed: 30, turn: 8, sight: 6, weapon: 'mlrsrockets', prereqs: ['weap', 'hq'], factions: ['gdi'], tech: 6, shape: 'launcher', role: 'siege' },
    ssm: { id: 'ssm', name: 'SSM Launcher', kind: 'vehicle', cost: 800, hp: 150, armor: 'light', speed: 28, turn: 6, sight: 6, weapon: 'ssmrockets', prereqs: ['afld@1', 'tmpl'], factions: ['nod'], tech: 7, shape: 'launcher', role: 'siege' },
    mammoth: { id: 'mammoth', name: 'Mammoth Tank', kind: 'vehicle', cost: 1500, hp: 600, armor: 'heavy', speed: 18, turn: 5, sight: 5, weapon: '120mm', prereqs: ['weap@1', 'eye'], factions: ['gdi'], tech: 9, crusher: true, regen: 1, shape: 'mammoth-turret', role: 'combat' },
    harvester: { id: 'harvester', name: 'Harvester', kind: 'vehicle', cost: 1400, hp: 600, armor: 'heavy', speed: 20, turn: 6, sight: 3, prereqs: ['weap|afld'], tech: 2, crusher: true, shape: 'harvester', harvester: { capacity: 28, gather: 6, unload: 3 } },
    mcv: { id: 'mcv', name: 'Mobile Construction Vehicle', kind: 'vehicle', cost: 5000, hp: 600, armor: 'heavy', speed: 16, turn: 4, sight: 3, prereqs: ['weap|afld', 'hq'], tech: 6, deploysTo: 'fact', crusher: true, shape: 'mcv' },
    // ---- aircraft and naval
    orca: { id: 'orca', name: 'Orca', kind: 'aircraft', cost: 1200, hp: 125, armor: 'light', speed: 64, sight: 5, weapon: 'orcarockets', ammo: 3, prereqs: ['hpad'], factions: ['gdi'], tech: 7, altitude: 2, shape: 'orca', role: 'combat' },
    apache: { id: 'apache', name: 'Apache', kind: 'aircraft', cost: 1200, hp: 125, armor: 'light', speed: 56, sight: 5, weapon: 'apachegun', ammo: 6, prereqs: ['hpad'], factions: ['nod'], tech: 7, altitude: 2, shape: 'apache', role: 'combat' },
    bomber: { id: 'bomber', name: 'Bomber', kind: 'aircraft', cost: 1400, hp: 150, armor: 'light', speed: 70, sight: 5, weapon: 'bombs', ammo: 1, prereqs: ['aflight'], factions: ['nod'], tech: 6, altitude: 3, shape: 'jet', role: 'siege' },
    chinook: { id: 'chinook', name: 'Transport Helicopter', kind: 'aircraft', cost: 1500, hp: 90, armor: 'light', speed: 50, sight: 4, prereqs: ['hpad'], tech: 7, altitude: 2, transport: 5, infantryOnly: true, shape: 'helicopter', role: 'support' },
    gunboat: { id: 'gunboat', name: 'Gunboat', kind: 'naval', cost: 500, hp: 400, armor: 'heavy', speed: 30, turn: 6, sight: 6, weapon: 'boatgun', prereqs: ['syrd'], tech: 5, shape: 'ship-patrol', role: 'siege' },
  },
  structures: {
    fact: { id: 'fact', name: 'Construction Yard', cost: 5000, hp: 1000, armor: 'building', w: 3, h: 3, power: 0, sight: 5, prereqs: [], tech: 99, queue: 'structure', constructionYard: true, upgrades: 1, upgradeCost: 1500, shape: 'conyard' },
    nuke: { id: 'nuke', name: 'Power Plant', cost: 300, hp: 400, armor: 'building', w: 2, h: 2, power: 100, sight: 3, prereqs: [], tech: 1, queue: 'structure', shape: 'tdpower' },
    nuk2: { id: 'nuk2', name: 'Advanced Power Plant', cost: 700, hp: 400, armor: 'building', w: 2, h: 2, power: 200, sight: 3, prereqs: ['nuke', 'fact@1'], tech: 4, queue: 'structure', shape: 'advpower' },
    proc: { id: 'proc', name: 'Tiberium Refinery', cost: 2000, hp: 900, armor: 'building', w: 3, h: 3, power: -40, sight: 4, prereqs: ['nuke'], tech: 1, queue: 'structure', storage: 1000, refinery: { dockX: 1, dockY: 3, freeUnit: 'harvester' }, shape: 'refinery' },
    silo: { id: 'silo', name: 'Tiberium Silo', cost: 150, hp: 300, armor: 'building', w: 2, h: 1, power: -10, sight: 2, prereqs: ['proc'], tech: 2, queue: 'structure', storage: 6000, shape: 'silo' },
    pyle: { id: 'pyle', name: 'Barracks', cost: 300, hp: 400, armor: 'building', w: 2, h: 2, power: -20, sight: 3, prereqs: ['nuke'], factions: ['gdi'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    hand: { id: 'hand', name: 'Hand of Nod', cost: 300, hp: 400, armor: 'building', w: 2, h: 3, power: -20, sight: 3, prereqs: ['nuke'], factions: ['nod'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'handofnod' },
    weap: { id: 'weap', name: 'Weapons Factory', cost: 2000, hp: 800, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['proc'], factions: ['gdi'], tech: 2, queue: 'structure', produces: 'vehicle', upgrades: 1, upgradeCost: 1000, shape: 'heavyfactory' },
    afld: { id: 'afld', name: 'Airstrip', cost: 2000, hp: 800, armor: 'building', w: 4, h: 2, power: -30, sight: 4, prereqs: ['proc'], factions: ['nod'], tech: 2, queue: 'structure', produces: 'vehicle', airfield: true, upgrades: 1, upgradeCost: 1000, shape: 'airstrip' },
    // The strip's second role: bombers rearm here, and the upgrade is what opens them.
    aflight: { id: 'aflight', name: 'Bomber Flight', cost: 1200, hp: 600, armor: 'building', w: 3, h: 2, power: -30, sight: 4, prereqs: ['afld@1'], factions: ['nod'], tech: 6, queue: 'structure', produces: 'aircraft', airfield: true, shape: 'airstrip' },
    hq: { id: 'hq', name: 'Communications Center', cost: 1000, hp: 500, armor: 'building', w: 2, h: 2, power: -40, sight: 10, prereqs: ['proc'], tech: 4, queue: 'structure', radar: true, shape: 'radar' },
    fix: { id: 'fix', name: 'Repair Facility', cost: 1200, hp: 800, armor: 'building', w: 3, h: 3, power: -30, sight: 3, prereqs: ['weap|afld'], tech: 5, queue: 'structure', repairPad: true, shape: 'repairpad' },
    hpad: { id: 'hpad', name: 'Helipad', cost: 1500, hp: 400, armor: 'building', w: 2, h: 2, power: -10, sight: 3, prereqs: ['hq'], tech: 7, queue: 'structure', produces: 'aircraft', airfield: true, shape: 'helipad' },
    syrd: { id: 'syrd', name: 'Shipyard', cost: 1000, hp: 800, armor: 'building', w: 3, h: 3, power: -20, sight: 4, prereqs: ['proc'], tech: 5, queue: 'structure', produces: 'naval', onWater: true, shape: 'shipyard' },
    eye: { id: 'eye', name: 'Advanced Communications Center', cost: 2800, hp: 600, armor: 'building', w: 2, h: 2, power: -200, sight: 12, prereqs: ['hq', 'weap'], factions: ['gdi'], tech: 9, queue: 'structure', radar: true, needsPower: true, upgrades: 1, upgradeCost: 1200, shape: 'ioncannon',
      superweapon: { id: 'ioncannon', name: 'Ion Cannon', kind: 'ion', charge: 4500, damage: 1500, radius: 512, delay: 45 } },
    tmpl: { id: 'tmpl', name: 'Temple of Nod', cost: 3000, hp: 1000, armor: 'building', w: 3, h: 3, power: -150, sight: 5, prereqs: ['hq', 'afld'], factions: ['nod'], tech: 9, queue: 'structure', needsPower: true, upgrades: 1, upgradeCost: 1200, shape: 'temple',
      superweapon: { id: 'nukestrike', name: 'Nuclear Strike', kind: 'missile', charge: 6300, damage: 1500, radius: 1024, delay: 90 } },
    // GDI answers from orbit and from the air; Nod answers with chemicals and with stealth.
    drop: { id: 'drop', name: 'Dropship Bay', cost: 2500, hp: 800, armor: 'building', w: 3, h: 3, power: -50, sight: 5, prereqs: ['weap@1', 'eye'], factions: ['gdi'], tech: 9, queue: 'structure', shape: 'dropship',
      superweapon: { id: 'airborne', name: 'Airborne Reinforcements', kind: 'reinforce', charge: 4500, damage: 0, radius: 0, delay: 45, atBase: true, units: ['mediumtank', 'mediumtank', 'rocketsoldier', 'rocketsoldier'] } },
    uplink: { id: 'uplink', name: 'GDI Uplink Center', cost: 2500, hp: 600, armor: 'building', w: 2, h: 2, power: -100, sight: 10, prereqs: ['eye@1'], factions: ['gdi'], tech: 10, queue: 'structure', needsPower: true, shape: 'satellite',
      superweapon: { id: 'satsweep', name: 'Satellite Sweep', kind: 'reveal', charge: 2700, damage: 0, radius: 4608, delay: 15, duration: 900 } },
    chem: { id: 'chem', name: 'Chemical Missile Silo', cost: 3500, hp: 800, armor: 'building', w: 3, h: 3, power: -100, sight: 5, prereqs: ['tmpl@1'], factions: ['nod'], tech: 10, queue: 'structure', needsPower: true, shape: 'missilesilo',
      // Less blast than the nuclear strike, but the cloud covers far more ground.
      superweapon: { id: 'chemmissile', name: 'Chemical Missile', kind: 'missile', charge: 6300, damage: 700, radius: 1792, delay: 90 } },
    stlth: { id: 'stlth', name: 'Stealth Field Generator', cost: 1500, hp: 500, armor: 'building', w: 2, h: 2, power: -100, sight: 4, prereqs: ['tmpl'], factions: ['nod'], tech: 8, queue: 'structure', gap: 6, needsPower: true, shape: 'gap' },
    gtwr: { id: 'gtwr', name: 'Guard Tower', cost: 500, hp: 400, armor: 'building', w: 1, h: 1, power: -10, sight: 6, prereqs: ['pyle|hand'], tech: 2, queue: 'defense', weapon: 'towergun', shape: 'gtower' },
    atwr: { id: 'atwr', name: 'Advanced Guard Tower', cost: 1000, hp: 500, armor: 'building', w: 1, h: 2, power: -20, sight: 8, prereqs: ['hq', 'fact@1'], factions: ['gdi'], tech: 6, queue: 'defense', weapon: 'towerrockets', needsPower: true, shape: 'atower' },
    gun: { id: 'gun', name: 'Gun Turret', cost: 600, hp: 400, armor: 'building', w: 1, h: 1, power: -20, sight: 6, prereqs: ['hand'], factions: ['nod'], tech: 4, queue: 'defense', weapon: 'gunturret', shape: 'turret' },
    sam: { id: 'sam', name: 'SAM Site', cost: 750, hp: 400, armor: 'building', w: 2, h: 1, power: -20, sight: 8, prereqs: ['hand', 'hq'], factions: ['nod'], tech: 5, queue: 'defense', weapon: 'samsite', needsPower: true, shape: 'samsite' },
    obli: { id: 'obli', name: 'Obelisk of Light', cost: 1500, hp: 400, armor: 'building', w: 1, h: 2, power: -150, sight: 8, prereqs: ['hq', 'afld', 'fact@1'], factions: ['nod'], tech: 8, queue: 'defense', weapon: 'obelisklaser', needsPower: true, shape: 'obelisk' },
    sbag: { id: 'sbag', name: 'Sandbag Wall', cost: 50, hp: 200, armor: 'wood', w: 1, h: 1, power: 0, sight: 0, prereqs: [], tech: 1, queue: 'defense', wall: true, shape: 'wall' },
    brik: { id: 'brik', name: 'Concrete Wall', cost: 100, hp: 600, armor: 'building', w: 1, h: 1, power: 0, sight: 0, prereqs: ['pyle|hand'], tech: 4, queue: 'defense', wall: true, shape: 'wall' },
  },
  factions: [
    { id: 'gdi', name: 'GDI', side: 'gdi', color: '#d8b63a', accent: '#fff0a8', blurb: 'Global Defense Initiative. Heavy armour, the Ion Cannon and the Mammoth Tank.', startUnits: ['mcv', 'minigunner', 'minigunner', 'minigunner', 'humvee'] },
    { id: 'nod', name: 'Nod', side: 'nod', color: '#c8362c', accent: '#ff9e94', blurb: 'Brotherhood of Nod. Speed, stealth, the Obelisk and the Temple.', startUnits: ['mcv', 'minigunner', 'minigunner', 'minigunner', 'buggy'] },
  ],
  maps,
  startCredits: { low: 3000, standard: 6000, high: 12000 },
  buildTicksPer100: 60,
  lowPowerProductionPercent: 50,
  extraFactoryBonus: 100,
  buildRadius: 2,
  sellRefundPercent: 50,
  mechanics: {
    // Tiberium creeps outward from the fields it starts in.
    regrowth: { everyTicks: 180, amount: 1, spreadChance: 10 },
  },
  // Tiberian Dawn has no unit ranks, so veterancy is deliberately omitted.
};
