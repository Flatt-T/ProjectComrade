// The HTTP API: accounts, billing, entitlements, advertisements, history and voting.
//
// Each route is a few lines because the work lives in the modules beside this one. Routes
// that need a database or an identity provider say so with a 503 when the deployment has
// none, rather than failing in some obscure way, so the site degrades to free open play.
import { createHash } from 'node:crypto';
import {
  AVATAR_MAX_BYTES, AVATAR_TYPES, CREDIT_PACK, GameStyle, HANDLE_MAX, MMO_NOTIFY_CHANNELS,
  PAID_TIERS, PERSISTENT_RULES_V1, PlayDecision,
  PlayKind, STYLES, Tier, allowance, handleValid, playKind, plan, tierRank,
  type MmoNotifyChannel,
} from '@comrade/contracts';
import {
  accountBySub, accountByHandle, activateAccount, applyEmailChange, avatarOf, clearAvatar, consentFor,
  eraseAccount, handleTaken, pendingByEmail, recordAccountEvent, releaseReservation, reserveAccount,
  setAvatar, setConsent, setPendingEmail, updateProfile,
} from './accounts.js';
import { adBreak, recordImpression } from './ads.js';
import { completeAdCredit, startAdCredit } from './credits.js';
import {
  SESSION_COOKIE, optionalCaller, parseSessionCookie, setSessionCookie, usernameFromAccessToken,
  verifyAccessToken,
} from './auth.js';
import * as billingApi from './billing.js';
import * as cognito from './cognito.js';
import { ads as adsConfig, authEnabled, billingEnabled, platformEnabled, termsVersion } from './config.js';
import {
  activeSubscription, entitlementsFor, openEntitlements, quotaFor, tierFromSubscription,
} from './entitlements.js';
import {
  BODY_LIMIT, Ctx, HttpError, UPLOAD_LIMIT, badRequest, conflict, del, get, limit, notFound,
  patch, post, put, unavailable, unauthorised, forbidden,
} from './http.js';
import { historyFor, matchById, parseReport, playerRecord, recordResult, slotForToken } from './history.js';
import { log } from './ops.js';
import { earlyAccessItems, lockFor } from './releases.js';
import { meFor, resolve, resolveAccount } from './viewer.js';
import { castVote, proposalPage, withdrawVote } from './votes.js';
import { mmoDatabaseConfigured, mmoOne } from './mmo/db.js';
import { resolveIdentity } from './mmo/gateway.js';
import { enterPersistentWorld } from './mmo/entry.js';
import {
  awayReportFor, listNotifications, markNotificationsRead, notificationPrefs,
  pushSubscribe, pushUnsubscribe, setNotificationPref,
} from './mmo/notify.js';
import {
  bartersForAccount, committedShieldSeconds, compoundsForPlayer, ladderBoard, MmoStoreError,
  openShieldRecordsForPlayer, openTradeOffersForPlayer, shieldBalances, signupSignalsForAccount,
  signupSignalsSharingIp, tradeAuditReport, utcShieldDay,
} from './mmo/store.js';

const str = (value: unknown, max = 200): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;
const CODE = /^[0-9]{4,10}$/;

function email(value: unknown): string {
  const address = str(value, 254).toLowerCase();
  if (!EMAIL.test(address)) throw badRequest('That does not look like an email address');
  return address;
}
function password(value: unknown): string {
  const secret = typeof value === 'string' ? value : '';
  // Cognito enforces the pool's own policy; this only catches the obvious.
  if (secret.length < 8 || secret.length > 256) throw badRequest('Passwords must be at least 8 characters', 'weak-password');
  return secret;
}
function code(value: unknown): string {
  const given = str(value, 10);
  if (!CODE.test(given)) throw badRequest('That code is not right', 'code-mismatch');
  return given;
}
function requirePlatform() { if (!platformEnabled()) throw unavailable('Accounts are not enabled on this deployment'); }
function requireAuthConfigured() { if (!authEnabled()) throw unavailable('Accounts are not enabled on this deployment'); }
function requireBilling() { if (!billingEnabled()) throw unavailable('Billing is not enabled on this deployment'); }
function tierParam(value: unknown): Tier {
  const tier = PAID_TIERS.find(t => t === value);
  if (!tier) throw badRequest('Unknown tier');
  return tier;
}
function playKindParam(value: unknown): PlayKind {
  if (value === 'classic' || value === 'fusion') return value;
  throw badRequest('Unknown match kind');
}

// ---------------------------------------------------------------------------
// Registration and sign-in
// ---------------------------------------------------------------------------

/** Is this callsign free? Used as the player types, so it is cheap and rate limited. */
post('/api/auth/handle', async (ctx: Ctx) => {
  requirePlatform();
  limit(ctx, 'handle', 60, 60_000);
  const body = await ctx.body();
  const handle = str(body.handle, HANDLE_MAX);
  if (!handleValid(handle)) {
    return { available: false, reason: 'Three to twenty letters or numbers, with single dots, dashes or underscores inside' };
  }
  return { available: !(await handleTaken(handle)), reason: null };
});

