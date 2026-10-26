# Paid platform setup

Everything in the application is built and deployed. This is the provisioning that has to
happen outside the repository, in order, before the paid service can open.

Nothing here is optional-but-forgotten: **until `DATABASE_URL` is set the service runs exactly
as it did before billing existed** — open, unmetered, no accounts, no advertisements. Each
block below switches on one more layer, and each can be done and verified on its own:

| Set this | What turns on |
|---|---|
| `DATABASE_URL` | Guest allowances, match history, the play ledger |
| `+ COGNITO_*` | Registration, sign-in, profiles, the free tier |
| `+ STRIPE_*` | Subscriptions, invoices, tier changes |
| `+ COMRADE_AD_TAGS` | Real advertisements (the house advertisement runs without them) |

`/health` reports which of the four are configured, so a deploy can be checked at a glance.

---

## 1. Postgres

The service VM (LXC 280, `10.1.0.60`) and `postgres-core-01` (`10.1.0.35`) are on the same
`10.1.0.0/24` bridge, so no new networking is needed.

On `postgres-core-01`:

```sql
create role comrade_app with login password '<generate a long random password>';
create database comrade owner comrade_app;
```

The service creates and owns its own `comrade` schema inside that database and applies its
migrations itself on startup, so the role needs nothing beyond ownership of the database.
Migrations run inside a transaction each; if one fails the service **refuses to start** rather
than serve on a half-migrated schema.

Then on the service host, in `/opt/comrade/service.env`:

```
DATABASE_URL=postgresql://comrade_app:<password>@10.1.0.35:5432/comrade
```

Add `?sslmode=require` if the server is presenting TLS, and `DATABASE_SSL_VERIFY=true` once a
certificate the host trusts is in place (it defaults to not verifying, so an internal
self-signed certificate cannot stop the service from starting).

Include this database in the existing WAL-G backup set — it holds the subscription mirror and
every player's record.

## 2. AWS Cognito

One user pool, one app client, in `eu-west-2`.

**User pool**
- Sign-in: **email** (email as the username alias).
- Required attributes: `email`. Also writable: `preferred_username` (the service writes the
  callsign here for display; uniqueness is enforced in Postgres, not Cognito).
- Email verification: **code** (not link) — the UI asks for a 6-digit code.
- Password policy: minimum 8 characters. The API rejects anything shorter before Cognito sees it.
- Self-registration: enabled.
- MFA: off. The sign-in flow does not handle an MFA challenge yet and will say so plainly
  rather than fail obscurely if one is ever turned on.
- Account recovery: email only.
- From address: a verified SES identity on the project's domain, so confirmation and reset
  codes do not land in spam.

**App client**
- Type: **confidential** (with a secret) or public (without) — both work; the service computes
  `SECRET_HASH` when `COGNITO_CLIENT_SECRET` is set.
- Auth flows: `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`. **Both are required.**
- Token expiry: access token 1 hour, refresh token 30 days (the session cookie matches 30 days).
- No hosted UI, no callback URLs, no identity providers: the service talks to the Cognito API
  directly and renders its own forms, so players never leave the site.

```
COGNITO_REGION=eu-west-2
COGNITO_USER_POOL_ID=eu-west-2_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_CLIENT_SECRET=          # only if the client was created with one
```

The service needs **no AWS credentials and no IAM role**. Every call it makes (sign-up,
sign-in, password reset, email change, delete) is either unauthenticated or authorised by the
player's own access token, so none of them needs request signing.

## 3. Stripe

Three products, each with one monthly GBP price, and the **`lookup_key` is what binds them to
the tiers** — the application never stores an amount:

| Product | Price | `lookup_key` |
|---|---|---|
| Comrade Bronze | £3.49 / month | `comrade_bronze_monthly` |
| Comrade Silver | £7.49 / month | `comrade_silver_monthly` |
| Comrade Gold | £9.79 / month | `comrade_gold_monthly` |

Set the lookup key exactly. Change a price later by creating a new price and moving the lookup
key to it; the site picks it up within a minute and nothing needs redeploying.

**Also configure**
- **Tax:** enable Stripe Tax and set the prices as **VAT-inclusive** if £3.49 is the price the
  customer pays. Checkout then collects a billing address (`STRIPE_AUTOMATIC_TAX=true`, the
  default). Set `STRIPE_AUTOMATIC_TAX=false` to switch that off.
- **Customer Portal:** switch on *update payment method*, *cancel subscription*, *invoice
  history*, and allow switching between the three products. The site's own tier-change flow
  quotes the proration and applies it directly; the portal is the fallback and handles cards.
- **Customer emails:** turn on successful payments and failed payments. The service sends no
  email of its own.
