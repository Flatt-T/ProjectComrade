"""Fetch only the immutable inputs explicitly listed in source-lock.json."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha1, sha256
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
import argparse
import json

ROOT = Path(__file__).resolve().parent

def verify(data, record):
    git_blob = sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if git_blob != record["blob"] or sha256(data).hexdigest() != record["sha256"]:
        raise ValueError(f"Source mismatch at {record['local']}")

def acquire(cache, record, offline):
    target = cache / record["local"]
    if target.exists():
        verify(target.read_bytes(), record)
        return
    if offline:
        raise FileNotFoundError(target)
    url = f"https://raw.githubusercontent.com/{record['repo']}/{record['commit']}/{quote(record['path'])}"
    with urlopen(Request(url,headers={"User-Agent":"Fusion-historical-research"}),timeout=40) as response:
        data = response.read()
    verify(data, record)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cache",nargs="?",type=Path,default=ROOT/".cache")
    parser.add_argument("--offline",action="store_true")
    args=parser.parse_args()
    records=json.loads((ROOT/"source-lock.json").read_text())
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda record:acquire(args.cache,record,args.offline),records))
    print(f"Verified both hashes for {len(records)} files")
