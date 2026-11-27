"""Audit selected CnCNet TS client map data from its immutable community snapshot.

Usage: python read_isometric_maps.py /tmp/ts-input-cache research-directory
No authored map layouts, mission scripts or original images are exported.
"""
import argparse
from collections import Counter,defaultdict
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,re,time,urllib.request,urllib.parse
from pathlib import Path
PIN='c13be46135820de4a83bf5cc2779ad32b29f4704'
REPO='CnCNet/cncnet-ts-client-package'
def read_url(url):
    failure=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=35) as r:return r.read()
        except OSError as ex:failure=ex
    raise RuntimeError('unable to read '+url) from failure
def parse(data):
    sections=defaultdict(list);name=None
    for ln,s in enumerate(data.decode('cp1252',errors='replace').splitlines(),1):
        s=s.split(';',1)[0].strip()
        if s.startswith('[') and ']' in s:name=s[1:s.index(']')];continue
        if name and '=' in s:
            k,v=s.split('=',1); sections[name].append((k.strip(),v.strip(),ln))
    st={'source_section_count':len(sections),'placed':{},'linked_types':{},'section_record_counts':{},'scenario_overrides':{}}
    for n,fields in {'Map':['Theater','Size','LocalSize'],'Basic':['Name','Player','MultiplayerOnly','Official','EndOfGame','NewINIFormat']}.items():
        st[n]={k:v for k,v,ln in sections[n] if k in fields}
    for n in ('Units','Infantry','Structures','Aircraft'):
        groups=Counter()
        for _,v,ln in sections[n]:
            tokens=v.split(',')
            if len(tokens)>1:groups[(tokens[0],tokens[1])]+=1
        st['placed'][n]=[{'house':h,'id':i,'count':c} for (h,i),c in sorted(groups.items())]
    for n in ('TaskForces','TeamTypes','Houses','Countries'):
        st['linked_types'][n]=[v for _,v,ln in sections[n]]
    for n in ('Waypoints','Terrain','OverlayPack','OverlayDataPack','IsoMapPack5','Tubes','Triggers','Tags','TaskForces','TeamTypes','ScriptTypes','Actions','Events','CellTags'):
        if n in sections:st['section_record_counts'][n]=len(sections[n])
    keys={'Cost','Strength','Owner','TechLevel','BuildLimit','Prerequisite','Speed','Armor','Power','Primary','Secondary','Cloakable','Sight','Repairable','Buildable','Capturable'}
    for n,values in sections.items():
        f={k:v for k,v,ln in values if k in keys}; 
        if f:st['scenario_overrides'][n]=f
    for n in st['linked_types']['TaskForces']:
        for k,v,ln in sections.get(n,[]):
            m=re.fullmatch(r'(\d+)\s*,\s*([\w-]+)',v)
            if k.isdigit() and m:st.setdefault('taskforce_members',[]).append({'group':n,'type':m[2],'quantity':int(m[1]),'line':ln})
    return st
def run(cache,out):
    cache.mkdir(exist_ok=True,parents=True)
    listing=json.loads(read_url('https://api.github.com/repos/'+REPO+'/git/trees/'+PIN+'?recursive=1'))
    if listing.get('truncated'):raise ValueError('truncated tree')
    allrows=[r for r in listing['tree'] if r['type']=='blob' and r['path'].lower().endswith(('.map','.mpr')) and r['path'].startswith('Maps/')]
    selected=[r for r in allrows if r['path'].split('/')[1] in ('Missions','Tiberian Sun','Firestorm')]
    def fetch(r):
        p=r['path'];c=cache/r['sha']
        if not c.exists():c.write_bytes(read_url('https://raw.githubusercontent.com/'+REPO+'/'+PIN+'/'+urllib.parse.quote(p)))
        b=c.read_bytes()
        if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!=r['sha']:raise ValueError(p)
        return {'path':p,'blob':r['sha'],'sha256':hashlib.sha256(b).hexdigest(),'url':'https://github.com/'+REPO+'/blob/'+PIN+'/'+urllib.parse.quote(p),**parse(b)}
    with ThreadPoolExecutor(10) as ex:rows=list(ex.map(fetch,selected))
    cats=Counter(r['path'].split('/')[1] for r in rows)
    (out/'ts-fs-campaign-maps.jsonl').write_text('\n'.join(json.dumps(r,separators=(',',':')) for r in rows)+'\n')
    (out/'ts-fs-campaign-summary.json').write_text(json.dumps({'source_commit':PIN,'repository':REPO,'source_class':'Community client comparison, may contain author fixes. The unmodified retail patch and per-mode producer menus are separate.', 'all_map_paths_in_Maps':len(allrows),'selected_directories':cats,'fan_directory_excluded':sum(r['path'].startswith('Maps/Fan-made/') for r in allrows),'maps_with_tubes':sum(r['section_record_counts'].get('Tubes',0)>0 for r in rows),'theaters':Counter(r['Map'].get('Theater') for r in rows),'placed_instances_by_type':{k:sum(v['count'] for r in rows for v in r['placed'][k]) for k in ('Units','Infantry','Aircraft','Structures')},'maps_with_placed_CABHUT':sum(any(v['id'].upper()=='CABHUT' for v in r['placed']['Structures']) for r in rows),'note':'Task force members are declared quantities, not observations of spawns. Terrain and overlay sections are counted by entries/encoded lines, never interpreted as tile counts.'},indent=1)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',type=Path);p.add_argument('out',type=Path);a=p.parse_args();run(a.cache,a.out)
