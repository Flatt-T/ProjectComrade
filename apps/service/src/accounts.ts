// Accounts: the callsign register, profile fields, avatars and consent records.
//
// A handle is claimed here, not in Cognito, because the database can enforce uniqueness
// atomically. Registration therefore reserves the handle first and creates the Cognito user
// second; if Cognito refuses, the reservation is released and nobody loses the name.
import { AVATAR_MAX_BYTES, AVATAR_TYPES, ConsentState, DISPLAY_NAME_MAX, Profile, handleValid } from '@comrade/contracts';
import { one, query, transaction } from './db.js';
import { badRequest, conflict, notFound } from './http.js';
import { termsVersion } from './config.js';

export interface AccountRow {
  id: string;
  cognito_sub: string | null;
  handle: string;
  email: string;
  pending_email: string | null;
  email_verified: boolean;
  display_name: string | null;
  country: string | null;
  favourite_faction: string | null;
  avatar_type: string | null;
  avatar_version: number;
  week_anchor: Date;
  stripe_customer_id: string | null;
  status: 'pending' | 'active' | 'deleted';
  created_at: Date;
}

const FIELDS = `id, cognito_sub, handle, email, pending_email, email_verified, display_name, country,
  favourite_faction, avatar_type, avatar_version, week_anchor, stripe_customer_id, status, created_at`;

export async function accountBySub(sub: string): Promise<AccountRow | undefined> {
  return one<AccountRow>(`select ${FIELDS} from accounts where cognito_sub = $1 and status = 'active'`, [sub]);
}

export async function accountById(id: string): Promise<AccountRow | undefined> {
  return one<AccountRow>(`select ${FIELDS} from accounts where id = $1 and status = 'active'`, [id]);
}

export async function accountByHandle(handle: string): Promise<AccountRow | undefined> {
  return one<AccountRow>(`select ${FIELDS} from accounts where lower(handle) = lower($1) and status = 'active'`, [handle]);
}

export async function accountByCustomer(customerId: string): Promise<AccountRow | undefined> {
  return one<AccountRow>(`select ${FIELDS} from accounts where stripe_customer_id = $1`, [customerId]);
}

/** Required by the signed-in routes: the caller's row, or a clear 404. */
export async function requireAccount(sub: string): Promise<AccountRow> {
  const account = await accountBySub(sub);
  if (!account) throw notFound('No account found for this sign-in');
  return account;
}

export async function handleTaken(handle: string): Promise<boolean> {
  // Pending registrations hold their handle too, so a half-finished sign-up cannot be
  // overtaken while the player is still typing in their confirmation code.
  const row = await one<{ taken: boolean }>(
    `select true as taken from accounts where lower(handle) = lower($1)
       and (status = 'active' or (status = 'pending' and created_at > now() - interval '24 hours'))`, [handle]);
  return !!row;
}

/**
 * Reserve a callsign and email for a sign-up that has not completed yet. Returns the new
 * account id. Stale pending rows are cleared first so an abandoned attempt never parks a
 * name for good.
 */
export async function reserveAccount(handle: string, email: string): Promise<string> {
  if (!handleValid(handle)) throw badRequest('That callsign is not allowed', 'handle-invalid');
  return transaction(async client => {
    await client.query(`delete from accounts where status = 'pending' and created_at < now() - interval '24 hours'`);
    const taken = await client.query(
      `select 1 from accounts where (lower(handle) = lower($1) or lower(email) = lower($2)) and status <> 'deleted'
       for update`, [handle, email]);
    if (taken.rowCount) {
      const byHandle = await client.query(
        `select 1 from accounts where lower(handle) = lower($1) and status <> 'deleted'`, [handle]);
      throw byHandle.rowCount
        ? conflict('That callsign is already taken', 'handle-taken')
        : conflict('That email address already has an account', 'email-taken');
    }
    const { rows } = await client.query<{ id: string }>(
      `insert into accounts (handle, email, status) values ($1, $2, 'pending') returning id`, [handle, email]);
    return rows[0].id;
  });
}

