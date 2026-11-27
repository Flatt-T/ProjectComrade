"""Validate v1 catalogues, return actionable errors and a grouped coverage report."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import json
import unicodedata
import re
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT=Path(__file__).resolve().parents[1]
IDENTITY=('source_title','edition','platform','source_faction','namespace','source_object_id','form_id')
STAGES=('SPEC','SIM','MODEL','RIG','ANIM','FX_AUDIO_UI','INTEGRATE','REVIEW')
STAGE_PARENTS={'SPEC':(), 'SIM':('SPEC',),'MODEL':('SPEC',),'RIG':('MODEL',),'ANIM':('RIG','SPEC'),'FX_AUDIO_UI':('SPEC','SIM'),'INTEGRATE':('SIM','MODEL','RIG','ANIM','FX_AUDIO_UI'),'REVIEW':('SIM','FX_AUDIO_UI','INTEGRATE')}
REF_TYPES={'rights_id':'asset_provenance','asset_ids':'asset_provenance','derivatives':'asset_provenance','parent_id':'faction','faction_ids':'faction','country_general_ids':'faction','entity_ids':'entity','starting_entity_ids':'entity','capability_ids':'capability','dependency_ids':'capability','feature_ids':'terrain_feature','conflicts':'conflict','conflict_ids':'conflict','observation_ids':'observation','adaptation_ids':'adaptation'}
ALLOWED_TRANSITIONS={'research':{'in_progress','blocked'},'in_progress':{'blocked','release_ready'},'blocked':{'in_progress','research'},'release_ready':{'blocked'}}

def identity(identity_fields):
    if set(identity_fields)!=set(IDENTITY):raise ValueError('Immutable identity has missing or extra components')
    parts=[]
    for name in IDENTITY:
        value=identity_fields[name]
        if not isinstance(value,str) or value.strip()!=value or not value or any(ord(c)<32 for c in value):raise ValueError('Invalid identity component '+name)
        parts.append((name,unicodedata.normalize('NFC',value)))
    text=json.dumps(dict(parts),ensure_ascii=False,separators=(',',':'))
    full=sha256(text.encode('utf8')).hexdigest()
    return full[:16],full

def validate_shape(document,name):
    schemas=[json.loads(f.read_text()) for f in sorted((ROOT/'schemas').glob('*.schema.json'))]
    reg=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);byid={s['$id']:s for s in schemas}
    schema=byid['urn:fusion:research:catalogue:v1:'+name]
    return [f"{'/'.join(map(str,e.absolute_path)) or '$'}: {e.message[:300]}" for e in Draft202012Validator(schema,registry=reg).iter_errors(document)]

def find_cycles(graph,allowed):
    seen=set();active=set();out=[]
    def visit(node,chain):
        if node in active:out.append(' -> '.join(chain[chain.index(node):]+[node]));return
        if node in seen:return
        seen.add(node);active.add(node)
        for target in sorted(graph.get(node,())):
            if target in allowed:visit(target,chain+[node])
        active.remove(node)
    for start in sorted(allowed):visit(start,[])
    return out

def walk(node):
    if isinstance(node,dict):
        yield node
        for value in node.values():yield from walk(value)
    if isinstance(node,list):
        for value in node:yield from walk(value)

def usable_fixture(reference):
    return isinstance(reference,str) and bool(re.fullmatch(r'(?:fixture:|repo:|https://)[^\s]+|(?:FIX|FX)-[A-Za-z0-9_.-]+',reference))

def asset_cleared(row):
    return (row.get('kind')=='asset_provenance' and row.get('asset_class')!='research_reference'
            and row.get('distribution') in ('original_approved','licensed_approved')
            and row.get('reviewer') and row['reviewer'] not in (row.get('owner'),row.get('creator'))
            and not row.get('blockers') and bool(row.get('review_evidence'))
            and re.fullmatch('[0-9a-f]{64}',row.get('artifact_sha256') or '') is not None)

def capability_supported(row):
    return (row.get('kind')=='capability' and row.get('support_status')=='accepted'
            and row.get('reviewer') and row['reviewer']!=row.get('owner') and not row.get('blockers')
            and row.get('implementation_task') and row.get('review_task')
            and row['implementation_task']!=row['review_task']
            and bool(row.get('fixture_ids')) and all(usable_fixture(f) for f in row['fixture_ids'])
            and all(row.get(field,{}).get('status') in ('observed','source_reported','authored','not_applicable')
                    for field in ('state_contract','commands','tick_order','world_policy')))

def validate(doc):
    errors=validate_shape(doc,'catalogue')
    if errors:return errors,{}
    records={};prefixes={};coverage=Counter();graph=defaultdict(set);aliases=defaultdict(set);capgraph=defaultdict(set);completed=set()
    for row in doc['records']:
        key=row['id']
        if key in records:errors.append(f'{key}: duplicate record ID')
        records[key]=row
    def ref(owner,item,kind=None):
        target=records.get(item)
        if target is None:errors.append(f'{owner}: dangling reference {item}')
        elif kind and target['kind']!=kind:errors.append(f'{owner}: {item} must have kind {kind}')
        return target
    for row in doc['records']:
        k=row['kind'];i=row['id'];profile=ref(i,row['profile_id'],'source_profile')
        if k=='source_profile' and row['reviewer']==row['owner'] and row['lock_state']=='locked':errors.append(f'{i}: profile reviewer cannot be the owner')
        if k=='source_profile' and row['profile_id']!=i:errors.append(f'{i}: profile must reference itself')
        for field,typ in REF_TYPES.items():
            values=row.get(field,[]);values=values if isinstance(values,list) else [values]
            for v in values:
                if v:ref(i,v,typ)
        for d in walk(row):
            if {'profile_id','unit','status','value'}<=d.keys():ref(i,d['profile_id'],'source_profile')
        if k=='source_profile':
            if row['inherits']:ref(i,row['inherits'],'source_profile');aliases[i].add(row['inherits'])
            if row['lock_state']=='locked' and (row['reviewer'] is None or row['locked_at'] is None):errors.append(f'{i}: locked profile needs dated independent review')
        if k=='capability':
            if row['support_status']=='accepted' and not capability_supported(row):errors.append(f'{i}: accepted capability requires distinct implementation/review tasks, independently reviewed resolved contracts, cleared blockers and addressable fixture references')
            capgraph[i].update(row['dependency_ids'])
            if row['support_status'] in ('required','implemented','accepted') and (not row['implementation_task'] or not row['review_task']):errors.append(f'{i}: missing capability implementation or review owner task')
        if k in ('adaptation','observation','conflict'):
            for subject in row['subject_ids']:ref(i,subject)
        if k=='conflict' and row['status']=='resolved' and (not row['decision'] or not row['reviewer']):errors.append(f'{i}: resolved conflict needs adjudication and reviewer')
        if k=='adaptation' and row['approval']=='accepted' and (not row['reviewer'] or not row['fixture_ids']):errors.append(f'{i}: accepted adaptation needs reviewer and fixture')
        if k=='observation' and row['interpretation']=='direct_playback' and (row['sample_count']<1 or row['result']['status']!='observed' or not row['commands']):errors.append(f'{i}: direct playback needs measured result, samples and repeatable commands')
        if k=='asset_provenance' and row['distribution'].endswith('_approved') and not asset_cleared(row):errors.append(f'{i}: distributable asset needs a deliverable asset class, cleared blockers, immutable artifact and independent rights review')
        if k=='faction' and row['parent_id']:aliases[i].add(row['parent_id'])
        if k=='entity':
            if row['disposition']=='approved_exclusion' and (row['reviewer'] is None or not any(records.get(x,{}).get('disposition')=='excluded' and records[x].get('approval')=='accepted' for x in row['adaptation_ids'])):errors.append(f'{i}: exclusion requires approved decision and review')
            try:
                uid,full=identity(row['identity'])
                if uid in prefixes:errors.append(f'{i}: '+('duplicate immutable identity' if prefixes[uid]==full else 'SHA256 prefix collision'))
                prefixes[uid]=full
            except ValueError as e:errors.append(f'{i}: {e}')
            for h in row['faction_ids'] or ['unassigned']:coverage[(row['profile_id'],h,row['category'],row['disposition'])]+=1
            flags=defaultdict(set)
            for av in row['availability_rules']:
                ref(i,av['faction_id'],'faction');flags[(av['faction_id'],av['mode'],av['edition'])].add(av['decision'])
                if av['decision']=='allowed' and av['faction_id'] not in row['faction_ids']:errors.append(f'{i}: allowed faction absent in roster {av["faction_id"]}')
            if any({'allowed','excluded'}<=s for s in flags.values()):errors.append(f'{i}: contradictory availability in same faction/mode/edition')
            relations=defaultdict(set)
            for rel in row['relations']:
                role=rel['role'];target=rel['target_id'];other=ref(i,target,{'capability':'capability','terrain_layer':'terrain_feature','visual_family':'asset_provenance'}.get(role,'entity'));relations[role].add(target)
                if role in ('alias','inherits'):aliases[i].add(target)
                if role!='form' or not other or other['kind']!='entity':continue
                if i==target or row['profile_id']!=other['profile_id'] or not rel['carry_state']:errors.append(f'{i}: form identity/profile/carry state invalid for {target}')
                if not any(r['role']=='form' and r['target_id']==i for r in other['relations']):errors.append(f'{i}: missing reciprocal form link for {target}')
            if relations['required_all']&relations['forbidden']:errors.append(f'{i}: required entity also forbidden')
            if row['disposition']=='accepted_alias' and len(relations['alias'])!=1:errors.append(f'{i}: accepted alias needs exactly one canonical entity')
            if row['classification'] in ('unused','cancelled') and row['disposition']=='verified_included':errors.append(f'{i}: inactive record marked included')
            if row['acquisition']=='produced':graph[i]=relations
        if k=='completion':
            sub=ref(i,row['subject_id'],'entity');hs=row['history'];st={e['stage']:e for e in row['stage_records']}
            if row['subject_id'] in completed:errors.append(f'{i}: duplicate completion record')
            completed.add(row['subject_id'])
            if hs[0]!='research' or hs[-1]!=row['release_state'] or any(b not in ALLOWED_TRANSITIONS[a] for a,b in zip(hs,hs[1:])):errors.append(f'{i}: illegal completion history')
            if len(st)!=len(row['stage_records']):errors.append(f'{i}: duplicate stage')
            valid=set()
            for stage,leaf in st.items():
                if leaf['state'] in ('accepted','shared','not_applicable'):
                    if not leaf['reviewer'] or leaf['reviewer']==row['author'] or not leaf['evidence'] or (leaf['state']!='not_applicable' and not leaf['artifact_sha256']) or (leaf['state']!='accepted' and not leaf['reason']):errors.append(f'{i}: missing independent proof for {stage}')
                    else:valid.add(stage)
            for stage in valid:
                if set(STAGE_PARENTS[stage])-valid:errors.append(f'{i}: stage {stage} bypasses prerequisites')
            if row['release_state']=='release_ready' and sub:
                conditions=release_blockers(sub,records)
                if set(STAGES)!=valid or any(st.get(s,{}).get('state')!='accepted' for s in ('SIM','FX_AUDIO_UI','INTEGRATE','REVIEW')):conditions.append('missing required acceptance')
                if doc['context']=='synthetic_test':conditions.append('synthetic context')
                if conditions:errors.append(f'{i}: release blocked: '+', '.join(conditions))
    # Every producer is an alternative; required_all and at least one required_any must be reachable.
    ready={i for i,r in records.items() if r['kind']=='entity' and r['acquisition'] in ('starting','scripted','spawned','transformation')}
    pending=set(graph)
    while True:
        newly={i for i in pending if graph[i]['producer']&ready and graph[i]['required_all']<=ready and (not graph[i]['required_any'] or graph[i]['required_any']&ready)}
        if not newly:break
        ready.update(newly);pending-=newly
    for i in sorted(pending):
        if records[i]['disposition']=='verified_included':errors.append(f'{i}: impossible or unseeded acquisition chain')
    for key,g in [('alias/inheritance',aliases),('capability',capgraph)]:
        for cycle in find_cycles(g,set(g)):errors.append(f'{key} cycle: {cycle}')
    coverage_rows=[dict(zip(('profile','faction','category','status','count'),(*k,v))) for k,v in sorted(coverage.items())]
    return errors,{'record_counts':dict(sorted(Counter(r['kind'] for r in records.values()).items())),'entity_coverage':coverage_rows,'unknown_acquisition_chains':sorted(pending)}

def release_blockers(row,records):
    reasons=[]
    if row['disposition']!='verified_included' or row['classification']!='active':reasons.append('unaccepted identity or availability')
    if row['blockers']:reasons.append('open research blockers')
    if row['reviewer'] is None:reasons.append('unreviewed source identity')
    if records.get(row['profile_id'],{}).get('lock_state')!='locked':reasons.append('unlocked source profile')
    if not row['fixture_ids']:reasons.append('missing acceptance fixture')
    if any('group_unknown' in d or d.get('status') in ('unknown','conflicting') for d in walk(row['facts'])):reasons.append('unresolved source domain')
    if any(records.get(i,{}).get('status')!='resolved' for i in row['conflict_ids']):reasons.append('open source conflict')
    if not row['adaptation_ids'] or any(records.get(i,{}).get('approval')!='accepted' for i in row['adaptation_ids']):reasons.append('unapproved Fusion mapping')
    if any(not capability_supported(records.get(i,{})) for i in row['capability_ids']):reasons.append('unsupported capability')
    if row['visible'] is None or row['visible'] and not row['asset_ids'] or any(not asset_cleared(records.get(i,{})) for i in row['asset_ids']):reasons.append('open presentation rights')
    return reasons

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('catalogue',type=Path);args=p.parse_args();err,report=validate(json.loads(args.catalogue.read_text()));print(json.dumps({'errors':err,'coverage':report},indent=2));raise SystemExit(bool(err))