/**
 * Register a callsign against an email address. The handle is reserved in the database
 * first, so two people racing for the same name cannot both get it; if Cognito then refuses
 * the sign-up the reservation is released immediately.
 */
post('/api/auth/register', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'register', 10, 10 * 60_000);
  const body = await ctx.body();
  const handle = str(body.handle, HANDLE_MAX);
  const address = email(body.email);
  const secret = password(body.password);
  if (!handleValid(handle)) throw badRequest('That callsign is not allowed', 'handle-invalid');
  if (body.terms !== true) throw badRequest('You need to accept the terms to register', 'terms-required');

  const accountId = await reserveAccount(handle, address);
  try {
    const { sub, confirmed } = await cognito.signUp(address, secret, handle);
    await activateAccount(accountId, sub, confirmed);
    await setConsent(accountId, {
      terms: true,
      personalisedAds: body.personalisedAds === true,
      marketingEmail: body.marketingEmail === true,
    });
    await recordAccountEvent(accountId, 'registered', { confirmed });
    log('registered', { confirmed });
    return { confirmRequired: !confirmed, handle };
  } catch (error) {
    // Nobody should lose a callsign because a sign-up failed half way through.
    await releaseReservation(accountId).catch(() => undefined);
    throw error;
  }
});

post('/api/auth/confirm', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'confirm', 20, 10 * 60_000);
  const body = await ctx.body();
  const address = email(body.email);
  await cognito.confirmSignUp(address, code(body.code));
  // The account row was created at registration; mark the address verified.
  const account = await pendingByEmail(address);
  if (account) await activateAccount(account.id, account.cognito_sub ?? '', true);
  return { confirmed: true };
});

post('/api/auth/resend', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'resend', 5, 10 * 60_000);
  await cognito.resendCode(email((await ctx.body()).email));
  return { sent: true };
});

/** Sign in. The refresh token goes straight into an httpOnly cookie, never to the page. */
post('/api/auth/login', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'login', 20, 10 * 60_000);
  const body = await ctx.body();
  const address = email(body.email);
  const tokens = await cognito.signIn(address, password(body.password));
  const username = usernameFromAccessToken(tokens.accessToken) ?? address;
  if (tokens.refreshToken) setSessionCookie(ctx, tokens.refreshToken, username);
  return session(ctx, tokens.accessToken, tokens.idToken, tokens.expiresIn);
});

/** Exchange the session cookie for a fresh access token. */
post('/api/auth/refresh', async (ctx: Ctx) => {
  requireAuthConfigured();
  const cookie = ctx.cookies[SESSION_COOKIE];
  if (!cookie) throw unauthorised('No session');
  limit(ctx, 'refresh', 60, 60_000);
  const parsed = parseSessionCookie(cookie);
  let tokens: Awaited<ReturnType<typeof cognito.refresh>>;
  try {
    tokens = await cognito.refresh(parsed.refreshToken, parsed.username);
  } catch (error) {
    // Only a rejected refresh token should forget the session. A Cognito blip or
    // rate-limit must not sign the commander out.
    if (error instanceof HttpError && error.status === 401) ctx.clearCookie(SESSION_COOKIE);
    throw error;
  }
  const username = usernameFromAccessToken(tokens.accessToken) ?? parsed.username;
  setSessionCookie(ctx, tokens.refreshToken ?? parsed.refreshToken, username);
  return session(ctx, tokens.accessToken, tokens.idToken, tokens.expiresIn);
});

post('/api/auth/logout', async (ctx: Ctx) => {
  const caller = await optionalCaller(ctx);
  if (caller) await cognito.signOutEverywhere(caller.accessToken);
  ctx.clearCookie(SESSION_COOKIE);
  return { signedOut: true };
});

post('/api/auth/forgot', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'forgot', 5, 10 * 60_000);
  try {
    await cognito.forgotPassword(email((await ctx.body()).email));
  } catch (error) {
    // Never reveal whether an address is registered.
    log('forgot-password-failed', { status: (error as { status?: number }).status ?? 0 });
  }
  return { sent: true };
});

post('/api/auth/reset', async (ctx: Ctx) => {
  requireAuthConfigured();
  limit(ctx, 'reset', 10, 10 * 60_000);
  const body = await ctx.body();
  await cognito.confirmForgotPassword(email(body.email), code(body.code), password(body.password));
  return { reset: true };
});

