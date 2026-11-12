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
