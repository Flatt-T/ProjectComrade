"""Trace SAGE object declarations, conditional presentation and explicit menu construction edges.

This is static source research. A graph path ignores affordability, prerequisites, science,
map overrides, command-set upgrades, and runtime enablement. Never call it retail play proof.
"""
from collections import defaultdict,Counter,deque
from pathlib import Path
import json,re,argparse
from extract_early import jsonl
ROOT=Path(__file__).resolve().parent
HEADER=re.compile(r'^\s*(ObjectReskin|ChildObject|Object|CommandButton|CommandSet|PlayerTemplate|Weapon|SpecialPower|Science|Upgrade|Armor|Locomotor|Terrain)\s+([\w.:-]+)(?:\s+([\w.:-]+))?\s*$',re.I)
PROP=re.compile(r'^\s*([\w:]+)\s*=\s*(.*?)\s*$')

def body_groups(file,cache,accepted):
    rows=[];current=None
    for n,line in enumerate((cache/file['local']).read_bytes().decode('cp1252',errors='replace').splitlines(),1):
        line=line.partition(';')[0].partition('//')[0].strip();m=HEADER.match(line)
        if m and m[1].lower() in accepted:
            if current:yield current
            current={'type':m[1],'id':m[2],'parent':m[3],'line':n,'props':[],'src':file['url']+f'#L{n}'}
        elif current and line:current['props'].append((n,line))
    if current:yield current

def fields(lines):
    out=defaultdict(list)
    for n,line in lines:
        m=PROP.match(line)
        if m:out[m[1].lower()].append((n,m[2]))
    return out

def vals(kv,key):return list(dict.fromkeys(v for _,v in kv.get(key,[])))
def first(kv,k):return next(iter(vals(kv,k)),None)
def pick(kv,names):return {k:vals(kv,k) for k in names.split() if k in kv}

def subblocks(lines,name):
    for i,(n,line) in enumerate(lines):
        m=re.match(r'^('+name+r')\s*(?:=\s*)?(.*)$',line,re.I)
        if m and (line.lower()==m[1].lower() or re.match(re.escape(m[1])+r'(?:\s|=)',line,re.I)):
            end=next((j for j in range(i+1,len(lines)) if lines[j][1].lower()=='end'),len(lines))
            aliases=[]
            for alias_line,following in lines[end+1:]:
                alias=PROP.match(following)
                if not alias or alias[1].lower()!='aliasconditionstate':break
                aliases.append(alias[2])
            yield m[1],m[2].strip(),n,fields(lines[i+1:end]),aliases

