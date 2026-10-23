import { describe, expect, it } from 'vitest';
import { Game, dunePack, ra2Pack } from '../../packages/fusion/src/index';
import type { Entity, GameSetup } from '../../packages/fusion/src/index';

const humans = (pack: GameSetup['pack'], mapId: string, factions: string[], seed = 5) =>
  new Game({ pack, mapId, seed, players: factions.map((faction, i) => ({ name: `P${i}`, faction, ai: false })) });
const ra = (factions = ['america', 'russia'], mapId = 'temperate-valley') => humans(ra2Pack, mapId, factions);
const dune = (factions = ['atreides', 'harkonnen']) => humans(dunePack, 'arrakis-basin', factions);
const unit = (g: Game, type: string, owner: number, x: number, y: number) => g.spawnUnit(type, owner, g.cellIndex(x, y));
const run = (g: Game, ticks: number, until?: () => boolean) => { for (let i = 0; i < ticks && !until?.(); i++) g.step(); };
const all = (g: Game, type: string, owner?: number) => [...g.entities.values()].filter(e => e.type === type && e.hp > 0 && (owner === undefined || e.owner === owner));
const cellX = (e: Entity) => Math.floor(e.x / 256), cellY = (e: Entity) => Math.floor(e.y / 256);

describe('progression: tech tree', () => {
  it('Dune: factory upgrades unlock the Quad, and the Starport sells at CHOAM prices', () => {
    const g = dune();
    const p = g.players[0];
    g.spawnStructure('conyard', 0, 5, 5);
    g.spawnStructure('windtrap', 0, 9, 5);
    g.spawnStructure('lightfactory', 0, 5, 9);
    expect(g.canBuild(p, 'quad')).toBe(false);
    expect(g.buildOptions(p, 'structure')).toContain('upgrade:lightfactory');
    g.enqueue(0, { t: 'build', item: 'upgrade:lightfactory' });
    run(g, 600, () => p.upgrades.lightfactory === 1);
    expect(p.upgrades.lightfactory).toBe(1);
    expect(g.canBuild(p, 'quad')).toBe(true);
    expect(g.buildOptions(p, 'structure')).not.toContain('upgrade:lightfactory');

    g.spawnStructure('starport', 0, 13, 9);
    expect(g.buildOptions(p, 'starport')).toContain('starport:combattank');
    const prices = new Set<number>();
    for (let i = 0; i < 6; i++) { run(g, 900); prices.add(g.costOf('starport:combattank', p)); }
    expect(prices.size).toBeGreaterThan(1);
    for (const price of prices) expect(price).toBeGreaterThanOrEqual(490);
  });

  it('RA2: each country gets its own special on top of its side\'s arsenal', () => {
    const g = humans(ra2Pack, 'four-corners', ['america', 'germany', 'russia']);
    const [america, germany, russia] = g.players;
    g.spawnStructure('a-factory', 0, 10, 10);
    g.spawnStructure('a-factory', 1, 50, 10);
    g.spawnStructure('s-factory', 2, 50, 50);
    expect(g.canBuild(america, 'grizzly')).toBe(true);
    expect(g.canBuild(america, 'tankdestroyer')).toBe(false);
    expect(g.canBuild(germany, 'tankdestroyer')).toBe(true);
    expect(g.canBuild(russia, 'grizzly')).toBe(false);
    expect(g.canBuild(russia, 'rhino')).toBe(true);
    const hqA = g.spawnStructure('a-radar', 0, 14, 14), hqG = g.spawnStructure('a-radar', 1, 46, 14);
    expect(g.superweaponOf(hqA)?.kind).toBe('paradrop');
    expect(g.superweaponOf(hqG)).toBeUndefined();
  });

  it('Industrial Plant discounts vehicles but not infantry', () => {
    const g = ra();
    const p = g.players[1];
    g.spawnStructure('s-industrial', 1, 50, 50);
    g.step();
    expect(g.costOf('rhino', p)).toBe(675);
    expect(g.costOf('conscript', p)).toBe(100);
  });

  it('Cloning Vats copy every infantry unit trained', () => {
    const g = ra();
    g.spawnStructure('s-barracks', 1, 50, 50);
    g.spawnStructure('s-cloning', 1, 46, 50);
    const before = all(g, 'conscript', 1).length;
    g.enqueue(1, { t: 'build', item: 'conscript' });
    run(g, 400, () => all(g, 'conscript', 1).length > before);
    expect(all(g, 'conscript', 1).length).toBe(before + 2);
  });
});

