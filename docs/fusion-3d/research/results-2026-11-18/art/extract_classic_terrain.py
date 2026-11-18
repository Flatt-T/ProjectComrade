"""Extract source-declared terrain facts. Arguments: TD CDATA, TD TDATA, RA CDATA, RA TDATA, output directory."""
from pathlib import Path
import csv
import hashlib
import json
import re
import sys
from collections import Counter

PINS = [
    ("TD","template","electronicarts/CnC_Tiberian_Dawn","e0d372dc582c053a699114942b984dad0457f9b3","CDATA.CPP","2e499c607c7e1d027d9ad119790864560e086144"),
    ("TD","prop","electronicarts/CnC_Tiberian_Dawn","e0d372dc582c053a699114942b984dad0457f9b3","TDATA.CPP","d5f728fec24e33c6f34a7fc8db012372d2519fcf"),
    ("RA1","template","electronicarts/CnC_Red_Alert","0dc09bb1d6188d1ec79ab4765b22a48b75ffee32","CODE/CDATA.CPP","39cf45c8235ceeac48f0e8cedf95b455896cf319"),
    ("RA1","prop","electronicarts/CnC_Red_Alert","0dc09bb1d6188d1ec79ab4765b22a48b75ffee32","CODE/TDATA.CPP","aded174ec16ecddae3fcfef827c711d9b19a6080"),
]
TD_FLAGS = "spawn destroy_animation transform_animation flammable crushable selectable legal_target insignificant immune".split()
def verified(path, desired):
    content = path.read_bytes().replace(b'\r\n',b'\n')
    for variant in [content, content.removesuffix(b'\n'), content.rstrip(b'\n'), content.rstrip(b'\n')+b'\n']:
        for line_ending in [variant,variant.replace(b'\n',b'\r\n')]:
            blob = hashlib.sha1(b'blob '+str(len(line_ending)).encode()+b'\0'+line_ending).hexdigest()
            if blob == desired: return content.decode('latin1')
    raise ValueError(f'{path} differs from pinned source')
def coordinate(expr):
    expr=expr.strip()
    if expr.isdigit(): return f'{expr}:0'
    m=re.fullmatch(r'MAP_CELL_W(?:\*(\d+))?(?:\+(\d+))?',expr)
    if m is None: raise ValueError(expr)
    return f'{m[2] or 0}:{m[1] or 1}'
def parse(pin,path):
    game,kind,repo,commit,name,blob=pin
    source=verified(path,blob)
    source=re.sub(r'/\*.*?\*/',lambda m:'\n'*m[0].count('\n'),source,flags=re.S)
    source=re.sub(r'//[^\n]*','',source)
    lists={}
    for m in re.finditer(r'static short const (\w+)\[\]\s*=\s*\{([^}]+)\}',source):
        lists[m[1]]='|'.join(coordinate(x) for x in m[2].split(',') if x.strip()!='REFRESH_EOL')
    slope={m[1]:'|'.join(x.strip() for x in m[2].split(',') if x.strip()!='-1') for m in re.finditer(r'static char const (\w+)\[\]\s*=\s*\{([^}]+)\}',source)}
    rows=[]
    for m in re.finditer(r'^static\s+(?:Template|Terrain)TypeClass\s+const\s+(\w+)\s*\((.*?)^\);',source,re.M|re.S):
        args=[x.strip() for x in re.split(r',(?![^()]*\))',m[2])]
        guards=[]
        for line in source[:m.start()].splitlines():
            if re.match(r'^\s*#if',line): guards.append(line.strip())
            if re.match(r'^\s*#endif',line): guards.pop()
            if re.match(r'^\s*#(?:else|elif)',line) and guards: guards[-1]+='/'+line.strip()
        row={'game':game,'declaration':m[1],'enum':args[0],'theaters':'|'.join(re.findall(r'THEATERF_(\w+)',args[1])),'guard':' '.join(guards),'source_line':source.count('\n',0,m.start())+1}
        if kind=='template':
            assert len(args)==(9 if game=='TD' else 4),(m[1],args)
            row.update(ini=args[2].strip('"'),text_key=args[3])
            if game=='TD':
                args[8]=re.sub(r"\([^)]*\)", "", args[8]).strip()
                row.update(land=args[4],width=args[5],height=args[6],alternate_land=args[7],alternate_tile_indices=slope.get(args[8],''))
                assert args[8]=='NULL' or args[8] in slope,(m[1],args[8])
        else:
            assert len(args)==(18 if game=='TD' else 9),(m[1],args)
            xy=re.fullmatch(r'XYP_COORD\((\d+),\s*(\d+)\)',args[2]); row.update(base_x=xy[1],base_y=xy[2])
            flags=TD_FLAGS if game=='TD' else ['immune','water_based']
            for index,flag in enumerate(flags,3):
                assert args[index] in ('true','false')
                row[flag]=args[index]
            idx=3+len(flags);row.update(ini=args[idx].strip('"'),text_key=args[idx+1])
            if game=='TD':row.update(strength_token=args[idx+2],armor=args[idx+3])
            for prop,arg in zip(['occupy_cells','overlap_cells'],args[-2:]):
                key=re.sub(r'\([^)]*\)','',arg).strip()
                if key not in ('NULL','0'):row[prop]=lists[key]
        rows.append(row)
    assert rows and len(rows)==len(re.findall(r'^static\s+(?:Template|Terrain)TypeClass\s+const',source,re.M))
    return rows
def write(path,rows):
    fields=list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w',newline='') as f:
        w=csv.DictWriter(f,fields,delimiter='\t',lineterminator='\n');w.writeheader();w.writerows(rows)
def main():
    output=Path(sys.argv[5]);groups={'template':[],'prop':[]};summary=[]
    for pin,path in zip(PINS,sys.argv[1:5]):
        rows=parse(pin,Path(path));groups[pin[1]].extend(rows)
        summary.append({'game':pin[0],'table':pin[1],'source':f'https://github.com/{pin[2]}/blob/{pin[3]}/{pin[4]}','git_blob':pin[5],'declarations':len(rows),'distinct_ini':len({r['ini'] for r in rows}),'theater_memberships':dict(Counter(t for r in rows for t in r['theaters'].split('|'))),'conditional_declarations':{r['declaration']:r['guard'] for r in rows if r['guard']},'category_text_keys':Counter(r['text_key'] for r in rows)})
    for kind,rows in groups.items():write(output/('classic-terrain-'+kind+'s.tsv'),rows)
    (output/'classic-terrain-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print([(s['game'],s['table'],s['declarations']) for s in summary])
if __name__=='__main__':main()
