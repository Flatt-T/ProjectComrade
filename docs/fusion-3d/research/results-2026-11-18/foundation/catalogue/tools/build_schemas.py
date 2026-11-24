"""Maintain catalog JSON Schemas from a shared set of normative definitions."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
PREFIX='urn:fusion:research:catalogue:v1:'
DRAFT='https://json-schema.org/draft/2020-12/schema'
KINDS='source_profile faction entity capability terrain_feature map_theme observation conflict asset_provenance adaptation completion'.split()
STAGES='SPEC SIM MODEL RIG ANIM FX_AUDIO_UI INTEGRATE REVIEW'.split()
IDENTITY='source_title edition platform source_faction namespace source_object_id form_id'.split()
S={'type':'string','minLength':1}
ID={'type':'string','pattern':'^[a-z][a-z0-9._-]*$'}
HASH={'type':'string','pattern':'^[0-9a-f]{64}$'}
def arr(t,minimum=0):return {'type':'array','items':t,'uniqueItems':True,'minItems':minimum}
def obj(props,required=None):return {'type':'object','additionalProperties':False,'properties':props,'required':list(props) if required is None else required}
def enum(*v):return {'enum':list(v)}
def nullable(t):return {'anyOf':[t,{'type':'null'}]}
def r(k):return {'$ref':PREFIX+'common#/$defs/'+k}
def export(name,data): (ROOT/'schemas'/(name+'.schema.json')).write_text(json.dumps({'$schema':DRAFT,'$id':PREFIX+name,**data},indent=2)+'\n')
EVID=obj({'url':{'type':'string','pattern':'^(https://|repo:|fixture:)'},'revision':S,'locator':S,'method':enum('publisher_manual','source_declaration','shipped_observation','community_comparison','authored','test_fixture')})
datum=obj({'value':{},'unit':S,'status':enum('unknown','conflicting','source_reported','observed','authored','not_applicable'),'profile_id':ID,'evidence':arr(r('evidence')),'resolution':nullable(obj({'owner':S,'task':S,'action':S})),'tolerance':nullable({'type':'number','minimum':0})})
datum['allOf']=[{'if':{'properties':{'status':enum('unknown','conflicting')}},'then':{'properties':{'value':{'type':'null'},'resolution':{'type':'object'}}},'else':{'properties':{'evidence':{'minItems':1}}}},{'if':{'properties':{'status':enum('source_reported','observed','authored')}},'then':{'properties':{'value':{'not':{'type':'null'}}}}}]
GROUPS={
'availability':'producer_ids required_all required_any forbidden_if country_exclusions required_upgrades tech_level build_limit unique_scope queue_kind build_cost payment_policy build_time refund_policy power_policy exit_policy rally_policy build_placement capture_producer_effect sell_producer_effect transfer_producer_effect',
'physical':'footprint collision_shape selection_shape navigation_classes terrain_costs slope_limit water_depth_range bridge_clearance speed acceleration turn_rate hull_facing_policy turret_facing_policy firing_on_move crush_tier crushable_by altitude_bands transition_capabilities transport_slots passenger_limits garrison_policy',
'combat':'health armour_profile directional_modifiers weapon_slots target_filters range minimum_range acquisition line_of_fire projectile_contract damage splash warmup burst cooldown ammo rearm veterancy status_responses death_policy wreck_policy capture_policy mind_control_policy infiltration_policy repair_policy visibility_policy',
'economy':'resource_type harvest_targets harvest_rate cargo_capacity return_policy unload_points unload_duration depletion_regrowth secondary_income power_produced power_consumed abilities support_powers ability_costs ability_targets ability_cooldowns ability_interruptions',
'presentation':'model_asset_id model_source_and_licence textures material_style team_colour_mask silhouette_reference scale_reference skeleton_or_rigid_rig animation_state_graph animation_clips sockets VFX_events SFX_events voice_events UI_icon selection_feedback damage_visual_states destruction_visual_states LOD_contract performance_budget'}
def block(fields):
    return {'oneOf':[obj({'group_unknown':r('unresolved')}),obj({f:r('datum') for f in fields.split()})]}
rel=obj({'role':enum('alias','inherits','replaces','form','child','spawn','producer','required_all','required_any','forbidden','upgrade','weapon','ability','terrain_layer','capability','visual_family'),'target_id':ID,'evidence':arr(r('evidence'),1),'carry_state':arr(S)})
common={'$defs':{'evidence':EVID,'datum':datum,'unresolved':obj({'owner':S,'task':S,'action':S}),'identity':obj({k:S for k in IDENTITY}),'relation':rel,'stage':enum(*STAGES)}}
export('common',common)
BASE={'schema_version':{'const':1},'kind':{},'id':ID,'profile_id':ID,'evidence':arr(r('evidence'),1),'owner':S,'reviewer':nullable(S),'blockers':arr(r('unresolved'))}
state=enum('unclassified','declared','referenced','active','unused','cancelled')
status=enum('candidate','verified_included','verified_inactive','accepted_alias','approved_exclusion','unresolved')
av=obj({'faction_id':ID,'mode':S,'edition':S,'decision':enum('allowed','excluded','unknown'),'evidence':arr(r('evidence'),1)})
external={'type':'object','additionalProperties':S}
props={
'source_profile':{'title':S,'edition':S,'platform':S,'region':S,'language':S,'inherits':nullable(ID),'data_hashes':arr(HASH),'executable_hashes':arr(HASH),'repository':nullable(S),'revision':S,'modification':enum('unmodified','official_patch','community','unknown','source_snapshot','test_fixture'),'authoritative_use':arr(enum('roster','rules','presentation','interface','history','discovery','synthetic'),1),'observation_environment':r('datum'),'rights_id':ID,'conflicts':arr(ID),'lock_state':enum('provisional','locked'),'locked_at':nullable(S)},
'faction':{'parent_id':nullable(ID),'display_names':external,'mode_ids':arr(S),'country_general_ids':arr(ID),'entity_ids':arr(ID),'starting_entity_ids':arr(ID),'economy_production_graph':r('datum'),'counter_roles':r('datum'),'terrain_constraints':r('datum'),'ai_policy':r('datum'),'exclusion_fixtures':arr(S)},
'entity':{'identity':r('identity'),'display_names':external,'category':enum('unit','building','form','variant','campaign','neutral','prop','resource','projectile','wreck','support_power','upgrade','ability','helper','unclassified'),'source_object_ids':arr(S,1),'classification':state,'disposition':status,'faction_ids':arr(ID),'country_general_ids':arr(ID),'class_ids':arr(ID),'mode_ids':arr(S),'availability_rules':arr(av),'relations':arr(r('relation')),'acquisition':enum('unknown','starting','produced','scripted','spawned','transformation','noninteractive'),'facts':obj({k:block(v) for k,v in GROUPS.items()}),'observation_ids':arr(ID),'conflict_ids':arr(ID),'adaptation_ids':arr(ID),'asset_ids':arr(ID),'capability_ids':arr(ID),'fixture_ids':arr(S),'visual_family':nullable(S),'visible':nullable({'type':'boolean'}),'automatic_release':{'const':False}},
'capability':{'version':S,'domain':enum('gameplay','environment','mode','objective','presentation'),'state_contract':r('datum'),'commands':r('datum'),'tick_order':r('datum'),'world_policy':r('datum'),'dependency_ids':arr(ID),'implementation_task':nullable(S),'review_task':nullable(S),'support_status':enum('unknown','required','implemented','accepted'),'fixture_ids':arr(S)},
'terrain_feature':{'theatre_id':S,'biome_id':nullable(S),'source_families':arr(S),'navigation':r('datum'),'buildability':r('datum'),'height_water':r('datum'),'resource_hazard':r('datum'),'destruction':r('datum'),'visibility':r('datum'),'state_transitions':r('datum'),'map_generation':r('datum'),'lod_budget':r('datum'),'asset_ids':arr(ID),'capability_ids':arr(ID)},
'map_theme':{'biome_id':S,'theatre_ids':arr(S,1),'feature_ids':arr(ID),'spawn_fairness':r('datum'),'harvesting':r('datum'),'routes':r('datum'),'height_visibility':r('datum'),'civilian_cover':r('datum'),'path_recovery':r('datum'),'bounds':r('datum'),'objective':r('datum'),'fixture_ids':arr(S)},
'observation':{'question':S,'subject_ids':arr(ID,1),'setup':S,'map_hash':nullable(HASH),'seed':nullable({'type':'integer'}),'commands':arr(S),'expectation':r('datum'),'result':r('datum'),'sample_count':{'type':'integer','minimum':0},'interpretation':enum('source_inference','direct_playback','community_hypothesis','fusion_choice','fixture'),'independent':{'type':'boolean'}},
'conflict':{'subject_ids':arr(ID,1),'claims':arr(r('datum'),2),'impact':S,'decision':nullable(S),'status':enum('open','resolved'),'resolution_task':S},
'asset_provenance':{'asset_class':enum('model','texture','rig','animation','vfx','voice','music','ui','code','research_reference'),'creator':S,'origin':S,'rights_basis':S,'distribution':enum('unknown','reference_only','original_approved','licensed_approved','blocked'),'derivatives':arr(ID),'artifact_sha256':nullable(HASH),'review_evidence':arr(r('evidence'))},
'adaptation':{'subject_ids':arr(ID,1),'target_profile':S,'source_semantics':r('datum'),'fusion_semantics':r('datum'),'disposition':enum('direct','translated','shared','restricted','excluded'),'rationale':S,'approval':enum('proposed','accepted','rejected'),'fixture_ids':arr(S)},
'completion':{'subject_id':ID,'stage_records':arr(obj({'stage':r('stage'),'state':enum('pending','blocked','accepted','shared','not_applicable'),'artifact_sha256':nullable(HASH),'evidence':arr(r('evidence')),'reviewer':nullable(S),'reason':nullable(S)})),'release_state':enum('research','in_progress','blocked','release_ready'),'history':{'type':'array','items':enum('research','in_progress','blocked','release_ready'),'minItems':1},'author':S}}
for kind in KINDS:
    schema=obj({**BASE,**props[kind]});schema['properties']['kind']={'const':kind};export(kind,schema)
export('catalogue',obj({'schema_version':{'const':1},'context':enum('research','synthetic_test'),'records':arr({'oneOf':[{'$ref':PREFIX+k} for k in KINDS]})}))
leaf=obj({'task_key':S,'row_uid':{'type':'string','pattern':'^[a-f0-9]{16}$'},'row_sha256':HASH,'stage':r('stage'),'part':{'type':'integer','minimum':1,'maximum':999},'entity_id':ID,'dependencies':arr(S),'specialist':S,'profile':ID,'target_profile':S,'evidence':arr(r('evidence'),1),'context':arr(S,1),'permitted_paths':arr(S,1),'outputs':arr(S,1),'procedure':arr(S,1),'acceptance':arr(S,1),'non_goals':arr(S,1),'blocked_by':arr(S),'handoff':S,'publishable':{'const':False}})
export('fanout_projection',obj({'schema_version':{'const':1},'mode':{'const':'offline_projection'},'leaves':arr(leaf),'withheld':arr(obj({'entity_id':ID,'reasons':arr(S,1)}))}))

file_hash=obj({'path':S,'sha256':HASH})
stage_input=obj({'permitted_paths':arr(S,1),'output_paths':arr(S,1),'acceptance_fixtures':arr(S,1),'required_contracts':arr(S),'approved_contracts':arr(S),'shared_artifact':nullable(obj({'source_task':S,'artifact_sha256':HASH,'reviewer':S,'variant_fixture':S}))})
export('fanout_input',obj({'schema_version':{'const':1},'catalogue_sha256':HASH,'target_profile':S,'schema_revision':S,'capability_registry':file_hash,'rights_ledger':file_hash,'existing_issue_map':file_hash,'entries':arr(obj({'entity_id':ID,'row_sha256':HASH,'stage_specs':obj({stage:stage_input for stage in STAGES})}))}))
