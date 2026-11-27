"""Reproduce the source exception audit without modifying the publisher's input ZIP.

python audit_sage_exceptions.py official.zip directory_containing_source_facts
"""
import collections
import gzip
import json
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from lxml import etree
from extract_sage import GAMES, NS, XML, game_object, hash_blob, member_name


def keep_lines(match):
    return b"\n" * match.group().count(b"\n")


def projections(path, raw):
    if path.endswith("/GarrisonableStructureBehaviors.xml"):
        assert not re.search(rb"<(?!\?)\w", raw)
        return "Empty XML fragment. Raw bytes contain only a prolog, with a stray comment terminator in four editions.", []
    if path.endswith("/MY_Boat_01b.xml"):
        embedded = re.search(rb"<\?xml[^>]*\?>\s*<AssetDeclaration\b[^>]*>[\s\S]*?</AssetDeclaration>", raw[raw.index(b"<?xml", 5):])
        inner = embedded.group()
        return "Complete second XML document embedded inside outer Includes list. Each document declares the same object ID with a different parent.", [
            ("outer document, embedded document removed", raw.replace(inner, b"\n"*inner.count(b"\n"), 1), 0),
            ("embedded document parsed alone", inner, raw[:raw.index(inner)].count(b"\n"))]
    if path.endswith("/Templates/Structure.xml"):
        data, n = re.subn(rb'(<Shape\b[^>]*?)(>)(\s*</Geometry>)', rb'\1/>\3', raw)
        assert n == 1
        return "Template has an unterminated empty geometry Shape. The structure, side and display identifiers are author placeholders.", [("close empty Shape", data, 0)]
    if path.endswith("/GDIDropShip.xml"):
        data = re.sub(rb"<\?xml[^>]*\?>", keep_lines, raw, count=1)
        data, n = re.subn(rb'(\s*<Include type="instance")', rb'<Includes>\1', data, count=1)
        assert n == 1
        return "A comment precedes the XML declaration and the Includes opening tag is missing. The source comment designates the dropship as superseded.", [("omit misplaced prolog and restore missing open Includes", data, 0)]
    if path.endswith("/BaseCivilian.xml"):
        data, n = re.subn(rb'(KindOf="[^"]*")(\s*<ArmorSet)', rb'\1>\2', raw)
        assert n == 1
        return "GameObject opening tag lacks its terminal angle bracket before ArmorSet.", [("close opening GameObject tag",data,0)]
    if path.endswith(("/GDIInfantryL.xml","/GDIInfantryQ.xml")):
        data, n = re.subn(rb'(</ModelConditionState>\s*)</ModelConditionState>', rb'\1', raw)
        assert n == 1
        return "An immediate duplicate ModelConditionState closing tag appears in the first draw block of the Obsolete definition.", [("discard one duplicated close tag",data,0)]
    raise ValueError(path)


def readlines(archive, name):
    return [json.loads(line) for line in archive.read(name).splitlines()]


def audit(source_path, outdir):
    source = zipfile.ZipFile(source_path)
    index = {member_name(k):k for k in source.namelist()}
    audits, fragments, missing = [], [], []
    for title, key in GAMES.items():
        facts = zipfile.ZipFile(outdir / f"{key}-source-facts.zip")
        declarations = readlines(facts, "object-index.jsonl")
        edges = readlines(facts, "production-links.jsonl")
        prefix = title + "/Xml/"
        files = {p[len(prefix):].lower():p for p in index if p.startswith(prefix) and p.lower().endswith(".xml")}
        by_name = collections.defaultdict(list)
        for p in files.values():
            by_name[posixpath.basename(p).lower()].append(p)
        for item in readlines(facts,"xml-parse-exceptions.jsonl"):
            p = item["path"]
            raw = source.read(index[p])
            cause, variants = projections(p,raw)
            entry = dict(item, title=key, cause=cause, projections=[])
            for label, data, shift in variants:
                part = {"operation":label,"declarations":[]}
                try:
                    root=etree.fromstring(data,XML)
                except etree.XMLSyntaxError as e:
                    part["post_projection_failure"]=e.msg
                    entry["projections"].append(part)
                    continue
                for element in root:
                    if element.tag != "{"+NS+"}GameObject":
                        continue
                    obj = game_object(element)
                    ident = obj["id"]
                    part["declarations"].append({
                        "source_line":element.sourceline + shift, "local_source_facts":obj,
                        "strict_baseline_other_declarations":[z["source"] for z in declarations if z["id"]==ident],
                        "baseline_children_inheriting_id":[z["source"] for z in declarations if z.get("parent")==ident],
                        "baseline_explicit_menu_targeted_by":sorted({z["producer"] for z in edges if z["target"]==ident}),
                        "baseline_existing_producer_namesakes":sorted({z["producer_source"]["path"] for z in edges if z["producer"]==ident})})
                entry["projections"].append(part)
            audits.append(entry)
        for item in readlines(facts,"xi-exceptions.jsonl"):
            name=posixpath.basename(item["ref"]).lower()
            candidates=by_name[name]
            candidate_rows=[]
            for c in sorted(candidates):
                raw=source.read(index[c]);root=etree.fromstring(raw,XML)
                candidate_rows.append({"path":c,"blob":hash_blob(raw),"fragment_root":etree.QName(root).localname,"descendant_count":sum(1 for _ in root.iterdescendants())})
            fragments.append(dict(item,title=key,alternative_same_basename=candidate_rows,classification="unresolved at literal path; counterpart path is a research candidate"))
        for p in sorted(files.values()):
            raw=source.read(index[p])
            try:
                root=etree.fromstring(raw,XML)
            except etree.XMLSyntaxError:
                continue
            for node in root.iter():
                if node.tag.rsplit("}",1)[-1] not in ("Include","include"):
                    continue
                ref=node.get("source") or node.get("href") or ""
                if not ref.lower().endswith(".xml") or (":" in ref and not ref.upper().startswith("DATA:")):
                    continue
                rel=ref[5:] if ref.upper().startswith("DATA:") else posixpath.join(posixpath.dirname(p[len(prefix):]),ref)
                relative=posixpath.normpath(rel.replace("\\","/")).lower()
                if relative in files:
                    continue
                candidates=sorted(by_name.get(posixpath.basename(relative),[]))
                label="single same-basename file elsewhere" if len(candidates)==1 else "multiple same-basename files elsewhere" if candidates else "no same-basename member in this title Xml tree"
                missing.append({"title":key,"from":p,"line":node.sourceline,"ref":ref,"literal_relative_path":relative,"category":label,"same_basename_candidates":candidates})
    (outdir/"sage-exception-recovery.json").write_text(json.dumps({"xml_files":audits,"xinclude_occurrences":fragments},indent=2,ensure_ascii=False)+"\n")
    payload="".join(json.dumps(i,separators=(",",":"))+"\n" for i in missing).encode()
    (outdir/"ordinary-unresolved-include-audit.jsonl.gz").write_bytes(gzip.compress(payload,mtime=0))
    print("raw exceptions",len(audits),"projected objects",sum(len(p["declarations"]) for a in audits for p in a["projections"]),"remaining projection failures",[(a["path"],p["post_projection_failure"]) for a in audits for p in a["projections"] if "post_projection_failure" in p])
    print("XInclude candidates",len(fragments),"ordinary includes",len(missing),collections.Counter(i["category"] for i in missing))


if __name__ == "__main__":
    audit(Path(sys.argv[1]),Path(sys.argv[2]))
