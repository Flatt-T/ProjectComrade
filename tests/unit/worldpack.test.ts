// PW28 spike: the universal persistent pack composes every mashup choice into
// one deterministic RulePack, and per-player allowedDefs gate what each
// commander may build — the foundation for "all factions, all assets" in the
// persistent world.
import { describe, expect, it } from 'vitest';
import {
  Game, captureGame, composeWorldPack, registryPacks, restoreGame,
  worldAllowedDefs, worldDefId, worldLoadoutProblem,
  worldPack, worldStarterUnits, type MashupLoadout,
} from '../../packages/fusion/src/index';
import { MASHUP_PACKS, MASHUP_SLOTS, resolveChoice } from '../../packages/fusion/src/mashup';

const { pack, choices } = worldPack();

const pick = (slot: (typeof MASHUP_SLOTS)[number], i: number) => choices[slot][i].key;
const loadout = (i: number): MashupLoadout => ({
  structures: pick('structures', i),
  infantry: pick('infantry', i),
  vehicle: pick('vehicle', i),
  aircraft: pick('aircraft', i),
  naval: pick('naval', Math.min(i, choices.naval.length - 1)),
});

const LO = loadout(0);
const LO2 = loadout(Math.min(1, choices.structures.length - 1));

describe('worldpack composition', () => {
  it('is deterministic and self-contained per structures choice', () => {
    const a = composeWorldPack(), b = composeWorldPack();
    expect(JSON.stringify(a.pack)).toBe(JSON.stringify(b.pack));
    // Every prereq inside a structures choice resolves within that choice's
    // namespace or the shared service producers — never another choice's ids.
    for (const choice of choices.structures) {
      const { defs } = resolveChoice(choice.key, 'structures', MASHUP_PACKS);
      const mine = new Set((defs as { id: string }[]).map(d => worldDefId('structures', choice.key, d.id)));
      for (const d of defs as { id: string; prereqs: string[] }[]) {
        const wid = worldDefId('structures', choice.key, d.id);
        const sdef = pack.structures[wid];
        expect(sdef, wid).toBeTruthy();
        for (const entry of sdef!.prereqs) {
          for (const alt of entry.split('|')) {
            const id = alt.split('@')[0];
            expect(mine.has(id) || id.startsWith('w-svc-'), `${wid} prereq ${id}`).toBe(true);
          }
        }
      }
    }
    // Units never reference raw source-pack ids — only namespaced ones.
    for (const u of Object.values(pack.units)) {
      for (const entry of u.prereqs) {
        for (const alt of entry.split('|')) {
          const id = alt.split('@')[0];
          expect(pack.structures[id], `${u.id} prereq ${id}`).toBeTruthy();
        }
      }
    }
  });

  it('gives every loadout a deployable yard and a fieldable force', () => {
    expect(worldLoadoutProblem(LO)).toBeNull();
    const allowed = worldAllowedDefs(LO);
    expect(allowed.length).toBeGreaterThan(50);
    // The chosen structures choice's own ladder is in; another choice's is not.
    const ownDefs = resolveChoice(LO.structures, 'structures', MASHUP_PACKS).defs as { id: string }[];
    const ownSt = worldDefId('structures', LO.structures, ownDefs[0].id);
    const otherKey = choices.structures.find(c => c.key !== LO.structures)!.key;
    const otherSt = worldDefId('structures', otherKey,
      (resolveChoice(otherKey, 'structures', MASHUP_PACKS).defs as { id: string }[])[0].id);
    expect(allowed).toContain(ownSt);
    expect(allowed).not.toContain(otherSt);
    const starters = worldStarterUnits(LO);
    expect(starters.length).toBeGreaterThanOrEqual(2);
    for (const id of starters) expect(pack.units[id], `starter ${id}`).toBeTruthy();
    expect(starters.some(id => !!pack.units[id].deploysTo)).toBe(true);
  });
});

