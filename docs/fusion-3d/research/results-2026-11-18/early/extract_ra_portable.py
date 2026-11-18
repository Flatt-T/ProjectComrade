"""Read bounded MIX members from the fingerprinted PortableRA comparison package. Includes no installer execution."""
import argparse
from collections import Counter,defaultdict
from hashlib import sha256
from pathlib import Path
from struct import unpack_from
from zipfile import ZipFile
import json
import re
from extract_early import jsonl
ROOT=Path(__file__).resolve().parent
URL='https://iran.cnc-comm.com/ra/PortableRA.zip'
EXPECTED='a043b86b3a09e3e8bdf099f1a80038a7efa789f90c7176fd35b47ae29a8ca234'
RULE_FILES=['RULES.INI','AFTRMATH.INI','MPLAYER.INI','MISSION.INI']
FACT_KEYS=set('Cost Strength TechLevel Prerequisite Primary Secondary Owner Armor Sight Speed ROT Passengers Ammo Power Storage Image Crewed Capturable Repairable Explodes Cloakable DoubleOwned Turreted Tracked WaterBound GuardRange RadarInvisible Underwater SelfHealing PipScale Infiltrate GuardRange Crusher Adjacent Bib Damage ROF Range Warhead Projectile Burst Spread Verses Wall Wood Ore IsElectric WeaponStops NoMovingFire NewUnitsEnabled EngineerDamage EngineerCaptureLevel MTankDistance QuakeUnitDamage QuakeBuildingDamage QuakeInfantryDamage QuakeDelay CarrierLaunchDelay ChronoTankDuration IronCurtain BuildSpeed GrowthRate RepairPercent RefundPercent GapRegenInterval'.lower().split())

def legacy_id(n):
    data=n.upper().encode('ascii');data+=b'\0'*(-len(data)%4);result=0
    for i in range(0,len(data),4):result=(((result<<1)|(result>>31))+int.from_bytes(data[i:i+4],'little'))&0xffffffff
    return result

def members(data):
    if len(data)<10 or data[:4] not in (b'\0'*4,b'\0\0\1\0'):return
    count,length=unpack_from('<HI',data,4);start=10+12*count
    if count>2000 or start+length>len(data):return
    for i in range(count):
        num,offset,size=unpack_from('<III',data,10+12*i)
        if offset+size>length:return
        yield num,start+offset,data[start+offset:start+offset+size]

def sections(data):
    out={};key=None
    for line_num,line in enumerate(data.decode('cp1252',errors='replace').splitlines(),1):
        line=line.partition(';')[0].strip();m=re.fullmatch(r'\[([^\]]+)\]',line)
        if m:
            key=m[1].upper();out.setdefault(key,{'line':line_num,'kv':{}})
        elif key and '=' in line:
            k,v=line.split('=',1);out[key]['kv'][k.strip()]=v.strip()
    return out

def run(zip_path):
    assert sha256(zip_path.read_bytes()).hexdigest()==EXPECTED
    named={legacy_id(n):n for n in RULE_FILES};tables={};maps=[]
    with ZipFile(zip_path) as z:
        for path in ['PortableRA/main.mix','PortableRA/redalert.mix']:
            buf=z.read(path)
            for outer,offset,part in members(buf):
                for inner,inner_offset,content in members(part):
                    if inner not in named and b'[basic]' not in content.lower():continue
                    d=sections(content)
                    if inner not in named and not ('BASIC'in d and 'MAP'in d):continue
                    key={'zip_member':path,'mix_parent_id':f'{outer:08x}','mix_member_id':f'{inner:08x}','member_offset_in_outer_zip_member':offset+inner_offset,'member_bytes':len(content),'member_sha256':sha256(content).hexdigest()}
                    if inner in named:tables[named[inner]]=(key,d)
                    else:maps.append((key,d))
    assert set(tables)==set(RULE_FILES)
    roster={r['id'].upper() for r in map(json.loads,(ROOT/'ra1-definition-facts.jsonl').read_text().splitlines())}
    filename_aliases=defaultdict(set)
    for name in tables['MISSION.INI'][1]:
        name=name if name.endswith('.INI') else name+'.INI';filename_aliases[legacy_id(name)].add(name)
    # Record only hash-matching candidate filenames. Westwood's ID is not collision resistant.
    for side in 'GUMF':
        for num in range(100):
            for variant in ['EA','EB','EC','ED','WA','WB','WC','WD']:
                name=f'SC{side}{num:02d}{variant}.INI';filename_aliases[legacy_id(name)].add(name)
    rule_rows=[]
    for filename in RULE_FILES[:-1]:
        meta,d=tables[filename]
        for ident,sec in d.items():
            facts={k:v for k,v in sec['kv'].items() if k.lower() in FACT_KEYS}
            if facts:rule_rows.append({'layer':filename,'id':ident,'section_line':sec['line'],'ea_constructor_id_match':ident in roster,'properties':facts})
    map_rows=[]
    for meta,d in maps:
        get=lambda name:d.get(name,{}).get('kv',{})
        counts={}
        for section in ['UNITS','INFANTRY','SHIPS','AIRCRAFT','STRUCTURES']:
            count=Counter()
            for v in get(section).values():
                parts=v.split(',')
                if len(parts)>=2:count[parts[0]+':'+parts[1]]+=1
            if count:counts[section.lower()]=dict(sorted(count.items()))
        map_rows.append({**meta,'filename_hash_candidates':sorted(filename_aliases[int(meta['mix_member_id'],16)]),'name':get('BASIC').get('Name'),'player':get('BASIC').get('Player'),'grid':{k:v for k,v in get('MAP').items() if k.lower() in ['theater','x','y','width','height']},'preplaced_by_house_and_type':counts,'map_overrides':{sec:{k:v for k,v in data['kv'].items() if k.lower() in FACT_KEYS} for sec,data in d.items() if sec in roster and any(k.lower() in FACT_KEYS for k in data['kv'])},'terrain_prop_placements':dict(Counter(get('TERRAIN').values())),'map_pack_chunks':len(get('MAPPACK')),'overlay_pack_chunks':len(get('OVERLAYPACK')),'script_team_definitions':len(get('TEAMTYPES')),'trigger_definitions':len(get('TRIGS'))})
    jsonl(ROOT/'ra1-portable-rule-layers.jsonl',rule_rows);jsonl(ROOT/'ra1-portable-scenarios.jsonl',map_rows)
    summary={'tier':'Community PortableRA redistributable comparator, includes bundled content and can contain modified balance or scenarios. Independent source hashes needed to assert retail identity.','archive_url':URL,'archive_sha256':EXPECTED,'tables':{f:{**m,'sections':len(d)} for f,(m,d) in tables.items()},'rule_sections_with_selected_facts':dict(Counter(x['layer'] for x in rule_rows)),'scenarios':len(map_rows),'maps_with_hash_matched_name_candidate':sum(bool(x['filename_hash_candidates']) for x in map_rows),'maps_with_local_entity_overrides':sum(bool(x['map_overrides']) for x in map_rows),'theaters':dict(Counter(r['grid'].get('Theater','unlabelled') for r in map_rows))}
    (ROOT/'ra1-portable-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print({k:summary[k] for k in list(summary)[-5:]})
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',nargs='?',default=ROOT/'.cache/portable.zip',type=Path);run(p.parse_args().archive)
