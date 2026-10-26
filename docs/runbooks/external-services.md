# External services: what to set up, and what it costs

A description of every third party the paid platform depends on — what each one is for, what
has to be created, what it will cost, what it issues back, and what blocks what.

This is the **procurement and ownership** view: which accounts to open and who holds them. The
step-by-step configuration (exact toggles, env var names, the SQL) is in
[paid-platform-setup.md](paid-platform-setup.md). Do that one second.

---

## At a glance

| Service | What for | New account? | Cost | Blocks |
|---|---|---|---|---|
| **Postgres** on `postgres-core-01` | Accounts, allowances, history, subscription mirror | No — exists | £0 | Everything |
| **AWS Cognito** | Sign-in credentials, email confirmation, password reset | AWS account needed | ~£0 at this scale | Registration, all paid tiers |
| **AWS SES** | Sending those confirmation and reset codes | Same AWS account | ~£0.08 per 1,000 | Registration |
| **Stripe** | Subscriptions, payments, invoices, VAT | Yes | 1.5% + 20p per transaction | Subscriptions only |
| **Advertising network** | Filling the pre-match slot | Yes, with approval | Earns money | Ad revenue only |
| **Cloudflare / DNS** | Already fronting the site | No — exists | £0 | Stripe webhooks |

**Nothing blocks the site staying up.** With none of these configured the service runs exactly
as it does today: open, unmetered, no accounts. Each one switches on one more layer
independently, and `/health` reports which are live.

**Suggested order:** Postgres → Cognito + SES → Stripe (test mode, then live) → advertising last,
because ad networks usually want to see traffic before they will approve you.

---

## 1. Postgres — already yours

Nothing to buy. `postgres-core-01` (VMID 235, `10.1.0.35`) is on the same bridge as the
Comrade LXC (280, `10.1.0.60`), so there is no new networking and no new vendor.

**What's needed:** one role and one database, created by whoever administers that VM. The
service creates and owns its own `comrade` schema inside it and runs its own migrations.

**What it issues back:** a connection string, which goes in `/opt/comrade/service.env` as
`DATABASE_URL`.

**Don't forget:** add the new database to the existing WAL-G backup set. It holds every
player's record and the subscription mirror. Losing it means losing who paid for what — which
is recoverable from Stripe, but only by hand.

**Cost:** nothing beyond the capacity already running.

---

## 2. AWS — Cognito and SES

### What Cognito is doing here

It holds sign-in credentials and nothing else. It is deliberately a small part of the system:

- It stores the password (hashed — we never see it) and verifies sign-ins.
- It emails the 6-digit confirmation and password-reset codes.
- It verifies a new email address before an account moves to it.

It does **not** own callsigns (Postgres does, so uniqueness can be enforced atomically), does
not hold profiles, and is not used for the hosted sign-in pages — players never leave the site,
and the forms are ours.

### What has to be created

An AWS account if there isn't one, then in **eu-west-2 (London)**:

1. **A Cognito user pool** — email sign-in, email verification by *code* (not link), 8-character
   minimum password, self-registration on, MFA off.
2. **One app client** on that pool, with the `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH`
   flows enabled. No hosted UI, no callback URLs, no social providers.
3. **An SES identity** on the project's domain, verified with DKIM, so the codes come from your
   domain and reach inboxes. New SES accounts start in a sandbox that only emails verified
   addresses — **request production access early**, it can take a day or two.

### What it issues back

A user pool id, an app client id, and optionally a client secret. All three go in
`service.env`. **No AWS access keys and no IAM role are needed** — every call the service makes
to Cognito is either unauthenticated or authorised by the player's own token, so there is no
long-lived AWS credential to issue, rotate or lose.

### Cost

Cognito's free tier covers 10,000 monthly active users; realistically £0 for a long while. SES
is about 8p per thousand emails, and you only send on registration, password reset and email
change — pennies a month.

### Decisions for you

- **Which AWS account.** A separate one for this project is tidier than sharing with the
  MediaFAIre estate, and keeps the billing obvious. Either works.
- **The from-address** on confirmation emails, e.g. `no-reply@` your domain.
- **Whether the app client has a secret.** Both are supported. With one is marginally better
  since the client is server-side only.

---

## 3. Stripe

### What Stripe is doing here

Everything to do with money. Checkout pages, card storage, the customer portal, VAT
calculation, invoices and PDFs, failed-payment retries, and the emails about them. The
application stores a customer reference and a mirror of the subscription state — nothing else.

**No price exists in the codebase.** Every amount shown anywhere is fetched live from Stripe by
a `lookup_key`, so changing a price is a change in the Stripe dashboard with no deployment.

### What has to be created

1. **A Stripe account** for the operating entity, with its bank details and identity
   verification completed — this takes longest, so start it early.
2. **Three products**, each with one monthly GBP price, and the `lookup_key` set exactly:

   | Product | Price | `lookup_key` |
   |---|---|---|
   | Comrade Bronze | £3.49/month | `comrade_bronze_monthly` |
   | Comrade Silver | £7.49/month | `comrade_silver_monthly` |
   | Comrade Gold | £9.79/month | `comrade_gold_monthly` |

   The lookup key is the contract between Stripe and the application. Get it wrong and that tier
   simply cannot be bought.
