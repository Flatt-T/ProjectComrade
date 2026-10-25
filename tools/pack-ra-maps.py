"""Copy the authored Red Alert scenarios into the web content pack and refresh its manifest.

The pinned freeware MIX files are staged by prepare-ra-content.py; this only refreshes the
authored scenario INIs (Red Alert keeps its terrain inside them) and rebuilds manifest.json
so the browser integrity check and the lobby map picker match what is shipped. Run after
create-ra-map.py.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
packs = ROOT / 'packs/ra1/comrade'
out = ROOT / 'apps/web/public/content/ra'
out.mkdir(parents=True, exist_ok=True)

maps = json.loads((packs / 'maps.json').read_text())

authored = {'COMRADE.INI'}
for m in maps:
    authored.add(f"{m['file']}.INI")
for name in sorted(authored):
    (out / name).write_bytes((packs / name).read_bytes())

files = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in sorted(out.iterdir()) if p.suffix in ('.MIX', '.INI')]

# Red Alert scenarios carry their own terrain, so a map resolves to one INI and no BIN.
registry = [{'id': m['id'], 'name': m['name'], 'theater': m['theater'], 'maxPlayers': m['maxPlayers'],
             'description': m['description'], 'ini': f"{m['file']}.INI"} for m in maps]

manifest = {
    'version': 1,
    'id': 'comrade-ra-pack-v1',
    'engine': 'vanilla-ra',
    'source': 'https://openra.ppmsite.com/ra-packages.zip',
    'notice': 'Classic Red Alert content: Electronic Arts / Westwood freeware content; not GPL artwork. Maps: Project Comrade.',
    'maps': registry,
    'files': files,
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Packed {len(files)} files and {len(registry)} maps into {out}')
