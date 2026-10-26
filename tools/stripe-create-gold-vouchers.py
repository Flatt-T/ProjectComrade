#!/usr/bin/env python3
"""Mint single-use 100% off Gold promotion codes in Stripe.

Reads STRIPE_SECRET_KEY from /opt/comrade/service.env. Never prints the key.
Stdout is a summary (ids and counts only). Codes are written to --out.

Idempotent: reuses coupon `comrade_gold_100_once` and only creates codes until COUNT is reached.
"""
from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = "/opt/comrade/service.env"
# Pin a version that still takes `coupon` on promotion codes. Account default is newer
# (polymorphic `promotion[coupon]`), which would 400 this script.
API_VERSION = "2025-08-27.basil"
GOLD_LOOKUP = "comrade_gold_monthly"
COUPON_ID = "comrade_gold_100_once"
COUPON_NAME = "Comrade Gold 100% (first invoice)"
BATCH = "gold-100-2026-10-26"
PREFIX = "CG100-"
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
COUNT = 50


def secret_key() -> str:
    with open(ENV_PATH, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if line.startswith("STRIPE_SECRET_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("STRIPE_SECRET_KEY is not set in service.env")


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
        detail = error.read().decode("utf-8", errors="replace")[:1200]
        if allow_404 and error.code == 404:
            return {}
        raise SystemExit(f"Stripe {method} {path} failed ({error.code}): {detail}") from error


def gold_product() -> dict:
    result = stripe("GET", "/prices", {
        "lookup_keys[]": GOLD_LOOKUP,
        "active": "true",
        "limit": "10",
        "expand[]": "data.product",
    })
    prices = result.get("data") or []
    if not prices:
        raise SystemExit(f"No active Stripe price with lookup key {GOLD_LOOKUP}")
    price = prices[0]
    product = price.get("product")
    product_id = product if isinstance(product, str) else (product or {}).get("id")
    if not product_id:
        raise SystemExit("Gold price has no product id")
    return {
        "product": product_id,
        "price": price.get("id"),
        "lookup_key": price.get("lookup_key"),
        "livemode": price.get("livemode"),
    }


def ensure_coupon(product_id: str) -> dict:
    existing = stripe("GET", f"/coupons/{COUPON_ID}", allow_404=True)
    if existing.get("id") == COUPON_ID:
        return {"created": False, **{k: existing.get(k) for k in ("id", "percent_off", "duration", "valid", "livemode")}}
    created = stripe("POST", "/coupons", {
        "id": COUPON_ID,
        "percent_off": "100",
        "duration": "once",
        "name": COUPON_NAME,
        "applies_to[products][0]": product_id,
        "metadata[product]": "comrade",
        "metadata[purpose]": "gold-100",
        "metadata[batch]": BATCH,
    })
    return {"created": True, **{k: created.get(k) for k in ("id", "percent_off", "duration", "valid", "livemode")}}


def list_batch_codes() -> list[dict]:
    codes: list[dict] = []
    starting = None
    while True:
        params: dict = {"coupon": COUPON_ID, "limit": "100"}
        if starting:
            params["starting_after"] = starting
        page = stripe("GET", "/promotion_codes", params)
        rows = page.get("data") or []
        for row in rows:
            meta = row.get("metadata") or {}
            if meta.get("batch") == BATCH:
                codes.append(row)
        if not page.get("has_more") or not rows:
            break
        starting = rows[-1]["id"]
    return codes


def mint_code() -> str:
    chunk = lambda n: "".join(secrets.choice(ALPHABET) for _ in range(n))
    return f"{PREFIX}{chunk(4)}-{chunk(4)}"


def create_code(code: str) -> dict:
    return stripe("POST", "/promotion_codes", {
        "coupon": COUPON_ID,
        "code": code,
        "max_redemptions": "1",
        "metadata[product]": "comrade",
        "metadata[purpose]": "gold-100",
        "metadata[batch]": BATCH,
    })


def write_out(path: str, rows: list[dict]) -> None:
    lines = [
        f"# Comrade Gold 100% vouchers — batch {BATCH}",
        "# Single use. First Gold invoice only. Not for Bronze, Silver, or the battle pack.",
        "# Stripe coupon: comrade_gold_100_once",
        "",
    ]
    csv_lines = ["code,promotion_code_id,coupon,max_redemptions,livemode"]
    for row in rows:
        lines.append(row["code"])
        csv_lines.append(
            f"{row['code']},{row['id']},{COUPON_ID},{row.get('max_redemptions')},{row.get('livemode')}"
        )
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")
    csv_path = path[:-4] + ".csv" if path.endswith(".txt") else path + ".csv"
    with open(csv_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(csv_lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=COUNT)
    parser.add_argument("--out", default=f"/tmp/comrade-{BATCH}.txt")
    args = parser.parse_args()

    gold = gold_product()
    coupon = ensure_coupon(gold["product"])
    existing = list_batch_codes()
    created = 0
    while len(existing) < args.count:
        code = mint_code()
        try:
            row = create_code(code)
        except SystemExit as error:
            if "already exists" in str(error).lower() or "resource_already_exists" in str(error):
                continue
            raise
        existing.append(row)
        created += 1

    existing.sort(key=lambda row: row.get("code") or "")
    write_out(args.out, existing[: args.count])
    json.dump({
        "coupon": coupon,
        "gold": {k: gold[k] for k in ("product", "price", "lookup_key", "livemode")},
        "batch": BATCH,
        "created": created,
        "total": min(len(existing), args.count),
        "out": args.out,
        "csv": args.out[:-4] + ".csv" if args.out.endswith(".txt") else args.out + ".csv",
    }, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
