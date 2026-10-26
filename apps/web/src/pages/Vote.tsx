// Gold voting on new features, maps and fusions.
//
// The open community signal stays where it has always been — a 👍 on the GitHub request — and
// this is the members' vote on top of it: one durable vote per account, Gold only, ten a week.
// Everyone can read the list; only Gold can move it.
import React, { useEffect, useState } from 'react';
import type { ProposalPage } from '@comrade/contracts';
import { VOTES_PER_WEEK } from '@comrade/contracts';
import { api } from '../api';
import { errorText, useAuth } from '../auth';
import { Link } from '../router';
import { Notice, Spinner, TierBadge } from '../ui';

const KIND_LABEL: Record<string, string> = { feature: 'Feature', map: 'Map', fusion: 'Fusion' };
const STATUS_LABEL: Record<string, string> = { open: '', scheduled: 'Scheduled', building: 'Being built', shipped: 'Shipped', declined: 'Declined' };

export default function Vote() {
  const { ready, signedIn, tier } = useAuth();
  const [page, setPage] = useState<ProposalPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.proposals().then(setPage).catch(caught => setError(errorText(caught)));
  }, [signedIn]);

  async function cast(id: string, value: 1 | -1, already: boolean) {
    setBusy(id); setError('');
    try {
      setPage(already ? await api.unvote(id) : await api.vote(id, value));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <section className="page"><Spinner /></section>;

  return <section className="page vote-page">
    <header className="page-head">
      <p className="eyebrow">COMMUNITY · GOLD</p>
      <h1>Vote on what gets built</h1>
      <p>Gold subscribers vote on the next features, maps and fusions, and play new content a week
        before everyone else. Anyone can read the list and add a request.</p>
    </header>

    {error && <Notice kind="bad">{error}</Notice>}
    {page && !page.canVote && <Notice>
      Reading is open to all. Casting a vote comes with <TierBadge tier="gold" small />
      {' '}— <Link to="/tiers">see the tiers</Link>.
    </Notice>}
    {page?.canVote && <Notice kind="good">
      You have {page.votesRemaining ?? VOTES_PER_WEEK} of {VOTES_PER_WEEK} votes left this week.
      Changing a vote you have already cast does not use another one.
    </Notice>}
    {!page && !error && <Spinner label="Loading proposals…" />}

    {page && <div className="proposals">
      {!page.proposals.length && <p>Nothing proposed yet. Use the help button in the war room to design a fusion.</p>}
      {page.proposals.map(proposal => {
        const mine = proposal.yourVote;
        return <article key={proposal.id} className={`proposal ${proposal.status}`}>
          <div className="p-votes">
            <button className={mine === 1 ? 'on' : ''} disabled={!page.canVote || busy === proposal.id}
              aria-label="Vote for this" onClick={() => void cast(proposal.id, 1, mine === 1)}>▲</button>
            <b>{proposal.votes}</b>
            <button className={mine === -1 ? 'on' : ''} disabled={!page.canVote || busy === proposal.id}
              aria-label="Vote against this" onClick={() => void cast(proposal.id, -1, mine === -1)}>▼</button>
          </div>
          <div className="p-body">
            <h2>{proposal.title}
              <em className="p-kind">{KIND_LABEL[proposal.kind] ?? proposal.kind}</em>
              {STATUS_LABEL[proposal.status] && <em className={`p-status ${proposal.status}`}>{STATUS_LABEL[proposal.status]}</em>}
            </h2>
            {proposal.summary && <p>{proposal.summary}</p>}
            <small>
              Proposed {new Date(proposal.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              {proposal.closesAt ? ` · voting closes ${new Date(proposal.closesAt).toLocaleDateString('en-GB')}` : ''}
              {proposal.issueUrl && <> · <a href={proposal.issueUrl} target="_blank" rel="noreferrer noopener">Public request ↗</a></>}
            </small>
          </div>
        </article>;
      })}
    </div>}

    {!signedIn && <p className="vote-foot">
      <Link to="/register" className="deploy">REGISTER A CALLSIGN →</Link>
    </p>}
    {signedIn && tier !== 'gold' && <p className="vote-foot">
      <Link to="/tiers" className="deploy">UPGRADE TO GOLD →</Link>
    </p>}
  </section>;
}
