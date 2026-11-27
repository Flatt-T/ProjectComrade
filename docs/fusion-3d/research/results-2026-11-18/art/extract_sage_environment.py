"""Index locally declared world-art, terrain and map facts in the pinned EA SAGE data ZIP.
Usage: python extract_sage_environment.py archive.zip output_directory
"""
from collections import Counter
from pathlib import Path
from zipfile import ZipFile
import csv
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET

PIN="3aad8e412961ab543192ae70f8503dc8e178e095"
GAMES={"Red Alert 3":"ra3","Uprising":"uprising","Tiberian Twilight":"c4","Kanes Wrath":"kw","Tiberium Wars":"tw"}
def local(element): return element.tag.rsplit('}',1)[-1]
def strings(items): return '|'.join(sorted({item for item in items if item}))
def write(path,fields,rows):
    with path.open('w',newline='') as f:
        w=csv.DictWriter(f,fields,delimiter='\t',lineterminator='\n')
        w.writeheader();w.writerows(rows)
def values(e,tag,atts):
    return strings(n.get(key) for n in e.iter() if local(n)==tag for key in atts)
def main():
    archive=Path(sys.argv[1]);out=Path(sys.argv[2])
    counters={game:Counter() for game in GAMES}
    objects={game:[] for game in GAMES};materials=[];maps=[];errors=[];sources=[]
    with ZipFile(archive) as z:
        for name in sorted(z.namelist()):
            prefix,_,path=name.partition('/')
            if not prefix.endswith(PIN): raise ValueError('Archive root does not match pinned commit')
            game,_,rest=path.partition('/');q=rest.lower()
            if game not in GAMES or not q.endswith('.xml'):continue
            is_civ=q.startswith('xml/civilian/')
            is_material=q.endswith('/terrain/terrain.xml')
            is_map=q.endswith('/mapmetadata.xml')
            if not any((is_civ,is_material,is_map)):continue
            key='civilian_files' if is_civ else 'terrain_files' if is_material else 'map_files'
            counters[game][key]+=1
            b=z.read(name);sha=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
            try: root=ET.fromstring(b)
            except ET.ParseError as err:
                errors.append({'game':game,'path':rest,'blob':sha,'error':str(err),'unvalidated_object_id_candidates':sorted(set(re.findall(r'<GameObject\s+[^>]*?\bid="([^"]+)"',re.sub(r'<!--.*?-->','',b.decode('latin1'),flags=re.S),flags=re.S)))})
                continue
            if not is_civ:sources.append({'game':game,'path':rest,'git_blob':sha})
            if is_civ:
                for obj in root:
                    if local(obj)!='GameObject':continue
                    row={'id':obj.get('id',''),'path':rest[rest.lower().index('/civilian/')+10:],'git_blob':sha,'parent':obj.get('inheritFrom',''),'browser':obj.get('Browser',''),'editor_sorting':obj.get('EditorSorting',''),'model_names':values(obj,'Model',['Name']),'model_conditions_yes':values(obj,'ModelConditionState',['ConditionsYes']),'anim_conditions_yes':values(obj,'AnimationState',['ConditionsYes']),'animation_names':values(obj,'Animation',['AnimationName']),'particles':values(obj,'ParticleSysBone',['FXParticleSystemTemplate']),'shape_types':values(obj,'Shape',['Type'])}
                    assert row['id']
                    objects[game].append(row)
            if is_material:
                for mat in root.iter():
                    if local(mat)!='TerrainAsset':continue
                    materials.append({'game':GAMES[game],'path':rest,**{key:mat.get(key,'') for key in ['id','Class','WBFolder','Texture','BumpTexture']}})
            if is_map:
                ordinal=0
                for block in root.iter():
                    if local(block)!='MapMetaData' or any(local(child)=='MapMetaData' for child in block):continue
                    ordinal+=1
                    maps.append({'game':GAMES[game],'path':rest,'source_leaf_ordinal':ordinal,**{key:block.get(key,'') for key in ['id','FileName','Width','Height','BorderSize','NumPlayers','IsOfficial','IsMultiplayer','CRC']},'named_starts':strings(p.get('Name') for p in block if local(p)=='StartPosition')})
    summary={'repo':'https://github.com/electronicarts/CnC_Modding_Support','commit':PIN,'scope':'Xml/Civilian/**/*.xml direct GameObject declarations, three Terrain/Terrain.xml collections and four MapMetaData.xml files. Local declared fields only. Map records exclude the four cache containers and retain two sparse Tiberium Wars records without filenames. Blank fields may be inherited. Duplicates by released branch and source file retained.','errors':errors,'non_civilian_sources':sources,'games':{}}
    for game,rows in objects.items():
        assert rows
        code=GAMES[game];write(out/f'sage-scenery-{code}.tsv',list(rows[0]),rows)
        terrain=[r for r in materials if r['game']==code];mr=[r for r in maps if r['game']==code]
        data={'scanned':dict(counters[game]),'scenery_declarations':len(rows),'distinct_object_ids':len({r['id'] for r in rows}),'direct_model_reference':sum(bool(r['model_names']) for r in rows),'direct_animation_reference':sum(bool(r['animation_names']) for r in rows),'direct_model_conditions':sum(bool(r['model_conditions_yes']) for r in rows),'first_folder':dict(sorted(Counter(r['path'].split('/')[0] if '/' in r['path'] else '.' for r in rows).items())),'maps':len(mr),'terrain_assets':len(terrain),'terrain_folders':dict(sorted(Counter(r['WBFolder'] for r in terrain).items()))}
        summary['games'][code]=data
    write(out/'sage-terrain-materials.tsv',list(materials[0]),materials)
    write(out/'sage-map-index.tsv',list(maps[0]),maps)
    (out/'sage-environment-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print('Errors',len(errors),'maps',len(maps),'materials',len(materials),{k:v['scenery_declarations'] for k,v in summary['games'].items()})
if __name__=='__main__':main()
