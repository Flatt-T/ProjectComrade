// Public list of fusion requests for the website's table. Requests are GitHub issues labelled
// type:fusion; a 👍 on the issue is an upvote. Cached so the site never hammers GitHub.
import type { ServerResponse } from 'node:http';
import { log } from './ops.js';

const REPO = process.env.COMRADE_REPO || 'Flatt-T/ProjectComrade';
const TTL = 10 * 60_000;
let cache: { at: number; body: string; rows: FusionRequestRow[] } | null = null;

export interface FusionRequestRow {
  number: number; url: string; title: string; votes: number; comments: number; created: string;
  status: 'open' | 'shortlisted' | 'in vote' | 'selected' | 'beta';
  fields: Record<string, string>;
}

/** Split a GitHub issue body into its '### Heading' sections. */
export function sections(body: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  let current = '';
  for (const line of (body ?? '').split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) { current = m[1].trim().toLowerCase(); out[current] = ''; continue; }
    if (current) out[current] += (out[current] ? '\n' : '') + line;
  }
  for (const k of Object.keys(out)) { out[k] = out[k].trim(); if (out[k] === '_No response_') out[k] = ''; }
  return out;
}

async function load(): Promise<{ body: string; rows: FusionRequestRow[] }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'comrade-community' };
  if (process.env.COMRADE_GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.COMRADE_GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues?labels=type:fusion&state=open&per_page=100`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const issues = (await res.json()) as { number: number; html_url: string; title: string; body: string; comments: number; created_at: string; pull_request?: unknown; labels: { name: string }[]; reactions?: Record<string, number> }[];
  const rows: FusionRequestRow[] = issues.filter(i => !i.pull_request).map(i => {
    const labels = new Set(i.labels.map(l => l.name));
    const status: FusionRequestRow['status'] = labels.has('beta') ? 'beta' : labels.has('selected') ? 'selected' : labels.has('vote') ? 'in vote' : labels.has('shortlisted') ? 'shortlisted' : 'open';
    const fields = Object.fromEntries(Object.entries(sections(i.body)).map(([k, v]) => [k, v.slice(0, 600)]));
    return { number: i.number, url: i.html_url, title: i.title.replace(/^\[Fusion\]\s*/i, ''), votes: i.reactions?.['+1'] ?? 0, comments: i.comments, created: i.created_at, status, fields };
  }).filter(r => r.status !== 'in vote').sort((a, b) => b.votes - a.votes || a.number - b.number);
  return { body: JSON.stringify({ updated: new Date().toISOString(), repo: REPO, rows }), rows };
}

/** The cached request rows, for the in-app voting list. Empty when GitHub is unreachable. */
export async function fusionRequestRows(): Promise<FusionRequestRow[]> {
  if (!cache || Date.now() - cache.at > TTL) {
    try { cache = { at: Date.now(), ...(await load()) }; } catch (error) {
      log('error', { where: 'fusion-requests', message: String(error).slice(0, 200) });
    }
  }
  return cache?.rows ?? [];
}

export async function fusionRequests(res: ServerResponse) {
  if (!cache || Date.now() - cache.at > TTL) {
    try { cache = { at: Date.now(), ...(await load()) }; } catch (error) {
      log('error', { where: 'fusion-requests', message: String(error).slice(0, 200) });
      if (!cache) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Fusion requests are unavailable right now' })); return; }
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' });
  res.end(cache.body);
}
