"""Read ordered Westwood INI declarations. Report typed data and follow selected art/weapon references.

A positive tech level or an Owner list is evidence for a menu investigation, not proof of a live build.
"""
from pathlib import Path
import argparse,re,json
from collections import defaultdict
from extract_early import jsonl
ROOT=Path(__file__).resolve().parent
REG={'InfantryTypes':'infantry','VehicleTypes':'vehicle','AircraftTypes':'aircraft','BuildingTypes':'building'}
FIELDS=set('Name UIName Owner RequiredHouses ForbiddenHouses Prerequisite PrerequisiteOverride PrerequisiteNegative TechLevel Cost Strength Sight Speed ROT Crusher Crushable Turret Voxel Image Naval NavalTargeting LandTargeting HoverAttack CanPassiveAquire CanRetaliate Occupier OccupyWeapon EliteOccupyWeapon OpenTopped Locomotor MovementZone MovementRestrictedTo SpeedType Landable AirSpace Dock PipScale Passengers Size SizeLimit DeploysInto UndeploysInto Deployer VehicleThief DeployFire DeployFireWeapon Gunner Ammo Reload Spawns SpawnsNumber SpawnRegenRate SpawnReloadRate JumpJet JumpjetSpeed BalloonHover ConsideredAircraft PowersUpBuilding PowersUpToLevel Upgrades SuperWeapon SuperWeapon2 Primary Secondary ElitePrimary EliteSecondary Armor EliteAbilities VeteranAbilities Trainable Category BuildCat Power Powered Capturable BuildLimit Factory WeaponsFactory FreeUnit ResourceGatherer Harvester Enslaves SlavesNumber Storage Weeder Refinery Crewed Cyborg Cloakable CloakingSpeed MobileFire CanDisguise PermaDisguise Agent Infiltrate Natural C4 Engineer Spy PsychicControl CanBeOccupied MaxNumberOccupants Repairable Bib Wall Insignificant EligibleForDelayKill Immune IsSelectableCombatant Unsellable BaseNormal IsSimpleDeployer DefaultToGuardArea DefaultToGuardArea DeployTime UnDeployTime Explosion DeathAnims DebrisAnims MaxDebris MinDebris DeathWeapon SelfHealing SelfHealUnitDelay AIBasePlanningSide AIBuildThis BuildTimeMultiplier HasStupidGuardMode TargetLaser FireAngle TurretCount WeaponCount StageCount PipWrap Parasite Fearless IsTilter IsBaseDefense AttackFriendlies GuardRange'.lower().split())
ART=set('Cameo AltCameo Voxel Sequence Crawls Remapable Remappable FireUp FireProne PrimaryFireFLH SecondaryFireFLH PBarrelLength SBarrelLength TurretOffset WalkFrames StandingFrames StartWalkFrame StartStandFrame Facings Rotates Buildup Foundation Height NewTheater Theater Arcing Shadow UseTurretShadow DamageFireOffset0 DeployingAnim DeployingAnimDamaged DeployingAnimLowPower DeployingAnimPowered SimpleDamage'.lower().split())
WEAP=set('Damage ROF Range MinimumRange Speed Burst Projectile Warhead Report Anim Bright LaserDuration IsLaser IsRailgun IsElectricBolt Lobber AmbientDamage Ranged OmniFire Spawner FireOnce CellRangefinding AreaFire'.lower().split())
WAR=set('Verses Spread CellSpread PercentAtMax Wall Wood Tiberium ProneDamage InfDeath AnimList Sparky Conventional MindControl Temporal Parasite PsychicDamage ElectricalAssault PenetratesBunker AffectsAllies'.lower().split())
PROJ=set('AA AG Arm Arcing Ballistic Inaccurate Invisible Image ROT Ranged High VeryHigh Airburst Proximity CourseLockDuration Dropping SubjectToCliffs SubjectToElevation SubjectToWalls'.lower().split())

def read_ini(rec,cache):
    sections={};ordered=defaultdict(list);current=None
    for line_num,line in enumerate((cache/rec['local']).read_bytes().decode('cp1252',errors='replace').splitlines(),1):
        clean=line.split(';',1)[0].strip();m=re.match(r'^\[([^\]]+)\]',clean)
        if m:
            current=m[1].strip().upper();sections.setdefault(current,{'fields':{},'src':rec['url']+f'#L{line_num}','origin':{}});continue
        if current is None or '=' not in clean:continue
        k,v=clean.split('=',1);k=k.strip();v=v.strip();sections[current]['fields'][k.lower()]=(k,v);sections[current]['origin'][k.lower()]=rec['local'];ordered[current].append((k,v,line_num,rec['url']))
    return sections,ordered

def merge(base,updates):
    out={k:{'fields':dict(v['fields']),'src':v['src'],'origin':dict(v['origin'])} for k,v in base.items()}
    for k,v in updates.items():
        if k in out:
            out[k]['fields'].update(v['fields']);out[k]['origin'].update(v['origin']);out[k]['overlay_src']=v['src']
        else:out[k]=v
    return out

