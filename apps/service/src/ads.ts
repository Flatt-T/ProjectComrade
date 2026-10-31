// The pre-match advertisement slot.
//
// The service does not talk to Google: it issues a token, the house creative, and how long
// the house fallback should run. The browser calls the Ad Placement API. Adding a different
// network later is a client change; the token and impression record stay the same.
import { randomUUID } from 'node:crypto';
import { AdBreak } from '@comrade/contracts';
import { ads, platformEnabled } from './config.js';
import { query } from './db.js';
import { Subject } from './entitlements.js';

export interface AdBreakOptions {
  seconds?: number;
  purpose?: AdBreak['purpose'];
  token?: string;
}

/** Resolve the advertisement a player must watch before the match, or to earn a credit. */
export function adBreak(personalised: boolean, options: AdBreakOptions = {}): AdBreak {
  return {
    token: options.token ?? randomUUID(),
    seconds: options.seconds ?? ads.seconds(),
    house: ads.house(),
    personalised,
    purpose: options.purpose ?? 'delay',
  };
}

export interface ImpressionReport {
  token: string;
  /** `adsense`, `house`, or another short provider label. */
  provider?: string;
  /** False when the house advertisement was shown instead. */
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
