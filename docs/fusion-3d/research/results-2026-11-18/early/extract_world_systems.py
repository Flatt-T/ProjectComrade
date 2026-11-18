"""Collect simulation and world-design facts tied to entity and theater references."""
from pathlib import Path
import argparse,json,re
from extract_early import jsonl
from extract_isometric import read_ini
from extract_sage import body_groups,fields,pick
ROOT=Path(__file__).resolve().parent
SAGE_FIELDS={
    'armor':'armor',
    'locomotor':'surfaces speed speeddamaged turnrate turnratedamaged acceleration accelerationdamaged braking minturnspeed zaxisbehavior appearance sticktoground groupmovementpriority preferredheight preferredheightdamaged allowairbornemotiveforce',
    'terrain':'texture class',
    'science':'prerequisitesciences sciencepurchasepointcost isgrantable',
    'upgrade':'displayname type buildtime buildcost',
}

def run(cache):
    sources=json.loads((ROOT/'source-lock.json').read_text());stats={}
    for profile in ['generals','zh']:
        stats[profile]={}
        for typ,names in SAGE_FIELDS.items():
            f=next(x for x in sources if x['profile']==profile and x['local'].lower().endswith('/'+typ+'.ini'))
            rows=[{'id':g['id'],'src':g['src'],'properties':pick(fields(g['props']),names)} for g in body_groups(f,cache,{typ})]
            jsonl(ROOT/f'{profile}-{typ}-facts.jsonl',rows);stats[profile][typ]=len(rows)
    for theater in ['temperat','snow']:
        f=next(x for x in sources if x['local']=='westwood/'+theater+'.ini')
        sections,_=read_ini(f,cache);rows=[];general=sections['GENERAL']
        for key,section in sections.items():
            m=re.fullmatch('TILESET(\\d+)',key)
            if m:
                groups={orig:value for _,(orig,value) in section['fields'].items() if orig.lower() in ('setname','filename','tilesinset','allowplacement','marblemadness','nonmarblemadness','requiredforrmg')}
                rows.append({'theater':theater,'set_index':int(m[1]),'src':section['src'],'facts':groups,'general_roles':[orig for _,(orig,v) in general['fields'].items() if v==str(int(m[1])) and re.search(r'(set|base|tile|pieces|lat|smooth)$',orig,re.I)]})
        jsonl(ROOT/f'ts-{theater}-tile-sets.jsonl',rows)
        stats[theater]={'tilesets':len(rows),'declared_tiles_in_sets':sum(int(r['facts'].get('TilesInSet',0)) for r in rows),'general_tile_lookups':{k:v for _,(k,v) in general['fields'].items() if re.search('bridge|ramp|shore|cliff|water|ice',k,re.I)},'general_src':general['src']}
    (ROOT/'world-system-summary.json').write_text(json.dumps(stats,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('cache',nargs='?',type=Path,default=ROOT/'.cache');run(p.parse_args().cache)