/** Build the sign-in response: tokens for the page, plus everything it needs to render. */
async function session(ctx: Ctx, accessToken: string, idToken: string, expiresIn: number) {
  const { sub } = await verifyAccessToken(accessToken);
  const user = await cognito.getUser(accessToken);
  let account = await accountBySub(sub);
  if (!account) {
    // An account created in Cognito outside this flow still needs a local row before it can
    // play; claim its handle from `preferred_username`, or fall back to its email local part.
    const handle = user.handle && handleValid(user.handle) ? user.handle : `cmdr-${sub.slice(0, 8)}`;
    const id = await reserveAccount(handle, user.email).catch(() => undefined);
    if (id) account = await activateAccount(id, sub, user.emailVerified);
  }
  if (!account) throw conflict('This sign-in has no Comrade account yet');
  // Keep the local mirror of a verified email change in step.
  if (account.pending_email && user.email.toLowerCase() === account.pending_email.toLowerCase()) {
    await applyEmailChange(account.id, user.email);
    account = (await accountBySub(sub))!;
  }
  const subscription = await activeSubscription(account.id);
  const who = {
    account, subscription, tier: tierFromSubscription(subscription), registered: true,
    subject: { accountId: account.id } as const, anchor: account.week_anchor,
  };
  return { accessToken, idToken, expiresIn, me: await meFor(account, who) };
}

// ---------------------------------------------------------------------------
// The signed-in player
// ---------------------------------------------------------------------------

/** Profile, entitlements and consent in one call; works for guests too. */
get('/api/me', async (ctx: Ctx) => {
  if (!platformEnabled()) return { profile: null, entitlements: openEntitlements(), consent: null, open: true };
  const who = await resolve(ctx);
  if (who.account) return meFor(who.account, who);
  return { profile: null, entitlements: await entitlementsFor(who), consent: null };
});

patch('/api/me', async (ctx: Ctx) => {
  const { account, who } = await resolveAccount(ctx);
  const body = await ctx.body();
  const updated = await updateProfile(account.id, {
    displayName: body.displayName === undefined ? undefined : str(body.displayName, 64),
    country: body.country === undefined ? undefined : str(body.country, 2),
    favouriteFaction: body.favouriteFaction === undefined ? undefined : str(body.favouriteFaction, 24),
  });
  return meFor(updated, { ...who, account: updated });
});

post('/api/me/consent', async (ctx: Ctx) => {
  const { account } = await resolveAccount(ctx);
  const body = await ctx.body();
  const consent = await setConsent(account.id, {
    terms: body.terms === undefined ? undefined : body.terms === true,
    personalisedAds: body.personalisedAds === undefined ? undefined : body.personalisedAds === true,
    marketingEmail: body.marketingEmail === undefined ? undefined : body.marketingEmail === true,
  });
  await recordAccountEvent(account.id, 'consent-updated', {
    personalisedAds: consent.personalisedAds, marketingEmail: consent.marketingEmail, termsVersion: consent.termsVersion,
  });
  return consent;
});

post('/api/me/password', async (ctx: Ctx) => {
  const { account, accessToken } = await resolveAccount(ctx);
  limit(ctx, 'password', 10, 10 * 60_000);
  const body = await ctx.body();
  await cognito.changePassword(accessToken, password(body.previous), password(body.proposed));
  await recordAccountEvent(account.id, 'password-changed', {});
  return { changed: true };
});

/** Start a verified email change: Cognito emails a code to the new address. */
post('/api/me/email', async (ctx: Ctx) => {
  const { account, accessToken } = await resolveAccount(ctx);
  limit(ctx, 'email-change', 5, 60 * 60_000);
  const address = email((await ctx.body()).email);
  if (address === account.email.toLowerCase()) throw badRequest('That is already your email address');
  await cognito.requestEmailChange(accessToken, address);
  await setPendingEmail(account.id, address);
  await recordAccountEvent(account.id, 'email-change-requested', {});
  return { pendingEmail: address };
});

post('/api/me/email/confirm', async (ctx: Ctx) => {
  const { account, accessToken, who } = await resolveAccount(ctx);
  limit(ctx, 'email-confirm', 20, 60 * 60_000);
  await cognito.confirmEmailChange(accessToken, code((await ctx.body()).code));
  if (!account.pending_email) throw badRequest('No email change is waiting');
  await applyEmailChange(account.id, account.pending_email);
  await recordAccountEvent(account.id, 'email-changed', {});
  const updated = { ...account, email: account.pending_email, pending_email: null, email_verified: true };
  return meFor(updated, { ...who, account: updated });
});

post('/api/me/email/cancel', async (ctx: Ctx) => {
  const { account } = await resolveAccount(ctx);
  await setPendingEmail(account.id, null);
  return { cancelled: true };
});

/** Avatar upload: the raw image, resized to 256×256 by the browser before it is sent. */
put('/api/me/avatar', async (ctx: Ctx) => {
  const { account, who } = await resolveAccount(ctx);
  limit(ctx, 'avatar', 20, 60 * 60_000);
  const type = str(ctx.req.headers['content-type'], 64).split(';')[0];
  if (!AVATAR_TYPES.includes(type)) throw badRequest('Avatars must be WebP, PNG or JPEG');
  const image = await ctx.raw(UPLOAD_LIMIT);
  if (image.length > AVATAR_MAX_BYTES) throw badRequest('That image is too large — 256KB is the limit');
  const version = await setAvatar(account.id, image, type);
  await recordAccountEvent(account.id, 'avatar-updated', {});
  const updated = { ...account, avatar_type: type, avatar_version: version };
  return meFor(updated, { ...who, account: updated });
});

