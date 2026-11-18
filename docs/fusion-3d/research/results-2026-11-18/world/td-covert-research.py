"""Read Covert Operations facts from public, range-readable Mode 1 CD tracks. Never execute media."""
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request,urlopen
from hashlib import sha256
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from struct import unpack_from
import argparse,gzip,json,re
from read_td_maps import run as scenario_rows,read_mix,ini
ROOT=Path(__file__).resolve().parent
SOURCES=[
    ('redump-id-28908','Command & Conquer - The Covert Operations (USA) (Track 1).bin',355961088,'9ed886bde4a0072db2843280ce2ecda91707388c'),
    ('command-conquer-the-covert-operations','C&C-COVERT-CD.bin',674184336,'bb9629a7ec23a7433db1e541e8c52f63e8a4f8fb')]
def blobhash(b):return sha256(b).hexdigest()
class Track:
    def __init__(self,source,cache):
        self.item,self.name,self.length,self.reported_sha1=source
        self.url='https://archive.org/download/'+self.item+'/'+quote(self.name)
        self.cache=cache/self.item;self.cache.mkdir(parents=True,exist_ok=True);self.extents=[]
    def payload(self,lba,nbytes):
        sectors=(nbytes+2047)//2048;lo=lba*2352;hi=(lba+sectors)*2352-1
        file=self.cache/f'{lo}-{hi}.sectors'
        if file.exists():raw=file.read_bytes()
        else:
            u=self.url+'?range_start='+str(lo)+'&range_end='+str(hi)
            req=Request(u,headers={'Range':f'bytes={lo}-{hi}','User-Agent':'Fusion-Historical-Research/1.0'})
            with urlopen(req,timeout=40) as stream:
                if stream.status!=206 or stream.headers.get('Content-Range')!=f'bytes {lo}-{hi}/{self.length}':raise ValueError(('unexpected range with',self.url,stream.status,stream.headers.get('Content-Range'),lo,hi))
                raw=stream.read()
            file.write_bytes(raw)
        assert len(raw)==sectors*2352
        for i in range(0,len(raw),2352):
            if raw[i:i+12]!=b'\x00'+b'\xff'*10+b'\x00' or raw[i+15]!=1:raise ValueError('expected MODE1/2352 sector')
        cooked=b''.join(raw[i+16:i+2064] for i in range(0,len(raw),2352))[:nbytes]
        self.extents.append({'start_lba':lba,'bytes_of_logical_payload':nbytes,'raw_range':[lo,hi],'raw_range_sha256':blobhash(raw),'logical_payload_sha256':blobhash(cooked)})
        return cooked
    def directory(self):
        pvd=self.payload(16,2048);assert pvd[:7]==b'\x01CD001\x01' and int.from_bytes(pvd[128:130],'little')==2048
        def record(b):
            n=b[32];return (b[33:33+n].decode('ascii').split(';')[0],int.from_bytes(b[2:6],'little'),int.from_bytes(b[10:14],'little'),bool(b[25]&2))
        _,start,sz,_=record(pvd[156:]);todo=[('',start,sz)];items=[]
        while todo:
            prefix,start,sz=todo.pop();b=self.payload(start,sz);pos=0
            while pos<len(b):
                size=b[pos]
                if not size:pos=(pos//2048+1)*2048;continue
                name,lba,length,folder=record(b[pos:pos+size]);pos+=size
                if name in ('\x00','\x01'):continue
                path=prefix+name
                if folder:todo.append((path+'/',lba,length))
                else:items.append({'path':path,'lba':lba,'bytes':length})
        return pvd[40:72].decode('ascii').strip(),items
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--cache',type=Path,required=True);ap.add_argument('--list',action='store_true');args=ap.parse_args()
    def one(source):
        t=Track(source,args.cache);volume,items=t.directory();print(t.item,volume,'files',len(items),[(f['path'],f['bytes']) for f in items if f['path'].endswith('.MIX')],flush=True)
        out={'item':t.item,'track':t.name,'archive_metadata_track_sha1_unverified_full_file':t.reported_sha1,'track_size':t.length,'source_url':t.url,'volume':volume,'files_indexed':len(items),'mix_directory':[f for f in items if f['path'].endswith('.MIX')]}
        if args.list:return out
        reader=next(f for f in items if f['path']=='README.TXT')
        readme=t.payload(reader['lba'],reader['bytes']);lines=readme.decode('cp1252').splitlines()
        assert '7 new GDI and 8 new NOD missions' in lines[170] and '10 new multiplayer maps' in lines[171]
        out['publisher_disc_readme']={**reader,'sha256':blobhash(readme),'section':'1.2','line_numbers_one_based':[171,172],'stated_new_gdi':7,'stated_new_nod':8,'stated_new_multiplayer':10}
        out['scenario_packs']={}
        for f in items:
            if not re.fullmatch(r'(?:.*/)?(?:GENERAL|SC-[\w-]+)\.MIX',f['path'],re.I):continue
            data=t.payload(f['lba'],f['bytes']);local=t.cache/Path(f['path']).name;local.write_bytes(data)
            try:m=scenario_rows(local)
            except (ValueError,IndexError) as e:print('skipped',f,e);continue
            if not m['maps']:continue
            members=read_mix(data)
            for row in m['maps']:
                _,raw=members[int(row['id_hex'],16)];sections=ini(raw);team_objects=Counter()
                teams_by_house=Counter();unsupported_tokens=[]
                for team,value in sections.get('TEAMTYPES',{}).items():
                    parts=value.split(',')
                    if len(parts)<11 or not parts[10].strip().isdigit():unsupported_tokens.append({'team':team,'reason':'nonstandard member-count field'});continue
                    for token in parts[11:11+int(parts[10])]:
                        member_match=re.fullmatch(r'\s*([A-Za-z0-9_]+):(\d+)\s*',token)
                        if not member_match:unsupported_tokens.append({'team':team,'reason':'unparsed member token','token':token});continue
                        ident,ct=member_match.groups();ident=ident.upper();team_objects[ident]+=int(ct);teams_by_house[parts[0]+':'+ident]+=int(ct)
                row['scripted_team_types_by_house_quantity_sum']=dict(sorted(teams_by_house.items()))
                if unsupported_tokens:row['unparsed_team_fields']=unsupported_tokens
                row['scripted_team_type_quantity_sum']=dict(sorted(team_objects.items()))
                # Only the declared member-count span is parsed. Later mission opcodes have numeric operands too.
                row['briefing_text_present']=bool(sections.get('BRIEFING'))
            out['scenario_packs'][f['path']]=m
        out['read_extents']=sorted(t.extents,key=lambda x:(x['start_lba'],x['bytes_of_logical_payload']));return out
    with ThreadPoolExecutor(max_workers=2) as pool:scans=list(pool.map(one,SOURCES))
    if args.list:return
    a,b=scans;pa,pb=a.pop('scenario_packs'),b.pop('scenario_packs')
    out={'edition':'PC DOS Covert Operations, two archived CD data tracks','tracks':[a,b],'equivalent_packs':pa==pb,'packs':pa}
    if not pa or pa!=pb:raise ValueError('Independent archive reads disagree or found no scenario packs')
    community=json.loads((ROOT/'td-community-scenarios.json').read_text());comm={r['member_sha256']:r for r in community['maps']}
    rows=[v for m in pa.values() for v in m['maps']];out['comparison']={'disc_maps':len(rows),'community_maps':len(comm),'same_ini_payload_as_community':[r['filename_hash_candidates'] or [r['id_hex']] for r in rows if r['member_sha256'] in comm],'only_on_disc_by_ini_checksum':[r['filename_hash_candidates'] or [r['id_hex']] for r in rows if r['member_sha256'] not in comm]}
    def byname(lst):return {tuple(r['filename_hash_candidates']):r for r in lst if len(r['filename_hash_candidates'])==1}
    c=byname(community['maps']);all_names={};comparison={}
    for pack,m in pa.items():
        src=byname(m['maps']);overlap=sorted(src.keys()&c.keys())
        comparison[pack]={'maps':len(m['maps']),'by_player':dict(Counter(r['basic'].get('Player') for r in m['maps'])),'by_theater':dict(Counter(r['map'].get('Theater') for r in m['maps'])),'with_paired_tiles':sum('paired_bin' in r for r in m['maps']),'same_candidate_name_as_community_count':len(overlap),'same_scenario_member_sha256_count':sum(src[n]['member_sha256']==c[n]['member_sha256'] for n in overlap),'same_paired_terrain_sha256_count':sum(src[n].get('paired_bin',{}).get('sha256')==c[n].get('paired_bin',{}).get('sha256') for n in overlap)}
        for name,row in src.items():all_names.setdefault(name[0],[]).append((pack,row))
    out['comparison']['by_pack']=comparison;out['comparison']['distinct_candidate_filenames']=len(all_names)
    out['comparison']['same_candidate_in_multiple_disc_packs']={k:[{'pack':pack,'ini_sha256':r['member_sha256'],'terrain_sha256':r.get('paired_bin',{}).get('sha256')} for pack,r in v] for k,v in all_names.items() if len(v)>1}
    dest=ROOT/'td-covert-disc-facts.json.gz';encoded=(json.dumps(out,indent=1)+'\n').encode()
    with dest.open('wb') as file,gzip.GzipFile(filename='',fileobj=file,mode='wb',mtime=0) as gz:gz.write(encoded)
    assert gzip.decompress(dest.read_bytes())==encoded
    summary={'verified_members_across_two_archival_images':out['equivalent_packs'],'disc_map_records':len(rows),'distinct_candidate_filenames':len(all_names),'advertised_on_disc':a['publisher_disc_readme'],'by_pack':comparison,'duplicate_candidates_and_digests':out['comparison']['same_candidate_in_multiple_disc_packs'],'full_facts_sha256':blobhash(dest.read_bytes()),'unzipped_sha256':blobhash(encoded)}
    (ROOT/'td-covert-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print('DONE',len(rows),len(out['comparison']['same_ini_payload_as_community']))
if __name__=='__main__':main()
