"""Pin and package the freeware Red Alert data from OpenRA's content mirror.

This stages the RA resource MIX files, then hands off to pack-ra-maps.py, which adds the
authored COMRADE scenarios and writes the manifest the browser checks and the lobby reads.
The map-pack codec ADR 007 called for lives in tools/westwood.py.
"""
from pathlib import Path
import hashlib
import json
import zipfile
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / 'build/ra-packages.zip'
archive.parent.mkdir(exist_ok=True)
url = 'https://openra.ppmsite.com/ra-packages.zip'
if not archive.exists():
    urllib.request.urlretrieve(url, archive)
# Pinned against the mirror as measured 2026-10-23.
if hashlib.sha256(archive.read_bytes()).hexdigest() != 'de3697903497d3d40db2f17d9b1aabbb3ef0b3bfccd9097a0b93836dc7343ab1':
    raise RuntimeError('Freeware RA content checksum mismatch')

out = ROOT / 'apps/web/public/content/ra'
out.mkdir(parents=True, exist_ok=True)
# Gameplay resources only; scores.mix (music) is optional and omitted to stay lean.
keep = {'allies.mix', 'conquer.mix', 'general.mix', 'interior.mix', 'redalert.mix',
        'russian.mix', 'snow.mix', 'sounds.mix', 'temperat.mix'}
with zipfile.ZipFile(archive) as package:
    for item in package.infolist():
        if '/' in item.filename or not item.filename.lower().endswith('.mix'):
            raise RuntimeError('Unexpected content archive entry')
        if item.filename.lower() in keep:
            (out / item.filename.upper()).write_bytes(package.read(item))

# Authored scenarios and the manifest (with the lobby's map registry) come from pack-ra-maps.
subprocess.run([sys.executable, str(ROOT / 'tools/create-ra-map.py')], check=True)
subprocess.run([sys.executable, str(ROOT / 'tools/pack-ra-maps.py')], check=True)
print(f'Staged RA resources into {out}')