del('/api/me/avatar', async (ctx: Ctx) => {
  const { account, who } = await resolveAccount(ctx);
  await clearAvatar(account.id);
  const updated = { ...account, avatar_type: null, avatar_version: account.avatar_version + 1 };
  return meFor(updated, { ...who, account: updated });
});

/** Public avatar, cached hard and busted by the `v` query the profile hands out. */
get('/api/avatars/:handle', async (ctx: Ctx) => {
  requirePlatform();
  const avatar = await avatarOf(str(ctx.params.handle, HANDLE_MAX));
  if (!avatar) throw notFound('No avatar');
  ctx.handled = true;
  ctx.res.writeHead(200, {
    'Content-Type': avatar.type,
    'Content-Length': String(avatar.image.length),
    'Cache-Control': 'public, max-age=86400, immutable',
    ETag: `"${avatar.version}"`,
  });
  ctx.res.end(avatar.image);
});

/**
 * Erase the account. The Cognito user goes first — once that succeeds the player can no
 * longer sign in — and the personal data here is then overwritten. Match history survives
 * with the name removed, because it is also the other players' history.
 */
del('/api/me', async (ctx: Ctx) => {
  const { account, accessToken } = await resolveAccount(ctx);
  const body = await ctx.body();
  if (str(body.confirm, 20) !== 'DELETE') throw badRequest('Type DELETE to confirm', 'confirm-required');
  if (billingEnabled() && account.stripe_customer_id) {
    // Stop the money first: an erased account must not keep being charged.
    await billingApi.cancelAtPeriodEnd(account, true).catch(error => log('erase-cancel-failed', { message: String(error).slice(0, 160) }));
  }
  await cognito.deleteUser(accessToken);
  await eraseAccount(account.id);
  ctx.clearCookie(SESSION_COOKIE);
  log('account-erased', {});
  return { erased: true };
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/** Live Stripe prices. Public, because the tiers page shows them before anyone signs in. */
get('/api/billing/plans', async () => {
  if (!billingEnabled()) return { prices: [], packs: [], currency: 'gbp', configured: false };
  const catalogue = await billingApi.catalogue();
  return { ...catalogue, configured: true };
});

post('/api/billing/checkout', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  limit(ctx, 'checkout', 20, 60 * 60_000);
  const body = await ctx.body();
  const voucher = str(body.voucher, 40) || undefined;
  if (str(body.pack, 20) === CREDIT_PACK.id) {
    return billingApi.checkoutPack(account, str(body.returnPath, 120) || undefined, voucher);
  }
  return billingApi.checkout(account, tierParam(body.tier), voucher);
});

post('/api/billing/portal', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  limit(ctx, 'portal', 20, 60 * 60_000);
  const returnPath = str((await ctx.body()).returnPath, 120);
  return billingApi.portal(account, /^\/[\w\-/?=&]*$/.test(returnPath) ? returnPath : '/account/billing');
});

get('/api/billing/subscription', async (ctx: Ctx) => {
  const { who } = await resolveAccount(ctx);
  return { subscription: who.subscription ?? null, tier: who.tier };
});

/** What switching tier would cost right now, from Stripe's own proration engine. */
post('/api/billing/preview', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  return billingApi.previewChange(account, tierParam((await ctx.body()).tier));
});

post('/api/billing/change', async (ctx: Ctx) => {
  requireBilling();
  const { account, who } = await resolveAccount(ctx);
  limit(ctx, 'change-tier', 10, 60 * 60_000);
  const tier = tierParam((await ctx.body()).tier);
  if (tier === who.tier) throw badRequest('You are already on that tier');
  const direction = tierRank(tier) > tierRank(who.tier) ? 'up' : 'down';
  await billingApi.changeTier(account, tier, direction);
  const subscription = await activeSubscription(account.id);
  return { subscription: subscription ?? null, tier: tierFromSubscription(subscription), direction };
});

post('/api/billing/cancel', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  const cancel = (await ctx.body()).cancel !== false;
  await billingApi.cancelAtPeriodEnd(account, cancel);
  return { subscription: (await activeSubscription(account.id)) ?? null };
});

get('/api/billing/invoices', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  return { invoices: await billingApi.invoices(account, Number(ctx.url.searchParams.get('limit') ?? 24)) };
});

get('/api/billing/invoices/:id', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  return billingApi.invoice(account, str(ctx.params.id, 64));
});

/** Pull entitlements from Stripe now — used when a player returns from Checkout. */
post('/api/billing/sync', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  limit(ctx, 'sync', 30, 10 * 60_000);
  const sessionId = str((await ctx.body<{ session?: string }>()).session, 80);
  if (sessionId) await billingApi.fulfillSession(account, sessionId);
  await billingApi.resync(account);
  const subscription = await activeSubscription(account.id);
  const who = {
    account, subscription, tier: tierFromSubscription(subscription), registered: true,
    subject: { accountId: account.id } as const, anchor: account.week_anchor,
  };
  return meFor(account, who);
});