describe('progression: special units', () => {
  it('engineers capture enemy buildings and repair friendly ones', () => {
    const g = ra();
    const plant = g.spawnStructure('s-power', 1, 30, 30);
    const eng = unit(g, 'engineer', 0, 28, 30);
    g.enqueue(0, { t: 'enter', ids: [eng.id], target: plant.id });
    run(g, 200, () => plant.owner === 0);
    expect(plant.owner).toBe(0);
    run(g, 2);
    expect(g.entities.has(eng.id)).toBe(false);

    const own = g.spawnStructure('a-power', 0, 20, 30);
    own.hp = 100;
    const eng2 = unit(g, 'engineer', 0, 23, 30);
    g.enqueue(0, { t: 'enter', ids: [eng2.id], target: own.id });
    run(g, 200, () => own.hp === own.maxHp);
    expect(own.hp).toBe(own.maxHp);
  });

  it('spies steal half the credits from a refinery and black out power plants', () => {
    const g = ra();
    const [a, s] = g.players;
    const ref = g.spawnStructure('s-refinery', 1, 30, 30);
    s.credits = 4000; const start = a.credits;
    const spy = unit(g, 'spy', 0, 28, 31);
    g.enqueue(0, { t: 'enter', ids: [spy.id], target: ref.id });
    run(g, 200, () => s.credits < 4000);
    expect(s.credits).toBe(2000);
    expect(a.credits).toBe(start + 2000);

    const tesla = g.spawnStructure('s-power', 1, 34, 13);
    const spy2 = unit(g, 'spy', 0, 32, 13);
    g.enqueue(0, { t: 'enter', ids: [spy2.id], target: tesla.id });
    run(g, 200, () => s.blackoutUntil > 0);
    run(g, 1);
    expect(s.blackoutUntil).toBeGreaterThan(g.tick);
    expect(g.lowPower(1)).toBe(true);
  });

  it('a terror drone rides inside a vehicle until it is destroyed, then hops out', () => {
    const g = ra();
    const drone = unit(g, 'terrordrone', 1, 30, 30), tank = unit(g, 'grizzly', 0, 33, 30);
    g.enqueue(1, { t: 'attack', ids: [drone.id], target: tank.id });
    run(g, 120, () => drone.carriedBy === tank.id);
    expect(tank.drone).toBe(drone.id);
    run(g, 600, () => tank.hp <= 0);
    expect(tank.hp).toBe(0);
    run(g, 2);
    expect(drone.hp).toBeGreaterThan(0);
    expect(drone.carriedBy).toBe(0);
  });

  it('Yuri holds one mind permanently and frees it when he dies', () => {
    const g = ra();
    const yuri = unit(g, 'yuri', 1, 30, 30), tank = unit(g, 'grizzly', 0, 34, 30), other = unit(g, 'grizzly', 0, 30, 34);
    g.enqueue(1, { t: 'attack', ids: [yuri.id], target: tank.id });
    run(g, 200, () => tank.owner === 1);
    expect(tank.owner).toBe(1);
    expect(yuri.controls).toBe(tank.id);
    run(g, 2000);
    expect(tank.owner).toBe(1); // permanent while Yuri lives
    expect(other.owner).toBe(0); // and only one at a time
    g.damage(yuri, yuri.hp, 0);
    run(g, 2);
    expect(tank.owner).toBe(0);
  });

  it('C4: Tanya destroys a building at arm\'s length', () => {
    const g = ra();
    const plant = g.spawnStructure('s-power', 1, 30, 30);
    const tanya = unit(g, 'tanya', 0, 26, 30);
    g.enqueue(0, { t: 'attack', ids: [tanya.id], target: plant.id });
    run(g, 300, () => plant.hp <= 0);
    expect(plant.hp).toBe(0);
    expect(tanya.hp).toBeGreaterThan(0);
  });

  it('deploying a G.I. digs in with a stronger weapon; moving packs up again', () => {
    const g = ra();
    const gi = unit(g, 'gi', 0, 30, 30);
    expect(g.weaponOf(gi)?.id).toBe('m60');
    g.enqueue(0, { t: 'deploy', ids: [gi.id] });
    g.step();
    expect(gi.deployed).toBe(true);
    expect(g.weaponOf(gi)?.id).toBe('sandbags');
    g.enqueue(0, { t: 'move', ids: [gi.id], x: 32, y: 30 });
    g.step();
    expect(gi.deployed).toBe(false);
  });

  it('veterancy: kills earn ranks, and ranks add firepower', () => {
    const g = ra();
    const rhino = unit(g, 'rhino', 1, 30, 30);
    for (let i = 0; i < 3; i++) g.damage(unit(g, 'grizzly', 0, 20 + i, 20), 9999, 1, rhino.id);
    expect(rhino.rank).toBe(1);
    for (let i = 0; i < 3; i++) g.damage(unit(g, 'grizzly', 0, 20 + i, 22), 9999, 1, rhino.id);
    expect(rhino.rank).toBe(2);
    expect(g.effects.some(e => e.kind === 'promote')).toBe(true);
  });
});

