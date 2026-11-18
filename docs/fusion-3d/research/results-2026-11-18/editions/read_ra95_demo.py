"""Produce factual measurements for the Westwood 1997 Windows demo archive.

Run with a legally obtained ra95demo.zip and an output directory. Source offsets
below are signed to the two named MIX files. Refuse a different edition.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import zipfile

PREFIX = 'ra95demo/INSTALL/'
MEMBERS = {'REDALERT.MIX':'5471b50ab05ce449c08f4d81a79377223b5ed945efabe8afcdb8dd86798aa445',
           'MAIN.MIX':'d54336e1b721a05a0f787a15a4cf46db4d39d900f0aeb9677ead37fbdfcd4201',
           'RA95.EXE':'52d282523555cba978a1d90ec739abb5035fdb32e5bc1f63e8225914599f2580'}
def sha(b):return hashlib.sha256(b).hexdigest()

def sections(b, offset):
    current=None; output=[]
    for line in b.splitlines(keepends=True):
        clean=line.decode('cp1252',errors='replace').split(';')[0].strip()
        match=re.fullmatch(r'\[([^\]]+)\]',clean)
        if match:
            current={'id':match[1],'offset':offset,'facts':{}}; output.append(current)
        elif current and '=' in clean:
            k,v=clean.split('=',1);current['facts'][k.strip()]=v.strip()
        offset+=len(line)
    return output

def run(archive, output):
    raw=Path(archive).read_bytes(); output.mkdir(exist_ok=True,parents=True)
    with zipfile.ZipFile(archive) as z:
        f={k:z.read(PREFIX+k) for k in MEMBERS}
        if any(sha(f[k])!=h for k,h in MEMBERS.items()):raise ValueError('Unexpected edition')
        r=f['REDALERT.MIX'];m=f['MAIN.MIX']; start=r.index(b'[General]\r\n');end=r.index(b'Rate=.1\r\n',r.index(b'[Missile]\r\n',start))+len(b'Rate=.1\r\n')
        rules=sections(r[start:end],start)
        limit={'Strength','Armor','Owner','Prerequisite','TechLevel','Primary','Secondary','Power','Cost','Speed','Sight','Passengers','Ammo','Points','Image','Damage','ROF','Range','Projectile','Warhead','Burst','Spread','Verses','Tracked','Foot','Track','Wheel','Float','Buildable','Producer','WaterBound','Invisible','Repairable','Crewed','Turret','DoubleOwned','Adjacent','Capturable','Bib','Storage','Crushable','Cloakable','NoMovingFire','GuardRange','Rate','Reload','Acceleration','ROT','Explodes','Unsellable','Wall','IsElectric','Organic','HarvestRate','GrowthRate','BuildSpeed','RefundPercent','RepairPercent','RepairRate','RepairStep','OreGrows','OreSpreads','BridgeStrength','PowerSurplus','AllyBuildRadius','BridgeRepairHut','Engineer','Infiltrate','Theater','StrengthMult','AIBuildThis'}
        # Keep scalars/identifiers selected for source comparison, never include author comments or briefings.
        out=[]
        for a in rules:
            facts={k:v for k,v in a['facts'].items() if k in limit}
            if facts:out.append({'section':a['id'],'redalert_mix_byte':a['offset'],'facts':facts})
        bounds=[m.index(b'[AI]\r\nAutocreateTime=9'),m.index(b'[General]\r\nParaTech=6'),m.index(b'[HBOX]\r\nPower=-10',m.index(b'5=to rescue her.')),m.index(b'\x00',m.index(b'1=Tomorrow, the attack'))]
        missions=[]
        for lo,hi in zip(bounds,bounds[1:]):
            sec=sections(m[lo:hi],lo);base=next(i for i,a in enumerate(sec) if a['id']=='Basic')
            idx={i['id'].lower():i for i in sec[base:]}
            keep=['Name','Player','Brief','NewINIFormat'];grids=['Theater','X','Y','Width','Height']
            counts={}
            for key in ('units','infantry','structures','ships','aircraft'):
                cnt=Counter()
                for v in idx.get(key,{}).get('facts',{}).values():
                    parts=v.split(',')
                    if len(parts)>=2:cnt[parts[0]+':'+parts[1]]+=1
                if cnt:counts[key]=dict(sorted(cnt.items()))
            missions.append({'basic':{k:idx['basic']['facts'][k] for k in keep if k in idx['basic']['facts']},'map':{k:idx['map']['facts'][k] for k in grids if k in idx['map']['facts']},'scenario_start':lo,'basic_offset':sec[base]['offset'],'exclusive_end':hi,'span_sha256':sha(m[lo:hi]),'local_overrides':sec[:base],'initial_placements_by_house_and_ini_id':counts,'script_team_definitions':len(idx.get('teamtypes',{}).get('facts',{})),'trigger_definitions':len(idx.get('trigs',{}).get('facts',{}))})
        data={'profile_id':'ra1.windows.en.demo.1997-02-03','archive_url':'https://www.boxedwine.org/wp-content/uploads/2018/03/ra95demo.zip','archive_sha256':sha(raw),'member_sha256':{**MEMBERS,'README.WRI':sha(z.read(PREFIX+'README.WRI'))},'source_label':'Westwood Red Alert Demo Windows 95 English. The enclosed readme is dated 3 February 1997.','source_fields':'verbatim data identifiers and factual values, in source units; absent key means not extracted or inherited','global_section_count':len(rules),'global_sections_with_selected_fields':out,'missions':missions}
        (output/'ra95-demo-facts.json').write_text(json.dumps(data,indent=1)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('output',type=Path);a=p.parse_args();run(a.archive,a.output)