3. **Stripe Tax**, with the prices set VAT-inclusive if £3.49 is what the customer pays.
4. **The Customer Portal** configured to allow card updates, cancellation, invoice history and
   switching between the three products.
5. **A webhook endpoint** at `/api/stripe/webhook` on the live domain, subscribed to the ten
   events listed in the setup runbook.

### What it issues back

A secret key and a webhook signing secret, both into `service.env`. Use the **test mode** pair
first and walk the whole path before going live.

### Cost

UK cards are 1.5% + 20p per transaction. On £3.49 that is about 25p, so roughly 7%; on £9.79
about 35p, roughly 3.6%. Stripe Tax adds 0.5% per transaction where it calculates tax. No
monthly fee.

### Decisions for you

- **VAT registration.** If the entity is VAT registered, prices should be VAT-inclusive and
  Stripe Tax should be on. If it isn't, turn Stripe Tax off (`STRIPE_AUTOMATIC_TAX=false`) and
  the checkout will stop asking for a billing address. Worth deciding before launch, because
  turning VAT on later effectively cuts your net price by a sixth unless you raise prices.
- **Free trials.** Supported — set trial days on the price and the tiers page will show it. None
  configured at the moment.
- **Promotion codes.** On by default; the checkout shows a code box.
- **Statement descriptor** — what shows on a card statement. Make it recognisable or you will
  get chargebacks from people who don't recognise the name.

---

## 4. Advertising

### How it works here

The service never talks to an ad network. It hands the browser an ordered list of **VAST tag
URLs** from configuration, which the IMA SDK plays in turn, falling to the next on an error or
timeout and finally to a house advertisement. No network is named anywhere in the code.

That means: **you can launch with no network at all.** The slot runs for its full thirty
seconds showing your own promotion, the timing and the delayed start are real and testable, and
adding a network later is an environment change with no deployment.

### What to apply for

Most networks that pay well for in-game video want to see traffic first, so this is realistically
a post-launch step:

- **Google Ad Manager / AdSense for Games** — the usual starting point, lowest barrier, serves
  VAST natively.
- **Venatus, AdinPlay, Snigel** — gaming specialists, better rates, but they generally want
  meaningful monthly traffic before they will talk.
- **Unity Ads, AppLovin** — strong on video, more mobile-oriented.

Apply to several. The waterfall exists precisely so you can run more than one and order them by
what they actually pay.

### What it issues back

One or more VAST tag URLs, which go into `COMRADE_AD_TAGS` as a JSON array ordered highest
paying first.

### The one real constraint

**Naming them is a legal requirement, not a nicety.** When you enable a network you must add it
to `AD_NETWORKS` in `apps/web/src/pages/Legal.tsx` — the privacy and cookies pages list the
networks from there, and say truthfully that there are none while the list is empty.

If a network requires **IAB TCF consent strings**, a certified consent management platform has
to be added first. The current banner records a plain personalised / not-personalised choice,
which is enough for a non-personalised serve and for Google's `npa=1`, but is not a TCF string.

### Cost

None — this is the revenue side.

---

## 5. DNS and the edge — already yours

No change needed, with one thing to check: **Stripe's webhook has to reach
`/api/stripe/webhook` from the public internet.** It is an ordinary POST on the existing domain,
so it should already work, but if anything at the edge challenges or rate-limits unknown POST
traffic, Stripe's deliveries will fail and subscriptions will not activate promptly. Stripe's
dashboard shows failed deliveries — check it after the first test payment.

The internal `/ops/logs` export stays internal: it already refuses anything arriving through
Cloudflare.

---

## What you end up holding

Six values, all of them in `/opt/comrade/service.env` on the Comrade LXC and nowhere else —
not in the repository, not in the container image, not in GitHub:

```
DATABASE_URL=            # from your DBA
COGNITO_USER_POOL_ID=    # from AWS
COGNITO_CLIENT_ID=       # from AWS
STRIPE_SECRET_KEY=       # from Stripe
STRIPE_WEBHOOK_SECRET=   # from Stripe
COMRADE_GUEST_SECRET=    # generate: 32+ random characters
```

Plus `COMRADE_AD_TAGS` when a network is live, and `COGNITO_CLIENT_SECRET` if the app client
has one. Keep a copy in whatever vault the rest of the estate uses — losing
`COMRADE_GUEST_SECRET` only resets guest allowances, but losing the others means re-issuing
them.

---

## A sensible sequence

1. **Now:** create the Postgres role and database, set `DATABASE_URL`, deploy. Guest allowances
   and match history start working. Nothing else changes.
2. **Then:** AWS account, Cognito pool, SES identity and production access. Set the three
   Cognito values. Registration and the free tier come alive.
3. **Then:** Stripe account and verification (start it early, it is the slow one). Create the
   products in **test mode**, point the webhook at the site, and walk the whole path: register →
   confirm → subscribe → upgrade → downgrade → cancel → invoice PDF. Then repeat in live mode.
4. **Before any of it is public:** complete the registered-entity details in `Legal.tsx` and
   have the drafts reviewed.
5. **After launch:** apply to ad networks, add their tags, and name them in `AD_NETWORKS`.
