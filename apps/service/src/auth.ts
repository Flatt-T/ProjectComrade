// Who is calling: a signed-in account, or a guest identified by a signed cookie.
//
// Access tokens are verified against the Cognito pool's published JWKS, so the service never
// trusts a token's contents without checking its signature, issuer, audience and expiry.
// Refresh tokens live only in an httpOnly cookie — they are never readable by page scripts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { authEnabled, cognito, guestSecret } from './config.js';
import { Ctx, forbidden, unauthorised } from './http.js';

export const SESSION_COOKIE = 'cmrd_session';
export const GUEST_COOKIE = 'cmrd_guest';
/** Cognito refresh tokens last 30 days by default; the cookie matches. */
export const SESSION_DAYS = 30;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksFor = '';

function keys() {
  const url = cognito.jwksUrl();
  if (!jwks || jwksFor !== url) {
    // jose caches and re-fetches the key set on rotation by itself.
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60_000, timeoutDuration: 8_000 });
    jwksFor = url;
  }
  return jwks;
}

export interface AccessClaims extends JWTPayload { sub: string; username?: string; client_id?: string; token_use?: string }

/** Verify a Cognito *access* token. Throws 401 for anything that does not check out. */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  if (!authEnabled()) throw unauthorised('Accounts are not configured on this deployment');
  try {
    const { payload } = await jwtVerify(token, keys(), { issuer: cognito.issuer() });
    const claims = payload as AccessClaims;
    // An id token must never be accepted where an access token is required: only the access
    // token carries the scopes Cognito's own user APIs check.
    if (claims.token_use !== 'access') throw new Error('wrong token use');
    if (claims.client_id && claims.client_id !== cognito.clientId()) throw new Error('wrong client');
    if (!claims.sub) throw new Error('no subject');
    return claims;
  } catch {
    throw unauthorised('Your session has expired — sign in again');
  }
}

/** The bearer token on this request, if any. */
export function bearer(ctx: Ctx): string | undefined {
  const header = ctx.req.headers.authorization;
  if (!header || !/^Bearer /i.test(header)) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

export interface Caller { sub: string; accessToken: string }

/** Require a verified signed-in caller. */
export async function requireCaller(ctx: Ctx): Promise<Caller> {
  const token = bearer(ctx);
  if (!token) throw unauthorised();
  const claims = await verifyAccessToken(token);
  return { sub: claims.sub, accessToken: token };
}

/** The verified caller, or undefined when the request is anonymous. */
export async function optionalCaller(ctx: Ctx): Promise<Caller | undefined> {
  const token = bearer(ctx);
  if (!token || !authEnabled()) return undefined;
  try {
    const claims = await verifyAccessToken(token);
    return { sub: claims.sub, accessToken: token };
  } catch {
    // An expired token on an optional route simply means "treat this as a guest".
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

function sign(id: string): string {
  return createHmac('sha256', guestSecret()).update(id).digest('base64url').slice(0, 24);
}

/**
 * Read the guest id out of a raw Cookie header, verifying its signature so a hand-made
 * cookie cannot claim somebody else's allowance. Used on the WebSocket upgrade, which has
 * cookies but no request context.
 */
export function guestIdFromCookieHeader(header: string | undefined): string | undefined {
  const match = /(?:^|;\s*)cmrd_guest=([^;]+)/.exec(header ?? '');
  if (!match) return undefined;
  try { return verifyGuestCookie(decodeURIComponent(match[1])); } catch { return undefined; }
}

/** Read the guest id from its cookie, verifying the signature so it cannot be hand-made. */
export function guestId(ctx: Ctx): string | undefined {
  const raw = ctx.cookies[GUEST_COOKIE];
  return raw ? verifyGuestCookie(raw) : undefined;
}

function verifyGuestCookie(raw: string): string | undefined {
  const [id, mac] = raw.split('.');
  if (!id || !mac || !/^[A-Za-z0-9_-]{16,32}$/.test(id)) return undefined;
  const want = Buffer.from(sign(id)), given = Buffer.from(mac);
  return want.length === given.length && timingSafeEqual(want, given) ? id : undefined;
}

/** The caller's guest id, issuing and setting one when they do not have it yet. */
export function ensureGuestId(ctx: Ctx): string {
  const existing = guestId(ctx);
  if (existing) return existing;
  const id = randomBytes(12).toString('base64url');
  ctx.setCookie(GUEST_COOKIE, `${id}.${sign(id)}`, { maxAge: 400 * 24 * 3600 });
  return id;
}

/** Store the Cognito refresh token where page scripts cannot reach it. */
export function setSessionCookie(ctx: Ctx, refreshToken: string) {
  ctx.setCookie(SESSION_COOKIE, refreshToken, { maxAge: SESSION_DAYS * 24 * 3600, sameSite: 'Lax' });
}

export function requireVoting(canVote: boolean) {
  if (!canVote) throw forbidden('Voting rights come with a Gold subscription');
}
