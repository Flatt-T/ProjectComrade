"""Independently compare locally held edition data without distributing it."""
import argparse
import hashlib
import json
from pathlib import Path

def load_section_values(path,allow_trailing):
    sections={}
    current=None
    data=path.read_bytes()
    for line in data.decode('latin1').splitlines():
        code=line.partition(';')[0].strip()
        if code.startswith('[') and ']' in code and (allow_trailing or code.endswith(']')):
            current=code[1:code.index(']')].strip()
            sections.setdefault(current,[])
        elif current and '=' in code:
            key,_,value=code.partition('=')
            sections[current].append([key.strip(),value.strip()])
    return sections,hashlib.sha256(data).hexdigest()

def compare(left,right,allow_trailing):
    l,lh=load_section_values(left,allow_trailing)
    r,rh=load_section_values(right,allow_trailing)
    shared=l.keys()&r.keys()
    return {'left_sha256':lh,'right_sha256':rh,'left':len(l),'right':len(r),'equal':sum(l[k]==r[k] for k in shared),
            'changed':sum(l[k]!=r[k] for k in shared),'left_only':len(l.keys()-r.keys()),'right_only':len(r.keys()-l.keys())}

if __name__=='__main__':
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('base_rule',type=Path)
    args.add_argument('patched_rule',type=Path)
    args.add_argument('base_art',type=Path)
    args.add_argument('patched_art',type=Path)
    args.add_argument('yr_patch_rule',type=Path)
    args.add_argument('comparison_dir',type=Path)
    args.add_argument('--yr-disc-dir',type=Path,help='original disc-extracted rulesmd.ini and artmd.ini')
    a=args.parse_args()
    pairs={
        'RA2 base vs 1.006 rules':(a.base_rule,a.patched_rule),
        'RA2 1.006 vs comparison rules':(a.patched_rule,a.comparison_dir/'rules-original.ini'),
        'RA2 base vs 1.006 art':(a.base_art,a.patched_art),
        'RA2 1.006 vs comparison art':(a.patched_art,a.comparison_dir/'ra2-art.ini'),
        'YR 1.001 vs comparison rules':(a.yr_patch_rule,a.comparison_dir/'rulesmd-original.ini')}
    if a.yr_disc_dir:
        pairs.update({'YR base vs comparison rules':(a.yr_disc_dir/'rulesmd.ini',a.comparison_dir/'rulesmd-original.ini'),
                      'YR base vs 1.001 rules':(a.yr_disc_dir/'rulesmd.ini',a.yr_patch_rule),
                      'YR base vs community art':(a.yr_disc_dir/'artmd.ini',a.comparison_dir/'yr-art.ini')})
    strict={key:compare(*files,False) for key,files in pairs.items()}
    tolerant={key:compare(*files,True) for key,files in pairs.items()}
    expected=[(1176,14,0),(1190,0,0),(1299,0,0),(1187,112,115),(1452,25,0)]
    if a.yr_disc_dir:
        expected.extend([(1477,0,0),(1452,25,0),(1449,131,20)])
        assert (a.yr_disc_dir/'rulesmd.ini').read_bytes()==(a.comparison_dir/'rulesmd-original.ini').read_bytes().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
    for item,pop in zip(strict.values(),expected,strict=True):
        assert (item['equal'],item['changed'],item['right_only'])==pop,item
    extra_headers={}
    for left,right in pairs.values():
        for f in (left,right):
            strict_names,_=load_section_values(f,False)
            extra_headers[f.name]=sorted(load_section_values(f,True)[0].keys()-strict_names.keys())
    result={'strict_named_headers':strict,'allow_trailing_text_after_closing_bracket':tolerant,
            'additional_names_under_second_reader':extra_headers,
            'qualification':'Comparison uses two section-header conventions. The runtime loader determines whether a trailing non-INI comment becomes part of the preceding block or begins another named section.'}
    print(json.dumps(result,indent=2))
