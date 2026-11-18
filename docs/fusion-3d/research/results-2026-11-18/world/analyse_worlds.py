"""Aggregate recorded map measurements and compare XML declarations with binary headers."""
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
from urllib.parse import quote

HERE=Path(__file__).resolve().parent
PIN='3aad8e412961ab543192ae70f8503dc8e178e095'
def key(s):
    s=s.lower().replace('\\','/')
    return s[s.index('maps/'):] if 'maps/' in s else s
def run():
    meta=json.loads((HERE/'map-metadata.json').read_text())
    bypath=defaultdict(list);bygame={};receipts={};docs=[]
    for f in sorted(HERE.glob('*-maps.jsonl')):
        k=f.stem.replace('-maps',''); bygame[k]=[json.loads(line) for line in f.open()]
        for row in bygame[k]:bypath[(row['path'].split('/')[0].lower(),key(row['path']))].append(row)
    for row in meta:
        match=bypath.get((row['source'].split('/')[0].lower(),key(row['FileName'])),[])
        row['matched_map_paths']=[r['path'] for r in match];row['measured_header_check']=None
        if len(match)==1 and all(row.get(k) is not None for k in ('Width','Height','BorderSize')):
            h=match[0]['height']
            row['measured_header_check']=all(str(h[k])==row[v] for k,v in [('width','Width'),('height','Height'),('border','BorderSize')])
    tags=Counter('unmatched' if not r['matched_map_paths'] else ('ambiguous' if len(r['matched_map_paths'])>1 else ('metadata lacks header values' if r['measured_header_check'] is None else ('header agrees' if r['measured_header_check'] else 'header differs'))) for r in meta)
    for game,rows in bygame.items():
        off=[r for r in rows if r['directory_class']=='official_directory']
        tex=Counter(t for r in rows for t in set(r['texture_table']))
        objects=Counter()
        for r in rows:objects.update(r['world_objects'])
        samples=[]
        patterns={'alpine and snow':'Snow|Ice|Alpine','desert and dry industrial':'Sand|Desert|Egypt|orangedirt','urban pavement':'Pave|asphalt|Cobblestone','uplifted rock and cliff':'Cliff|rockcliff','contaminated zone':'RedZone|YellowZone|Tiberium','coast and island':'Cannes|Yucatan|Japan|Tokyo|Beach','bridge structures':'bridge'}
        for label,pat in patterns.items():
            pool=sorted(off,key=lambda r:(bool(re.search('test|BUG_',r['path'],re.I)),r['path']))
            matches=[r for r in pool if any(re.search(pat,t,re.I) for t in (r['texture_table'] if label!='bridge structures' else r['world_objects']))]
            if not matches:continue
            r=max(matches,key=lambda r:sum(bool(re.search(pat,t,re.I)) for t in (r['texture_table'] if label!='bridge structures' else r['world_objects'])) if not re.search('test|BUG_',r['path'],re.I) else -1)
            examples=[t for t in (r['texture_table'] if label!='bridge structures' else r['world_objects']) if re.search(pat,t,re.I)]
            samples.append({'design_family_search':label,'map':r['path'],'placed_bridge_ids_and_counts':{s:n for s,n in r['world_objects'].items() if 'bridge' in s.lower()},'matching_identifiers':examples[:10],'height':r['height'],'source':'https://github.com/electronicarts/CnC_Modding_Support/blob/'+PIN+'/'+quote(r['path'])})
        receipts[game]={'path_count':len(rows),'distinct_file_hashes':len(set(r['sha256'] for r in rows)),'unique_material_identifiers':len(tex),'texture_occurrences_by_map':dict(tex.most_common()),'bridge_named_object_counts':{s:n for s,n in sorted(objects.items()) if 'bridge' in s.lower()},'maps_with_bridge_named_object':sum(any('bridge' in s.lower() for s in r['world_objects']) for r in rows),'official_directory_paths':len(off),'sample_sheets':samples}
    (HERE/'world-comparisons.json').write_text(json.dumps({'metadata_match_counts':tags,'map_path_count':sum(len(rs) for rs in bygame.values()),'unique_content_hashes_all_titles':len({r['sha256'] for rs in bygame.values() for r in rs}),'families':receipts},indent=1)+'\n')
    (HERE/'metadata-crosscheck.jsonl').write_text('\n'.join(json.dumps(x,separators=(',',':')) for x in meta)+'\n')
    labels={'generals':'Generals','zh':'Zero Hour','tw':'Tiberium Wars','kw':"Kane’s Wrath",'ra3':'Red Alert 3','uprising':'Uprising','c4':'Tiberian Twilight'}
    with (HERE/'README.md').open('w') as out:
        out.write('# What the terrain and bridge evidence establishes\n\nThe parser measured every .map member in the seven named directories of EA’s public mod-support archive. Each row has both the publisher Git blob and a SHA-256 of the exact file. Internal, library and official-directory paths stay visible. Some folders named official even contain tests. A file in that directory alone cannot certify a shipped map.\n\n| Family | Map files | Distinct hashes within family | Material identifiers | Files with a bridge-named placed object |\n|---|---:|---:|---:|---:|\n')
        for k in labels:
            r=receipts[k];out.write(f"| {labels[k]} | {r['path_count']} | {r['distinct_file_hashes']} | {r['unique_material_identifiers']} | {r['maps_with_bridge_named_object']} |\n")
        out.write('\nThe binary parser decompresses EAR/RefPack or ZL5/zlib when needed, resolves the chunk-name table, validates width × height against the height data and reads placed object type strings. The blend table lists materials available to the map. It does not measure the area drawn with each material. Raw elevation bounds use the original sample widths. Compare them within the specified edition until vertical scale has been measured. The bridge column counts object identifiers containing “bridge”. Those can be scenery, ruins, towers or a playable span. The path graph and rule can only be established with the corresponding object definition and observed traversal.\n\n')
        out.write('The XML index produced '+str(len(meta))+' filename-bearing metadata records. The binary/header cross-check gave '+', '.join(f'{v} {k}' for k,v in sorted(tags.items()))+'. Read [the cross-check](metadata-crosscheck.jsonl) for each exact path and disagreement. A match tests width, height and border. The published CRC is retained without assuming its algorithm.\n\n')
        out.write('## Maps for the first art reviews\n\n| Family | Source environment | Map and measured material or placement | Review at touch zoom |\n|---|---|---|---|\n')
        choices={'generals':'alpine and snow','zh':'desert and dry industrial','tw':'contaminated zone','kw':'uplifted rock and cliff','ra3':'coast and island','uprising':'urban pavement','c4':'bridge structures'}
        asks={'generals':'Keep dark track silhouettes and pale road edges distinguishable on the snow.','zh':'Separate traversable sandy flats from rock shelves with shape and value.','tw':'Use a contamination transition distinguishable from team colour.','kw':'Use ledges and ramp silhouettes to communicate passable grade.','ra3':'Keep shore, shallow water, docks and offshore structures readable from the same camera.','uprising':'Maintain an uninterrupted traversable road silhouette through dense city props.','c4':'Mark ruined or ornamental geometry separately from a live topology edge.'}
        for k,choice in choices.items():
            sam=next((s for s in receipts[k]['sample_sheets'] if s['design_family_search']==choice),receipts[k]['sample_sheets'][0])
            out.write(f"| {labels[k]} | {sam['design_family_search']} | [{Path(sam['map']).stem}]({sam['source']}) · {', '.join(sam['matching_identifiers'][:3])} | {asks[k]} |\n")
        out.write('\nUse [the aggregate data](world-comparisons.json) to select variants and the title JSONL files to find the complete material table, counts, raw elevations and source hashes. For every commissioned original terrain kit, record walk/build/naval classes, shore geometry, lighting, team masks, resource and hazard read, prop persistence and connected transition pieces. Keep map compositions original. Test seams across road–mud, snow–rock, build pad–shore and deck–ramp at normal camera height. Render quality may simplify waves or grass while preserving deck, underpass, occupancy, fog and selection.\n')
if __name__=='__main__':run()
