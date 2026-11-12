// PW14: packed buildings — a deployed structure morphs into its dedicated
// carrier (same entity id, same durable asset identity), moves as an unarmed
// vehicle, and redeploys at a valid site. Damage, ownership bindings and the
// superweapon zero-charge rule (D6) survive every transition; an illegal
// unpack leaves the carrier untouched — never a loss or a duplicate.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame, LEPTONS, withPackedCarriers,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 5000, recoveryBuildRoles: [],
};

function setup(players = 1): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent: true, mmo: TUNING,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

// Pack/unpack are owner-issued sim commands (slot = owning player), matching how
// the world handler returns them — slot -1 is reserved for journaled roster ops.
function pack(g: Game, id: number, slot = 0) { g.enqueue(slot, { t: 'pack', id }); g.step(); }
function unpack(g: Game, id: number, x: number, y: number, slot = 0) { g.enqueue(slot, { t: 'unpack', id, x, y }); g.step(); }

/** A free 3x3-ish site near the map centre, returned as top-left cell coords. */
function openSite(g: Game, w: number, h: number): { x: number; y: number } {
  const mw = g.map.w;
  for (let cy = 2; cy < g.map.h - h - 2; cy++) {
    for (let cx = 2; cx < mw - w - 2; cx++) {
      let free = true;
      for (let y = cy; y < cy + h && free; y++) for (let x = cx; x < cx + w && free; x++) {
        const i = y * mw + x;
        if (g.map.occupied[i] || !g.canPlace(g.players[0], 'fact', cx, cy, true)) free = false;
      }
      if (free) return { x: cx, y: cy };
    }
  }
  throw new Error('no open site');
}

