"""Report semantic animation facts from the two identified EA source blobs.

Usage: python extract_classic_motion.py TD_IDATA.CPP RA_IDATA.CPP output.json
Requires Python 3. No source code or source sprite resources are copied to output.
"""
import sys, re, hashlib, json
from pathlib import Path
PINS = (
 ("TD","electronicarts/CnC_Tiberian_Dawn","e0d372dc582c053a699114942b984dad0457f9b3","IDATA.CPP","538bfb271ff686d8a0c879e89d3567a3f30f47ce"),
 ("RA1","electronicarts/CnC_Red_Alert","0dc09bb1d6188d1ec79ab4765b22a48b75ffee32","CODE/IDATA.CPP","a0a29cc2b8a761890d24d1b94f331351e7620132"),
)
def parse(source,pin):
    game,repo,commit,path,blob=pin
    raw=source.read_bytes()
    def git(x):
        return hashlib.sha1(b'blob '+str(len(x)).encode()+b'\0'+x).hexdigest()
    # The connector may normalise CRLF or append a terminal newline.
    candidates={raw,raw.rstrip(b'\n')+b'\n',raw.rstrip(b'\n'),raw.replace(b'\n',b'\r\n'), (raw.rstrip(b'\n')+b'\n').replace(b'\n',b'\r\n'),raw.rstrip(b'\n').replace(b'\n',b'\r\n')}
    if blob not in {git(x) for x in candidates}: raise ValueError(f'{game}: file differs from pinned Git blob')
    src=raw.decode('latin1').replace('\r','')
    base=f'https://github.com/{repo}/blob/{commit}/{path}'
    def link(offset): return base+'#L'+str(src.count('\n',0,offset)+1)
    families={}
    for m in re.finditer(r'^(?:static DoInfoStruct|int)\s+(\w+)\s*\[DO_COUNT\](?:\[3\])?\s*=\s*\{(.*?)^\};',src,re.M|re.S):
        name,body=m.groups()
        rows=[]
        for line in body.splitlines():
            values,sep,note=line.partition('//')
            if not sep:continue
            action=re.search(r'\bDO_([A-Z_0-9]+)',note)
            if not action:continue
            parts=[s.strip() for s in values.strip().strip('{}, ').split(',')]
            if len(parts)!=3:raise ValueError(line)
            frame_count=int(parts[1])
            stride=int(parts[2])
            marked_na=bool(re.search(r'\bN/?A\b',note))
            rows.append({'action':action[1].lower(),'source_frame_count':frame_count,'per_direction_stride':stride,'source_marks_not_applicable':marked_na,'interpretation':'comment_marks_na' if marked_na else ('no_frames' if frame_count==0 else ('single_pose_or_shared_placeholder' if frame_count==1 else 'multiple_frame_span'))})
        families[name]={'source':link(m.start()),'actions':rows}
    entries=[]
    for m in re.finditer(r'static\s+InfantryTypeClass\s+const\s+(\w+)\s*\((.*?)^\);',src,re.M|re.S):
        symbol,body=m.groups();ini=re.search(r'"([^"]+)"',body)
        used=[k for k in families if re.search(r'\b'+k+r'\b',body)]
        if len(used)!=1 or not ini:raise ValueError((symbol,used))
        markers=[int(k) for k in re.findall(r'^\s*(-?\d+)\s*,?\s*//\s*Frame of projectile launch',body,re.M|re.I)]
        crawl=re.search(r'^\s*(true|false)\s*,\s*//\s*Has crawling animation frames',body,re.M|re.I)
        entries.append({'ini_id':ini[1],'constructor':symbol,'motion_family':used[0],'crawling_flag':crawl[1].lower()=='true' if crawl else None,'constructor_standing_prone_launch_markers':markers,'source':link(m.start())})
    return {'game':game,'commit':commit,'file':path,'blob_sha1':blob,'motion_families':families,'constructors':entries}
def main():
    output={'status':'Verified declarations in pinned recovered source. Retail playback speed, build guards, ability reachability and actual shipped assets require independent build observations.','field_semantics':{'source_frame_count':'Number of sprite frames declared for a sequence. This is neither elapsed milliseconds nor a suggested keyframe count for a new model.','per_direction_stride':'Index increment between sprite directions. Zero means the index does not advance with facing.','constructor_standing_prone_launch_markers':'Compiler parameter values for standing/prone projectile release. Meaningful only for an applicable armed action. One-frame or zero-frame declarations cannot prove any ability.','source_marks_not_applicable':'Based on inline NA/N/A comments. Some unsupported states still have nonzero placeholder indices.'},'games':[parse(Path(file),pin) for file,pin in zip(sys.argv[1:3],PINS)]}
    assert all(g['constructors'] and g['motion_families'] for g in output['games'])
    Path(sys.argv[3]).write_text(json.dumps(output,indent=2)+'\n')
    for g in output['games']:
        print(g['game'],len(g['motion_families']),len(g['constructors']),sum(len(f['actions']) for f in g['motion_families'].values()))
if __name__=='__main__':main()
