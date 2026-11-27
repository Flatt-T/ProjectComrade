"""Source-only RA2 1.006 verification.
Usage: python ra2-patch-disc-audit.py GAME1.CAB RA21006EN.EXE rules-original.ini ra2-art.ini codec.rs apply.rs output_dir
Requires Python cryptography and rustc, approximately 1 GiB free temporary space.
"""
import collections,csv,gzip,hashlib,json,mmap,runpy,shutil,struct,subprocess,sys,tempfile,zlib
from pathlib import Path

TOOLS=runpy.run_path(str(Path(__file__).with_name('ra2-patch-audit.py')))
sha=TOOLS['sha'];sections=TOOLS['sections'];cid=TOOLS['key_for'];mix=TOOLS['mix']
def extract_container(cab,dest):
    assert sha(cab)=='74f714560536804ad184b326fafa8134c38de7617bef9ab89b86c59899a29a62'
    assert cab[:4]==b'MSCF' and struct.unpack_from('<I',cab,8)[0]==len(cab)
    index=struct.unpack_from('<I',cab,16)[0];entries={}
    for _ in range(struct.unpack_from('<H',cab,28)[0]):
        size,offset,folder=struct.unpack_from('<IIH',cab,index);end=cab.index(0,index+16);name=cab[index+16:end].decode('ascii');entries[name]=(size,offset,folder);index=end+1
    size,offset,folder=entries['ra2.mix'];assert size==281074192 and offset==0
    pos,blocks,compression=struct.unpack_from('<IHH',cab,36+8*folder);assert compression==1
    history=b''
    with dest.open('wb') as output:
        for _ in range(blocks):
            _,count,length=struct.unpack_from('<IHH',cab,pos);block=cab[pos+8:pos+8+count];assert block[:2]==b'CK'
            dec=zlib.decompressobj(-15,zdict=history);data=dec.decompress(block[2:])+dec.flush()
            assert dec.eof and len(data)==length;output.write(data);history=data[-32768:];pos+=8+count
    assert dest.stat().st_size==size
def contents(file):
    summary={};tables={}
    with file.open('rb') as f, mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as data:
        all_rows=mix(data);off,length=all_rows[cid('LOCAL.MIX')];local=data[off:off+length];inner=mix(local)
        summary.update(container_sha256=sha(data),bytes=len(data),members=len(all_rows),local_offset=off,local_bytes=length,local_sha256=sha(local),local_members=len(inner))
        for name in ['RULES.INI','ART.INI']:
            at,size=inner[cid(name)];raw=local[at:at+size];summary[name]={'offset_in_local':at,'bytes':size,'sha256':sha(raw)};tables[name]=sections(raw)
    return summary,tables
def compare(a,b):
    rows=[];diffs={}
    for key in sorted(a.keys()|b.keys()):
        sides=[x.get(key) for x in (a,b)]
        hh=[sha(json.dumps(l,ensure_ascii=True,separators=(',',':')).encode()) if l is not None else None for l in sides];rows.append([key,*hh])
        if all(l is not None for l in sides) and sides[0]!=sides[1]:
            av,bv=(collections.Counter(map(tuple,l)) for l in sides)
            diffs[key]={'only_left_key_values':list((av-bv).elements()),'only_right_key_values':list((bv-av).elements()),'order_only':av==bv}
    common=a.keys()&b.keys()
    return {'left_sections':len(a),'right_sections':len(b),'common':len(common),'equal_ordered':sum(a[k]==b[k] for k in common),'different_common':len(diffs),'left_only':sorted(a.keys()-b.keys()),'right_only':sorted(b.keys()-a.keys()),'differences':diffs,'section_hashes_columns':['section','left_ordered_fields_sha256','right_ordered_fields_sha256'],'section_hashes':rows}
def main():
    cab,patch,crules,cart,codec,apply,out=map(Path,sys.argv[1:8]);out.mkdir(exist_ok=True,parents=True)
    assert sha(patch.read_bytes())=='9b66734863c12f7634c44ef9a401a136d897010eed10f3aafe28d5a424e48156'
    assert sha(codec.read_bytes())=='fcb697c7f40ee7f4f05daf102afd5771e8284478c9714c2007a886d0b161d400'
    assert sha(apply.read_bytes())=='135441fd115dd813c2786ccad36593e6c28e889cc11be9ef5684a7d16aa0a2f5'
    with tempfile.TemporaryDirectory() as tmp:
        q=Path(tmp);base=q/'base.mix';patched=q/'patched.mix';extract_container(cab.read_bytes(),base)
        shutil.copy(codec,q/'codec.rs');shutil.copy(apply,q/'apply.rs');shutil.copy(Path(__file__).with_name('ra2-patch-disc-delta.rs'),q/'main.rs')
        subprocess.run(['rustc','--edition=2021','-Awarnings','-O','main.rs','-o','decoder'],cwd=q,check=True)
        subprocess.run([q/'decoder',base,patch.resolve(),patched],cwd=q,check=True)
        bs,bt=contents(base);ps,pt=contents(patched)
    report={'inputs':{'allied_game1_cab':sha(cab.read_bytes()),'ra2_patch_exe':sha(patch.read_bytes()),'comparator_rules':sha(crules.read_bytes()),'comparator_art':sha(cart.read_bytes())},'base':bs,'patched':ps,'comparisons':{}}
    for name,reference in [('RULES.INI',crules),('ART.INI',cart)]:
        report['comparisons'][name]={'base_to_1006':compare(bt[name],pt[name]),'1006_to_existing_comparator':compare(pt[name],sections(reference.read_bytes()))}
    art=report['comparisons']['ART.INI']['1006_to_existing_comparator']
    rows=[]
    for section,diff in art['differences'].items():
        rows.append([section,'compare_fields',json.dumps(diff['only_left_key_values'],separators=(',',':')),json.dumps(diff['only_right_key_values'],separators=(',',':')),str(diff['order_only']).lower()])
    for section in art['right_only']:rows.append([section,'exclude_comparator_only_section_from_1006','','',''])
    for section in art['left_only']:rows.append([section,'source_missing_section_from_official_1006','','',''])
    with (out/'ra2-patch-art-corrections.tsv').open('w',newline='') as dest:
        w=csv.writer(dest,delimiter='\t',lineterminator='\n');w.writerow(['section','action','official_1006_specific_key_values','comparator_specific_key_values','order_only']);w.writerows(sorted(rows))
    assert bs['container_sha256']=='adea10f3125700257362bc73a3ac73647036335a0a705632a29330a390f20f43'
    assert ps['container_sha256']=='896a8b64f9f1bb8ad5e0bc64fc0b8ea8c84112494761ea1a43478d10c5ef9914'
    raw=(json.dumps(report,sort_keys=True,separators=(',',':'))+'\n').encode()
    with (out/'ra2-patch-disc-comparison.json.gz').open('wb') as target,gzip.GzipFile(fileobj=target,mode='wb',filename='',mtime=0) as stream:stream.write(raw)
if __name__=='__main__':main()