describe('PW14 pack/unpack morph', () => {
  it('carrier defs exist per packable archetype and are unbuildable', () => {
    // Carriers are synthesized only for persistent games — raw packs stay clean
    // so classic matches, mashups and audio catalogs never see them.
    expect(PACK.units['pack_pyle']).toBeUndefined();
    const augmented = withPackedCarriers(PACK);
    expect(augmented.units['pack_pyle']?.packedCarrier).toBe('pyle');
    expect(augmented.units['pack_eye']?.packedCarrier).toBe('eye'); // superweapon facility
    expect(augmented.units['pack_sbag']).toBeUndefined(); // walls have no carrier
    const g = new Game(setup());
    expect(g.pack.units['pack_pyle']?.packedCarrier).toBe('pyle');
    expect(g.buildOptions(g.players[0], 'vehicle')).not.toContain('pack_pyle');
  });

  it('pack preserves entity id, health and ownership; frees footprint and storage', () => {
    const g = new Game(setup());
    const p = g.players[0];
    const before = p.storage;
    const s = g.spawnStructure('proc', 0, 5, 5);
    s.hp = Math.floor(s.maxHp / 2);
    const storageAfterBuild = p.storage;
    expect(storageAfterBuild).toBe(before + (PACK.structures.proc.storage ?? 0));

    pack(g, s.id);
    const e = g.entities.get(s.id)!;
    expect(e).toBeDefined();
    expect(e.id).toBe(s.id); // same sim id → same durable asset id
    expect(e.kind).toBe('unit');
    expect(e.type).toBe('pack_proc');
    expect(e.packedType).toBe('proc');
    expect(e.owner).toBe(0);
    expect(e.hp).toBe(s.hp);
    expect(e.maxHp).toBe(s.maxHp);
    // Footprint freed, storage/power dropped.
    for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++) {
      expect(g.map.occupied[y * g.map.w + x]).toBe(0);
    }
    expect(p.storage).toBe(storageAfterBuild - (PACK.structures.proc.storage ?? 0));
    // Unarmed carrier: no weapon, mobile unit semantics.
    expect(g.weaponOf(e)).toBeUndefined();
    expect(g.unitDef(e).packedCarrier).toBe('proc');
    expect(g.unitDef(e).harvester).toBeUndefined();
  });

  it('unpack restores the same building at a valid site with damage intact', () => {
    const g = new Game(setup());
    const p = g.players[0];
    const s = g.spawnStructure('pyle', 0, 5, 5);
    s.hp = Math.floor(s.maxHp * 0.4);
    const hpBefore = s.hp;
    pack(g, s.id);
    const carrier = g.entities.get(s.id)!;
    // Walk the carrier next to an open site, then unpack there.
    const site = openSite(g, 2, 2);
    // Put the carrier inside the footprint-adjacent band the engine accepts.
    carrier.x = (site.x + 1) * LEPTONS; carrier.y = (site.y + 1) * LEPTONS;
    const storageBefore = p.storage;
    unpack(g, s.id, site.x, site.y);
    const e = g.entities.get(s.id)!;
    expect(e.kind).toBe('structure');
    expect(e.type).toBe('pyle');
    expect(e.packedType).toBe('');
    expect(e.cx).toBe(site.x);
    expect(e.cy).toBe(site.y);
    expect(e.hp).toBe(hpBefore); // damage carried through every form
    expect(p.storage).toBe(storageBefore + 0); // pyle has no storage
    for (let y = site.y; y < site.y + 2; y++) for (let x = site.x; x < site.x + 2; x++) {
      expect(g.map.occupied[y * g.map.w + x]).toBe(s.id);
    }
  });

  it('an occupied or unreachable site denies unpack without losing the carrier', () => {
    const g = new Game(setup());
    const s = g.spawnStructure('weap', 0, 5, 5);
    pack(g, s.id);
    const carrier = g.entities.get(s.id)!;
    // Block every footprint cell with another structure.
    const blocker = g.spawnStructure('nuke', 0, 20, 20);
    void blocker;
    // Unpack far from the carrier: proximity fails first.
    unpack(g, s.id, 30, 30);
    expect(g.entities.get(s.id)!.packedType).toBe('weap');
    expect(g.entities.get(s.id)!.kind).toBe('unit');
    // Unpack on top of the blocker's footprint: canPlace fails, carrier stays.
    carrier.x = 20 * LEPTONS + LEPTONS; carrier.y = 20 * LEPTONS + LEPTONS;
    unpack(g, s.id, 20, 20);
    const e = g.entities.get(s.id)!;
    expect(e.packedType).toBe('weap');
    expect(e.kind).toBe('unit');
    expect(e.hp).toBe(s.hp);
  });

  it('superweapon charge is zero while packed and on redeploy (D6)', () => {
    const g = new Game(setup());
    const s = g.spawnStructure('tmpl', 0, 5, 5);
    s.charge = 4000; // nearly charged
    pack(g, s.id);
    const carrier = g.entities.get(s.id)!;
    expect(carrier.charge).toBe(0);
    // Charge cannot accrue while packed — carriers are units, not structures.
    for (let i = 0; i < 30; i++) g.step();
    expect(g.entities.get(s.id)!.charge).toBe(0);
    const site = openSite(g, 3, 3);
    carrier.x = (site.x + 1) * LEPTONS; carrier.y = (site.y + 1) * LEPTONS;
    unpack(g, s.id, site.x, site.y);
    expect(g.entities.get(s.id)!.charge).toBe(0);
    // And it stays zero until the normal charge loop runs again.
    expect(g.entities.get(s.id)!.kind).toBe('structure');
  });

  it('bound structures, walls and water builds refuse to pack', () => {
    const g = new Game(setup());
    const bound = g.spawnStructure('fact', 0, 5, 5);
    bound.bound = 1;
    pack(g, bound.id);
    expect(g.entities.get(bound.id)!.kind).toBe('structure');

    const wall = g.spawnStructure('sbag', 0, 12, 12);
    pack(g, wall.id);
    expect(g.entities.get(wall.id)!.kind).toBe('structure');
    expect(g.entities.get(wall.id)!.type).toBe('sbag');

    // Classic matches have no pack command at all.
    const classic = new Game({ ...setup(), persistent: false });
    const cs = classic.spawnStructure('pyle', 0, 5, 5);
    classic.enqueue(0, { t: 'pack', id: cs.id });
    classic.step();
    expect(classic.entities.get(cs.id)!.kind).toBe('structure');
  });

  it('carrier survives snapshot/restore with its packed identity', () => {
    const g = new Game(setup());
    const s = g.spawnStructure('afld', 0, 5, 5);
    s.hp = 123;
    pack(g, s.id);
    const r = restoreGame(captureGame(g, { seed: 47 }), [PACK]);
    const e = r.entities.get(s.id)!;
    expect(e.kind).toBe('unit');
    expect(e.type).toBe('pack_afld');
    expect(e.packedType).toBe('afld');
    expect(e.hp).toBe(123);
    // And it can still unpack after restore.
    const site = openSite(r, 4, 2);
    e.x = (site.x + 2) * LEPTONS; e.y = (site.y + 1) * LEPTONS;
    unpack(r, s.id, site.x, site.y);
    expect(r.entities.get(s.id)!.kind).toBe('structure');
    expect(r.entities.get(s.id)!.type).toBe('afld');
  });

  it('a destroyed carrier loses the building with it — no ghost structure', () => {
    const g = new Game(setup());
    const s = g.spawnStructure('silo', 0, 5, 5);
    pack(g, s.id);
    const carrier = g.entities.get(s.id)!;
    carrier.hp = 0;
    g.step(); // cleanup removes it
    expect(g.entities.get(s.id)).toBeUndefined();
    // Nothing was left occupying the old footprint or holding storage.
    for (let y = 5; y < 6; y++) for (let x = 5; x < 7; x++) {
      expect(g.map.occupied[y * g.map.w + x]).toBe(0);
    }
    expect(g.players[0].storage).toBe(0);
  });
});
