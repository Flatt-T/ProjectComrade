// Operational logging, problem reports and the log export used by the daily issue review.
//
// Logs are JSON lines on stdout (kept by the container runtime) and in a bounded in-memory
// history. They never contain IP addresses or chat text. Reports from the in-game help
// widget get an id and timestamp so an issue can be matched to the logs that preceded it.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LogEntry { t: string; ev: string; [field: string]: unknown }
interface Report { id: string; at: string; data: unknown }

const MAX_LOGS = 50_000;
const MAX_REPORTS = 2_000;
const MAX_REPORT_BYTES = 48 * 1024;

const logs: LogEntry[] = [];
const reports = new Map<string, Report>();
const recentReports: number[] = [];

/** Record an operational event. Keep fields small and free of personal data. */
export function log(ev: string, fields: Record<string, unknown> = {}) {
  const entry: LogEntry = { t: new Date().toISOString(), ev, ...fields };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  console.log(JSON.stringify(entry));
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The ops token is optional: without it the log export is switched off. */
function authorised(req: IncomingMessage): boolean {
  const token = process.env.COMRADE_OPS_TOKEN;
  if (!token || token.length < 24) return false;
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Handle /api/report and /ops/logs; returns false for other paths. */
export async function handleOps(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/api/report' && req.method === 'POST') {
    // A modest global limit: reports are rare, floods are not.
    const now = Date.now();
    while (recentReports.length && now - recentReports[0] > 60_000) recentReports.shift();
    if (recentReports.length >= 60) { json(res, 429, { error: 'Too many reports, try again shortly' }); return true; }
    let data: unknown;
    try { data = JSON.parse(await readBody(req, MAX_REPORT_BYTES)); } catch { json(res, 400, { error: 'Invalid report' }); return true; }
    recentReports.push(now);
    const id = `r-${randomBytes(4).toString('hex')}`;
    const at = new Date(now).toISOString();
    reports.set(id, { id, at, data });
    if (reports.size > MAX_REPORTS) reports.delete(reports.keys().next().value!);
    log('report', { id });
    json(res, 200, { id, at });
    return true;
  }
  if (url.pathname === '/ops/logs' && req.method === 'GET') {
    // Internal only: n8n on the cluster calls the container directly. Anything that came in
    // through Cloudflare (the public route) is refused, token or not.
    const viaPublicEdge = !!(req.headers['cf-ray'] || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']);
    if (viaPublicEdge || !authorised(req)) { json(res, 404, { error: 'Not found' }); return true; }
    const to = Date.parse(url.searchParams.get('to') ?? '') || Date.now();
    const from = Date.parse(url.searchParams.get('from') ?? '') || to - 30 * 60_000;
    const entries = logs.filter(e => { const t = Date.parse(e.t); return t >= from && t <= to; }).slice(-5000);
    const id = url.searchParams.get('report');
    json(res, 200, { from: new Date(from).toISOString(), to: new Date(to).toISOString(), entries, report: id ? reports.get(id) ?? null : undefined });
    return true;
  }
  return false;
}
