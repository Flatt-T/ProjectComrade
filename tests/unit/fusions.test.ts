import { describe, expect, it } from 'vitest';
import { STYLES } from '../../packages/contracts/src/index';
import { infantryCostume } from '../../packages/fusion/src/art/costume';
import { hullMesh } from '../../packages/fusion/src/art/models';
import {
  CLASSIC_PACKS, FUSIONS, Game, PACKS, composeMashup, conquerPack, factionCanUse, holdoutPack,
  irregularPack, leviathanPack, packHasDoctrines, wholePackLoadout,
} from '../../packages/fusion/src/index';

const four = (seed = 11, ai = false) => new Game({
  pack: leviathanPack, mapId: 'leviathan-isles', seed,
  players: ['america', 'russia', 'korea', 'iraq'].map((faction, i) => ({ name: `P${i}`, faction, ai, team: i < 2 ? 101 : 102 })),
});
const run = (g: Game, n: number, until?: () => boolean) => { for (let i = 0; i < n && !until?.(); i++) g.step(); };

describe('fusions are registered and playable', () => {
  it('every fusion is a pack with a lobby style', () => {
    for (const f of FUSIONS) {
      expect(PACKS[f.id]).toBe(f);
      const style = STYLES.find(s => s.pack === f.id);
      expect(style, `${f.id} has a lobby style`).toBeTruthy();
      expect(style!.engine).toBe('fusion');
      expect(style!.lockstep).toBe(true);
      for (const faction of style!.factions) expect(f.factions.some(x => x.id === faction.id), faction.id).toBe(true);
    }
  });
});

describe('fusion: Leviathan Isles', () => {
  it('is a huge, mostly-sea map where all four bases can deploy', () => {
    const g = four();
    expect(g.map.w * g.map.h).toBe(128 * 128);
    const water = g.map.terrain.filter(t => leviathanPack.terrains[t].water).length;
    expect(water / g.map.terrain.length).toBeGreaterThan(0.6);
    for (const p of g.players) {
      const mcv = [...g.entities.values()].find(e => e.owner === p.slot && leviathanPack.units[e.type]?.deploysTo)!;
      const yard = leviathanPack.structures[leviathanPack.units[mcv.type].deploysTo!];
      expect(g.canPlace(p, yard.id, Math.floor(mcv.x / 256) - (yard.w >> 1), Math.floor(mcv.y / 256) - (yard.h >> 1), true, mcv.id)).toBe(true);
    }
  });

  it('keeps the home islands poor and the central island rich', () => {
    const g = four();
    const wealth = (cx: number, cy: number, r: number) => {
      let total = 0;
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        const i = y * g.map.w + x;
        if (g.map.resKind[i]) total += g.map.res[i] * leviathanPack.resources[g.map.resKind[i] - 1].value;
      }
      return total;
    };
    const home = wealth(25, 25, 16), centre = wealth(64, 64, 26);
    expect(home).toBeGreaterThan(0);
    expect(centre).toBeGreaterThan(home * 8);
  });

  it('worms surface near the fields, swim the sea, eat ships and never come ashore on firm ground', () => {
    const g = four();
    run(g, leviathanPack.mechanics.sandworm!.appearAfter + 400);
    const out = g.worms.filter(w => !w.hidden);
    expect(out.length).toBeGreaterThan(0);
    const allowed = new Set(['water', 'sand']);
    for (let i = 0; i < 600; i++) {
      g.step();
      for (const w of g.worms) if (!w.hidden) expect(allowed.has(leviathanPack.terrains[g.map.terrain[g.cellIndex(Math.floor(w.x / 256), Math.floor(w.y / 256))]].id)).toBe(true);
    }
    // Worms spread across the map rather than all sitting on the central deposit.
    const spread = new Set(g.worms.filter(w => !w.hidden).map(w => `${w.x < 64 * 256}${w.y < 64 * 256}${Math.hypot(w.x / 256 - 64, w.y / 256 - 64) < 20}`));
    expect(spread.size).toBeGreaterThan(1);
    // A destroyer at sea next to a surfaced worm gets taken.
    const worm = g.worms[0];
    worm.hidden = 0; worm.hp = 1000; worm.x = worm.px = 44 * 256 + 128; worm.y = worm.py = 44 * 256 + 128;
    expect(leviathanPack.terrains[g.map.terrain[g.cellIndex(44, 44)]].water).toBe(true);
    const ship = g.spawnUnit('destroyer', 0, g.cellIndex(47, 44));
    run(g, 900, () => ship.hp < ship.maxHp);
    expect(ship.hp).toBeLessThan(ship.maxHp);
  });

  it('plays deterministically with teams and AI (lockstep safe)', () => {
    const a = four(5, true), b = four(5, true);
    for (let t = 0; t < 4500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.isEnemy(0, 1)).toBe(false);
    expect(a.isEnemy(0, 2)).toBe(true);
  });
});

