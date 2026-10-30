#!/usr/bin/env python3
"""Idempotently create the Project Comrade live Stripe catalogue.

Reads STRIPE_SECRET_KEY from the environment or /opt/comrade/service.env.
Prints ids only. The webhook signing secret is written to --webhook-secret-out
because Stripe returns it once, at creation.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = "/opt/comrade/service.env"
API_VERSION = "2025-08-27.basil"
PUBLIC_URL = "https://projectcomrade.co.uk"
WEBHOOK_URL = PUBLIC_URL + "/api/stripe/webhook"
EXPECTED_ACCOUNT = "acct_1U5jjC2AlCr8Xzbo"
COUPON_ID = "comrade_gold_100_once"
EVENTS = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_action_required",
    "customer.deleted",
]
CATALOGUE = [
    {
        "name": "Comrade Bronze",
        "description": "Unlimited Classic play, no advertisements.",
        "lookup": "comrade_bronze_monthly",
        "amount": 349,
        "recurring": True,
        "metadata": {"tier": "bronze"},
        "nickname": "Bronze monthly",
    },
    {
        "name": "Comrade Silver",
        "description": "Everything, unlimited.",
        "lookup": "comrade_silver_monthly",
        "amount": 749,
        "recurring": True,
        "metadata": {"tier": "silver"},
        "nickname": "Silver monthly",
    },
    {
        "name": "Comrade Gold",
        "description": "Unlimited play, a vote on what gets built, and new content first.",
        "lookup": "comrade_gold_monthly",
        "amount": 979,
        "recurring": True,
        "metadata": {"tier": "gold"},
        "nickname": "Gold monthly",
    },
    {
        "name": "Comrade Battle pack",
        "description": "Five Classic matches and three Fusion matches, kept until you play them.",
        "lookup": "comrade_credit_pack",
        "amount": 179,
        "recurring": False,
        "metadata": {"pack": "battle", "classic": "5", "fusion": "3"},
        "nickname": "Battle pack",
    },
]


def secret_key() -> str:
    env = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if env:
        return env
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if line.startswith("STRIPE_SECRET_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("STRIPE_SECRET_KEY is not set")


def stripe(method: str, path: str, data: dict | None = None, allow_404: bool = False) -> dict:
    url = "https://api.stripe.com/v1" + path
    body = None
    if data is not None:
        encoded = urllib.parse.urlencode(data, doseq=True)
        if method == "GET":
            url += ("&" if "?" in url else "?") + encoded
        else:
            body = encoded.encode()
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + secret_key())
    req.add_header("Stripe-Version", API_VERSION)
    if body is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1600]
        if allow_404 and error.code == 404:
            return {}
        raise SystemExit(f"Stripe {method} {path} failed ({error.code}): {detail}") from error


def first_price(lookup: str) -> dict | None:
    result = stripe("GET", "/prices", {
        "lookup_keys[]": lookup, "active": "true", "limit": "10", "expand[]": "data.product",
    })
    data = result.get("data") or []
    return data[0] if data else None


def ensure_price(spec: dict) -> dict:
    existing = first_price(spec["lookup"])
    if existing:
        product = existing.get("product")
        product_id = product if isinstance(product, str) else (product or {}).get("id")
        return {
            "created": False,
            "name": spec["name"],
            "lookup_key": existing.get("lookup_key"),
            "product": product_id,
            "price": existing.get("id"),
            "unit_amount": existing.get("unit_amount"),
            "currency": existing.get("currency"),
            "tax_behavior": existing.get("tax_behavior"),
            "livemode": existing.get("livemode"),
            "type": existing.get("type"),
        }
    product_data = {
        "name": spec["name"],
        "description": spec["description"],
    }
    for key, value in spec["metadata"].items():
        product_data[f"metadata[{key}]"] = value
    product = stripe("POST", "/products", product_data)
    price_data: dict = {
        "product": product["id"],
        "currency": "gbp",
        "unit_amount": str(spec["amount"]),
        "lookup_key": spec["lookup"],
        "nickname": spec["nickname"],
    }
    for key, value in spec["metadata"].items():
        price_data[f"metadata[{key}]"] = value
    if spec["recurring"]:
        price_data["recurring[interval]"] = "month"
    price = stripe("POST", "/prices", price_data)
    return {
        "created": True,
        "name": spec["name"],
        "lookup_key": price.get("lookup_key"),
        "product": product["id"],
        "price": price["id"],
        "unit_amount": price.get("unit_amount"),
        "currency": price.get("currency"),
        "tax_behavior": price.get("tax_behavior"),
        "livemode": price.get("livemode"),
        "type": price.get("type"),
    }


def ensure_webhook() -> dict:
    endpoints = stripe("GET", "/webhook_endpoints", {"limit": "100"}).get("data") or []
    matches = [e for e in endpoints if (e.get("url") or "") == WEBHOOK_URL]
    if matches:
        endpoint = matches[0]
        events = list(endpoint.get("enabled_events") or [])
        missing = [ev for ev in EVENTS if ev not in events]
        if missing:
            merged = events + missing
            endpoint = stripe("POST", f"/webhook_endpoints/{endpoint['id']}", {
                **{f"enabled_events[{i}]": ev for i, ev in enumerate(merged)},
            })
        return {
            "created": False,
            "id": endpoint["id"],
            "url": endpoint.get("url"),
            "status": endpoint.get("status"),
            "livemode": endpoint.get("livemode"),
            "events": endpoint.get("enabled_events"),
            "secret": None,
            "events_added": missing,
        }
    created = stripe("POST", "/webhook_endpoints", {
        "url": WEBHOOK_URL,
        "description": "Project Comrade live entitlements",
        "api_version": API_VERSION,
        **{f"enabled_events[{i}]": ev for i, ev in enumerate(EVENTS)},
    })
    return {
        "created": True,
        "id": created["id"],
        "url": created.get("url"),
        "status": created.get("status"),
        "livemode": created.get("livemode"),
        "events": created.get("enabled_events"),
        "secret": created.get("secret"),
        "events_added": EVENTS,
    }


def ensure_coupon(gold_product: str) -> dict:
    existing = stripe("GET", f"/coupons/{COUPON_ID}", allow_404=True)
    if existing.get("id") == COUPON_ID:
        return {
            "created": False,
            "id": existing.get("id"),
            "percent_off": existing.get("percent_off"),
            "duration": existing.get("duration"),
            "valid": existing.get("valid"),
            "livemode": existing.get("livemode"),
        }
    created = stripe("POST", "/coupons", {
        "id": COUPON_ID,
        "percent_off": "100",
        "duration": "once",
        "name": "Comrade Gold 100% (first invoice)",
        "applies_to[products][0]": gold_product,
        "metadata[product]": "comrade",
        "metadata[purpose]": "gold-100",
    })
    return {
        "created": True,
        "id": created.get("id"),
        "percent_off": created.get("percent_off"),
        "duration": created.get("duration"),
        "valid": created.get("valid"),
        "livemode": created.get("livemode"),
    }


def ensure_portal(prices: list[dict]) -> dict:
    monthly = [p for p in prices if p["lookup_key"] != "comrade_credit_pack"]
    existing = stripe("GET", "/billing_portal/configurations", {"limit": "20"}).get("data") or []
    live = [c for c in existing if c.get("active")]
    payload: dict = {
        "business_profile[headline]": "Project Comrade",
        "default_return_url": PUBLIC_URL + "/account/billing",
        "features[invoice_history][enabled]": "true",
        "features[payment_method_update][enabled]": "true",
        "features[customer_update][enabled]": "true",
        "features[customer_update][allowed_updates][0]": "name",
        "features[customer_update][allowed_updates][1]": "email",
        "features[customer_update][allowed_updates][2]": "address",
        "features[customer_update][allowed_updates][3]": "phone",
        "features[subscription_cancel][enabled]": "true",
        "features[subscription_cancel][mode]": "at_period_end",
        "features[subscription_update][enabled]": "true",
        "features[subscription_update][default_allowed_updates][0]": "price",
        "features[subscription_update][proration_behavior]": "always_invoice",
    }
    for i, item in enumerate(monthly):
        payload[f"features[subscription_update][products][{i}][product]"] = item["product"]
        payload[f"features[subscription_update][products][{i}][prices][0]"] = item["price"]
    if live:
        updated = stripe("POST", f"/billing_portal/configurations/{live[0]['id']}", payload)
        return {
            "created": False,
            "id": updated["id"],
            "active": updated.get("active"),
            "is_default": updated.get("is_default"),
            "livemode": updated.get("livemode"),
            "return_url": updated.get("default_return_url"),
        }
    created = stripe("POST", "/billing_portal/configurations", payload)
    return {
        "created": True,
        "id": created["id"],
        "active": created.get("active"),
        "is_default": created.get("is_default"),
        "livemode": created.get("livemode"),
        "return_url": created.get("default_return_url"),
    }


def main() -> None:
    out_secret = sys.argv[1] if len(sys.argv) > 1 else ""
    account = stripe("GET", "/account")
    if account.get("id") != EXPECTED_ACCOUNT:
        raise SystemExit(f"Refusing: key is for {account.get('id')}, expected {EXPECTED_ACCOUNT}")
    if not account.get("charges_enabled"):
        raise SystemExit("Refusing: live charges are not enabled on this account")
    prices = [ensure_price(spec) for spec in CATALOGUE]
    gold = next(p for p in prices if p["lookup_key"] == "comrade_gold_monthly")
    coupon = ensure_coupon(gold["product"])
    webhook = ensure_webhook()
    portal = ensure_portal(prices)
    secret = webhook.pop("secret", None)
    if secret and out_secret:
        with open(out_secret, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(secret.strip() + "\n")
    report = {
        "account": account.get("id"),
        "charges_enabled": account.get("charges_enabled"),
        "payouts_enabled": account.get("payouts_enabled"),
        "prices": prices,
        "coupon": coupon,
        "webhook": webhook,
        "portal": portal,
        "webhook_secret_written": bool(secret and out_secret),
        "key_prefix": secret_key()[:8],
    }
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    if webhook.get("created") and not secret:
        raise SystemExit("Webhook was created but Stripe returned no signing secret")


if __name__ == "__main__":
    main()
