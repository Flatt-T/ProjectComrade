#!/usr/bin/env python3
"""Build factual indexes from the EA mod-support ZIP. Requires Python 3.10+ and lxml 5+.
Usage: python extract_sage.py official-source.zip output_dir
No source XML, script bodies, sounds, texture pixels or mesh data are copied to the output.
"""
import argparse, collections, copy, functools, hashlib, io, json, posixpath, re, zipfile
from pathlib import Path
from lxml import etree

COMMIT = "3aad8e412961ab543192ae70f8503dc8e178e095"
GAMES = {"Tiberium Wars":"tw", "Kanes Wrath":"kw", "Red Alert 3":"ra3", "Uprising":"uprising", "Tiberian Twilight":"tt"}
NS = "uri:ea.com:eala:asset"
XML = etree.XMLParser(remove_comments=True, remove_pis=True, resolve_entities=False, no_network=True, collect_ids=False)
ATTR = "Side EditorSorting EditorName SelectPortrait ButtonImage BuildCost BuildTime CommandPoints CommandSet ProductionQueueType UnitCategory WeaponCategory TransportSlotCount EnergyProduction RadarPriority Buildable KindOf ThreatLevel".split()
INHERITABLE = [k for k in ATTR if k!="KindOf"]
BUILD = {"UNIT_BUILD","CONSTRUCTION_YARD_CONSTRUCT","DOZER_CONSTRUCT"}
DEFINITION_TYPES = {"GameObject","LogicCommand","LogicCommandSet","PlayerTemplate","WeaponTemplate","ArmorTemplate","LocomotorTemplate","UpgradeTemplate","SpecialPowerTemplate"}
def local(tag):
    return tag.rsplit("}",1)[-1]
def unique(values):
    return list(dict.fromkeys(v for v in values if v))
def compact(obj):
    return {k:v for k,v in obj.items() if v is not None and v!="" and v!=[] and v!={}}
def attrs(element, names):
    return compact({k:element.get(k) for k in names})
def jsonline(row):
    return json.dumps(row,ensure_ascii=False,separators=(",",":"))
def member_name(path):
    return path.split("/",1)[1]
def hash_blob(raw):
    return hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
def record_source(path, el):
    return {"path":path,"line":el.sourceline}
def children(root,t):
    return root.findall("{"+NS+"}"+t)
def directtexts(root,t):
    return [(c.text or "").strip() for c in children(root,t) if (c.text or "").strip()]
