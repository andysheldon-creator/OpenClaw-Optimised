#!/usr/bin/env python3
"""Monitor Etsy sales by polling public shop stats.

Uses the Etsy Open API v3 shop endpoint (API key + shop id) to read
`transaction_sold_count` for each shop. When the count increases, prints
alert lines and updates a local state file.

This avoids needing OAuth (orders) or parsing emails.

Output contract:
- If no changes: prints exactly `HEARTBEAT_OK`
- If changes: prints one or more alert lines

Exit codes:
- 0: success
- 2: missing required env vars
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ETSY_API_BASE = "https://openapi.etsy.com/v3"


@dataclass(frozen=True)
class ShopConfig:
    key_env: str
    id_env: str
    label: str


SHOPS: list[ShopConfig] = [
    ShopConfig(key_env="ETSY_API_KEY_P4P", id_env="ETSY_SHOP_ID_P4P", label="P4P"),
    ShopConfig(key_env="ETSY_API_KEY_CCC", id_env="ETSY_SHOP_ID_CCC", label="CCC"),
]


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise KeyError(name)
    return value


def fetch_shop(shop_id: str, api_key: str) -> dict:
    url = f"{ETSY_API_BASE}/application/shops/{shop_id}"
    req = Request(
        url,
        headers={
            "x-api-key": api_key,
            "Accept": "application/json",
            "User-Agent": "clawd/etsy-sales-monitor",
        },
        method="GET",
    )

    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        raise RuntimeError(f"Etsy API HTTP {e.code}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"Etsy API error: {e}") from e


def load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Monitor Etsy shop sales")
    parser.add_argument(
        "--state",
        default="data/etsy-sales-state.json",
        help="Path to JSON state file (relative to cwd)",
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Initialize state with current counts (no alerts)",
    )
    args = parser.parse_args()

    state_path = Path(args.state)
    state = load_state(state_path)

    missing: list[str] = []
    current: dict[str, dict] = {}

    for shop in SHOPS:
        try:
            api_key = _required_env(shop.key_env)
            shop_id = _required_env(shop.id_env)
        except KeyError as e:
            missing.append(str(e))
            continue

        data = fetch_shop(shop_id=str(shop_id), api_key=api_key)
        current[shop.label] = {
            "shop_id": str(shop_id),
            "shop_name": data.get("shop_name"),
            "url": data.get("url"),
            "transaction_sold_count": int(data.get("transaction_sold_count") or 0),
        }

    if missing:
        sys.stderr.write(
            "Missing required env vars: " + ", ".join(sorted(set(missing))) + "\n"
        )
        return 2

    if args.init or not state:
        save_state(state_path, current)
        print("HEARTBEAT_OK")
        return 0

    alerts: list[str] = []
    next_state = dict(state)

    for label, info in current.items():
        prev_count = int((state.get(label) or {}).get("transaction_sold_count") or 0)
        new_count = int(info["transaction_sold_count"])
        delta = new_count - prev_count

        next_state[label] = info

        if delta > 0:
            shop_name = info.get("shop_name") or label
            alerts.append(
                f"🛒 {label} ({shop_name}) New sale(s): +{delta} (total {new_count})"
            )

    save_state(state_path, next_state)

    if not alerts:
        print("HEARTBEAT_OK")
        return 0

    for line in alerts:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
