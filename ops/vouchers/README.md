# Voucher codes

Issued Stripe promotion codes live in this folder and are **gitignored**. Do not commit them,
paste them into tickets, or put them on a public branch.

## Gold 100% (first invoice)

- Stripe coupon id: `comrade_gold_100_once`
- 100% off, `duration: once` (the first Gold invoice only)
- Restricted to the Gold product (`comrade_gold_monthly`)
- Each code is a single-use promotion code, prefix `CG100-`
- Players enter them on `/tiers` or `/account/billing`, or on Stripe Checkout

To mint another batch, copy `tools/stripe-create-gold-vouchers.py` to LXC 280 and run it there
(it reads `/opt/comrade/service.env`). The script is idempotent: it reuses the coupon and only
creates codes until the batch size is reached. Copy the written file back here; do not print
the codes in chat or logs.
