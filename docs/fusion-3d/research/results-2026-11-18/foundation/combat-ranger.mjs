// Run with node combat-ranger.mjs /absolute/path/to/compiled/packages/fusion
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = resolve(process.argv[2]);
const { Game } = await import(pathToFileURL(join(compiled, 'game.js')));
const { ra1Pack } = await import(pathToFileURL(join(compiled, 'packs/ra1.js')));

function encounter(opponentType) {
  const game = new Game({
    pack: ra1Pack, mapId: 'ra1-bridgehead', seed: 14077,
    credits: 'standard', worms: 0, crates: 0,
    players: [
      { name: 'Allies', faction: 'allies', ai: false, team: 0 },
      { name: 'Soviets', faction: 'soviet', ai: false, team: 1 },
    ],
  });
  const find = (owner, type) => [...game.entities.values()].find(entity => entity.owner === owner && entity.type === type);
  const ranger = find(0, 'ranger');
  const opponent = find(1, opponentType);
  const seen = (viewer, unit) => Boolean(game.players[viewer].visible[game.cellOf(unit)]);
  const cell = unit => [game.cellOf(unit) % game.map.w, Math.floor(game.cellOf(unit) / game.map.w)];
  const observe = () => ({tick: game.tick, hp: [ranger.hp, opponent.hp], cells: [cell(ranger), cell(opponent)]});
  game.step();
  assert.ok(!seen(0, opponent) && !seen(1, ranger));
  const initial = observe();
  game.enqueue(0, {t:'move', ids:[ranger.id], x:39, y:22});
  game.enqueue(1, {t:'move', ids:[opponent.id], x:40, y:22});
  const timeline = [];
  let alliedFirstSight, sovietFirstSight, commanded, firstRangerTarget, firstSovietTarget;
  let last = initial;
  while (game.tick < 6500 && ranger.hp > 0 && opponent.hp > 0) {
    game.step();
    const now = observe();
    if (!alliedFirstSight && seen(0, opponent)) alliedFirstSight = now;
    if (!sovietFirstSight && seen(1, ranger)) sovietFirstSight = now;
    if (!firstRangerTarget && ranger.order === 'attack' && ranger.target === opponent.id) firstRangerTarget = now;
    if (!firstSovietTarget && opponent.order === 'attack' && opponent.target === ranger.id) firstSovietTarget = now;
    if (!commanded && ranger.hp > 0 && opponent.hp > 0 && seen(0, opponent) && seen(1, ranger)) {
      game.enqueue(0, {t:'attack', ids:[ranger.id], target:opponent.id});
      if (game.weaponOf(opponent)) game.enqueue(1, {t:'attack', ids:[opponent.id], target:ranger.id});
      commanded = now;
    }
    if (now.hp.some((hp, i) => hp !== last.hp[i])) timeline.push(now);
    last = now;
  }
  assert.equal(opponent.hp, 0, 'target defeated within bound');
  assert.ok(ranger.hp > 0 && commanded && alliedFirstSight && sovietFirstSight);
  assert.deepEqual(game.players.map(p => [p.stats.killed, p.stats.lost]), [[1, 0], [0, 1]]);
  const samples = timeline.length <= 6 ? timeline : [...timeline.slice(0,3), ...timeline.slice(-3)];
  const sourceWeapon = game.weaponOf(ranger);
  const describe = unit => {
    const weapon = game.weaponOf(unit);
    return { id:unit.id, type:unit.type, armor:game.armorOf(unit), weapon:weapon?.id ?? null,
      damage:weapon?.damage ?? null, burst:weapon?.burst ?? (weapon ? 1 : null), refireTicks:weapon?.rof ?? null };
  };
  return { combatants:[describe(ranger), describe(opponent)],
    rangerWarhead:sourceWeapon.warhead,
    percentAgainstOpponent:ra1Pack.warheads[sourceWeapon.warhead].vs[game.armorOf(opponent)],
    firstMoveEnqueued:initial, alliedFirstSight, sovietFirstSight,
    explicitAttackEnqueued:commanded, firstRangerTarget, firstSovietTarget:firstSovietTarget ?? null,
    hpChangeTicks:timeline.length, hpTraceSamples:samples,
    fullTraceSha256:createHash('sha256').update(JSON.stringify(timeline)).digest('hex'),
    finalTick:game.tick, finalChecksum:game.checksum(), finalKillsAndLosses:game.players.map(p => [p.stats.killed,p.stats.lost]) };
}

const opponents = ['conscript','mcv'];
const trials = opponents.map(encounter);
assert.deepEqual(trials, opponents.map(encounter));
console.log(JSON.stringify({commit:'84f411478f01ed62365a2e4d1d316eb57d9e193c', pack:'ra1', map:'ra1-bridgehead',
  seed:14077, tickRateHz:15, independentRunsPerOpponent:2, healthTraceUnit:'post-step HP, capped at zero',
  trials}, null, 2));
