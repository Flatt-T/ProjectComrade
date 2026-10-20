"""Build Comrade's own symmetric C&C scenario; all cell/rule processing is upstream."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'packs/td/comrade'
root.mkdir(parents=True, exist_ok=True)
cell = lambda x, y: y * 64 + x
parts = ['''[Basic]
Name=Comrade - Tiberium Crossing
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
Theater=TEMPERATE
X=2
Y=2
Width=60
Height=60
TacticalPos=520
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
''']
structures = []
units = []
infantry = []
for house, x, y in [('GoodGuy', 9, 10), ('BadGuy', 46, 43)]:
    for kind, dx, dy in [('FACT',0,0),('NUKE',4,0),('PROC',0,5),('PYLE' if house=='GoodGuy' else 'HAND',5,5)]:
        structures.append(f'{len(structures)}={house},{kind},256,{cell(x+dx,y+dy)},0,None')
    for kind, dx, dy in [('HARV',3,9),('MTNK' if house=='GoodGuy' else 'LTNK',7,2)]:
        units.append(f'{len(units)}={house},{kind},256,{cell(x+dx,y+dy)},0,Guard,None')
    for dx in range(4):
        infantry.append(f'{len(infantry)}={house},E1,256,{cell(x+8+dx,y+7)},0,Guard,0,None')
# A close enemy patrol makes first combat observable without waiting for a whole match.
infantry.append(f'{len(infantry)}=BadGuy,E1,256,{cell(26,18)},0,Area Guard,0,None')
infantry.append(f'{len(infantry)}=GoodGuy,E1,256,{cell(35,38)},0,Area Guard,0,None')
parts += ['[Structures]\n'+'\n'.join(structures), '[Units]\n'+'\n'.join(units), '[Infantry]\n'+'\n'.join(infantry)]
ore = []
for cx,cy in [(18,24),(43,32),(28,29)]:
    for y in range(cy-3,cy+4):
        for x in range(cx-4,cx+5):
            if (x-cx)**2/16+(y-cy)**2/9 <= 1:
                ore.append(f'{cell(x,y)}=TI{1+(x+y)%12}')
parts += ['[Overlay]\n'+'\n'.join(ore), '''[Triggers]
WIN=All Destr.,Win,0,BadGuy,None,0
LOSE=All Destr.,Lose,0,GoodGuy,None,0
RAID=Time,Reinforce.,10,BadGuy,RAID,0
[TeamTypes]
RAID=BadGuy,0,0,1,0,0,7,1,0,0,1,E1:3,1,Attack Units:20,1,1
[Waypoints]
26=454
27=2800
[Base]
Count=0
[Briefing]
1=Establish your economy. Harvest Tiberium, build your base and eliminate the opposing force.
''']
trees = []
for x, y in [(26,8),(27,9),(28,10),(29,11),(30,12),(32,45),(33,46),(34,47),(35,48),(37,15),(39,16),(25,43),(23,44)]:
    trees.append(f'{cell(x,y)}=T{1+(x+y)%7:02d},None')
parts.append('[Terrain]\n'+'\n'.join(trees))
(root/'COMRADE.INI').write_text('\n'.join(parts)+'\n')
(root/'COMRADE.BIN').write_bytes(bytes([255,0])*64*64)
