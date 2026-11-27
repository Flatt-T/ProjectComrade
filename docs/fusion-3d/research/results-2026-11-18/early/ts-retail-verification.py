"""Compare pinned normalized INI text to original-format TS/Firestorm disc extents; no media redistribution."""
import argparse,hashlib,json,re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parent
NAMES=('rules.ini','art.ini','firestrm.ini','artfs.ini','temperat.ini','snow.ini')
DISCS=[
    {'profile':'ts-nod-early','item':'cnc-tiberiansun-nod-108','disc':'C&C Tiberian Sun (Nod CD).iso','volume':'','sector_bytes':2048,'image_size':700069888,'file':'INSTALL/TIBSUN.MIX','lba':11096,'bytes':75094736,'local':'TS-TIBSUN.MIX'},
    {'profile':'fs-uk-retail','item':'firestorm_202412','disc':'FIRESTORM.bin','volume':'','sector_bytes':2352,'image_size':814043664,'file':'INSTALL/EXPAND01.MIX','lba':307542,'bytes':36972996,'local':'FS-EXPAND01.MIX'}]
def sha(b):return hashlib.sha256(b).hexdigest()
def indexed(b):
    sec=None;out={}
    for line in b.decode('cp1252',errors='replace').splitlines():
        line=line.partition(';')[0].strip()
        if re.fullmatch(r'\[[^\]]+\]',line):sec=line[1:-1].upper()
        elif sec and '=' in line:
            k,v=line.split('=',1);out[sec,k.strip().upper()]=v.strip()
    return out
def offsets(b,pattern):
    found=[];p=0
    while True:
        i=b.find(pattern,p)
        if i<0:return found
        found.append(i);p=i+len(pattern)
def fetch_container(d,path):
    logical_sector=2048;physical=d['sector_bytes'];url='https://archive.org/download/'+d['item']+'/'+quote(d['disc'])
    def segment(offset):
        length=min(2*1024*1024,d['bytes']-offset);lba=d['lba']+offset//logical_sector
        count=(length+2047)//2048;a=lba*physical;b=(lba+count)*physical-1
        req=Request(url+f'?from_sector={lba}&count={count}',headers={'Range':f'bytes={a}-{b}','User-Agent':'Fusion-research/1.0'})
        with urlopen(req,timeout=45) as res:
            if res.status!=206 or res.headers.get('Content-Range')!=f'bytes {a}-{b}/{d["image_size"]}':raise ValueError('Unexpected range')
            raw=res.read()
        if len(raw)!=b-a+1:raise ValueError('partial response')
        if physical==2352:
            if any(raw[i:i+12]!=b'\0'+b'\xff'*10+b'\0' or raw[i+15]!=1 for i in range(0,len(raw),physical)):raise ValueError('expected raw Mode 1')
            raw=b''.join(raw[i+16:i+2064] for i in range(0,len(raw),physical))
        return raw[:length]
    with ThreadPoolExecutor(max_workers=5) as pool:data=b''.join(pool.map(segment,range(0,d['bytes'],2*1024*1024)))
    path.write_bytes(data)
def main():
    p=argparse.ArgumentParser();p.add_argument('source_cache',type=Path,help='fetch_inputs.py cache containing westwood/');p.add_argument('media_cache',type=Path);p.add_argument('--download',action='store_true');p.add_argument('--output',type=Path,default=ROOT/'ts-retail-verification.json');a=p.parse_args()
    files={x['local']:x for x in json.loads((ROOT/'source-lock.json').read_text())};out={'comparison':'Whole LF comparator converted to CRLF, searched as a literal byte span in the named disc container. No decoding of asset content or assumption about padding beyond the span.','disc_profiles':[]}
    expected={'ts-nod-early':('23431290b211cd039315095e1987f1c411ecd3b6440861c4874572c92e5f6b2a','TS2'),'fs-uk-retail':('f1f37a7a9c14bc32dcd308474dcfa9ab7736d57b2a7cbf6e6be1d4d298af6cec','FIRESTORM')}
    for src in DISCS:
        d=dict(src);path=a.media_cache/d.pop('local');path.parent.mkdir(parents=True,exist_ok=True)
        if not path.exists() and a.download:fetch_container(d,path)
        data=path.read_bytes();assert len(data)==d['bytes'] and sha(data)==expected[d['profile']][0]
        d.update(volume=expected[d['profile']][1],container_sha256=sha(data),archive_record='https://archive.org/details/'+d['item'],results=[])
        # Use StringFileInfo from the disc's installed executable; no execution or unpacking.
        versions={'ts-nod-early':(9118,239351,'1.08','4d1175a530847a1a75fc2b6424312e416d87554812814518690f92fe4b685bfe'),'fs-uk-retail':(325600,3457296,'2.0','6944afe138a623e0ccbcc8280f33bbde9724a2bdf0fbcec06755f7b0821c3b3c')}
        lba,size,version,expected_digest=versions[d['profile']]
        exe=a.media_cache/(d['item']+'-GAME.EXE')
        if not exe.exists() and a.download:fetch_container({**d,'lba':lba,'bytes':size},exe)
        exe_bytes=exe.read_bytes();assert len(exe_bytes)==size and sha(exe_bytes)==expected_digest
        vers={}
        for key in ['FileVersion','ProductVersion']:
            pos=exe_bytes.index(key.encode('utf-16le'));value=exe_bytes[pos:pos+100].decode('utf-16le',errors='replace')
            match=re.match(key+r'\x00+([0-9.]+)\x00',value);assert match and match[1]==version
            vers[key]={'version':match[1],'string_key_file_offset':pos}
        d['installed_executable']={'iso_path':'INSTALL/GAME.EXE','lba':lba,'bytes':size,'sha256':expected_digest,'strings':vers}
        for n in NAMES:
            source=files['westwood/'+n];orig=(a.source_cache/source['local']).read_bytes();assert sha(orig)==source['sha256'] and b'\r' not in orig
            crlf=orig.replace(b'\n',b'\r\n');matches=offsets(data,crlf)
            row={'ini':n,'comparator_lf_bytes':len(orig),'comparator_lf_sha256':sha(orig),'crlf_bytes':len(crlf),'crlf_sha256':sha(crlf),'exact_complete_text_offsets_in_container':matches,'source':source['url']}
            if d['profile']=='ts-nod-early' and n in ['rules.ini','art.ini']:
                # Unique first 48 / final 100 reference bytes define a comparison interval independently of MIX header parsing.
                starts=offsets(data,crlf[:48]);ends=offsets(data,crlf[-100:]);assert len(starts)==len(ends)==1 and starts[0]<ends[0]
                lo,hi=starts[0],ends[0]+100;actual=indexed(data[lo:hi]);comp=indexed(crlf);both=actual.keys()&comp.keys()
                row['anchored_range_comparison']={'start':lo,'exclusive_end':hi,'sha256':sha(data[lo:hi]),'disc_index_keys':len(actual),'comparator_index_keys':len(comp),'common_keys':len(both),'equal_values':sum(actual[k]==comp[k] for k in both),'changed':[{'section':s,'field':f,'disc':actual[s,f],'comparator':comp[s,f]} for s,f in sorted(both) if actual[s,f]!=comp[s,f]],'only_in_disc':[{'section':s,'field':f,'value':actual[s,f]} for s,f in sorted(actual.keys()-comp.keys())],'only_in_comparator':[{'section':s,'field':f,'value':comp[s,f]} for s,f in sorted(comp.keys()-actual.keys())]}
            d['results'].append(row)
        out['disc_profiles'].append(d)
    a.output.write_text(json.dumps(out,indent=2)+'\n')
if __name__=='__main__':main()
