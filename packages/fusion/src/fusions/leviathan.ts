// Fusion: Leviathan Isles — the first community-designed fusion.
//
// Red Alert 2's countries, teams, land, sea and air forces and superweapons fight over a huge
// archipelago. Each home island holds too little ore to win on; the real wealth is a vast
// deposit on the central island. Dune's sandworms hunt the open sea and the sands around every
// resource field, so every harvester run and every naval push is a gamble.
import { MapFeature, MapField, MapPreset, RulePack } from '../rules';
import { quad } from '../packs/mapkit';
import { ra2Pack } from '../packs/ra2';

const S = 128;

const leviathanIsles: MapPreset = {
  id: 'leviathan-isles', name: 'Leviathan Isles', width: S, height: S, maxPlayers: 4, base: 'water', roughness: 2,
  description: 'Four home islands with thin ore, a great central island of riches, and sandworms in the sea and on the sands.',
  starts: [{ x: 20, y: 20 }, { x: 107, y: 107 }, { x: 107, y: 20 }, { x: 20, y: 107 }],
  features: [
    // Home islands: a sandy shore around firm ground for the base.
    ...quad<MapFeature>([
      { terrain: 'sand', shape: 'circle', x: 21, y: 21, r: 17 },
      { terrain: 'clear', shape: 'circle', x: 21, y: 21, r: 13 },
      { terrain: 'trees', shape: 'circle', x: 9, y: 30, r: 2 },
      { terrain: 'trees', shape: 'circle', x: 31, y: 9, r: 2 },
      { terrain: 'rough', shape: 'circle', x: 12, y: 12, r: 2 },
      // Sandy spits reaching toward the centre: the home ore sits here, in worm country.
      { terrain: 'sand', shape: 'circle', x: 35, y: 33, r: 6 },
      { terrain: 'sand', shape: 'circle', x: 33, y: 38, r: 3 },
      // Rocky stepping-stone islets between neighbours.
      { terrain: 'clear', shape: 'circle', x: 64, y: 20, r: 4 },
      { terrain: 'sand', shape: 'circle', x: 46, y: 46, r: 3 },
    ], S, S),
    // The great central island: mostly open sand (worms roam it), a little firm ground and cliffs.
    { terrain: 'sand', shape: 'circle', x: 64, y: 64, r: 27 },
    ...quad<MapFeature>([
      { terrain: 'clear', shape: 'circle', x: 52, y: 52, r: 5 },
      { terrain: 'cliff', shape: 'ridge', x: 50, y: 60, x2: 55, y2: 56, r: 1 },
      { terrain: 'rough', shape: 'circle', x: 58, y: 46, r: 2 },
    ], S, S),
  ],
  fields: [
    // Home ore: deliberately not enough.
    ...quad<MapField>([
      { x: 35, y: 33, r: 3, resource: 'ore', amount: 9 },
      { x: 13, y: 26, r: 1, resource: 'gems', amount: 6 },
    ], S, S),
    // The prize.
    { x: 64, y: 64, r: 13, resource: 'ore' },
    { x: 64, y: 64, r: 6, resource: 'gems' },
    ...quad<MapField>([{ x: 56, y: 64, r: 3, resource: 'gems' }], S, S),
  ],
};

export const leviathanPack: RulePack = {
  ...ra2Pack,
  id: 'leviathan',
  name: 'Leviathan Isles',
  fidelityNote: 'Fusion: Red Alert 2 forces on a worm-infested archipelago (Dune sandworms in the sea and on the sands). A community fusion on the Comrade Fusion Engine.',
  maps: [leviathanIsles],
  mechanics: {
    ...ra2Pack.mechanics,
    sandworm: { count: 6, speed: 22, sight: 12, damage: 450, appearAfter: 15 * 120, eatChance: 45, habitat: ['water', 'sand'], nearResources: 9 },
  },
};