def select(s,keys):return {name:value for k,(name,value) in s.get('fields',{}).items() if k in keys}
def fld(s,key):return s.get('fields',{}).get(key.lower(),('',None))[1]

def facts(profile,rules,regs,art):
    rows=[];weapons={};seqs={};missing=[]
    for registry,kind in REG.items():
        members=regs.get(registry.upper(),[]);seen={};
        for key,id_,number,url in members:
            if not key.isdigit():continue
            id_=id_.strip();seen.setdefault(id_,[]).append([key,url+f'#L{number}'])
        for ident,reg in seen.items():
            data=rules.get(ident.upper(),{});image=fld(data,'image') or ident;artrow=art.get(image.upper(),{});req=select(data,FIELDS);artfields=select(artrow,ART);wrefs={}
            for key,(_,v) in data.get('fields',{}).items():
                if re.fullmatch(r'(?:elite)?(?:primary|secondary|weapon\d+)|(?:elite)?occupyweapon|deathweapon',key,re.I) and v.strip().lower() not in ['none','','<none>']:
                    wrefs[key]=v; wdata=rules.get(v.upper(),{});resolved={'weapon':v,'src':wdata.get('src'),'properties':select(wdata,WEAP)}
                    for a,subkeys in [('projectile',PROJ),('warhead',WAR)]:
                        vid=fld(wdata,a);sub=rules.get((vid or '').upper(),{});resolved[a]={'id':vid,'src':sub.get('src'),'properties':select(sub,subkeys)}
                    if wdata.get('overlay_src'):resolved['overlay_src']=wdata['overlay_src']
                    weapons[v]=resolved
            if artrow:
                for k,(orig,val) in artrow['fields'].items():
                    if re.fullmatch(r'(?:activeanim(?:two|three|four)?|idleanim|bibshape|turretanim|powerup\d+anim|superanim|specialanim|productionanim|damagedanim|dockanim|muzzleflash\d+)(?:damaged|ySort|zAdjust|x|y)?',k,re.I):artfields[orig]=val
                seq=fld(artrow,'Sequence');sd=art.get((seq or '').upper(),{})
                if seq:seqs[seq]={'sequence':seq,'src':sd.get('src'),'actions':{k:v for _,(k,v) in sd.get('fields',{}).items() if re.fullmatch(r'[-\d,\sA-Z]+',v,re.I)}}
            row={'id':ident,'kind':kind,'registry_evidence':reg,'definition_src':data.get('src'),'properties':req,'weapon_slots':wrefs,'art_key':image,'art_src':artrow.get('src'),'visual_properties':artfields,'art_source_tier':'community compatibility comparison' if profile in ('ra2','yr') else 'historical versioned archive'}
            if not data:missing.append(ident)
            if data.get('overlay_src'):
                row['overlay_src']=data['overlay_src'];row['overlay_fields']=[name for k,(name,v) in data['fields'].items() if k in FIELDS and data['origin'][k].endswith('firestrm.ini')]
            if artrow.get('overlay_src'):row['art_overlay_src']=artrow['overlay_src']
            rows.append(row)
    return rows,list(weapons.values()),list(seqs.values()),missing

def run(cache):
    files={x['local']:x for x in json.loads((ROOT/'source-lock.json').read_text())};stats={}
    base,base_regs=read_ini(files['westwood/rules.ini'],cache);base_art,_=read_ini(files['westwood/art.ini'],cache);overlay,ovr_regs=read_ini(files['westwood/firestrm.ini'],cache);overlay_art,_=read_ini(files['westwood/artfs.ini'],cache)
    profiles=[('ts',base,base_regs,base_art),('fs',merge(base,overlay),{k:base_regs.get(k,[])+ovr_regs.get(k,[]) for k in set(base_regs)|set(ovr_regs)},merge(base_art,overlay_art))]
    for era,file,artfile in [('ra2','westwood/rules-original.ini','westwood/ra2-art.ini'),('yr','westwood/rulesmd-original.ini','westwood/yr-art.ini')]:
        r,rr=read_ini(files[file],cache);a,_=read_ini(files[artfile],cache) if artfile in files else ({},{});profiles.append((era,r,rr,a))
    for profile,rr,rg,art in profiles:
        rs,ws,ss,missing=facts(profile,rr,rg,art);jsonl(ROOT/(profile+'-definition-facts.jsonl'),rs);jsonl(ROOT/(profile+'-weapon-facts.jsonl'),ws)
        if ss:jsonl(ROOT/(profile+'-action-sequences.jsonl'),ss)
        stats[profile]={'registry_rows':len(rs),'by_kind':{k:sum(x['kind']==k for x in rs) for k in REG.values()},'with_definition':sum(bool(x['definition_src']) for x in rs),'with_resolved_visual_section':sum(bool(x['art_src']) for x in rs),'weapon_refs':len(ws),'weapons_resolved':sum(bool(x['src']) for x in ws),'art_sequences':len(ss),'missing_sections':missing}
        print(profile,stats[profile]);
    (ROOT/'isometric-summary.json').write_text(json.dumps(stats,indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',nargs='?',type=Path,default=ROOT/'.cache');run(p.parse_args().cache)
