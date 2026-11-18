"""Read factual demo purchase settings from an unmodified Renegade 1.019 demo EXE/ZIP.

Writes a small menu reconciliation and TSV. The program never unpacks media to disk.
"""
import collections
import csv
import hashlib
import json
import struct
import sys
import zipfile
import zlib
from pathlib import Path

PIN="a4f42065491f30fe969739abdd88e6169618b3790d8401871453caa66964024f"
TEAMS=["GDI","Nod","Mutant GDI","Mutant Nod"]
MENUS=["characters","vehicles","equipment","secret characters","secret vehicles"]
# Manually read six stills embedded with the original publisher demo manual.
MANUAL_PRICES={
    ("GDI","characters"):[350,450,300,500,700,600,900,1000,1100,500],
    ("Nod","characters"):[350,450,300,500,700,700,900,1000,1100,500],
    ("GDI","vehicles"):[400,700,800,800,1500],
    ("Nod","vehicles"):[300,700,450,800,600,900],
}
def manual_offer(team,menu,slot,variant):
    if variant!="primary":return ("","","not individually illustrated")
    if menu in ("enlisted","beacon","refill"):
        return (f"SCRN_{team.upper()}_MAIN.JPG",1000 if menu=="beacon" else 0,"visible")
    prices=MANUAL_PRICES.get((team,menu),[])
    if slot!="" and slot<len(prices):
        return (f"SCRN_{team.upper()}_{menu.upper()}.JPG",prices[slot],"visible")
    return ("","","not present in included terminal screens")
def digest(data):
    return hashlib.sha256(data).hexdigest()
def integer(blob):
    if len(blob)!=4:raise ValueError("expected 32-bit value")
    return int.from_bytes(blob,'little')
def string(blob):
    return blob.rstrip(b'\0').decode("cp1252",errors="replace")
def mix_file(data,name):
    tag,index,names,_=struct.unpack_from("<4sIII",data)
    assert tag==b"MIX1" and name.encode()+b"\0" in data[names:]
    wanted=zlib.crc32(name.upper().encode())
    for i in range(struct.unpack_from("<I",data,index)[0]):
        crc,off,size=struct.unpack_from("<III",data,index+4+i*12)
        if crc==wanted:
            return data[off:off+size],off
    raise ValueError(name)
def tree(data,lo,hi):
    pos=lo;children=[]
    while pos<hi:
        cid,packed=struct.unpack_from("<II",data,pos);size=packed&0x7fffffff
        end=pos+8+size
        assert end<=hi
        child=tree(data,pos+8,end) if packed>>31 else []
        children.append((cid,pos,end,child));pos=end
    assert pos==hi
    return children
def walk(nodes):
    for n in nodes:
        yield n
        yield from walk(n[3])
def micro(data,node):
    pos=node[1]+8
    while pos<node[2]:
        k,size=struct.unpack_from('BB',data,pos);end=pos+2+size
        if end>node[2]:raise ValueError('bad micro-chunk')
        yield k,data[pos+2:end]
        pos=end

