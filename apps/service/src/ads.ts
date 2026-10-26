// The pre-match advertisement slot.
//
// The service does not talk to any ad network: it resolves an ordered waterfall of VAST tag
// URLs and hands it to the client, which plays them with the IMA SDK and falls down the
// list on error or timeout. Adding, reordering or removing a network is an environment
// change, never a code change, and with nothing configured the house advertisement runs so
// the flow is complete from day one.
//
// Tags are only ever read from configuration — never from anything a player sends — so a
// client cannot make the page fetch a URL of its choosing.
import { randomUUID } from 'node:crypto';
import { AdBreak } from '@comrade/contracts';
import { ads } from './config.js';
import { query } from './db.js';
import { platformEnabled } from './config.js';
import { Subject } from './entitlements.js';

/** Macros the networks expect to be filled in per request. */
function expand(tag: string, personalised: boolean): string {
  const buster = String(Date.now()) + Math.floor(Math.random() * 1e6);
  let url = tag
    .replace(/\[CACHEBUSTER\]|%%CACHEBUSTER%%/gi, buster)
    .replace(/\[TIMESTAMP\]/gi, String(Date.now()))
    .replace(/\[RANDOM\]/gi, buster);
  // Google's parameter for serving a non-personalised ad; harmless on other networks but
  // only added where it means something.
  if (!personalised && /doubleclick\.net|googlesyndication\.com/.test(url) && !/[?&]npa=/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}npa=1`;
  }
  return url;
}

/** Resolve the advertisement a player must watch before the match. */
export function adBreak(personalised: boolean): AdBreak {
  return {
    token: randomUUID(),
    seconds: ads.seconds(),
    tags: ads.tags().map(t => expand(t.tag, personalised)),
    house: ads.house(),
    timeoutMs: ads.timeoutMs(),
    personalised,
  };
}

export interface ImpressionReport {
  token: string;
  /** Which rung of the waterfall actually played, or `house`. */
  provider?: string;
  /** False when every network failed and the house advertisement was shown. */
  filled: boolean;
  /** Seconds actually watched, as the player reported them. */
  seconds: number;
}

/** Record what was shown. Reporting is best effort: it must never hold up a match. */
export async function recordImpression(subject: Subject, report: ImpressionReport): Promise<void> {
  if (!platformEnabled()) return;
  await query(
    `insert into ad_impressions (account_id, guest_id, token, provider, filled, seconds)
     values ($1, $2, $3, $4, $5, $6)`,
    [subject.accountId ?? null, subject.guestId ?? null, report.token.slice(0, 64),
      (report.provider ?? 'unknown').slice(0, 32), report.filled, Math.max(0, Math.min(600, Math.trunc(report.seconds)))]);
}
