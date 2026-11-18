"""Produce a local input projection for OPS-005. This tool has no publishing path."""
from pathlib import Path
from hashlib import sha256
import argparse,json
from validate_catalogue import ROOT,STAGES,STAGE_PARENTS,asset_cleared,capability_supported,identity,validate,validate_shape,walk
WORK={
'SPEC':('reference and game design','source-to-Fusion record and lifecycle specification','Resolve permitted modes, producer, exclusions, state graph and authoritative events.','A legal and a forbidden acquisition plus one lifecycle transition agree with the approved disposition.'),
'SIM':('deterministic simulation','runtime definition and replay fixture','Implement approved source-to-Fusion rules through normal production, interaction and save entry points.','Repeat the same input log at two render rates and compare simulation digests.'),
'MODEL':('3D model and materials','original model, materials, team mask and LODs','Author against the reviewed footprint, camera, style sheet, contact points and rights record.','Compare front, rear and silhouette at minimum combat zoom, on two backgrounds, with two teams.'),
'RIG':('rig and sockets','deformation or rigid-part rig and socket inventory','Bind the approved model, check pivots, heading conventions, attachment sockets and hierarchy.','Run the pose extremes and verify attachments and ground contact.'),
'ANIM':('animation','motion clips and transition graph','Bind idle, movement, firing and all applicable lifecycle transitions to the approved event contract.','Interrupt transitions, switch speeds and resume from a save. Confirm one effect per authoritative event.'),
'FX_AUDIO_UI':('effects, audio and interface','event effect, cleared audio, icon and action feedback','Bind accepted events to readable, scoped feedback including fog, ownership and accessibility.','Check selective visibility, event idempotency, action acknowledgement and provenance.'),
'INTEGRATE':('gameplay integration','production, world, replay and performance evidence','Instantiate through a legal acquisition path. Exercise state, terrain, AI, save and render paths on target hardware.','Record state and visual evidence in combat, under interruption and across transfer or reload.'),
'REVIEW':('independent verification','independent whole-entity decision','Reproduce the acceptance fixtures, inspect files and verify rights, SIM, presentation and integration evidence.','Approve only when each required stage and the row-specific negative fixture have artifact evidence.')}
def project(doc, inputs=None):
    err,_=validate(doc)
    if err:raise ValueError('; '.join(err))
    entries={}
    if inputs is not None:
        errors=validate_shape(inputs,'fanout_input')
        if errors:raise ValueError(errors)
        doc_hash=sha256(json.dumps(doc,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        if inputs['catalogue_sha256']!=doc_hash:raise ValueError('intake hash does not match catalogue')
        for item in inputs['entries']:
            if item['entity_id'] in entries:raise ValueError('duplicate file lease')
            entries[item['entity_id']]=item
    records={r['id']:r for r in doc['records']};output={'schema_version':1,'mode':'offline_projection','leaves':[],'withheld':[]}
    for row in sorted((x for x in doc['records'] if x['kind']=='entity'),key=lambda x:identity(x['identity'])[1]):
        i=row['id'];p=row['profile_id'];uid,full=identity(row['identity']);reasons=[]
        if row['disposition']!='verified_included' or row['classification']!='active':reasons.append('requires independently verified active included identity')
        if records[p]['lock_state']!='locked' or not row['reviewer']:reasons.append('requires locked profile and reviewed source row')
        if any(x['role']=='alias' for x in row['relations']):reasons.append('requires reviewed canonical mapping and variant disposition')
        if not row['fixture_ids']:reasons.append('requires row-specific acceptance fixture')
        if not row['adaptation_ids'] or any(records[i]['approval']!='accepted' for i in row['adaptation_ids']):reasons.append('requires accepted Fusion adaptation')
        if row['blockers'] or any(records[i]['status']=='open' for i in row['conflict_ids']):reasons.append('open row research or conflict')
        if doc['context']!='synthetic_test' and i not in entries:reasons.append('requires OPS-005 intake with approved real file leases, acceptance fixtures and contract gates')
        if i in entries and entries[i]['row_sha256']!=full:raise ValueError('file lease belongs to a different source identity')
        if reasons:output['withheld'].append({'entity_id':i,'reasons':reasons});continue
        def key(stage):return f'F3D-ENTITY-{uid}-{stage}-001'
        for stage in STAGES:
            specialist,artifact,procedure,accept=WORK[stage];blocked=[]
            if stage=='SIM':
                blocked.extend('capability-acceptance:'+x for x in row['capability_ids'] if not capability_supported(records[x]))
                if any('group_unknown'in d or d.get('status') in ('unknown','conflicting') for d in walk(row['facts'])):blocked.append('resolve unknown source fields or record an approved scoped adaptation')
            if stage in ('MODEL','RIG','ANIM','FX_AUDIO_UI'):
                if row['visible'] is None or not row['asset_ids'] or any(not asset_cleared(records[x]) for x in row['asset_ids']):blocked.append('obtain an approved original or licensed asset basis, or a reviewed stage exception')
                if stage=='MODEL' and i not in entries:blocked.append('approved geometry and art-direction contract')
                if stage=='ANIM' and i not in entries:blocked.append('approved pose, state and authoritative timing contract')
            target=records[row['adaptation_ids'][0]]['target_profile']
            locations=[f'research-projection/{uid}/{stage.lower()}/'];deliverables=[artifact];checks=[accept,*row['fixture_ids']]
            if i in entries:
                if inputs['target_profile']!=target:raise ValueError('target mismatch '+i)
                lease=entries[i]['stage_specs'][stage];locations=lease['permitted_paths'];deliverables=lease['output_paths'];checks.extend(lease['acceptance_fixtures'])
                blocked.extend(sorted(set(lease['required_contracts'])-set(lease['approved_contracts'])))
                if lease['shared_artifact']:
                    shared=lease['shared_artifact'];deliverables.append(shared['artifact_sha256']);checks.append(shared['variant_fixture'])
                for path in locations+lease['output_paths']:
                    if path.startswith('/') or '..' in Path(path).parts:raise ValueError('invalid relative file lease '+path)
            output['leaves'].append({'task_key':key(stage),'row_uid':uid,'row_sha256':full,'stage':stage,'part':1,'entity_id':i,'dependencies':[key(x) for x in STAGE_PARENTS[stage]],'specialist':specialist,'profile':p,'target_profile':target,'evidence':row['evidence'],'context':[x['url']+' '+x['locator'] for x in row['evidence']]+['catalogue record '+i,'approved adaptation '+','.join(row['adaptation_ids'])],'permitted_paths':locations,'outputs':deliverables,'procedure':[procedure],'acceptance':checks,'non_goals':['Editing other entities or changing unapproved shared rules.'],'blocked_by':blocked,'handoff':'Submit artifacts, content hashes, test results and unresolved issues to the coordinator; OPS-005 resolves runtime file leases and real issue IDs.','publishable':False})
    shape=validate_shape(output,'fanout_projection')
    if shape:raise ValueError(shape)
    inspect_graph(output)
    return output

def inspect_graph(doc):
    by={r['task_key']:r for r in doc['leaves']};groups={}
    if len(by)!=len(doc['leaves']):raise ValueError('Duplicate task key')
    for r in by.values():
        uid=r['row_uid'];stage=r['stage'];g=groups.setdefault(uid,{})
        if stage in g:raise ValueError('duplicate stage')
        g[stage]=r;expected={f'F3D-ENTITY-{uid}-{d}-001' for d in STAGE_PARENTS[stage]}
        if set(r['dependencies'])!=expected or not expected<=by.keys():raise ValueError('dangling or bypassed '+r['task_key'])
        if r['task_key']!=f'F3D-ENTITY-{uid}-{stage}-{r["part"]:03d}' or not r['row_sha256'].startswith(uid):raise ValueError('invalid stable key')
    for uid,g in groups.items():
        if set(g)!=set(STAGES):raise ValueError(f'missing stage {uid}')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('catalogue',type=Path);p.add_argument('output',type=Path);p.add_argument('--intake',type=Path);a=p.parse_args()
    result=project(json.loads(a.catalogue.read_text()),json.loads(a.intake.read_text()) if a.intake else None);a.output.write_text(json.dumps(result,indent=2)+'\n')
