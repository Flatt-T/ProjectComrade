#!/usr/bin/env python3
"""Create the Comrade Battle pack in Stripe. Prints ids only — never the secret key.

Run on the service host that already has /opt/comrade/service.env.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = "/opt/comrade/service.env"
LOOKUP = "comrade_credit_pack"
BRONZE_LOOKUP = "comrade_bronze_monthly"
NAME = "Comrade Battle pack"
DESCRIPTION = "Five Classic matches and three Fusion matches, kept until you play them."
UNIT_AMOUNT = 179
CURRENCY = "gbp"
WEBHOOK_EVENT = "checkout.session.async_payment_succeeded"


def secret_key() -> str:
    with open(ENV_PATH, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if line.startswith("STRIPE_SECRET_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("STRIPE_SECRET_KEY is not set in service.env")


def stripe(method: str, path: str, data: dict | None = None) -> dict:
    url = "https://api.stripe.com/v1" + path
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data, doseq=True).encode()
        if method == "GET":
            url += ("&" if "?" in url else "?") + body.decode()
            body = None
            method = "GET"
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + secret_key())
    if body is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        raise SystemExit(f"Stripe {method} {path} failed ({error.code}): {detail}") from error


def first_price(lookup: str) -> dict | None:
    result = stripe("GET", "/prices", {"lookup_keys[]": lookup, "active": "true", "limit": "10"})
    data = result.get("data") or []
    return data[0] if data else None


def ensure_pack() -> dict:
    existing = first_price(LOOKUP)
    if existing:
        product = existing.get("product")
        return {
            "created": False,
            "product": product if isinstance(product, str) else (product or {}).get("id"),
            "price": existing.get("id"),
            "lookup_key": existing.get("lookup_key"),
            "unit_amount": existing.get("unit_amount"),
            "currency": existing.get("currency"),
            "tax_behavior": existing.get("tax_behavior"),
            "livemode": existing.get("livemode"),
        }

    bronze = first_price(BRONZE_LOOKUP)
    tax = (bronze or {}).get("tax_behavior") or "inclusive"

    product = stripe("POST", "/products", {
        "name": NAME,
        "description": DESCRIPTION,
        "metadata[pack]": "battle",
        "metadata[classic]": "5",
        "metadata[fusion]": "3",
    })
    price = stripe("POST", "/prices", {
        "product": product["id"],
        "currency": CURRENCY,
        "unit_amount": str(UNIT_AMOUNT),
        "lookup_key": LOOKUP,
        "tax_behavior": tax,
        "nickname": "Battle pack",
        "metadata[pack]": "battle",
    })
    return {
        "created": True,
        "product": product["id"],
        "price": price["id"],
        "lookup_key": price.get("lookup_key"),
        "unit_amount": price.get("unit_amount"),
        "currency": price.get("currency"),
        "tax_behavior": price.get("tax_behavior"),
        "livemode": price.get("livemode"),
    }


def ensure_webhook_event() -> dict:
    endpoints = stripe("GET", "/webhook_endpoints", {"limit": "20"}).get("data") or []
    comrade = [
        e for e in endpoints
        if "projectcomrade" in (e.get("url") or "")
    ]
    if not comrade:
        return {"webhook": None, "event_added": False, "reason": "no comrade endpoint"}
    endpoint = comrade[0]
    events = list(endpoint.get("enabled_events") or [])
    if WEBHOOK_EVENT in events:
        return {"webhook": endpoint["id"], "event_added": False, "events": events, "url": endpoint.get("url")}
    events.append(WEBHOOK_EVENT)
    updated = stripe("POST", f"/webhook_endpoints/{endpoint['id']}", {
        **{f"enabled_events[{i}]": ev for i, ev in enumerate(events)},
    })
    return {
        "webhook": updated["id"],
        "event_added": True,
        "events": updated.get("enabled_events"),
        "url": updated.get("url"),
    }


def main() -> None:
    report = {"pack": ensure_pack(), "webhook": ensure_webhook_event()}
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
