---
name: crypto-alerts
description: Track crypto prices and set price/percentage alerts via CoinGecko API.
homepage: https://www.coingecko.com/api
metadata: {"clawdis":{"emoji":"📈","requires":{"bins":["uv"]}}}
---

# Crypto Price Alerts

Track cryptocurrency prices and set alerts using the free CoinGecko API.

## Quick Commands

### Check Prices
```bash
# Single coin
uv run {baseDir}/scripts/crypto.py price bitcoin

# Multiple coins
uv run {baseDir}/scripts/crypto.py price bitcoin ethereum solana

# With more details
uv run {baseDir}/scripts/crypto.py price bitcoin --detailed
```

### Manage Alerts

```bash
# Set price threshold alert
uv run {baseDir}/scripts/crypto.py alert <user_id> bitcoin above 100000
uv run {baseDir}/scripts/crypto.py alert <user_id> ethereum below 3000

# Set percentage change alert (24h)
uv run {baseDir}/scripts/crypto.py alert <user_id> bitcoin change 5    # triggers if +/- 5%
uv run {baseDir}/scripts/crypto.py alert <user_id> solana drop 10      # triggers if drops 10%+
uv run {baseDir}/scripts/crypto.py alert <user_id> ethereum rise 15    # triggers if rises 15%+

# List user's alerts
uv run {baseDir}/scripts/crypto.py alerts <user_id>

# Remove an alert
uv run {baseDir}/scripts/crypto.py alert-rm <alert_id>

# Check all alerts (for cron/heartbeat)
uv run {baseDir}/scripts/crypto.py check-alerts
```

### Search Coins
```bash
# Find coin ID by name/symbol
uv run {baseDir}/scripts/crypto.py search doge
uv run {baseDir}/scripts/crypto.py search cardano
```

## Alert Types

| Type | Syntax | Triggers When |
|------|--------|---------------|
| `above` | `alert user btc above 100000` | Price >= threshold |
| `below` | `alert user eth below 3000` | Price <= threshold |
| `change` | `alert user btc change 5` | 24h change >= ±5% |
| `drop` | `alert user sol drop 10` | 24h change <= -10% |
| `rise` | `alert user eth rise 15` | 24h change >= +15% |

## Cron Integration

Add a cron job to check alerts periodically:
```json
{
  "name": "crypto-alert-check",
  "schedule": { "kind": "every", "everyMs": 900000 },
  "payload": {
    "kind": "agentTurn",
    "message": "Check crypto alerts and notify users of any triggered alerts"
  }
}
```

## Data Storage

Alerts are stored in `{baseDir}/data/alerts.json`:
```json
{
  "alerts": [
    {
      "id": "abc123",
      "user_id": "+15555550123",
      "coin": "bitcoin",
      "type": "above",
      "threshold": 100000,
      "created_at": "2026-01-05T18:00:00Z",
      "last_triggered": null,
      "cooldown_hours": 1
    }
  ]
}
```

## Notes

- CoinGecko free tier: ~10-30 requests/minute (no API key needed)
- Use coin IDs from `search` command (e.g., "bitcoin" not "BTC")
- Alerts have 1-hour cooldown to prevent spam
- Price data updates every few minutes on CoinGecko
