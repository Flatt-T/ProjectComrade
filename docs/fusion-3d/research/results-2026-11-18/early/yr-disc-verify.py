"""Compare lawful YR disc inputs and export version-specific source facts, never original media."""
import argparse
from collections import Counter,defaultdict
from hashlib import sha256
from pathlib import Path
from zipfile import ZipInfo,ZIP_DEFLATED,ZipFile
import json,re,runpy
ROOT=Path(__file__).resolve().parent
HEADING=re.compile(r'^\[([^\]]+)\]$')
REG={'InfantryTypes':'infantry','VehicleTypes':'vehicle','AircraftTypes':'aircraft','BuildingTypes':'building'}
def sha(data):return sha256(data).hexdigest()
def parse(data):
    groups={};name=None
    for n,line in enumerate(data.decode('cp1252').splitlines(),1):
        line=line.partition(';')[0].strip();h=HEADING.match(line)
        if h:
            name=h[1];groups.setdefault(name,{'line':n,'fields':[]});continue
        if name and '=' in line:
            k,v=line.split('=',1);groups[name]['fields'].append((k.strip(),v.strip(),n))
    return groups
def resolve(groups,key):
    if key in groups:return key
    hits=[n for n in groups if n.casefold()==key.casefold()]
    return hits[0] if len(hits)==1 else None
def props(section):return {k.lower():v for k,v,n in section['fields']}
def normalized(section):return [(k,v) for k,v,n in section['fields']]
def digest_fields(pairs):return sha(json.dumps(pairs,ensure_ascii=True,separators=(',',':')).encode())
def diff(first,second):
    delta=[];tot=Counter()
    for n in sorted(first.keys()|second.keys()):
        a,b=first.get(n),second.get(n);aa=normalized(a) if a else [];bb=normalized(b) if b else []
        kind='only_first' if not b else 'only_second' if not a else 'equal' if aa==bb else 'order_only' if Counter(aa)==Counter(bb) else 'changed_fields'
        tot[kind]+=1
        rec={'section':n,'change':kind,'first_section_line':a['line'] if a else None,'second_section_line':b['line'] if b else None,'first_count':len(aa),'second_count':len(bb),'first_fields_sha256':digest_fields(aa) if a else None,'second_fields_sha256':digest_fields(bb) if b else None}
        if kind=='changed_fields':
            rec['only_first_pairs']=[list(x) for x in (Counter(aa)-Counter(bb)).elements()]
            rec['only_second_pairs']=[list(x) for x in (Counter(bb)-Counter(aa)).elements()]
        delta.append(rec)
    return dict(tot),delta
def pack_file(z,name,rows):
    data=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows).encode();i=ZipInfo(name,date_time=(1980,1,1,0,0,0));i.create_system=3;i.external_attr=0o644<<16;i.compress_type=ZIP_DEFLATED;z.writestr(i,data,compresslevel=9);return {'rows':len(rows),'bytes':len(data),'sha256':sha(data)}
