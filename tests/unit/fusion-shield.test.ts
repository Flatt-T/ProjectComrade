// PW10: the compound shield boundary in the persistent engine. An active shield
// admits only its owner, protects everything inside from hostile fire, stops
// protected units from shooting out through the boundary, and survives
// snapshot/restore. Classic matches ignore setShield entirely.
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_PACKS, Game, captureGame, restoreGame, LEPTONS,
  type GameSetup,
} from '../../packages/fusion/src/index';

const PACK = CLASSIC_PACKS[0]; // 'td': construction yard is 'fact'
const SHIELD_CELLS = 4;
const TANK = 'mediumtank';

function setup(persistent: boolean, players = 3): GameSetup {
  return {
    pack: PACK, mapId: PACK.maps[0].id, seed: 47, persistent,
    mmo: persistent ? {
      structureHpMultiplier: 1, supplyCap: 0,
      upkeepPerPointPerMinute: 0, maxCompounds: 0,
      shieldRadiusCells: SHIELD_CELLS,
    } : undefined,
    players: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`, faction: PACK.factions[i % PACK.factions.length].id, ai: false,
    })),
  };
}

function steps(g: Game, n: number) { for (let i = 0; i < n; i++) g.step(); }

/** A shielded construction yard for `owner` centred on cell (cx, cy). */
function compound(g: Game, owner: number, cx = 30, cy = 30) {
  const yard = g.spawnStructure('fact', owner, cx, cy);
  g.enqueue(-1, { t: 'setShield', compound: yard.id, on: true });
  g.step();
  expect(g.entities.get(yard.id)!.shielded).toBe(true);
  return yard;
}

function unitNear(g: Game, type: string, owner: number, cx: number, cy: number) {
  const u = g.spawnUnit(type, owner, g.cellIndex(cx, cy));
  u.x = u.px = cx * LEPTONS + LEPTONS / 2;
  u.y = u.py = cy * LEPTONS + LEPTONS / 2;
  u.path = []; u.order = 'idle';
  return u;
}

/** Distance in cells from a lepton-space entity to a cell centre. */
function distTo(e: { x: number; y: number }, cx: number, cy: number) {
  return Math.hypot(e.x - (cx * LEPTONS + LEPTONS / 2), e.y - (cy * LEPTONS + LEPTONS / 2)) / LEPTONS;
}

describe('PW10 shield admission', () => {
  it('blocks enemy units at the boundary — they can never step inside', () => {
    const g = new Game(setup(true));
    compound(g, 0);
    const enemy = unitNear(g, TANK, 1, 40, 30);
    g.enqueue(1, { t: 'attackMove', ids: [enemy.id], x: 30, y: 30 });
    let minDist = Infinity;
    for (let i = 0; i < 1200; i++) {
      g.step();
      const e = g.entities.get(enemy.id)!;
      const d = distTo(e, 30, 30);
      minDist = Math.min(minDist, d);
      expect(d).toBeGreaterThan(SHIELD_CELLS - 1.5);
    }
    // It closed to the boundary but never crossed it.
    expect(minDist).toBeLessThan(SHIELD_CELLS + 2);
  });

  it('the admission oracle covers owner, ally and outsider correctly', () => {
    const g = new Game(setup(true));
    compound(g, 0);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step();
    const inside = 30 * LEPTONS, insideY = 30 * LEPTONS;
    expect(g.compoundProtecting(inside, insideY, 0)?.owner).toBe(0);
    expect(g.compoundProtecting(inside, insideY, 1)?.owner).toBe(0); // ally
    expect(g.compoundProtecting(inside, insideY, 2)).toBeUndefined(); // outsider
  });
});

describe('PW10 shield protection', () => {
  it('hostile fire into the compound deals no damage', () => {
    const g = new Game(setup(true));
    const yard = compound(g, 0);
    const enemy = unitNear(g, TANK, 1, 37, 30);
    g.enqueue(1, { t: 'attack', ids: [enemy.id], target: yard.id });
    steps(g, 900);
    expect(g.entities.get(yard.id)!.hp).toBe(yard.maxHp);
    expect(g.entities.get(yard.id)!.shielded).toBe(true);
  });

  it('an enemy already inside cannot damage the interior but can leave', () => {
    const g = new Game(setup(true));
    const yard = g.spawnStructure('fact', 0, 30, 30);
    const insider = unitNear(g, TANK, 1, 31, 30); // inside the future radius
    g.enqueue(-1, { t: 'setShield', compound: yard.id, on: true });
    g.step();
    g.enqueue(1, { t: 'attack', ids: [insider.id], target: yard.id });
    steps(g, 300);
    // While inside, its fire at the compound is blocked — the yard is untouched.
    expect(g.entities.get(yard.id)!.hp).toBe(yard.maxHp);
    // It may still withdraw: order it out and confirm it can path away.
    g.enqueue(1, { t: 'move', ids: [insider.id], x: 45, y: 30 });
    steps(g, 900);
    expect(distTo(g.entities.get(insider.id)!, 30, 30)).toBeGreaterThan(SHIELD_CELLS);
  });

  it('allied units inside are protected from hostile fire', () => {
    const g = new Game(setup(true));
    compound(g, 0);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step();
    const allyUnit = unitNear(g, TANK, 1, 31, 30);
    const foe = unitNear(g, TANK, 2, 40, 30);
    g.enqueue(2, { t: 'attack', ids: [foe.id], target: allyUnit.id });
    steps(g, 900);
    // The common enemy cannot hurt the ally inside the boundary.
    expect(g.entities.get(allyUnit.id)!.hp).toBe(allyUnit.maxHp);
  });

  it('protected units leave the shield to engage targets outside', () => {
    const g = new Game(setup(true));
    compound(g, 0);
    const defender = unitNear(g, TANK, 0, 31, 30);
    defender.hp = defender.maxHp * 20; // survive the probe so position is assertable
    const foe = unitNear(g, TANK, 1, 45, 30);
    const foeHp = foe.hp;
    g.enqueue(0, { t: 'attack', ids: [defender.id], target: foe.id });
    steps(g, 1800);
    const d = g.entities.get(defender.id)!;
    const f = g.entities.get(foe.id);
    // It walked out (protection is positional, not a weapon ban) and fought —
    // the foe is dead or dying.
    expect(distTo(d, 30, 30)).toBeGreaterThan(SHIELD_CELLS);
    expect(!f || f.hp < foeHp).toBe(true);
  });
});

describe('PW34 engineer capture gate', () => {
  it('an enemy Engineer inside an active shield cannot capture — building and Engineer survive', () => {
    const g = new Game(setup(true));
    compound(g, 0);
    const target = g.spawnStructure('pyle', 0, 33, 30); // inside the 4-cell radius
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    const e = g.entities.get(eng.id)!;
    expect(e.hp).toBeGreaterThan(0);
    expect(e.order).toBe('idle');
  });

  it('a shield raised after the order still blocks the capture at execution', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 42, 30);
    const eng = unitNear(g, 'engineer', 1, 35, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    compound(g, 0, 40, 30); // radius 4 covers the pyle at (42,30)
    steps(g, 1200);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
  });

  it('the unshielded control still captures and consumes the Engineer', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng.id)?.hp ?? 0).toBe(0); // consumed: culled or dead
  });

  it('newcomer protection blocks hostile capture', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 33, 30);
    g.enqueue(-1, { t: 'setNewcomerProtection', slot: 0, on: true });
    g.step();
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
  });

  it('an ally Engineer cannot take a building without consent — order rejected, unit survives', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 33, 30);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step();
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    const e = g.entities.get(eng.id)!;
    expect(e.hp).toBeGreaterThan(0);
    expect(e.order).toBe('idle');
  });
});

describe('PW10 shield lifecycle in the sim', () => {
  it('shield flags survive snapshot/restore and pre-PW10 snapshots default off', () => {
    const g = new Game(setup(true));
    const yard = compound(g, 0);
    g.step();
    const snap = captureGame(g, { seed: 47 });
    const b = restoreGame(snap, CLASSIC_PACKS);
    const restored = [...b.entities.values()].find(e => e.id === yard.id)!;
    expect(restored.shielded).toBe(true);

    const raw = JSON.parse(snap);
    for (const e of raw.state.entities) { delete e.shielded; delete e.battleAt; }
    const old = restoreGame(JSON.stringify(raw), CLASSIC_PACKS);
    const oldYard = [...old.entities.values()].find(e => e.id === yard.id)!;
    expect(oldYard.shielded).toBe(false);
    expect(oldYard.battleAt).toBe(-1);
  });

  it('classic matches ignore setShield entirely', () => {
    const g = new Game(setup(false));
    const s = g.spawnStructure('fact', 0, 30, 30);
    g.enqueue(-1, { t: 'setShield', compound: s.id, on: true });
    steps(g, 5);
    expect(g.entities.get(s.id)!.shielded).toBe(false);
  });

  it('battle tracking stamps the compound when PvP damage lands inside', () => {
    const g = new Game(setup(true));
    const yard = g.spawnStructure('fact', 0, 30, 30);
    const enemy = unitNear(g, TANK, 1, 31, 30);
    const defender = unitNear(g, TANK, 0, 32, 30);
    // Unshielded: damage flows and the exchange marks the compound in battle.
    g.enqueue(1, { t: 'attack', ids: [enemy.id], target: defender.id });
    steps(g, 600);
    const c = g.entities.get(yard.id)!;
    expect(c.battleAt).toBeGreaterThan(-1);
    expect(g.tick - c.battleAt).toBeLessThan(600);
  });
});

describe('PW34 allied capture consent', () => {
  const allied = (g: Game) => {
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step();
  };
  const grant = (g: Game, requestId: string, eng: number, bld: number, owner = 0, requester = 1) =>
    g.enqueue(-1, {
      t: 'consentGrant', requestId, engineer: eng, building: bld, owner, requester,
      ownerGen: g.entities.get(bld)!.ownerGen,
    });

  it('a journaled consent lets the allied Engineer capture — one use, audited', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng.id)?.hp ?? 0).toBe(0);
    expect(g.consents).toHaveLength(1);
    expect(g.consents[0].used).toBe(true);
    expect(g.captureEvents).toHaveLength(1);
    expect(g.captureEvents[0].requestId).toBe('req-1');
    expect(g.captureEvents[0].from).toBe(0);
    expect(g.captureEvents[0].to).toBe(1);
  });

  it('the grant is one-use and idempotent on requestId', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    grant(g, 'req-1', eng.id, target.id); // replayed journal must not double-grant
    g.step();
    expect(g.consents).toHaveLength(1);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    // A second Engineer has no consent — order rejected at issue, survives.
    const eng2 = unitNear(g, 'engineer', 1, 32, 30);
    g.enqueue(1, { t: 'enter', ids: [eng2.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng2.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng2.id)!.order).toBe('idle');
    expect(g.captureEvents).toHaveLength(1);
  });

  it('consent bound to the wrong engineer, building or owner cannot be used', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const other = g.spawnStructure('pyle', 0, 40, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    // Grant names a different building — the order on `target` finds no consent.
    grant(g, 'req-x', eng.id, other.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
  });

  it('an active shield still bars a consented capture at arrival', () => {
    const g = new Game(setup(true));
    allied(g);
    compound(g, 0, 32, 30); // radius covers the pyle at (33,30)
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
    expect(g.captureEvents).toHaveLength(0);
  });

  it('owner consent waives the owner\'s own newcomer protection — order issues and capture lands', () => {
    const g = new Game(setup(true));
    allied(g);
    // The consenting owner is still inside the 1-hour newcomer setup window.
    // Their explicit consent is the waiver — protection must not silently
    // reject the enter order at issue or arrival.
    g.players[0].newcomerProtected = true;
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng.id)?.hp ?? 0).toBe(0);
    expect(g.captureEvents).toHaveLength(1);
  });

  it('an active shield still rejects the consented enter order at issue', () => {
    const g = new Game(setup(true));
    allied(g);
    compound(g, 0, 32, 30);
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
    expect(g.captureEvents).toHaveLength(0);
  });

  it('an ownership change after consent invalidates the capture mid-walk', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    // The building changes hands while the Engineer walks — consent no longer applies.
    g.enqueue(0, { t: 'transfer', ids: [target.id], to: 1 });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(1); // now the requester's own
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
    expect(g.consents[0].used).toBe(false);
    expect(g.captureEvents).toHaveLength(0);
  });

  it('an alliance break after consent invalidates the order — it never becomes a hostile capture', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: -1 });
    steps(g, 1500);
    // The players are enemies now, but the consent order is dead — the
    // Engineer must issue a fresh hostile order to take the building.
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
    // The break destroyed the grant outright — nothing left to consume.
    expect(g.consents).toHaveLength(0);
    expect(g.captureEvents).toHaveLength(0);
  });

  it('a protected attacker cannot capture by force; a recovering attacker loses protection on capture', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 33, 30);
    // Newcomer-protected attacker: capture is refused, Engineer survives.
    g.enqueue(-1, { t: 'setNewcomerProtection', slot: 1, on: true });
    g.step();
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);

    // A recovering player may still fight — but a successful capture marks the
    // attacker so recovery protection ends at the next evaluation.
    const g2 = new Game(setup(true));
    const target2 = g2.spawnStructure('pyle', 0, 33, 30);
    g2.enqueue(-1, { t: 'setRecovery', slot: 1, on: true });
    g2.step();
    const eng2 = unitNear(g2, 'engineer', 1, 31, 30);
    g2.enqueue(1, { t: 'enter', ids: [eng2.id], target: target2.id });
    steps(g2, 300);
    expect(g2.entities.get(target2.id)!.owner).toBe(1);
    expect(g2.players[1].recoveryAttacked).toBe(true);
  });

  it('two Engineers racing one building produce exactly one capture and one consumption', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 40, 30);
    const engA = unitNear(g, 'engineer', 1, 31, 29);
    const engB = unitNear(g, 'engineer', 1, 31, 31);
    g.enqueue(1, { t: 'enter', ids: [engA.id, engB.id], target: target.id });
    steps(g, 600);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    const survivors = [engA, engB].filter(e => (g.entities.get(e.id)?.hp ?? 0) > 0);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].order).toBe('idle');
    expect(g.captureEvents).toHaveLength(1);
  });

  it('a capture order whose target changes hands never becomes an own-repair', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 40, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id }); // hostile intent
    g.step();
    g.enqueue(0, { t: 'transfer', ids: [target.id], to: 1 }); // now ours mid-walk
    target.hp = target.maxHp - 1; // damaged: the old code would heal+consume
    steps(g, 1500);
    const t = g.entities.get(target.id)!;
    expect(t.owner).toBe(1);
    expect(t.hp).toBe(target.maxHp - 1); // NOT repaired
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
  });

  it('consents and enter intents survive snapshot/restore', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    const restored = restoreGame(captureGame(g, { seed: 47 }), CLASSIC_PACKS);
    expect(restored.consents).toHaveLength(1);
    expect(restored.consents[0].requestId).toBe('req-1');
    const re = restored.entities.get(eng.id)!;
    expect(re.enterIntent).toBe(2);
    steps(restored, 1500);
    expect(restored.entities.get(target.id)!.owner).toBe(1);
  });

  // The three failures independently reproduced on b4c72b1 (15 Nov review).

  it('repro 1: a shielded-at-issue order is rejected — lowering the shield does not revive it', () => {
    const g = new Game(setup(true));
    const yard = compound(g, 0, 48, 30); // active shield covers the pyle at (50,30)
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    // Coverage at issue: the order is refused outright, not queued.
    expect(eng.order).toBe('idle');
    // Lower the shield without reissuing — the Engineer must not capture.
    g.enqueue(-1, { t: 'setShield', compound: yard.id, on: false });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.captureEvents).toHaveLength(0);
    // A NEW lawful hostile order after the shield falls captures normally.
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng.id)?.hp ?? 0).toBe(0);
    expect(g.captureEvents).toHaveLength(1);
  });

  it('repro 2: a stale own-repair order ends when an enemy captures first — the repairer survives', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 1, 50, 30);
    target.hp = target.maxHp - 50; // damaged: a lawful own-repair target
    const repairer = unitNear(g, 'engineer', 1, 31, 30);
    const foe = unitNear(g, 'engineer', 0, 49, 30); // nearer, reaches it first
    g.enqueue(1, { t: 'enter', ids: [repairer.id], target: target.id }); // own-repair intent
    g.step();
    g.enqueue(0, { t: 'enter', ids: [foe.id], target: target.id }); // hostile intent
    steps(g, 1500);
    // Only the intervening hostile Engineer captures — exactly one event.
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.captureEvents).toHaveLength(1);
    // The stale repair order is dead: the former repairer survives, unconsumed,
    // and never enters the enemy branch as a second capture.
    const r = g.entities.get(repairer.id)!;
    expect(r.hp).toBeGreaterThan(0);
    expect(r.order).toBe('idle');
  });

  it('repro 3: an alliance break-and-rejoin invalidates the grant — rejoining needs a fresh decision', () => {
    const g = new Game(setup(true));
    allied(g);
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    grant(g, 'req-1', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    g.step();
    // Leave, become hostile, rejoin — all while the Engineer walks.
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: -1 });
    g.step();
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step();
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    expect(g.entities.get(eng.id)!.hp).toBeGreaterThan(0);
    expect(g.entities.get(eng.id)!.order).toBe('idle');
    // The grant was destroyed at the break — membership restored does not revive it.
    expect(g.consents).toHaveLength(0);
    expect(g.captureEvents).toHaveLength(0);
    // And a fresh grant on the rejoined alliance works normally.
    grant(g, 'req-2', eng.id, target.id);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(eng.id)?.hp ?? 0).toBe(0);
  });

  it('two different requesters race one building — exactly one capture, one Engineer consumed', () => {
    // Tiberium Gardens seats four commanders — the 2-player crossing map
    // cannot host owner + two requesters.
    const s = setup(true);
    s.mapId = 'td-tiberium-gardens';
    const g = new Game(s);
    expect(g.players.length).toBeGreaterThanOrEqual(3);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 2, ally: 5 });
    g.step();
    const target = g.spawnStructure('pyle', 0, 40, 30);
    const engA = unitNear(g, 'engineer', 1, 31, 29);
    const engB = unitNear(g, 'engineer', 2, 31, 31);
    grant(g, 'req-A', engA.id, target.id, 0, 1);
    grant(g, 'req-B', engB.id, target.id, 0, 2);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [engA.id], target: target.id });
    g.enqueue(2, { t: 'enter', ids: [engB.id], target: target.id });
    steps(g, 600);
    // Exactly one capture: the building belongs to one requester, one Engineer
    // was consumed, one CAPTURE receipt was queued — never two.
    expect([1, 2]).toContain(g.entities.get(target.id)!.owner);
    const consumed = [engA, engB].filter(e => (g.entities.get(e.id)?.hp ?? 0) <= 0);
    expect(consumed).toHaveLength(1);
    const survivor = [engA, engB].find(e => (g.entities.get(e.id)?.hp ?? 0) > 0)!;
    expect(survivor.order).toBe('idle');
    expect(g.captureEvents).toHaveLength(1);
    expect(g.consents.filter(c => c.used)).toHaveLength(1);
  });

  it('pending capture receipts survive snapshot/restore for the durable drain', () => {
    const g = new Game(setup(true));
    const target = g.spawnStructure('pyle', 0, 33, 30);
    const eng = unitNear(g, 'engineer', 1, 31, 30);
    g.enqueue(1, { t: 'enter', ids: [eng.id], target: target.id });
    steps(g, 300);
    expect(g.captureEvents).toHaveLength(1); // queued, not yet drained
    const restored = restoreGame(captureGame(g, { seed: 47 }), CLASSIC_PACKS);
    expect(restored.captureEvents).toHaveLength(1);
    expect(restored.captureEvents[0]).toEqual(g.captureEvents[0]);
    // Draining the restored feed receipts the same deterministic operation.
    expect(restored.captureEvents[0].building).toBe(target.id);
    expect(restored.captureEvents[0].engineer).toBe(eng.id);
  });

  // THU-2445 ownership-change cases (15 Nov review): orders and grants bind the
  // exact owner/generation they were issued against — never the slot number or
  // a "still allied" relationship alone.

  it('ownership case A: a nearer hostile Engineer captures first — the stale order ends, its Engineer survives', () => {
    const s = setup(true);
    s.mapId = 'td-tiberium-gardens';
    const g = new Game(s);
    expect(g.players.length).toBeGreaterThanOrEqual(3);
    const target = g.spawnStructure('pyle', 0, 50, 30); // slot 0's barracks
    const far = unitNear(g, 'engineer', 1, 20, 30);   // slot 1: orders first, arrives last
    const near = unitNear(g, 'engineer', 2, 49, 30);  // slot 2: nearer, captures first
    g.enqueue(1, { t: 'enter', ids: [far.id], target: target.id });
    g.enqueue(2, { t: 'enter', ids: [near.id], target: target.id });
    g.step();
    // Slot 2's Engineer reaches the building while it is still slot 0's.
    steps(g, 400);
    expect(g.entities.get(target.id)!.owner).toBe(2);
    expect(g.entities.get(near.id)?.hp ?? 0).toBe(0); // consumed by its own capture
    // Slot 1's order was issued against owner 0 — owner is now 2, so it dies
    // with the Engineer alive rather than taking slot 2's building.
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(2);
    const f = g.entities.get(far.id)!;
    expect(f.hp).toBeGreaterThan(0);
    expect(f.order).toBe('idle');
    // A fresh lawful order against the NEW owner captures normally.
    g.enqueue(1, { t: 'enter', ids: [far.id], target: target.id });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(far.id)?.hp ?? 0).toBe(0);
    expect(g.captureEvents).toHaveLength(2);
  });

  it('ownership case B: a grant dies permanently when the building changes hands and returns — new consent required', () => {
    const s = setup(true);
    s.mapId = 'td-tiberium-gardens';
    const g = new Game(s);
    expect(g.players.length).toBeGreaterThanOrEqual(3);
    g.enqueue(-1, { t: 'setAlly', slot: 0, ally: 5 });
    g.enqueue(-1, { t: 'setAlly', slot: 1, ally: 5 });
    g.step(); // slot 2 stays hostile
    const target = g.spawnStructure('pyle', 0, 50, 30);
    const requester = unitNear(g, 'engineer', 1, 20, 30); // walks the whole sequence
    const raider = unitNear(g, 'engineer', 2, 49, 30);   // hostile: takes it first
    const ownerEng = unitNear(g, 'engineer', 0, 52, 31); // hostile recapture back to 0
    grant(g, 'req-1', requester.id, target.id, 0, 1);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [requester.id], target: target.id }); // consent intent
    g.enqueue(2, { t: 'enter', ids: [raider.id], target: target.id });   // hostile intent
    // Wait for the raider's capture 0 -> 2.
    for (let i = 0; i < 600 && g.entities.get(target.id)!.owner !== 2; i++) g.step();
    expect(g.entities.get(target.id)!.owner).toBe(2);
    // Slot 0's Engineer takes it back 2 -> 0 while the requester still walks.
    g.enqueue(0, { t: 'enter', ids: [ownerEng.id], target: target.id });
    for (let i = 0; i < 600 && g.entities.get(target.id)!.owner !== 0; i++) g.step();
    expect(g.entities.get(target.id)!.owner).toBe(0);
    // The original grant is permanently dead: owner slot and alliance match
    // again, but the ownership generation advanced twice. The requester
    // survives and the building stays slot 0's.
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(0);
    const r = g.entities.get(requester.id)!;
    expect(r.hp).toBeGreaterThan(0);
    expect(r.order).toBe('idle');
    expect(g.consents[0].used).toBe(false);
    expect(g.captureEvents).toHaveLength(2); // only the two hostile captures
    // New consent on the returned building works normally.
    grant(g, 'req-2', requester.id, target.id, 0, 1);
    g.step();
    g.enqueue(1, { t: 'enter', ids: [requester.id], target: target.id });
    steps(g, 1500);
    expect(g.entities.get(target.id)!.owner).toBe(1);
    expect(g.entities.get(requester.id)?.hp ?? 0).toBe(0);
    expect(g.captureEvents).toHaveLength(3);
  });
});
