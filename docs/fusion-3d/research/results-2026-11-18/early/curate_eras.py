"""Attach reproducible availability evidence and between-edition comparisons to declared rows."""
import re,json
from pathlib import Path
from collections import defaultdict
from extract_early import jsonl
ROOT=Path(__file__).resolve().parent

def rows(p):return [json.loads(x) for x in p.read_text().splitlines()]
def run():
    isodata={}
    for era in ['ts','fs','ra2','yr']:
        data=rows(ROOT/f'{era}-definition-facts.jsonl');isodata[era]={(r['kind'],r['id']):r for r in data};groups=defaultdict(list)
        for r in data:
            f={k.lower():v for k,v in r['properties'].items()}
            for house in f.get('owner','').split(','):
                house=house.strip()
                if house.casefold()=='nod':house='Nod'
                if not house:continue
                required={s.strip().casefold() for s in f.get('requiredhouses','').split(',') if s.strip()};forbidden={s.strip().casefold() for s in f.get('forbiddenhouses','').split(',') if s.strip()};tech=f.get('techlevel')
                status='hard house exclusion' if house.casefold() in forbidden or required and house.casefold() not in required else 'negative tech level' if tech and int(tech)<0 else 'explicit nonnegative tech candidate' if tech and int(tech)>=0 else 'unspecified tech level'
                groups[house].append({'id':r['id'],'kind':r['kind'],'screen':status,'prerequisite':f.get('prerequisite')})
        jsonl(ROOT/f'{era}-house-index.jsonl',[{'house':h,'declared_owner_rows':len(v),'candidates_and_exclusions':v} for h,v in sorted(groups.items())])
    for base,exp in [('ts','fs'),('ra2','yr')]:
        a,b=isodata[base],isodata[exp];deltas=[]
        for k in sorted(set(a)|set(b)):
            x,y=a.get(k),b.get(k);category='registered addition' if x is None else 'no longer registered' if y is None else 'facts changed';old=(x or {}).get('properties',{});new=(y or {}).get('properties',{});mods={name:[old.get(name),new.get(name)] for name in sorted(old.keys()|new.keys()) if old.get(name)!=new.get(name)}
            if x is None or y is None or mods:deltas.append({'kind':k[0],'id':k[1],'change':category,'changed_entity_fields':mods if x and y else {},'base_registry':x['registry_evidence'][0][1] if x else None,'expansion_registry':y['registry_evidence'][-1][1] if y else None})
        jsonl(ROOT/f'{exp}-edition-delta.jsonl',deltas)

if __name__=='__main__':run()
