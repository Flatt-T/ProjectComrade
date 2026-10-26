// The HTTP API: accounts, billing, entitlements, advertisements, history and voting.
//
// Each route is a few lines because the work lives in the modules beside this one. Routes
// that need a database or an identity provider say so with a 503 when the deployment has
// none, rather than failing in some obscure way, so the site degrades to free open play.
import {
  AVATAR_MAX_BYTES, AVATAR_TYPES, GameStyle, HANDLE_MAX, PAID_TIERS, PlayDecision, STYLES, Tier,
  allowance, handleValid, playKind, plan, tierRank,
} from '@comrade/contracts';
import {
  accountBySub, accountByHandle, activateAccount, applyEmailChange, avatarOf, clearAvatar, consentFor,
  eraseAccount, handleTaken, pendingByEmail, recordAccountEvent, releaseReservation, reserveAccount,
  setAvatar, setConsent, setPendingEmail, updateProfile,
} from './accounts.js';
import { adBreak, recordImpression } from './ads.js';
import { SESSION_COOKIE, optionalCaller, setSessionCookie, verifyAccessToken } from './auth.js';
import * as billingApi from './billing.js';
import * as cognito from './cognito.js';
import { ads as adsConfig, authEnabled, billingEnabled, platformEnabled, termsVersion } from './config.js';
import {
  activeSubscription, entitlementsFor, openEntitlements, quotaFor, tierFromSubscription,
} from './entitlements.js';
import {
  BODY_LIMIT, Ctx, UPLOAD_LIMIT, badRequest, conflict, del, get, limit, notFound,
  patch, post, put, unavailable, unauthorised,
} from './http.js';
import { historyFor, matchById, parseReport, playerRecord, recordResult, slotForToken } from './history.js';
import { log } from './ops.js';
import { earlyAccessItems, lockFor } from './releases.js';
import { meFor, resolve, resolveAccount } from './viewer.js';
import { castVote, proposalPage, withdrawVote } from './votes.js';

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
  if (tokens.refreshToken) setSessionCookie(ctx, tokens.refreshToken);
  return session(ctx, tokens.accessToken, tokens.idToken, tokens.expiresIn);
});

/** Exchange the session cookie for a fresh access token. */
post('/api/auth/refresh', async (ctx: Ctx) => {
  requireAuthConfigured();
  const cookie = ctx.cookies[SESSION_COOKIE];
  if (!cookie) throw unauthorised('No session');
  limit(ctx, 'refresh', 60, 60_000);
  try {
    const tokens = await cognito.refresh(cookie);
    return session(ctx, tokens.accessToken, tokens.idToken, tokens.expiresIn);
  } catch (error) {
    // A refresh token that no longer works should not keep being retried.
    ctx.clearCookie(SESSION_COOKIE);
    throw error;
  }
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
  if (!billingEnabled()) return { prices: [], currency: 'gbp', configured: false };
  const catalogue = await billingApi.catalogue();
  return { ...catalogue, configured: true };
});

post('/api/billing/checkout', async (ctx: Ctx) => {
  requireBilling();
  const { account } = await resolveAccount(ctx);
  limit(ctx, 'checkout', 20, 60 * 60_000);
  return billingApi.checkout(account, tierParam((await ctx.body()).tier));
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
  return {
    allowed, kind, tier: who.tier, quota,
    reason: lock.locked ? 'early-access' : allowed ? undefined : (who.registered ? 'quota' : 'registration-required'),
    ad: allowed && details.ads ? adBreak(await personalised(ctx, who.account?.id)) : undefined,
  } satisfies PlayDecision;
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
    classicPlaysPerWeek: allowance(id, 'classic'),
    fusionPlaysPerWeek: allowance(id, 'fusion'),
  })),
  termsVersion: termsVersion(),
  authEnabled: authEnabled(),
  billingEnabled: billingEnabled(),
  // The privacy and cookies pages name third-party networks only while one is really serving.
  adsConfigured: adsConfig.tags().length > 0,
}));
