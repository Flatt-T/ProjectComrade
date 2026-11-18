"""Validate a complete exported deposit using the Python standard library."""
import argparse
from collections import Counter
import gzip
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

def inspect_payload(name, data):
    if name.endswith(('.json','.gltf')):
        json.loads(data)
    elif name.endswith('.jsonl'):
        for line in data.splitlines():
            if line.strip():
                json.loads(line)
    elif name.endswith('.gz'):
        raw=gzip.decompress(data)
        inspect_payload(name[:-3],raw)
    elif name.endswith('.zip'):
        with ZipFile(io.BytesIO(data)) as archive:
            for item in archive.namelist():
                inspect_payload(item,archive.read(item))

def verify(root):
    manifest=json.loads((root/'manifest.json').read_text())
    rows=manifest['files']
    paths={r['path'] for r in rows}
    assert len(paths)==len(rows), 'duplicate paths'
    totals=Counter()
    for r in rows:
        path=r['path']
        assert not Path(path).is_absolute() and '..' not in Path(path).parts,path
        data=(root/path).read_bytes()
        assert len(data)==r['bytes'],path
        assert hashlib.sha256(data).hexdigest()==r['sha256'],path
        assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==r['git'],path
        inspect_payload(path,data)
        totals[path.split('/')[0]]+=1
    tasks=json.loads((root/'review/task-results.json').read_text())
    assert {r['task'] for r in tasks}=={f'RES-{i:03}' for i in range(1,30)}
    assert len({r['linear'] for r in tasks})==len(tasks)==29
    for r in tasks:
        assert r['evidence_files'] and set(r['evidence_files'])<=paths, r['task']
        assert r['observed_or_delivered'] and r['remaining_acceptance_work'],r['task']
    print(json.dumps({'verified_files_excluding_manifest':len(rows),'verified_bytes':sum(r['bytes'] for r in rows),'research_cards':len(tasks),'directories':totals},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path,nargs='?',default=Path(__file__).resolve().parents[1])
    verify(parser.parse_args().root)
