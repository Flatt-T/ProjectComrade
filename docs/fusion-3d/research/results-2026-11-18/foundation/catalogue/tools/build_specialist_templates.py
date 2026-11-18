"""Complete typed examples for all catalogue kinds. All sample values are synthetic."""
import json
from validate_catalogue import ROOT
from build_test_fixture import E
from build_nonrelease_examples import common,unknown
def run():
    p='profile.synthetic';e='entity.synthetic.sample';doc=json.loads((ROOT/'templates'/'synthetic-graph-test.json').read_text())
    result=[]
    def add(kind,identifier,**extra):result.append({**common(kind,identifier,p,E),**extra})
    add('faction','faction.synthetic',parent_id=None,display_names={'en':'Synthetic test faction'},mode_ids=['fixture'],country_general_ids=[],entity_ids=[e],starting_entity_ids=[e],economy_production_graph=unknown(p),counter_roles=unknown(p),terrain_constraints=unknown(p),ai_policy=unknown(p),exclusion_fixtures=['fixture:forbidden-synthetic-purchase'])
    add('capability','cap.synthetic',version='fixture.1',domain='environment',state_contract=unknown(p),commands=unknown(p),tick_order=unknown(p),world_policy=unknown(p),dependency_ids=[],implementation_task='fixture:implementation',review_task='fixture:review',support_status='required',fixture_ids=[])
    add('terrain_feature','terrain.synthetic',theatre_id='fixture-theatre',biome_id=None,source_families=['fixture'],navigation=unknown(p),buildability=unknown(p),height_water=unknown(p),resource_hazard=unknown(p),destruction=unknown(p),visibility=unknown(p),state_transitions=unknown(p),map_generation=unknown(p),lod_budget=unknown(p),asset_ids=[],capability_ids=['cap.synthetic'])
    add('map_theme','theme.synthetic',biome_id='synthetic',theatre_ids=['fixture-theatre'],feature_ids=['terrain.synthetic'],spawn_fairness=unknown(p),harvesting=unknown(p),routes=unknown(p),height_visibility=unknown(p),civilian_cover=unknown(p),path_recovery=unknown(p),bounds=unknown(p),objective=unknown(p),fixture_ids=[])
    add('observation','obs.synthetic',question='Does this synthetic case carry a measured result?',subject_ids=[e],setup='Schema exercise only',map_hash=None,seed=None,commands=[],expectation=unknown(p),result=unknown(p),sample_count=0,interpretation='fixture',independent=False)
    def claim(v):return {'value':v,'unit':'synthetic_ticks','profile_id':p,'status':'authored','evidence':[E],'resolution':None,'tolerance':None}
    add('conflict','conflict.synthetic',subject_ids=[e],claims=[claim(1),claim(2)],impact='Synthetic timing disagreement',decision=None,status='open',resolution_task='fixture:repeat-timing')
    add('completion','completion.synthetic',subject_id=e,stage_records=[],release_state='research',history=['research'],author='fixture engineer')
    doc['records'].extend(result);(ROOT/'templates'/'all-kinds-synthetic.json').write_text(json.dumps(doc,indent=2)+'\n')
if __name__=='__main__':run()