def game_object(el):
    row={"id":el.get("id"),"parent":el.get("inheritFrom"),"declared":attrs(el,ATTR),"name_key":next(iter(directtexts(el,"DisplayName")),None)}
    # Separate authored local declarations from synthetically inferred effective fields.
    row["tech"]=[]; row["movement"]=[];row["body"]=[];row["weapons"]=[];row["armor"]=[];row["models"]=[];row["animation"]=[];row["clip_events"]=[];row["behavior_classes"]=[];row["geometry"]=[];row["command_set_overrides"]=[];row["xi_fragments"]=[];row["upgrades"]=[];row["audio_events"]=[];row["related_forms"]=[];row["production_modules"]=[];row["vision"]=[];row["account_costs"]=[]
    for node in el.iterdescendants():
        tag=local(node.tag);pr=node.getparent();pt=local(pr.tag);a=node.attrib
        if tag in ("RequiredObject","ForbiddenObject","NeededUpgrade","ForbiddenUpgrade","ObjectFilter") and any(local(x.tag)=="GameDependency" for x in node.iterancestors()):
            row["tech"].append(compact({"kind":tag,"value":(node.text or "").strip(),**attrs(node,("Object","Rule","Relationship","StatusBitFlags","Include","Exclude")),"group":pt}))
        elif tag=="BuildCost" and pt=="ObjectResourceInfo":row["account_costs"].append(attrs(node,("Account","Amount")))
        elif tag=="LocomotorSet":row["movement"].append(attrs(node,("Locomotor","Condition","Speed","SpeedType")))
        elif pt=="Body":row["body"].append(compact({"type":tag,**attrs(node,("MaxHealth","InitialHealth","MaxHealthDamaged","MaxHealthReallyDamaged","InitialMaxHealth"))}))
        elif tag=="Weapon" and node.get("Template"):row["weapons"].append(attrs(node,("Template","Ordering","ObjectStatus","WeaponSlotID")))
        elif tag=="ArmorSet":row["armor"].append(attrs(node,("Armor","Conditions","DamageFX")))
        elif tag in ("ModelConditionState","ModelConditionAudioLoopClientBehavior"): 
            if tag=="ModelConditionState":
                models=[a.get("Name") for a in node.iterdescendants() if local(a.tag)=="Model" and a.get("Name")]
                row["models"].append(compact({"conditions":node.get("ConditionsYes"),"without":node.get("ConditionsNo"),"kind":node.get("ParseCondStateType"),"models":unique(models)}))
        elif tag in ("AnimationState","TransitionState"):
            animations=[attrs(a,("AnimationName","AnimationMode","AnimationBlendTime","Distance","AnimationSpeedFactorMin","AnimationSpeedFactorMax","AnimNickName")) for a in node if local(a.tag)=="Animation"]
            row["animation"].append(compact({"when":node.get("ConditionsYes"),"without":node.get("ConditionsNo"),"state":node.get("StateName"),"kind":node.get("ParseCondStateType"),"clips":animations,"has_script":any(local(a.tag)=="Script" for a in node) or None}))
            for ev in node:
                if local(ev.tag)=="FXEvent":
                    row["clip_events"].append(compact({"when":node.get("ConditionsYes"),"state":node.get("StateName"),**attrs(ev,("Frame","Effect","Bone","FireWhenSkipped"))}))
        elif pt in ("Behaviors","ClientBehaviors","AI"):
            row["behavior_classes"].append(tag)
            if "Production" in tag or "Queue" in tag:row["production_modules"].append(compact({"type":tag,**attrs(node,("Type","NumDoorAnimations","NumberOfExitPaths","GiveNoXP","MaxQueueEntries","ConstructionCompleteDuration","MaxQueueEntries"))}))
            if node.get("CommandSet"):row["command_set_overrides"].append({"module":tag,"set":node.get("CommandSet")})
        elif tag in ("Shape","GeometryShape") and pt=="Geometry":row["geometry"].append(attrs(node,("Type","MajorRadius","MinorRadius","Height","Name")))
        elif tag=="include" and node.get("href"):row["xi_fragments"].append(node.get("href"))
        elif tag=="DisplayUpgrade":row["upgrades"].append((node.text or "").strip())
        elif tag=="VisionInfo":row["vision"].append(attrs(node,("VisionRange","ShroudClearingRange")))
        if pt in ("AudioArrayVoice","AudioArraySound") and (node.get("Sound") or node.get("Audio") or (node.text or "").strip()):
            row["audio_events"].append(compact({"slot":tag,**attrs(node,("Sound","Audio","VoiceType","SoundType")),"ref":(node.text or "").strip()}))
        for key in ("ObjectToSpawn","ObjectName","ObjectToCreate","ObjectToTransformInto","TransformToObject","TransformTo","UnpackingObject","PackedObject","HuskTemplate","EggTemplate","ObjectThatConditionsThisObject","SpawnTemplate","ContainerTemplate","ObjectToDeploy","ReplacementTemplate","PassengerTemplate","UnitType","HordeMember","ObjectToBecome"):
            if key in a:row["related_forms"].append({"module":tag,"attribute":key,"target":a[key]})
    row["behavior_classes"]=unique(row["behavior_classes"]);row["upgrades"]=unique(row["upgrades"])
    return compact(row)
def parameters(el,tag):
    fields={"WeaponTemplate":"AttackRange MinimumAttackRange WeaponSpeed MinWeaponSpeed ClipSize ShotsPerBarrel AutoReloadsClip RequiredAntiMask ForbiddenAntiMask Flags RadiusDamageAffects FireFX FireSound","ArmorTemplate":"DefaultArmor","LocomotorTemplate":"Surfaces TurnTimeSeconds TurnTime SecondsToReachMaximumSpeed Acceleration MaxSpeed Braking Speed TurnRate MinMoveSpeed Appearance","UpgradeTemplate":"Type BuildCost BuildTime DisplayName ResearchSound","SpecialPowerTemplate":"ReloadTime Enum NameOfVoiceNameToUse TargetType Flags PublicTimer","PlayerTemplate":"Side Type StartingBuilding StartingUnit DisplayNameToken PreferredColor StartMoney"}.get(tag,"").split()
    row=compact({"id":el.get("id"),"parent":el.get("inheritFrom"),"parameters":attrs(el,fields)})
    # Keep selected observable operands. Script text and copyrighted media excluded.
    chosen={"DamageNugget":"Damage Radius DamageType DeathType DamageFXType DamageScalar","Damage":"MinSeconds MaxSeconds","FiringDuration":"MinSeconds MaxSeconds","ClipReloadTime":"MinSeconds MaxSeconds","PreAttackDelay":"MinSeconds MaxSeconds","ProjectileNugget":"WarheadTemplate ProjectileTemplate","Armor":"Damage Scalar DamageType Percent","StartingUnit":"Unit Type Quantity","StartingBuilding":"Type"}
    facts=[]
    for n in el.iterdescendants():
        t=local(n.tag)
        if t in chosen:facts.append(compact({"kind":t,**attrs(n,chosen[t].split()),"value":(n.text or "").strip() or None}))
    if facts:row["operands"]=facts
    return row
