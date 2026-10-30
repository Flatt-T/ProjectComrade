// Custom Mashup: the Gold game type where each commander picks the battlefield's world and
// then whose buildings, soldiers, vehicles, aircraft and ships they field. The composed pack
// has to be as playable as a hand-authored one — every reference resolved, every chosen unit
// reachable from the chosen base — and identical on every client, or lockstep desyncs.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, MASHUP_ARMORS, MASHUP_PACKS, MASHUP_SLOTS, PACKS, composeMashup, factionCanUse,
  mashupCatalogue, mashupLoadoutProblem, mashupMap, prereqsMet, spreadWarhead, wholePackLoadout,
  type MashupLoadout, type RulePack,
} from '../../packages/fusion/src/index';
import { parseLoadout, STYLES, MASHUP_STYLE, plan, styleAllowed } from '../../packages/contracts/src/index';

const catalogue = mashupCatalogue();
const choice = (slot: (typeof MASHUP_SLOTS)[number], packId: string, factionId?: string) => {
  const found = catalogue.choices[slot].find(c => c.packId === packId && (!factionId || c.factionIds.includes(factionId)));
  expect(found, `${slot} set for ${packId}${factionId ? `:${factionId}` : ''}`).toBeTruthy();
  return found!.key;
};

/** The mashup from the feature's own example: Dune ground, Nod boots, Star Wars armour, Russian air. */
const example: MashupLoadout = {
  structures: choice('structures', 'ra2', 'russia'),
  infantry: choice('infantry', 'td', 'nod'),
  vehicle: choice('vehicle', 'conquer', 'empire'),
  aircraft: choice('aircraft', 'ra2', 'russia'),
  naval: choice('naval', 'ra1', 'allies'),
};
const classic = (packId: string, factionId?: string) => wholePackLoadout(packId, factionId);

function integrity(pack: RulePack) {
  const armors = new Set(pack.armors);
  for (const [id, w] of Object.entries(pack.weapons)) {
    expect(w.id, `weapon key ${id}`).toBe(id);
    expect(pack.warheads[w.warhead], `${id} warhead`).toBeTruthy();
  }
  for (const [id, wh] of Object.entries(pack.warheads)) {
    expect(wh.id, `warhead key ${id}`).toBe(id);
    // Every armour class is answered for, so no shell ever lands on an undefined hull.
    for (const armor of pack.armors) expect(wh.vs[armor], `${id} vs ${armor}`).toBeTypeOf('number');
  }
  const all = [...Object.values(pack.units), ...Object.values(pack.structures)];
  for (const def of all) {
    expect(armors.has(def.armor), `${def.id} armour ${def.armor}`).toBe(true);
    for (const entry of def.prereqs) for (const alt of entry.split('|')) {
      const [id] = alt.split('@');
      expect(pack.structures[id], `${def.id} needs ${id}`).toBeTruthy();
    }
    // Ids travel inside lockstep commands, which cap them at 32 characters of [a-z0-9-].
    expect(def.id, `${def.id} is a legal item id`).toMatch(/^[a-z0-9-]{1,32}$/);
  }
  for (const u of Object.values(pack.units)) {
    for (const key of [u.weapon, u.altWeapon, u.deployWeapon, u.deathWeapon]) if (key) expect(pack.weapons[key], `${u.id} weapon ${key}`).toBeTruthy();
    if (u.deploysTo) expect(pack.structures[u.deploysTo], `${u.id} deploys to ${u.deploysTo}`).toBeTruthy();
  }
  for (const s of Object.values(pack.structures)) {
    for (const key of [s.weapon, s.deathWeapon]) if (key) expect(pack.weapons[key], `${s.id} weapon ${key}`).toBeTruthy();
    if (s.refinery?.freeUnit) expect(pack.units[s.refinery.freeUnit], `${s.id} free unit`).toBeTruthy();
    for (const sw of s.superweapon ? [s.superweapon].flat() : []) {
      for (const type of sw.units ?? []) expect(pack.units[type], `${sw.id} delivers ${type}`).toBeTruthy();
      if (sw.kind === 'paradrop' || sw.kind === 'reinforce') expect(sw.units?.length, `${sw.id} delivers something`).toBeGreaterThan(0);
    }
  }
  for (const faction of pack.factions) {
    for (const type of faction.startUnits) {
      expect(pack.units[type], `${faction.id} starts with ${type}`).toBeTruthy();
      expect(factionCanUse(pack.units[type], faction.id, faction.side), `${faction.id} may field ${type}`).toBe(true);
    }
  }
}