def run(exe,output):
    assert digest(exe.read_bytes())==PIN
    with zipfile.ZipFile(exe) as z:
        mix=z.read("ALWAYS.DBS")
        objects,obase=mix_file(mix,"objects.ddb"); table,tbase=mix_file(mix,"strings.tdb")
        proof={"demo_exe_sha256":PIN,"always_dbs_sha256":digest(mix),"objects_ddb":{"offset_in_ALWAYS_DBS":obase,"sha256":digest(objects)},"strings_tdb":{"offset_in_ALWAYS_DBS":tbase,"sha256":digest(table)},"context_member_hashes":{n:digest(z.read(n)) for n in z.namelist() if n=="README.HTM" or n in ["C&C_UNDER.MIX","SCRN_GDI_CHARACTERS.JPG","SCRN_NOD_CHARACTERS.JPG","SCRN_GDI_VEHICLES.JPG","SCRN_NOD_VEHICLES.JPG","SCRN_GDI_MAIN.JPG","SCRN_NOD_MAIN.JPG"]}}
    entries=tree(objects,0,len(objects)); translations=tree(table,0,len(table))
    labels={}
    for par in walk(translations):
        v=next((n for n in par[3] if n[0]==0x06141108),None)
        eng=next((n for n in par[3] if n[0]==0x0614110a),None)
        if v and eng:
            f=dict(micro(table,v))
            labels[integer(f[1])]=(string(table[eng[1]+8:eng[2]]),string(f[2]),v[1])
    defs=collections.defaultdict(set)
    for node in walk(entries):
        if node[0]!=0x100 or node[3]:continue
        try:
            f=dict(micro(objects,node))
            if len(f.get(1,b''))==4 and f.get(3,b'').endswith(b'\0'):
                defs[integer(f[1])].add(string(f[3]))
        except ValueError:
            pass
    rows=[]; menus=[]
    def add(team,menu,slot,alternate,cost,did,lid,texture,node,cost_source):
        if not lid and not did:return
        label,key,tpos=labels.get(lid,("","",None))
        names=sorted(defs[did]) if did else []
        manual_file,manual_price,visibility=manual_offer(team,menu,slot,alternate)
        rows.append([team,menu,slot,alternate,cost,cost_source,did,"|".join(names),lid,label,key,texture,node[1],tpos,visibility,manual_file,manual_price])
    for node in walk(entries):
        if node[0] not in (0x08071204,0x10231216):continue
        fields=list(micro(objects,node)); f=dict(fields)
        team=TEAMS[integer(f[1])]
        if node[0]==0x08071204:
            menu=MENUS[integer(f[2])];idx=-1;alt=-1; slots={}
            for k,v in fields:
                if k==9:idx=integer(v);slots[idx]={"alts":{}}
                elif k in (5,6,7,8):slots[idx][k]=string(v) if k==7 else integer(v)
                elif k==10:alt=integer(v);slots[idx]["alts"][alt]={}
                elif k in (11,12):slots[idx]["alts"][alt][k]=string(v) if k==11 else integer(v)
            menus.append({"team":team,"menu":menu,"objects_ddb_offset":node[1],"slots_serialized":len(slots),"nonzero_primary_definitions":sum(bool(v.get(6)) for v in slots.values())})
            for idx,v in slots.items():
                add(team,menu,idx,"primary",v[5],v[6],v[8],v[7],node,"serialized slot cost")
                for a,fields in v["alts"].items():
                    if fields.get(12):add(team,menu,idx,a,v[5],fields[12],v[8],fields[11],node,"shared parent slot cost")
        else:
            menu="main";idx=-1; slots={}
            for k,v in fields:
                if k==5:idx=integer(v);slots[idx]={}
                elif k in (2,3,4):slots[idx][k]=string(v) if k==3 else integer(v)
            for idx,v in slots.items():add(team,"enlisted",idx,"primary","",v[2],v[4],v[3],node,"team settings store no cost; demo readme states basic characters are free")
            add(team,"beacon","", "primary",integer(f[9]),integer(f[6]),integer(f[7]),string(f[8]),node,"serialized beacon cost")
            add(team,"refill","", "primary","",0,integer(f[10]),string(f[11]),node,"team settings store no cost; demo main-screen illustration shows zero")
            menus.append({"team":team,"menu":"main","objects_ddb_offset":node[1],"enlisted_slots_serialized":len(slots)})
    with (output/"renegade-demo-terminal.tsv").open("w") as out:
        w=csv.writer(out,delimiter='\t',lineterminator='\n')
        w.writerow(["side","menu","slot_index","alternate_index","configured_credits","cost_basis","preset_id","resolved_definition_name","string_id","english_slot_label","translation_key","icon_reference","objects_ddb_settings_offset","strings_tdb_entry_offset","manual_screenshot_observation","demo_manual_member","illustrated_credits"])
        w.writerows(rows)
    with zipfile.ZipFile(exe) as z:
        world=z.read("C&C_UNDER.MIX")
        proof["map_local_files"]={}
        for n in ("c&c_under.ddb","c&c_under.ldd","c&c_under.lsd"):
            b,o=mix_file(world,n); chunks=list(walk(tree(b,0,len(b))))
            proof["map_local_files"][n]={"offset_in_map_mix":o,"size":len(b),"sha256":digest(b),"purchase_setting_chunks":sum(v[0] in (0x08071204,0x10231216) for v in chunks)}
        proof["default_match_configs"]={}
        for n in ("SVRCFG_CNC.INI","DEDICATED.INI"):
            lines=z.read(n).decode("cp1252").splitlines()
            proof["default_match_configs"][n]={row.split("=",1)[0]:row.split("=",1)[1] for row in lines if row.startswith(("MapName=","MapName00=","StartingCredits="))}
    proof["visible_in_manual_screens"]=sum(r[14]=="visible" for r in rows)
    proof["different_prices_among_rows_with_both_explicit_numbers"]=sum(r[14]=="visible" and r[4]!="" and r[4]!=r[16] for r in rows)
    proof["settings_chunks"]=menus;proof["output_rows"]=len(rows);proof["rows_by_side_and_menu"]={f"{a} / {b}":v for (a,b),v in sorted(collections.Counter((r[0],r[1]) for r in rows).items())}
    (output/"renegade-demo-terminal-evidence.json").write_text(json.dumps(proof,indent=2)+"\n")
    print(proof["rows_by_side_and_menu"])

if __name__=="__main__":run(Path(sys.argv[1]),Path(sys.argv[2]))
