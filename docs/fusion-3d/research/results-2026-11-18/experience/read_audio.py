"""Read gameplay-facing audio declarations from a pinned EA XML archive."""
import argparse
from collections import Counter
from hashlib import sha1
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

COMMIT = '3aad8e412961ab543192ae70f8503dc8e178e095'
TITLES = ['Tiberium Wars','Kanes Wrath','Red Alert 3','Uprising','Tiberian Twilight']
SAMPLES = {'AlienAnnihilatorTripod.xml','GDIMammoth.xml','SteelTalonsBehemoth.xml',
           'AlienEradicatorHexapod.xml','JapanAntiInfantryVehicle.xml','AlliedFutureTank.xml',
           'JapanFortressShip.xml','GDIAircraftA.xml','GDICrawlerAStructure.xml'}
GLOBAL = {'Eva.xml','MiscEvaEvents.xml','AudioEventLimitGroup.xml','AudioMixerSnapshots.xml',
          'MusicScript_BlueZone.xml','MusicScript_RedZone.xml','MusicScript_UnknownZone.xml',
          'MusicScript_YellowZone.xml','MusicScript_CommonConditions.xml'}
GLOBAL_KINDS = {'Define','EvaEvent','SideSound','OtherEvaEventToBlock','AudioEventLimitGroup',
                'AudioMixerSnapshot','MusicScriptTrack','Timeout','MusicScriptCondition'}
ACTOR_KINDS = {'AudioEntry','AnimationSoundClientBehavior','Sound','AudioLoopUpgrade',
               'ModelConditionAudioLoopClientBehavior','ModelConditionSound','ModelConditionSoundSelectorClientBehavior'}
FIELDS = {'id','name','value','Priority','TimeBetweenEvents','ExpirationTime','CountAsJumpToLocation',
          'Side','Sound','AudioType','Animation','Frame','RequiredFlags','ForbiddenFlags','TrackTypeKey',
          'Level','Track','Condition','ConditionsAreLatch','Weight','Duration','Limit','SoundToPlay','SnapshotName'}
def extract(archive):
    rows, sources, counts = [], [], Counter()
    with ZipFile(archive) as z:
        for filename in sorted(z.namelist()):
            parts=filename.split('/')
            if len(parts)<5 or parts[0]!='CnC_Modding_Support-'+COMMIT or parts[1] not in TITLES or parts[2]!='Xml':
                continue
            global_file=parts[-1] in GLOBAL and parts[3] in {'Sounds','AudioMixer'}
            actor_file=parts[-1] in SAMPLES and 'Maps' not in parts and 'Obsolete' not in parts
            if not (global_file or actor_file):
                continue
            data=z.read(filename)
            root=etree.fromstring(data, etree.XMLParser(resolve_entities=False,no_network=True))
            path='/'.join(parts[1:])
            digest=sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            sources.append(dict(path=path,git_blob_sha=digest))
            for e in root.iter():
                if not isinstance(e.tag,str): continue
                kind=etree.QName(e).localname
                if kind not in (GLOBAL_KINDS if global_file else ACTOR_KINDS): continue
                attrs={k:v for k,v in e.attrib.items() if k in FIELDS}
                parent=next((a.get('id') for a in e.iterancestors() if a.get('id')),None)
                text=(e.text or '').strip()
                # Only retain short target identifier text on reference elements.
                ref=text if kind in {'OtherEvaEventToBlock','SideSound'} and text and len(text)<100 else None
                rows.append(dict(path=path,line=e.sourceline,owner=parent,kind=kind,fields=attrs,ref=ref))
                counts[(parts[1],kind)]+=1
    return {'source_commit':COMMIT, 'source_paths':sources,'counts':{g:{k:n for (t,k),n in sorted(counts.items()) if t==g} for g in TITLES},'facts':rows}
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive');parser.add_argument('out',type=Path)
    args=parser.parse_args()
    import gzip
    data=extract(args.archive)
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    args.out.write_bytes(gzip.compress(raw,mtime=0))
    print(len(data['source_paths']),len(data['facts']),json.dumps(data['counts']))
