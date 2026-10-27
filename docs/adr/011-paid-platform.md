# ADR 011 — Accounts, daily allowances, advertisements and subscriptions

Status: Accepted
Date: 2026-10-26
Builds on ADR 007 (lobby and roster) and ADR 008 (synchronized multiplayer)

## Context

The site has run registration-free from the start: type a callsign, join a room, play. It now
has to earn money, which means it needs identity, metered play, advertising on the free tier,
and subscriptions — without throwing away what makes it pleasant, and without making the
existing deployment brittle while the external accounts are being provisioned.

Three things in the existing design constrain the answer.

**There is no persistence.** The service held everything in memory: rooms, peers, presence.
Anything to do with an allowance, a subscription or a record needs durable storage.

**Identity was deliberately absent.** A peer is a random UUID per WebSocket. Quotas,
attribution and voting all need a peer to be linkable to a person.

**Lockstep tolerates nothing.** `LockstepSession` advances a tick only once *every* human
slot's turn packet for that turn has arrived. Anything that holds one client back holds the
whole match back.

## Decision

### Entitlements are data, in one table

`packages/contracts/src/billing.ts` declares every tier: both daily allowances, whether an
advertisement plays, voting rights, early access. The web app renders from that table and the
service enforces from the same table, so the offer shown and the offer enforced cannot
disagree. Changing the offer is a change to one file.

Prices are **not** in it. Every amount comes from Stripe, retrieved by a `lookup_key` recorded
against each tier, so the Stripe dashboard is the only place a price exists and a price change
needs no deployment.

### Extra matches sit beside the daily allowance

When the daily allowance is gone, a player can watch an advertisement (30 seconds for
Classic, 60 for Fusion) to earn one extra match of that kind, or buy a one-off battle pack
(5 Classic + 3 Fusion) through Stripe Checkout in `payment` mode. Extra matches are rows in
`play_credits`, granted under a unique lot key so a retried webhook cannot double-credit.
They are spent only after the daily allowance is exhausted, and they survive the next day
until played. The duration of a credit-earn watch is enforced server-side from the moment
the slot was issued; the client timer is not trusted.

### A play is a row, and the day is the player's own

Spending a play inserts a row in `play_ledger`. Checking a quota counts the rows since the
start of the current window. There is no running total to drift out of step, a refund is a
deleted row, and the ledger doubles as the record of what was played.

The play window is 24 hours, anchored to the account's registration moment rather than to
midnight, so allowances renew on each player's own clock and the load spreads itself. Guests
are anchored to the first time their signed cookie was seen. Gold votes keep a seven-day
window from the same anchor. Guest play is 2 Classic and 1 Fusion a day; a registered free
account is 3 Classic and 2 Fusion a day. Bronze is unlimited Classic and 5 Fusion a day.
Silver and Gold are unlimited.

### Plays are spent once, for everyone, at match start

A match can only begin in a room, so `matchstart.ts` is the single choke point. It checks every
human entering, and only then spends every allowance together: either the whole room can play
or nothing is charged and the room stays in the lobby. A player with nothing left cannot ready
up, so a room can never end up waiting on somebody who cannot enter, and the host is told
exactly who is blocked.

### The advertisement runs over a live simulation, not instead of one

This is the decision that matters most, and the obvious design is wrong.

The intuitive approach — hold the advertising player at turn zero and let them catch up
afterwards — cannot work: their client would stop exchanging turns, and every other player in
the match would stall at the first tick waiting for them. Buffering turns server-side does not
help either, because the other clients still need *this* player's packets to advance.

So the simulation starts on the first tick for **everyone**, and the advertisement is an
overlay above it with that player's orders held back at the single point where commands are
issued. Their turn packets keep flowing, so no peer ever waits; what they lose is thirty
seconds of commanding, and they arrive to a base that has been sitting idle. That is exactly
the intended behaviour — subscribers walk straight into the match and the free player starts
late — achieved with no protocol change and no possibility of desync.

### Advertising is a waterfall of tags, not an integration

The service holds an ordered list of VAST tag URLs from configuration and hands it to the
browser, which plays them with the IMA SDK and falls down the list on error or timeout, ending
at a house advertisement. No network is named in the code. Adding, reordering or dropping a
network is an environment change, and the slot works — full length, correct timing, real
delayed start — before any network has approved an account.

Tags only ever come from configuration, never from anything a client sends.

### Identity rides the WebSocket, uniqueness lives in Postgres

A peer identifies itself with a Cognito access token, verified against the pool's JWKS; without
one it is a guest, identified by a signed cookie that arrives with the upgrade request.

Callsign uniqueness is enforced by a unique index in Postgres, not by Cognito. Registration
therefore reserves the name first and creates the Cognito user second, releasing the
reservation if that fails — so two people racing for the same callsign cannot both get it, and
nobody loses a name to a half-finished sign-up.

The service holds no AWS credentials. Every Cognito call it makes is either unauthenticated or
authorised by the player's own access token, so none of them needs request signing and no IAM
role is involved.

Passwords pass through the service over TLS to Cognito and are never stored or logged. The
refresh token goes into an httpOnly cookie the page cannot read; the access token lives only in
memory, never in `localStorage`.

### Stripe is the source of truth, mirrored locally

Webhooks write the subscription mirror, and entitlements are also refreshed when a player
returns from Checkout, so a slow or retried webhook never leaves somebody staring at a tier
they have paid for. Signatures are verified before a payload is read and every event id is
recorded before it is applied, so redelivery is free of consequence.

Upgrades invoice the prorated difference immediately so the tier is usable at once; downgrades
take effect at renewal so nobody pays twice for a week or loses what they have paid for.
`past_due` keeps its tier while Stripe retries.

### Nothing is required for the site to keep working

With no `DATABASE_URL` the service behaves exactly as it did before any of this existed: open,
unmetered, no accounts, no advertisements. Each of the database, the Cognito pool, the Stripe
keys and the ad tags switches on one more layer independently, and `/health` reports which are
configured. The rollout is reversible at every step, and the live site was never dependent on
an external account being ready.

## Consequences

- The service now has a database dependency when configured, and will refuse to start on a
  half-migrated schema rather than serve wrong entitlements.
- `start` in the room coordinator became asynchronous, because it must check allowances before
  committing. Callers and tests have to await the transition.
- Match results are self-reported per player, from a token issued to that slot at kick-off. The
  match itself — style, map, line-up — is authoritative because the service created it, and a
  player can only ever write their own row, once. The figures within a row are as honest as the
  client; the score is computed from them by one formula on the server.
- Avatars are stored as rows (capped at 256KB, resized client-side) and served with an ETag.
  This keeps the read-only container and the existing backup set, and would need revisiting if
  the service is ever run as more than one instance with heavy avatar traffic.
- Guest allowances are device-bound and therefore resettable by clearing a cookie. That is
  accepted deliberately: the allowance is one match, and the alternative is fingerprinting.
- The legal pages are built but their copy is a marked draft. The paid service cannot open
  until that is completed and reviewed.
