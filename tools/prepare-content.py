"""Pin and package the freeware TD data referenced by OpenRA's content installer."""
from pathlib import Path
import hashlib
import json
import shutil
import os
import subprocess
import sys
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / 'build/cnc-packages.zip'
archive.parent.mkdir(exist_ok=True)
url = 'https://openra.ppmsite.com/cnc-packages.zip'
if not archive.exists():
    urllib.request.urlretrieve(url, archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != 'a55b2c160b534f6d1b865ad6120e1f4fde8c418d47bb2fb1a9c72c586a5e1603':
    raise RuntimeError('Freeware content checksum mismatch')
out = ROOT / 'apps/web/public/content/td'
out.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as package:
    for item in package.infolist():
        if '/' in item.filename or not item.filename.lower().endswith('.mix'):
            raise RuntimeError('Unexpected content archive entry')
        (out / item.filename.upper()).write_bytes(package.read(item))
# OpenRA's compact pack omits the Gold interface fonts in UPDATE.MIX.
# Extract that one resource archive from CnCNet's freeware installer; never run it.
def pinned_download(url, path, sha256):
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha256:
        raise RuntimeError(f'Pinned download changed: {path.name}')

installer = ROOT / 'build/td-installer.exe'
pinned_download('https://downloads.cncnet.org/TiberianDawn_Online_installer.exe', installer,
                '0f8c146e553dc222e1e359570687516f5b7e40c2676470bde8d43bda26da8bed')
if os.name == 'nt':
    tool_archive = ROOT / 'build/innoextract.zip'
    pinned_download('https://github.com/dscharrer/innoextract/releases/download/1.9/innoextract-1.9-windows.zip', tool_archive,
                    '6989342c9b026a00a72a38f23b62a8e6a22cc5de69805cf47d68ac2fec993065')
    with zipfile.ZipFile(tool_archive) as package:
        package.extractall(ROOT / 'build/inno')
    extractor = ROOT / 'build/inno/innoextract.exe'
else:
    tool_archive = ROOT / 'build/innoextract-linux.tar.xz'
    pinned_download('https://github.com/dscharrer/innoextract/releases/download/1.9/innoextract-1.9-linux.tar.xz', tool_archive,
                    '008efe5011476ccc4aae17c3e22038b5a1bc5c7aad2b9d4d869537bf3874d21f')
    with tarfile.open(tool_archive) as package:
        package.extractall(ROOT / 'build/inno', filter='data')
    extractor = ROOT / 'build/inno/innoextract-1.9-linux/bin/amd64/innoextract'
    extractor.chmod(0o755)
extracted = ROOT / 'build/td-interface'
subprocess.run([str(extractor), '--extract', '--include', 'update.mix', '--output-dir', str(extracted), str(installer)], check=True)
interface = extracted / 'app/update.mix'
if hashlib.sha256(interface.read_bytes()).hexdigest() != '15176e03bc6475bf1d65be6d80bc7b53181f034fd36f7959c5e2cd9371f2dc73':
    raise RuntimeError('Gold interface archive checksum mismatch')
shutil.copyfile(interface, out / 'UPDATE.MIX')
ledger = [json.loads(line) for line in (ROOT / 'rights/ledger.jsonl').read_text().splitlines() if line.strip()]
approved = next(entry['assetHashes'] for entry in ledger if entry['id'] == 'ledger-017')
for p in sorted(out.glob('*.MIX')):
    if approved.get(p.name) != hashlib.sha256(p.read_bytes()).hexdigest():
        raise RuntimeError(f"Resource is outside the pinned pack decision: {p.name}")
# Authored scenarios and the manifest (with the lobby's map registry) come from pack-maps.
subprocess.run([sys.executable, str(ROOT / 'tools/pack-maps.py')], check=True)