/** Attach the Cognito subject and open the account for play. */
export async function activateAccount(id: string, sub: string, emailVerified: boolean): Promise<AccountRow> {
  const row = await one<AccountRow>(
    `update accounts set cognito_sub = $2, email_verified = $3, status = 'active', updated_at = now()
     where id = $1 returning ${FIELDS}`, [id, sub, emailVerified]);
  if (!row) throw notFound('That registration has expired — start again');
  return row;
}

export async function releaseReservation(id: string): Promise<void> {
  await query(`delete from accounts where id = $1 and status = 'pending'`, [id]);
}

/** Find the pending reservation for an address so a confirmation can finish it. */
export async function pendingByEmail(email: string): Promise<AccountRow | undefined> {
  return one<AccountRow>(
    `select ${FIELDS} from accounts where lower(email) = lower($1) and status = 'pending'
     order by created_at desc limit 1`, [email]);
}

export interface ProfilePatch {
  displayName?: string | null;
  country?: string | null;
  favouriteFaction?: string | null;
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<AccountRow> {
  const display = patch.displayName === undefined ? undefined : (patch.displayName ?? '').trim() || null;
  if (display && display.length > DISPLAY_NAME_MAX) throw badRequest('That display name is too long');
  if (display && /[\p{C}]/u.test(display)) throw badRequest('That display name contains characters we cannot show');
  const country = patch.country === undefined ? undefined : (patch.country ?? '').toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) throw badRequest('Country must be a two-letter code');
  const faction = patch.favouriteFaction === undefined ? undefined : (patch.favouriteFaction ?? '') || null;
  if (faction && !/^[a-z0-9-]{2,24}$/.test(faction)) throw badRequest('That is not a side we run');

  const row = await one<AccountRow>(
    `update accounts set
       display_name = coalesce($2, case when $5 then null else display_name end),
       country = coalesce($3, case when $6 then null else country end),
       favourite_faction = coalesce($4, case when $7 then null else favourite_faction end),
       updated_at = now()
     where id = $1 and status = 'active' returning ${FIELDS}`,
    [id, display, country, faction,
      patch.displayName !== undefined, patch.country !== undefined, patch.favouriteFaction !== undefined]);
  if (!row) throw notFound('Account not found');
  return row;
}

export async function setPendingEmail(id: string, email: string | null): Promise<void> {
  await query(`update accounts set pending_email = $2, updated_at = now() where id = $1`, [id, email]);
}

/** Apply a completed email change: the new address becomes the account's address. */
export async function applyEmailChange(id: string, email: string): Promise<void> {
  await query(
    `update accounts set email = $2, pending_email = null, email_verified = true, updated_at = now() where id = $1`,
    [id, email]);
}