describe('progression: air and sea', () => {
  it('Harriers strike with limited ammo, then fly home to rearm; only anti-air can hit them', () => {
    const g = ra();
    const pad = g.spawnStructure('a-radar', 0, 10, 10);
    g.spawnStructure('a-power', 0, 14, 10);
    const target = g.spawnStructure('s-power', 1, 40, 40);
    const jet = unit(g, 'harrier', 0, 11, 10);
    expect(jet.ammo).toBe(2);
    g.enqueue(0, { t: 'attack', ids: [jet.id], target: target.id });
    run(g, 400, () => jet.ammo === 0);
    expect(jet.ammo).toBe(0);
    run(g, 200);
    expect(target.hp).toBeLessThan(target.maxHp);
    run(g, 800, () => jet.order === 'idle' && jet.ammo === 2);
    expect(jet.ammo).toBe(2);
    expect(g.distTo(jet.x, jet.y, pad)).toBe(0);
    const rhino = unit(g, 'rhino', 1, 13, 13), flak = unit(g, 'flaktrack', 1, 14, 14);
    expect(g.canEngage(rhino, jet)).toBe(false);
    expect(g.canEngage(flak, jet)).toBe(true);
  });

  it('Dune Carryalls airlift harvesters on long trips', () => {
    const g = dune();
    g.spawnStructure('refinery', 0, 8, 8);
    const harv = unit(g, 'harvester', 0, 40, 44);
    harv.cargo = 100; harv.cargoValue = 700; harv.hstate = 'toRefinery';
    unit(g, 'carryall', 0, 12, 12);
    let lifted = false;
    run(g, 900, () => { lifted ||= harv.carriedBy > 0; return lifted && !harv.carriedBy && harv.cargo < 100; });
    expect(lifted).toBe(true);
    expect(harv.cargo).toBeLessThan(100);
  });

  it('shipyards float on water and launch ships that stay at sea', () => {
    const g = ra(['america', 'russia'], 'cold-strait');
    const p = g.players[0];
    g.spawnStructure('a-power', 0, 16, 10);
    g.spawnStructure('a-refinery', 0, 12, 4);
    g.spawnStructure('a-barracks', 0, 16, 14);
    expect(g.canPlace(p, 'a-yard', 20, 10)).toBe(true);
    expect(g.canPlace(p, 'a-yard', 15, 17)).toBe(false);
    g.spawnStructure('a-yard', 0, 20, 10);
    expect(g.buildOptions(p, 'naval')).toContain('destroyer');
    g.enqueue(0, { t: 'build', item: 'destroyer' });
    run(g, 1500, () => all(g, 'destroyer', 0).length > 0);
    const [ship] = all(g, 'destroyer', 0);
    expect(ship).toBeDefined();
    g.enqueue(0, { t: 'move', ids: [ship.id], x: 10, y: 10 });
    run(g, 200);
    expect(g.pack.terrains[g.map.terrain[g.cellOf(ship)]].water).toBe(true);
  });
});

