// A commander's record: match history, head-to-head results, and a shareable match page.
//
// The commander and match pages are public and have real URLs, so a result can be shared as
// a page anyone can open rather than a screenshot nobody can check.
import React, { useEffect, useState } from 'react';
import type { HistoryPage, MatchRecord } from '@comrade/contracts';
import { styleInfo } from '@comrade/contracts';
import { CommanderResponse, api } from '../api';
import { errorText, useAuth } from '../auth';
import { Link, useRoute } from '../router';
import Share, { shareTextFor } from '../Share';
import { Avatar, Notice, SignInWall, Spinner } from '../ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const OUTCOME: Record<string, string> = { won: 'Won', lost: 'Lost', surrendered: 'Surrendered', abandoned: 'Abandoned', draw: 'Draw' };

function duration(seconds: number): string {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** One row of history, used on both the history list and a commander's page. */
function MatchRow({ match }: { match: MatchRecord }) {
  const you = match.you;
  const others = match.participants.filter(p => p !== you);
  return <tr className={`match-row ${you?.outcome ?? ''}`}>
    <td className="m-when">{when(match.startedAt)}</td>
    <td className="m-style">{styleInfo(match.style).name}<small>{match.mapName}</small></td>
    <td className="m-outcome">{you ? OUTCOME[you.outcome] ?? you.outcome : '—'}</td>
    <td className="m-score">{you ? you.score.toLocaleString('en-GB') : '—'}</td>
    <td className="m-against">{others.map(p => p.handle
      ? <Link key={p.name} to={`/commanders/${p.handle}`}>{p.name}</Link>
      : <span key={p.name}>{p.name}{p.ai ? ' (AI)' : ''}</span>)
      .reduce<React.ReactNode[]>((all, node, i) => i ? [...all, ', ', node] : [node], [])}</td>
    <td className="m-length">{duration(match.durationSeconds)}</td>
    <td><Link to={`/match/${match.id}`}>Details</Link></td>
  </tr>;
}

// ---------------------------------------------------------------------------
// Your own history
// ---------------------------------------------------------------------------

export function History() {
  const { ready, signedIn, profile } = useAuth();
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    api.history().then(setPage).catch(caught => setError(errorText(caught)));
  }, [signedIn]);

  if (!ready) return <section className="page"><Spinner /></section>;
  if (!signedIn || !profile) return <section className="page"><SignInWall what="Match history" /></section>;

  async function more() {
    if (!page?.cursor) return;
    setBusy(true);
    try {
      const next = await api.history(page.cursor);
      setPage({ ...next, matches: [...page.matches, ...next.matches] });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return <section className="page record-page">
    <header className="page-head">
      <p className="eyebrow">YOUR RECORD</p>
      <h1>Match history</h1>
      <p>{page ? `${page.total} matches played.` : ''}</p>
    </header>
    {error && <Notice kind="bad">{error}</Notice>}
    {!page && !error && <Spinner />}
    {page && !page.matches.length && <Notice>No matches yet. <Link to="/">Start one</Link>.</Notice>}
    {page && page.matches.length > 0 && <>
      <table className="matches">
        <thead><tr><th>When</th><th>Style</th><th>Result</th><th>Score</th><th>Against</th><th>Length</th><th /></tr></thead>
        <tbody>{page.matches.map(match => <MatchRow key={match.id} match={match} />)}</tbody>
      </table>
      {page.cursor && <button disabled={busy} onClick={() => void more()}>{busy ? 'LOADING…' : 'LOAD MORE'}</button>}
    </>}
    <p><Link to={`/commanders/${profile.handle}`}>Your public commander page →</Link></p>
  </section>;
}

// ---------------------------------------------------------------------------
// A commander's public page
// ---------------------------------------------------------------------------

export function Commander() {
  const { match: matchPath } = useRoute();
  const params = matchPath('/commanders/:handle');
  const handle = params?.handle ?? '';
  const [record, setRecord] = useState<CommanderResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!handle) return;
    setRecord(null);
    api.commander(handle).then(setRecord).catch(caught => setError(errorText(caught)));
  }, [handle]);

  if (error) return <section className="page"><Notice kind="bad">{error}</Notice><Link to="/">Back to the war room</Link></section>;
  if (!record) return <section className="page"><Spinner /></section>;

  const { stats, profile, recent, rivals } = record;
  return <section className="page record-page">
    <header className="commander-head">
      <Avatar handle={profile.handle} version={profile.avatarVersion} hasAvatar={profile.hasAvatar} size={96} name={profile.displayName} />
      <div>
        <p className="eyebrow">COMMANDER</p>
        <h1>{profile.displayName || profile.handle}</h1>
        <p>Callsign <b>{profile.handle}</b>{profile.country ? ` · ${profile.country}` : ''} ·
          commanding since {new Date(profile.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
      </div>
      <Share url={`/commanders/${profile.handle}`}
        text={`${profile.displayName || profile.handle} on Project Comrade: ${stats.won} wins from ${stats.played} matches`} compact />
    </header>

    <div className="stat-row">
      <span><b>{stats.played}</b>played</span>
      <span><b>{stats.won}</b>won</span>
      <span><b>{stats.lost}</b>lost</span>
      <span><b>{stats.winRate}%</b>win rate</span>
      <span><b>{stats.bestScore.toLocaleString('en-GB')}</b>best score</span>
      <span><b>{stats.bestStreak}</b>best streak</span>
      {stats.currentStreak > 1 && <span className="hot"><b>{stats.currentStreak}</b>on a run</span>}
      {stats.favouriteStyle && <span><b>{styleInfo(stats.favouriteStyle).name}</b>most played</span>}
    </div>

    {rivals.length > 0 && <>
      <h2>Head to head</h2>
      <table className="rivals">
        <thead><tr><th /><th>Commander</th><th>Played</th><th>Won</th><th>Lost</th><th>Points for / against</th><th>Last met</th></tr></thead>
        <tbody>
          {rivals.map(rival => <tr key={rival.handle}>
            <td><Avatar handle={rival.handle} version={rival.avatarVersion} hasAvatar={rival.hasAvatar} size={28} name={rival.displayName} /></td>
            <td><Link to={`/commanders/${rival.handle}`}>{rival.displayName || rival.handle}</Link></td>
            <td>{rival.played}</td>
            <td className="won">{rival.won}</td>
            <td className="lost">{rival.lost}</td>
            <td>{rival.yourScore.toLocaleString('en-GB')} / {rival.theirScore.toLocaleString('en-GB')}</td>
            <td>{when(rival.lastPlayedAt)}</td>
          </tr>)}
        </tbody>
      </table>
    </>}

    <h2>Recent matches</h2>
    {!recent.length && <p>No finished matches yet.</p>}
    {recent.length > 0 && <table className="matches">
      <thead><tr><th>When</th><th>Style</th><th>Result</th><th>Score</th><th>Against</th><th>Length</th><th /></tr></thead>
      <tbody>{recent.map(match => <MatchRow key={match.id} match={match} />)}</tbody>
    </table>}
  </section>;
}

// ---------------------------------------------------------------------------
// One match, shareable
// ---------------------------------------------------------------------------

export function Match() {
  const { match: matchPath } = useRoute();
  const params = matchPath('/match/:id');
  const id = params?.id ?? '';
  const [match, setMatch] = useState<MatchRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.match(id).then(setMatch).catch(caught => setError(errorText(caught)));
  }, [id]);

  if (error) return <section className="page"><Notice kind="bad">{error}</Notice><Link to="/">Back to the war room</Link></section>;
  if (!match) return <section className="page"><Spinner /></section>;

  const winners = match.participants.filter(p => p.outcome === 'won');
  return <section className="page match-page">
    <header className="page-head">
      <p className="eyebrow">{styleInfo(match.style).name.toUpperCase()} · {match.mapName.toUpperCase()}</p>
      <h1>{winners.length ? `${winners.map(w => w.name).join(' and ')} took the field` : 'Match report'}</h1>
      <p>{when(match.startedAt)} · {duration(match.durationSeconds)} · {match.multiplayer ? 'synchronized multiplayer' : 'skirmish'}</p>
    </header>

    <table className="scoreboard">
      <thead><tr><th>Commander</th><th>Side</th><th>Result</th><th>Score</th><th>Harvested</th><th>Destroyed</th><th>Lost</th></tr></thead>
      <tbody>
        {match.participants.map(p => <tr key={`${p.name}-${p.faction}`} className={p.outcome}>
          <td>{p.handle ? <Link to={`/commanders/${p.handle}`}>{p.name}</Link> : <>{p.name}{p.ai ? ' (AI)' : ''}</>}</td>
          <td>{p.faction}</td>
          <td>{OUTCOME[p.outcome] ?? p.outcome}</td>
          <td>{p.score.toLocaleString('en-GB')}</td>
          <td>{p.harvested.toLocaleString('en-GB')}</td>
          <td>{p.unitsKilled}</td>
          <td>{p.unitsLost}</td>
        </tr>)}
      </tbody>
    </table>

    <Share url={`/match/${match.id}`} text={shareTextFor(match)} />
    <p><Link to="/">Back to the war room →</Link></p>
  </section>;
}