def writezip(path,tables):
    with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as out:
        for name,rows in sorted(tables.items()):
            zi=zipfile.ZipInfo(name,date_time=(2025,2,27,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;zi.external_attr=0o100644<<16
            raw=("\n".join(jsonline(r) for r in rows)+"\n").encode() if rows else b""
            out.writestr(zi,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
def extract(z,game,out):
    files={member_name(i.filename):i for i in z.infolist() if member_name(i.filename).startswith(game+"/Xml/") and member_name(i.filename).lower().endswith(".xml")}
    fileidx={path.split("/Xml/",1)[1].lower():path for path in files}
    defs=collections.defaultdict(list); ob=[];cms=[];sets=[]; params=[]; sources=[];errors=[];normalizations=[];include_edges=collections.defaultdict(set);miss_inc=collections.Counter();defines=[]
    xifail=[];xifiles={};xi_resolved=0;xi_receipts=[]
    @functools.lru_cache(maxsize=200)
    def fragment(path):
        return etree.fromstring(z.read(files[path]),XML)
    def expand(node, context, stack=()):
        nonlocal xi_resolved
        for xi in list(node.iter("{http://www.w3.org/2001/XInclude}include")):
            href=xi.get("href",""); pointer=xi.get("xpointer","")
            rel=href[5:] if href.upper().startswith("DATA:") else posixpath.join(posixpath.dirname(context.split("/Xml/")[1]),href)
            dst=fileidx.get(posixpath.normpath(rel.replace(chr(92),"/")).lower());xp=re.fullmatch(r"(?:xmlns\(n=uri:ea.com:eala:asset\)\s*)?xpointer\((.*)\)",pointer)
            try:
                if dst is None or dst in stack:raise ValueError("missing or cyclic fragment")
                parent=xi.getparent();position=parent.index(xi);tree=fragment(dst)
                selected=tree.xpath(xp[1],namespaces={"n":NS}) if xp else ([tree] if not pointer else [])
                if not selected:raise ValueError("unmatched selector")
                inserted=0
                for ix,child in enumerate(selected):
                    imported=copy.deepcopy(child);imported.set("_source_path",dst)
                    holder=etree.Element("ResearchTemporaryWrapper");holder.append(imported);expand(holder,dst,stack+(dst,))
                    for part in list(holder):
                        parent.insert(position+inserted,part);inserted+=1
                xi_receipts.append({"from":context,"line":xi.sourceline,"to":dst,"selector":pointer,"nodes":len(selected)})
                xifiles[dst]=True;parent.remove(xi);xi_resolved+=1
            except (ValueError,etree.Error) as exc:
                xifail.append({"from":context,"line":xi.sourceline,"ref":href,"selector":pointer,"error":str(exc)})
    for path,info in sorted(files.items()):
        raw=z.read(info)
        try:root=etree.fromstring(raw,XML)
        except etree.XMLSyntaxError as e:
            repaired = re.sub(rb'(xmlns:[A-Za-z]+="[^"]*?) +(")',rb'\1\2',raw)
            if b"XML declaration allowed only at the start" in e.msg.encode():
                repaired=re.sub(rb'<\?xml[\s\S]*?\?>',b'',repaired,count=1)
            if raw==repaired:
                errors.append({"path":path,"blob":hash_blob(raw),"line":e.position[0],"reason":e.msg});continue
            try:root=etree.fromstring(repaired,XML)
            except etree.XMLSyntaxError as e2:
                errors.append({"path":path,"blob":hash_blob(raw),"line":e2.position[0],"reason":e2.msg});continue
            normalizations.append({"path":path,"blob":hash_blob(raw),"raw_failure":e.msg,"operation":"normalize namespace URI trailing ASCII space or omit misplaced XML prolog for research parse; physical source preserved"})
        for inc in root.iter():
            t=local(inc.tag)
            if t not in ("Include","include"):continue
            ref=inc.get("source") or inc.get("href") or ""
            if not ref.lower().endswith(".xml"):continue
            if ":" in ref and not ref.upper().startswith("DATA:"):continue
            rel=ref[5:] if ref.upper().startswith("DATA:") else posixpath.join(posixpath.dirname(path.split("/Xml/")[1]),ref)
            target=fileidx.get(posixpath.normpath(rel.replace("\\","/")).lower())
            if target:include_edges[path].add(target)
            else:miss_inc[ref]+=1
        wanted=[c for c in root if local(c.tag) in DEFINITION_TYPES and c.get("id")]
        for c in root:
            if local(c.tag)=="Defines":
                for d in c:
                    if d.get("name"):defines.append(compact({"id":d.get("name"),"value":d.get("value") or (d.text or "").strip(),"source":record_source(path,d)}))
        if not wanted:continue
        src={"path":path,"blob":hash_blob(raw),"declarations":len(wanted)};sources.append(src)
        for c in wanted:
            tag=local(c.tag); source=record_source(path,c)
            if tag in ("LogicCommandSet","GameObject"):expand(c,path)
            if tag=="GameObject":r=game_object(c);ob.append(r)
            elif tag=="LogicCommand":
                r=compact({"id":c.get("id"),"parent":c.get("inheritFrom"),"type":c.get("Type"),"targets":directtexts(c,"Object"),"power":directtexts(c,"SpecialPower"),"upgrade":directtexts(c,"Upgrade")});cms.append(r)
            elif tag=="LogicCommandSet":
                r=compact({"id":c.get("id"),"parent":c.get("inheritFrom"),"cmds":directtexts(c,"Cmd"),"xml_ops":unique([v for child in c for k,v in child.attrib.items() if 'joinAction' in k])});r["command_sources"]={k.text.strip():{"path":k.get("_source_path",path),"line":k.sourceline} for k in children(c,"Cmd") if (k.text or "").strip()};sets.append(r)
            else:r=parameters(c,tag);params.append(r)
            r.update({"class":tag,"source":source});defs[(tag,r["id"])].append(r)
    def resolve(kind,key,ctx,exclude=None):
        items=[v for v in defs.get((kind,key),[]) if v is not exclude]
        if len(items)==1:return items[0]
        same=[v for v in items if v["source"]["path"]==ctx]
        if len(same)==1:return same[0]
        linked=[v for v in items if v["source"]["path"] in include_edges.get(ctx,set())]
        if len(linked)==1:return linked[0]
        static=[v for v in items if v["source"]["path"] in reach]
        return static[0] if len(static)==1 else None
    anchors=[fileidx[k] for k in ("staticgameobjects.xml","static.xml","global.xml","ep1/staticgameobjects_ep1.xml","ep1/static_ep1.xml","ep1/global_ep1.xml") if k in fileidx]
    reach=set(anchors);queue=list(anchors)
    while queue:
        for p in include_edges.get(queue.pop(),set()):
            if p not in reach:reach.add(p);queue.append(p)
    inher_fail=collections.Counter()
    def chain(o):
        result=[o];seen={(o["source"]["path"],o["id"])};status="complete"
        while result[-1].get("parent"):
            last=result[-1]; key=last["parent"]; par=resolve(last["class"],key,last["source"]["path"],exclude=last)
            if not par:status="referenced_parent_missing_or_ambiguous";break
            pair=(par["source"]["path"],par["id"])
            if pair in seen:status="cycle";break
            result.append(par);seen.add(pair)
        return result,status
    production=[];object_index=[]
    for o in ob:
        ancestry,status=chain(o);inher_fail[status]+=1
        o["parent_chain"]=[{"id":v["id"],**v["source"]} for v in ancestry[1:]];o["parent_status"]=status
        eff={};origin={}
        for key in INHERITABLE:
            for base in ancestry:
                if key in base.get("declared",{}):
                    eff[key]=base["declared"][key];origin[key]=base["id"];break
        o["effective_scalar"]=eff;o["inherited_scalar_origin"]={k:v for k,v in origin.items() if v!=o["id"]};o["static_include_reachable"]=o["source"]["path"] in reach
        object_index.append(compact({"id":o["id"],"side":eff.get("Side"),"sorting":eff.get("EditorSorting"),"category":eff.get("UnitCategory"),"parent":o.get("parent"),"command_set":eff.get("CommandSet"),"cost":eff.get("BuildCost"),"time":eff.get("BuildTime"),"source":o["source"],"graph_reachable":o["static_include_reachable"]}))
        setid=eff.get("CommandSet")
        if not setid:continue
        sr=resolve("LogicCommandSet",setid, o["source"]["path"])
        if sr is None:continue
        sc,scstatus=chain(sr)
        # Inherited members are labelled tentative unless independently declared in effective set.
        for idx,s in enumerate(sc):
            for cmd in unique(s.get("cmds",[])):
                c=resolve("LogicCommand",cmd,s["source"]["path"])
                if c is None:continue
                cc,ccstatus=chain(c);ctype=next((x["type"] for x in cc if x.get("type")),None);targets=next((x["targets"] for x in cc if x.get("targets")),[])
                if ctype not in BUILD:continue
                for target in targets:
                    dst=resolve("GameObject",target,c["source"]["path"])
                    production.append(compact({"producer":o["id"],"producer_source":o["source"],"command_set":setid,"set_declaring_cmd":s["id"],"set_source":s["source"],"command_membership_source":s.get("command_sources",{}).get(cmd),"set_inherited_membership":idx>0,"set_uses_join_operations":any(v.get("xml_ops") for v in sc),"command":cmd,"type":ctype,"command_source":c["source"],"target":target,"target_source":dst["source"] if dst else None,"producer_static_include_reachable":o["static_include_reachable"],"target_static_include_reachable":dst["source"]["path"] in reach if dst else None}))
    title=GAMES[game];tables={"objects.jsonl":ob,"object-index.jsonl":object_index,"commands.jsonl":cms,"command-sets.jsonl":sets,"production-links.jsonl":production,"parameters.jsonl":params,"source-files.jsonl":sources,"xml-parse-exceptions.jsonl":errors,"defines.jsonl":defines,"lexical-normalizations.jsonl":normalizations,"xi-inclusion-edges.jsonl":xi_receipts,"xi-exceptions.jsonl":xifail}
    writezip(out/(title+"-source-facts.zip"),tables)
    count=lambda key:sum(len(o.get(key,[])) for o in ob)
    return {"title":game,"key":title,"xml_files":len(files),"xml_parse_exceptions":len(errors),"source_files_with_target_declarations":len(sources),"game_object_declarations":len(ob),"distinct_object_ids":len({o['id'] for o in ob}),"static_include_roots":anchors,"static_graph_object_declarations":sum(o["static_include_reachable"] for o in ob),"parent_resolution":dict(inher_fail),"logic_commands":len(cms),"logic_sets":len(sets),"production_links":len(production),"distinct_explicit_production_targets":len({r["target"] for r in production}),"distinct_linked_targets_with_resolved_object":len({r["target"] for r in production if r.get("target_source")}),"static_to_static_distinct_targets":len({r["target"] for r in production if r["producer_static_include_reachable"] and r.get("target_static_include_reachable")}),"local_or_included_model_conditions":count("models"),"successful_xi_expansions":xi_resolved,"unresolved_xi_references":len(xifail),"local_or_included_animation_states":count("animation"),"local_clip_events":count("clip_events"),"parameter_declarations":len(params),"defines":len(defines),"unresolved_data_or_relative_xml_references":sum(miss_inc.values()),"source_archive":"https://github.com/electronicarts/CnC_Modding_Support/tree/"+COMMIT,"object_declared_or_uniquely_inherited_side_counts":dict(collections.Counter((o["effective_scalar"].get("Side") or "UNSPECIFIED") for o in ob)),"tables":{k:len(v) for k,v in tables.items()}}
def main():
    a=argparse.ArgumentParser();a.add_argument("archive",type=Path);a.add_argument("output",type=Path);args=a.parse_args();args.output.mkdir(exist_ok=True,parents=True)
    rows=[]
    with zipfile.ZipFile(args.archive) as z:
        if not all('/' in n and n.split('/')[0].endswith(COMMIT) for n in z.namelist()):raise ValueError("Unexpected archive root; use pinned commit")
        for g in GAMES:
            record=extract(z,g,args.output);rows.append(record);print(g,{k:record[k] for k in ("xml_files","xml_parse_exceptions","game_object_declarations","production_links","local_or_included_animation_states")},flush=True)
    (args.output/"sage-summary.json").write_text(json.dumps({"commit":COMMIT,"titles":rows},indent=2,ensure_ascii=False)+"\n")
if __name__=="__main__":main()