- **Dunning:** set the retry schedule and what happens when retries run out (cancel).
- **Webhook endpoint:** `https://projectcomrade.thunderchildcreativetechnologies.com/api/stripe/webhook`
  subscribed to:
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`,
  `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `customer.deleted`.

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The signature is verified before the payload is read, every event id is recorded before it is
applied, and a redelivery changes nothing — Stripe can retry freely.

## 4. Advertising

The service never talks to an ad network. It hands the browser an **ordered waterfall of VAST
tag URLs** which the IMA SDK plays, falling to the next tag on an error or timeout and finally
to the house advertisement. Highest paying first:

```
COMRADE_AD_TAGS=[{"provider":"gam","tag":"https://pubads.g.doubleclick.net/gampad/ads?..."},{"provider":"partner","tag":"https://..."}]
COMRADE_AD_SECONDS=30
COMRADE_AD_TIMEOUT_MS=8000
```

Tags must be `https`. `[CACHEBUSTER]`, `[TIMESTAMP]` and `[RANDOM]` are substituted per
request, and `npa=1` is appended to Google tags when the viewer has not consented to
personalisation. Adding, reordering or dropping a network is an environment change only.

With no tags set the slot still runs for its full thirty seconds showing the house
advertisement, so the flow, the timing and the delayed start are all live and testable from day
one. Most gaming ad networks require existing traffic before they will approve an account —
launching on the house advertisement and adding tags later is the normal path.

**Before enabling a network that requires IAB TCF consent strings**, a certified consent
management platform has to be added; the current banner records a plain personalised/not
choice, which is enough for a non-personalised serve and for Google's `npa=1`.

## 5. The rest of the environment

```
COMRADE_PUBLIC_URL=https://projectcomrade.thunderchildcreativetechnologies.com
COMRADE_TERMS_VERSION=2026-10-26          # bump to re-request acceptance
COMRADE_GUEST_SECRET=<32+ random chars>   # signs the guest cookie
```

Set `COMRADE_GUEST_SECRET`. Without it one is generated per boot, which means guest
allowances reset on every deploy.

House advertisement copy, if you want something other than the upgrade pitch:
`COMRADE_HOUSE_HEADLINE`, `COMRADE_HOUSE_BODY`, `COMRADE_HOUSE_CTA`, `COMRADE_HOUSE_HREF`.

## 6. Before opening to the public

- [ ] Fill in every `[NEEDS YOUR TEXT]` block in `apps/web/src/pages/Legal.tsx` — company
      address and registration, liability and governing law, the refund rule inside 14 days,
      retention periods, and the advertising networks you actually enable — and have the result
      reviewed. The pages render a visible draft warning until this is done.
- [ ] Check the tier table on `/tiers` against what the service enforces. Both read the same
      table in `packages/contracts/src/billing.ts`, so they cannot disagree, but read it once.
- [ ] Register in Stripe **test mode** first and walk the whole path: register → confirm →
      subscribe → upgrade → downgrade → cancel → invoice PDF.
- [ ] Confirm the webhook is arriving (Stripe shows deliveries) and that `/api/me` reports the
      bought tier within a second or two of Checkout.
- [ ] Play one free match end to end and watch the advertisement run while your base sits idle.

## How entitlements actually work

Worth knowing before changing anything:

- **The tier table is data**, in `packages/contracts/src/billing.ts`. Quotas, advertisement
  rules, voting and early access all come from there, and both the UI and the enforcement read
  the same table.
- **A play is a row** in `play_ledger`. The quota check counts rows since the start of the
  current window; there is no running total to drift, and a refund is a deleted row.
- **The week is anchored to registration**, not the calendar: each player's allowance renews on
  their own day. Guests are anchored to the first time we saw their signed cookie.
- **A play is spent on match start, for every human in the room**, in one place
  (`apps/service/src/matchstart.ts`). Either everyone entering is entitled and all the
  allowances are spent together, or nothing is spent and the room stays in the lobby. A player
  with nothing left cannot ready up, so a room can never be held by someone who cannot enter.
- **The advertisement is an overlay, not a gate.** The simulation starts on the first tick for
  everyone; an advertising player's orders are held back until it finishes. That is what makes
  the delayed start real — thirty seconds of an idle base — while every subscriber plays on, and
  it is why no lockstep peer ever waits for an advertisement. Holding a client at turn zero
  instead would stall the whole match, because `LockstepSession` only advances once every
  human's turn packet has arrived.
- **Entitlements are written by webhooks**, which are the source of truth, and also refreshed
  when a player returns from Checkout — so a slow or retried webhook never leaves somebody
  staring at a tier they have paid for.
- **Early access is a date.** Record a map or pack in `content_releases` with its publish date
  and it is Gold-only for seven days, then open to everyone with no further action. Content
  with no row has always been available, so nothing existing was locked by adding this.
