// Integrity of every rule pack: a pack is pure data, so every reference inside it must
// resolve or the game it describes cannot be played. Runs over the classics and the fusions.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STYLES } from '../../packages/contracts/src/index';
import { CLASSIC_PACKS, Game, PACKS, factionCanUse, prereqsMet, tdPack } from '../../packages/fusion/src/index';
import { buildingMesh, crateMesh, hasTurret, hullMesh, turretMesh } from '../../packages/fusion/src/art/models';
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

  for (const pack of CLASSIC_PACKS) {
    it(`${pack.id}: every side has a superweapon, an air facility and a priced upgrade path`, () => {
      // Dune 2000 and RA2 carry the upgrades their originals had (factory levels, none);
      // the 1995 packs add their own, so only the pricing rule is shared.
      for (const st of Object.values(pack.structures)) if (st.upgrades) expect(st.upgradeCost, `${st.id} upgrade is priced`).toBeGreaterThan(0);
      for (const faction of pack.factions) {
        const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
        const powers = Object.values(pack.structures).filter(mine)
          .flatMap(st => (st.superweapon ? [st.superweapon].flat() : []).filter(sw => factionCanUse(sw, faction.id, faction.side)));
        expect(powers.length, `${faction.id} has a superweapon`).toBeGreaterThan(0);
        for (const sw of powers) expect(sw.charge, `${sw.id} charges`).toBeGreaterThan(0);
        // Air is not one side's privilege: everyone can get something into the sky,
        // whether from an air facility or, like the Kirov, straight out of the factory.
        expect(Object.values(pack.units).some(u => mine(u) && u.kind === 'aircraft'), `${faction.id} can field aircraft`).toBe(true);
      }
    });

    it(`${pack.id}: every upgrade opens something new for the side that buys it`, () => {
      const defs = [...Object.values(pack.units), ...Object.values(pack.structures)];
      for (const faction of pack.factions) {
        const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
        for (const st of Object.values(pack.structures)) {
          if (!st.upgrades || !mine(st)) continue;
          for (let level = 1; level <= st.upgrades; level++) {
            const unlocked = defs.filter(d => mine(d) && d.prereqs.some(entry => entry.split('|').some(alt => alt === `${st.id}@${level}`)));
            expect(unlocked.length, `${faction.id}: ${st.id} upgrade ${level} unlocks something`).toBeGreaterThan(0);
          }
        }
      }
    });

    it(`${pack.id}: every side has building upgrades and more than one superweapon`, () => {
      for (const faction of pack.factions) {
        const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
        const powers = Object.values(pack.structures).filter(mine)
          .flatMap(st => (st.superweapon ? [st.superweapon].flat() : []).filter(sw => factionCanUse(sw, faction.id, faction.side)));
        expect(powers.length, `${faction.id} has more than one superweapon`).toBeGreaterThan(1);
        expect(Object.values(pack.structures).filter(st => st.upgrades && mine(st)).length, `${faction.id} has buildings to upgrade`).toBeGreaterThan(1);
      }
    });
  }

  it('lets a Construction Yard be upgraded although it is never built directly', () => {
    // Yards sit above every tech level so they cannot be queued; their upgrade still must be.
    for (const pack of CLASSIC_PACKS) {
      const yard = Object.values(pack.structures).find(st => st.constructionYard)!;
      if (!yard.upgrades) continue;
      const game = new Game({ pack, mapId: pack.maps[0].id, seed: 2, techLevel: 15, players: [{ name: 'A', faction: pack.factions[0].id, ai: false }, { name: 'B', faction: pack.factions[1].id, ai: true }] });
      const p = game.players[0];
      game.spawnStructure(yard.id, 0, 6, 6);
      expect(game.buildOptions(p, 'structure'), `${pack.id} offers the yard upgrade`).toContain(`upgrade:${yard.id}`);
    }
  });

  describe('superweapons are balanced by class', () => {
    interface Power { pack: string; id: string; kind: string; charge: number; punch: number; value: number }
    const powers: Power[] = [];
    for (const pack of CLASSIC_PACKS) {
      const cost = (type: string) => pack.units[type]?.cost ?? 0;
      for (const st of Object.values(pack.structures)) {
        for (const sw of st.superweapon ? [st.superweapon].flat() : []) {
          powers.push({
            pack: pack.id, id: sw.id, kind: sw.kind, charge: sw.charge,
            // What the strike delivers: damage, spread over however many strikes, across its area.
            punch: sw.damage * (sw.strikes ?? 1) * Math.max(1, sw.radius),
            value: (sw.units ?? []).reduce((n, u) => n + cost(u), 0),
          });
        }
      }
    }
    const spread = (ns: number[]) => Math.max(...ns) / Math.max(1, Math.min(...ns));

    for (const kind of ['missile', 'ion', 'storm']) {
      it(`${kind}: every pack's version lands about the same blow, for about the same wait`, () => {
        const of = powers.filter(p => p.kind === kind);
        expect(of.length, `${kind} exists`).toBeGreaterThan(0);
        expect(spread(of.map(p => p.punch)), `${kind} damage across its area: ${of.map(p => `${p.pack}/${p.id}=${p.punch}`).join(' ')}`).toBeLessThanOrEqual(1.5);
        expect(spread(of.map(p => p.charge)), `${kind} charge time`).toBeLessThanOrEqual(1.5);
      });
    }

    for (const kind of ['reinforce', 'paradrop']) {
      it(`${kind}: every pack delivers a squad of about the same worth`, () => {
        const of = powers.filter(p => p.kind === kind);
        expect(of.length, `${kind} exists`).toBeGreaterThan(0);
        expect(spread(of.map(p => p.value)), `${kind} credits delivered: ${of.map(p => `${p.pack}/${p.id}=${p.value}`).join(' ')}`).toBeLessThanOrEqual(1.8);
      });
    }
  });

  it('builds twice as fast with a second factory', () => {
    for (const pack of CLASSIC_PACKS) {
      expect(pack.extraFactoryBonus, `${pack.id} doubles on a second factory`).toBe(100);
    }
  });

  it('has a model for every crate kind', () => {
    for (const kind of ['money', 'heal', 'veteran', 'reveal', 'unit']) {
      expect(crateMesh(kind).faces.length, `${kind} crate`).toBeGreaterThan(0);
    }
  });

  it('has a model for every shape any pack names', () => {
    // The meshes are pure geometry, so a typo or a broken shape shows up here rather than
    // as an empty square in the sidebar.
    for (const pack of CLASSIC_PACKS) {
      for (const style of ['dune', 'allied', 'soviet', 'gdi', 'nod'] as const) {
        for (const u of Object.values(pack.units)) {
          if (u.kind === 'infantry') continue; // Infantry are drawn by the renderer, not modelled.
          expect(hullMesh(u.shape, style, [200, 200, 200]).faces.length, `${pack.id}/${u.id} (${u.shape}) has a hull`).toBeGreaterThan(0);
          if (hasTurret(u.shape)) expect(turretMesh(u.shape, style, [200, 200, 200]).faces.length, `${u.shape} turret`).toBeGreaterThan(0);
        }
        for (const st of Object.values(pack.structures)) {
          expect(buildingMesh(st.shape, st.w, st.h, style, [200, 200, 200]).faces.length, `${pack.id}/${st.id} (${st.shape}) has a model`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every airstrip flies bombers, and every silo holds a proper reserve', () => {
    for (const pack of CLASSIC_PACKS) {
      const strips = Object.values(pack.structures).filter(st => st.shape === 'airstrip');
      for (const strip of strips) {
        // The strip itself, or the flight it unlocks, puts a bomber in the air.
        const fliers = Object.values(pack.units).filter(u => u.kind === 'aircraft' && pack.weapons[u.weapon ?? '']?.visual === 'bomb');
        const theirs = fliers.filter(u => !strip.factions || !u.factions || u.factions.some(f => strip.factions!.includes(f)));
        expect(theirs.length, `${pack.id}/${strip.id} has a bomber`).toBeGreaterThan(0);
      }
      for (const st of Object.values(pack.structures)) {
        if (!st.storage || st.refinery) continue;
        expect(st.storage, `${pack.id}/${st.id} silo capacity`).toBeGreaterThanOrEqual(6000);
      }
      // Every pack has somewhere to put the overflow.
      expect(Object.values(pack.structures).some(st => st.storage && !st.refinery), `${pack.id} has a silo`).toBe(true);
    }
  });

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

  it('gives each side its own powers and upgrade path', () => {
    const power = (id: string) => [tdPack.structures[id].superweapon].flat()[0]!;
    // GDI: orbital fire, then airborne armour and a satellite sweep.
    expect(power('eye').kind).toBe('ion');
    expect(power('drop').kind).toBe('reinforce');
    expect(power('drop').units).toContain('mediumtank');
    expect(power('uplink').kind).toBe('reveal');
    for (const id of ['eye', 'drop', 'uplink']) expect(tdPack.structures[id].factions).toEqual(['gdi']);
    // Nod: the nuclear strike, then chemicals and a stealth field over the base.
    expect(power('tmpl').kind).toBe('missile');
    expect(power('chem').kind).toBe('missile');
    expect(power('chem').radius).toBeGreaterThan(power('tmpl').radius);
    expect(power('chem').damage).toBeLessThan(power('tmpl').damage);
    expect(tdPack.structures.stlth.gap).toBeGreaterThan(0);
    for (const id of ['tmpl', 'chem', 'stlth']) expect(tdPack.structures[id].factions).toEqual(['nod']);
    // The late tree hangs off upgraded buildings.
    expect(tdPack.units.mammoth.prereqs).toContain('weap@1');
    expect(tdPack.units.stealthtank.prereqs).toContain('afld@1');
    expect(tdPack.structures.atwr.prereqs).toContain('fact@1');
    expect(tdPack.structures.obli.prereqs).toContain('fact@1');
  });

  it('lets GDI buy an upgrade and then build what it unlocks', () => {
    const game = new Game({ pack: tdPack, mapId: 'tiberium-crossing', seed: 7, techLevel: 15, players: [{ name: 'A', faction: 'gdi', ai: false }, { name: 'B', faction: 'nod', ai: true }] });
    const p = game.players[0];
    for (const [id, x, y] of [['fact', 6, 6], ['nuke', 11, 6], ['nuke', 11, 9], ['proc', 6, 11], ['pyle', 11, 12], ['weap', 15, 6], ['hq', 15, 11]] as [string, number, number][]) game.spawnStructure(id, 0, x, y);
    expect(game.canBuild(p, 'mammoth')).toBe(false);
    expect(game.buildOptions(p, 'defense')).not.toContain('atwr');
    p.credits = 20000;
    game.enqueue(0, { t: 'build', item: 'upgrade:weap' });
    for (let i = 0; i < 1800 && p.upgrades.weap !== 1; i++) game.step();
    expect(p.upgrades.weap).toBe(1);
    game.enqueue(0, { t: 'build', item: 'upgrade:fact' });
    for (let i = 0; i < 1800 && p.upgrades.fact !== 1; i++) game.step();
    expect(p.upgrades.fact).toBe(1);
    expect(game.buildOptions(p, 'defense')).toContain('atwr');
    // The Mammoth still waits on the Advanced Communications Center.
    expect(game.canBuild(p, 'mammoth')).toBe(false);
    game.spawnStructure('eye', 0, 20, 6);
    expect(game.canBuild(p, 'mammoth')).toBe(true);
    expect(game.buildOptions(p, 'structure')).toContain('drop');
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

describe('Dune pack', () => {
  const dune = PACKS.dune;

  it('gives each house a tier past the Palace, in its own voice', () => {
    const power = (id: string) => [dune.structures[id].superweapon].flat()[0]!;
    expect(dune.structures.palace.upgrades).toBe(1);
    // Atreides sonics, Harkonnen armour, Ordos eyes everywhere and a scrambled field.
    expect(power('sonicarray').kind).toBe('storm');
    expect(dune.structures.sonicarray.factions).toEqual(['atreides']);
    expect(power('droppad').kind).toBe('reinforce');
    expect(power('droppad').units).toEqual(['devastator', 'devastator']);
    expect(dune.structures.droppad.factions).toEqual(['harkonnen']);
    expect(power('choam').kind).toBe('reveal');
    expect(dune.structures.scrambler.gap).toBeGreaterThan(0);
    for (const id of ['choam', 'scrambler']) expect(dune.structures[id].factions).toEqual(['ordos']);
    for (const id of ['sonicarray', 'droppad', 'choam']) expect(dune.structures[id].prereqs).toContain('palace@1');
  });
});

describe('Red Alert 2 pack', () => {
  const ra2 = PACKS.ra2;

  it('adds upgrades the original never had, and one power beyond each side', () => {
    const power = (id: string) => [ra2.structures[id].superweapon].flat()[0]!;
    for (const id of ['conyard', 'a-factory', 'a-lab', 's-factory', 's-lab']) expect(ra2.structures[id].upgrades, `${id} upgrades`).toBe(1);
    expect(power('a-prismarray').kind).toBe('ion');
    expect(ra2.structures['a-prismarray'].factions).toEqual(['allies']);
    expect(power('s-airlift').kind).toBe('reinforce');
    expect(power('s-airlift').units).toEqual(['apocalypse', 'rhino']);
    expect(ra2.structures['s-airlift'].factions).toEqual(['soviets']);
    // The improved yard carries the advanced defences; the labs carry what ends a game.
    expect(ra2.structures['a-prism'].prereqs).toContain('conyard@1');
    expect(ra2.structures['s-tesla'].prereqs).toContain('conyard@1');
    for (const id of ['a-chrono', 'a-weather', 'a-prismarray']) expect(ra2.structures[id].prereqs).toContain('a-lab@1');
    for (const id of ['s-curtain', 's-nuke', 's-airlift']) expect(ra2.structures[id].prereqs).toContain('s-lab@1');
    expect(ra2.units.apocalypse.prereqs).toContain('s-factory@1');
    expect(ra2.units.prismtank.prereqs).toContain('a-factory@1');
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

  it('gives the Allies their own air base and late powers, not just the Soviets', () => {
    const power = (id: string) => [ra1Pack.structures[id].superweapon].flat()[0]!;
    expect(ra1Pack.structures.abase.factions).toEqual(['allies']);
    expect(ra1Pack.structures.abase.produces).toBe('aircraft');
    expect(power('abase').kind).toBe('paradrop');
    expect(power('gps').kind).toBe('reveal');
    expect(power('wthr').kind).toBe('storm');
    expect(power('tstorm').kind).toBe('storm');
    expect(ra1Pack.structures.tstorm.factions).toEqual(['soviet']);
    // Allied helicopters fly from either air facility.
    expect(ra1Pack.units.longbow.prereqs).toContain('hpad|abase');
    // Both top tiers hang off the upgraded tech centre.
    for (const id of ['pdox', 'gps', 'wthr']) expect(ra1Pack.structures[id].prereqs).toContain('atek@1');
    for (const id of ['iron', 'mslo', 'tstorm']) expect(ra1Pack.structures[id].prereqs).toContain('stek@1');
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
