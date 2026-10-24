// Diagnostics for problem reports. The in-game help widget (helpdot.me) attaches these to a
// report: recent player actions, errors, notices and a snapshot of the match, plus a report
// id and timestamp from the server so the daily review can line the report up with the
// server logs that preceded it.
//
// Widget integration:
//   const d = window.comradeSupport.diagnostics();            // plain object, safe to JSON-encode
//   const { id, at } = await window.comradeSupport.report({ text: 'what the player typed' });

interface Entry { at: string; [field: string]: unknown }
type Snapshot = () => Record<string, unknown> | null;

const LIMIT = { actions: 60, errors: 30, notices: 30, events: 40 };
const rings = { actions: [] as Entry[], errors: [] as Entry[], notices: [] as Entry[], events: [] as Entry[] };
let match: Snapshot = () => null;
let commit = 'unknown';

function push(ring: keyof typeof rings, fields: Record<string, unknown>) {
  const list = rings[ring];
  list.push({ at: new Date().toISOString(), ...fields });
  if (list.length > LIMIT[ring]) list.splice(0, list.length - LIMIT[ring]);
}

/** A command the player issued (orders, building, superweapons...). */
export const recordAction = (action: Record<string, unknown>) => push('actions', action);
/** An on-screen or spoken notice ("Low power", "Insufficient funds"). */
export const recordNotice = (text: string) => push('notices', { text });
/** Connection, lobby and match lifecycle events. */
export const recordEvent = (event: string, fields: Record<string, unknown> = {}) => push('events', { event, ...fields });
/** The battle registers a live snapshot of its match while it runs. */
export function setMatchSnapshot(snapshot: Snapshot | null) { match = snapshot ?? (() => null); }

export function diagnostics() {
  let state: Record<string, unknown> | null = null;
  try { state = match(); } catch (error) { state = { error: String(error) }; }
  // Classic C&C runs the original engine, which has its own snapshot.
  if (!state && window.comrade?.snapshot) { try { state = { classic: window.comrade.snapshot() as unknown as Record<string, unknown> }; } catch { /* engine not ready */ } }
  return {
    version: 1,
    at: new Date().toISOString(),
    commit,
    page: location.pathname + location.search.replace(/room=[^&]+/, 'room=…'),
    browser: navigator.userAgent,
    language: navigator.language,
    screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    match: state,
    actions: [...rings.actions],
    errors: [...rings.errors],
    notices: [...rings.notices],
    events: [...rings.events],
  };
}

/** Store the diagnostics on the server; returns the report id and server timestamp. */
export async function report(extra: Record<string, unknown> = {}): Promise<{ id: string; at: string }> {
  const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...diagnostics(), extra }) });
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  return res.json();
}

/** Install error capture and the window.comrade API; call once at startup. */
export function installDiagnostics() {
  window.addEventListener('error', e => push('errors', { message: String(e.message).slice(0, 300), source: `${e.filename}:${e.lineno}:${e.colno}` }));
  window.addEventListener('unhandledrejection', e => push('errors', { message: String(e.reason).slice(0, 300), kind: 'promise' }));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => { push('errors', { message: args.map(a => String(a)).join(' ').slice(0, 300), kind: 'console' }); original(...args); };
  fetch('/health').then(r => r.json()).then(h => { commit = h.commit ?? commit; }).catch(() => { /* offline */ });
  window.comradeSupport = { diagnostics, report };
}

declare global {
  interface Window { comradeSupport?: { diagnostics: typeof diagnostics; report: typeof report } }
}
