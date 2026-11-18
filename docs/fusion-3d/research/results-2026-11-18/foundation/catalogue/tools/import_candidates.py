"""Import the two historical discovery inventories without creating entities or changing source status."""
import argparse,gzip,json
from pathlib import Path
from hashlib import sha256
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
def run(inputs,out):
    rows=[];summ=[];seen=set()
    for filename,field,typ in [('primary_definition_candidates.json','candidates','definition_candidate'),('later_era_primary_path_inventory.json','files','path_candidate')]:
        p=inputs/filename;b=p.read_bytes();src=json.loads(b);raw_rows=src[field]
        metadata={k:v for k,v in src.items() if k!=field}
        for index,r in enumerate(raw_rows):
            raw=json.dumps(r,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
            key=sha256(raw).hexdigest()
            if key in seen:raise ValueError('Duplicate imported raw observation '+key)
            seen.add(key);rows.append({'candidate_sha256':key,'input':filename,'source_index':index,'kind':typ,'source_status':r['evidence_status'],'disposition':'unverified_intake','native_record':r})
        summ.append({'input':filename,'file_sha256':sha256(b).hexdigest(),'rows':len(raw_rows),'original_metadata':metadata})
    encoded=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows).encode()
    out.mkdir(parents=True,exist_ok=True);dest=out/'candidate-intake.jsonl.gz'
    with dest.open('wb') as fw,gzip.GzipFile(filename='',mode='wb',fileobj=fw,mtime=0) as gz:gz.write(encoded)
    decoded=[json.loads(l) for l in gzip.decompress(dest.read_bytes()).splitlines()]
    assert decoded==rows
    for summary in summ:
        fn=summary['input'];orig=json.loads((inputs/fn).read_text());original_rows=orig.get('candidates',orig.get('files'));assert [r['native_record'] for r in decoded if r['input']==fn]==original_rows
    result={'imports':summ,'disposition_counts':dict(Counter(r['kind'] for r in rows)),'new_release_entities':0,'sha256_uncompressed':sha256(encoded).hexdigest(),'sha256_compressed':sha256(dest.read_bytes()).hexdigest(),'verified_lossless':True}
    (out/'candidate-intake-report.json').write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input_directory',type=Path);p.add_argument('--output',type=Path,default=ROOT);a=p.parse_args();run(a.input_directory,a.output)
