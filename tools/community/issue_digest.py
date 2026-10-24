"""Daily digest of new problem reports, joined with the server logs that preceded each one.

Inputs: open issues labelled type:issue + needs-triage, and optional server logs in the
COMRADE_LOGS environment variable (JSON gathered by n8n from the internal /ops/logs
endpoint, keyed by issue number). Output: build/community/issues.md for the agent.
"""
import json
import os
from pathlib import Path
from github import issues, sections

OUT = Path('build/community')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reports = issues('type:issue,needs-triage')
    logs = json.loads(os.environ.get('COMRADE_LOGS') or '{}')
    lines = [f'# Problem reports for review ({len(reports)})', '',
             'Review all reports together before planning: look for shared causes first.', '']
    for issue in sorted(reports, key=lambda i: i['created_at']):
        s = sections(issue['body'])
        lines += [f"## #{issue['number']}: {issue['title']}",
                  f"- Opened: {issue['created_at']}",
                  f"- Timestamp: {s.get('timestamp (utc)') or s.get('timestamp') or issue['created_at']}",
                  f"- Report ID: {s.get('report id') or 'none'}",
                  f"- Style: {s.get('game style') or 'unknown'}", '',
                  '### What happened', s.get('what happened?') or s.get('description') or issue['body'] or '', '']
        if s.get('steps to reproduce'):
            lines += ['### Steps', s['steps to reproduce'], '']
        if s.get('diagnostics'):
            lines += ['### Diagnostics (from the player)', s['diagnostics'][:12000], '']
        entry = logs.get(str(issue['number']))
        if entry:
            lines += ['### Server logs before the report', '```json', json.dumps(entry, indent=1)[:20000], '```', '']
    (OUT / 'issues.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'{len(reports)} reports in the digest')
    if 'GITHUB_OUTPUT' in os.environ:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'count={len(reports)}\n')


if __name__ == '__main__':
    main()