/** Stripe's webhook. Verified against the signing secret before anything is read. */
post('/api/stripe/webhook', async (ctx: Ctx) => {
  const raw = await ctx.raw(BODY_LIMIT * 4);
  return billingApi.applyWebhook(raw, ctx.req.headers['stripe-signature'] as string | undefined);
});

// ---------------------------------------------------------------------------
// Entitlement checks and advertisements
// ---------------------------------------------------------------------------

/**
 * Can this player start this match? Called when they ready up, so somebody with nothing left
 * is told before the room is waiting on them — and never spends a play by asking.
 */
get('/api/play/check', async (ctx: Ctx) => {
  const style = str(ctx.url.searchParams.get('style'), 40) as GameStyle;
  if (!PLAYABLE.has(style)) throw badRequest('Unknown game style');
  if (!platformEnabled()) {
    const open = openEntitlements();
    return {
      allowed: true, kind: playKind(style), tier: open.tier,
      quota: open.quotas.find(q => q.kind === playKind(style))!,
    } satisfies PlayDecision;
  }
  const who = await resolve(ctx);
  const kind = playKind(style);
  const quota = await quotaFor(who.subject, kind, who.tier, who.anchor);
  const map = str(ctx.url.searchParams.get('map'), 40);
  const lock = map ? await lockFor(map, who.tier) : { locked: false };
  const allowed = !lock.locked && (quota.remaining === null || quota.remaining > 0);
  const details = plan(who.tier);
  const outOfPlays = !lock.locked && quota.remaining !== null && quota.remaining <= 0;
  return {
    allowed, kind, tier: who.tier, quota,
    reason: lock.locked ? 'early-access' : allowed ? undefined : (who.registered ? 'quota' : 'registration-required'),
    ad: allowed && details.ads ? adBreak(await personalised(ctx, who.account?.id)) : undefined,
    canEarnByAd: outOfPlays,
  } satisfies PlayDecision;
});

post('/api/play/ad-credit', async (ctx: Ctx) => {
  requirePlatform();
  limit(ctx, 'ad-credit', 40, 60 * 60_000);
  const who = await resolve(ctx);
  const body = await ctx.body();
  const kind = playKindParam(body.kind);
  const quota = await quotaFor(who.subject, kind, who.tier, who.anchor);
  if (quota.remaining === null) throw forbidden('Your tier does not need extra matches');
  if (quota.remaining > 0) throw conflict('You already have a match left to play');
  const adsOn = who.account ? (await consentFor(who.account.id)).personalisedAds : body.personalised === true;
  return startAdCredit(who.subject, kind, adsOn);
});

post('/api/play/ad-credit/complete', async (ctx: Ctx) => {
  requirePlatform();
  limit(ctx, 'ad-credit-complete', 40, 60 * 60_000);
  const who = await resolve(ctx);
  const token = str((await ctx.body()).token, 64);
  const result = await completeAdCredit(who.subject, token);
  return {
    granted: true,
    kind: result.kind,
    entitlements: await entitlementsFor(who),
  };
});

/** Styles that can actually be launched; anything else is only a roster entry. */
const PLAYABLE = new Set<string>(STYLES.filter(s => s.playable).map(s => s.id));

/** Personalised advertising needs consent; without it the slot runs contextual ads. */
async function personalised(ctx: Ctx, accountId?: string): Promise<boolean> {
  if (accountId) return (await consentFor(accountId)).personalisedAds;
  // Guests carry their choice in the request, because they have no stored record.
  return ctx.url.searchParams.get('personalised') === 'true';
}

post('/api/ads/impression', async (ctx: Ctx) => {
  if (!platformEnabled()) return { recorded: false };
  const who = await resolve(ctx);
  const body = await ctx.body();
  await recordImpression(who.subject, {
    token: str(body.token, 64),
    provider: str(body.provider, 32) || 'unknown',
    filled: body.filled === true,
    seconds: Number(body.seconds) || 0,
  });
  return { recorded: true };
});

// ---------------------------------------------------------------------------
// History and sharing
// ---------------------------------------------------------------------------

get('/api/history', async (ctx: Ctx) => {
  const { account } = await resolveAccount(ctx);
  return historyFor(account.id, Number(ctx.url.searchParams.get('limit') ?? 20),
    str(ctx.url.searchParams.get('cursor'), 40) || undefined);
});

/** A player's public record, for their profile page and for share links. */
get('/api/players/:handle', async (ctx: Ctx) => {
  requirePlatform();
  const account = await accountByHandle(str(ctx.params.handle, HANDLE_MAX));
  if (!account) throw notFound('No such commander');
  const record = await playerRecord(account.id, account.handle);
  return {
    ...record,
    profile: {
      handle: account.handle,
      displayName: account.display_name ?? undefined,
      country: account.country ?? undefined,
      hasAvatar: !!account.avatar_type,
      avatarVersion: account.avatar_version,
      memberSince: account.created_at.toISOString(),
    },
  };
});

