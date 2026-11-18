"""Produce deterministic per-profile archives and check every source anchor and selected joins."""
import argparse
from collections import Counter
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json
import re

ROOT=Path(__file__).resolve().parent
PROFILES=('td','ra1','ts','fs','ra2','yr','generals','zh')

def all_strings(x):
    if isinstance(x,dict):
        for y in x.values():yield from all_strings(y)
    elif isinstance(x,list):
        for y in x:yield from all_strings(y)
    elif isinstance(x,str):yield x

def run(cache):
    locked={row['url']:row for row in json.loads((ROOT/'source-lock.json').read_text())}
    line_counts={u:len((cache/row['local']).read_bytes().splitlines()) for u,row in locked.items()}
    report={'source_files':len(locked),'profiles':{},'checks':[]}
    classic_counts={'td':113,'ra1':149,'ts':237,'fs':265,'ra2':409,'yr':559,'generals':1300,'zh':2103}
    for profile in PROFILES:
        dest=ROOT/f'{profile}-facts.zip'
        files=sorted(ROOT.glob(f'{profile}-*.jsonl'))
        if not files:raise ValueError(f'Missing regenerated facts for {profile}')
        manifest={};anchors=0;entity_count=0;all_ids=set();pending_parents=set();object_sources={}
        with ZipFile(dest,'w',compression=ZIP_DEFLATED,compresslevel=9) as z:
            for file in files:
                b=file.read_bytes();records=[json.loads(s) for s in b.splitlines()]
                manifest[file.name]={'rows':len(records),'bytes':len(b),'sha256':sha256(b).hexdigest()}
                for row in records:
                    for s in all_strings(row):
                        if not s.startswith('https://github.com/'):continue
                        base,mark,frag=s.partition('#')
                        if base not in locked:raise ValueError(s)
                        m=re.fullmatch(r'L(\d+)(?:-L(\d+))?',frag)
                        if not m or not 1<=int(m[1])<=int(m[2] or m[1])<=line_counts[base]:raise ValueError(s)
                        anchors+=1
                if '-definition-facts' in file.name or '-objects-' in file.name:
                    entity_count+=len(records)
                    all_ids.update(r['id'] for r in records)
                    object_sources.update({r['id']:r['src'].partition('#')[0] for r in records if 'src' in r})
                    pending_parents.update(r['parent'] for r in records if r.get('parent'))
                if '-presentation-states-' in file.name:
                    for row in records:
                        assert 1<=row['line']<=line_counts[object_sources[row['id']]]
                        anchors+=1
                info=ZipInfo(file.name,date_time=(1980,1,1,0,0,0));info.compress_type=ZIP_DEFLATED;info.external_attr=0o644<<16;info.create_system=3
                z.writestr(info,b,compresslevel=9)
        if entity_count!=classic_counts[profile] or pending_parents-all_ids:raise AssertionError(profile)
        with ZipFile(dest) as z:
            assert z.testzip() is None
            for name,entry in manifest.items():assert sha256(z.read(name)).hexdigest()==entry['sha256']
        report['profiles'][profile]={'archive':dest.name,'size_bytes':dest.stat().st_size,'sha256':sha256(dest.read_bytes()).hexdigest(),'verified_source_anchors':anchors,'entities':entity_count,'members':manifest}
    def indexed(profile,name):return {r['id']:r for r in (json.loads(x) for x in (ROOT/f'{profile}-{name}.jsonl').read_text().splitlines())}
    assert indexed('td','definition-facts')['STNK']['inputs']['cost']==900
    assert 'ifdef FIXIT_CSII' in indexed('ra1','definition-facts')['SHOK']['definition_guard']
    assert indexed('fs','definition-facts')['JUGG']['properties']['DeploysInto']=='DJUGG'
    assert indexed('ra2','definition-facts')['TTNK']['properties']['RequiredHouses']=='Russians'
    assert indexed('yr','definition-facts')['SMIN']['properties']['SlavesNumber']=='5'
    for p,price in [('generals','25.0'),('zh','20.0')]:
        allobjs={k:v for f in ROOT.glob(p+'-objects-*.jsonl') for k,v in indexed(p,f.stem[len(p)+1:]).items()}
        assert allobjs['ChinaTankOverlord']['facts']['buildtime']==[price]
        assert allobjs['AmericaVehicleChinook']['direct_producers']==['AmericaSupplyCenter']
        for row in (json.loads(x) for x in (ROOT/f'{p}-menu-edges.jsonl').read_text().splitlines()):assert row['target'] in allobjs
    report['checks']=['92 SHA256/git blob source locks (fetch_inputs.py --offline)','all GitHub line ranges in emitted JSONL exist within a locked file','source-class/profile entity counts checked','every archived member CRC and SHA256 checked','reskin parent references resolve','every emitted SAGE construction-button target resolves','edition-specific example checks passed']
    (ROOT/'archive-manifest.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',nargs='?',type=Path,default=ROOT/'.cache');run(p.parse_args().cache)
