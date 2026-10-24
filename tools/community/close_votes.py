"""Close votes whose time is up, announce the winner and hand it to the build workflow.

Each option comment carries <!-- option:N -->; its 👍 count is the tally (GitHub allows one
reaction of a kind per person, so a person cannot vote twice for the same option). Ties go
to the older request. Winners are written as "issue kind" lines to build/community/winners.txt.
"""
import datetime as dt
import re
from pathlib import Path
from github import REPO, add_labels, api, comment, issues, remove_label

DAYS = {'feature': 7, 'fusion': 4}


def main():
    winners = []
    now = dt.datetime.now(dt.timezone.utc)
    for vote in issues('vote'):
        kind = 'fusion' if 'type:fusion' in {l['name'] for l in vote['labels']} else 'feature'
        opened = dt.datetime.fromisoformat(vote['created_at'].replace('Z', '+00:00'))
        if now - opened < dt.timedelta(days=DAYS[kind]):
            continue
        tally = []
        for c in api('GET', f"/repos/{REPO}/issues/{vote['number']}/comments?per_page=100"):
            m = re.search(r'<!-- option:(\d+) -->', c['body'] or '')
            if m:
                tally.append((int((c.get('reactions') or {}).get('+1', 0)), -int(m.group(1)), int(m.group(1))))
        if not tally:
            continue
        tally.sort(reverse=True)
        votes, _, winner = tally[0]
        plural = lambda n: f"{n} vote{'s' if n != 1 else ''}"
        results = '\n'.join(f'- #{n}: {plural(v)}' for v, _, n in tally)
        comment(vote['number'], f'Voting has closed. **#{winner} wins with {plural(votes)}.**\n\n{results}\n\nIt will now be built and launched on the BETA server.')
        api('PATCH', f"/repos/{REPO}/issues/{vote['number']}", {'state': 'closed'})
        for _, _, n in tally:
            remove_label(n, 'shortlisted')
        add_labels(winner, ['selected'])
        comment(winner, 'This won the community vote 🎉 Building starts now; it will appear on the BETA server for public testing.')
        winners.append(f'{winner} {kind}')
    Path('build/community').mkdir(parents=True, exist_ok=True)
    Path('build/community/winners.txt').write_text('\n'.join(winners))
    print('Winners:', winners or 'none')


if __name__ == '__main__':
    main()
