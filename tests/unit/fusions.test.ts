import { describe, expect, it } from 'vitest';
import { STYLES } from '../../packages/contracts/src/index';
import { FUSIONS, Game, PACKS, leviathanPack } from '../../packages/fusion/src/index';

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
