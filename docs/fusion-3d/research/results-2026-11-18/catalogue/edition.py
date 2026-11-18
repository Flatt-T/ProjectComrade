"""Return original-edition differences for an object and its direct bindings."""
import json
import gzip
from zipfile import ZipFile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def linked_sections(row, fact):
    names={row['id']}
    if not isinstance(fact,dict):return names
    for value in (fact.get('art_key'),(fact.get('visual_properties') or {}).get('Sequence')):
        if isinstance(value,str):names.add(value)
    names.update(name for name in (fact.get('weapon_slots') or {}).values() if isinstance(name,str))
    return {n.casefold() for n in names}

def original_differences(row,fact):
    result=[]
    profile=row['profile']
    names=linked_sections(row,fact)
    if profile=='yr':
        path='early/ra2-patch-findings.json'
        patch=json.loads((ROOT/path).read_text())
        for section,delta in patch['field_differences'].items():
            if section.casefold() in names:
                result.append(dict(edition='English Yuri 1.001',layer='rules',section=section,
                                   source=path,differences=delta))
        original='early/yr-disc-profiles.zip'
        with ZipFile(ROOT/original) as z:
            for item in map(json.loads,z.open('retail-object-bindings.jsonl')):
                if item['id']==row['id'] and item['kind']==fact.get('kind'):
                    result.append(dict(edition='original YR disc',layer='registered rules and presentation',
                                       source=original,retail_binding=item))
            for item in map(json.loads,z.open('retail-art-vs-cncnet.jsonl')):
                if item['section'].casefold() in names and item['change']!='equal':
                    result.append(dict(edition='original YR disc vs community art',layer='art',source=original,comparison=item))
    if profile=='ra2':
        path='early/ra2-patch-disc-comparison.json.gz'
        with gzip.open(ROOT/path,'rt') as stream:
            disc=json.load(stream)['comparisons']
        for layer,versions in disc.items():
            for pair,table in versions.items():
                for section,delta in table['differences'].items():
                    if section.casefold() in names:
                        result.append(dict(edition_comparison=pair,layer=layer,section=section,
                                           source=path,differences=delta))
                for side in ('left_only','right_only'):
                    for section in table[side]:
                        if section.casefold() in names:
                            result.append(dict(edition_comparison=pair,layer=layer,section=section,
                                               source=path,present_in=side))
    if profile=='ts':
        path='early/ts-retail-verification.json'
        media=json.loads((ROOT/path).read_text())
        for file in media['disc_profiles'][0]['results']:
            comparison=file.get('anchored_range_comparison',{})
            for kind in ['changed','only_in_disc','only_in_comparator']:
                for item in comparison.get(kind,[]):
                    if item['section'].casefold() in names:
                        result.append(dict(edition='Nod CD 1.08',layer=file['ini'],source=path,
                                           difference_kind=kind,**item))
    return result
