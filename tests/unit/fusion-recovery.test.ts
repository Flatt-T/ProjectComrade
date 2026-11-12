// PW12: sell-for-credit evacuation and protected MCV recovery in the persistent
// engine. The durable evaluator mirrors its decisions as journaled commands:
// `grantRecovery` spawns the bound, zero-value recovery MCV exactly once;
// `setRecovery` restricts rebuilding to the profile's recovery roles with a
// single harvester and caps banked credits; attacking another player while
// recovering sets the flag the evaluator reads to end the episode. Recovery
// protection is entity-scoped: the MCV and permitted rebuilds are protected,
// surviving units are not.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame, LEPTONS, isHarvesterUnit,
  type GameSetup, type MmoTuning,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td'
const RECOVERY_ROLES = ['construction-yard', 'power', 'refinery', 'barracks'];

const TUNING: MmoTuning = {
  structureHpMultiplier: 1, supplyCap: 0, upkeepPerPointPerMinute: 0,
  maxCompounds: 0, recoveryCreditCap: 5000, recoveryBuildRoles: RECOVERY_ROLES,
};

function setup(mmo?: MmoTuning, players = 1): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent: true,
    ...(mmo ? { mmo } : {}),
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

function grantRecovery(g: Game, slot = 0, cell = -1) {
  g.enqueue(-1, { t: 'grantRecovery', slot, cell });
  g.step();
}

function setRecovery(g: Game, on: boolean, slot = 0) {
  g.enqueue(-1, { t: 'setRecovery', slot, on });
  g.step();
}

function ownEntities(g: Game, slot: number, kind?: 'unit' | 'structure') {
  return [...g.entities.values()].filter(e => e.owner === slot && e.hp > 0 && (!kind || e.kind === kind));
}

/** Simulate the evacuated base: every entity the slot owns is gone. */
function wipeSlot(g: Game, slot: number) {
  for (const e of [...g.entities.values()]) if (e.owner === slot) g.entities.delete(e.id);
}

describe('PW12 recovery grant', () => {
  it('spawns one bound, protected, faction MCV — a replayed grant never duplicates', () => {
    const g = new Game(setup());
    wipeSlot(g, 0); // evacuated: the preset army is gone
    grantRecovery(g);
    const mcvs = ownEntities(g, 0, 'unit').filter(u => u.bound === 2);
    expect(mcvs.length).toBe(1);
    expect(mcvs[0].recoveryProtected).toBe(true);
    expect(mcvs[0].type).toBe('mcv');
    // Second grant: the live MCV makes it a no-op.
    grantRecovery(g);
    expect(ownEntities(g, 0, 'unit').filter(u => u.bound === 2).length).toBe(1);
  });

  it('honours an explicit spawn cell and survives snapshot/restore', () => {
    const g = new Game(setup());
    wipeSlot(g, 0);
    const cell = 30 * PACK.maps[0].width + 30;
    grantRecovery(g, 0, cell);
    const mcv = ownEntities(g, 0, 'unit').find(u => u.bound === 2)!;
    expect(Math.floor(mcv.y / LEPTONS)).toBe(Math.floor(cell / PACK.maps[0].width));
    const r = restoreGame(captureGame(g, { seed: 47 }), [PACK]);
    const rm = [...r.entities.values()].find(e => e.owner === 0 && e.bound === 2)!;
    expect(rm.recoveryProtected).toBe(true);
    // Player recovery state round-trips too.
    setRecovery(g, true);
    const r2 = restoreGame(captureGame(g, { seed: 47 }), [PACK]);
    expect(r2.players[0].recovering).toBe(true);
    expect(r2.players[0].recoveryAttacked).toBe(false);
  });
});

