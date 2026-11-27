"""Derive named RA1 demo scenario relationships using the published engine source.
Usage: python ra-mission-reader.py EA-source.zip ra95demo.zip ra95-demo-facts.json output.json.gz
"""
import collections
import configparser
import gzip
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

RA_COMMIT="0dc09bb1d6188d1ec79ab4765b22a48b75ffee32"
def digest(b):return hashlib.sha256(b).hexdigest()
def enum(source,kind,prefix):
    block=source.split("enum "+kind+" {",1)[1].split("}",1)[0]
    offset=source[:source.index(block)].count("\n")+1
    values={}; value=-1
    for i,line in enumerate(block.splitlines()):
        m=re.match(r"\s*("+prefix+r"[A-Z_0-9]+)\s*(?:=\s*(-?\d+))?\s*,?",line)
        if m:
            value=int(m[2]) if m[2] is not None else value+1
            if not m[1].endswith(("_FIRST","_COUNT")):values[value]=(m[1],offset+i)
    return values
def needs(source,name):
    start=source.index("NeedType "+name+"(")
    body=source[start:source.index("\n}",start)]
    body=re.sub(r"/\*[\s\S]*?\*/|//[^\n]*","",body)
    groups=collections.defaultdict(list); group=[]
    for line in body.splitlines():
        m=re.search(r'case\s+(\w+)\s*:',line);ret=re.search(r'return\((NEED_\w+)\)',line)
        if m:group.append(m[1])
        if ret:
            for n in group:groups[n]=ret[1]
            group=[]
    return groups
def parse(ea,demo,baseline):
    z=zipfile.ZipFile(ea);prefix=z.namelist()[0];assert RA_COMMIT in prefix
    read=lambda n:z.read(prefix+"CODE/"+n).decode("latin1")
    enums={}; need={}
    for k,f,e,p in [('event','TEVENT.H','TEventType','TEVENT_'),('action','TACTION.H','TActionType','TACTION_'),('mission','TEAMTYPE.H','TeamMissionType','TMISSION_'),('house','DEFINES.H','HousesType','HOUSE_'),('link','TRIGTYPE.H','MultiStyleType','MULTI_')]:
        enums[k]=enum(read(f),e,p)
    for k,f,n in [('event','TEVENT.CPP','Event_Needs'),('action','TACTION.CPP','Action_Needs'),('mission','TEAMTYPE.CPP','TeamMission_Needs')]:need[k]=needs(read(f),n)
    mi=zipfile.ZipFile(demo).read('ra95demo/INSTALL/MAIN.MIX');assert digest(mi)==baseline['member_sha256']['MAIN.MIX']
    out={"demo_main_mix_sha256":digest(mi),"ea_source_pin":RA_COMMIT,"enums_with_header_line":enums,"missions":[]}
    for sample in baseline['missions']:
        cfg=configparser.ConfigParser(interpolation=None,strict=True);cfg.optionxform=str
        low=sample["basic_offset"];hi=sample["exclusive_end"]
        cfg.read_string(mi[low:hi].decode('cp1252'));assert cfg['Basic']['NewINIFormat']=='3'
        trigger_names=list(cfg['Trigs']);team_names=list(cfg['TeamTypes']);waypoints={int(k):int(v) for k,v in cfg['Waypoints'].items()}
        def lookup(n,options):
            if n<0:return None
            if n>=len(options):return f"unresolved ordinal {n}"
            return options[n]
        def record(kind,op,data,team=-1,trig=-1):
            label=enums[kind][op][0];required=need[kind].get(label,'NEED_NONE')
            row={"opcode":op,"name":label,"operand_type":required,"data":data}
            if kind!='mission':
                row["team_index"]=team
                if kind=="action":row["trigger_index"]=trig
            if required=='NEED_TEAM':row['team_reference']=lookup(team,team_names)
            elif required=='NEED_TRIGGER':row['trigger_reference']=lookup(trig,trigger_names)
            elif required=='NEED_WAYPOINT':row['waypoint_cell']=waypoints.get(data)
            elif required=='NEED_HOUSE':
                signed=(data+128)%256-128
                row['house_low_byte_reading']=enums['house'].get(signed,('unresolved',))[0]
            return row
        def loc(section,key):
            section_pos=mi.index(('['+section+']').encode(),low,hi)
            return mi.index(('\r\n'+key+'=').encode(),section_pos,hi)+2
        teams=[]
        for index,(key,value) in enumerate(cfg['TeamTypes'].items()):
            parts=value.split(',');house,flags,prio,initial,maximum,origin,trig,cl=map(int,parts[:8]);pos=8
            comp=[]
            for word in parts[pos:pos+cl]:
                obj,n=word.split(':');comp.append({"object_id":obj,"count":int(n)})
            pos+=cl;orders=int(parts[pos]);pos+=1;assert pos+orders==len(parts)
            missions=[record('mission',*(int(x) for x in item.split(':'))) for item in parts[pos:]]
            teams.append({"index":index,"id":key,"mix_offset":loc('TeamTypes',key),"house":enums['house'][house][0],"bit_flags":flags,"flags":[s for bit,s in enumerate(['roundabout','suicide','autocreate','prebuilt','reinforcable']) if flags&(1<<bit)],"recruit_priority":prio,"initial_count":initial,"maximum_allowed":maximum,"origin_waypoint":origin,"origin_cell":waypoints.get(origin),"attached_trigger_index":trig,"attached_trigger":lookup(trig,trigger_names),"composition":comp,"orders":missions})
        attachments=collections.defaultdict(lambda:collections.defaultdict(list))
        for k,v in cfg['CellTriggers'].items():attachments[v.lower()]['cell'].append(int(k))
        for section,index_at in [('STRUCTURES',5),('UNITS',6),('INFANTRY',7),('SHIPS',6),('AIRCRAFT',6),('TERRAIN',1)]:
            if section not in cfg:continue
            for k,v in cfg[section].items():
                p=v.split(',')
                if len(p)<=index_at or p[index_at].lower() in ('none','<none>',''):continue
                attachments[p[index_at].lower()][section].append({'key':k,'house':p[0],'type':p[1],'cell':p[3]} if len(p)>3 else {'key':k,'type':p[0]})
        triggers=[]
        for index,(key,value) in enumerate(cfg['Trigs'].items()):
            p=list(map(int,value.split(',')));assert len(p)==18
            mode,house,eventlink,actionlink=p[:4];ev1,ti1,v1,ev2,ti2,v2,a1,t1,tr1,d1,a2,t2,tr2,d2=p[4:]
            at=attachments[key.lower()]
            triggers.append({"index":index,"id":key,"mix_offset":loc('Trigs',key),"persistence":['VOLATILE','SEMIPERSISTANT','PERSISTANT'][mode],"trigger_house":enums['house'][house][0],"event_control":enums['link'][eventlink][0],"action_control":enums['link'][actionlink][0],"events":[record('event',ev1,v1,ti1),record('event',ev2,v2,ti2)],"actions":[record('action',a1,d1,t1,tr1),record('action',a2,d2,t2,tr2)],"attachment_counts":{k:len(v) for k,v in at.items()},"attachment_samples":{k:v[:4] for k,v in at.items()}})
        out["missions"].append({"brief_id":cfg['Basic']['Brief'],"player_house":cfg['Basic']['Player'],"theater":cfg['Map']['Theater'],"triggers":triggers,"teams":teams,"cell_attached_entries":len(cfg['CellTriggers']),"distinct_waypoint_keys":len(waypoints),"unmatched_attachment_names":sorted(set(attachments)-{n.lower() for n in trigger_names})})
    return out

