"""Verify terminal TSV directly against a second original demo download.

Independent of the catalog builder. Walk the serialized variable streams by byte
offset at the table's source locators and independently find every settings block.
"""
import csv
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import zipfile


def verify(executable, ledger, provenance):
    meta=json.loads(provenance.read_text())
    assert hashlib.sha256(executable.read_bytes()).hexdigest()==meta["demo_exe_sha256"]
    with zipfile.ZipFile(executable) as archive:
        packed=archive.read("ALWAYS.DBS")
        for name,digest in meta['context_member_hashes'].items():
            assert hashlib.sha256(archive.read(name)).hexdigest()==digest
    table_at=struct.unpack_from('<I',packed,4)[0]
    count=struct.unpack_from('<I',packed,table_at)[0]
    members={}
    for _,begin,size in struct.iter_unpack('<III',packed[table_at+4:table_at+4+count*12]):
        content=packed[begin:begin+size]
        members[hashlib.sha256(content).hexdigest()]=content
    objects=members[meta['objects_ddb']['sha256']]
    strings=members[meta['strings_tdb']['sha256']]
    blocks={p for pattern in (b'\x04\x12\x07\x08',b'\x16\x12\x23\x10') for p in (m.start() for m in re.finditer(re.escape(pattern),objects))}
    assert blocks=={v['objects_ddb_offset'] for v in meta['settings_chunks']}
    rows=list(csv.DictReader(ledger.open(),delimiter='\t'))
    keys=set()
    pricechecks=namechecks=presetchecks=0
    for r in rows:
        block=int(r['objects_ddb_settings_offset'])
        assert block in blocks
        length=struct.unpack_from('<I',objects,block+4)[0]
        pos=block+8; end=pos+length; team_chunk=objects[block:block+4]==b'\x16\x12\x23\x10'
        slot=None;alt=None; fields={}
        while pos<end:
            field,span=objects[pos:pos+2]
            val=objects[pos+2:pos+2+span];pos+=2+span
            idx=5 if team_chunk else 9
            if field==idx:
                slot=int.from_bytes(val,'little');alt=None
            elif not team_chunk and field==10:
                alt=int.from_bytes(val,'little')
            else:
                fields[slot,alt,field]=val
        assert pos==end
        def num(t):
            return str(int.from_bytes(fields[t],'little'))
        n=int(r['slot_index']) if r['slot_index'] else None
        a=int(r['alternate_index']) if r['alternate_index']!='primary' else None
        key=(r['side'],r['menu'],n,a)
        assert key not in keys
        keys.add(key)
        assert num((None,None,1))=={'GDI':'0','Nod':'1'}[r['side']]
        if team_chunk:
            if r['menu']=='enlisted':
                assert num((n,None,2))==r['preset_id'] and num((n,None,4))==r['string_id']
            elif r['menu']=='beacon':
                assert num((None,None,6))==r['preset_id'] and num((None,None,7))==r['string_id'] and num((None,None,9))==r['configured_credits']
                pricechecks+=1
            else:
                assert r['menu']=='refill' and r['preset_id']=='0' and num((None,None,10))==r['string_id']
        else:
            assert num((n,None,5))==r['configured_credits'] and num((n,None,8))==r['string_id']
            assert num((n,a,6 if a is None else 12))==r['preset_id']
            pricechecks+=1
        if r['preset_id']!='0':
            name=r['resolved_definition_name'].encode('cp1252')+b'\x00'
            signature=b'\x01\x04'+struct.pack('<I',int(r['preset_id']))+bytes([3,len(name)])+name
            assert objects.count(signature)==1
            presetchecks+=1
        if r['string_id']!='0':
            off=int(r['strings_tdb_entry_offset']); chunk_len=struct.unpack_from('<I',strings,off+4)[0]
            assert strings[off+8:off+14]==b'\x01\x04'+struct.pack('<I',int(r['string_id']))
            english_off=off+8+chunk_len
            english_id,english_len=struct.unpack_from('<II',strings,english_off)
            assert english_id==0x0614110a
            assert strings[english_off+8:english_off+8+english_len].rstrip(b'\0').decode('cp1252')==r['english_slot_label']
            namechecks+=1
    return {"installer_sha256":meta['demo_exe_sha256'],"terminal_ledger_sha256":hashlib.sha256(ledger.read_bytes()).hexdigest(),"settings_blocks_independently_found":len(blocks),"unique_rows_verified":len(keys),"nonzero_preset_ids_and_names_verified":presetchecks,"nonzero_string_ids_and_labels_verified":namechecks,"configured_prices_verified":pricechecks,"publisher_context_file_digests_verified":len(meta['context_member_hashes']),"illustrated_rows":sum(r['manual_screenshot_observation']=='visible' for r in rows)}

if __name__=="__main__":
    source,root,output=map(Path,sys.argv[1:])
    result=verify(source,root/'renegade-demo-terminal.tsv',root/'renegade-demo-terminal-evidence.json')
    output.write_text(json.dumps(result,indent=2)+'\n')
