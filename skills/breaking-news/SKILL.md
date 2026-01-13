---
name: breaking-news
description: Real-time breaking news alerts from Twitter + RSS fallback. Monitors @AP, @Reuters, @BBCBreaking, @BNONews and other sources, then uses AI filtering to alert only on truly noteworthy events (major deaths, disasters, geopolitical events). Use when asked about current events or to set up breaking news monitoring.
homepage: https://twitter.com
metadata: {"clawdbot":{"emoji":"🚨","requires":{"bins":["bird"]}}}
---

# Breaking News Monitor

Real-time breaking news alerts from Twitter/X with RSS fallback.

## Quick Start

```bash
# Check for breaking news
uv run {baseDir}/scripts/breaking_news.py --check

# After reviewing, mark tweets as processed
uv run {baseDir}/scripts/breaking_news.py --mark-sent=<hash1>,<hash2>,...

# Clear state (re-check all)
uv run {baseDir}/scripts/breaking_news.py --clear-state
```

## Monitored Accounts

- **@AP** — Associated Press (most reliable)
- **@Reuters** — Reuters News
- **@BBCBreaking** — BBC Breaking News
- **@Breaking911** — Breaking911 (fast but less vetted)
- **@spectatorindex** — The Spectator Index
- **@BNONews** — BNO News (very fast on breaking)
- **@disclosetv** — Disclose.tv

## Noteworthy Criteria

**ALERT on:**
- Death of notable person (politicians, celebrities, business leaders, artists)
- Major disaster (plane crash, earthquake, mass casualty event)
- Significant geopolitical event (war declaration, coup, major attack)
- Major political news (indictments, resignations of major figures)
- Market-moving news (company collapse, emergency Fed action)

**SKIP:**
- Routine political statements
- Sports news (unless death)
- Celebrity gossip
- Local crime
- Ongoing story updates (unless major development)
- Weather (unless catastrophic)

## How It Works

1. Fetches recent tweets from monitored accounts
2. Filters out previously-seen tweets (24h dedup window)
3. Presents new tweets for AI review
4. Agent determines if any are noteworthy
5. Sends alert if noteworthy, marks all as processed

## Cron Setup

For real-time alerts, run every 2-3 minutes:

```json
{
  "name": "breaking-news-check",
  "schedule": { "kind": "cron", "expr": "*/3 * * * *", "tz": "America/New_York" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "deliver": true,
    "provider": "telegram",
    "to": "<chat_id>",
    "message": "Run: uv run skills/breaking-news/scripts/breaking_news.py --check\n\nReview the tweets. If ANY is truly NOTEWORTHY (major death, disaster, geopolitical event), send a brief alert starting with 🚨.\n\nAfter reviewing, run the --mark-sent command shown.\n\nIf nothing noteworthy, output: HEARTBEAT_OK"
  }
}
```

## Sources

### Primary: Twitter (fastest)
When `AUTH_TOKEN` and `CT0` are set:
- @AP, @Reuters, @BBCBreaking
- @Breaking911, @spectatorindex
- @BNONews, @disclosetv

### Fallback: RSS Feeds (reliable)
When Twitter auth unavailable:
- BBC World + Top Stories
- Reuters, NPR, Al Jazeera

Twitter is ~5-10 min faster but requires auth. RSS always works.

## Options

```bash
--twitter-only    # Skip RSS fallback
--rss-only        # Skip Twitter, use only RSS
--count N         # Items per source (default: 3)
```

## Environment Variables

Optional (for Twitter speed):
- `AUTH_TOKEN` — Twitter auth token
- `CT0` — Twitter ct0 cookie

Without these, falls back to RSS automatically.

## State

Sent alerts tracked in: `~/.cache/breaking-news/sent.json`
- Deduplicates for 24 hours
- Hash-based matching (similar tweets won't re-alert)
