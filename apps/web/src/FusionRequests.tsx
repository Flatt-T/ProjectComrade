import React, { useEffect, useState } from 'react';

interface Row {
  number: number; url: string; title: string; votes: number; comments: number; created: string;
  status: 'open' | 'shortlisted' | 'selected' | 'beta'; fields: Record<string, string>;
}

const STATUS: Record<Row['status'], string> = { open: '', shortlisted: 'Shortlisted', selected: 'Being built', beta: 'On BETA' };
const units = (f: Record<string, string>) => ['infantry', 'vehicles', 'aircraft', 'naval'].map(k => f[k] && `${k[0].toUpperCase()}${k.slice(1)}: ${f[k]}`).filter(Boolean).join(' · ');

/**
 * Community fusion requests, most upvoted first. Players upvote with a 👍 on the request; each
 * week the top ten go to a community vote and the winner is built and launched on BETA.
 */
export default function FusionRequests({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/fusion-requests').then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => setRows(d.rows)).catch(() => setError('Fusion requests could not be loaded right now. Try again in a minute.'));
  }, []);

  return <section className="fusion-requests">
    <div className="fr-head">
      <div><p className="eyebrow">COMMUNITY · FUSION ENGINE</p><h2>Fusion requests</h2>
        <p>Design a fusion with the help button, or upvote one below with a 👍 on its page. Every week the ten most upvoted go to a
          community vote; the winner is built and launched on the BETA server for everyone to test.</p></div>
      <button onClick={onBack}>← WAR ROOM</button>
    </div>
    {error && <p className="lobby-error">{error}</p>}
    {!rows && !error && <p className="fr-empty">Loading requests…</p>}
    {rows && !rows.length && <p className="fr-empty">No fusion requests yet. Be the first: use the help button to design one.</p>}
    {rows && rows.length > 0 && <div className="fr-table-wrap"><table className="fr-table">
      <thead><tr><th>Votes</th><th>Fusion</th><th>Map</th><th>Dangers</th><th>Tech</th><th>Forces</th><th /></tr></thead>
      <tbody>
        {rows.map((r, i) => <React.Fragment key={r.number}>
          <tr className={i < 10 ? 'top' : ''} onClick={() => setOpen(open === r.number ? null : r.number)}>
            <td className="fr-votes">{r.votes}<small>👍</small></td>
            <td><b>{r.fields['fusion name'] || r.title}</b>{STATUS[r.status] && <em className={`fr-status ${r.status}`}>{STATUS[r.status]}</em>}<span>{r.fields['the pitch']}</span></td>
            <td>{[r.fields['map type'], r.fields['map size'], r.fields.map].filter(Boolean).join(' · ')}</td>
            <td>{r.fields.dangers}</td>
            <td>{r.fields['tech level']}</td>
            <td className="fr-forces">{units(r.fields)}</td>
            <td><a href={r.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Upvote ↗</a></td>
          </tr>
          {open === r.number && <tr className="fr-detail"><td colSpan={7}>
            {Object.entries(r.fields).filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}</b>{v}</p>)}
          </td></tr>}
        </React.Fragment>)}
      </tbody>
    </table></div>}
  </section>;
}
