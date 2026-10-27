import { describe, expect, it } from 'vitest';
import { STYLES } from '../../packages/contracts/src/index';
import { FUSIONS, Game, PACKS, conquerPack, factionCanUse, leviathanPack } from '../../packages/fusion/src/index';

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
