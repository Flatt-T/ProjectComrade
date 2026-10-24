"""Tiny GitHub REST helper for the community pipeline (standard library only).

Uses GITHUB_TOKEN and GITHUB_REPOSITORY (both set automatically in GitHub Actions).
"""
import json
import os
import re
import urllib.request

API = 'https://api.github.com'
REPO = os.environ.get('GITHUB_REPOSITORY', 'Flatt-T/ProjectComrade')


def api(method: str, path: str, body=None):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'comrade-community', 'X-GitHub-Api-Version': '2022-11-28'}
    if os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    data = json.dumps(body).encode() if body is not None else None
    if data:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as res:
        text = res.read().decode()
        return json.loads(text) if text else None


def issues(labels: str, state: str = 'open') -> list[dict]:
    """All issues (not PRs) carrying every label in a comma-separated list."""
    out, page = [], 1
    while True:
        batch = api('GET', f'/repos/{REPO}/issues?labels={labels}&state={state}&per_page=100&page={page}')
        out += [i for i in batch if 'pull_request' not in i]
        if len(batch) < 100:
            return out
        page += 1


def sections(body: str | None) -> dict[str, str]:
    """Split an issue body into '### Heading' sections (the issue-form and widget format)."""
    result, current, lines = {}, None, []
    for line in (body or '').splitlines():
        m = re.match(r'^###\s+(.+?)\s*$', line)
        if m:
            if current:
                result[current] = '\n'.join(lines).strip()
            current, lines = m.group(1).strip().lower(), []
        elif current:
            lines.append(line)
    if current:
        result[current] = '\n'.join(lines).strip()
    return {k: ('' if v == '_No response_' else v) for k, v in result.items()}


def upvotes(issue: dict) -> int:
    return int((issue.get('reactions') or {}).get('+1', 0))


def comment(number: int, body: str):
    return api('POST', f'/repos/{REPO}/issues/{number}/comments', {'body': body})


def add_labels(number: int, labels: list[str]):
    return api('POST', f'/repos/{REPO}/issues/{number}/labels', {'labels': labels})


def remove_label(number: int, label: str):
    try:
        api('DELETE', f'/repos/{REPO}/issues/{number}/labels/{label}')
    except Exception:
        pass  # Not present.
