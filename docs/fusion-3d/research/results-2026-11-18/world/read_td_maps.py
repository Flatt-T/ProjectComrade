"""Read original-format TD MIX directory records and emit factual scenario counts.

Provide a named legacy MIX and an output path. Preserve MIX and member digests.
The identifier algorithm has collisions. Filename candidates are reported as such.
"""
import argparse,hashlib,json,re,struct
from collections import Counter,defaultdict
from pathlib import Path

def identifier(name):
    b=name.upper().encode('ascii');b+=b'\x00'*(-len(b)%4);n=0
    for i in range(0,len(b),4):n=(((n<<1)|(n>>31))+int.from_bytes(b[i:i+4],'little'))&0xffffffff
    return n
def read_mix(b):
    count,size=struct.unpack_from('<HI',b,0);start=6+count*12
    if start+size>len(b):raise ValueError('declared data exceeds MIX')
    out={}
    for i in range(count):
        k,p,n=struct.unpack_from('<III',b,6+i*12)
        if k in out or p+n>size:raise ValueError('invalid member')
        out[k]=(start+p,b[start+p:start+p+n])
    return out
def ini(b):
    sections=defaultdict(dict);name=None
    for line in b.decode('latin1').splitlines():
        line=line.split(';',1)[0].strip()
        if line.startswith('[') and line.endswith(']'):name=line[1:-1].upper()
        elif name and '=' in line:
            k,v=line.split('=',1);sections[name][k.strip()]=v.strip()
    return sections
def run(file):
    b=file.read_bytes();members=read_mix(b); names=defaultdict(list)
    for side in 'GBMJ':
        for num in range(100):
            for direction in 'EW':
                for variant in 'ABCDE':
                    s=f'SC{side}{num:02d}{direction}{variant}';names[identifier(s+'.INI')].append(s)
    rows=[]
    for k,(offset,raw) in members.items():
        if b'[basic]' not in raw.lower():continue
        s=ini(raw)
        if 'BASIC' not in s or 'MAP' not in s:continue
        row={'id_hex':f'{k:08x}','member_offset':offset,'member_sha256':hashlib.sha256(raw).hexdigest(),'filename_hash_candidates':names.get(k,[]),'basic':{k:v for k,v in s['BASIC'].items() if k.lower() in ('name','player','buildlevel','newiniformat')},'map':{k:v for k,v in s['MAP'].items() if k.lower() in ('x','y','width','height','theater')},'placed_types':{},'terrain_object_identifiers':dict(Counter(s['TERRAIN'].values())),'script_counts':{'triggers':len(s['TRIGGERS']),'teams':len(s['TEAMTYPES'])}}
        for category in ('INFANTRY','UNITS','AIRCRAFT','STRUCTURES'):
            cnt=Counter()
            for value in s[category].values():
                a=value.split(',')
                if len(a)>1:cnt[a[0]+':'+a[1]]+=1
            row['placed_types'][category]=dict(sorted(cnt.items()))
        if len(row['filename_hash_candidates'])==1:
            bin_id=identifier(row['filename_hash_candidates'][0]+'.BIN')
            if bin_id in members:
                _,layout=members[bin_id]
                row['paired_bin']={'id_hex':f'{bin_id:08x}','bytes':len(layout),'sha256':hashlib.sha256(layout).hexdigest()}
                if len(layout)==8192:row['paired_bin']['template_id_counts']=dict(sorted(Counter(layout[::2]).items()))
        rows.append(row)
    return {'mix_filename':file.name,'mix_sha256':hashlib.sha256(b).hexdigest(),'members':len(members),'maps':rows}
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('mix',type=Path);a.add_argument('out',type=Path);p=a.parse_args()
    p.out.write_text(json.dumps(run(p.mix),indent=1)+'\n')