/** Everything this commander chose can be reached from the base they chose. */
function reachable(pack: RulePack, factionId: string) {
  const faction = pack.factions.find(f => f.id === factionId)!;
  const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
  const owned = new Map(Object.values(pack.structures).filter(mine).map(s => [s.id, s.upgrades ?? 0]));
  expect([...owned.keys()].some(id => pack.structures[id].constructionYard), `${factionId} has a construction yard`).toBe(true);
  expect([...owned.keys()].some(id => pack.structures[id].refinery), `${factionId} has a refinery`).toBe(true);
  for (const u of Object.values(pack.units).filter(mine)) {
    if (u.tech > 10) continue;
    expect(prereqsMet(u.prereqs, owned), `${factionId} can reach ${u.id}`).toBe(true);
    const queue = u.queue ?? u.kind;
    expect([...owned.keys()].some(id => pack.structures[id].produces === queue), `${factionId} has a ${queue} producer for ${u.id}`).toBe(true);
  }
  for (const s of Object.values(pack.structures).filter(mine)) {
    if (s.tech > 10) continue;
    expect(prereqsMet(s.prereqs, owned), `${factionId} can reach ${s.id}`).toBe(true);
  }
}

describe('mashup catalogue', () => {
  it('derives its choices from the registered packs, with no mashup-specific authoring', () => {
    for (const pack of MASHUP_PACKS) {
      expect(PACKS[pack.id], `${pack.id} is a registered pack`).toBe(pack);
      for (const preset of pack.maps) {
        expect(catalogue.maps.find(m => m.mapId === preset.id && m.packId === pack.id), preset.id).toBeTruthy();
      }
    }
    // Buildings and every kind of force are all on offer, and each classic contributes.
    for (const slot of MASHUP_SLOTS) expect(catalogue.choices[slot].length, slot).toBeGreaterThan(0);
    for (const pack of CLASSIC_PACKS) {
      expect(catalogue.choices.structures.some(c => c.packId === pack.id), `${pack.id} buildings`).toBe(true);
      expect(catalogue.choices.infantry.some(c => c.packId === pack.id), `${pack.id} soldiers`).toBe(true);
    }
    // Dune has no navy, so it offers no sea set rather than an empty one.
    expect(catalogue.choices.naval.some(c => c.packId === 'dune')).toBe(false);
    // Nod and Russia are selectable by name, which is how the sets are meant to be picked.
    expect(catalogue.choices.infantry.some(c => c.packId === 'td' && c.factionIds.includes('nod'))).toBe(true);
    expect(catalogue.choices.aircraft.some(c => c.packId === 'ra2' && c.factionIds.includes('russia'))).toBe(true);
    // A fusion that reuses a classic's roster adds its battlefields, not a second copy of the units.
    expect(catalogue.choices.vehicle.some(c => c.packId === 'leviathan')).toBe(false);
    expect(catalogue.maps.some(m => m.packId === 'leviathan')).toBe(true);
    // Every option key resolves, and every battlefield can be found again by its id alone.
    for (const slot of MASHUP_SLOTS) for (const c of catalogue.choices[slot]) expect(c.count).toBeGreaterThan(0);
    const ids = catalogue.maps.map(m => m.mapId);
    expect(new Set(ids).size, 'battlefield ids are unique across packs').toBe(ids.length);
    for (const m of catalogue.maps) expect(mashupMap(m.mapId).pack.id).toBe(m.packId);
  });

  it('knows which battlefields have water, so a sea choice can be warned about', () => {
    expect(catalogue.maps.find(m => m.mapId === 'leviathan-isles')!.water).toBe(true);
    expect(catalogue.maps.find(m => m.mapId === 'arrakis-basin')!.water).toBe(false);
  });

  it('refuses a loadout with no buildings or nothing to fight with', () => {
    expect(mashupLoadoutProblem(example)).toBeNull();
    expect(mashupLoadoutProblem({ structures: '' })).toBeTruthy();
    expect(mashupLoadoutProblem({ structures: choice('structures', 'ra1', 'allies') })).toBeTruthy();
    expect(mashupLoadoutProblem({ structures: 'nope:nope', infantry: example.infantry })).toBeTruthy();
    expect(mashupLoadoutProblem(undefined)).toBeTruthy();
  });

  it('fills in the armour classes a borrowed warhead never heard of', () => {
    // Dune knows 'medium' but not 'wood'; Red Alert the other way round.
    const shell = spreadWarhead({ id: 'shell', vs: { none: 40, light: 70, medium: 100, heavy: 90, building: 80 } });
    expect(shell.vs.wood).toBe(55);
    const ap = spreadWarhead({ id: 'ap', vs: { none: 25, wood: 75, light: 100, heavy: 100, building: 50 } });
    expect(ap.vs.medium).toBe(100);
    // A heavy hull is never left at full damage just because the warhead came from elsewhere.
    const teeth = spreadWarhead({ id: 'teeth', vs: { none: 100, wood: 0, light: 0, heavy: 0, building: 0 } });
    expect(teeth.vs.medium).toBe(0);
    for (const armor of MASHUP_ARMORS) expect(shell.vs[armor]).toBeTypeOf('number');
  });
});

