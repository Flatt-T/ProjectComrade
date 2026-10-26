"""Fetch a hash-pinned archive, with retries and an optional mirror.

Every download the content pipeline makes is pinned to a sha256, so the bytes are either
exactly what the build expects or the build stops. That is what makes a mirror safe:
`COMRADE_CONTENT_MIRROR` may point at any copy — an S3 bucket, a shared cache, a file served
on the LAN — and the pin still decides whether it is accepted. A mirror cannot substitute
different content, only a faster or more reachable route to the same bytes.

This exists because the content pipeline had three scripts fetching from one third-party host
with no retry and no fallback, so an outage there stopped every image build — which is exactly
what happened on 2026-10-26.
"""
from pathlib import Path
import hashlib
import os
import shutil
import time
import urllib.request

USER_AGENT = 'ProjectComrade-content'
ATTEMPTS = 4
TIMEOUT = 120


def digest(path: Path) -> str:
    """sha256 of a file, read in chunks so a large archive does not sit in memory."""
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def sources(url: str) -> list:
    """The configured mirror for this file name, if any, then the upstream URL."""
    mirror = os.environ.get('COMRADE_CONTENT_MIRROR', '').strip().rstrip('/')
    name = url.rsplit('/', 1)[-1]
    return ([f'{mirror}/{name}'] if mirror else []) + [url]


def fetch(url: str, dest: Path, sha256: str, attempts: int = ATTEMPTS) -> Path:
    """
    Make `dest` hold exactly the bytes `sha256` names, downloading only if it does not
    already. Returns the path, or raises with every route that was tried and why it failed.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Already have it: no request at all, which is what makes caching the build directory
    # between CI runs worthwhile.
    if dest.exists() and digest(dest) == sha256:
        return dest
    if dest.exists():
        dest.unlink()

    failures = []
    for source in sources(url):
        for attempt in range(1, attempts + 1):
            try:
                request = urllib.request.Request(source, headers={'User-Agent': USER_AGENT})
                with urllib.request.urlopen(request, timeout=TIMEOUT) as response, dest.open('wb') as out:
                    shutil.copyfileobj(response, out)
            except Exception as error:                      # noqa: BLE001 - every failure is reported
                failures.append(f'{source} (attempt {attempt}): {error}')
                dest.unlink(missing_ok=True)
                if attempt < attempts:
                    time.sleep(2 ** attempt)                # 2s, 4s, 8s
                continue

            got = digest(dest)
            if got == sha256:
                return dest
            # Wrong bytes are not a transient fault, so move to the next source rather than
            # asking the same one again.
            dest.unlink(missing_ok=True)
            failures.append(f'{source}: checksum mismatch (expected {sha256}, got {got})')
            break

    raise RuntimeError(
        f'Could not fetch {dest.name}. Set COMRADE_CONTENT_MIRROR to a reachable copy, or place '
        f'the file at {dest} by hand — it is accepted only if it matches {sha256}.\n  '
        + '\n  '.join(failures))