describe('progression: support powers', () => {
  it('Paratroopers land at the target', () => {
    const g = ra();
    const hq = g.spawnStructure('a-radar', 0, 10, 10);
    hq.charge = g.superweaponOf(hq)!.charge;
    const before = all(g, 'gi', 0).length;
    g.enqueue(0, { t: 'super', id: hq.id, x: 30, y: 30 });
    run(g, 70);
    const dropped = all(g, 'gi', 0).filter(e => Math.abs(cellX(e) - 30) <= 4 && Math.abs(cellY(e) - 30) <= 4);
    expect(all(g, 'gi', 0).length).toBe(before + 8);
    expect(dropped.length).toBe(8);
  });

  it('the Chronosphere moves vehicles and kills infantry; it needs a destination', () => {
    const g = ra();
    const sphere = g.spawnStructure('a-chrono', 0, 10, 20);
    sphere.charge = g.superweaponOf(sphere)!.charge;
    const tank = unit(g, 'grizzly', 0, 30, 30), gi = unit(g, 'gi', 0, 31, 30);
    g.enqueue(0, { t: 'super', id: sphere.id, x: 30, y: 30 });
    g.step();
    expect(sphere.charge).toBeGreaterThan(0); // no destination: nothing happens
    g.enqueue(0, { t: 'super', id: sphere.id, x: 30, y: 30, x2: 40, y2: 12 });
    run(g, 50);
    expect(Math.abs(cellX(tank) - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(cellY(tank) - 12)).toBeLessThanOrEqual(2);
    expect(gi.hp).toBe(0);
  });

  it('the Iron Curtain makes vehicles invulnerable and kills infantry', () => {
    const g = ra();
    const curtain = g.spawnStructure('s-curtain', 1, 50, 50);
    curtain.charge = g.superweaponOf(curtain)!.charge;
    const rhino = unit(g, 'rhino', 1, 30, 30), conscript = unit(g, 'conscript', 1, 31, 30);
    g.enqueue(1, { t: 'super', id: curtain.id, x: 30, y: 30 });
    run(g, 35);
    expect(conscript.hp).toBe(0);
    const hp = rhino.hp;
    g.damage(rhino, 5000, 0);
    expect(rhino.hp).toBe(hp);
    run(g, 460);
    g.damage(rhino, 50, 0);
    expect(rhino.hp).toBe(hp - 50);
  });

  it('a Gap Generator shrouds its area from the enemy', () => {
    const g = ra();
    g.spawnStructure('a-power', 0, 26, 26);
    g.spawnStructure('a-gap', 0, 30, 30);
    unit(g, 'rhino', 1, 33, 30);
    run(g, 8);
    const i = g.cellIndex(30, 30);
    expect(g.players[1].visible[i]).toBe(0);
    expect(g.players[1].explored[i]).toBe(0);
    expect(g.players[0].visible[i]).toBe(1);
  });
});

describe('progression: the AI climbs the tech tree', () => {
  it('RA2: an AI reaches the Battle Lab; Dune: an AI buys an upgrade', () => {
    const ra2 = new Game({ pack: ra2Pack, mapId: 'temperate-valley', seed: 3, players: [{ name: 'A', faction: 'america', ai: true }, { name: 'B', faction: 'russia', ai: true }] });
    run(ra2, 15 * 60 * 12, () => all(ra2, 'a-lab').length + all(ra2, 's-lab').length > 0);
    expect(all(ra2, 'a-lab').length + all(ra2, 's-lab').length).toBeGreaterThan(0);
    const d = new Game({ pack: dunePack, mapId: 'arrakis-basin', seed: 3, players: [{ name: 'A', faction: 'atreides', ai: true }, { name: 'B', faction: 'ordos', ai: true }] });
    run(d, 15 * 60 * 12, () => d.players.some(p => Object.keys(p.upgrades).length > 0));
    expect(d.players.some(p => Object.keys(p.upgrades).length > 0)).toBe(true);
  });
});