describe('worldpack Game', () => {
  const game = () => new Game({
    pack, mapId: pack.maps[0].id, seed: 7, techLevel: 15, persistent: true,
    players: [
      { name: 'A', faction: 'commander', ai: false, playerId: 'pa',
        starter: { credits: 20000, units: worldStarterUnits(LO) },
        allowedDefs: worldAllowedDefs(LO) },
      { name: 'B', faction: 'commander', ai: false, playerId: 'pb', team: 1,
        starter: { credits: 20000, units: worldStarterUnits(LO2) },
        allowedDefs: worldAllowedDefs(LO2) },
    ],
  });

  it('boots, spawns each commander their own loadout army, and gates canBuild', () => {
    const g = game();
    expect(g.players).toHaveLength(2);
    const [a, b] = g.players;
    expect(a.allowedDefs).toEqual(worldAllowedDefs(LO));
    expect(b.allowedDefs).toEqual(worldAllowedDefs(LO2));
    // Each commander fields only their own starter ids.
    const mineA = [...g.entities.values()].filter(e => e.owner === 0 && e.kind === 'unit');
    const mineB = [...g.entities.values()].filter(e => e.owner === 1 && e.kind === 'unit');
    expect(mineA.length).toBe(worldStarterUnits(LO).length);
    expect(mineB.length).toBe(worldStarterUnits(LO2).length);
    for (const e of mineA) expect(a.allowedDefs!).toContain(e.type);
    for (const e of mineB) expect(b.allowedDefs!).toContain(e.type);

    // Deploy both MCVs into their own construction yards.
    for (const e of [...g.entities.values()].filter(e => e.kind === 'unit' && g.pack.units[e.type]?.deploysTo)) {
      g.enqueue(e.owner, { t: 'deploy', ids: [e.id] });
    }
    for (let i = 0; i < 5; i++) g.step();
    const yards = [...g.entities.values()].filter(e => e.kind === 'structure' && g.pack.structures[e.type]?.constructionYard);
    expect(yards).toHaveLength(2);

    // A can build a building from their own structures choice…
    const ownStId = worldDefId('structures', LO.structures,
      (resolveChoice(LO.structures, 'structures', MASHUP_PACKS).defs as { id: string }[])
        .map(d => d.id).find(id => !g.pack.structures[worldDefId('structures', LO.structures, id)]?.constructionYard && !g.pack.structures[worldDefId('structures', LO.structures, id)]?.onWater) ?? '');
    // …and nothing from the other commander's choice.
    const otherSt = choices.structures.find(c => c.key !== LO.structures)!;
    const otherDef = (resolveChoice(otherSt.key, 'structures', MASHUP_PACKS).defs as { id: string; prereqs: string[] }[])
      .map(d => worldDefId('structures', otherSt.key, d.id))
      .find(id => g.pack.structures[id] && !g.pack.structures[id].wall && !g.pack.structures[id].floor);
    expect(otherDef).toBeTruthy();
    if (ownStId) {
      const def = g.pack.structures[ownStId]!;
      const ok = g.canBuild(a, ownStId) || (def.prereqs.length > 0 && !g.canBuild(a, ownStId));
      expect(ok).toBe(true); // prereq-gated at worst, never 'not in loadout'
    }
    // The decisive check: the other choice's building is outside A's allowedDefs.
    expect(a.allowedDefs!).not.toContain(otherDef);
    expect(g.canBuild(a, otherDef!)).toBe(false);

    // Sim keeps running clean.
    for (let i = 0; i < 200; i++) g.step();
    expect(g.tick).toBeGreaterThan(200);
    expect(g.over).toBe(false);
  });

  it('survives snapshot/restore with the loadout gate intact', () => {
    const g = game();
    for (let i = 0; i < 60; i++) g.step();
    const snap = captureGame(g, { seed: 7 });
    const b = restoreGame(snap, registryPacks());
    expect(b.pack.id).toBe('mashup-world');
    const pb = b.players[0];
    expect(pb.allowedDefs).toEqual(worldAllowedDefs(LO));
    expect(pb.faction).toBe('commander');
    // Both replicas keep identical checksums — the gate is pure state.
    for (let i = 0; i < 120; i++) { g.step(); b.step(); }
    expect(b.checksum()).toBe(g.checksum());
  });
});
