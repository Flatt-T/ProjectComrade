"""Read the three public statistical tabs and the date cell. Input: downloaded XLSX, existing reference TSV, output JSON."""
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
import openpyxl

book_path,ledger_path,out_path=map(Path,sys.argv[1:])
book=openpyxl.load_workbook(book_path,read_only=True,data_only=True)
table_url='https://docs.google.com/spreadsheets/d/18Xe16mFIpLvy7OPxoF6-NHCaJwkMf2T6YKXv429woRI/edit'
combat_groups={'infantry','vehicles','aircraft','tech'}
with ledger_path.open() as h:
    units=[u for u in csv.DictReader(h,delimiter='\t') if u['navigation_group'] in combat_groups]
def normalize(s):
    return re.sub('[^a-z0-9]','',s.casefold())
def simple(v):
    if isinstance(v,str) and re.fullmatch(r'-?\d+(?:\.\d+)?',v):
        v=float(v)
    return int(v) if isinstance(v,float) and v.is_integer() else v
def hash_bytes(val):return hashlib.sha256(val).hexdigest()
aliases={'lasersquad':'lasertroopers','cyberwheel':'cyberwheels','attackbike':'attackbikes',
         'militant':'militants','laserdrone':'laserdrones','zonetrooper':'zonetroopers'}
def unit_base(label):
    return normalize(re.split(r'\s*\(|_ST$',label,maxsplit=1)[0])
# Cells listed explicitly so unrelated tabs/columns are excluded. The extra tab measures turn/hex reservation.
schemas=[
 ('LIVE Unit Values',{'B':'damage_per_shot','D':'number_of_shots','E':'squad_size','F':'vs_infantry','G':'vs_vehicle','H':'vs_air','I':'vs_structure','J':'vs_harvester','K':'unit_type','N':'rate_of_fire','O':'initial_charge_up','P':'range','Q':'cost_by_column','R':'producer_by_column','S':'speed_band'}),
 ('Value Rank',{'M':'health','Q':'cost','T':'speed_value'}),
 ('Live Additional Values',{'B':'turn_rate','C':'hex_reservation'})]
tables={name:list(book[name].iter_rows(min_row=2,max_col=max(ord(c)-64 for c in schema),values_only=True)) for name,schema in schemas}
def records(sheet,fields,key):
    return [{'row':i,'label':vals[0],'values':{field:simple(vals[ord(col)-65]) for col,field in fields.items() if vals[ord(col)-65] is not None}}
            for i,vals in enumerate(tables[sheet],2) if isinstance(vals[0],str) and unit_base(vals[0])==key]
def normalized_source_obs(records):
    return hash_bytes(json.dumps(records,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
facts=[]
for u in units:
    key=normalize(u['label']);matched=aliases.get(key,key)
    observations={sheet:records(sheet,fields,matched) for sheet,fields in schemas}
    assert observations['LIVE Unit Values'],u['label']
    costs=sorted({r['values']['cost_by_column'] for r in observations['LIVE Unit Values'] if r['values'].get('cost_by_column') is not None})
    published=int(u['showcase_tiberium']) if u['showcase_tiberium'] else None
    cost_compare='uncompared' if published is None else 'same value' if costs==[published] else 'different recorded values'
    obs={'faction':u['faction'],'unit':u['label'],'group':u['navigation_group'],
         'roster_facility_context':u['facility_inferred_from_group'],
         'identity_match':'normalized name' if key==matched else 'explicit roster alias',
         'numeric_evidence':'community workbook mixed-vintage field observations',
         'version_confidence':'no single game version can be assigned',
         'recorded_costs':costs,'publisher_showcase':{'url':u['stat_source_url'] or u['showcase_url'] or None,
         'publication_date':u['showcase_publication_date'] or None,'cost':published,'facility':u['showcase_building_as_published'] or None},
         'independent_cost_comparison':cost_compare,'sheets':observations}
    facts.append(obs)
assert len(facts)==64 and len({u['unit'] for u in facts})==64
source_date=book['INTRO']['B2'].value.date().isoformat()
counts={sheet:{'combat_units_with_named_rows':sum(bool(x['sheets'][sheet]) for x in facts),
               'unit_or_mode_rows':sum(len(x['sheets'][sheet]) for x in facts),
               'units_with_present_fields':{f:sum(any(f in r['values'] for r in x['sheets'][sheet]) for x in facts) for f in fields.values()},
               'units_with_numeric_fields':{f:sum(any(isinstance(r['values'].get(f),(int,float)) for r in x['sheets'][sheet]) for x in facts) for f in fields.values() if f not in ('unit_type','producer_by_column','speed_band')}}
        for sheet,fields in schemas}
result={'workbook_url':table_url,'public_xlsx_export':table_url.rsplit('/',1)[0]+'/export?format=xlsx',
        'inspection_date_utc':'2026-11-18','intro_date_cell':'INTRO!B2','intro_date_as_stored':source_date,
        'intro_level_claim':'Level 1; per-field level not independently verified',
        'dated_version_evidence':'The EA Battering Ram showcase is dated 2022-12-05; this snapshot includes a Battering Ram row. The INTRO date does not date all the values.',
        'game_build_id':None,'source_column_maps':dict(schemas),'included_sheet_facts_sha256':normalized_source_obs([u['sheets'] for u in facts]),
        'source_scope':'Only selected factual cells and coordinates from these named statistical tabs are distributed. Empty fields remain missing. Formulas are read as cached numbers.',
        'counts':counts,'independent_showcase_cost_comparison':dict(Counter(x['independent_cost_comparison'] for x in facts)),'units':facts}
out_path.write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n')
print(counts, result['independent_showcase_cost_comparison'])