describe('PW12 recovery build rules', () => {
  // fact=yard, proc=refinery, weap=vehicle plant (pre-recovery survivors used
  // only to satisfy production prerequisites — the gate still applies).
  function recoveringBase() {
    const g = new Game(setup(TUNING));
    wipeSlot(g, 0);
    grantRecovery(g);
    setRecovery(g, true);
    g.spawnStructure('fact', 0, 40, 40);
    g.spawnStructure('proc', 0, 44, 40);
    g.spawnStructure('weap', 0, 48, 40);
    // The refinery's free harvester already saturates the one-harvester rule;
    // retire it so the cap itself is what the assertions measure.
    for (const e of [...g.entities.values()]) {
      if (e.owner === 0 && e.kind === 'unit' && isHarvesterUnit(g.unitDef(e))) g.entities.delete(e.id);
    }
    return g;
  }

  it('permits only whitelisted roles and a single harvester', () => {
    const g = recoveringBase();
    const p = g.players[0];
    expect(g.canBuild(p, 'nuke')).toBe(true);   // power role
    expect(g.canBuild(p, 'silo')).toBe(false);  // no recovery role
    // Units: harvesters only, capped at one live-or-queued.
    expect(g.canBuild(p, 'harvester')).toBe(true);
    p.queues.vehicle.items.push('harvester');
    expect(g.canBuild(p, 'harvester')).toBe(false);
    p.queues.vehicle.items.length = 0;
    expect(g.canBuild(p, 'humvee')).toBe(false); // combat unit never rebuildable
  });

  it('the role gate applies at placement too, and placed rebuilds are protected', () => {
    const g = recoveringBase();
    const p = g.players[0];
    // A denied structure queued before the gate still cannot be placed.
    p.queues.structure.items.push('silo');
    p.queues.structure.ready = true;
    g.enqueue(0, { t: 'place', item: 'silo', x: 60, y: 40 });
    g.step();
    expect(ownEntities(g, 0, 'structure').some(e => e.type === 'silo')).toBe(false);
    // A permitted structure places and carries recovery protection. The denied
    // item is still queued ahead, so clear the tab first.
    p.queues.structure.items.length = 0;
    p.queues.structure.items.push('nuke');
    p.queues.structure.ready = true;
    g.enqueue(0, { t: 'place', item: 'nuke', x: 52, y: 44 });
    g.step();
    const nuke = ownEntities(g, 0, 'structure').find(e => e.type === 'nuke')!;
    expect(nuke.recoveryProtected).toBe(true);
    // Ending recovery clears every entity flag at once.
    setRecovery(g, false);
    for (const e of g.entities.values()) {
      if (e.owner === 0) expect(e.recoveryProtected).toBe(false);
    }
    expect(g.players[0].recovering).toBe(false);
  });
});

describe('PW12 recovery combat and assets', () => {
  it('a recovering player attacking another player flags recoveryAttacked; the protected MCV cannot fire', () => {
    const g = new Game(setup(TUNING, 2));
    wipeSlot(g, 0);
    grantRecovery(g, 0);
    setRecovery(g, true, 0);
    const enemy = g.spawnUnit('humvee', 1, 40 * PACK.maps[0].width + 60);
    const mcv = ownEntities(g, 0, 'unit').find(u => u.bound === 2)!;
    mcv.x = enemy.x - LEPTONS * 2; mcv.y = enemy.y;
    const hp = enemy.hp;
    g.damage(enemy, 10, 0, mcv.id);
    expect(enemy.hp).toBe(hp);                    // protected entity deals nothing
    expect(g.players[0].recoveryAttacked).toBe(false);
    // An unprotected surviving unit of the recovering player still fights —
    // and its damage is what ends the episode.
    const survivor = g.spawnUnit('humvee', 0, 40 * PACK.maps[0].width + 62);
    survivor.x = enemy.x - LEPTONS; survivor.y = enemy.y;
    g.damage(enemy, 10, 0, survivor.id);
    expect(enemy.hp).toBeLessThan(hp);
    expect(g.players[0].recoveryAttacked).toBe(true);
  });

  it('bound recovery assets cannot be sold or transferred', () => {
    const g = new Game(setup(TUNING, 2));
    wipeSlot(g, 0);
    grantRecovery(g, 0);
    const mcv = ownEntities(g, 0, 'unit').find(u => u.bound === 2)!;
    const credits = g.players[0].credits;
    g.enqueue(0, { t: 'sell', id: mcv.id });
    g.step();
    expect(g.entities.get(mcv.id)?.hp).toBeGreaterThan(0);
    expect(g.players[0].credits).toBe(credits);
    // PW26: a transfer would launder the binding onto another account.
    const free = g.spawnUnit('humvee', 0, 40 * PACK.maps[0].width + 70);
    g.enqueue(0, { t: 'transfer', ids: [mcv.id, free.id], to: 1 });
    g.step();
    expect(g.entities.get(mcv.id)?.owner).toBe(0);
    expect(g.entities.get(free.id)?.owner).toBe(1);
  });
});
