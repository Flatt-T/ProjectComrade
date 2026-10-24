// Integrity of every rule pack: a pack is pure data, so every reference inside it must
// resolve or the game it describes cannot be played. Runs over the classics and the fusions.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STYLES } from '../../packages/contracts/src/index';
import { CLASSIC_PACKS, Game, PACKS, factionCanUse, prereqsMet, tdPack } from '../../packages/fusion/src/index';
import type { RulePack } from '../../packages/fusion/src/index';

const packs = Object.values(PACKS);

describe('rule pack integrity', () => {
  for (const pack of packs) {
    describe(pack.id, () => {
      const armors = new Set(pack.armors);
      const terrains = new Set(pack.terrains.map(t => t.id));
      const resources = new Set(pack.resources.map(r => r.id));

      it('resolves every weapon, warhead and armour reference', () => {
        for (const [id, w] of Object.entries(pack.weapons)) {
          expect(w.id, `weapon key ${id}`).toBe(id);
          expect(pack.warheads[w.warhead], `${id} warhead ${w.warhead}`).toBeTruthy();
        }
        for (const [id, wh] of Object.entries(pack.warheads)) {
          expect(wh.id, `warhead key ${id}`).toBe(id);
          for (const armor of Object.keys(wh.vs)) expect(armors.has(armor), `${id} vs ${armor}`).toBe(true);
        }
        for (const u of Object.values(pack.units)) {
          expect(armors.has(u.armor), `${u.id} armour ${u.armor}`).toBe(true);
          for (const key of [u.weapon, u.deployWeapon, u.deathWeapon]) if (key) expect(pack.weapons[key], `${u.id} weapon ${key}`).toBeTruthy();
        }
        for (const s of Object.values(pack.structures)) {
          expect(armors.has(s.armor), `${s.id} armour ${s.armor}`).toBe(true);
          for (const key of [s.weapon, s.deathWeapon]) if (key) expect(pack.weapons[key], `${s.id} weapon ${key}`).toBeTruthy();
        }
      });

      it('resolves every prerequisite, deployment and delivered unit', () => {
        const all = [...Object.values(pack.units), ...Object.values(pack.structures)];
        for (const def of all) {
          expect(def.id, 'id matches its key').toBeTruthy();
          for (const entry of def.prereqs) for (const alt of entry.split('|')) {
            const [id] = alt.split('@');
            expect(pack.structures[id], `${def.id} needs structure ${id}`).toBeTruthy();
          }
        }
        for (const u of Object.values(pack.units)) {
          if (u.deploysTo) expect(pack.structures[u.deploysTo], `${u.id} deploys to ${u.deploysTo}`).toBeTruthy();
        }
        for (const s of Object.values(pack.structures)) {
          if (s.refinery?.freeUnit) expect(pack.units[s.refinery.freeUnit], `${s.id} free unit`).toBeTruthy();
          for (const sw of s.superweapon ? [s.superweapon].flat() : []) {
            for (const type of sw.units ?? []) expect(pack.units[type], `${sw.id} delivers ${type}`).toBeTruthy();
            if (sw.kind === 'paradrop' || sw.kind === 'reinforce') expect(sw.units?.length, `${sw.id} delivers something`).toBeGreaterThan(0);
          }
        }
      });

      it('can build every unit and structure from a faction start', () => {
        for (const faction of pack.factions) {
          for (const type of faction.startUnits) {
            expect(pack.units[type], `${faction.id} starts with ${type}`).toBeTruthy();
            expect(factionCanUse(pack.units[type], faction.id, faction.side), `${faction.id} may use ${type}`).toBe(true);
          }
          // Every buildable thing this faction can field has a producer it can also build.
          const owned = new Map(Object.values(pack.structures).filter(s => factionCanUse(s, faction.id, faction.side)).map(s => [s.id, s.upgrades ?? 0]));
          for (const u of Object.values(pack.units)) {
            if (!factionCanUse(u, faction.id, faction.side) || u.tech > 10) continue;
            expect(prereqsMet(u.prereqs, owned), `${faction.id} can reach ${u.id}`).toBe(true);
            const queue = u.queue ?? u.kind;
            const producer = [...owned.keys()].some(id => pack.structures[id].produces === queue);
            expect(producer, `${faction.id} has a ${queue} producer for ${u.id}`).toBe(true);
          }
          for (const s of Object.values(pack.structures)) {
            if (!factionCanUse(s, faction.id, faction.side) || s.tech > 10) continue;
            expect(prereqsMet(s.prereqs, owned), `${faction.id} can reach ${s.id}`).toBe(true);
          }
        }
      });

      it('builds every map from terrain and resources it defines', () => {
        for (const preset of pack.maps) {
          expect(terrains.has(preset.base), `${preset.id} base ${preset.base}`).toBe(true);
          for (const f of preset.features) expect(terrains.has(f.terrain), `${preset.id} feature ${f.terrain}`).toBe(true);
          for (const f of preset.fields) expect(resources.has(f.resource), `${preset.id} field ${f.resource}`).toBe(true);
          expect(preset.starts.length, `${preset.id} seats its players`).toBe(preset.maxPlayers);
          for (const s of preset.starts) {
            expect(s.x).toBeGreaterThanOrEqual(0);
            expect(s.y).toBeGreaterThanOrEqual(0);
            expect(s.x).toBeLessThan(preset.width);
            expect(s.y).toBeLessThan(preset.height);
          }
        }
      });

      it('has a lobby style that offers only factions it defines', () => {
        const style = STYLES.find(s => s.pack === pack.id);
        expect(style, `${pack.id} is offered in the lobby`).toBeTruthy();
        expect(style!.engine).toBe('fusion');
        for (const f of style!.factions) expect(pack.factions.some(x => x.id === f.id), `${f.id} exists in the pack`).toBe(true);
      });
    });
  }

  it('registers the four classics and the fusions', () => {
    expect(CLASSIC_PACKS.map(p => p.id)).toEqual(['td', 'dune', 'ra1', 'ra2']);
    expect(Object.keys(PACKS)).toEqual(expect.arrayContaining(['td', 'dune', 'ra1', 'ra2', 'leviathan']));
  });
});

