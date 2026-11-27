"""Produce factual per-definition rows and action evidence from pinned Westwood C++ sources.

Use `fetch_inputs.py .cache` first. No upstream artwork, audio or source files are emitted.
"""
from __future__ import annotations
import argparse, hashlib, itertools, json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def jsonl(path, rows):
    path.write_text(''.join(json.dumps(row,ensure_ascii=False,separators=(',',':'))+'\n' for row in rows))

def separate_arguments(expr):
    split=[]; depth=0; start=0
    for i,c in enumerate(expr):
        if c=='(':depth+=1
        elif c==')':depth-=1
        elif c==',' and depth==0:
            split.append(''.join(expr[start:i].split()));start=i+1
    split.append(''.join(expr[start:].split()))
    return split

def clean_cpp(text):
    text=re.sub(r'/\*.*?\*/',lambda m:'\n'*m.group().count('\n'),text,flags=re.S)
    return re.sub(r'//[^\n]*','',text)

def guards_at(lines,line):
    stack=[]
    for raw in lines[:line-1]:
        m=re.match(r'\s*#\s*(ifn?def|if|else|elif|endif)\b\s*(.*)',raw)
        if not m:continue
        op,cond=m.groups()
        if op.startswith('if'):stack.append((op+' '+cond).strip())
        elif op=='else' and stack:stack[-1]='else of '+stack[-1]
        elif op=='elif' and stack:stack[-1]='elif '+cond
        elif op=='endif' and stack:stack.pop()
    return stack

def variants(body):
    keys=sorted(set(re.findall(r'^\s*#ifdef\s+(\w+)',body,re.M)))
    for state in itertools.product([False,True], repeat=len(keys)):
        defs=dict(zip(keys,state));keep=[True];lines=[]
        for line in body.splitlines():
            stripped=line.strip()
            if stripped.startswith('#ifdef'):
                keep.append(defs[stripped.split()[1]])
            elif stripped.startswith('#else'):keep[-1]=not keep[-1]
            elif stripped.startswith('#endif'):keep.pop()
            elif not stripped.startswith('#') and all(keep):lines.append(line)
            elif stripped.startswith('#'):raise ValueError(stripped)
        yield defs,separate_arguments('\n'.join(lines))

def value(v):
    if v=='true':return True
    if v=='false':return False
    if re.fullmatch(r'-?\d+',v):return int(v)
    return v.strip('"')

def extract(inp,cache):
    text=(cache/inp['local']).read_bytes().decode('latin-1').replace('\r\n','\n');games=inp['profile'];code=clean_cpp(text);lines=code.splitlines();src=inp['url'];defs=[];actions=[]
    for m in re.finditer(r'(?m)^static\s+(\w+TypeClass)\s+const\s+(\w+)\s*\((.*?)^\s*\);',code,re.S):
        typ,sym,args=m.groups();params=re.search(r'(?m)^'+typ+'::'+typ+r'\s*\(([^)]*)\)',code)
        names=[re.search(r'(\w+)\s*$',p)[1] for p in params[1].split(',')];start=code.count('\n',0,m.start())+1;end=code.count('\n',0,m.end())+1
        sets=[]
        for branch,vals in variants(args):
            if len(names)!=len(vals):
                if 'ifdef OBSOLETE' not in guards_at(lines,start):raise ValueError((games,sym,len(names),len(vals)))
                sets.append((branch,{'ininame':value(vals[2]),'type':vals[0],'unmapped_argument_count':len(vals),'current_signature_count':len(names)}));continue
            sets.append((branch,{k:value(v) for k,v in zip(names,vals)}))
        shared={k:v for k,v in sets[0][1].items() if all(fs[k]==v for _,fs in sets)};obj_id=shared.pop('ininame');enum=shared.pop('type',shared.pop('airtype',None));record={'profile':games,'class':typ.removesuffix('TypeClass').lower(),'id':obj_id,'enum':enum,'symbol':sym,'src':f'{src}#L{start}-L{end}','definition_guard':guards_at(lines,start),'inputs':shared}
        if sets[0][0]:record['conditional_inputs']=[{'defines':ds,'fields':{k:v for k,v in fs.items() if k not in shared and k not in ['ininame','type','airtype']}} for ds,fs in sets]
        if games=='ra1':
            heap=re.search(r'new\s+'+typ+r'\s*\(\s*'+sym+r'\s*\)',code)
            if heap:
                reg=code.count('\n',0,heap.start())+1;record['heap_registration']={'line':reg,'guard':guards_at(lines,reg)}
        defs.append(record)
    rawlines=text.splitlines();table=None;table_line=0
    for n,ln in enumerate(rawlines,1):
        t=re.match(r'\s*(?:static\s+)?(?:int|DoInfoStruct)\s+(\w+)\s*\[\s*DO_COUNT\s*\].*?=',ln)
        if t:table=t[1];table_line=n;continue
        if not table:continue
        if re.match(r'\s*};',ln):table=None;continue
        m=re.match(r'\s*\{?\s*([\d\s+\-]+),\s*([\d\s+\-]+),\s*([\d\s+\-]+)\s*\}?\s*,?\s*//\s*(DO_\w+)(.*)$',ln)
        if not m:continue
        start,count,stride,action,note=m.groups();actions.append({'profile':games,'table':table,'state':action,'start_frame_expr':start.strip(),'frames':int(count.strip()),'facing_stride':int(stride.strip()),'annotated_unavailable':bool(re.search(r'\bN/?A\b',note,re.I)),'src':src+f'#L{n}'})
    return defs,actions

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('cache',nargs='?',type=Path,default=ROOT/'.cache');args=ap.parse_args();inputs=json.loads((ROOT/'source-lock.json').read_text());defs=[];actions=[]
    for i in inputs:
        if i['profile'] in ('td','ra1') and i['local'].endswith('.CPP'):
            rows,states=extract(i,args.cache);defs.extend(rows);actions.extend(states)
    assert len({(x['profile'],x['symbol'],x['class']) for x in defs})==len(defs)
    for e in ('td','ra1'):
        jsonl(ROOT/(e+'-definition-facts.jsonl'),[x for x in defs if x['profile']==e]);jsonl(ROOT/(e+'-infantry-action-facts.jsonl'),[x for x in actions if x['profile']==e]);print(e,sum(x['profile']==e for x in defs),sum(x['profile']==e for x in actions))
