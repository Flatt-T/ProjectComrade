"""Independent content-hash, source metadata and Red Alert demo terrain checks.
Run with SAGE.zip ra95demo.zip pinned_DEFINES.H world_dir editions/ra95-demo-facts.json output.json
"""
import base64
import collections
import configparser
import hashlib
import json
import re
import struct
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def sha(data):
    return hashlib.sha256(data).hexdigest()


def decompress_frame(src, expected):
    pos=0
    out=bytearray()
    while pos < len(src):
        op=src[pos]
        pos+=1
        if op==128:
            if pos!=len(src) or len(out)!=expected:
                raise ValueError("bad LCW frame end")
            return out
        if 128<op<192:
            n=op&63
            out.extend(src[pos:pos+n])
            pos+=n
        elif op==254:
            n,value=struct.unpack_from("<HB",src,pos)
            pos+=3
            out.extend(bytes([value])*n)
        else:
            if op<128:
                n=(op>>4)+3
                off=len(out)-((op&15)*256+src[pos])
                pos+=1
            elif op==255:
                n,off=struct.unpack_from("<HH",src,pos)
                pos+=4
            else:
                n=(op&63)+3
                off=struct.unpack_from("<H",src,pos)[0]
                pos+=2
            if not 0<=off<len(out):
                raise ValueError("bad LCW reference")
            for i in range(n):
                out.append(out[off+i])
        if len(out)>expected:
            raise ValueError("LCW output exceeds declared frame")
    raise ValueError("LCW frame lacks terminator")


def unpack(rows):
    data=base64.b64decode("".join(rows[k] for k in sorted(rows,key=int)),validate=True)
    out=bytearray()
    pos=0
    while pos<len(data):
        size,expected=struct.unpack_from("<HH",data,pos)
        pos+=4
        out.extend(decompress_frame(data[pos:pos+size],expected))
        pos+=size
    assert pos==len(data)
    return out


def enum_lookup(header,enum,prefix):
    raw=header.split("typedef enum "+enum+" {",1)[1].split("} "+enum,1)[0]
    val=-1
    mapped={}
    for line in raw.splitlines():
        m=re.match(r"\s*("+prefix+r"_[A-Z0-9_]+)\s*(?:=\s*(-?\d+))?\s*,",line)
        if m:
            val=int(m[2]) if m[2] else val+1
            if not m[1].endswith(("_COUNT","_FIRST")):mapped[val]=m[1]
    return mapped


def distribution(cells,indices,labels,overlay=False):
    counts=collections.Counter(cells[i] for i in indices)
    return [{"id":val,"cells":n,"name":("OVERLAY_NONE" if overlay else "raw_00FF_legacy_value_unresolved") if val==255 else labels.get(val,"unknown")} for val,n in sorted(counts.items())]


def inspect_maps(sage,world):
    z=zipfile.ZipFile(sage)
    root=z.namelist()[0]
    actual=[p[len(root):] for p in z.namelist() if p.lower().endswith(".map")]
    ledgers=[world/f"{key}-maps.jsonl" for key in ("generals","zh","tw","kw","ra3","uprising","c4")]
    reports={}
    visited=set()
    for file in sorted(ledgers):
        checks=0
        for raw in file.read_bytes().splitlines():
            row=json.loads(raw); p=row["path"]
            content=z.read(root+p)
            digest=hashlib.sha1(b"blob "+str(len(content)).encode()+b"\0"+content).hexdigest()
            assert p not in visited and sha(content)==row["sha256"] and digest==row["git_blob"],p
            visited.add(p);checks+=1
        reports[file.name]=checks
    metadata=json.loads((world/"map-metadata.json").read_text())
    roots={m["source"]:ET.fromstring(z.read(root+m["source"])) for m in metadata}
    for r in metadata:
        alternatives=[e.attrib for e in roots[r["source"]].iter() if e.get("id")==r["id"]]
        assert any(all(a.get(k)==v for k,v in r.items() if k!="source") for a in alternatives),(r["source"],r["id"])
    return {"pinned_archive_map_members":len(actual),"matched_map_content_digests":reports,"missing_map_paths":sorted(set(actual)-visited),"unexpected_paths":sorted(visited-set(actual)),"metadata_rows_with_all_retained_fields_matched":len(metadata),"metadata_source_files":sorted(roots)}


def inspect_demo(archive,header_file,baseline):
    z=zipfile.ZipFile(archive);main=z.read("ra95demo/INSTALL/MAIN.MIX")
    header=header_file.read_text(encoding="latin1")
    templates=enum_lookup(header,"TemplateType","TEMPLATE")
    overlays=enum_lookup(header,"OverlayType","OVERLAY")
    # Find scenario sections from their own INI markers, without the baseline scenario offsets.
    basics=[m.start() for m in re.finditer(rb'(?m)^\[Basic\]\r?$',main)]
    output=[]
    for i,start in enumerate(basics):
        end=min(basics[i+1] if i+1<len(basics) else len(main),main.find(b'\0',start) if main.find(b'\0',start)!=-1 else len(main))
        text=main[start:end].decode('cp1252',errors='replace')
        if '[MapPack]' not in text or '[OverlayPack]' not in text:continue
        config=configparser.ConfigParser(interpolation=None,strict=False,allow_no_value=True)
        config.read_string(text)
        reference=next(m for m in baseline["missions"] if m["basic"]["Brief"]==config["Basic"]["Brief"])
        assert all(config["Map"].get(k)==v for k,v in reference["map"].items())
        for key,expected in reference["initial_placements_by_house_and_ini_id"].items():
            actual=collections.Counter(":".join(v.split(",")[:2]) for v in config[key.upper()].values() if v and "," in v)
            assert dict(actual)==expected
        assert [len(config['TeamTypes']),len(config['Trigs'])]==[reference['script_team_definitions'],reference['trigger_definitions']]
        tilepack=unpack(config["MapPack"]);over=unpack(config["OverlayPack"])
        assert len(tilepack)==49152 and len(over)==16384
        tiles=struct.unpack_from('<16384H',tilepack);icons=tilepack[32768:]
        x,y,w,h=(int(config['Map'][key]) for key in ('X','Y','Width','Height'))
        inside=[col+128*row for row in range(y,y+h) for col in range(x,x+w)]
        tt=distribution(tiles,inside,templates); ov=distribution(over,inside,overlays,True)
        out={"brief":config['Basic']['Brief'],"theater":config['Map']['Theater'],"basic_marker_offset":start,"playable_cells":len(inside),"decoded_width":128,"decoded_height":128,"decoded_template_and_icon_sha256":sha(tilepack),"decoded_overlay_sha256":sha(over),"template_distribution_inside":tt,"overlay_distribution_inside":ov,"distinct_icon_indices_inside":len({icons[k] for k in inside}),"bridge_template_cells_inside":sum(i["cells"] for i in tt if "BRIDGE" in i["name"]),"initial_placement_groups_checked":len(reference["initial_placements_by_house_and_ini_id"]),"team_and_trigger_counts_checked":True}
        output.append(out)
    assert len(output)==len(baseline['missions'])==3
    return output


if __name__=="__main__":
    sage,demo,header,world,baseline,output=map(Path,sys.argv[1:])
    result={"sage":inspect_maps(sage,world),"demo":inspect_demo(demo,header,json.loads(baseline.read_text())),"enum_header_sha256":sha(header.read_bytes())}
    output.write_text(json.dumps(result,indent=2)+"\n")