describe('mashup composition', () => {
  it('composes the example mashup into a playable pack', () => {
    const { pack, factions, seats } = composeMashup('leviathan-isles', [example, classic('ra2', 'america')]);
    expect(factions).toEqual(['p1', 'p2']);
    expect(pack.maps).toHaveLength(1);
    expect(pack.maps[0].id).toBe('leviathan-isles');
    integrity(pack);
    for (const id of factions) reachable(pack, id);
    // Soviet buildings, Nod boots, Imperial armour, Russian jets and an Allied navy, all at once.
    const mine = Object.values(pack.units).filter(u => u.factions?.includes('p1'));
    expect(mine.some(u => u.id === 'p1-chemwarrior')).toBe(true);
    expect(mine.some(u => u.id === 'p1-atat')).toBe(true);
    expect(mine.some(u => u.id === 'p1-kirov')).toBe(true);
    expect(mine.some(u => u.id === 'p1-destroyer')).toBe(true);
    expect(Object.values(pack.structures).some(s => s.id === 'p1-s-barracks')).toBe(true);
    // Nobody can build anybody else's things.
    for (const def of [...Object.values(pack.units), ...Object.values(pack.structures)]) {
      if (def.id.startsWith('p1-')) expect(def.factions, def.id).toEqual(['p1']);
      if (def.id.startsWith('p2-')) expect(def.factions, def.id).toEqual(['p2']);
    }
    expect(seats[0].sets.infantry).toBe(example.infantry);
  });

  it('carries the chosen buildings’ upgrade progression across', () => {
    const { pack } = composeMashup('arrakis-basin', [classic('dune', 'harkonnen'), classic('dune', 'atreides')]);
    const yard = Object.values(pack.structures).find(s => s.constructionYard && s.factions?.includes('p1'))!;
    expect(yard.upgrades).toBe(3);
    expect(yard.upgradeCost).toBe(dunePackYard().upgradeCost);
    // A gate on the third yard upgrade survives, because these buildings offer three.
    const ix = Object.values(pack.structures).find(s => s.id === 'p1-ix')!;
    expect(ix.prereqs.some(p => p.endsWith('@3'))).toBe(true);
  });

  it('clamps an upgrade gate to what the chosen buildings actually offer', () => {
    // Dune vehicles are gated on heavy-factory and yard upgrades that Red Alert 2 does not have.
    const { pack } = composeMashup('ra1-ore-rift', [
      { structures: choice('structures', 'ra2', 'america'), vehicle: choice('vehicle', 'dune', 'harkonnen') },
      classic('ra1', 'soviet'),
    ]);
    integrity(pack);
    reachable(pack, 'p1');
    for (const def of Object.values(pack.units).filter(u => u.factions?.includes('p1'))) {
      for (const entry of def.prereqs) for (const alt of entry.split('|')) {
        const [id, level] = alt.split('@');
        if (level) expect(Number(level), `${def.id} gate on ${alt}`).toBeLessThanOrEqual(pack.structures[id].upgrades ?? 0);
      }
    }
  });

  it('brings over a producer when the chosen base has none for a chosen force', () => {
    // Dune has no navy at all, so Dune buildings plus Red Alert 2 ships need a shipyard.
    const loadout: MashupLoadout = {
      structures: choice('structures', 'dune', 'ordos'),
      infantry: choice('infantry', 'dune', 'ordos'),
      naval: choice('naval', 'ra2', 'russia'),
    };
    const { pack, seats } = composeMashup('leviathan-isles', [loadout, classic('ra2', 'russia')]);
    integrity(pack);
    reachable(pack, 'p1');
    const mine = Object.values(pack.structures).filter(s => s.factions?.includes('p1'));
    expect(mine.some(s => s.produces === 'naval' && s.onWater)).toBe(true);
    expect(seats[0].bridged.length).toBeGreaterThan(0);
  });

  it('always leaves a commander able to deploy a base and mine, whatever they picked', () => {
    // Soldiers only: the construction vehicle and the harvester come from the chosen base.
    const loadout: MashupLoadout = {
      structures: choice('structures', 'ra1', 'allies'),
      infantry: choice('infantry', 'conquer', 'rebels'),
    };
    const { pack } = composeMashup('ra1-ore-rift', [loadout, classic('ra1', 'soviet')]);
    integrity(pack);
    reachable(pack, 'p1');
    const mine = Object.values(pack.units).filter(u => u.factions?.includes('p1'));
    const mcv = mine.find(u => u.deploysTo)!;
    expect(pack.structures[mcv.deploysTo!].constructionYard).toBe(true);
    expect(pack.structures[mcv.deploysTo!].factions).toEqual(['p1']);
    expect(mine.some(u => u.harvester)).toBe(true);
    expect(pack.factions[0].startUnits[0]).toBe(mcv.id);
  });

  it('keeps the battlefield’s own world: terrain, resources, mechanics and view', () => {
    const { pack } = composeMashup('arrakis-basin', [classic('ra2', 'russia'), classic('td', 'nod')]);
    const dune = PACKS.dune;
    expect(pack.projection).toBe(dune.projection);
    expect(pack.terrains).toBe(dune.terrains);
    expect(pack.resources).toBe(dune.resources);
    expect(pack.mechanics.buildOn).toEqual(['rock']);
    expect(pack.mechanics.sandworm).toEqual(dune.mechanics.sandworm);
    expect(pack.startCredits).toBe(dune.startCredits);
    // Concrete belongs to the ground, not to a side, so everybody may lay it.
    const slab = pack.structures[pack.mechanics.concrete!.structure];
    expect(slab.floor).toBe(true);
    expect(slab.factions).toBeUndefined();
    integrity(pack);
    for (const id of ['p1', 'p2']) reachable(pack, id);
  });

  it('delivers the commander’s own units from a borrowed superweapon', () => {
    // Soviet buildings include the paradrop; the soldiers dropped are the ones chosen.
    const loadout: MashupLoadout = {
      structures: choice('structures', 'ra1', 'soviet'),
      infantry: choice('infantry', 'dune', 'atreides'),
      vehicle: choice('vehicle', 'dune', 'atreides'),
    };
    const { pack } = composeMashup('ra1-ore-rift', [loadout, classic('ra1', 'allies')]);
    integrity(pack);
    const drops = Object.values(pack.structures)
      .filter(s => s.factions?.includes('p1'))
      .flatMap(s => (s.superweapon ? [s.superweapon].flat() : []));
    const paradrop = drops.find(sw => sw.kind === 'paradrop');
    expect(paradrop, 'the airfield still calls in a drop').toBeTruthy();
    for (const type of paradrop!.units!) {
      expect(pack.units[type].factions).toEqual(['p1']);
      expect(pack.units[type].name, 'dropped soldiers are the chosen ones').not.toBe('Rifle Infantry');
    }
    // A superweapon is never offered to a commander whose side it did not belong to.
    for (const sw of drops) expect(sw.factions).toBeUndefined();
  });

  it('plays, and composes identically for every client in the match (lockstep safe)', () => {
    const loadouts = [example, classic('conquer', 'empire'), classic('dune', 'ordos'), classic('td', 'gdi')];
    const seats = (seed: number) => {
      const { pack, factions } = composeMashup('leviathan-isles', loadouts);
      return new Game({
        pack, mapId: 'leviathan-isles', seed, techLevel: 15,
        players: factions.map((faction, i) => ({ name: `P${i}`, faction, ai: true, level: 'normal' as const, team: i })),
      });
    };
    const a = seats(7), b = seats(7);
    // Two independent compositions of the same loadouts are the same pack, byte for byte.
    expect(JSON.stringify(composeMashup('leviathan-isles', loadouts).pack))
      .toBe(JSON.stringify(composeMashup('leviathan-isles', loadouts).pack));
    expect(a.players).toHaveLength(4);
    for (const p of a.players) {
      const mcv = [...a.entities.values()].find(e => e.owner === p.slot && a.pack.units[e.type]?.deploysTo);
      expect(mcv, `${p.faction} has a construction vehicle`).toBeTruthy();
      const yard = a.pack.structures[a.pack.units[mcv!.type].deploysTo!];
      const x = Math.floor(mcv!.x / 256) - (yard.w >> 1), y = Math.floor(mcv!.y / 256) - (yard.h >> 1);
      expect(a.canPlace(p, yard.id, x, y, true, mcv!.id), `${p.faction} can deploy`).toBe(true);
    }
    for (let t = 0; t < 2500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
    // The AI got something built out of its own mashed-up roster.
    expect([...a.entities.values()].filter(e => e.kind === 'structure').length).toBeGreaterThan(4);
  });

  it('composes a playable pack on every battlefield the platform offers', () => {
    const rosters = MASHUP_PACKS.flatMap(p => p.factions.map(f => ({ packId: p.id, factionId: f.id })));
    catalogue.maps.forEach((map, n) => {
      const mine = rosters[n % rosters.length], theirs = rosters[(n + 1) % rosters.length];
      const { pack, factions } = composeMashup(map.mapId, [classic(mine.packId, mine.factionId), classic(theirs.packId, theirs.factionId)]);
      integrity(pack);
      for (const id of factions) reachable(pack, id);
    });
  }, 60_000);

  it('mixes any pack’s buildings with any other pack’s forces', () => {
    // Every combination of a building set with a set of forces from somewhere else, so no
    // pairing in the catalogue can leave a commander with something they cannot build.
    for (const base of catalogue.choices.structures) {
      for (const slot of MASHUP_SLOTS) {
        if (slot === 'structures') continue;
        for (const force of catalogue.choices[slot]) {
          const loadout: MashupLoadout = { structures: base.key, [slot]: force.key };
          const { pack, factions } = composeMashup('leviathan-isles', [loadout, classic('ra2', 'america')]);
          integrity(pack);
          for (const id of factions) reachable(pack, id);
        }
      }
    }
  }, 120_000);
});

describe('mashup is a Gold game type', () => {
  it('is offered in the lobby as a Fusion style with no fixed pack', () => {
    const style = STYLES.find(s => s.id === MASHUP_STYLE)!;
    expect(style, 'Custom Mashup is a style').toBeTruthy();
    expect(style.engine).toBe('fusion');
    expect(style.lockstep).toBe(true);
    expect(style.playable).toBe(true);
    expect(style.pack, 'a mashup composes its own pack').toBeUndefined();
    expect(style.tier).toBe('gold');
  });

  it('is open to Gold and refused to everyone else', () => {
    expect(plan('gold').customMashup).toBe(true);
    expect(styleAllowed(MASHUP_STYLE, 'gold')).toBe(true);
    for (const tier of ['guest', 'free', 'bronze', 'silver'] as const) {
      expect(plan(tier).customMashup, tier).toBe(false);
      expect(styleAllowed(MASHUP_STYLE, tier), tier).toBe(false);
    }
    // Every other style stays open to every tier.
    for (const style of STYLES.filter(s => s.id !== MASHUP_STYLE)) {
      expect(styleAllowed(style.id, 'guest'), style.id).toBe(true);
    }
  });

  it('validates a loadout off the wire without trusting its contents', () => {
    const wire = { structures: 'ra2:russia', infantry: 'td:nod', aircraft: 'ra2:russia' };
    expect(parseLoadout(wire)).toEqual(wire);
    expect(parseLoadout({ structures: 'ra2:russia', infantry: 'td:nod', naval: '' })).toEqual({ structures: 'ra2:russia', infantry: 'td:nod' });
    expect(() => parseLoadout({ infantry: 'td:nod' })).toThrow();
    expect(() => parseLoadout({ structures: 'ra2:russia' })).toThrow();
    expect(() => parseLoadout({ structures: 'RA2:Russia', infantry: 'td:nod' })).toThrow();
    expect(() => parseLoadout({ structures: 'ra2:russia:extra', infantry: 'td:nod' })).toThrow();
    expect(() => parseLoadout({ structures: 'x'.repeat(200), infantry: 'td:nod' })).toThrow();
    expect(() => parseLoadout(null)).toThrow();
  });
});

const dunePackYard = () => PACKS.dune.structures.conyard;
