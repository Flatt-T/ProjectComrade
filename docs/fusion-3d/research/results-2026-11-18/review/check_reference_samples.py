"""Independent readback. Usage: python check_reference_samples.py /path/ra95demo.zip /path/EA-SAGE.zip /path/ra2-rules-original.ini"""
from pathlib import Path
from collections import Counter
from zipfile import ZipFile
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET

wave=Path(__file__).resolve().parent.parent
digest=lambda b:hashlib.sha256(b).hexdigest()
header=rb'(?m)^\[([^]\r\n]+)\]\r?$'
def blocks(data):
    marks=list(re.finditer(header,data))
    return {m[1].decode('cp1252').lower():data[m.end():marks[i+1].start() if i+1<len(marks) else len(data)] for i,m in enumerate(marks)}
def pairs(data):
    raw=re.findall(rb'(?m)^([^;\r\n=]+?)=([^\r\n]*)',data)
    return {k.decode('cp1252').strip():v.split(b';')[0].strip().decode('cp1252') for k,v in raw if k.strip()}
demo=json.loads((wave/'editions/ra95-demo-facts.json').read_text());archive=Path(sys.argv[1]);assert digest(archive.read_bytes())==demo['archive_sha256']
with ZipFile(archive) as z:
    for n,h in demo['member_sha256'].items():assert digest(z.read('ra95demo/INSTALL/'+n))==h
    rules=z.read('ra95demo/INSTALL/REDALERT.MIX');main=z.read('ra95demo/INSTALL/MAIN.MIX')
marks=[m.start() for m in re.finditer(rb'(?m)^\[Basic\]\r$',main)]
assert marks==[m['basic_offset'] for m in demo['missions']]
start=rules.index(b'[General]\r\n');end=rules.index(b'Rate=.1\r\n',rules.index(b'[Missile]\r\n',start))+len(b'Rate=.1\r\n')
assert len(list(re.finditer(header,rules[start:end])))==demo['global_section_count']==246
for s in demo['global_sections_with_selected_fields']:
    pos=s['redalert_mix_byte'];nb=re.search(header,rules[rules.index(b'\n',pos)+1:end]);stop=rules.index(b'\n',pos)+1+nb.start() if nb else end
    assert rules[pos:].startswith(('['+s['section']+']').encode())
    fields=pairs(rules[pos:stop]);assert all(fields[k]==v for k,v in s['facts'].items())
assert len(demo['global_sections_with_selected_fields'])==237
for i,(begin,mission) in enumerate(zip(marks,demo['missions'])):
    stop=marks[i+1] if i+1<len(marks) else main.index(b'\x00',begin)
    by=blocks(main[begin:stop]);assert all(pairs(by['map'])[k]==v for k,v in mission['map'].items())
    assert len(pairs(by['teamtypes']))==mission['script_team_definitions']
    assert len(pairs(by['trigs']))==mission['trigger_definitions']
    for key in ('units','infantry','structures','ships','aircraft'):
        counts=Counter(':'.join(v.split(',')[:2]) for v in pairs(by.get(key,b'')).values())
        assert counts==mission['initial_placements_by_house_and_ini_id'].get(key,{})
print('Demo: archive/four member hashes, 246 headers, 237 selected sections and 3 scenarios verified.')
sage=json.loads((wave/'later/representative-gameplay-and-art-fixtures.json').read_text())
with ZipFile(sys.argv[2]) as z:
    names=z.namelist()
    for key in ['AlienAnnihilatorTripod','GDIMammoth','JapanAntiInfantryVehicle']:
        r=next(item['object'] for item in sage if item['object']['id']==key);name=next(n for n in names if n.endswith('/'+r['source']['path']))
        root=ET.fromstring(z.read(name));obj=next(x for x in root.iter() if x.tag.endswith('}GameObject') and x.get('id')==key)
        states=[x for x in obj.iter() if x.tag.endswith('}AnimationState')]
        clips={x.get('AnimationName') for x in obj.iter() if x.tag.endswith('}Animation') and x.get('AnimationName')}
        indexed={n['AnimationName'] for state in r['animation'] for n in state.get('clips',[]) if n.get('AnimationName')}
        assert obj.get('inheritFrom')==r['parent'] and len(states)==len(r['animation']) and clips==indexed
        print(key,len(states),'direct animation state rows,',len(clips),'distinct named direct clips.')
early=wave/'early';lock=json.loads((early/'source-lock.json').read_text());locked=next(f for f in lock if f['profile']=='ra2' and f['path']=='rules-original.ini')
raw=Path(sys.argv[3]).read_bytes()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==locked['blob']
by=blocks(raw)
with ZipFile(early/'ra2-facts.zip') as z:roster=[json.loads(s) for s in z.read('ra2-definition-facts.jsonl').splitlines()]
for key in ['E1','GAPILE','HTNK']:
    row=next(r for r in roster if r['id']==key);direct=pairs(by[key.lower()])
    for k in ['Cost','Strength','Primary','Secondary','Image','Owner','Prerequisite','DeployFire']:
        if k in row['properties']: assert row['properties'][k]==direct[k],(key,k)
    print(key,'eligible source fields matched RA2 comparator.')
