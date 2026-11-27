// Run against the checked-in compiled Fusion audit build associated with commit 84f411478f01ed62365a2e4d1d316eb57d9e193c.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2]);
const { Game } = await import(pathToFileURL(join(root, 'game.js')));
const { dunePack } = await import(pathToFileURL(join(root, 'packs/dune.js')));
const setup = {mapId:'four-sietches',seed:14077,credits:'standard',worms:0,crates:0,players:['atreides','harkonnen','ordos'].map((faction,slot)=>({name:faction,faction,ai:false,team:slot}))};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function opening() {
  const game = new Game({...structuredClone(setup),pack:dunePack});
  const commands = [], events = [], firstDeposits = {}, menus = {};
  const own = (slot,type) => [...game.entities.values()].filter(e=>e.owner===slot && e.type===type && e.hp>0);
  function record(label,extra={}) {
    events.push({label,tick:game.tick,checksum:game.checksum(),credits:game.players.map(p=>p.credits),harvested:game.players.map(p=>p.stats.harvested),...extra});
  }
  function command(slot,value) {
    commands.push({beforeTick:game.tick,slot,command:structuredClone(value)});
    game.enqueue(slot,value);
  }
  function step() {
    game.step();
    for(const p of game.players) {
      if(p.stats.harvested>0 && !(p.faction in firstDeposits)) {
        firstDeposits[p.faction]={tick:game.tick,harvested:p.stats.harvested,checksum:game.checksum()};
      }
    }
  }
  function advance(max,done,message) {
    for(let i=0;i<max && !done();i++)step();
    assert.ok(done(),message+' at tick '+game.tick);
  }
  function site(slot,item) {
    const p=game.players[slot], yard=own(slot,'conyard')[0], choices=[];
    for(let y=0;y<game.map.h;y++)for(let x=0;x<game.map.w;x++) {
      if(game.canPlace(p,item,x,y))choices.push({x,y,dist:(x-yard.cx)**2+(y-yard.cy)**2});
    }
    choices.sort((a,b)=>a.dist-b.dist||a.y-b.y||a.x-b.x);
    assert.ok(choices.length,'legal site '+slot+' '+item);
    const {x,y}=choices[0];return {x,y};
  }
  function placeBatch(item,slots,preselected={}) {
    const coords={};
    for(const slot of slots) {
      assert.ok(game.canBuild(game.players[slot],item),'legal menu '+slot+' '+item);
      coords[slot]=preselected[slot]??site(slot,item);
      command(slot,{t:'build',item});
    }
    advance(2500,()=>slots.every(slot=>game.players[slot].queues.structure.ready),'ready '+item);
    for(const slot of slots) {
      const {x,y}=coords[slot];assert.ok(game.canPlace(game.players[slot],item,x,y),'legal placement');command(slot,{t:'place',item,x,y});
    }
    step();
    const placements=[];
    for(const slot of slots) {
      const {x,y}=coords[slot];
      if(item==='concrete') {
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)assert.ok(game.map.concrete[(y+dy)*game.map.w+x+dx]);
        placements.push({slot,x,y,concreteCells:4});
      } else {
        const e=own(slot,item).find(e=>e.cx===x&&e.cy===y);assert.ok(e,'placed '+slot+' '+item);
        placements.push({slot,x,y,hp:e.hp,definitionHp:dunePack.structures[item].hp,exposed:Boolean(e.exposed)});
      }
    }
    record('placed '+item,{placements});return coords;
  }
  const slots=[0,1,2];
  const menu=(items)=>Object.fromEntries(game.players.map(p=>[p.faction,Object.fromEntries(items.map(i=>[i,game.canBuild(p,i)]))]));
  record('match created',{startingRoster:slots.map(s=>Object.fromEntries([...new Set([...game.entities.values()].filter(e=>e.owner===s).map(e=>e.type))].map(t=>[t,own(s,t).length])))});
  for(const slot of slots)command(slot,{t:'deploy',ids:[own(slot,'mcv')[0].id]});
  step();for(const slot of slots)assert.equal(own(slot,'conyard').length,1);
  record('three MCVs deployed');menus.afterYards=menu(['concrete','windtrap','refinery','barracks']);
  const slab=placeBatch('concrete',[0,2]);
  placeBatch('windtrap',slots,slab);
  assert.equal(own(0,'windtrap')[0].hp,700);assert.equal(own(1,'windtrap')[0].hp,350);assert.equal(own(2,'windtrap')[0].hp,700);
  menus.afterWindtraps=menu(['refinery','barracks','lightfactory']);placeBatch('refinery',slots);
  for(const slot of slots)assert.equal(own(slot,'harvester').length,1);
  record('all refineries provided one harvester');placeBatch('barracks',slots);
  menus.levelZeroBarracks=menu(['lightinf','trooper','engineer','thumper']);
  const beforeTrooper=slots.map(s=>own(s,'trooper').length);
  for(const s of slots)command(s,{t:'build',item:'trooper'});
  advance(1000,()=>slots.every(s=>own(s,'trooper').length>beforeTrooper[s]),'trooper exited');
  record('three troopers exited unupgraded barracks');
  placeBatch('lightfactory',slots);
  menus.lightFactory=menu(['trike','raider','quad','combattank','combattank-h','combattank-o']);
  const types=['trike','trike','raider'];
  // Try all three forbidden purchases through ordinary command admission before submitting each legal build.
  for(const s of slots)command(s,{t:'build',item:s===2?'trike':'raider'});step();
  assert.ok(slots.every(s=>game.players[s].queues.vehicle.items.length===0));record('cross-house scouts rejected');
  for(const s of slots)command(s,{t:'build',item:types[s]});
  advance(1200,()=>slots.every(s=>own(s,types[s]).length===1),'manufactured scouts');
  record('house-specific scouts exited',{types});
  placeBatch('outpost',slots);
  menus.withOutpost=menu(['thumper','sardaukar','sonictank','devastator','deviator']);
  assert.deepEqual(slots.map(s=>game.canBuild(game.players[s],'thumper')),[true,false,false]);
  command(0,{t:'build',item:'thumper'});advance(1000,()=>own(0,'thumper').length===1,'Atreides thumper');record('Atreides thumper exited');
  placeBatch('heavyfactory',slots);
  menus.heavyFactory=menu(['combattank','combattank-h','combattank-o','harvester','missiletank']);
  const tanks=['combattank','combattank-h','combattank-o'];const before=slots.map(s=>own(s,tanks[s]).length);
  for(const s of slots)command(s,{t:'build',item:tanks[s]});
  advance(1800,()=>slots.every(s=>own(s,tanks[s]).length>before[s]),'house tanks');
  record('three different house combat tanks exited',{types:tanks});
  advance(12000,()=>Object.keys(firstDeposits).length===3,'first spice deposit for each house');
  record('all three have banked spice');return {commands,events,menus,firstDeposits,finalTick:game.tick,finalChecksum:game.checksum()};
}
const first=opening(),second=opening();assert.deepEqual(first,second);
function replayAndProbe(recorded) {
  const game = new Game({...structuredClone(setup),pack:dunePack}), byTick=new Map();
  for(const entry of recorded.commands) {
    const bucket=byTick.get(entry.beforeTick)??[]; bucket.push(entry);byTick.set(entry.beforeTick,bucket);
  }
  const afterRefineryTick=recorded.events.find(e=>e.label==='placed refinery').tick;
  const afterLightTick=recorded.events.find(e=>e.label==='placed lightfactory').tick;
  const fieldChecks=[];
  while(game.tick<recorded.finalTick) {
    for(const entry of byTick.get(game.tick)??[])game.enqueue(entry.slot,structuredClone(entry.command));
    game.step();
    if([afterRefineryTick,afterLightTick].includes(game.tick)) {
      fieldChecks.push({tick:game.tick,heavyFactoryEligible:game.players.map(p=>game.canBuild(p,'heavyfactory')),lightFactoryEligible:game.players.map(p=>game.canBuild(p,'lightfactory'))});
    }
  }
  assert.equal(game.checksum(),recorded.finalChecksum);
  assert.deepEqual(fieldChecks.map(x=>x.heavyFactoryEligible),[[false,false,false],[true,true,true]]);
  const branchCommands=[];
  for(const p of game.players) {
    assert.equal(game.canBuild(p,'upgrade:barracks'),true);
    const cmd={t:'build',item:'upgrade:barracks'};
    branchCommands.push({beforeTick:game.tick,slot:p.slot,command:cmd});game.enqueue(p.slot,cmd);
  }
  for(let i=0;i<1200 && !game.players.every(p=>p.upgrades.barracks===1);i++)game.step();
  assert.ok(game.players.every(p=>p.upgrades.barracks===1));
  const fieldResult=game.players.map(p=>({faction:p.faction,level:p.upgrades.barracks,thumper:game.canBuild(p,'thumper'),engineer:game.canBuild(p,'engineer')}));
  assert.deepEqual(fieldResult.map(p=>p.thumper),[true,false,false]);
  const windtraps=game.players.map(p=>{const w=[...game.entities.values()].find(e=>e.owner===p.slot && e.type==='windtrap' && e.hp>0);return {faction:p.faction,hp:w.hp,exposed:Boolean(w.exposed)};});
  return {windtrapsAtFinalBranchTick:windtraps,replayedCommands:recorded.commands.length,replayedChecksum:recorded.finalChecksum,fieldChecks,branchCommands,upgradedBarracks:{tick:game.tick,checksum:game.checksum(),houses:fieldResult}};
}
const branch=replayAndProbe(first);assert.deepEqual(branch,replayAndProbe(second));
console.log(JSON.stringify({subject:'existing COMRADE Fusion Dune 2000-style skirmish',sourceCommit:'84f411478f01ed62365a2e4d1d316eb57d9e193c',sha256OfCompiledFiles:Object.fromEntries(['game.js','packs/dune.js','map.js','rules.js','core.js'].map(f=>[f,hash(readFileSync(join(root,f)))])),setup,entryPoints:['Game','enqueue','step','canBuild','canPlace','checksum'],independentInstantiations:2,fullResultSha256:hash(JSON.stringify(first)),result:first,replayedFollowup:branch},null,2));
