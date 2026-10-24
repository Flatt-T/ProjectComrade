"""Open a community vote: one issue with one comment per option; a 👍 on a comment is a vote.

feature: the five requests the weekly review shortlisted, most upvoted first.
fusion:  the ten most upvoted fusion requests.
"""
import datetime as dt
import sys
from github import REPO, add_labels, api, comment, issues, upvotes

DAYS = {'feature': 7, 'fusion': 4}


def main(kind: str):
    if issues(f'vote,type:{kind}'):
        print(f'A {kind} vote is already open; not opening another.')
        return
    pool = issues(f'type:{kind},shortlisted') if kind == 'feature' else issues(f'type:{kind}')
    pool = [i for i in pool if not {'selected', 'vote'} & {l['name'] for l in i['labels']}]
    options = sorted(pool, key=lambda i: -upvotes(i))[: 5 if kind == 'feature' else 10]
    if len(options) < 2:
        print('Not enough candidates to vote on.')
        return
    closes = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=DAYS[kind])).strftime('%A %d %B %Y, %H:%M UTC')
    title = f"Community vote: {'feature of the month' if kind == 'feature' else 'fusion of the week'} ({dt.date.today():%d %b %Y})"
    body = ('Vote with a 👍 on the option comments below. You may back more than one.\n\n'
            f'Voting closes **{closes}**. The winner is built and launched on the BETA server for public testing.\n\n'
            + '\n'.join(f"- #{o['number']} {o['title']}" for o in options))
    vote = api('POST', f'/repos/{REPO}/issues', {'title': title, 'body': body, 'labels': ['vote', f'type:{kind}']})
    for o in options:
        comment(vote['number'], f"<!-- option:{o['number']} -->\n### #{o['number']}: {o['title']}\n\n👍 this comment to vote for it.")
        add_labels(o['number'], ['shortlisted'])
    print(f"Opened vote #{vote['number']} with {len(options)} options")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'feature')
