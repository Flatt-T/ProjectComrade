"""Credential-free deployment of validated public GitHub release bundles."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

ROOT = Path('/opt/comrade')
REPO = 'Flatt-T/ProjectComrade'
BASE = f'https://api.github.com/repos/{REPO}'


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        'User-Agent': 'ProjectComrade-deployment', 'Cache-Control': 'no-cache',
    }), timeout=180)


def compose(image):
    env = {**os.environ, 'COMRADE_IMAGE': image, 'COMRADE_BIND_ADDRESS': '10.1.0.60'}
    subprocess.run(['docker', 'compose', '-p', 'comrade', '-f', str(ROOT / 'compose.yml'),
                    'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '90'],
                   env=env, check=True)


def main():
    ROOT.mkdir(exist_ok=True)
    with (ROOT / 'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with request(BASE + '/releases/latest') as response:
                release = json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                print('Waiting for the first validated deployment release.')
                return
            raise
        tag = release['tag_name']
        if not re.fullmatch(r'main-[0-9a-f]{40}', tag):
            raise RuntimeError('Unexpected release tag')
        commit = tag[5:]
        state_file = ROOT / 'current.json'
        previous = json.loads(state_file.read_text()) if state_file.exists() else None
        if previous and previous['commit'] == commit:
            print(f'Already deployed {commit}')
            return
        assets = {asset['name']: asset for asset in release['assets']}
        # Construct the fixed public download paths; never execute release prose.
        download = f'https://github.com/{REPO}/releases/download/{tag}/'
        with request(download + 'deploy.json') as response:
            manifest = json.load(response)
        if manifest['commit'] != commit or not re.fullmatch(r'sha256:[0-9a-f]{64}', manifest['image_id']):
            raise RuntimeError('Invalid release manifest')
        if not re.fullmatch(r'[0-9a-f]{64}', manifest['archive_sha256']):
            raise RuntimeError('Invalid archive checksum')
        if assets['comrade-image.tar.gz']['size'] > 2 * 1024**3:
            raise RuntimeError('Deployment bundle exceeds 2 GiB')
        archive = ROOT / 'incoming.tar.gz'
        try:
            checksum = hashlib.sha256()
            with request(download + 'comrade-image.tar.gz') as response, archive.open('wb') as output:
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > 2 * 1024**3:
                        raise RuntimeError('Download exceeds 2 GiB')
                    checksum.update(chunk)
                    output.write(chunk)
            if checksum.hexdigest() != manifest['archive_sha256']:
                raise RuntimeError('Archive checksum mismatch')
            subprocess.run(['docker', 'load', '-i', str(archive)], check=True)
            image = f'ghcr.io/flatt-t/projectcomrade:{commit}'
            image_id = subprocess.check_output(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], text=True).strip()
            if image_id != manifest['image_id']:
                raise RuntimeError('Loaded image identity mismatch')
            try:
                compose(image)
                with request('http://10.1.0.60:3001/health') as response:
                    if json.load(response).get('status') != 'ok':
                        raise RuntimeError('Health response failed')
            except Exception:
                if previous:
                    compose(f"ghcr.io/flatt-t/projectcomrade:{previous['commit']}")
                raise
            temporary = ROOT / 'current.next.json'
            temporary.write_text(json.dumps(manifest))
            temporary.replace(state_file)
            print(f'Deployed {commit} ({image_id})')
        finally:
            archive.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
