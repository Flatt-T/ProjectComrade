"""Extract factual catalog identifiers from the pinned community base-builder adapter.

Run with python3 rivals-ta-extract-alliances.py INPUT_JS OUTPUT_TSV.
The README links the immutable input. Source comments are not republished.
"""
import csv
import re
import sys
from pathlib import Path

revision = "13b64a25ee8897ea988ecfbaf2c4a96a203e5f12"
source = f"https://github.com/zbluebugz/CnC-TA-Opt/blob/{revision}/CnCTAOpt.link.user.js"
section_rule = re.compile(r"const (base|defense|offense)_unit_map =")
entry_rule = re.compile(r'^\s*"([^"]+)":\s*"([A-Za-z])"')
families = (("FOR_Fortress_", "Forgotten fortress"), ("FOR_EVENT_", "Forgotten event"), ("FOR_GDI_", "Forgotten infected GDI"), ("FOR_NOD_", "Forgotten infected Nod"), ("FOR_", "Forgotten"), ("GDI_", "GDI"), ("NOD_", "Nod"))
roles = {"i":"infantry","q":"infantry","z":"infantry","c":"infantry","s":"infantry","g":"vehicle","p":"vehicle","d":"vehicle","j":"vehicle","a":"vehicle","v":"aircraft","f":"aircraft","o":"aircraft","k":"aircraft"}
defense_roles = {"w":"obstacle","b":"obstacle","t":"obstacle","d":"mobile vehicle","p":"mobile vehicle","g":"mobile vehicle","o":"mobile vehicle","m":"emplacement","f":"emplacement","c":"emplacement","a":"ranged defense","e":"ranged defense","r":"ranged defense","z":"infantry","q":"infantry","s":"infantry","i":"infantry"}
with Path(sys.argv[2]).open("w", newline="") as output:
    writer = csv.writer(output, delimiter="\t", lineterminator="\n")
    writer.writerow(["context","faction_or_variant","adapter_identifier","layout_symbol","role_group_editorial","evidence","source_line"])
    section = ""
    for line_number, line in enumerate(Path(sys.argv[1]).read_text().splitlines(), 1):
        new_section = section_rule.search(line)
        if new_section:
            section = new_section[1]
            continue
        if line.strip() in {"};","}"}:
            section = ""
        entry = entry_rule.match(line) if section else None
        if entry:
            identifier, symbol = entry.groups()
            faction = next(faction for prefix, faction in families if identifier.startswith(prefix))
            role = roles[symbol] if section == "offense" else defense_roles[symbol] if section == "defense" else "base structure or placement variant"
            writer.writerow([section, faction, identifier, symbol, role, "community exporter mapping", f"{source}#L{line_number}"])
