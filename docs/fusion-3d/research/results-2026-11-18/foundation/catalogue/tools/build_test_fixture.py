"""A synthetic eligible identity exercises eight-stage projection without promoting historical rows."""
import json
from pathlib import Path
from validate_catalogue import ROOT
from build_nonrelease_examples import entity,common,profile,rights
E={'url':'fixture:synthetic-square-agent','revision':'test-v1','locator':'test-only declaration','method':'test_fixture'}
def run():
    p='profile.synthetic';who='automated test reviewer';pr=profile(p,E,'Pipeline verification','fixture-v1')
    pr.update(repository=None,modification='test_fixture',authoritative_use=['synthetic'],lock_state='locked',locked_at='2026-11-18',reviewer=who,blockers=[])
    ent=entity(p,E,'fixture','SyntheticSquare','entity.synthetic.sample','base')
    ent.update(reviewer=who,classification='active',disposition='verified_included',acquisition='starting',blockers=[],visible=True,fixture_ids=['fixture:construct-reload-synthetic-square'],adaptation_ids=['adapt.synthetic'])
    pr['observation_environment']['resolution']['action']='This synthetic fixture has no retail environment.'
    datum={'value':'Synthetic fixed behavior','unit':'test_fixture','profile_id':p,'status':'authored','evidence':[E],'resolution':None,'tolerance':None}
    adapt={**common('adaptation','adapt.synthetic',p,E),'reviewer':who,'subject_ids':[ent['id']],'target_profile':'synthetic.unpublished','source_semantics':datum,'fusion_semantics':datum,'disposition':'direct','rationale':'Exercises a local graph contract.','approval':'accepted','fixture_ids':ent['fixture_ids'],'blockers':[]}
    doc={'schema_version':1,'context':'synthetic_test','records':[pr,rights(p,E),ent,adapt]}
    (ROOT/'templates'/'synthetic-graph-test.json').write_text(json.dumps(doc,indent=2)+'\n')
if __name__=='__main__':run()