/** One match, public so a result can be shared. */
get('/api/matches/:id', async (ctx: Ctx) => {
  requirePlatform();
  const caller = await optionalCaller(ctx);
  const viewer = caller ? (await accountBySub(caller.sub))?.id : undefined;
  const match = await matchById(str(ctx.params.id, 40), viewer);
  if (!match) throw notFound('No such match');
  return match;
});

/** Report your own result. The token issued at kick-off decides which slot that is. */
post('/api/matches/:id/result', async (ctx: Ctx) => {
  requirePlatform();
  const body = await ctx.body();
  const matchId = str(ctx.params.id, 40);
  const slot = await slotForToken(matchId, str(body.reportToken, 64));
  return recordResult(matchId, slot, parseReport(body));
});

// ---------------------------------------------------------------------------
// Voting and content
// ---------------------------------------------------------------------------

get('/api/proposals', async (ctx: Ctx) => {
  if (!platformEnabled()) return { proposals: [], canVote: false, votesRemaining: null };
  const who = await resolve(ctx);
  return proposalPage(who.tier, who.account?.id, who.anchor);
});

post('/api/proposals/:id/vote', async (ctx: Ctx) => {
  const { account, who } = await resolveAccount(ctx);
  const value = (await ctx.body()).value === -1 ? -1 : 1;
  return castVote(account.id, who.tier, account.week_anchor, str(ctx.params.id, 64), value);
});

del('/api/proposals/:id/vote', async (ctx: Ctx) => {
  const { account, who } = await resolveAccount(ctx);
  return withdrawVote(account.id, who.tier, account.week_anchor, str(ctx.params.id, 64));
});

/** Content still inside its Gold early-access window, so the lobby can label and lock it. */
get('/api/content/early-access', async () => {
  if (!platformEnabled()) return { items: {} };
  return { items: await earlyAccessItems() };
});

/** The tier table, so the web app renders exactly what the service enforces. */
get('/api/tiers', async () => ({
  tiers: (['guest', 'free', 'bronze', 'silver', 'gold'] as Tier[]).map(id => ({
    ...plan(id),
    classicPlaysPerDay: allowance(id, 'classic'),
    fusionPlaysPerDay: allowance(id, 'fusion'),
  })),
  termsVersion: termsVersion(),
  authEnabled: authEnabled(),
  billingEnabled: billingEnabled(),
  // Privacy and cookies pages name AdSense while this is true.
  adsConfigured: adsConfig.configured(),
}));

// ---------------------------------------------------------------------------
// Persistent world entry (PW11)
// ---------------------------------------------------------------------------

/**
 * GET /api/mmo/enter — which region should this player enter?
 * Settled players return to their settlement region; newcomers get a frontier
 * region id and must still send the journaled `settle` action (settled:false).
 */