def run(cache,profile,sources):
    recs=[x for x in sources if x['profile']==profile];bylocal={Path(x['local']).name.lower():x for x in recs};objs={};parents={};states=[];dupes=[];weps={};buttons={};sets={};players=[];special=[]
    for f in recs:
        if '/Object/' not in f['local']:continue
        for g in body_groups(f,cache,{'object','childobject','objectreskin'}):
            ident=g['id'];ls=g['props'];kv=fields(ls)
            if ident in objs:dupes.append({'id':ident,'existing':objs[ident]['src'],'other':g['src']});continue
            row={'id':ident,'declaration':g['type'],'parent':g['parent'],'src':g['src'],'facts':pick(kv,'displayname side editorsorting commandset buildcost buildtime buildable maxhealth initialhealth visionrange shroudclearingrange kindof geometry geometrymajorradius geometryminorradius geometryheight selectportrait buttonimage transportslotcount experiencevalue experiencerequired istrainable energyproduction energybonus capturablebyrangers'), 'modules':sorted({v.split()[0] for v in vals(kv,'behavior') if v.split()}),'locomotor':vals(kv,'locomotor'),'weapon_sets':[],'prerequisites':[]}
            for _,c,n,fields_,_ in subblocks(ls,'WeaponSet'):
                row['weapon_sets'].append({'condition':first(fields_,'conditions'),'slots':vals(fields_,'weapon')})
            for _,c,n,fields_,_ in subblocks(ls,'Prerequisites'):
                row['prerequisites'].append(pick(fields_,'object science upgrade'))
            for block,c,n,fields_,aliases in subblocks(ls,'DefaultConditionState|ConditionState|TransitionState'):
                states.append({'id':ident,'condition':c or block,'type':block,'line':n,'aliases':aliases,'binding':pick(fields_,'model animation idleanimation animationmode animationflags transitionkey animationblendtime turretslave turret turretpitch weaponfirefxbone weaponlaunchbone weaponmuzzleflash particleSysBone hideSubObject showsubobject'.lower())})
            aliases=vals(kv,'aliasconditionstate');row['state_aliases']=aliases;row['models']=vals(kv,'model');row['animation_refs']=list(dict.fromkeys(vals(kv,'animation')+vals(kv,'idleanimation')));row['drawing_modules']=sorted({v.split()[0] for v in vals(kv,'draw') if v.split()});row['voices']=pick(kv,'voiceselect voicemove voiceattack voicecreate');objs[ident]=row
    for g in body_groups(bylocal['commandbutton.ini'],cache,{'commandbutton'}):
        kv=fields(g['props']);buttons[g['id']]={'src':g['src'],'command':first(kv,'command'),'target':first(kv,'object'),'upgrade':first(kv,'upgrade'),'science':first(kv,'science'),'power':first(kv,'specialpower')}
    for g in body_groups(bylocal['commandset.ini'],cache,{'commandset'}):
        kv=fields(g['props']);sets[g['id']]={'src':g['src'],'slots':[(k,v) for k,arr in kv.items() if k.isdigit() for _,v in arr]}
    for g in body_groups(bylocal['playertemplate.ini'],cache,{'playertemplate'}):
        kv=fields(g['props']);players.append({'id':g['id'],'src':g['src'],'side':first(kv,'side'),'base_side':first(kv,'baseside'),'playable_flag':first(kv,'playableside'),'starting_building':first(kv,'startingbuilding'),'starting_units':[v for k in kv if re.fullmatch(r'startingunit\d+',k) for v in vals(kv,k)],'intrinsic_sciences':vals(kv,'intrinsicsciences'),'power_shortcut_set':first(kv,'specialpowershortcutcommandset')})
    for tag,filename,keys in [('weapon','weapon.ini','primarydamage primarydamageradius secondarydamage weaponSpeed attackrange minimumattackrange delaybetweenshots clipSize clipreloadtime damagetype weaponbonus projectileobject weaponrecoil weaponfirefx weaponfiresound projectilecollideswith'),('specialpower','specialpower.ini','enum reloadtime requiredscience publictimer radiuscursorradius detectiontime')]:
        if filename not in bylocal:continue
        for g in body_groups(bylocal[filename],cache,{tag}):
            facts=pick(fields(g['props']),keys.lower());row={'id':g['id'],'src':g['src'],'facts':facts}
            if tag=='weapon':weps[g['id']]=row
            else:special.append(row)
    byset=defaultdict(list)
    for obj in objs.values():
        # A direct or nested upgrade command-set reference is declared; preserve multiple possibilities without conflating availability.
        for cs in obj['facts'].get('commandset',[]):byset[cs].append(obj['id'])
    edges=[];out=defaultdict(set);bytarget=defaultdict(set)
    for cs,data in sets.items():
        for slot,b in data['slots']:
            button=buttons.get(b,{});target=button.get('target');command=button.get('command')
            if target and command in ('UNIT_BUILD','DOZER_CONSTRUCT'):
                edge={'commandset':cs,'slot':int(slot),'button':b,'operation':command,'target':target,'producers_declaring_set':sorted(byset.get(cs,[])),'set_src':data['src'],'button_src':button['src']};edges.append(edge)
                for producer in byset.get(cs,[]):out[producer].add(target);bytarget[target].add(producer)
    for pl in players:
        roots=[x for x in [pl['starting_building'],*pl['starting_units']] if x and x!='None'];seen=set(roots);q=deque(roots)
        while q:
            old=q.popleft()
            for child in out[old]-seen:seen.add(child);q.append(child)
        pl['direct_menu_reachability_ignoring_guards']=sorted(seen);pl['count']=len(seen)
    for obj in objs.values():
        obj['direct_producers']=sorted(bytarget.get(obj['id'],[]));obj['reachable_template_ids_ignoring_guards']=[p['id'] for p in players if obj['id'] in p['direct_menu_reachability_ignoring_guards']]
    form=Counter(o['declaration'] for o in objs.values());print(profile,len(objs),len(states),len(edges),len(bytarget),len(players),len(weps),form,'duplicates',dupes[:2]);
    # Keep large catalogues segmented by the factual input files; identifiers are unique across segments.
    for i in range(0,len(objs),400):jsonl(ROOT/f'{profile}-objects-{i//400+1:02d}.jsonl',list(objs.values())[i:i+400]);
    for i in range(0,len(states),3000):jsonl(ROOT/f'{profile}-presentation-states-{i//3000+1:02d}.jsonl',states[i:i+3000])
    for name,rows in [('menu-edges',edges),('faction-reachability',players),('weapons',list(weps.values())),('special-powers',special)]:jsonl(ROOT/f'{profile}-{name}.jsonl',rows)
    return {'declarations':len(objs),'per_kind':dict(form),'source_duplicates':dupes,'conditional_presentation_rows':len(states),'explicit_menu_slots_building_or_unit':len(edges),'targets_with_any_set_producer':len(bytarget),'targets_linked_to_buttons':len(set(x['target'] for x in edges)),'buttons_targeting_absent_object':sorted(set(x['target'] for x in edges)-set(objs)),'templates':len(players),'weapon_definitions':len(weps),'special_power_definitions':len(special),'parent_references_not_present':sorted(set(o['parent'] for o in objs.values() if o['parent'])-set(objs))}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',nargs='?',type=Path,default=ROOT/'.cache');cache=p.parse_args().cache;sources=json.loads((ROOT/'source-lock.json').read_text());stats={g:run(cache,g,sources) for g in ['generals','zh']};(ROOT/'sage-summary.json').write_text(json.dumps(stats,indent=2)+'\n')
