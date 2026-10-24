"""Pin and package the freeware Red Alert data from OpenRA's content mirror.

This prepares the RA resource MIX files and writes a partial content manifest.
It does NOT yet include a bootable COMRADE RA scenario: RA maps use Format80-
compressed, base64-packed [MapPack]/[OverlayPack] sections (unlike Tiberian
Dawn's plain .BIN), so an authored RA map requires the map-pack codec described
in ADR 007. Run this to stage RA content; the map/bridge/boot work follows.
"""
from pathlib import Path
import hashlib
import json
import zipfile
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

files = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in sorted(out.iterdir()) if p.suffix == '.MIX']
manifest = {
    'version': 1,
    'id': 'comrade-ra-pack-v1',
    'engine': 'vanilla-ra',
    'source': url,
    'notice': 'Classic Red Alert content: Electronic Arts / Westwood freeware content; not GPL artwork.',
    'status': 'resources-only: bootable COMRADE RA scenario pending map-pack codec (ADR 007)',
    'maps': [],
    'files': files,
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Staged {len(files)} RA resource files ({sum(f["bytes"] for f in files):,} bytes) into {out}')
