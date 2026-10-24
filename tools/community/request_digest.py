"""Weekly digest of feature (or fusion) requests with votes and discussion size, for the agent."""
import os
import sys
from pathlib import Path
from github import issues, sections, upvotes

OUT = Path('build/community')


def main(kind: str):
    OUT.mkdir(parents=True, exist_ok=True)
    found = sorted(issues(f'type:{kind}'), key=lambda i: -upvotes(i))
    found = [i for i in found if 'vote' not in {l['name'] for l in i['labels']}]
    lines = [f'# Open {kind} requests ({len(found)}), most upvoted first', '']
    for issue in found:
        lines += [f"## #{issue['number']}: {issue['title']}",
                  f"- Upvotes: {upvotes(issue)}  Comments: {issue['comments']}",
                  f"- Labels: {', '.join(l['name'] for l in issue['labels'])}", '']
        for heading, text in sections(issue['body']).items():
            if text:
                lines += [f'**{heading}**: {text[:1500]}', '']
    (OUT / f'{kind}.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'{len(found)} {kind} requests in the digest')
    if 'GITHUB_OUTPUT' in os.environ:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'count={len(found)}\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'feature')
