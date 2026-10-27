// Every environment variable the paid platform reads, in one place.
//
// Nothing here throws at import time. Each subsystem reports whether it is configured, and
// the API switches the matching features off rather than failing to start — so the service
// boots and serves gameplay with no database, no Cognito pool and no Stripe keys.
import { databaseConfigured } from './db.js';

function text(name: string, fallback = ''): string { return process.env[name]?.trim() || fallback; }
function whole(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

/** Public origin, used for Stripe redirects and share links. */
export function publicUrl(): string {
  return text('COMRADE_PUBLIC_URL', 'https://projectcomrade.thunderchildcreativetechnologies.com').replace(/\/$/, '');
}

export const cognito = {
  region: () => text('COGNITO_REGION', 'eu-west-2'),
  userPoolId: () => text('COGNITO_USER_POOL_ID'),
  clientId: () => text('COGNITO_CLIENT_ID'),
  /** Only set when the app client was created with a secret; SECRET_HASH is then required. */
  clientSecret: () => text('COGNITO_CLIENT_SECRET'),
  configured: () => !!(text('COGNITO_USER_POOL_ID') && text('COGNITO_CLIENT_ID')),
  endpoint: () => `https://cognito-idp.${text('COGNITO_REGION', 'eu-west-2')}.amazonaws.com/`,
  jwksUrl: () => `https://cognito-idp.${text('COGNITO_REGION', 'eu-west-2')}.amazonaws.com/${text('COGNITO_USER_POOL_ID')}/.well-known/jwks.json`,
  issuer: () => `https://cognito-idp.${text('COGNITO_REGION', 'eu-west-2')}.amazonaws.com/${text('COGNITO_USER_POOL_ID')}`,
};

export const stripe = {
  secretKey: () => text('STRIPE_SECRET_KEY'),
  webhookSecret: () => text('STRIPE_WEBHOOK_SECRET'),
  configured: () => !!text('STRIPE_SECRET_KEY'),
  /** Enables Stripe Tax on Checkout so UK VAT is calculated and shown. */
  automaticTax: () => text('STRIPE_AUTOMATIC_TAX', 'false') === 'true',
  /** Lets Checkout accept promotion codes. */
  promotionCodes: () => text('STRIPE_PROMOTION_CODES', 'true') === 'true',
};

/** One rung of the advertising waterfall, highest paying first. */
export interface AdTag { provider: string; tag: string }

export const ads = {
  seconds: () => whole('COMRADE_AD_SECONDS', 30),
  timeoutMs: () => whole('COMRADE_AD_TIMEOUT_MS', 8_000),
  /**
   * COMRADE_AD_TAGS is a JSON array ordered by what each network pays, e.g.
   * [{"provider":"gam","tag":"https://pubads.g.doubleclick.net/gampad/ads?..."}]
   * `[PLACEHOLDER]` macros in a tag are substituted per request (see ads.ts). With none
   * configured the house advertisement runs, so the pre-match slot works from day one.
   */
  tags: (): AdTag[] => {
    try {
      const parsed: unknown = JSON.parse(text('COMRADE_AD_TAGS', '[]'));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((t): t is AdTag => !!t && typeof t === 'object'
          && typeof (t as AdTag).tag === 'string' && /^https:\/\//.test((t as AdTag).tag))
        .map(t => ({ provider: String(t.provider || 'network').slice(0, 32), tag: t.tag }))
        .slice(0, 8);
    } catch { return []; }
  },
  house: () => ({
    headline: text('COMRADE_HOUSE_HEADLINE', 'Skip the advertisements'),
    body: text('COMRADE_HOUSE_BODY', 'Bronze removes the pre-match break and unlocks unlimited Classic play.'),
    cta: text('COMRADE_HOUSE_CTA', 'See the tiers'),
    href: text('COMRADE_HOUSE_HREF', '/tiers'),
  }),
};

/** Bumped whenever the terms change, so acceptance can be re-requested. */
export function termsVersion(): string { return text('COMRADE_TERMS_VERSION', '2026-10-26'); }

/** Secret used to sign the guest cookie. Generated per boot when unset, which simply means
 *  guest allowances reset on deploy — acceptable, and better than a predictable default. */
export function guestSecret(): string { return text('COMRADE_GUEST_SECRET', bootSecret); }
const bootSecret = Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Cookies are Secure unless explicitly relaxed for local http development. */
export function cookieSecure(): boolean { return text('COMRADE_COOKIE_INSECURE') !== 'true'; }

/** Accounts, quotas and billing all need the database; without it the platform stays open. */
export function platformEnabled(): boolean { return databaseConfigured(); }
export function authEnabled(): boolean { return platformEnabled() && cognito.configured(); }
export function billingEnabled(): boolean { return authEnabled() && stripe.configured(); }

/** A snapshot for /health and the ops log, with no secret values in it. */
export function configSummary() {
  return {
    database: databaseConfigured(), cognito: cognito.configured(), stripe: stripe.configured(),
    adTags: ads.tags().length, publicUrl: publicUrl(), termsVersion: termsVersion(),
  };
}