def verify(out):
    m={v['brief_id']:v for v in out['missions']}
    by=lambda k,n:{v['id']:v for v in m[k][n]}
    a=by('ALLY2','triggers');team=by('ALLY2','teams')
    assert a['win']['events'][0]['team_reference']=='trks' and a['win']['actions'][0]['name']=='TACTION_WIN'
    assert team['trks']['composition']==[{'object_id':'TRUK','count':3}] and team['trks']['attached_trigger']=='los2'
    e=by('ALLY5','triggers')['evac']
    assert e['persistence']=='SEMIPERSISTANT' and e['attachment_counts']=={'STRUCTURES':4}
    assert [x['name'] for x in e['actions']]==['TACTION_REINFORCEMENTS','TACTION_TEXT_TRIGGER'] and e['actions'][0]['team_reference']=='evac'
    s=by('SOVIET2','triggers')
    assert [x['trigger_reference'] for x in s['Brdg']['actions']]==['det1','det2'] and s['los1']['actions'][0]['name']=='TACTION_LOSE'
    assert len(s['det1']['attachment_samples']['cell'])==3 and len(s['det2']['attachment_samples']['cell'])==3
    for row in m.values():
        assert len({x['id'] for x in row['triggers']})==len(row['triggers'])
        assert len({x['id'] for x in row['teams']})==len(row['teams'])
    return 'three title-specific graph checks plus identity and declared list-length checks passed'

if __name__=='__main__':
    ez,dz,baseline,out=map(Path,sys.argv[1:])
    result=parse(ez,dz,json.loads(baseline.read_text()));result['source_graph_verification']=verify(result)
    out.write_bytes(gzip.compress((json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode(),mtime=0))
    print([(s["brief_id"],len(s["triggers"]),len(s["teams"]),s["unmatched_attachment_names"]) for s in result['missions']])