describe('Tiberian Dawn pack', () => {
  const scenarios: { id: string; name: string }[] = JSON.parse(readFileSync('packs/td/comrade/maps.json', 'utf8'));

  it('offers the same battlefields as the original-engine slice, at the same size', () => {
    for (const s of scenarios) {
      const preset = tdPack.maps.find(m => m.id === s.id);
      expect(preset, `${s.id} exists on the Fusion Engine`).toBeTruthy();
      expect(preset!.name).toBe(s.name);
      // The authored scenarios are 60x60 inside the engine's 64-cell grid.
      expect([preset!.width, preset!.height]).toEqual([60, 60]);
    }
  });

  it('gives GDI and Nod their own armies with a shared core', () => {
    const only = (side: string) => Object.values(tdPack.units).filter(u => u.factions?.length === 1 && u.factions[0] === side).map(u => u.id);
    expect(only('gdi')).toContain('mammoth');
    expect(only('gdi')).toContain('orca');
    expect(only('nod')).toContain('stealthtank');
    expect(only('nod')).toContain('flametank');
    // Minigunners, engineers and harvesters are built by both.
    for (const shared of ['minigunner', 'engineer', 'harvester', 'mcv']) expect(tdPack.units[shared].factions).toBeUndefined();
  });

  it('spreads Tiberium and pays for it', () => {
    const tiberium = tdPack.resources[0];
    expect(tiberium.regrows).toBe(true);
    expect(tdPack.mechanics.regrowth).toBeTruthy();
    const game = new Game({ pack: tdPack, mapId: 'tiberium-crossing', seed: 9, players: [{ name: 'A', faction: 'gdi', ai: true }, { name: 'B', faction: 'nod', ai: true }] });
    const before = game.map.resKind.reduce((n, k) => n + (k ? 1 : 0), 0);
    for (let i = 0; i < 15 * 60 * 6; i++) game.step();
    const after = game.map.resKind.reduce((n, k) => n + (k ? 1 : 0), 0);
    expect(after).toBeGreaterThan(before);
    for (const p of game.players) expect(p.stats.harvested).toBeGreaterThan(0);
  });

  it('charges the Ion Cannon only from a powered Advanced Communications Center', () => {
    const game = new Game({ pack: tdPack, mapId: 'tiberium-crossing', seed: 3, players: [{ name: 'A', faction: 'gdi', ai: false }, { name: 'B', faction: 'nod', ai: true }] });
    const eye = game.spawnStructure('eye', 0, 20, 20);
    expect(eye).toBeTruthy();
    for (let i = 0; i < 60; i++) game.step();
    // No power plant yet: an unpowered uplink never charges.
    expect(eye!.charge).toBe(0);
    game.spawnStructure('nuke', 0, 24, 20);
    game.spawnStructure('nuke', 0, 24, 23);
    game.spawnStructure('nuke', 0, 24, 26);
    for (let i = 0; i < 120; i++) game.step();
    expect(eye!.charge).toBeGreaterThan(0);
  });
});

describe('Red Alert pack', () => {
  const ra1Pack = PACKS.ra1 as RulePack;

  it('splits the Chronosphere and the Iron Curtain between the sides', () => {
    const sw = (id: string) => [PACKS.ra1.structures[id].superweapon].flat()[0];
    expect(PACKS.ra1.structures.pdox.factions).toEqual(['allies']);
    expect(sw('pdox')!.kind).toBe('chrono');
    expect(PACKS.ra1.structures.iron.factions).toEqual(['soviet']);
    expect(sw('iron')!.kind).toBe('curtain');
    expect(sw('mslo')!.kind).toBe('missile');
  });

  it('fields a navy that needs water, and a map that has some', () => {
    const yards = Object.values(ra1Pack.structures).filter(s => s.produces === 'naval');
    expect(yards.length).toBeGreaterThan(0);
    for (const y of yards) expect(y.onWater).toBe(true);
    const game = new Game({ pack: ra1Pack, mapId: 'ra1-north-sea', seed: 4, players: [{ name: 'A', faction: 'allies', ai: true }, { name: 'B', faction: 'soviet', ai: true }] });
    const water = game.map.terrain.filter(t => ra1Pack.terrains[t].water).length;
    expect(water / game.map.terrain.length).toBeGreaterThan(0.05);
  });

  it('runs two sides to a working economy on every battlefield', () => {
    for (const preset of ra1Pack.maps) {
      const players = preset.starts.map((_, i) => ({ name: `P${i}`, faction: i % 2 ? 'soviet' : 'allies', ai: true }));
      const game = new Game({ pack: ra1Pack, mapId: preset.id, seed: 6, players });
      for (let i = 0; i < 15 * 60 * 3; i++) game.step();
      for (const p of game.players) expect(p.stats.harvested, `${preset.id} slot ${p.slot} harvests`).toBeGreaterThan(0);
    }
  });
});
