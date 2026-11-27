"""Regression checks for evidence, identity, graph, availability and release gates."""
import copy,json,unittest
from unittest.mock import patch
from validate_catalogue import ROOT,identity,validate,release_blockers
from validate_census_task_expansion import project,inspect_graph
def load(name):return json.loads((ROOT/'templates'/name).read_text())
class ContractTests(unittest.TestCase):
    def setUp(self):
        self.doc=load('all-kinds-synthetic.json');self.by={r['id']:r for r in self.doc['records']};self.e=self.by['entity.synthetic.sample'];self.p=self.by['profile.synthetic']
    def expect_error(self,fragment):
        errors,_=validate(self.doc);self.assertTrue(any(fragment in e for e in errors),errors)
    def test_all_kinds_research_valid(self):
        self.assertEqual(len({r['kind'] for r in self.doc['records']}),11);self.assertEqual(validate(self.doc)[0],[]);self.assertEqual(validate(load('nonrelease-examples.json'))[0],[])
    def test_unknown_remains_null(self):
        self.by['obs.synthetic']['result']['value']=0;self.assertTrue(validate(self.doc)[0])
    def test_observed_zero_is_evidence_backed(self):
        r=self.by['obs.synthetic']['result'];r.update(value=0,status='source_reported',evidence=self.e['evidence'],unit='ticks',resolution=None);self.assertEqual(validate(self.doc)[0],[])
    def test_unknown_requires_owner_task(self):
        self.by['obs.synthetic']['result']['resolution']=None;self.assertTrue(validate(self.doc)[0])
    def test_form_cannot_silently_collapse(self):
        d=load('nonrelease-examples.json');a,b=d['records'][-2:];b['identity']['form_id']=a['identity']['form_id'];self.assertTrue(any('duplicate immutable' in e for e in validate(d)[0]))
    def test_form_pair_carries_state(self):
        d=load('nonrelease-examples.json');d['records'][-1]['relations'][0]['carry_state']=[];self.assertTrue(any('carry state' in e for e in validate(d)[0]))
    def test_alias_cycle(self):
        r={'role':'alias','target_id':self.e['id'],'evidence':self.e['evidence'],'carry_state':[]};self.e['relations']=[r];self.expect_error('cycle')
    def test_conditions_are_compared_within_scope(self):
        r={'faction_id':'faction.synthetic','mode':'fixture','edition':'test','decision':'allowed','evidence':self.e['evidence']};self.e['faction_ids']=['faction.synthetic'];self.e['availability_rules']=[r,{**r,'decision':'excluded'}];self.expect_error('contradictory availability');self.e['availability_rules'][1]['mode']='other';self.assertEqual(validate(self.doc)[0],[])
    def test_no_unseeded_producer_cycle(self):
        self.e['acquisition']='produced';self.e['relations']=[{'role':'producer','target_id':self.e['id'],'evidence':self.e['evidence'],'carry_state':[]}];self.expect_error('unseeded')
    def test_external_seed_breaks_nested_producer_cycle(self):
        root=copy.deepcopy(self.e);root['id']='entity.synthetic.root';root['identity']['source_object_id']='SyntheticRoot';self.doc['records'].append(root);self.e['acquisition']='produced'
        self.e['relations']=[{'role':'producer','target_id':t,'evidence':self.e['evidence'],'carry_state':[]} for t in [self.e['id'],root['id']]];self.assertEqual(validate(self.doc)[0],[])
    def test_dangling_and_bad_kind(self):
        self.e['capability_ids']=['no.such.item','profile.synthetic'];self.expect_error('dangling');self.expect_error('must have kind capability')
    def test_release_without_stages_and_rights_fails(self):
        r=self.by['completion.synthetic'];r['release_state']='release_ready';r['history']+=['in_progress','release_ready'];self.expect_error('release blocked');self.expect_error('open presentation rights')
    def test_state_transition_cannot_skip(self):
        r=self.by['completion.synthetic'];r['release_state']='release_ready';r['history']+=['release_ready'];self.expect_error('illegal completion history')
    def test_prefix_collision_fails(self):
        second=copy.deepcopy(self.e);second['id']='entity.other';second['identity']['source_object_id']='other';self.doc['records'].append(second)
        with patch('validate_catalogue.identity',side_effect=lambda d:('1'*16,'1'*16+('a' if d['source_object_id']=='other' else 'b')*48)):self.expect_error('prefix collision')
    def test_identity_rename_order_and_unicode(self):
        x=self.e['identity'];self.assertEqual(identity(dict(reversed(list(x.items())))),identity(x));y={**x,'source_object_id':'Caf\u00e9'};self.assertEqual(identity(y),identity({**y,'source_object_id':'Cafe\u0301'}));self.e['display_names']['en']='Different name';self.assertEqual(identity(x),identity(self.e['identity']))
    def test_nonrelease_candidates_do_not_expand(self):
        r=project(load('nonrelease-examples.json'));self.assertEqual(len(r['withheld']),3);self.assertEqual(r['leaves'],[])
    def test_deterministic_eight_stages_and_blockage(self):
        d=load('synthetic-graph-test.json');a=project(d);self.assertEqual(a,project(d));self.assertEqual(len(a['leaves']),8);self.assertFalse(any(l['publishable'] for l in a['leaves']));self.assertTrue(next(l for l in a['leaves'] if l['stage']=='SIM')['blocked_by']);self.assertTrue(next(l for l in a['leaves'] if l['stage']=='MODEL')['blocked_by'])
    def test_research_reference_cannot_clear_asset_gate(self):
        a=self.by['profile.synthetic.rights'];a.update(distribution='original_approved',reviewer=a['owner'],review_evidence=a['evidence'],artifact_sha256='a'*64,blockers=[])
        self.e['asset_ids']=[a['id']];self.expect_error('independent rights')
        self.assertIn('open presentation rights',release_blockers(self.e,self.by))
        a['reviewer']='other reviewer';self.expect_error('deliverable asset class')
    def test_self_reviewed_original_artist_cannot_clear_rights(self):
        a=self.by['profile.synthetic.rights'];a.update(asset_class='model',distribution='original_approved',reviewer=a['creator'],review_evidence=a['evidence'],artifact_sha256='a'*64,blockers=[]);self.expect_error('independent rights')
        a['reviewer']='independent fixture reviewer';self.assertEqual(validate(self.doc)[0],[])
    def test_bare_capability_approval_does_not_unlock(self):
        c=self.by['cap.synthetic'];c.update(support_status='accepted',review_task=c['implementation_task'],reviewer=None,fixture_ids=[]);self.e['capability_ids']=[c['id']]
        self.expect_error('accepted capability requires');self.assertIn('unsupported capability',release_blockers(self.e,self.by))
    def test_capability_fixture_must_be_addressable(self):
        c=self.by['cap.synthetic'];d=self.by['adapt.synthetic']['fusion_semantics']
        c.update(support_status='accepted',state_contract=d,commands=d,tick_order=d,world_policy=d,reviewer='independent fixture reviewer',fixture_ids=['pending'],blockers=[])
        self.expect_error('addressable fixture');c['fixture_ids']=['fixture:motion/basic#tick-12'];self.assertEqual(validate(self.doc)[0],[])
    def test_capability_cannot_review_its_own_work(self):
        c=self.by['cap.synthetic'];d=self.by['adapt.synthetic']['fusion_semantics'];c.update(support_status='accepted',state_contract=d,commands=d,tick_order=d,world_policy=d,reviewer=c['owner'],fixture_ids=['fixture:motion/basic'],blockers=[])
        self.expect_error('independently reviewed');c['reviewer']='another reviewer';c['review_task']=c['implementation_task'];self.expect_error('distinct implementation/review')
    def test_graph_stage_bypass_rejected(self):
        a=project(load('synthetic-graph-test.json'));a['leaves'][-1]['dependencies']=a['leaves'][-1]['dependencies'][2:]
        with self.assertRaises(ValueError):inspect_graph(a)
if __name__=='__main__':unittest.main(verbosity=2)
