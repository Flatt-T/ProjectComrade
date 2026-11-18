"""Usage: python ra2-patch-audit.py RA21006EN.EXE YURI-1001-ENGLISH.EXE rulesmd-original.ini codec.rs output_dir
Requires rustc and Python cryptography. Input codec.rs is the pinned, published rtptool decoder (see report). Temporary data is not distributed.
"""
import base64,collections,hashlib,json,re,struct,subprocess,sys,tempfile,zlib
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher,modes
from cryptography.hazmat.decrepit.ciphers.algorithms import Blowfish
sha=lambda b:hashlib.sha256(b).hexdigest()
def sections(data):
    r=collections.defaultdict(list);name=None
    for line in data.decode('cp1252',errors='replace').splitlines():
        line=line.split(';',1)[0].strip();m=re.fullmatch(r'\[([^]]+)\]',line)
        if m:name=m[1];r[name];continue
        if name and '=' in line:
            k,v=line.split('=',1);r[name].append([k.strip(),v.strip()])
    return r
def key_for(name):
    s=name.upper().encode();t=len(s)%4
    if t:s+=bytes([t])+bytes([s[(len(s)//4)*4]])*(3-t)
    return zlib.crc32(s)
def mix(data):
    modulus=int.from_bytes(base64.b64decode('AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V')[2:],'big')
    key=b''.join(pow(int.from_bytes(data[k:k+40],'little'),65537,modulus).to_bytes(40,'little')[:39] for k in (4,44))[:56]
    cipher=Cipher(Blowfish(key),modes.ECB())
    num,size=struct.unpack_from('<HI',cipher.decryptor().update(data[84:92]));header=(6+num*12+7)//8*8;table=cipher.decryptor().update(data[84:84+header]);start=84+header
    assert start+size+20==len(data) and hashlib.sha1(data[start:start+size]).digest()==data[-20:]
    records={k:(start+o,n) for k,o,n in (struct.unpack_from('<III',table,6+12*i) for i in range(num))}
    assert len(records)==num and all(s+n<=start+size for s,n in records.values())
    return records
def main():
    ra,yr,cmp,codec=[Path(x).read_bytes() for x in sys.argv[1:5]];out=Path(sys.argv[5])
    assert sha(ra)=='9b66734863c12f7634c44ef9a401a136d897010eed10f3aafe28d5a424e48156' and sha(yr)=='49acccbec1e5264bc1538b497682a8eae0cab790b5a4d858e9812a2b10e9b104'
    assert sha(cmp)=='c8718ffd3d155fb2f60d15cbd0c3a8fd5c0b9bc786b3b78c7bd53dff1d42da57'
    assert sha(codec)=='fcb697c7f40ee7f4f05daf102afd5771e8284478c9714c2007a886d0b161d400'
    assert yr[238111:238126]==b'expandmd01.mix\x00'
    with tempfile.TemporaryDirectory() as td:
        p=Path(td);(p/'codec.rs').write_bytes(codec);(p/'data').write_bytes(yr[238126:238126+1952805])
        (p/'main.rs').write_text('mod codec;fn main(){let b=std::fs::read("data").unwrap();let o=codec::decompress(&b,0,b.len(),4813968).unwrap();std::fs::write("mix",o).unwrap();}')
        subprocess.run(['rustc','-O','main.rs','-o','decoder'],cwd=p,check=True);subprocess.run([p/'decoder'],cwd=p,check=True);pack=(p/'mix').read_bytes()
    assert sha(pack)=='0c0a64e741bdecdc3843a0beb6bb1f58aa2df5b86eb3bc4a953821ec98f3d6ec'
    records=mix(pack);off,size=records[key_for('rulesmd.ini')];rules=pack[off:off+size];assert sha(rules)=='3d341ef8a13a4b5ab24af2eef48ac94931ac2bb87d950fe3330a07e2d25672ef'
    a,b=sections(rules),sections(cmp);assert a.keys()==b.keys()
    hashes=[];differences={}
    for name in sorted(a):
        h=lambda seq:sha(json.dumps(seq,ensure_ascii=True,separators=(',',':')).encode())
        hashes.append([name,h(a[name]),h(b[name])])
        if a[name]!=b[name]:
            aa,bb=a[name],b[name];differences[name]={'only_patch_key_values':[list(t) for t in (collections.Counter(map(tuple,aa))-collections.Counter(map(tuple,bb))).elements()],'only_comparator_key_values':[list(t) for t in (collections.Counter(map(tuple,bb))-collections.Counter(map(tuple,aa))).elements()],'order_differs_only':collections.Counter(map(tuple,aa))==collections.Counter(map(tuple,bb))}
    report={'patch_sha256':{'ra2_1006':sha(ra),'yr_1001':sha(yr)},'ra2_mix_delta':{'source_bytes':struct.unpack_from('<I',ra,2372661+16)[0],'destination_bytes':struct.unpack_from('<I',ra,2372712+16)[0],'source_descriptor_offset':2372661,'destination_descriptor_offset':2372712},'yr_expandmd01':{'sha256':sha(pack),'bytes':len(pack),'members':len(records),'embedded_payload_sha1_verified':True,'rules_offset':off,'rules_bytes':size,'rules_sha256':sha(rules),'contains_artmd':key_for('artmd.ini') in records},'comparator_sha256':sha(cmp),'section_count':len(a),'identical_ordered_field_lists':sum(x[1]==x[2] for x in hashes),'changed_section_count':len(differences),'field_differences':differences,'section_hashes_columns':['section','official_ordered_fields_sha256','comparator_ordered_fields_sha256'],'section_hashes':hashes}
    out.mkdir(exist_ok=True,parents=True);(out/'ra2-patch-findings.json').write_text(json.dumps(report,indent=1)+'\n')
if __name__=='__main__':main()
