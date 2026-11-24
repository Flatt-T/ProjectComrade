// Usage: node run_fusion_baseline.mjs /absolute/path/to/compiled/packages/fusion
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const compiled = resolve(process.argv[2]);
const { Game } = await import(pathToFileURL(join(compiled, 'game.js')));
const { ra1Pack } = await import(pathToFileURL(join(compiled, 'packs/ra1.js')));
const commit = '84f411478f01ed62365a2e4d1d316eb57d9e193c';
function battle() {
  const game = new Game({ pack: ra1Pack, mapId: 'ra1-bridgehead', seed: 14077,
    credits: 'standard', worms: 0, crates: 0, players: [
      { name: 'Reference A', faction: 'allies', ai: false, team: 0 },
      { name: 'Reference B', faction: 'soviet', ai: false, team: 1 },
    ] });
  const events = [];
  const own = (slot, type) => [...game.entities.values()].filter(e => e.owner === slot && e.type === type && e.hp > 0);
  const mark = action => events.push({ action, tick: game.tick, checksum: game.checksum(),
    credits: game.players.map(p => p.credits), power: game.players.map(p => [p.powerGen, p.powerUse]) });
  function advance(limit, predicate, label) {
    for (let i = 0; i < limit && !predicate(); i++) game.step();
    assert.ok(predicate(), label);mark(label);
  }
  function place(slot, item) {
    const player = game.players[slot];
    assert.ok(game.canBuild(player, item), 'menu access '+item);
    game.enqueue(slot, {t:'build',item});
    advance(1800, () => player.queues.structure.ready, 'ready '+slot+' '+item);
    let at;
    for(let y = 0; y < game.map.h && !at; y++) {
      for(let x = 0; x < game.map.w; x++) {
        if(game.canPlace(player,item,x,y)) { at={x,y};break; }
      }
    }
    assert.ok(at, 'at least one legal construction site');
    game.enqueue(slot, {t:'place',item,...at});game.step();assert.ok(own(slot,item).length);mark('placed '+slot+' '+item);
  }
  mark('new match');
  for(const p of game.players) {
    const [m] = own(p.slot, 'mcv');assert.ok(m);
    game.enqueue(p.slot, {t:'deploy',ids:[m.id]});
  }
  game.step();assert.equal(own(0,'fact').length,1);assert.equal(own(1,'fact').length,1);mark('two yards deployed');
  place(0,'powr');place(1,'powr');
  assert.equal(game.canBuild(game.players[0],'barr'),false);
  assert.equal(game.canBuild(game.players[1],'tent'),false);
  place(0,'tent');place(1,'barr');
  place(0,'proc');
  assert.ok(own(0,'harvester').length,'refinery-created harvester');
  const before=own(0,'rifleinf').length;
  game.enqueue(0,{t:'build',item:'rifleinf'});
  advance(1500,()=>own(0,'rifleinf').length>before,'rifle infantry exited producer');
  const p=game.players[0];const pre=p.credits;
  game.enqueue(0,{t:'build',item:'weap'});game.step();game.step();
  const paid=p.queues.structure.paid;assert.ok(paid>0);
  game.enqueue(0,{t:'cancel',item:'weap'});game.step();
  assert.equal(p.credits,pre);assert.equal(p.queues.structure.paid,0);mark('cancel refunded paid amount');
  advance(3500,()=>p.stats.harvested>0,'harvester completed a resource deposit');
  return {events,depositTotal:p.stats.harvested,refineryHarvesterCount:own(0,'harvester').length,finalChecksum:game.checksum()};
}
const first=battle();const second=battle();assert.deepEqual(first,second);
console.log(JSON.stringify({profile:'COMRADE existing RA1-style skirmish',sourceCommit:commit,
  entryPoints:['Game constructor','Game.enqueue','Game.step','Game.canBuild','Game.canPlace','Game.checksum'],
  map:'ra1-bridgehead',seed:14077,tickRateHz:15,independentRuns:2,results:first},null,2));
