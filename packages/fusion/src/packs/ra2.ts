// RA2-style rule pack: an independent replication of Red Alert 2 skirmish gameplay.
// Values approximate the classic game from public knowledge and are labelled for tuning.
import { MapFeature, MapField, MapPreset, RulePack } from '../rules';
import { mirror, quad } from './mapkit';

const W = 64, H = 64;
const mirror2 = <T extends MapFeature | MapField>(items: T[]) => mirror(items, W, H);
const quad4 = <T extends MapFeature | MapField>(items: T[]) => quad(items, W, H);

const maps: MapPreset[] = [
  {
    id: 'temperate-valley', name: 'Temperate Valley', width: W, height: H, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'Wooded valley split by a river with two fords. Gems in the centre.',
    starts: [{ x: 9, y: 9 }, { x: 53, y: 53 }],
    features: [
      ...mirror2<MapFeature>([
        { terrain: 'trees', shape: 'circle', x: 22, y: 6, r: 3 },
        { terrain: 'trees', shape: 'circle', x: 5, y: 24, r: 3 },
        { terrain: 'cliff', shape: 'ridge', x: 16, y: 26, x2: 24, y2: 20, r: 1 },
        { terrain: 'rough', shape: 'circle', x: 30, y: 18, r: 3 },
        { terrain: 'trees', shape: 'circle', x: 40, y: 10, r: 2 },
      ]),
      { terrain: 'water', shape: 'ridge', x: 2, y: 61, x2: 25, y2: 38, r: 2 },
      { terrain: 'water', shape: 'ridge', x: 38, y: 25, x2: 61, y2: 2, r: 2 },
      { terrain: 'road', shape: 'ridge', x: 12, y: 12, x2: 51, y2: 51, r: 1 },
    ],
    fields: [
      ...mirror2<MapField>([
        { x: 20, y: 13, r: 3, resource: 'ore' },
        { x: 12, y: 21, r: 3, resource: 'ore' },
        { x: 34, y: 8, r: 3, resource: 'ore' },
      ]),
      { x: 32, y: 32, r: 2, resource: 'gems' },
      { x: 36, y: 28, r: 2, resource: 'ore' },
      { x: 28, y: 36, r: 2, resource: 'ore' },
    ],
  },
  {
    id: 'lake-divide', name: 'Lake Divide', width: W, height: H, maxPlayers: 2, base: 'clear', roughness: 2,
    description: 'A great lake with land bridges north and south. Hold the bridges, hold the map.',
    starts: [{ x: 8, y: 31 }, { x: 54, y: 31 }],
    features: [
      { terrain: 'water', shape: 'circle', x: 32, y: 32, r: 11 },
      ...mirror2<MapFeature>([
        { terrain: 'trees', shape: 'circle', x: 14, y: 8, r: 3 },
        { terrain: 'trees', shape: 'circle', x: 6, y: 48, r: 3 },
        { terrain: 'sand', shape: 'circle', x: 20, y: 32, r: 3 },
        { terrain: 'cliff', shape: 'ridge', x: 20, y: 4, x2: 24, y2: 14, r: 1 },
      ]),
    ],
    fields: [
      ...mirror2<MapField>([
        { x: 16, y: 22, r: 3, resource: 'ore' },
        { x: 16, y: 41, r: 3, resource: 'ore' },
      ]),
      { x: 32, y: 8, r: 3, resource: 'ore' },
      { x: 32, y: 55, r: 3, resource: 'ore' },
      { x: 32, y: 4, r: 1, resource: 'gems' },
      { x: 32, y: 59, r: 1, resource: 'gems' },
    ],
  },
  {
    id: 'four-corners', name: 'Four Corners', width: W, height: H, maxPlayers: 4, base: 'clear', roughness: 2,
    description: 'Four bases, one rich gem field in the middle. Free-for-all.',
    starts: [{ x: 8, y: 8 }, { x: 54, y: 54 }, { x: 54, y: 8 }, { x: 8, y: 54 }],
    features: quad4<MapFeature>([
      { terrain: 'trees', shape: 'circle', x: 20, y: 6, r: 2 },
      { terrain: 'cliff', shape: 'ridge', x: 22, y: 24, x2: 25, y2: 21, r: 1 },
      { terrain: 'water', shape: 'circle', x: 32, y: 14, r: 2 },
    ]),
    fields: [
      { x: 32, y: 32, r: 4, resource: 'gems' },
      ...quad4<MapField>([{ x: 18, y: 14, r: 3, resource: 'ore' }]),
    ],
  },
];

