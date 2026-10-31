// Extra matches: earned by watching an advertisement, or bought as the battle pack.
//
// The daily allowance is still a count of `play_ledger` rows. These credits sit beside it and
// are spent only once that allowance is gone, so a pack bought today survives the
// next renewal and an advertisement watched at zero is a real extra match, not a refund.
import {
  AD_CREDITS_PER_DAY, AdBreak, CREDIT_AD_SECONDS, CREDIT_PACK, CreditPack, PlayKind,
} from '@comrade/contracts';
import { adBreak } from './ads.js';
import { platformEnabled } from './config.js';
import { one, query, transaction } from './db.js';
import { badRequest, conflict, forbidden, tooMany } from './http.js';

/** Same shape as entitlements.Subject, kept here so this module does not import it. */
type Subject = { accountId: string; guestId?: undefined } | { guestId: string; accountId?: undefined };

const subjectClause = (subject: Subject) =>
  subject.accountId ? { column: 'account_id', id: subject.accountId } : { column: 'guest_id', id: subject.guestId };

export async function unspentCredits(subject: Subject, kind: PlayKind): Promise<number> {
  if (!platformEnabled()) return 0;
  const { column, id } = subjectClause(subject);
  const row = await one<{ n: string }>(
    `select count(*)::text as n from play_credits where ${column} = $1 and kind = $2 and spent_at is null`,
    [id, kind]);
  return Number(row?.n ?? 0);
}

async function adsGrantedSince(subject: Subject, kind: PlayKind, since: Date): Promise<number> {
  const { column, id } = subjectClause(subject);
  const row = await one<{ n: string }>(
    `select count(*)::text as n from play_credits pc
     join credit_lots cl on cl.lot_key = pc.lot_key
     where pc.${column} = $1 and pc.kind = $2 and cl.source = 'ad' and pc.created_at >= $3`,
    [id, kind, since]);
  return Number(row?.n ?? 0);
}

/**
 * Insert a lot of extra matches. `lotKey` is unique (Stripe session id or ad token), so a
 * retried webhook or a double-click grants nothing twice.
 */
export async function grantLot(
  subject: Subject,
  source: 'ad' | 'pack',
  lotKey: string,
  amounts: { classic: number; fusion: number },
): Promise<boolean> {
  return transaction(async client => {
    const inserted = await client.query(
      `insert into credit_lots (lot_key, account_id, guest_id, source)
       values ($1, $2, $3, $4) on conflict (lot_key) do nothing returning lot_key`,
      [lotKey, subject.accountId ?? null, subject.guestId ?? null, source]);
    if (!inserted.rows[0]) return false;
    const rows: [string, string | null, string | null, PlayKind][] = [];
    for (let i = 0; i < amounts.classic; i++) {
      rows.push([lotKey, subject.accountId ?? null, subject.guestId ?? null, 'classic']);
    }
    for (let i = 0; i < amounts.fusion; i++) {
      rows.push([lotKey, subject.accountId ?? null, subject.guestId ?? null, 'fusion']);
    }
    for (const row of rows) {
      await client.query(
        `insert into play_credits (lot_key, account_id, guest_id, kind) values ($1, $2, $3, $4)`,
        row);
    }
    return true;
  });
}

export async function grantPack(subject: Subject, lotKey: string, pack: CreditPack = CREDIT_PACK): Promise<boolean> {
  return grantLot(subject, 'pack', lotKey, { classic: pack.classic, fusion: pack.fusion });
}

/** Mark one unspent credit spent. Returns its id, or undefined when none are left. */
export async function consumeCredit(subject: Subject, kind: PlayKind): Promise<string | undefined> {
  return transaction(async client => {
    const { column, id } = subjectClause(subject);
    const found = await client.query<{ id: string }>(
      `select id from play_credits
       where ${column} = $1 and kind = $2 and spent_at is null
       order by created_at
       for update skip locked
       limit 1`,
      [id, kind]);
    const creditId = found.rows[0]?.id;
    if (!creditId) return undefined;
    await client.query(`update play_credits set spent_at = now() where id = $1`, [creditId]);
    return creditId;
  });
}

