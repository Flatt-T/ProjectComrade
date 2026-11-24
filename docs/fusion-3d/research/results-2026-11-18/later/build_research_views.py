#!/usr/bin/env python3
"""Derive readable indexes, class lists, lineage deltas, fixtures and Renegade map evidence.
Usage: python build_research_views.py official-sage.zip output_dir
"""
import argparse,collections,csv,hashlib,json,re,zipfile
from pathlib import Path
from urllib.parse import quote
from lxml import etree
GAMES={"tw":"Tiberium Wars","kw":"Kanes Wrath","ra3":"Red Alert 3","uprising":"Uprising","tt":"Tiberian Twilight"}
COMMIT="3aad8e412961ab543192ae70f8503dc8e178e095"
BASE="https://github.com/electronicarts/CnC_Modding_Support/blob/"+COMMIT+"/"
def link(s):return BASE+quote(s["path"])+"#L"+str(s["line"])
def rows(z,n):return [json.loads(b) for b in z.read(n).splitlines()]
def tsv(path,header,data):
    with path.open("w") as f:
        w=csv.writer(f,delimiter="\t",lineterminator="\n");w.writerow(header);w.writerows(data)
def dump(path,data):path.write_text(json.dumps(data,indent=2,ensure_ascii=False,sort_keys=True)+"\n")
def key(s):return s["path"],s["line"]
def create(archive,root):
    all_targets={};tables={};fixtures=[];factions=[];dispositions={}
    for k,g in GAMES.items():
        with zipfile.ZipFile(root/(k+"-source-facts.zip")) as z:
            obs=rows(z,'objects.jsonl');edges=rows(z,'production-links.jsonl');commands=rows(z,'commands.jsonl')
        obj={key(o['source']):o for o in obs};target=collections.defaultdict(list)
        for e in edges:
            if e.get('target_source'):target[key(e['target_source'])].append(e)
        output=[];decisions=collections.Counter();linked_by_producer=collections.defaultdict(set)
        idx=[]
        for o in obs:
            p=o['source']['path'];cl=o.get('effective_scalar',{});s=o['source'];rels=target.get(key(s),[]);pr=sorted({e['producer'] for e in rels}); staticpr=sorted({e['producer'] for e in rels if e.get('producer_static_include_reachable') and e.get('target_static_include_reachable')})
            cost=cl.get('BuildCost') or '|'.join(a.get('Account','')+'='+a.get('Amount','') for a in o.get('account_costs',[])); family=cl.get('Side','')
            if '/Obsolete/' in p:disp='obsolete_directory_candidate'
            elif '/Maps/' in p or '/MapSpecific/' in p:disp='map_scoped_declaration'
            elif '/BaseObjects/' in p or '/Templates/' in p:disp='template_definition'
            elif staticpr:disp='core_graph_build_target'
            elif pr:disp='production_reference_outside_both_static_ends'
            elif o['static_include_reachable']:disp='static_nonpurchase_or_unresolved_availability'
            else:disp='other_source_declaration_availability_unverified'
            decisions[disp]+=1;idx.append([o['id'],family,cl.get('EditorSorting',''),disp,s['path'],s['line']])
            if not rels:continue
            for producer in staticpr:linked_by_producer[producer].add(o['id'])
            output.append([o['id'],family,cl.get('EditorName',''),cl.get('EditorSorting',''),cost,cl.get('BuildTime',''),','.join(staticpr),','.join(pr),o['parent_status'],disp,link(s)])
        tsv(root/(k+'-production-targets.tsv'),['source_id','source_side','editor_name','editor_sorting','source_cost_or_account_expression','source_build_time','producers_with_both_endpoints_in_static_include_walk','all_source_producers','parent_resolution','disposition','object_source'],output)
        dispositions[k]=dict(decisions)
        packed=root/(k+"-object-dispositions.tsv.gz")
        import gzip,io
        b=io.StringIO();w=csv.writer(b,delimiter="\t",lineterminator="\n");w.writerow(['source_id','source_side','editor_sorting','disposition','source_path','line']);w.writerows(idx);packed.write_bytes(gzip.compress(b.getvalue().encode(),mtime=0))
        all_targets[k]={r[0] for r in output};tables[k]=(obs,commands,edges)
        for pr,tg in sorted(linked_by_producer.items()):factions.append([k,pr,len(tg),' '.join(sorted(tg))])
    tsv(root/'producer-menus.tsv',['title_key','source_producer_id','target_count','target_ids_present_in_extracted_static_menu_union'],factions)
    dump(root/'disposition-counts.json',dispositions)
    delta=[]
    for a,b in [('tw','kw'),('ra3','uprising')]:
        for tg in sorted(all_targets[a]|all_targets[b]):
            val='common_source_id' if tg in all_targets[a]&all_targets[b] else (b+'_only' if tg in all_targets[b] else a+'_only')
            delta.append([a,b,tg,val])
    tsv(root/'expansion-target-deltas.tsv',['base','expansion','source_id','production_graph_membership'],delta)
    clsrows=[];lookup=collections.defaultdict(list)
    for c in tables['tt'][1]:lookup[c['id']]+=c.get('targets',[])
    with zipfile.ZipFile(archive) as z:
        for path in sorted(n for n in z.namelist() if re.search(r'Tiberian Twilight/Xml/(GDI|NOD)/BuildAll(GDI|Nod)Units\.xml$',n,re.I)):
            src=path.split('/',1)[1];node=etree.fromstring(z.read(path));side=src.split('/')[2]
            for tier in node:
                if not isinstance(tier.tag,str):continue
                role=None
                for el in tier:
                    if not isinstance(el.tag,str):
                        label=(el.text or '').strip()
                        if label in ['Offense','Defense','Support']:role=label
                    elif el.tag.endswith('}Cmd'):
                        cmd=(el.text or '').strip();clsrows.append([side,tier.tag.split('}')[-1],role,cmd,' '.join(sorted(set(lookup[cmd]))),link({'path':src,'line':el.sourceline})])
        tsv(root/'c4-class-tier-commands.tsv',['side','tier_element','nearest_class_heading_comment','logic_command','resolved_object_targets','source'],clsrows)
        maps=[]
        for n in sorted(z.namelist()):
            p=n.split('/',1)[1]
            if not p.startswith('Renegade/Maps/') or not p.upper().endswith('.LVL'):continue
            raw=z.read(n);hits=collections.defaultdict(list)
            for m in re.finditer(rb'(?<![a-zA-Z0-9_])(mp_[a-zA-Z0-9_]+|Nod_Turret_MP|pct_zone_[a-zA-Z_]+)(?:\.(\d+))?(?![a-zA-Z0-9_])',raw,re.I):
                label=m[1].decode();hits[label].append({'offset':m.start(1),'suffix':m[2].decode() if m[2] else None})
            maps.append({'path':p,'git_blob_sha1':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'level_category':p.split('/')[2],'source':BASE+quote(p),'matching_ascii_markers':hits})
        dump(root/'renegade-map-markers.json',maps)
    # Examples use source observations as input; all proposed Fusion checks are explicitly authored.
    scenes={
      'tw':[('AlienAnnihilatorTripod','Turn an original three-legged walker while it advances, stops, receives EMP, resumes, dies and becomes a recoverable wreck. Inspect footfall synchronisation at tactical zoom; an animation event cannot deal extra damage.'),('GDIMammoth','Select a mixed armour column, traverse a slope and fire at a legal target. Preserve hull mass, turret independence and a visible discharge cue. Record the distinct attack-domain slots and their prerequisites.'),('NODStealthTank','Reveal a moving vehicle via a detector, fire and reacquire concealment under profile rules. Compare two opposing clients for hidden effects and target identity.')],
      'kw':[('SteelTalonsBehemoth','Produce through its subfaction factory, occupy the vehicle where the source permits, fire, destroy and inspect the wreck/occupant outcomes. Compare the appearance and role against the related GDI artillery unit.'),('AlienEradicatorHexapod','Exercise loadout/weapon-state and gait combinations. Keep occupied state distinct from base model; replay must retain loadout and event order.')],
      'ra3':[('JapanAntiInfantryVehicle','Exercise both ground and air command states. Resolve target legality, selected identity and pose transition across the change. Validate every orientation at tactical zoom.'),('AlliedAntiGroundAircraft','Fly a strike, expend ordnance, return and rearm. Judge turn radius and attack readability against the source profile while checking fog and team identification.')],
      'uprising':[('AlliedFutureTank','Exercise basic and alternate fire and record variant aim/effect states. Test the expansion-specific prerequisite and resource account.'),('JapanFortressShip','Issue a ship order and a transformation order near a coast. Follow the newly valid surface and attack envelope. Preserve selection and ownership through the form change.')],
      'tt':[('GDICrawlerAStructure','Pack, relocate, deploy, produce from the correct class menu, then recover after a save. Preserve team/class/objective state and prohibit production on the wrong lifecycle gate.'),('GDIAircraftA','Exercise a GDI Support tier selection, queue spend, flight, missile cycles and return to a legal order. Scope all numeric balance to the chosen profile.')]
    }
    for k,entries in scenes.items():
        for ident,scene in entries:
            ob,cmd,edges=tables[k];candidates=[o for o in ob if o['id']==ident and o['static_include_reachable'] and '/Maps/' not in o['source']['path'] and '/Obsolete/' not in o['source']['path']]
            if len(candidates)!=1:raise ValueError((k,ident,len(candidates)))
            o=candidates[0];fields=['id','source','parent','parent_status','effective_scalar','account_costs','tech','body','movement','weapons','models','animation','clip_events','behavior_classes','related_forms']
            fixtures.append({'title_key':k,'object':{f:o[f] for f in fields if f in o},'production_proof':next((e for e in edges if e['target']==ident and e['producer_static_include_reachable'] and e.get('target_static_include_reachable')),None),'authored_fusion_scene':scene,'source':link(o['source']),'status':'source-observed / Fusion reference scene specified / no runtime certification'})
    dump(root/'representative-gameplay-and-art-fixtures.json',fixtures)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);a=p.parse_args();create(a.archive,a.output)