get('/api/mmo/enter', async (ctx: Ctx) => {
  if (!mmoDatabaseConfigured()) throw unavailable('Persistent world is not enabled');
  limit(ctx, 'mmo-enter', 30, 60_000);
  const identity = await resolveIdentity(String(ctx.req.headers.cookie ?? ''));
  if (!identity) throw unauthorised('Sign in to enter the persistent world');
  // PW26: sign-up signals for duplicate-account investigation, captured once
  // at durable-player creation. The client IP is stored only as a sha256 hash.
  const forwarded = String(ctx.req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = forwarded || String(ctx.req.socket?.remoteAddress ?? '');
  identity.signup = {
    ipHash: ip ? createHash('sha256').update(ip).digest('hex') : undefined,
    userAgent: String(ctx.req.headers['user-agent'] ?? '').slice(0, 500) || undefined,
  };
  try {
    const entry = await enterPersistentWorld(identity);
    return { regionId: entry.regionId, playerId: entry.playerId, settled: entry.settled };
  } catch (error) {
    if (error instanceof MmoStoreError) {
      if (error.code === 'GUEST_NOT_ALLOWED') throw forbidden(error.message);
      throw badRequest(error.message, error.code);
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// Persistent world notifications and away report (PW25)
// ---------------------------------------------------------------------------

/** The durable player row behind the request's identity, or null for guests
 *  who never entered a region. */
async function mmoPlayerId(ctx: Ctx): Promise<string | null> {
  const identity = await resolveIdentity(String(ctx.req.headers.cookie ?? ''));
  if (!identity) return null;
  const row = await mmoOne<{ player_id: string }>(
    'select player_id from player where account_id = $1', [identity.accountId]);
  return row?.player_id ?? null;
}

async function requireMmoPlayer(ctx: Ctx): Promise<string> {
  if (!mmoDatabaseConfigured()) throw unavailable('Persistent world is not enabled');
  const playerId = await mmoPlayerId(ctx);
  if (!playerId) throw unauthorised('Enter the persistent world first');
  return playerId;
}

get('/api/mmo/notifications', async (ctx: Ctx) => {
  limit(ctx, 'mmo-notifications', 60, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const [prefs, notifications] = await Promise.all([
    notificationPrefs(playerId), listNotifications(playerId),
  ]);
  return {
    prefs,
    notifications,
    unread: notifications.filter(n => n.readAt === null).length,
  };
});

put('/api/mmo/notifications/prefs', async (ctx: Ctx) => {
  limit(ctx, 'mmo-notify-prefs', 30, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const body = await ctx.body() as Record<string, unknown>;
  const channel = String(body.channel ?? '');
  if (!MMO_NOTIFY_CHANNELS.includes(channel as MmoNotifyChannel)) {
    throw badRequest('channel must be inapp, email or push');
  }
  if (typeof body.enabled !== 'boolean') throw badRequest('enabled must be a boolean');
  await setNotificationPref(playerId, channel as MmoNotifyChannel, body.enabled);
  return { prefs: await notificationPrefs(playerId) };
});

post('/api/mmo/notifications/read', async (ctx: Ctx) => {
  limit(ctx, 'mmo-notify-read', 60, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const body = (await ctx.body().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200)
    : undefined;
  const marked = await markNotificationsRead(playerId, ids);
  return { marked };
});

post('/api/mmo/push-subscriptions', async (ctx: Ctx) => {
  limit(ctx, 'mmo-push-sub', 20, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const body = await ctx.body() as Record<string, unknown>;
  const endpoint = str(body.endpoint, 2048);
  if (!endpoint.startsWith('https://')) throw badRequest('Invalid push endpoint');
  const keys = body.keys && typeof body.keys === 'object' ? body.keys : {};
  await pushSubscribe(playerId, endpoint, keys);
  return { subscribed: true };
});

del('/api/mmo/push-subscriptions', async (ctx: Ctx) => {
  limit(ctx, 'mmo-push-unsub', 20, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const body = await ctx.body() as Record<string, unknown>;
  const endpoint = str(body.endpoint, 2048);
  if (!endpoint) throw badRequest('endpoint is required');
  await pushUnsubscribe(playerId, endpoint);
  return { subscribed: false };
});

get('/api/mmo/away-report', async (ctx: Ctx) => {
  limit(ctx, 'mmo-away-report', 20, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  return awayReportFor(playerId);
});

/**
 * GET /api/mmo/protection — the player's live compounds, their OFFLINE_EARNED
 * shield records and the seconds still available to arm (PW27 shield panel).
 * Read-only: selections themselves are journaled world actions on /mmo.
 */
get('/api/mmo/protection', async (ctx: Ctx) => {
  limit(ctx, 'mmo-protection', 60, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const now = Date.now();
  const [compounds, records, balances, committed] = await Promise.all([
    compoundsForPlayer(playerId), openShieldRecordsForPlayer(playerId),
    shieldBalances(playerId), committedShieldSeconds(playerId, now),
  ]);
  const byCompound = new Map(records.map(r => [r.compound_id, r]));
  const nightlyAvail = balances.nightly.day === utcShieldDay(now)
    ? balances.nightly.seconds : BigInt(PERSISTENT_RULES_V1.nightlyShieldSeconds);
  const availableSeconds = nightlyAvail + balances.earned.seconds - committed;
  return {
    now,
    availableSeconds: Number(availableSeconds > 0n ? availableSeconds : 0n),
    nightlySeconds: Number(balances.nightly.seconds),
    earnedSeconds: Number(balances.earned.seconds),
    compounds: compounds.map(c => {
      const r = byCompound.get(c.compound_id);
      let remainingSeconds: number | null = null;
      let endsAt: string | null = null;
      if (r?.status === 'armed') {
        remainingSeconds = Number(r.armed_seconds);
      } else if (r?.status === 'active' && r.ends_at_ms !== null) {
        const left = BigInt(Math.max(0, Number(r.ends_at_ms) - Math.max(Number(r.started_at_ms ?? 0), now)));
        remainingSeconds = Number(left / 1000n + (left % 1000n > 0n ? 1n : 0n));
        endsAt = new Date(Number(r.ends_at_ms)).toISOString();
      }
      return {
        compoundId: c.compound_id,
        regionId: c.region_id,
        state: c.state,
        record: r ? {
          kind: r.kind, status: r.status,
          armedSeconds: Number(r.armed_seconds),
          remainingSeconds, endsAt,
        } : null,
      };
    }),
  };
});

/**
 * GET /api/mmo/trade-offers — the player's open barter offers split into
 * incoming (awaiting their acceptance) and outgoing (awaiting the other side).
 * Read-only: offers are created and resolved through journaled /mmo commands.
 */
get('/api/mmo/trade-offers', async (ctx: Ctx) => {
  limit(ctx, 'mmo-trade-offers', 60, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const offers = await openTradeOffersForPlayer(playerId);
  return {
    incoming: offers.filter(o => o.to_player_id === playerId),
    outgoing: offers.filter(o => o.from_player_id === playerId),
  };
});

/**
 * GET /api/mmo/ladder?board=player|alliance&period=30d|all — the top of a
 * ladder board (PW24). Player boards default to the caller; the alliance
 * board shows the caller's alliance. Boards are materialized from journaled
 * LADDER_AWARD operations, so totals are rebuildable from the journal.
 */
get('/api/mmo/ladder', async (ctx: Ctx) => {
  limit(ctx, 'mmo-ladder', 60, 60_000);
  const playerId = await requireMmoPlayer(ctx);
  const board = ctx.url.searchParams.get('board') === 'alliance' ? 'alliance' : 'player';
  const period = ctx.url.searchParams.get('period') === 'all' ? 'all' : '30d';
  const row = await mmoOne<{ world_id: string; alliance_id: string | null }>(
    `select s.world_id,
            (select m.alliance_id from alliance_member m
               join alliance a on a.alliance_id = m.alliance_id
              where a.world_id = s.world_id and a.disbanded_at is null
                and m.player_id = s.player_id and m.left_at is null) as alliance_id
       from settlement s where s.player_id = $1`,
    [playerId]);
  if (!row) throw badRequest('Settle in the persistent world first');
  if (board === 'player') {
    return { board, period, rows: await ladderBoard(row.world_id, 'player', period) };
  }
  if (!row.alliance_id) return { board, period, rows: [] };
  return { board, period, rows: await ladderBoard(row.world_id, 'alliance', period) };
});

// ---------------------------------------------------------------------------
// Persistent world trade audit + signup signals (PW26) � ops-only endpoints.
// ---------------------------------------------------------------------------

/** Ops gate: the report exposes other players' trades, so it requires the
 *  deployment's MMO_AUDIT_KEY shared secret rather than a player session. */
function requireAudit(ctx: Ctx): void {
  const key = process.env.MMO_AUDIT_KEY;
  if (!key) throw unavailable('Trade audit is not enabled on this deployment');
  if (String(ctx.req.headers['x-mmo-audit-key'] ?? '') !== key) {
    throw unauthorised('Audit key required');
  }
}

async function auditWorldId(): Promise<string> {
  const row = await mmoOne<{ world_id: string }>(
    'select world_id from world order by created_at limit 1');
  if (!row) throw notFound('No persistent world');
  return row.world_id;
}

/**
 * GET /api/mmo/trade-audit � settled barters flagged as high-value one-sided
 * trades between young accounts (the scripted-funnelling pattern). Every
 * settled barter is queryable by account at /api/mmo/trade-audit/account.
 */
get('/api/mmo/trade-audit', async (ctx: Ctx) => {
  limit(ctx, 'mmo-trade-audit', 10, 60_000);
  requireAudit(ctx);
  if (!mmoDatabaseConfigured()) throw unavailable('Persistent world is not enabled');
  const young = Number(ctx.url.searchParams.get('youngDays') ?? '');
  const minValue = Number(ctx.url.searchParams.get('minValue') ?? '');
  return {
    flags: await tradeAuditReport(await auditWorldId(), {
      youngAccountDays: Number.isFinite(young) && young > 0 ? young : undefined,
      minValue: Number.isFinite(minValue) && minValue > 0 ? minValue : undefined,
    }),
  };
});

/** GET /api/mmo/trade-audit/account?account=<uuid> � every settled barter for an account. */
get('/api/mmo/trade-audit/account', async (ctx: Ctx) => {
  limit(ctx, 'mmo-trade-audit-account', 30, 60_000);
  requireAudit(ctx);
  if (!mmoDatabaseConfigured()) throw unavailable('Persistent world is not enabled');
  const account = ctx.url.searchParams.get('account') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(account)) throw badRequest('account must be a uuid');
  return { trades: await bartersForAccount(await auditWorldId(), account) };
});

/**
 * GET /api/mmo/signup-signals?account=<uuid> or ?ip=<address> � the sign-up
 * signals recorded at first persistent-world entry, for duplicate-account
 * investigation. Raw IPs are hashed before storage; pass the address and the
 * same hash is computed here.
 */
get('/api/mmo/signup-signals', async (ctx: Ctx) => {
  limit(ctx, 'mmo-signup-signals', 30, 60_000);
  requireAudit(ctx);
  if (!mmoDatabaseConfigured()) throw unavailable('Persistent world is not enabled');
  const account = ctx.url.searchParams.get('account') ?? '';
  const ip = ctx.url.searchParams.get('ip') ?? '';
  if (account) {
    if (!/^[0-9a-f-]{36}$/i.test(account)) throw badRequest('account must be a uuid');
    return { signals: await signupSignalsForAccount(account) };
  }
  if (ip) {
    const ipHash = createHash('sha256').update(ip).digest('hex');
    return { signals: await signupSignalsSharingIp(ipHash) };
  }
  throw badRequest('Pass account=<uuid> or ip=<address>');
});
