"""Build Comrade's own symmetric C&C scenarios; all cell/rule processing is upstream.

Each scenario is emitted as an INI/BIN pair. The browser client mounts the chosen
pair as COMRADE.INI/COMRADE.BIN, so the engine always boots scenario "COMRADE".
Faction and the basic lobby settings (start credits, tech level) are applied to the
INI client-side before mount, exactly like the existing faction swap.
"""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1] / 'packs/td/comrade'
root.mkdir(parents=True, exist_ok=True)
cell = lambda x, y: y * 64 + x


def scenario(theater, good, bad, fields, tree_cells):
    """Return (ini_text, bin_bytes) for one symmetric two-base battlefield.

    good/bad are the (x, y) base anchors; fields is a list of Tiberium field
    centres; tree_cells is a list of decorative terrain cells. The home waypoint
    is centred on the player's base so the engine opens the camera there.
    """
    home = cell(good[0] + 4, good[1] + 3)
    tactical = cell(max(0, good[0] + 1), max(0, good[1] - 1))
    parts = ['''[Basic]
Name=Comrade - %NAME%
Player=GoodGuy
BuildLevel=15
CarryOverMoney=0
Intro=x
Brief=x
Action=x
Win=x
Lose=x
Theme=No theme
[Map]
Theater=%THEATER%
X=2
Y=2
Width=60
Height=60
TacticalPos=%TACTICAL%
[GoodGuy]
Credits=60
Allies=GoodGuy,Neutral
Edge=West
MaxUnit=150
MaxBuilding=150
[BadGuy]
Credits=60
Allies=BadGuy
Edge=East
MaxUnit=150
MaxBuilding=150
[Neutral]
Allies=Neutral
Credits=0
'''.replace('%THEATER%', theater).replace('%TACTICAL%', str(tactical))]
    structures, units, infantry = [], [], []
    for house, (x, y) in [('GoodGuy', good), ('BadGuy', bad)]:
        yard = 'PYLE' if house == 'GoodGuy' else 'HAND'
        for kind, dx, dy in [('FACT', 0, 0), ('NUKE', 4, 0), ('PROC', 0, 5), (yard, 5, 5)]:
            structures.append(f'{len(structures)}={house},{kind},256,{cell(x+dx,y+dy)},0,None')
        tank = 'MTNK' if house == 'GoodGuy' else 'LTNK'
        for kind, dx, dy in [('HARV', 3, 9), (tank, 7, 2)]:
            units.append(f'{len(units)}={house},{kind},256,{cell(x+dx,y+dy)},0,Guard,None')
        for dx in range(4):
            infantry.append(f'{len(infantry)}={house},E1,256,{cell(x+8+dx,y+7)},0,Guard,0,None')
    parts += ['[Structures]\n' + '\n'.join(structures),
              '[Units]\n' + '\n'.join(units),
              '[Infantry]\n' + '\n'.join(infantry)]
    ore = []
    for cx, cy in fields:
        for yy in range(cy-3, cy+4):
            for xx in range(cx-4, cx+5):
                if 0 <= xx < 62 and 0 <= yy < 62 and (xx-cx)**2/16 + (yy-cy)**2/9 <= 1:
                    ore.append(f'{cell(xx,yy)}=TI{1+(xx+yy)%12}')
    parts += ['[Overlay]\n' + '\n'.join(ore), '''[Triggers]
WIN=All Destr.,Win,0,BadGuy,None,0
LOSE=All Destr.,Lose,0,GoodGuy,None,0
RAID=Time,Reinforce.,10,BadGuy,RAID,0
[TeamTypes]
RAID=BadGuy,0,0,1,0,0,7,1,0,0,1,E1:3,1,Attack Units:20,1,1
[Waypoints]
26=%HOME%
27=2800
[Base]
Count=0
[Briefing]
1=Establish your economy. Harvest Tiberium, build your base and eliminate the opposing force.
'''.replace('%HOME%', str(home))]
    trees = []
    for x, y in tree_cells:
        trees.append(f'{cell(x,y)}=T{1+(x+y)%7:02d},None')
    parts.append('[Terrain]\n' + '\n'.join(trees))
    return '\n'.join(parts) + '\n', bytes([255, 0]) * 64 * 64


# Registry of authored battlefields. id/name feed the lobby map picker via maps.json.
MAPS = [
    {'id': 'tiberium-crossing', 'name': 'Tiberium Crossing', 'theater': 'TEMPERATE',
     'file': 'COMRADE', 'maxPlayers': 2,
     'description': 'The classic foundation. Twin bases, a contested central Tiberium field.',
     'good': (9, 10), 'bad': (46, 43), 'fields': [(18, 24), (43, 32), (28, 29)], 'raid': 454,
     'trees': [(26, 8), (27, 9), (28, 10), (29, 11), (30, 12), (32, 45), (33, 46), (34, 47), (35, 48), (37, 15), (39, 16), (25, 43), (23, 44)]},
    {'id': 'canyon-clash', 'name': 'Canyon Clash', 'theater': 'TEMPERATE',
     'file': 'CANYON', 'maxPlayers': 2,
     'description': 'Bases pressed into opposite corners with rich flanking Tiberium.',
     'good': (6, 6), 'bad': (48, 47), 'fields': [(14, 40), (46, 16), (30, 30)], 'raid': 1930,
     'trees': [(20, 20), (21, 21), (22, 22), (40, 40), (41, 39), (42, 38), (30, 14), (31, 15), (33, 46), (34, 45), (12, 33), (50, 28)]},
    {'id': 'tiberium-isles', 'name': 'Tiberium Isles', 'theater': 'WINTER',
     'file': 'ISLES', 'maxPlayers': 2,
     'description': 'A winter theatre with scattered Tiberium pockets across broken ground.',
     'good': (8, 44), 'bad': (47, 8), 'fields': [(16, 16), (45, 45), (30, 24), (24, 40)], 'raid': 1566,
     'trees': [(28, 18), (29, 19), (30, 20), (18, 38), (19, 37), (44, 24), (45, 23), (36, 44), (37, 43), (22, 10), (40, 12)]},
    {'id': 'desert-standoff', 'name': 'Desert Standoff', 'theater': 'DESERT',
     'file': 'STANDOFF', 'maxPlayers': 2,
     'description': 'A wide desert expanse. Long sightlines reward armour and early expansion.',
     'good': (10, 24), 'bad': (44, 24), 'fields': [(27, 12), (27, 44), (16, 30), (40, 18)], 'raid': 1756,
     'trees': [(27, 20), (28, 21), (26, 28), (34, 30), (20, 16), (38, 38), (31, 24), (24, 36), (33, 14)]},
]

registry = []
for m in MAPS:
    ini, binary = scenario(m['theater'], m['good'], m['bad'], m['fields'], m['trees'])
    ini = ini.replace('%NAME%', m['name'])
    (root / f"{m['file']}.INI").write_text(ini)
    (root / f"{m['file']}.BIN").write_bytes(binary)
    registry.append({'id': m['id'], 'name': m['name'], 'file': m['file'],
                     'theater': m['theater'], 'maxPlayers': m['maxPlayers'], 'description': m['description']})

# The default COMRADE pair keeps the original battlefield for any direct boot.
(root / 'COMRADE.INI').write_text((root / f"{MAPS[0]['file']}.INI").read_text())
(root / 'COMRADE.BIN').write_bytes((root / f"{MAPS[0]['file']}.BIN").read_bytes())
(root / 'maps.json').write_text(json.dumps(registry, indent=2) + '\n')
print(f'Authored {len(registry)} scenarios: ' + ', '.join(m['id'] for m in registry))
