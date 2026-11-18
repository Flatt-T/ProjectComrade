"""Build or query the offline cross-title index. Uses the standard library."""
import argparse
import csv
import gzip
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'catalogue' / 'source-lookup.jsonl.gz'
EARLY = ('td','ra1','ts','fs','ra2','yr','generals','zh')
LATER = ('tw','kw','ra3','uprising','tt')

def record(profile, identifier, kind, side, file, member, locator):
    # These keys identify source observations inside this deposit.
    address = [profile,file,member,locator]
    key = hashlib.sha256(json.dumps(address,separators=(',',':')).encode()).hexdigest()[:22]
    return dict(key=key,profile=profile,id=identifier,kind=kind,source_side=side or None,
                file=file,member=member,locator=locator)

def build():
    rows=[]
    for game in EARLY + LATER:
        early=game in EARLY
        file=f'early/{game}-facts.zip' if early else f'later/{game}-source-facts.zip'
        with ZipFile(ROOT/file) as archive:
            for name in sorted(archive.namelist()):
                if not (name==f'{game}-definition-facts.jsonl' or
                        re.fullmatch(r'\w+-objects-\d+\.jsonl',name) or name=='objects.jsonl'):
                    continue
                for line,b in enumerate(archive.open(name),1):
                    obj=json.loads(b)
                    scalar=obj.get('effective_scalar',{})
                    kind=(obj.get('kind') or scalar.get('EditorSorting') or
                          obj.get('facts',{}).get('editorsorting') or obj.get('class') or obj.get('declaration'))
                    side=(scalar.get('Side') or obj.get('properties',{}).get('Owner') or
                          obj.get('facts',{}).get('side') or obj.get('inputs',{}).get('ownable'))
                    rows.append(record(game,obj['id'],kind,side,file,name,line))
    path='later/sage-exception-recovery.json'
    for i,f in enumerate(json.loads((ROOT/path).read_text())['xml_files']):
        for j,proj in enumerate(f.get('projections',[])):
            for k,d in enumerate(proj.get('declarations',[])):
                fields=d['local_source_facts']
                rows.append(record(f['title'],fields['id'],'recovered declaration',fields.get('declared',{}).get('Side'),path,None,['xml_files',i,'projections',j,'declarations',k]))
    specs=[('rivals','editions/rivals-ta-rivals-reference.tsv','label','navigation_group','faction'),
           ('ta','editions/rivals-ta-alliances-reference.tsv','adapter_identifier','context','faction_or_variant'),
           ('ren.demo','later/renegade-demo-terminal.tsv','resolved_definition_name','menu','side')]
    for game,path,idkey,kind,side in specs:
        with (ROOT/path).open(newline='') as stream:
            for index,r in enumerate(csv.DictReader(stream,delimiter='\t'),2):
                ident=r[idkey] or r.get('english_slot_label') or r.get('translation_key')
                rows.append(record(game,ident,r[kind],r[side],path,None,index))
    path='editions/sole-survivor-manual-facts.json'
    for i,n in enumerate(json.loads((ROOT/path).read_text())['manual_units']):
        rows.append(record('ss',n,'manual quick reference',None,path,None,['manual_units',i]))
    path='editions/dune2000-manual-to-fusion.json'
    source=json.loads((ROOT/path).read_text())
    for i,r in enumerate(source['rows']):
        rows.append(record('dune.manual',r['name'],r['entry'],r['house_or_access'],path,None,['rows',i]))
    for i,r in enumerate(source['comrade_pack_rows']):
        rows.append(record('dune.fusion',r['runtime_id'],r['kind'],None,path,None,['comrade_pack_rows',i]))
    assert len({r['key'] for r in rows})==len(rows)
    assert all(r['id'] and r['kind'] for r in rows)
    assert sum(r['profile'] in EARLY for r in rows)==5135
    assert sum(r['profile'] in LATER for r in rows)==18099+13
    payload=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows).encode()
    INDEX.write_bytes(gzip.compress(payload,mtime=0))
    return rows

def details(row):
    path=ROOT/row['file']; where=row['locator']
    if row['member']:
        with ZipFile(path) as archive, archive.open(row['member']) as stream:
            for n,b in enumerate(stream,1):
                if n==where:return json.loads(b)
        raise ValueError(row['key'])
    if isinstance(where,list):
        val=json.loads(path.read_text())
        for key in where:val=val[key]
        return val
    with path.open(newline='') as stream:
        for n,val in enumerate(csv.DictReader(stream,delimiter='\t'),2):
            if n==where:return val
    raise ValueError(row['key'])

def plain(value):
    return json.dumps(value,ensure_ascii=False).casefold()

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('term',nargs='?',default='',help='substring of source identifier')
    a.add_argument('--profile');a.add_argument('--side');a.add_argument('--key')
    a.add_argument('--detail',action='store_true',help='include the full cited fact row')
    a.add_argument('--limit',type=int,default=12)
    a.add_argument('--build',action='store_true',help='rebuild the index from the shipped deposit')
    args=a.parse_args()
    if args.limit<0:a.error('--limit must be nonnegative')
    if args.build:
        rows=build()
        print(json.dumps({'total':len(rows),'by_profile':Counter(r['profile'] for r in rows)},indent=2))
        return
    with gzip.open(INDEX,'rt') as h:
        rows=[r for r in map(json.loads,h) if args.term.casefold() in r['id'].casefold()
              and (not args.profile or args.profile==r['profile']) and (not args.key or args.key==r['key'])
              and (not args.side or (r['source_side'] is not None and
                                    args.side.casefold() in plain(r['source_side'])))]
    print(json.dumps({'matches':len(rows),'returned':min(len(rows),args.limit),
                      'rows':[dict(r,detail=details(r)) if args.detail else r for r in rows[:args.limit]]},
                     indent=2,ensure_ascii=False))

if __name__=='__main__':
    main()
