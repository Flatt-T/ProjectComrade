"""Copy authored scenarios into the web content pack and regenerate its manifest.

This does not touch the pinned freeware MIX files; it only refreshes the authored
map INI/BIN pairs and rebuilds manifest.json so the browser integrity check and the
lobby map picker stay in sync with what is actually shipped. Run after create-map.py.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
packs = ROOT / 'packs/td/comrade'
out = ROOT / 'apps/web/public/content/td'
out.mkdir(parents=True, exist_ok=True)

maps = json.loads((packs / 'maps.json').read_text())

# Ship every authored INI/BIN pair plus the default COMRADE pair.
authored = {'COMRADE.INI', 'COMRADE.BIN'}
for m in maps:
    authored.add(f"{m['file']}.INI")
    authored.add(f"{m['file']}.BIN")
for name in authored:
    (out / name).write_bytes((packs / name).read_bytes())

files = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in sorted(out.iterdir()) if p.suffix in ('.MIX', '.INI', '.BIN')]

# Resolve each map's INI/BIN to the manifest file entries the client swaps in.
registry = [{'id': m['id'], 'name': m['name'], 'theater': m['theater'], 'maxPlayers': m['maxPlayers'],
             'description': m['description'], 'ini': f"{m['file']}.INI", 'bin': f"{m['file']}.BIN"} for m in maps]

manifest = {
    'version': 1,
    'id': 'comrade-td-pack-v2',
    'engine': 'vanilla-td',
    'source': 'https://openra.ppmsite.com/cnc-packages.zip',
    'interfaceSource': 'https://cncnet.org/command-and-conquer',
    'upstreamManifest': 'https://github.com/OpenRA/OpenRA/blob/bleed/mods/cnc-content/installer/downloads.yaml',
    'notice': 'Classic game content: Electronic Arts / Westwood freeware content; not GPL artwork. Maps: Project Comrade.',
    'maps': registry,
    'files': files,
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Packed {len(files)} files and {len(registry)} maps into {out}')
