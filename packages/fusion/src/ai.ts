// Skirmish AI. It runs inside the deterministic simulation and acts only through the
// same commands a human sends, so it is fair, replayable and identical on every client.
import type { Entity, Game, Player } from './game';
import { LEPTONS, toCell } from './core';
import { buildableTerrain, terrainPassable } from './map';

export interface AIState {
  slot: number;
  nextAttack: number;
  waveSize: number;
  rallySet: boolean;
}

export function createAIState(slot: number): AIState {
  return { slot, nextAttack: 2700, waveSize: 6, rallySet: false };
}

export function runAI(game: Game, p: Player, s: AIState) {
  const mine: Entity[] = [];
  for (const e of game.entities.values()) if (e.owner === p.slot && e.hp > 0) mine.push(e);
  const structures = mine.filter(e => e.kind === 'structure');
  const units = mine.filter(e => e.kind === 'unit');
  const yard = structures.find(e => game.pack.structures[e.type].constructionYard);

  // 1. Deploy the MCV into a construction yard.
  if (!yard) {
    const mcv = units.find(u => game.pack.units[u.type].deploysTo);
    if (mcv) {
      const target = game.pack.structures[game.pack.units[mcv.type].deploysTo!];
      const cx = toCell(mcv.x) - (target.w >> 1), cy = toCell(mcv.y) - (target.h >> 1);
      if (game.canPlace(p, target.id, cx, cy, true, mcv.id)) game.enqueue(p.slot, { t: 'deploy', ids: [mcv.id] });
      else {
        // Drive to the nearest spot where it fits.
        const spot = findSite(game, p, target.id, toCell(mcv.x), toCell(mcv.y), 10, true, mcv.id);
        if (spot) game.enqueue(p.slot, { t: 'move', ids: [mcv.id], x: spot.x + (target.w >> 1), y: spot.y + (target.h >> 1) });
      }
    }
    return;
  }
  const base = { x: yard.cx + 1, y: yard.cy + 1 };
  const owned = game.owned(p);
  const count = (pred: (id: string) => boolean) => structures.filter(e => pred(e.type)).length;
  const sdef = (id: string) => game.pack.structures[id];

  // 2. Base building.
  const sq = p.queues.structure;
  if (sq.ready) {
    const item = sq.items[0];
    const spot = findSite(game, p, item, base.x, base.y, 14);
    if (spot) game.enqueue(p.slot, { t: 'place', item, x: spot.x, y: spot.y });
    else game.enqueue(p.slot, { t: 'cancel', item });
  } else if (!sq.items.length) {
    const options = game.buildOptions(p, 'structure').filter(id => !sdef(id).floor && !sdef(id).wall);
    // A construction yard may supply a little power (Dune); still build real power first.
    const hasPowerPlant = structures.some(e => sdef(e.type).power > 0 && !sdef(e.type).constructionYard);
    const pick = choose(options, [
      id => sdef(id).power > 0 && (!hasPowerPlant || p.powerGen - p.powerUse < 40),
      id => !!sdef(id).refinery && count(t => !!sdef(t).refinery) < 1,
      id => sdef(id).produces === 'infantry' && !owned.has(id),
      id => sdef(id).produces === 'vehicle' && !owned.has(id),
      id => !!sdef(id).refinery && count(t => !!sdef(t).refinery) < 2,
      id => !!sdef(id).radar && !owned.has(id),
      id => !!sdef(id).storage && !sdef(id).refinery && p.storage > 0 && p.credits > p.storage * 0.8,
      id => !owned.has(id) && sdef(id).power <= 0,
      id => sdef(id).produces === 'vehicle' && count(t => sdef(t).produces === 'vehicle') < 2 && p.credits > 3000,
    ]);
    if (pick && p.credits >= Math.min(game.costOf(pick), 600)) game.enqueue(p.slot, { t: 'build', item: pick });
  }

  // Keep damaged buildings repaired while the treasury allows it.
  if (p.credits > 800) for (const e of structures) if (!e.repairing && e.hp < e.maxHp * 0.75) { game.enqueue(p.slot, { t: 'repair', id: e.id }); break; }

  // 3. Defences once the economy is running.
  const dq = p.queues.defense;
  const defenses = count(id => sdef(id).queue === 'defense' && !sdef(id).wall);
  if (dq.ready) {
    const item = dq.items[0];
    const enemy = nearestEnemyBase(game, p, base);
    const toward = enemy ? { x: base.x + Math.sign(enemy.x - base.x) * 5, y: base.y + Math.sign(enemy.y - base.y) * 5 } : base;
    const spot = findSite(game, p, item, toward.x, toward.y, 10);
    if (spot) game.enqueue(p.slot, { t: 'place', item, x: spot.x, y: spot.y });
    else game.enqueue(p.slot, { t: 'cancel', item });
  } else if (!dq.items.length && owned.size >= 4 && defenses < Math.min(4, 1 + Math.floor(game.tick / 2700)) && p.credits > 1200 && p.powerGen > p.powerUse) {
    const options = game.buildOptions(p, 'defense').filter(id => !sdef(id).wall);
    // Strongest defence it can afford.
    const pick = options.sort((a, b) => game.costOf(b) - game.costOf(a) || (a < b ? -1 : 1)).find(id => game.costOf(id) <= p.credits);
    if (pick) game.enqueue(p.slot, { t: 'build', item: pick });
  }

  // 4. Units: keep a harvester per refinery, then a steady army.
  const harvesters = units.filter(u => game.pack.units[u.type].harvester).length;
  const refineries = count(id => !!sdef(id).refinery);
  const vq = p.queues.vehicle;
  if (vq.items.length < 2) {
    const options = game.buildOptions(p, 'vehicle');
    const harvester = options.find(id => game.pack.units[id].harvester);
    if (harvester && harvesters < refineries) game.enqueue(p.slot, { t: 'build', item: harvester });
    else if (p.credits > 400) {
      const combat = options.filter(id => !game.pack.units[id].harvester && !game.pack.units[id].deploysTo && game.pack.units[id].weapon);
      if (combat.length) game.enqueue(p.slot, { t: 'build', item: combat[game.rng.int(combat.length)] });
    }
  }
  const iq = p.queues.infantry;
  if (iq.items.length < 2 && p.credits > 300) {
    const combat = game.buildOptions(p, 'infantry').filter(id => game.pack.units[id].weapon);
    if (combat.length) game.enqueue(p.slot, { t: 'build', item: combat[game.rng.int(combat.length)] });
  }
  if (!s.rallySet) {
    const enemy = nearestEnemyBase(game, p, base);
    if (enemy) { game.enqueue(p.slot, { t: 'rally', x: base.x + Math.sign(enemy.x - base.x) * 6, y: base.y + Math.sign(enemy.y - base.y) * 6 }); s.rallySet = true; }
  }

  // Superweapons fire at the enemy base as soon as they are charged.
  for (const e of structures) {
    const sw = game.superweaponOf(e);
    if (!sw || e.charge < sw.charge) continue;
    const target = nearestEnemyBase(game, p, base);
    if (target) game.enqueue(p.slot, { t: 'super', id: e.id, x: target.x + 1, y: target.y + 1 });
  }

  // 5. Army: defend the base, then attack in growing waves.
  const army = units.filter(u => {
    const d = game.pack.units[u.type];
    return d.weapon && !d.harvester && !d.deploysTo;
  });
  const idle = army.filter(u => u.order === 'idle');
  const intruder = findIntruder(game, p, base, 12);
  if (intruder && idle.length) {
    game.enqueue(p.slot, { t: 'attackMove', ids: idle.map(u => u.id), x: toCell(intruder.x), y: toCell(intruder.y) });
    return;
  }
  if (game.tick >= s.nextAttack && idle.length >= s.waveSize) {
    const target = nearestEnemyBase(game, p, base);
    if (target) {
      game.enqueue(p.slot, { t: 'attackMove', ids: idle.map(u => u.id), x: target.x, y: target.y });
      s.waveSize = Math.min(24, s.waveSize + 3);
      s.nextAttack = game.tick + 1800;
    }
  }
}