export async function restoreCredit(creditId: string): Promise<void> {
  await query(`update play_credits set spent_at = null where id = $1`, [creditId]);
}

/** Race guard only. Granting is decided by Google's `adViewed` on the client. */
export const AD_CREDIT_MIN_WATCH_MS = 1_000;
/** Abandoned tokens must not be cashed in later. */
export const AD_CREDIT_MAX_WAIT_MS = 5 * 60 * 1000;

export function adCreditWatchState(issuedAt: Date, now = new Date()): 'ok' | 'early' | 'expired' {
  const elapsedMs = now.getTime() - issuedAt.getTime();
  if (elapsedMs < AD_CREDIT_MIN_WATCH_MS) return 'early';
  if (elapsedMs > AD_CREDIT_MAX_WAIT_MS) return 'expired';
  return 'ok';
}

export interface AdCreditStart { ad: AdBreak; kind: PlayKind; seconds: number }

/** Open an advertisement that, if watched in full, grants one match of `kind`. */
export async function startAdCredit(subject: Subject, kind: PlayKind, personalised: boolean): Promise<AdCreditStart> {
  if (!platformEnabled()) throw forbidden('Credits are not enabled on this deployment');
  const seconds = CREDIT_AD_SECONDS[kind];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await adsGrantedSince(subject, kind, since);
  if (used >= AD_CREDITS_PER_DAY) {
    throw tooMany(`You have earned the most extra ${kind === 'fusion' ? 'Fusion' : 'Classic'} matches you can from advertisements today.`, 'ad-credit-cap');
  }
  const { column, id } = subjectClause(subject);
  await query(
    `delete from ad_credit_sessions where ${column} = $1 and kind = $2 and completed_at is null`,
    [id, kind]);
  const ad = adBreak(personalised, { seconds, purpose: 'credit' });
  await query(
    `insert into ad_credit_sessions (token, account_id, guest_id, kind, seconds)
     values ($1, $2, $3, $4, $5)`,
    [ad.token, subject.accountId ?? null, subject.guestId ?? null, kind, seconds]);
  return { ad, kind, seconds };
}

/** Grant the match after the client reports the rewarded placement was viewed. */
export async function completeAdCredit(subject: Subject, token: string): Promise<{ kind: PlayKind }> {
  if (!platformEnabled()) throw forbidden('Credits are not enabled on this deployment');
  const key = token.slice(0, 64);
  if (!key) throw badRequest('Missing advertisement token');
  const { column, id } = subjectClause(subject);
  const session = await one<{ token: string; kind: string; seconds: number; issued_at: Date; completed_at: Date | null }>(
    `select token, kind, seconds, issued_at, completed_at from ad_credit_sessions
     where token = $1 and ${column} = $2`,
    [key, id]);
  if (!session) throw badRequest('That advertisement is not waiting to be completed');
  if (session.completed_at) throw conflict('That advertisement has already granted a match');
  const watch = adCreditWatchState(session.issued_at);
  if (watch === 'early') {
    throw badRequest('Watch the advertisement to the end to earn the match', 'ad-credit-early');
  }
  if (watch === 'expired') {
    throw badRequest('That advertisement expired — start another');
  }
  const kind = session.kind as PlayKind;
  const amounts = { classic: kind === 'classic' ? 1 : 0, fusion: kind === 'fusion' ? 1 : 0 };
  // Grant first so a failed insert can be retried; the lot key is unique so a second
  // attempt will not double-credit. Then mark the session complete.
  await grantLot(subject, 'ad', session.token, amounts);
  await query(
    `update ad_credit_sessions set completed_at = now() where token = $1 and completed_at is null`,
    [session.token]);
  return { kind };
}
