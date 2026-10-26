// Gold voting rights on new features, maps and fusions.
//
// The open community signal stays where it is — a 👍 on the GitHub request — and this adds a
// durable, one-per-account vote that only Gold subscribers may cast. The list therefore
// merges the GitHub fusion requests with any proposal recorded locally, so a Gold vote and a
// public upvote are shown side by side rather than competing.
import { Proposal, ProposalKind, ProposalPage, ProposalStatus, Tier, VOTES_PER_WEEK, plan } from '@comrade/contracts';
import { fusionRequestRows } from './community.js';
import { one, query } from './db.js';
import { badRequest, forbidden, notFound } from './http.js';
import { weekWindow } from './entitlements.js';

const KINDS: ProposalKind[] = ['feature', 'map', 'fusion'];

interface ProposalRow {
  id: string; kind: string; title: string; summary: string; status: string;
  closes_at: Date | null; issue_url: string | null; created_at: Date;
}

/** Local proposals, plus one per open GitHub fusion request. */
async function allProposals(): Promise<Proposal[]> {
  const rows = await query<ProposalRow>(
    `select id, kind, title, summary, status, closes_at, issue_url, created_at from proposals
     where status in ('open', 'scheduled', 'building') order by created_at desc limit 200`);
  const local: Proposal[] = rows.map(r => ({
    id: r.id,
    kind: (KINDS.find(k => k === r.kind) ?? 'feature'),
    title: r.title,
    summary: r.summary,
    status: r.status as ProposalStatus,
    createdAt: r.created_at.toISOString(),
    closesAt: r.closes_at?.toISOString() ?? null,
    votes: 0,
    issueUrl: r.issue_url,
  }));
  const known = new Set(local.map(p => p.id));
  const requests = await fusionRequestRows();
  for (const request of requests.slice(0, 50)) {
    const id = `issue-${request.number}`;
    if (known.has(id)) continue;
    local.push({
      id,
      kind: 'fusion',
      title: request.fields['fusion name'] || request.title,
      summary: request.fields['the pitch'] ?? '',
      status: request.status === 'beta' || request.status === 'selected' ? 'building' : 'open',
      createdAt: request.created,
      closesAt: null,
      votes: 0,
      issueUrl: request.url,
    });
  }
  return local;
}

/** The voting list, with counts and this viewer's own votes. */
export async function proposalPage(tier: Tier, accountId?: string, anchor?: Date): Promise<ProposalPage> {
  const proposals = await allProposals();
  const counts = await query<{ proposal_id: string; votes: string }>(
    `select proposal_id, sum(value)::text as votes from proposal_votes group by proposal_id`);
  const tally = new Map(counts.map(c => [c.proposal_id, Number(c.votes)]));
  const mine = accountId
    ? await query<{ proposal_id: string; value: number }>(
      `select proposal_id, value from proposal_votes where account_id = $1`, [accountId])
    : [];
  const yours = new Map(mine.map(v => [v.proposal_id, v.value]));
  for (const proposal of proposals) {
    proposal.votes = tally.get(proposal.id) ?? 0;
    const vote = yours.get(proposal.id);
    if (vote === 1 || vote === -1) proposal.yourVote = vote;
  }
  proposals.sort((a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt));

  const canVote = plan(tier).voting;
  return {
    proposals,
    canVote,
    votesRemaining: canVote && accountId && anchor ? await votesRemaining(accountId, anchor) : null,
  };
}

async function votesRemaining(accountId: string, anchor: Date): Promise<number> {
  const { start } = weekWindow(anchor);
  const row = await one<{ used: string }>(
    `select count(*)::text as used from proposal_votes where account_id = $1 and created_at >= $2`,
    [accountId, start]);
  return Math.max(0, VOTES_PER_WEEK - Number(row?.used ?? 0));
}

/**
 * Cast or change a vote. A GitHub-derived proposal is recorded locally the first time
 * somebody votes on it, so the vote has something to hang off.
 */
export async function castVote(accountId: string, tier: Tier, anchor: Date, id: string, value: 1 | -1): Promise<ProposalPage> {
  if (!plan(tier).voting) throw forbidden('Voting rights come with a Gold subscription');
  if (!/^[a-z0-9-]{3,64}$/.test(id)) throw badRequest('Unknown proposal');
  const proposals = await allProposals();
  const proposal = proposals.find(p => p.id === id);
  if (!proposal) throw notFound('No such proposal');
  if (proposal.status !== 'open') throw badRequest('Voting on that one has closed');
  if (proposal.closesAt && new Date(proposal.closesAt) < new Date()) throw badRequest('Voting on that one has closed');

  const existing = await one<{ value: number }>(
    `select value from proposal_votes where proposal_id = $1 and account_id = $2`, [id, accountId]);
  // Changing a vote you already cast does not spend another one.
  if (!existing && (await votesRemaining(accountId, anchor)) <= 0) {
    throw forbidden(`That is all ${VOTES_PER_WEEK} votes for this week — more when your week turns over`);
  }
  await query(
    `insert into proposals (id, kind, title, summary, status, issue_url, created_at)
     values ($1, $2, $3, $4, 'open', $5, $6)
     on conflict (id) do nothing`,
    [proposal.id, proposal.kind, proposal.title.slice(0, 200), proposal.summary.slice(0, 2000),
      proposal.issueUrl, proposal.createdAt]);
  await query(
    `insert into proposal_votes (proposal_id, account_id, value) values ($1, $2, $3)
     on conflict (proposal_id, account_id) do update set value = excluded.value, created_at = proposal_votes.created_at`,
    [id, accountId, value]);
  return proposalPage(tier, accountId, anchor);
}

export async function withdrawVote(accountId: string, tier: Tier, anchor: Date, id: string): Promise<ProposalPage> {
  await query(`delete from proposal_votes where proposal_id = $1 and account_id = $2`, [id, accountId]);
  return proposalPage(tier, accountId, anchor);
}
