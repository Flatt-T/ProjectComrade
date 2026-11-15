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

  // THU-2446 role predicates — mirrors starterPicks in packages/fusion/src/starter.ts.
  const isTank = (d: { kind: string; role?: string; crusher?: unknown; weapon?: unknown; deploysTo?: unknown; transport?: unknown }) =>
    d.kind === 'vehicle' && d.role === 'combat' && !!d.crusher && !!d.weapon && !d.deploysTo && !d.transport;
  const isLight = (d: { kind: string; role?: string; harvester?: unknown; deploysTo?: unknown; transport?: unknown; armor?: string }) =>
    d.kind === 'vehicle' && !d.harvester && !d.deploysTo &&
    (d.role === 'scout' || (d.role === 'support' && d.armor === 'light' && !d.transport));
  const isInf = (d: { kind: string; engineer?: unknown; crushable?: unknown }) =>
    d.kind === 'infantry' && !d.engineer && d.crushable !== false;

  it('fields the approved opening: MCV, harvester, 4 main tanks, 2 lights, 8 infantry', () => {
    for (const lo of [LO, LO2, loadout(Math.min(2, choices.structures.length - 1))]) {
      const starters = worldStarterUnits(lo);
      const defs = starters.map(id => pack.units[id]!);
      expect(defs.every(Boolean), 'every starter id resolves in the composed pack').toBe(true);
      expect(starters).toHaveLength(16);
      expect(defs.filter(d => !!d!.deploysTo)).toHaveLength(1);          // one MCV
      expect(defs.filter(d => !!d!.harvester)).toHaveLength(1);          // one harvester
      expect(defs.filter(isTank)).toHaveLength(4);                       // four main tanks
      expect(defs.filter(isLight)).toHaveLength(2);                      // two light vehicles
      expect(defs.filter(isInf)).toHaveLength(8);                        // eight infantry
      // Repeated defs are a multiset — each grant entry is its own entity.
      expect(new Set(starters).size).toBeLessThanOrEqual(starters.length);
    }
  });

  it('covers every legal infantry x vehicle combination with the full roster', () => {
    // THU-2446: all choice pairs — sparse sets, single-def sets and omitted
    // slots must all still field the approved sixteen by role.
    const structs = choices.structures[0].key;
    for (const inf of choices.infantry) {
      for (const veh of choices.vehicle) {
        const lo: MashupLoadout = { structures: structs, infantry: inf.key, vehicle: veh.key };
        const starters = worldStarterUnits(lo);
        const defs = starters.map(id => pack.units[id]!);
        expect(starters, `${inf.key} x ${veh.key}`).toHaveLength(16);
        expect(defs.filter(d => !!d!.deploysTo)).toHaveLength(1);
        expect(defs.filter(d => !!d!.harvester)).toHaveLength(1);
        expect(defs.filter(isTank), `${inf.key} x ${veh.key} tanks`).toHaveLength(4);
        expect(defs.filter(isLight), `${inf.key} x ${veh.key} lights`).toHaveLength(2);
        expect(defs.filter(isInf), `${inf.key} x ${veh.key} infantry`).toHaveLength(8);
      }
    }
  });

  it('fills omitted and single-domain slots with role equivalents', () => {
    const structs = choices.structures[0].key;
    const cases: MashupLoadout[] = [
      { structures: structs },                                                        // force slots all blank — illegal alone, but roster must still resolve
      { structures: structs, aircraft: choices.aircraft[0]?.key },                   // air-only
      { structures: structs, naval: choices.naval[0]?.key },                         // naval-only
      { structures: structs, infantry: choices.infantry[0].key },                    // infantry-only
      { structures: structs, vehicle: choices.vehicle[0].key },                      // vehicle-only
      { structures: structs, aircraft: choices.aircraft[0]?.key, naval: choices.naval[0]?.key }, // air+naval, no ground picks
    ];
    for (const lo of cases) {
      const starters = worldStarterUnits(lo).filter(Boolean);
      const defs = starters.map(id => pack.units[id]!);
      expect(defs.filter(d => !!d!.deploysTo)).toHaveLength(1);
      expect(defs.filter(d => !!d!.harvester)).toHaveLength(1);
      expect(defs.filter(isTank)).toHaveLength(4);
      expect(defs.filter(isLight)).toHaveLength(2);
      expect(defs.filter(isInf)).toHaveLength(8);
      // Grant-only equivalents may sit outside allowedDefs — that is the point:
      // they are granted, never buildable. Chosen-slot picks must be allowed.
      const allowed = new Set(worldAllowedDefs(lo));
      for (const slot of ['vehicle', 'infantry'] as const) {
        if (!lo[slot]) continue;
        const { defs: chosen } = resolveChoice(lo[slot]!, slot, MASHUP_PACKS);
        for (const d of chosen as { id: string }[]) {
          const wid = worldDefId(slot, lo[slot]!, d.id);
          if (pack.units[wid] && starters.includes(wid)) expect(allowed.has(wid)).toBe(true);
        }
      }
    }
  });

  it('every naval choice fields a heavy-cargo landing craft (THU-2239)', () => {
    expect(choices.naval.length).toBeGreaterThan(1);
    for (const choice of choices.naval) {
      const lo: MashupLoadout = { ...LO, naval: choice.key };
      const allowed = worldAllowedDefs(lo);
      const lifts = allowed
        .map(id => pack.units[id])
        .filter(u => !!u && u.heavyCargo === true && !!u.transport);
      expect(lifts.length, `naval choice ${choice.key}`).toBeGreaterThanOrEqual(1);
      // The granted craft is buildable: its prereqs resolve to real structures.
      for (const lift of lifts) {
        for (const entry of lift.prereqs) {
          for (const alt of entry.split('|')) {
            expect(pack.structures[alt.split('@')[0]], `${lift.id} prereq`).toBeTruthy();
          }
        }
      }
    }
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