const conquerSeats = (mapId: string, seed = 11, ai = false) => {
  const map = conquerPack.maps.find(m => m.id === mapId)!;
  const order = ['rebels', 'empire', 'republic', 'cis'];
  return new Game({
    pack: conquerPack, mapId, seed, techLevel: 15,
    players: order.slice(0, map.maxPlayers).map((faction, i) => ({
      name: `P${i}`, faction, ai, team: i % 2 === 0 ? 101 : 102,
    })),
  });
};

describe('fusion: Star Wars Conquer', () => {
  it('lets every start deploy its MCV on every planet', () => {
    for (const map of conquerPack.maps) {
      const g = conquerSeats(map.id);
      expect(g.players.length, map.id).toBe(map.maxPlayers);
      for (const p of g.players) {
        const mcv = [...g.entities.values()].find(e => e.owner === p.slot && conquerPack.units[e.type]?.deploysTo);
        expect(mcv, `${map.id} ${p.faction} has an MCV`).toBeTruthy();
        const yard = conquerPack.structures[conquerPack.units[mcv!.type].deploysTo!];
        const x = Math.floor(mcv!.x / 256) - (yard.w >> 1);
        const y = Math.floor(mcv!.y / 256) - (yard.h >> 1);
        expect(g.canPlace(p, yard.id, x, y, true, mcv!.id), `${map.id} ${p.faction} can deploy`).toBe(true);
      }
    }
  });

  it('gives Scarif and Kamino water where a shipyard can sit', () => {
    for (const mapId of ['scarif-lagoon', 'kamino-platforms']) {
      const g = conquerSeats(mapId);
      const water = g.map.terrain.filter(t => conquerPack.terrains[t].water).length;
      expect(water / g.map.terrain.length, `${mapId} has water`).toBeGreaterThan(0.1);
      for (const p of g.players) {
        const dock = Object.values(conquerPack.structures).find(s => s.onWater && factionCanUse(s, p.faction, p.side));
        expect(dock, `${p.faction} has a shipyard`).toBeTruthy();
        let placeable = false;
        for (let y = 0; y < g.map.h && !placeable; y++) {
          for (let x = 0; x < g.map.w; x++) {
            if (g.canPlace(p, dock!.id, x, y, true)) { placeable = true; break; }
          }
        }
        expect(placeable, `${mapId} ${p.faction} can place a shipyard`).toBe(true);
      }
    }
  });

  it('gives each faction infantry, a walker or tank, an aircraft and a ship', () => {
    for (const faction of conquerPack.factions) {
      const mine = (def: { factions?: string[]; kind?: string; role?: string }) => factionCanUse(def, faction.id, faction.side);
      const units = Object.values(conquerPack.units).filter(mine);
      expect(units.some(u => u.kind === 'infantry'), `${faction.id} infantry`).toBe(true);
      expect(units.some(u => u.kind === 'vehicle' && u.role === 'combat'), `${faction.id} walker or tank`).toBe(true);
      expect(units.some(u => u.kind === 'aircraft'), `${faction.id} aircraft`).toBe(true);
      expect(units.some(u => u.kind === 'naval'), `${faction.id} ship`).toBe(true);
    }
  });

  it('gives each faction three superweapons, including a dedicated drop beacon', () => {
    for (const faction of conquerPack.factions) {
      const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
      const powers = Object.values(conquerPack.structures).filter(mine)
        .flatMap(st => (st.superweapon ? [st.superweapon].flat() : []).filter(sw => factionCanUse(sw, faction.id, faction.side)));
      expect(powers.map(p => p.id), faction.id).toHaveLength(3);
      expect(powers.some(p => p.kind === 'paradrop'), `${faction.id} drop`).toBe(true);
    }
  });

  it('names every superweapon after the action it performs', () => {
    const byId: Record<string, string> = {
      ionstrike: 'ion', planetaryshield: 'shield',
      alliancedrop: 'paradrop', laatdrop: 'paradrop',
      superlaser: 'laser', tractorbeam: 'tractor',
      probeswarm: 'paradrop', droiddrop: 'paradrop',
    };
    for (const st of Object.values(conquerPack.structures)) {
      for (const sw of st.superweapon ? [st.superweapon].flat() : []) {
        expect(sw.kind, sw.id).toBe(byId[sw.id]);
        expect(['missile', 'curtain', 'chrono']).not.toContain(sw.kind);
      }
    }
  });

  it('fires the Superlaser as a beam, not a missile', () => {
    const g = new Game({
      pack: conquerPack, mapId: 'tatooine-dune-sea', seed: 3, techLevel: 15,
      players: [{ name: 'E', faction: 'empire', ai: false }, { name: 'R', faction: 'rebels', ai: false }],
    });
    const dish = g.spawnStructure('d-superlaser', 0, 16, 16);
    const sw = g.superweaponOf(dish)!;
    expect(sw.kind).toBe('laser');
    dish.charge = sw.charge;
    const target = g.spawnUnit('rebel-trooper', 1, g.cellIndex(19, 17));
    const before = target.hp;
    g.enqueue(0, { t: 'super', id: dish.id, x: 19, y: 17 });
    g.step();
    expect(g.effects.some(e => e.kind === 'laserCharge')).toBe(true);
    expect(g.effects.some(e => e.kind === 'superLaunch' || e.kind === 'superIncoming')).toBe(false);
    run(g, sw.delay + 2);
    expect(g.effects.some(e => e.kind === 'laserStrike')).toBe(true);
    expect(g.effects.some(e => e.kind === 'nuke')).toBe(false);
    expect(target.hp).toBeLessThan(before);
  });

  it('locks enemies in a tractor beam and shields friendlies, including infantry', () => {
    const g = new Game({
      pack: conquerPack, mapId: 'tatooine-dune-sea', seed: 3, techLevel: 15,
      players: [{ name: 'E', faction: 'empire', ai: false }, { name: 'R', faction: 'rebels', ai: false }],
    });
    const array = g.spawnStructure('d-tractor', 0, 16, 16);
    const tractor = g.superweaponOf(array)!;
    expect(tractor.kind).toBe('tractor');
    array.charge = tractor.charge;
    const victim = g.spawnUnit('t2b', 1, g.cellIndex(19, 17));
    g.enqueue(0, { t: 'super', id: array.id, x: 19, y: 17 });
    g.step();
    expect(g.effects.some(e => e.kind === 'tractorCharge')).toBe(true);
    expect(g.effects.some(e => e.kind === 'chronoCharge')).toBe(false);
    run(g, tractor.delay + 2);
    expect(g.effects.some(e => e.kind === 'tractorHold')).toBe(true);
    expect(victim.heldUntil).toBeGreaterThan(g.tick);
    g.enqueue(1, { t: 'move', ids: [victim.id], x: 40, y: 40 });
    const locked = { x: victim.x, y: victim.y };
    run(g, 30);
    expect(victim.x).toBe(locked.x);
    expect(victim.y).toBe(locked.y);
    expect(victim.order).toBe('idle');

    const gen = g.spawnStructure('l-shield', 1, 40, 40);
    const shield = g.superweaponOf(gen)!;
    expect(shield.kind).toBe('shield');
    gen.charge = shield.charge;
    const trooper = g.spawnUnit('rebel-trooper', 1, g.cellIndex(44, 41));
    g.enqueue(1, { t: 'super', id: gen.id, x: 44, y: 41 });
    run(g, shield.delay + 3);
    expect(g.effects.some(e => e.kind === 'shield')).toBe(true);
    expect(g.effects.some(e => e.kind === 'curtain')).toBe(false);
    expect(trooper.hp).toBe(trooper.maxHp);
    expect(trooper.invulnUntil).toBeGreaterThan(g.tick);
    g.damage(trooper, 999, 0);
    expect(trooper.hp).toBe(trooper.maxHp);
  });

  it('lets the Falcon keep the attack after the first kill, then restock and return', () => {
    const g = new Game({
      pack: conquerPack, mapId: 'tatooine-dune-sea', seed: 3, techLevel: 15,
      players: [{ name: 'R', faction: 'rebels', ai: false }, { name: 'E', faction: 'empire', ai: false }],
    });
    g.spawnStructure('l-hpad', 0, 8, 8);
    g.players[0].explored.fill(1); g.players[0].visible.fill(1);
    const falcon = g.spawnUnit('falcon', 0, g.cellIndex(12, 12));
    const first = g.spawnUnit('stormtrooper', 1, g.cellIndex(16, 12));
    const second = g.spawnUnit('stormtrooper', 1, g.cellIndex(18, 12));
    g.enqueue(0, { t: 'attack', ids: [falcon.id], target: first.id });
    run(g, 500, () => first.hp <= 0);
    expect(first.hp).toBeLessThanOrEqual(0);
    expect(falcon.ammo).toBeGreaterThan(0);
    expect(falcon.order).not.toBe('rearm');
    run(g, 700, () => second.hp <= 0);
    expect(second.hp).toBeLessThanOrEqual(0);
  });

  it('loads bombers with a rack, and Jedi fight saber-to-saber with the Force at range', () => {
    expect(conquerPack.units.ywing.ammo).toBeGreaterThanOrEqual(4);
    expect(conquerPack.units.falcon.sortie).toBe(true);
    expect(conquerPack.units['jedi-knight'].altWeapon).toBe('forcepush');
    expect(conquerPack.weapons.lightsaber.range).toBeLessThan(conquerPack.weapons.forcepush.range);
  });

  it('fields walkers at the start, with a large vehicle/air/naval roster per faction', () => {
    const walkers = ['atst', 'atrt', 'atpt', 'atdp', 'atte', 'atat', 'dwarf-spider'];
    for (const id of walkers) expect(conquerPack.units[id], id).toBeTruthy();
    const g = conquerSeats('tatooine-dune-sea');
    const empire = g.players.find(p => p.faction === 'empire')!;
    expect([...g.entities.values()].some(e => e.owner === empire.slot && e.type === 'atst')).toBe(true);
    for (const faction of conquerPack.factions) {
      const mine = (def: { factions?: string[] }) => factionCanUse(def, faction.id, faction.side);
      const units = Object.values(conquerPack.units).filter(mine);
      expect(units.filter(u => u.kind === 'vehicle').length, `${faction.id} vehicles`).toBeGreaterThanOrEqual(8);
      expect(units.filter(u => u.kind === 'aircraft').length, `${faction.id} aircraft`).toBeGreaterThanOrEqual(6);
      expect(units.filter(u => u.kind === 'naval').length, `${faction.id} ships`).toBeGreaterThanOrEqual(6);
    }
  });

  it('paints stormtroopers white and clones white, not the faction stripe', () => {
    expect(conquerPack.units.stormtrooper.shape).toBe('storm');
    expect(conquerPack.units['death-trooper'].shape).toBe('death');
    expect(conquerPack.units['scout-trooper'].shape).toBe('scout');
    const storm = infantryCostume('storm', '#c2281f');
    expect(storm.body.toLowerCase()).not.toBe('#c2281f');
    expect(storm.body.toLowerCase()).toMatch(/^#e[0-9a-f]{5}$|^#f[0-9a-f]{5}$/);
    const death = infantryCostume('death', '#c2281f');
    expect(parseInt(death.body.slice(1, 3), 16)).toBeLessThan(40);
    const clone = infantryCostume('clone', '#3a72d6');
    expect(clone.body.toLowerCase()).toMatch(/^#e[0-9a-f]{5}$|^#f[0-9a-f]{5}$/);
  });

  it('assigns Sand People, Ewoks and Opee Sea Killers to the matching biomes', () => {
    expect(conquerPack.mechanics.sandworm!.form).toMatchObject({ sand: 'tusken', trees: 'ewok', water: 'opee' });
    const tatooine = conquerSeats('tatooine-dune-sea', 9);
    run(tatooine, conquerPack.mechanics.sandworm!.appearAfter + 80);
    expect(tatooine.worms.length).toBeGreaterThan(0);
    expect(tatooine.worms.every(w => w.form === 'tusken')).toBe(true);

    const endor = conquerSeats('endor-canopy', 9);
    run(endor, conquerPack.mechanics.sandworm!.appearAfter + 80);
    expect(endor.worms.some(w => w.form === 'ewok')).toBe(true);

    const scarif = conquerSeats('scarif-lagoon', 9);
    run(scarif, conquerPack.mechanics.sandworm!.appearAfter + 80);
    expect(scarif.worms.some(w => w.form === 'opee')).toBe(true);
  });

  it('unlocks Dark superweapons from the Sith Academy, without an extra upgrade gate', () => {
    for (const faction of ['empire', 'cis'] as const) {
      const g = new Game({
        pack: conquerPack, mapId: 'tatooine-dune-sea', seed: 3, techLevel: 15,
        players: [{ name: 'D', faction, ai: false }, { name: 'R', faction: 'rebels', ai: false }],
      });
      g.spawnStructure('d-yard', 0, 16, 16);
      g.spawnStructure('d-lab', 0, 20, 16);
      const defence = g.buildOptions(g.players[0], 'defense');
      expect(defence, faction).toEqual(expect.arrayContaining(['d-superlaser', 'd-tractor']));
      expect(g.canBuild(g.players[0], 'd-jammer'), `${faction} jammer`).toBe(true);
    }
  });

  it('gives the AT-AT a longer gun than tanks, walks its legs, and lets Sand People raid instead of swallow', () => {
    expect(conquerPack.weapons.atatchin.range).toBeGreaterThan(conquerPack.weapons.occupiergun.range * 1.5);
    expect(conquerPack.weapons.atatchin.range).toBeGreaterThan(conquerPack.weapons.atstchin.range);
    const team: [number, number, number] = [200, 200, 200];
    expect(JSON.stringify(hullMesh('atst', 'empire', team, 0).faces)).not.toEqual(JSON.stringify(hullMesh('atst', 'empire', team, 2).faces));
    expect(JSON.stringify(hullMesh('atat', 'empire', team, 0).faces)).not.toEqual(JSON.stringify(hullMesh('atat', 'empire', team, 3).faces));
    expect(JSON.stringify(hullMesh('dwarfspider', 'cis', team, 0).faces)).not.toEqual(JSON.stringify(hullMesh('dwarfspider', 'cis', team, 2).faces));

    expect(conquerPack.mechanics.sandworm!.raid).toContain('tusken');
    const g = new Game({
      pack: conquerPack, mapId: 'tatooine-dune-sea', seed: 3, techLevel: 15,
      players: [{ name: 'E', faction: 'empire', ai: false }, { name: 'R', faction: 'rebels', ai: false }],
    });
    run(g, conquerPack.mechanics.sandworm!.appearAfter);
    const sand = g.map.terrain.findIndex(t => conquerPack.terrains[t].id === 'sand');
    const tank = g.spawnUnit('occupier', 0, sand);
    const tusken = g.worms.find(w => w.form === 'tusken') ?? g.worms[0];
    tusken.form = 'tusken';
    tusken.hidden = 0; tusken.hp = 1000; tusken.up = 0;
    tusken.x = tusken.px = tank.x; tusken.y = tusken.py = tank.y;
    tusken.target = tank.id;
    const before = tank.hp;
    run(g, 8, () => tank.hp < before);
    expect(tank.hp).toBeGreaterThan(0);
    expect(tank.hp).toBe(before - 80);
    expect(g.effects.some(e => e.kind === 'wormEat' && e.item === 'tusken')).toBe(true);
  });

  it('plays deterministically with mixed Light/Dark teams and AI (lockstep safe)', () => {
    const seats = (seed: number) => new Game({
      pack: conquerPack, mapId: 'kamino-platforms', seed, techLevel: 15,
      players: [
        { name: 'P0', faction: 'rebels', ai: true, team: 101 },
        { name: 'P1', faction: 'empire', ai: true, team: 102 },
        { name: 'P2', faction: 'republic', ai: true, team: 101 },
        { name: 'P3', faction: 'cis', ai: true, team: 102 },
      ],
    });
    const a = seats(5), b = seats(5);
    for (let t = 0; t < 2500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.isEnemy(0, 2)).toBe(false);
    expect(a.isEnemy(0, 1)).toBe(true);
    expect(a.isEnemy(0, 3)).toBe(true);
  });
});

const seatFour = (pack: typeof irregularPack, mapId: string, order: string[], seed = 11, ai = false) => {
  const map = pack.maps.find(m => m.id === mapId)!;
  return new Game({
    pack, mapId, seed, techLevel: 15,
    players: order.slice(0, map.maxPlayers).map((faction, i) => ({
      name: `P${i}`, faction, ai, team: i % 2 === 0 ? 101 : 102,
    })),
  });
};
const IRREGULAR_SEATS = ['cadres', 'mandate', 'vanguard', 'coastal'];
const HOLDOUT_SEATS = ['preppers', 'vantage', 'hoa', 'pirates'];

/** Every seat on a battlefield can put its construction vehicle down where it starts. */
const everyStartDeploys = (pack: typeof irregularPack, order: string[]) => {
  for (const map of pack.maps) {
    const g = seatFour(pack, map.id, order);
    expect(g.players.length, map.id).toBe(map.maxPlayers);
    for (const p of g.players) {
      const rig = [...g.entities.values()].find(e => e.owner === p.slot && pack.units[e.type]?.deploysTo);
      expect(rig, `${map.id} ${p.faction} has a construction vehicle`).toBeTruthy();
      const yard = pack.structures[pack.units[rig!.type].deploysTo!];
      const x = Math.floor(rig!.x / 256) - (yard.w >> 1);
      const y = Math.floor(rig!.y / 256) - (yard.h >> 1);
      expect(g.canPlace(p, yard.id, x, y, true, rig!.id), `${map.id} ${p.faction} can deploy`).toBe(true);
    }
  }
};

/**
 * Both original modern packs make the same statement about drones, so both are held to it:
 * a large fixed-wing drone is vehicle-tier kit built on the vehicle queue, and a small
 * quadcopter dropping a munition is a high-value infantry unit.
 */
const droneTiersHold = (pack: typeof irregularPack, fixedWing: string[], quadcopters: string[]) => {
  for (const id of fixedWing) {
    const u = pack.units[id];
    expect(u, id).toBeTruthy();
    expect(u.kind, `${id} flies`).toBe('aircraft');
    expect(u.queue, `${id} is vehicle-tier`).toBe('vehicle');
  }
  for (const id of quadcopters) {
    const u = pack.units[id];
    expect(u, id).toBeTruthy();
    expect(u.kind, `${id} is a soldier unit`).toBe('infantry');
    expect(u.hp, `${id} is fragile`).toBeLessThan(50);
    // High value among its owner's soldiers: several times the price of the rifle it fights
    // beside, and dearer than all but at most one thing its owner can put on foot.
    const theirs = Object.values(pack.units).filter(o => o.kind === 'infantry' && o.id !== id
      && (u.factions ?? []).some(f => !o.factions || o.factions.includes(f)));
    const line = theirs.filter(o => o.role === 'combat');
    expect(line.length, `${id} has line infantry to compare with`).toBeGreaterThan(0);
    expect(u.cost, `${id} costs many times a rifleman`).toBeGreaterThan(Math.min(...line.map(o => o.cost)) * 3);
    expect(theirs.filter(o => o.cost > u.cost).length, `${id} is at the top of the infantry list`).toBeLessThanOrEqual(1);
  }
};

describe('fusion: Irregular Warfare', () => {
  it('lets every start deploy on every battlefield', () => everyStartDeploys(irregularPack, IRREGULAR_SEATS));

  it('splits drones by tier: fixed-wing is vehicle-tier, a bomb-carrying quadcopter is a soldier', () => {
    droneTiersHold(irregularPack, ['surveydrone', 'strikedrone', 'patroldrone'], ['quadteam', 'quadbought', 'quadmunition']);
    // The quadcopter drops from standoff rather than flying into anything.
    expect(irregularPack.weapons.dropcharge.suicide).toBeUndefined();
    expect(irregularPack.weapons.dropcharge.range).toBeGreaterThan(irregularPack.weapons.rifle.range);
  });

  it('prices the conventional force above the irregulars it fights', () => {
    const armyCost = (faction: string) => {
      const side = irregularPack.factions.find(f => f.id === faction)!.side;
      const units = Object.values(irregularPack.units)
        .filter(u => factionCanUse(u, faction, side) && u.role === 'combat' && u.kind === 'infantry');
      return units.reduce((n, u) => n + u.cost, 0) / units.length;
    };
    expect(armyCost('mandate')).toBeGreaterThan(armyCost('cadres') * 2);
    expect(armyCost('vanguard')).toBeGreaterThan(armyCost('cadres'));
  });

  it('answers a wide sponsored rocket with a narrow precise strike', () => {
    const power = (id: string) => Object.values(irregularPack.structures)
      .flatMap(st => (st.superweapon ? [st.superweapon].flat() : [])).find(sw => sw.id === id)!;
    const rocket = power('rocketstrike'), precise = power('precisionstrike');
    expect(rocket.kind).toBe('missile');
    expect(precise.kind).toBe('ion');
    expect(precise.damage, 'the precise one hits harder where it lands').toBeGreaterThan(rocket.damage);
    expect(precise.radius, 'and over far less ground').toBeLessThan(rocket.radius / 2);
  });

  it('conceals from an Aid Station rather than shooting from it', () => {
    const aid = irregularPack.structures.aid;
    expect(aid.gap).toBeGreaterThan(0);
    expect(aid.weapon).toBeUndefined();
    expect(aid.deathWeapon).toBeUndefined();
    expect(aid.factions, 'every belligerent can site itself this way').toBeUndefined();
  });

  it('gives the delta enough water for the forces that need a dock', () => {
    const g = seatFour(irregularPack, 'delta-channels', IRREGULAR_SEATS);
    const water = g.map.terrain.filter(t => irregularPack.terrains[t].water).length;
    expect(water / g.map.terrain.length).toBeGreaterThan(0.08);
    for (const p of g.players.filter(x => ['coastal', 'mandate'].includes(x.faction))) {
      let placeable = false;
      for (let y = 0; y < g.map.h && !placeable; y++) {
        for (let x = 0; x < g.map.w; x++) if (g.canPlace(p, 'dock', x, y, true)) { placeable = true; break; }
      }
      expect(placeable, `${p.faction} can place a dock`).toBe(true);
    }
  });

  it('plays deterministically with mixed teams and AI (lockstep safe)', () => {
    const a = seatFour(irregularPack, 'border-crossing', IRREGULAR_SEATS, 5, true);
    const b = seatFour(irregularPack, 'border-crossing', IRREGULAR_SEATS, 5, true);
    for (let t = 0; t < 2500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.isEnemy(0, 2)).toBe(false);
    expect(a.isEnemy(0, 1)).toBe(true);
  });
});

describe('fusion: Holdouts', () => {
  it('lets every start deploy on every battlefield', () => everyStartDeploys(holdoutPack, HOLDOUT_SEATS));

  it('keeps the same drone tiering as the pack it is the comic twin of', () => {
    droneTiersHold(holdoutPack, ['observer'], ['eggdrone', 'noisedrone', 'gullcam']);
  });

  it('wins arguments with a clipboard instead of a weapon', () => {
    const chair = holdoutPack.units.chair;
    const vote = holdoutPack.weapons[chair.weapon!];
    expect(vote.converts, 'the vote is temporary').toBeGreaterThan(0);
    expect(vote.damage, 'and does no damage at all').toBe(0);
    expect(vote.targets).not.toContain('structure');
  });

  it('boards a vehicle rather than destroying it from outside', () => {
    expect(holdoutPack.units.boarder.terror).toBeGreaterThan(0);
    expect(holdoutPack.units.boarder.kind).toBe('infantry');
  });

  it('exempts what was already there with a Grandfather Clause', () => {
    const clause = [holdoutPack.structures.bylaw.superweapon].flat()[0]!;
    expect(clause.kind).toBe('curtain');
    expect(clause.duration).toBeGreaterThan(0);
  });

  it('serves a notice by hand, and the notice is the last thing the officer does', () => {
    const officer = holdoutPack.units.officer;
    expect(officer.expendable).toBe(true);
    const notice = holdoutPack.weapons[officer.weapon!];
    expect(notice.suicide).toBe(true);
    // A shaped charge: hard on a building, nearly harmless to a person stood in the open.
    expect(holdoutPack.warheads[notice.warhead].vs.building).toBeGreaterThan(holdoutPack.warheads[notice.warhead].vs.none);
  });

  it('plays deterministically with mixed teams and AI (lockstep safe)', () => {
    const a = seatFour(holdoutPack, 'gull-reach', HOLDOUT_SEATS, 5, true);
    const b = seatFour(holdoutPack, 'gull-reach', HOLDOUT_SEATS, 5, true);
    for (let t = 0; t < 2500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.isEnemy(0, 2)).toBe(false);
    expect(a.isEnemy(0, 1)).toBe(true);
  });
});

/**
 * The regular/irregular toggle. Both original modern packs describe two whole armies, and
 * the promise of the regular one is that it is even: every side fields the same five roles,
 * each worth about the same on the day, differing only in how crudely it is made.
 */
describe('doctrines: regular and irregular', () => {
  const DOCTRINE_PACKS = [irregularPack, holdoutPack];
  /** Poorest force first, in both packs: the whole ladder is read in this order. */
  const LADDER: Record<string, string[]> = {
    irregular: ['cadres', 'coastal', 'vanguard', 'mandate'],
    holdout: ['preppers', 'pirates', 'hoa', 'vantage'],
  };
  /** The five roles a regular army fields, keyed the way the pack data distinguishes them. */
  const ROLES = [
    { name: 'line infantry', kind: 'infantry', role: 'combat' },
    { name: 'tank', kind: 'vehicle', role: 'combat' },
    { name: 'field gun', kind: 'vehicle', role: 'siege' },
    { name: 'strike aircraft', kind: 'aircraft', role: 'combat' },
    { name: 'warship', kind: 'naval', role: 'siege' },
  ] as const;

  const regulars = (pack: typeof irregularPack, faction: string, kind: string, role: string) =>
    Object.values(pack.units).filter(u => u.doctrine === 'regular' && u.kind === kind && u.role === role
      && factionCanUse(u, faction, pack.factions.find(f => f.id === faction)!.side));
  /** Durability times rate of fire: what the thing is worth in a fight, to one number. */
  const value = (pack: typeof irregularPack, id: string) => {
    const u = pack.units[id];
    const w = pack.weapons[u.weapon!];
    return (u.hp * w.damage * (w.burst ?? 1)) / w.rof;
  };
  const spread = (ns: number[]) => Math.max(...ns) / Math.min(...ns);

  it('offers the choice only in the packs that describe both armies', () => {
    for (const pack of DOCTRINE_PACKS) expect(packHasDoctrines(pack), pack.id).toBe(true);
    for (const pack of [...CLASSIC_PACKS, leviathanPack, conquerPack]) {
      expect(packHasDoctrines(pack), pack.id).toBe(false);
    }
  });

  for (const pack of DOCTRINE_PACKS) {
    describe(pack.id, () => {
      it('gives every faction exactly one of each regular role', () => {
        for (const faction of LADDER[pack.id]) {
          for (const r of ROLES) {
            const found = regulars(pack, faction, r.kind, r.role);
            expect(found.map(u => u.id), `${faction} ${r.name}`).toHaveLength(1);
          }
        }
      });

      it('makes the five roles worth about the same whoever fields them', () => {
        for (const r of ROLES) {
          const values = LADDER[pack.id].map(f => value(pack, regulars(pack, f, r.kind, r.role)[0].id));
          const detail = LADDER[pack.id].map((f, i) => `${f}=${values[i].toFixed(0)}`).join(' ');
          expect(spread(values), `${r.name}: ${detail}`).toBeLessThanOrEqual(1.35);
        }
      });

      it('pays for sophistication: the cheaper machine is bigger, slower-firing and shorter-ranged', () => {
        for (const r of ROLES) {
          const rungs = LADDER[pack.id].map(f => {
            const u = regulars(pack, f, r.kind, r.role)[0];
            return { f, u, w: pack.weapons[u.weapon!] };
          });
          for (let i = 1; i < rungs.length; i++) {
            const lo = rungs[i - 1], hi = rungs[i];
            const where = `${r.name}: ${lo.f} vs ${hi.f}`;
            expect(hi.u.cost, `${where} costs more`).toBeGreaterThan(lo.u.cost);
            expect(hi.u.hp, `${where} is less of a target`).toBeLessThan(lo.u.hp);
            expect(hi.w.rof, `${where} fires sooner`).toBeLessThan(lo.w.rof);
            expect(hi.w.range, `${where} reaches further`).toBeGreaterThan(lo.w.range);
            expect(hi.w.damage, `${where} hits harder per shot`).toBeGreaterThan(lo.w.damage);
            if (lo.w.splash !== undefined && hi.w.splash !== undefined) {
              expect(hi.w.splash, `${where} lands tighter`).toBeLessThan(lo.w.splash);
            }
            if (lo.w.minRange !== undefined && hi.w.minRange !== undefined) {
              expect(hi.w.minRange, `${where} can fire closer in`).toBeLessThan(lo.w.minRange);
            }
          }
        }
      });

      it('gives every faction an air force and a navy under the regular doctrine', () => {
        for (const faction of LADDER[pack.id]) {
          const side = pack.factions.find(f => f.id === faction)!.side;
          const mine = Object.values(pack.structures).filter(s => factionCanUse(s, faction, side));
          for (const queue of ['aircraft', 'naval'] as const) {
            const producer = mine.find(s => s.produces === queue && s.doctrine !== 'irregular');
            expect(producer, `${faction} can build somewhere to make ${queue}`).toBeTruthy();
          }
        }
      });

      it('starts a regular match with units that exist in it', () => {
        for (const f of pack.factions) {
          expect(f.regularStart, `${f.id} has a regular escort`).toBeTruthy();
          for (const type of f.regularStart!) {
            const u = pack.units[type];
            expect(u, `${f.id} starts with ${type}`).toBeTruthy();
            expect(u.doctrine === 'irregular', `${f.id} starts with no irregular ${type}`).toBe(false);
            expect(factionCanUse(u, f.id, f.side), `${f.id} may field ${type}`).toBe(true);
          }
        }
      });
    });
  }

  it('turns out one army or the other, never both', () => {
    // Cadres with a yard and a workshop: under one doctrine the Ironclad, under the other
    // the pickup, and under neither of them both at once.
    const build = (doctrine: 'regular' | 'irregular') => {
      const g = new Game({
        pack: irregularPack, mapId: 'wadi-road', seed: 4, techLevel: 15, doctrine,
        players: [{ name: 'A', faction: 'cadres', ai: false }, { name: 'B', faction: 'mandate', ai: false }],
      });
      g.spawnStructure('yard', 0, 14, 30);
      g.spawnStructure('works', 0, 18, 30);
      g.spawnStructure('muster', 0, 22, 30);
      return { g, options: [...g.buildOptions(g.players[0], 'vehicle'), ...g.buildOptions(g.players[0], 'infantry')] };
    };
    const regular = build('regular');
    expect(regular.g.doctrine).toBe('regular');
    expect(regular.options).toContain('ironclad');
    expect(regular.options).toContain('conscript');
    expect(regular.options).not.toContain('pickup');
    expect(regular.options).not.toContain('fighter');

    const irregular = build('irregular');
    expect(irregular.options).toContain('pickup');
    expect(irregular.options).toContain('fighter');
    expect(irregular.options).not.toContain('ironclad');
    expect(irregular.options).not.toContain('conscript');
  });

  it('defaults to the irregular army, and keeps the shared trades in both', () => {
    const g = new Game({
      pack: holdoutPack, mapId: 'pelican-point', seed: 4, techLevel: 15,
      players: [{ name: 'A', faction: 'preppers', ai: false }, { name: 'B', faction: 'vantage', ai: false }],
    });
    expect(g.doctrine).toBe('irregular');
    // The construction van, the skip loader and the handyman belong to neither army alone.
    for (const id of ['van', 'skiploader', 'handyman']) expect(holdoutPack.units[id].doctrine).toBeUndefined();
  });

  it('fields a regular escort when the regular doctrine is chosen', () => {
    const g = new Game({
      pack: irregularPack, mapId: 'wadi-road', seed: 4, techLevel: 15, doctrine: 'regular',
      players: [{ name: 'A', faction: 'cadres', ai: false }, { name: 'B', faction: 'mandate', ai: false }],
    });
    const mine = [...g.entities.values()].filter(e => e.owner === 0).map(e => e.type);
    expect(mine).toContain('conscript');
    expect(mine).not.toContain('pickup');
  });

  it('plays the regular doctrine deterministically with AI (lockstep safe)', () => {
    const seats = (seed: number) => new Game({
      pack: irregularPack, mapId: 'border-crossing', seed, techLevel: 15, doctrine: 'regular',
      players: IRREGULAR_SEATS.map((faction, i) => ({ name: `P${i}`, faction, ai: true, team: i % 2 === 0 ? 101 : 102 })),
    });
    const a = seats(5), b = seats(5);
    for (let t = 0; t < 2500; t++) { a.step(); b.step(); }
    expect(a.checksum()).toBe(b.checksum());
  });

  it('lets a mashup commander field whatever they picked, doctrine or not', () => {
    // A mashup is already a pick-your-own army, so a doctrine tag must not survive into one.
    const { pack } = composeMashup('wadi-road', [
      wholePackLoadout('irregular', 'cadres'),
      wholePackLoadout('holdout', 'vantage'),
    ]);
    const tagged = [...Object.values(pack.units), ...Object.values(pack.structures)].filter(d => d.doctrine);
    expect(tagged.map(d => d.id)).toEqual([]);
  });
});
