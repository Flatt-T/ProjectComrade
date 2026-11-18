"""Summarise EA's public map source without exporting map layouts or textures.

Usage: python read_sage_maps.py PINNED_ARCHIVE.zip OUTPUT_DIRECTORY
Container and chunk grammar: OpenSAGE Data/Map and EA's released WorldBuilder sources.
Counts describe this archive; retail inclusion requires its own evidence.
"""
import argparse, collections, copy, hashlib, json, re, struct, sys, zlib, zipfile
from array import array
from pathlib import Path
from xml.etree import ElementTree as ET

PIN='3aad8e412961ab543192ae70f8503dc8e178e095'
FAMILIES={'Generals':'generals','Zero Hour':'zh','Tiberium Wars':'tw','Kanes Wrath':'kw','Red Alert 3':'ra3','Uprising':'uprising','Tiberian Twilight':'c4'}
def u32(data,pos):return struct.unpack_from('<I',data,pos)[0]
def refpack(data,length):
    if data[:2] != b'\x10\xfb' or int.from_bytes(data[2:5],'big')!=length:
        raise ValueError('Unexpected RefPack header/size')
    i=5; out=bytearray()
    while i<len(data):
        op=data[i]; i+=1; back=0; repeat=0; stop=False
        if op<128:
            a=data[i];i+=1;raw=op&3;back=1+a+((op&0x60)<<3);repeat=3+((op>>2)&7)
        elif op<192:
            a,b=data[i:i+2];i+=2;raw=a>>6;back=1+((a&63)<<8)+b;repeat=4+(op&63)
        elif op<224:
            a,b,c=data[i:i+3];i+=3;raw=op&3;back=1+((op&16)<<12)+(a<<8)+b;repeat=5+((op&12)<<6)+c
        elif op<252:raw=4*((op&31)+1)
        else:raw=op&3;stop=True
        if i+raw>len(data) or len(out)+raw+repeat>length:raise ValueError('Out-of-bounds packet')
        out.extend(data[i:i+raw]);i+=raw
        if repeat:
            if back>len(out):raise ValueError('Backreference before start')
            part=out[-back:] if back<repeat else out[len(out)-back:len(out)-back+repeat]
            out.extend((part*((repeat+len(part)-1)//len(part)))[:repeat])
        if stop:break
    if len(out)!=length:raise ValueError('RefPack length mismatch')
    return out
def unpack(b):
    if b[:4]==b'CkMp':return b
    size=u32(b,4)
    if size>150_000_000:raise ValueError('Unexpected map size')
    if b[:4]==b'EAR\0':return refpack(b[8:],size)
    if b[:4]==b'ZL5\0':
        a=zlib.decompress(b[8:])
        if len(a)!=size:raise ValueError('zlib size mismatch')
        return a
    raise ValueError('Unknown compression')
def chunks(b,toc,pos,end):
    while pos<end:
        idx,ver,size=struct.unpack_from('<IHI',b,pos);pos+=10
        if pos+size>end or idx not in toc:raise ValueError('Invalid chunk')
        yield toc[idx],ver,pos,size
        pos+=size
    if pos!=end:raise ValueError('Misaligned chunk end')
def textures(b,pos,size,w,h,v):
    area=w*h
    if u32(b,pos)!=area or v<6:raise ValueError('Blend area/version')
    onebit=((w+7)//8)*h
    off=pos+4+area*(2+(4 if 14<=v<24 else 2)*3)
    if v>6:off+=((w+1)//8*h if v==7 else onebit)
    off+=onebit*sum([v>=10,v>=11,14<=v<25,v>=15,v>=17,3*(v>=24)])
    off+=area*(int(16<=v<25)+int(v>=25))
    n=u32(b,off+12);off+=16; names=[]
    if n>4096:raise ValueError('Texture count outside supported range')
    for i in range(n):
        start,count,edge,magic,l=struct.unpack_from('<IIIIH',b,off);off+=18
        if count!=edge**2 or magic or not 0<l<512 or off+l>pos+size:raise ValueError('Invalid texture record')
        names.append(bytes(b[off:off+l]).decode('ascii'));off+=l
    return names
def recover_texture_table(b,start,size,version):
    # Early authoring versions have different raster fields. Require a unique full
    # self-consistent table with contiguous cell indices and a validated trailer.
    segment=bytes(b[start:start+size]); candidates=[]
    pattern=rb'\x00{4}([\x01-\x7f])\x00([A-Za-z_][A-Za-z_0-9 -]{2,})'
    for m in re.finditer(pattern,segment):
        pos=m.start()-12
        if pos<16:continue
        n=u32(segment,pos-4)
        if not 1<=n<=512:continue
        cursor=pos;expected=0;names=[]
        for _ in range(n):
            if cursor+18>len(segment):break
            ti,count,edge,magic,nch=struct.unpack_from('<IIIIH',segment,cursor)
            if ti!=expected or not 0<count==edge*edge or magic or not 1<=nch<=255:break
            word=segment[cursor+18:cursor+18+nch]
            if len(word)!=nch or any(v<32 or v>126 for v in word):break
            names.append(word.decode('ascii'));cursor+=18+nch;expected+=count
        if len(names)==n and cursor+8<=len(segment) and u32(segment,cursor+4)==0 and u32(segment,pos-(12 if version==4 else 16))==expected:
            candidates.append(names)
    if len(candidates)!=1:raise ValueError('Unique structural table not found')
    return candidates[0]
def parse(raw):
    b=unpack(raw)
    if b[:4]!=b'CkMp':raise ValueError('Missing map signature')
    n=u32(b,4);toc={};pos=8
    for _ in range(n):
        l=b[pos];pos+=1;name=bytes(b[pos:pos+l]).decode('ascii');pos+=l;toc[u32(b,pos)]=name;pos+=4
    row={'chunks':{},'world_objects':{},'issues':[]}
    for name,v,p,size in chunks(b,toc,pos,len(b)):
        row['chunks'][name]=v
        if name=='HeightMapData':
            w,h,border,nb=struct.unpack_from('<IIII',b,p);area=w*h
            off=p+12 if v<4 else p+16+nb*(16 if v>=6 else 8)
            if u32(b,off)!=area:raise ValueError('Invalid height area')
            a=array('H' if v>=5 else 'B');a.frombytes(b[off+4:off+4+area*a.itemsize])
            if sys.byteorder!='little' and a.itemsize==2:a.byteswap()
            if len(a)!=area:raise ValueError('Short height field')
            row['height']={'width':w,'height':h,'border':border,'raw_min':min(a) if a else None,'raw_max':max(a) if a else None,'bits':a.itemsize*8}
        if name=='BlendTileData':
            try:row['texture_table']=textures(b,p,size,w,h,v)
            except (ValueError,UnicodeError,struct.error) as ex:
                try:
                    row['texture_table']=recover_texture_table(b,p,size,v);row['texture_method']='unique validated record scan'
                except ValueError:row['issues'].append('texture table: '+str(ex))
        if name=='ObjectsList':
            counts=collections.Counter()
            for k,sv,sp,sz in chunks(b,toc,p,p+size):
                if k!='Object' or sz<22:raise ValueError('Unexpected object grammar')
                l=struct.unpack_from('<H',b,sp+20)[0]
                if sp+22+l>sp+sz:raise ValueError('Invalid object type length')
                object_id=bytes(b[sp+22:sp+22+l]).decode('ascii','backslashreplace')
                counts[object_id]+=1
            row['placed_object_count']=sum(counts.values())
            row['world_objects']={k:n for k,n in sorted(counts.items()) if re.search(r'bridge|ramp|garrison|pier|dock|tree|palm|bush|shrub|rock|water|tiberium|ore|supply|ice|cliff|canal|wall|crater|ruin|beacon|capture|commandpost|uplink|tunnel|civilian',k,re.I)}
    return row
def run(archive,out):
    out.mkdir(parents=True,exist_ok=True); z=zipfile.ZipFile(archive);cache={};families=collections.defaultdict(list);metadata=[];structure=collections.Counter()
    for path in z.namelist():
        parts=path.split('/'); game=parts[1] if len(parts)>1 else ''
        if game not in FAMILIES:continue
        rel='/'.join(parts[1:]); low=rel.lower()
        if low.endswith('mapmetadata.xml'):
            for e in ET.fromstring(z.read(path)).iter():
                if 'FileName' in e.attrib:
                    keys=['id','FileName','Width','Height','BorderSize','NumPlayers','IsOfficial','IsMultiplayer','CRC']
                    metadata.append({'source':rel,**{k:e.get(k) for k in keys}})
        if not low.endswith('.map'):continue
        raw=z.read(path);h=hashlib.sha256(raw).hexdigest()
        if h not in cache:
            try:cache[h]=parse(raw)
            except (ValueError,IndexError,struct.error,KeyError) as ex:cache[h]={'issues':[str(ex)]}
        evidence=cache[h]
        kind='internal' if '/internal/' in low else ('library' if '/libraries/' in low else ('official_directory' if '/official/' in low else 'other_archive_directory'))
        row={'path':rel,'sha256':h,'git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'directory_class':kind,**evidence}
        families[FAMILIES[game]].append(row)
    for key,rows in families.items():
        with (out/(key+'-maps.jsonl')).open('w') as f:
            for rec in rows:f.write(json.dumps(rec,separators=(',',':'),ensure_ascii=True)+'\n')
    (out/'map-metadata.json').write_text(json.dumps(metadata,indent=1)+'\n')
    summary={f:{'maps':len(rows),'height_records':sum('height' in x for x in rows),'texture_tables':sum('texture_table' in x for x in rows),'objects_lists':sum('placed_object_count' in x for x in rows),'maps_with_extraction_issues':sum(bool(x['issues']) for x in rows),'directories':dict(collections.Counter(x['directory_class'] for x in rows))} for f,rows in families.items()}
    (out/'summary.json').write_text(json.dumps({'repo':'electronicarts/CnC_Modding_Support','commit':PIN,'metadata_records':len(metadata),'families':summary},indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('output',type=Path);a=p.parse_args();run(a.archive,a.output)
