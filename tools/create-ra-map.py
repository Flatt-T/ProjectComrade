"""Build Comrade's own symmetric Red Alert scenarios.

Red Alert keeps its terrain inside the scenario file: [MapPack] holds a 128x128 grid of
template and icon bytes and [OverlayPack] the ore, both Format80-compressed and base64
packed (tools/westwood.py has the codec). That is the blocker ADR 007 recorded, so these
scenarios are the first bootable Red Alert battlefields on the original engine.

Each map is a single .INI; the browser client mounts the chosen one as COMRADE.INI and the
engine boots scenario "COMRADE", exactly as the Tiberian Dawn slice does.
"""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from westwood import RA_MAP_W, map_pack, overlay_pack  # noqa: E402

root = Path(__file__).resolve().parents[1] / 'packs/ra1/comrade'
root.mkdir(parents=True, exist_ok=True)

# Ore overlays, in the order redalert/defines.h lists them (OVERLAY_GOLD1 is 5).
GOLD = (5, 6, 7, 8)
cell = lambda x, y: y * RA_MAP_W + x

# The playable window inside the 128x128 grid. Everything is authored in absolute cells.
WIN_X, WIN_Y, WIN_W, WIN_H = 24, 24, 80, 80


def ore_field(cx, cy, rx=5, ry=4):
    """An elliptical patch of ore, richest in the middle, as the classic fields look."""
    out = {}
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if not (WIN_X <= x < WIN_X + WIN_W and WIN_Y <= y < WIN_Y + WIN_H):
                continue
            if ((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry) > 1:
                continue
            # Thicker ore toward the centre of the field.
            edge = abs(x - cx) + abs(y - cy)
            out[cell(x, y)] = GOLD[min(3, max(0, 3 - edge // 2))]
    return out


def scenario(name, theater, allied, soviet, fields, patrols):
    """One symmetric two-base battlefield as a Red Alert scenario INI."""
    overlays = {}
    for cx, cy in fields:
        overlays.update(ore_field(cx, cy))

    structures, units, infantry = [], [], []
    for house, (x, y) in (('Greece', allied), ('USSR', soviet)):
        barracks = 'TENT' if house == 'Greece' else 'BARR'
        for kind, dx, dy in (('FACT', 0, 0), ('POWR', 4, 0), ('PROC', 0, 4), (barracks, 5, 5), ('WEAP', 5, 0)):
            structures.append(f'{len(structures):03d}={house},{kind},256,{cell(x + dx, y + dy)},0,None')
        tank = '2TNK' if house == 'Greece' else '3TNK'
        for kind, dx, dy in (('HARV', 3, 8), (tank, 8, 2), (tank, 8, 4)):
            units.append(f'{len(units):03d}={house},{kind},256,{cell(x + dx, y + dy)},0,Guard,None')
        for i in range(4):
            infantry.append(f'{len(infantry):03d}={house},E1,256,{cell(x + 7 + i, y + 7)},0,Guard,0,None')
    # A patrol each so first contact does not need a long drive.
    for house, (px, py) in zip(('USSR', 'Greece'), patrols):
        infantry.append(f'{len(infantry):03d}={house},E1,256,{cell(px, py)},0,Area Guard,0,None')

    home = cell(max(WIN_X, allied[0] - 3), max(WIN_Y, allied[1] - 3))
    soviet_home = cell(max(WIN_X, soviet[0] - 3), max(WIN_Y, soviet[1] - 3))
    parts = [f"""[Basic]
Name=Comrade - {name}
Player=Greece
CarryOverMoney=0
BuildLevel=15
Theme=No theme
Percent=0
Official=no
Intro=x
Brief=x
Action=x
Win=x
Lose=x
[Map]
Theater={theater}
X={WIN_X}
Y={WIN_Y}
Width={WIN_W}
Height={WIN_H}
[Greece]
Credits=60
Allies=Greece
MaxUnit=150
MaxBuilding=150
Edge=West
[USSR]
Credits=60
Allies=USSR
MaxUnit=150
MaxBuilding=150
Edge=East""",
             '[Structures]\n' + '\n'.join(structures),
             '[Units]\n' + '\n'.join(units),
             '[Infantry]\n' + '\n'.join(infantry),
             f'[Waypoints]\n98={home}\n99={soviet_home}',
             '[MapPack]\n' + map_pack(),
             '[OverlayPack]\n' + overlay_pack(overlays),
             f'[Comrade]\nSovietHome={soviet_home}']
    return '\n'.join(parts) + '\n'


# Registry of authored battlefields; id/name feed the lobby map picker via maps.json.
MAPS = [
    {'id': 'ore-crossing', 'name': 'Ore Crossing', 'theater': 'TEMPERATE', 'file': 'COMRADE',
     'maxPlayers': 2, 'description': 'Twin bases either side of a contested central ore field.',
     'allied': (34, 36), 'soviet': (82, 80), 'patrols': [(52, 46), (64, 66)],
     'fields': [(44, 50), (74, 58), (58, 56)]},
    {'id': 'winter-line', 'name': 'Winter Line', 'theater': 'SNOW', 'file': 'WINTER',
     'maxPlayers': 2, 'description': 'A frozen corridor. Rich ore on the flanks, nothing in the middle.',
     'allied': (30, 58), 'soviet': (86, 58), 'patrols': [(50, 58), (68, 58)],
     'fields': [(44, 36), (44, 80), (74, 36), (74, 80)]},
]

registry = []
for m in MAPS:
    ini = scenario(m['name'], m['theater'], m['allied'], m['soviet'], m['fields'], m['patrols'])
    (root / f"{m['file']}.INI").write_text(ini)
    registry.append({'id': m['id'], 'name': m['name'], 'file': m['file'],
                     'theater': m['theater'], 'maxPlayers': m['maxPlayers'], 'description': m['description']})

# The default COMRADE.INI keeps the first battlefield for any direct boot.
(root / 'COMRADE.INI').write_text((root / f"{MAPS[0]['file']}.INI").read_text())
(root / 'maps.json').write_text(json.dumps(registry, indent=2) + '\n')
print(f'Authored {len(registry)} Red Alert scenarios: ' + ', '.join(m['id'] for m in registry))