def run():
    p=argparse.ArgumentParser();p.add_argument('media',type=Path,help='Directory containing GAME1.CAB through GAME6.CAB, GAMEMD.EXE, README.TXT and extracted ra2md.mix');p.add_argument('locked_source_cache',type=Path);p.add_argument('official_patch_rules',type=Path);p.add_argument('--other-disc',type=Path,help='Optional independently acquired second set of six cabinet/executable/readme files');p.add_argument('--out',type=Path,default=ROOT);a=p.parse_args()
    # Reuse the previously reviewed classic MIX reader. Both outer and inner native payload SHA-1 checksums are verified.
    codec=runpy.run_path(str(ROOT/'ra2-patch-audit.py'));mix,fn=codec['mix'],codec['key_for']
    disk=a.media;raw=(disk/'ra2md.mix').read_bytes();outer=mix(raw);lo,ls=outer[fn('localmd.mix')];local=raw[lo:lo+ls];members=mix(local);inputs={};records={}
    for name in ('artmd.ini','rulesmd.ini'):
        offset,size=members[fn(name)];data=local[offset:offset+size];records[name]={'logical_member_id':f"{fn(name):08x}",'relative_start_in_localmd':offset,'bytes':size,'sha256':sha(data)};inputs[name]=data
    assert records['artmd.ini']['sha256']=='e1f0378394313c04ebbd5073f47785ee3e46f1b3c62d65724e8f3c310ee7ba31'
    assert records['rulesmd.ini']['sha256']=='06761dd7f714e7d9400216ec3c06109ec5c1461f6a0727be7401eb9d8b0f6d05'
    art=parse(inputs['artmd.ini']);rules=parse(inputs['rulesmd.ini']);patch_bytes=a.official_patch_rules.read_bytes();assert sha(patch_bytes)=='3d341ef8a13a4b5ab24af2eef48ac94931ac2bb87d950fe3330a07e2d25672ef';patched=parse(patch_bytes)
    lock={r['local']:r for r in json.loads((ROOT/'source-lock.json').read_text())};sources={}
    for typ,file in [('art','westwood/yr-art.ini'),('rules','westwood/rulesmd-original.ini')]:
        meta=lock[file];v=(a.locked_source_cache/file).read_bytes();assert sha(v)==meta['sha256'];sources[typ]=(meta,v,parse(v))
    assert inputs['rulesmd.ini'].replace(b'\r\n',b'\n')==sources['rules'][1].replace(b'\r\n',b'\n')
    claims={};zip_members={}
    zfile=a.out/'yr-disc-profiles.zip';a.out.mkdir(parents=True,exist_ok=True)
    visual_keys='image voxel cameo altcameo sequence primaryfireflh secondaryfireflh eliteprimaryfireflh elitesecondaryfireflh fireup fireprone shadow remapable remappable facings walkframes startwalkframe turretanim foundation buildup height newtheater theater activeanim activeanimtwo activeanimthree activeanimfour specialanim deployanim deployinganim'.split()
    object_keys='name uiname image primary secondary eliteprimary elitesecondary owner requiredhouses forbiddenhouses prerequisite techlevel cost strength power speed trainable passengers deploysinto undeploysinto occupier openTopped gattling weaponcount stagecount spawns slavesnumber engineer'.lower().split()
    with ZipFile(zfile,'w') as z:
        for name,x,y in [('retail-art-vs-cncnet',art,sources['art'][2]),('retail-rules-vs-baseline',rules,sources['rules'][2]),('retail-rules-vs-patch1001',rules,patched)]:
            count,rows=diff(x,y);claims[name]=count;zip_members[name]=pack_file(z,name+'.jsonl',rows)
        bind=[]
        for name,kind in REG.items():
            seen=set()
            for key,entity,regline in rules[name]['fields']:
                if not key.isdigit() or entity in seen:continue
                seen.add(entity);dr=resolve(rules,entity);pr=resolve(patched,entity);rp=props(rules[dr]) if dr else {};pp=props(patched[pr]) if pr else {};key=rp.get('image') or entity;ar=resolve(art,key);av=props(art[ar]) if ar else {};comp=resolve(sources['art'][2],key);seq=av.get('sequence');sq=resolve(art,seq) if seq else None
                bind.append({'id':entity,'kind':kind,'registry':name,'registry_line':regline,'rules_section':dr,'rules_disc_line':rules[dr]['line'] if dr else None,'source_rules':{k:rp[k] for k in object_keys if k in rp},'patch_rules_section':pr,'patch_rules_line':patched[pr]['line'] if pr else None,'selected_rule_changes_in_1001':{k:[rp.get(k),pp.get(k)] for k in object_keys if rp.get(k)!=pp.get(k)},'art_lookup':key,'retail_art_section':ar,'retail_art_section_line':art[ar]['line'] if ar else None,'presentation':{k:av[k] for k in visual_keys if k in av},'retail_sequence':sq,'retail_sequence_line':art[sq]['line'] if sq else None,'community_section_has_identical_fields':bool(ar and comp and normalized(art[ar])==normalized(sources['art'][2][comp]))})
        zip_members['retail-object-bindings']=pack_file(z,'retail-object-bindings.jsonl',bind)
        seqs={r['retail_sequence'] for r in bind if r['retail_sequence']};seqrows=[{'id':s,'disc_line':art[s]['line'],'actions':{k:v for k,v,n in art[s]['fields'] if re.fullmatch(r'[A-Za-z\d,\s-]+',v)}} for s in sorted(seqs)]
        zip_members['retail-sequences']=pack_file(z,'retail-sequences.jsonl',seqrows)
    facts={'cabinet_directory':[{'file':f'GAME{i}.CAB','lba':l,'bytes':(disk/f'GAME{i}.CAB').stat().st_size,'sha256':sha((disk/f'GAME{i}.CAB').read_bytes())} for i,l in enumerate([257381,272030,286679,301328,315977,330626],1)],'public_sources':[{'id':'CC_YR_Europe','track':'YR1.img','url':'https://archive.org/details/CC_YR_Europe'},{'id':'cnc-ra2-yuri-thai-release','track':'Disc/YR1.bin','url':'https://archive.org/details/cnc-ra2-yuri-thai-release'}],'sector_bytes':2352,'user_data_offset':16,'user_data_bytes':2048,'readme_version':None,'game_version_strings':{},'mixed_containers':{'ra2md.mix':{'sha256':sha(raw),'size':len(raw),'members':len(outer),'embedded_sha1_validated':True},'localmd.mix':{'start_in_ra2md':lo,'size':ls,'sha256':sha(local),'members':len(members),'embedded_sha1_validated':True}},'retail_members':records,'comparators':{k:{'url':s[0]['url'],'sha256':s[0]['sha256']} for k,s in sources.items()},'official_1001_rules_sha256':sha(patch_bytes),'base_rules_identical_to_comparator_after_crlf_to_lf':True,'section_comparisons':claims,'zip_sha256':sha(zfile.read_bytes()),'zip_members':zip_members,'retail_bindings':{'registry_rows':len(bind),'retail_art_matches':sum(bool(r['retail_art_section']) for r in bind),'with_rules':sum(bool(r['rules_section']) for r in bind),'resolved_animation_sequences':len(seqs)},'verified_second_disc_files':[]}
    d=(disk/'README.TXT').read_bytes();m=re.search(rb'Version #:\s*([\d.]+)',d);assert m;facts['readme_version']={'value':m[1].decode(),'sha256':sha(d),'lba':334483}
    exe=(disk/'GAMEMD.EXE').read_bytes();vs={}
    for key in ['FileVersion','ProductVersion']:
        off=exe.index(key.encode('utf-16le'));txt=exe[off:off+100].decode('utf-16le',errors='replace');m=re.match(key+r'\x00+([0-9.]+)\x00',txt);assert m;vs[key]={'value':m[1],'key_offset':off}
    facts['game_version_strings']={'sha256':sha(exe),'lba':334974,'fields':vs}
    if a.other_disc:
        for name in [f'GAME{i}.CAB' for i in range(1,7)]+['GAMEMD.EXE','README.TXT']:
            original=(disk/name).read_bytes();additional=(a.other_disc/name).read_bytes();facts['verified_second_disc_files'].append({'name':name,'same_bytes':original==additional,'second_sha256':sha(additional)})
    with ZipFile(zfile) as z:
        assert z.testzip() is None
        for n,m in zip_members.items():assert sha(z.read(n+'.jsonl'))==m['sha256']
    (a.out/'yr-disc-verification.json').write_text(json.dumps(facts,indent=2)+'\n')
if __name__=='__main__':run()
