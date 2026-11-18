"""Write explicit research-only examples; each historical relation cites a source locator."""
from pathlib import Path
from hashlib import sha256
import json
ROOT=Path(__file__).resolve().parents[1]
def ref(url,revision,locator):return {'url':url,'revision':revision,'locator':locator,'method':'source_declaration'}
tdrev='e0d372dc582c053a699114942b984dad0457f9b3';srev='3aad8e412961ab543192ae70f8503dc8e178e095'
evtd=ref('https://github.com/electronicarts/CnC_Tiberian_Dawn/blob/'+tdrev+'/IDATA.CPP#L106-L140',tdrev,'E1 constructor, lines 106–140')
evra=ref('https://github.com/electronicarts/CnC_Modding_Support/blob/'+srev+'/Red%20Alert%203/Xml/Japan/Units/JapanAntiAirVehicleTech1.xml#L635-L659',srev,'lines 33–54, 70–76 and 635–659, model condition and locomotor transition')
BLOCK={'owner':'edition-evidence specialist','task':'RES-028','action':'Verify an exact shipped build, mode and permitted acquisition or compare an independent retail observation.'}
def common(kind,i,p,e):return {'schema_version':1,'kind':kind,'id':i,'profile_id':p,'owner':'research specialist','reviewer':None,'blockers':[BLOCK],'evidence':[e]}
def unknown(p):return {'value':None,'unit':'unspecified','status':'unknown','profile_id':p,'evidence':[],'resolution':BLOCK,'tolerance':None}
def profile(p,e,title,revision):
    return {**common('source_profile',p,p,e),'title':title,'edition':'public-source','platform':'pc','region':'undetermined','language':'undetermined','inherits':None,'data_hashes':[],'executable_hashes':[],'repository':e['url'].split('/blob/')[0],'revision':revision,'modification':'source_snapshot','authoritative_use':['discovery'],'observation_environment':unknown(p),'rights_id':p+'.rights','conflicts':[],'lock_state':'provisional','locked_at':None}
def rights(p,e):return {**common('asset_provenance',p+'.rights',p,e),'asset_class':'research_reference','creator':'Electronic Arts public source archive','origin':e['url'],'rights_basis':'Cited developer source used for factual comparison','distribution':'reference_only','derivatives':[],'artifact_sha256':None,'review_evidence':[]}
def entity(p,e,title,n,id_,form):
    return {**common('entity',id_,p,e),'identity':{'source_title':title,'edition':'public-source','platform':'pc','source_faction':'shared' if p=='profile.td' else 'Japan','namespace':'InfantryTypeClass' if p=='profile.td' else 'GameObject','source_object_id':n,'form_id':form},'display_names':{},'category':'unit' if form=='base' else 'form','source_object_ids':[n],'classification':'declared' if form=='base' else 'referenced','disposition':'candidate','faction_ids':[],'country_general_ids':[],'class_ids':[],'mode_ids':[],'availability_rules':[],'relations':[],'acquisition':'unknown','facts':{k:{'group_unknown':BLOCK} for k in ('availability','physical','combat','economy','presentation')},'observation_ids':[],'conflict_ids':[],'adaptation_ids':[],'asset_ids':[],'capability_ids':[],'fixture_ids':[],'visual_family':None,'visible':None,'automatic_release':False}
def run():
    p='profile.td';q='profile.ra3'
    a=entity(p,evtd,'cnc-td','E1','entity.td.e1','base');g=entity(q,evra,'cnc-ra3','JapanAntiAirVehicleTech1','entity.ra3.jaav.walker','walker');h=entity(q,evra,'cnc-ra3','JapanAntiAirVehicleTech1','entity.ra3.jaav.air','supersonic')
    for fr,to in [(g,h),(h,g)]:fr['relations']=[{'role':'form','target_id':to['id'],'evidence':[evra],'carry_state':['source object identity unchanged; health and ownership transfer require observation']}]
    doc={'schema_version':1,'context':'research','records':[profile(p,evtd,'Tiberian Dawn',tdrev),rights(p,evtd),a,profile(q,evra,'Red Alert 3',srev),rights(q,evra),g,h]}
    (ROOT/'templates'/'nonrelease-examples.json').write_text(json.dumps(doc,indent=2)+'\n')
if __name__=='__main__':run()