export async function setStripeCustomer(id: string, customerId: string): Promise<void> {
  await query(`update accounts set stripe_customer_id = $2, updated_at = now() where id = $1`, [id, customerId]);
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

export async function setAvatar(id: string, image: Buffer, contentType: string): Promise<number> {
  if (!AVATAR_TYPES.includes(contentType)) throw badRequest('Avatars must be WebP, PNG or JPEG');
  if (image.length > AVATAR_MAX_BYTES) throw badRequest('That image is too large');
  if (!image.length) throw badRequest('That image is empty');
  const row = await one<{ avatar_version: number }>(
    `update accounts set avatar = $2, avatar_type = $3, avatar_version = avatar_version + 1, updated_at = now()
     where id = $1 and status = 'active' returning avatar_version`, [id, image, contentType]);
  if (!row) throw notFound('Account not found');
  return row.avatar_version;
}

export async function clearAvatar(id: string): Promise<void> {
  await query(`update accounts set avatar = null, avatar_type = null,
    avatar_version = avatar_version + 1, updated_at = now() where id = $1`, [id]);
}

export async function avatarOf(handle: string): Promise<{ image: Buffer; type: string; version: number } | undefined> {
  const row = await one<{ avatar: Buffer | null; avatar_type: string | null; avatar_version: number }>(
    `select avatar, avatar_type, avatar_version from accounts
     where lower(handle) = lower($1) and status = 'active'`, [handle]);
  if (!row?.avatar || !row.avatar_type) return undefined;
  return { image: row.avatar, type: row.avatar_type, version: row.avatar_version };
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export async function consentFor(id: string): Promise<ConsentState> {
  const row = await one<{ terms: boolean; terms_version: string | null; personalised_ads: boolean; marketing_email: boolean; updated_at: Date }>(
    `select terms, terms_version, personalised_ads, marketing_email, updated_at from consents where account_id = $1`, [id]);
  return {
    terms: !!row?.terms,
    termsVersion: row?.terms_version ?? null,
    personalisedAds: !!row?.personalised_ads,
    marketingEmail: !!row?.marketing_email,
    updatedAt: row?.updated_at?.toISOString() ?? null,
  };
}

export interface ConsentPatch { terms?: boolean; personalisedAds?: boolean; marketingEmail?: boolean }

export async function setConsent(id: string, patch: ConsentPatch): Promise<ConsentState> {
  await query(
    `insert into consents (account_id, terms, terms_version, personalised_ads, marketing_email, updated_at)
     values ($1, coalesce($2, false), case when coalesce($2, false) then $5 else null end, coalesce($3, false), coalesce($4, false), now())
     on conflict (account_id) do update set
       terms = coalesce($2, consents.terms),
       terms_version = case when coalesce($2, consents.terms) then $5 else null end,
       personalised_ads = coalesce($3, consents.personalised_ads),
       marketing_email = coalesce($4, consents.marketing_email),
       updated_at = now()`,
    [id, patch.terms ?? null, patch.personalisedAds ?? null, patch.marketingEmail ?? null, termsVersion()]);
  return consentFor(id);
}

// ---------------------------------------------------------------------------
// Audit trail and erasure
// ---------------------------------------------------------------------------

/** Record a security- or billing-relevant account action. Detail must hold no secrets. */
export async function recordAccountEvent(id: string | null, event: string, detail: Record<string, unknown> = {}): Promise<void> {
  await query(`insert into account_events (account_id, event, detail) values ($1, $2, $3::jsonb)`,
    [id, event, JSON.stringify(detail)]);
}

/**
 * Erase the personal data on an account while leaving match history intact for the other
 * players in those matches. The handle is released, so it can be claimed again.
 */
export async function eraseAccount(id: string): Promise<void> {
  await transaction(async client => {
    await client.query(
      `update accounts set
         handle = 'deleted-' || left(replace(id::text, '-', ''), 12),
         email = 'deleted-' || left(replace(id::text, '-', ''), 12) || '@invalid',
         pending_email = null, display_name = null, country = null, favourite_faction = null,
         avatar = null, avatar_type = null, cognito_sub = null, email_verified = false,
         status = 'deleted', deleted_at = now(), updated_at = now()
       where id = $1`, [id]);
    // The participant rows stay, but stop pointing at a person.
    await client.query(`update match_participants set account_id = null, name = 'Former commander' where account_id = $1`, [id]);
    await client.query(`insert into account_events (account_id, event) values (null, 'account-erased')`);
  });
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function profileOf(row: AccountRow): Profile {
  return {
    handle: row.handle,
    email: row.email,
    pendingEmail: row.pending_email ?? undefined,
    emailVerified: row.email_verified,
    displayName: row.display_name ?? undefined,
    country: row.country ?? undefined,
    favouriteFaction: row.favourite_faction ?? undefined,
    hasAvatar: !!row.avatar_type,
    avatarVersion: row.avatar_version,
    createdAt: row.created_at.toISOString(),
    weekAnchor: row.week_anchor.toISOString(),
  };
}

/** Note a guest's visit so their weekly window has a start date. */
export async function touchGuest(guest: string): Promise<Date> {
  const row = await one<{ first_seen: Date }>(
    `insert into guests (id) values ($1)
     on conflict (id) do update set last_seen = now() returning first_seen`, [guest]);
  return row?.first_seen ?? new Date();
}