const both = ['allies', 'soviets'];

export const ra2Pack: RulePack = {
  id: 'ra2',
  name: 'Red Alert 2 Style',
  projection: 'iso',
  fidelityNote: 'Independent replication of Red Alert 2 skirmish gameplay. Values approximate the classic and are tuned over time.',
  terrains: [
    { id: 'clear', name: 'Clear', foot: true, vehicle: true, buildable: true, speed: 100, color: '#5f7f3b', color2: '#557433' },
    { id: 'road', name: 'Road', foot: true, vehicle: true, buildable: true, speed: 120, color: '#8b8a80', color2: '#7e7d73' },
    { id: 'sand', name: 'Sand', foot: true, vehicle: true, buildable: true, speed: 90, color: '#b9a46c', color2: '#ab965f' },
    { id: 'rough', name: 'Rough', foot: true, vehicle: true, buildable: false, speed: 70, color: '#6d6f46', color2: '#60623c' },
    { id: 'trees', name: 'Trees', foot: false, vehicle: false, buildable: false, speed: 100, color: '#2f5423', color2: '#25461b' },
    { id: 'cliff', name: 'Cliff', foot: false, vehicle: false, buildable: false, speed: 100, color: '#5b5247', color2: '#4c443a' },
    { id: 'water', name: 'Water', foot: false, vehicle: false, buildable: false, speed: 100, color: '#2d5d8c', color2: '#26527e' },
  ],
  resources: [
    { id: 'ore', name: 'Ore', value: 25, max: 12, regrows: true, color: '#d6b24a', color2: '#b38c2c' },
    { id: 'gems', name: 'Gems', value: 50, max: 12, color: '#57c4d8', color2: '#3a95b6' },
  ],
  armors: ['none', 'light', 'heavy', 'building'],
  warheads: {
    smallarms: { id: 'smallarms', vs: { none: 100, light: 50, heavy: 25, building: 15 } },
    ap: { id: 'ap', vs: { none: 30, light: 75, heavy: 100, building: 50 } },
    he: { id: 'he', vs: { none: 100, light: 100, heavy: 75, building: 100 } },
    electric: { id: 'electric', vs: { none: 100, light: 100, heavy: 90, building: 60 } },
    prism: { id: 'prism', vs: { none: 100, light: 100, heavy: 80, building: 90 } },
    flak: { id: 'flak', vs: { none: 100, light: 30, heavy: 15, building: 10 } },
    missile: { id: 'missile', vs: { none: 30, light: 100, heavy: 75, building: 40 } },
    jaws: { id: 'jaws', vs: { none: 100, light: 0, heavy: 0, building: 0 } },
    hero: { id: 'hero', vs: { none: 100, light: 10, heavy: 5, building: 0 } },
  },
  weapons: {
    m60: { id: 'm60', damage: 15, range: 1280, rof: 20, warhead: 'smallarms', speed: 0, visual: 'bullet' },
    carbine: { id: 'carbine', damage: 10, range: 1024, rof: 20, warhead: 'smallarms', speed: 0, visual: 'bullet' },
    jaws: { id: 'jaws', damage: 200, range: 300, rof: 12, warhead: 'jaws', speed: 0, targets: ['infantry'], visual: 'bullet' },
    pistols: { id: 'pistols', damage: 150, range: 1536, rof: 12, warhead: 'hero', speed: 0, targets: ['infantry', 'vehicle'], visual: 'bullet' },
    teslabolt: { id: 'teslabolt', damage: 55, range: 896, rof: 50, warhead: 'electric', speed: 0, visual: 'tesla' },
    cannon105: { id: 'cannon105', damage: 65, range: 1472, rof: 60, warhead: 'ap', speed: 72, visual: 'cannon' },
    cannon120: { id: 'cannon120', damage: 90, range: 1472, rof: 65, warhead: 'ap', speed: 72, visual: 'cannon' },
    mammoth: { id: 'mammoth', damage: 95, range: 1728, rof: 80, warhead: 'ap', speed: 72, burst: 2, visual: 'cannon' },
    ifvmissile: { id: 'ifvmissile', damage: 28, range: 2048, rof: 40, warhead: 'missile', speed: 48, burst: 2, visual: 'missile' },
    flak: { id: 'flak', damage: 30, range: 1536, rof: 22, warhead: 'flak', speed: 0, splash: 96, visual: 'bullet' },
    prismbeam: { id: 'prismbeam', damage: 110, range: 1920, rof: 110, warhead: 'prism', speed: 0, splash: 112, visual: 'prism' },
    v3: { id: 'v3', damage: 240, range: 4608, minRange: 1280, rof: 300, warhead: 'he', speed: 24, splash: 192, visual: 'artillery' },
    minerminigun: { id: 'minerminigun', damage: 12, range: 1024, rof: 14, warhead: 'smallarms', speed: 0, visual: 'bullet' },
    pillbox: { id: 'pillbox', damage: 22, range: 1408, rof: 14, warhead: 'smallarms', speed: 0, visual: 'bullet' },
    prismtower: { id: 'prismtower', damage: 140, range: 2048, rof: 100, warhead: 'prism', speed: 0, splash: 96, visual: 'prism' },
    sentry: { id: 'sentry', damage: 22, range: 1408, rof: 14, warhead: 'smallarms', speed: 0, visual: 'bullet' },
    teslacoil: { id: 'teslacoil', damage: 200, range: 1920, rof: 95, warhead: 'electric', speed: 0, visual: 'tesla' },
  },
  units: {
    gi: { id: 'gi', name: 'G.I.', kind: 'infantry', cost: 200, hp: 125, armor: 'none', speed: 17, sight: 5, weapon: 'm60', prereqs: ['a-barracks'], factions: ['allies'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    conscript: { id: 'conscript', name: 'Conscript', kind: 'infantry', cost: 100, hp: 125, armor: 'none', speed: 17, sight: 4, weapon: 'carbine', prereqs: ['s-barracks'], factions: ['soviets'], tech: 1, crushable: true, shape: 'infantry', role: 'combat' },
    dog: { id: 'dog', name: 'Attack Dog', kind: 'infantry', cost: 200, hp: 100, armor: 'none', speed: 34, sight: 6, weapon: 'jaws', prereqs: ['a-barracks|s-barracks'], factions: both, tech: 1, crushable: true, shape: 'dog', role: 'scout' },
    teslatrooper: { id: 'teslatrooper', name: 'Tesla Trooper', kind: 'infantry', cost: 500, hp: 130, armor: 'none', speed: 14, sight: 5, weapon: 'teslabolt', prereqs: ['s-barracks', 's-radar'], factions: ['soviets'], tech: 4, shape: 'infantry-elite', role: 'combat' },
    tanya: { id: 'tanya', name: 'Tanya', kind: 'infantry', cost: 1000, hp: 150, armor: 'none', speed: 22, sight: 7, weapon: 'pistols', prereqs: ['a-barracks', 'a-lab'], factions: ['allies'], tech: 8, shape: 'infantry-elite', role: 'combat', regen: 3 },
    grizzly: { id: 'grizzly', name: 'Grizzly Battle Tank', kind: 'vehicle', cost: 700, hp: 300, armor: 'heavy', speed: 31, turn: 9, sight: 6, weapon: 'cannon105', prereqs: ['a-factory'], factions: ['allies'], tech: 2, crusher: true, shape: 'tank-turret', role: 'combat' },
    ifv: { id: 'ifv', name: 'IFV', kind: 'vehicle', cost: 600, hp: 200, armor: 'light', speed: 40, turn: 12, sight: 7, weapon: 'ifvmissile', prereqs: ['a-factory'], factions: ['allies'], tech: 3, crusher: true, shape: 'launcher', role: 'combat' },
    prismtank: { id: 'prismtank', name: 'Prism Tank', kind: 'vehicle', cost: 1200, hp: 150, armor: 'light', speed: 27, turn: 8, sight: 7, weapon: 'prismbeam', prereqs: ['a-factory', 'a-lab'], factions: ['allies'], tech: 7, shape: 'prism', role: 'siege' },
    rhino: { id: 'rhino', name: 'Rhino Heavy Tank', kind: 'vehicle', cost: 900, hp: 400, armor: 'heavy', speed: 22, turn: 7, sight: 5, weapon: 'cannon120', prereqs: ['s-factory'], factions: ['soviets'], tech: 2, crusher: true, shape: 'tank-turret', role: 'combat' },
    flaktrack: { id: 'flaktrack', name: 'Flak Track', kind: 'vehicle', cost: 500, hp: 180, armor: 'light', speed: 36, turn: 12, sight: 7, weapon: 'flak', prereqs: ['s-factory'], factions: ['soviets'], tech: 3, crusher: true, shape: 'quad', role: 'support' },
    v3: { id: 'v3', name: 'V3 Launcher', kind: 'vehicle', cost: 800, hp: 150, armor: 'light', speed: 22, turn: 7, sight: 5, weapon: 'v3', prereqs: ['s-factory', 's-radar'], factions: ['soviets'], tech: 5, shape: 'launcher', role: 'siege' },
    apocalypse: { id: 'apocalypse', name: 'Apocalypse Tank', kind: 'vehicle', cost: 1750, hp: 800, armor: 'heavy', speed: 18, turn: 5, sight: 6, weapon: 'mammoth', prereqs: ['s-factory', 's-lab'], factions: ['soviets'], tech: 8, crusher: true, shape: 'devastator', role: 'combat', regen: 4 },
    chronominer: { id: 'chronominer', name: 'Chrono Miner', kind: 'vehicle', cost: 1400, hp: 800, armor: 'heavy', speed: 27, turn: 7, sight: 4, prereqs: ['a-factory', 'a-refinery'], factions: ['allies'], tech: 2, crusher: true, shape: 'harvester', harvester: { capacity: 20, gather: 4, unload: 2, teleport: true } },
    warminer: { id: 'warminer', name: 'War Miner', kind: 'vehicle', cost: 1650, hp: 1000, armor: 'heavy', speed: 18, turn: 6, sight: 4, weapon: 'minerminigun', prereqs: ['s-factory', 's-refinery'], factions: ['soviets'], tech: 2, crusher: true, shape: 'harvester', harvester: { capacity: 40, gather: 3, unload: 2 } },
    mcv: { id: 'mcv', name: 'MCV', kind: 'vehicle', cost: 3000, hp: 1000, armor: 'heavy', speed: 18, turn: 4, sight: 4, prereqs: ['a-factory|s-factory'], factions: both, tech: 5, deploysTo: 'conyard', crusher: true, shape: 'mcv' },
  },
  structures: {
    conyard: { id: 'conyard', name: 'Construction Yard', cost: 3000, hp: 1500, armor: 'building', w: 4, h: 4, power: 0, sight: 6, prereqs: [], tech: 99, queue: 'structure', constructionYard: true, shape: 'conyard' },
    'a-power': { id: 'a-power', name: 'Power Plant', cost: 600, hp: 750, armor: 'building', w: 2, h: 2, power: 200, sight: 3, prereqs: [], factions: ['allies'], tech: 1, queue: 'structure', shape: 'windtrap' },
    's-power': { id: 's-power', name: 'Tesla Reactor', cost: 600, hp: 750, armor: 'building', w: 2, h: 2, power: 150, sight: 3, prereqs: [], factions: ['soviets'], tech: 1, queue: 'structure', shape: 'reactor' },
    'a-refinery': { id: 'a-refinery', name: 'Ore Refinery', cost: 2000, hp: 900, armor: 'building', w: 4, h: 3, power: -50, sight: 4, prereqs: ['a-power'], factions: ['allies'], tech: 1, queue: 'structure', refinery: { dockX: 4, dockY: 1, freeUnit: 'chronominer' }, shape: 'refinery' },
    's-refinery': { id: 's-refinery', name: 'Ore Refinery', cost: 2000, hp: 900, armor: 'building', w: 4, h: 3, power: -50, sight: 4, prereqs: ['s-power'], factions: ['soviets'], tech: 1, queue: 'structure', refinery: { dockX: 4, dockY: 1, freeUnit: 'warminer' }, shape: 'refinery' },
    'a-barracks': { id: 'a-barracks', name: 'Allied Barracks', cost: 500, hp: 500, armor: 'building', w: 2, h: 2, power: -10, sight: 4, prereqs: ['a-power'], factions: ['allies'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    's-barracks': { id: 's-barracks', name: 'Soviet Barracks', cost: 500, hp: 500, armor: 'building', w: 2, h: 2, power: -10, sight: 4, prereqs: ['s-power'], factions: ['soviets'], tech: 1, queue: 'structure', produces: 'infantry', shape: 'barracks' },
    'a-factory': { id: 'a-factory', name: 'Allied War Factory', cost: 2000, hp: 1000, armor: 'building', w: 3, h: 3, power: -25, sight: 4, prereqs: ['a-refinery', 'a-barracks'], factions: ['allies'], tech: 2, queue: 'structure', produces: 'vehicle', shape: 'heavyfactory' },
    's-factory': { id: 's-factory', name: 'Soviet War Factory', cost: 2000, hp: 1000, armor: 'building', w: 3, h: 3, power: -25, sight: 4, prereqs: ['s-refinery', 's-barracks'], factions: ['soviets'], tech: 2, queue: 'structure', produces: 'vehicle', shape: 'heavyfactory' },
    'a-radar': { id: 'a-radar', name: 'Airforce Command HQ', cost: 1000, hp: 1000, armor: 'building', w: 3, h: 2, power: -50, sight: 10, prereqs: ['a-refinery'], factions: ['allies'], tech: 3, queue: 'structure', radar: true, shape: 'radar' },
    's-radar': { id: 's-radar', name: 'Radar Tower', cost: 1000, hp: 1000, armor: 'building', w: 2, h: 2, power: -50, sight: 10, prereqs: ['s-refinery'], factions: ['soviets'], tech: 3, queue: 'structure', radar: true, shape: 'radar' },
    'a-lab': { id: 'a-lab', name: 'Allied Battle Lab', cost: 2000, hp: 500, armor: 'building', w: 3, h: 3, power: -100, sight: 4, prereqs: ['a-factory', 'a-radar'], factions: ['allies'], tech: 6, queue: 'structure', shape: 'lab' },
    's-lab': { id: 's-lab', name: 'Soviet Battle Lab', cost: 2000, hp: 500, armor: 'building', w: 3, h: 3, power: -100, sight: 4, prereqs: ['s-factory', 's-radar'], factions: ['soviets'], tech: 6, queue: 'structure', shape: 'lab' },
    'a-pillbox': { id: 'a-pillbox', name: 'Pillbox', cost: 500, hp: 400, armor: 'building', w: 1, h: 1, power: 0, sight: 6, prereqs: ['a-barracks'], factions: ['allies'], tech: 2, queue: 'defense', weapon: 'pillbox', shape: 'turret' },
    'a-prism': { id: 'a-prism', name: 'Prism Tower', cost: 1500, hp: 600, armor: 'building', w: 1, h: 1, power: -75, sight: 8, prereqs: ['a-radar'], factions: ['allies'], tech: 5, queue: 'defense', weapon: 'prismtower', needsPower: true, shape: 'prismtower' },
    's-sentry': { id: 's-sentry', name: 'Sentry Gun', cost: 500, hp: 400, armor: 'building', w: 1, h: 1, power: 0, sight: 6, prereqs: ['s-barracks'], factions: ['soviets'], tech: 2, queue: 'defense', weapon: 'sentry', shape: 'turret' },
    's-tesla': { id: 's-tesla', name: 'Tesla Coil', cost: 1500, hp: 600, armor: 'building', w: 1, h: 1, power: -75, sight: 8, prereqs: ['s-radar'], factions: ['soviets'], tech: 5, queue: 'defense', weapon: 'teslacoil', needsPower: true, shape: 'teslacoil' },
    's-nuke': { id: 's-nuke', name: 'Nuclear Missile Silo', cost: 5000, hp: 1000, armor: 'building', w: 3, h: 3, power: -200, sight: 4, prereqs: ['s-lab'], factions: ['soviets'], tech: 10, queue: 'defense', shape: 'missilesilo',
      superweapon: { id: 'nuke', name: 'Nuclear Missile', kind: 'missile', charge: 6300, damage: 2200, radius: 1280, delay: 110 } },
    'a-weather': { id: 'a-weather', name: 'Weather Control Device', cost: 5000, hp: 1000, armor: 'building', w: 3, h: 3, power: -200, sight: 4, prereqs: ['a-lab'], factions: ['allies'], tech: 10, queue: 'defense', shape: 'weather',
      superweapon: { id: 'storm', name: 'Lightning Storm', kind: 'storm', charge: 6300, damage: 260, radius: 1280, delay: 90, strikes: 26, duration: 225, boltRadius: 384 } },
    'a-wall': { id: 'a-wall', name: 'Allied Wall', cost: 100, hp: 300, armor: 'building', w: 1, h: 1, power: 0, sight: 0, prereqs: ['a-barracks'], factions: ['allies'], tech: 1, queue: 'defense', wall: true, shape: 'wall' },
    's-wall': { id: 's-wall', name: 'Soviet Wall', cost: 100, hp: 300, armor: 'building', w: 1, h: 1, power: 0, sight: 0, prereqs: ['s-barracks'], factions: ['soviets'], tech: 1, queue: 'defense', wall: true, shape: 'wall' },
  },
  factions: [
    { id: 'allies', name: 'Allies', side: 'allies', color: '#2f6fd0', accent: '#a6c8ff', blurb: 'Prism technology, Chrono Miners and the Grizzly.', startUnits: ['mcv', 'gi', 'gi', 'gi', 'grizzly'] },
    { id: 'soviets', name: 'Soviets', side: 'soviets', color: '#c2281f', accent: '#ffa497', blurb: 'Tesla power, Rhino armour and the Apocalypse.', startUnits: ['mcv', 'conscript', 'conscript', 'conscript', 'rhino'] },
  ],
  maps,
  startCredits: { low: 5000, standard: 10000, high: 20000 },
  buildTicksPer100: 55,
  lowPowerProductionPercent: 50,
  extraFactoryBonus: 25,
  buildRadius: 3,
  sellRefundPercent: 50,
  mechanics: {
    regrowth: { everyTicks: 150, amount: 1, spreadChance: 8 },
  },
};