function choose(options: string[], rules: ((id: string) => boolean)[]): string | undefined {
  for (const rule of rules) {
    const match = options.filter(rule).sort();
    if (match.length) return match[0];
  }
  return undefined;
}

/** Spiral search for a valid site, leaving a lane below each building for exits. */
function findSite(game: Game, p: Player, item: string, ox: number, oy: number, radius: number, ignoreRadius = false, ignoreUnit = 0): { x: number; y: number } | null {
  const def = game.pack.structures[item];
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = ox + dx, y = oy + dy;
      if (!game.canPlace(p, item, x, y, ignoreRadius, ignoreUnit)) continue;
      if (!def.wall && !lanesClear(game, x, y, def.w, def.h)) continue;
      return { x, y };
    }
  }
  return null;
}

function lanesClear(game: Game, x: number, y: number, w: number, h: number): boolean {
  const map = game.map;
  for (let cx = x - 1; cx <= x + w; cx++) for (const cy of [y - 1, y + h]) {
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
    const i = cy * map.w + cx;
    if (map.occupied[i]) return false;
  }
  // The exit row must be drivable.
  for (let cx = x; cx < x + w; cx++) {
    const cy = y + h;
    if (cy >= map.h) return false;
    const i = cy * map.w + cx;
    if (!terrainPassable(game.pack, map, i, 'vehicle') && !buildableTerrain(game.pack, map, i)) return false;
  }
  return true;
}

function nearestEnemyBase(game: Game, p: Player, base: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (const e of game.entities.values()) {
    if (e.hp <= 0 || !game.isEnemy(p.slot, e.owner)) continue;
    const x = e.kind === 'structure' ? e.cx : toCell(e.x), y = e.kind === 'structure' ? e.cy : toCell(e.y);
    const d = (x - base.x) ** 2 + (y - base.y) ** 2 + (e.kind === 'structure' ? 0 : 400);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function findIntruder(game: Game, p: Player, base: { x: number; y: number }, radius: number): Entity | undefined {
  const r = radius * LEPTONS;
  const bx = base.x * LEPTONS, by = base.y * LEPTONS;
  for (const e of game.entities.values()) {
    if (e.hp <= 0 || e.kind !== 'unit' || !game.isEnemy(p.slot, e.owner)) continue;
    if (Math.abs(e.x - bx) < r && Math.abs(e.y - by) < r) return e;
  }
  return undefined;
}
