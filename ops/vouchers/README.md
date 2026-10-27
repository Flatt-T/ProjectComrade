# Voucher codes

Issued Stripe promotion codes live in this folder and are **gitignored**. Do not commit them,
paste them into tickets, or put them on a public branch.

## Gold 100% (first invoice)

- Stripe coupon id: `comrade_gold_100_once`
- 100% off, `duration: once` (the first Gold invoice only)
- Restricted to the Gold product (`comrade_gold_monthly`)
- Each code is a single-use promotion code, prefix `CG100-`
- Players enter them on `/tiers` or `/account/billing`, or on Stripe Checkout

Live batch (27 October 2026): `gold-100pct-live-2026-10-27.txt` — 50 single-use codes on
live coupon `comrade_gold_100_once`. The 26 October file is the test-mode batch and will not
work on live Checkout.

To mint another batch, run `tools/stripe-create-gold-vouchers.py` with `STRIPE_SECRET_KEY`
set to the live key (or copy it to LXC 280, where it reads `/opt/comrade/service.env`). The
script is idempotent: it reuses the coupon and only creates codes until the batch size is
reached. Do not print the codes in chat or logs.
