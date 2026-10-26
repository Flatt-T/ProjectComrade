"""Credential-free deployment of validated public GitHub release bundles.

COMRADE_CHANNEL=production (default) follows the latest main-<sha> release on port 3001.
COMRADE_CHANNEL=beta follows the newest beta-<sha> pre-release on port 3002 (BETA server).
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

CHANNEL = os.environ.get('COMRADE_CHANNEL', 'production')
if CHANNEL not in ('production', 'beta'):
    raise SystemExit('COMRADE_CHANNEL must be production or beta')
BETA = CHANNEL == 'beta'
ROOT = Path('/opt/comrade-beta' if BETA else '/opt/comrade')
PORT = '3002' if BETA else '3001'
TAG = re.compile(r'(beta|main)-([0-9a-f]{40})')
REPO = 'Flatt-T/ProjectComrade'
BASE = f'https://api.github.com/repos/{REPO}'


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        'User-Agent': 'ProjectComrade-deployment', 'Cache-Control': 'no-cache',
    }), timeout=180)


def compose(image):
    env = {**os.environ, 'COMRADE_IMAGE': image, 'COMRADE_BIND_ADDRESS': '10.1.0.60', 'COMRADE_HOST_PORT': PORT}
    # Secrets live beside the state file, never in the repo or the image: the database URL,
    # the Cognito pool, the Stripe keys, the advertising tags and the log-export token. Only
    # names the service actually reads are passed through, so a stray line cannot inject
    # anything into the container's environment.
    allowed = {
        'COMRADE_OPS_TOKEN', 'DATABASE_URL', 'DATABASE_SSL_VERIFY', 'DATABASE_POOL_MAX',
        'COGNITO_REGION', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID', 'COGNITO_CLIENT_SECRET',
        'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_AUTOMATIC_TAX', 'STRIPE_PROMOTION_CODES',
        'COMRADE_AD_TAGS', 'COMRADE_AD_SECONDS', 'COMRADE_AD_TIMEOUT_MS',
        'COMRADE_HOUSE_HEADLINE', 'COMRADE_HOUSE_BODY', 'COMRADE_HOUSE_CTA', 'COMRADE_HOUSE_HREF',
        'COMRADE_PUBLIC_URL', 'COMRADE_TERMS_VERSION', 'COMRADE_GUEST_SECRET', 'COMRADE_REPO',
        'COMRADE_GITHUB_TOKEN',
    }
    # `service.env` is the current name; `ops.env` is still read so an existing host keeps working.
    for name in ('ops.env', 'service.env'):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            if key in allowed:
                env[key] = value.strip()
    subprocess.run(['docker', 'compose', '-p', 'comrade-beta' if BETA else 'comrade', '-f', str(ROOT / 'compose.yml'),
                    'up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '90'],
                   env=env, check=True)


def main():
    ROOT.mkdir(exist_ok=True)
    with (ROOT / 'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            if BETA:
                # Pre-releases never become "latest": take the newest beta- one.
                with request(BASE + '/releases?per_page=30') as response:
                    release = next((r for r in json.load(response) if r['prerelease'] and r['tag_name'].startswith('beta-')), None)
                if release is None:
                    print('Waiting for the first beta release.')
                    return
            else:
                with request(BASE + '/releases/latest') as response:
                    release = json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                print('Waiting for the first validated deployment release.')
                return
            raise
        tag = release['tag_name']
        match = TAG.fullmatch(tag)
        if not match or match.group(1) != ('beta' if BETA else 'main'):
            raise RuntimeError('Unexpected release tag')
        commit = match.group(2)
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
                with request(f'http://10.1.0.60:{PORT}/health') as response:
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
