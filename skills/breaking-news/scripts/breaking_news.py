#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["feedparser"]
# ///
"""
Breaking News Monitor - Monitors Twitter + RSS feeds for breaking news.
Twitter is primary (fastest), RSS is fallback (reliable).
Includes keyword pre-filtering to minimize AI token usage.
"""

import subprocess
import json
import os
import sys
import hashlib
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Twitter accounts to monitor (fastest source)
TWITTER_ACCOUNTS = [
    "AP",              # Associated Press
    "Reuters",         # Reuters
    "BBCBreaking",     # BBC Breaking News
    "Breaking911",     # Breaking911
    "spectatorindex",  # The Spectator Index
    "BNONews",         # BNO News (fast on breaking)
    "disclosetv",      # Disclose.tv
]

# RSS feeds as fallback (reliable, ~5-10min slower)
RSS_FEEDS = [
    ("BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("BBC Top", "https://feeds.bbci.co.uk/news/rss.xml"),
    ("Reuters", "https://www.reutersagency.com/feed/?best-regions=world&post_type=best"),
    ("NPR", "https://feeds.npr.org/1001/rss.xml"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
]

# Keywords that indicate potentially noteworthy news (case-insensitive)
# If no keywords match, skip AI review entirely
TRIGGER_KEYWORDS = [
    # Death/killing
    r'\bdies\b', r'\bdied\b', r'\bdeath\b', r'\bdead\b', r'\bkilled\b', 
    r'\bmurder', r'\bassassinat', r'\bexecut',
    # Breaking/urgent markers
    r'\bbreaking\b', r'\bjust in\b', r'\burgent\b', r'\balert\b',
    # Disasters
    r'\bearthquake\b', r'\btsunami\b', r'\bcrash', r'\bexplosion\b',
    r'\bfire\b.*\bmassive\b', r'\bcollapse', r'\bdisaster\b',
    # Violence/conflict
    r'\battack\b', r'\bbomb', r'\bshoot', r'\bterror',
    r'\bwar\b', r'\bcoup\b', r'\binvasion\b', r'\bmilitary\b.*\bstrike',
    # Political
    r'\bresign', r'\bimpeach', r'\bindict', r'\barrest',
    r'\bemergency\b', r'\bmartial law\b',
    # Economic crisis
    r'\bmarket\b.*\bcrash', r'\bbank\b.*\bfail', r'\bdefault\b',
]

# Compile patterns for efficiency
TRIGGER_PATTERNS = [re.compile(kw, re.IGNORECASE) for kw in TRIGGER_KEYWORDS]

# State file to track sent alerts
STATE_FILE = Path.home() / ".cache" / "breaking-news" / "sent.json"


def get_state():
    """Load sent alerts state."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except:
            return {"sent": [], "last_check": None}
    return {"sent": [], "last_check": None}


def save_state(state):
    """Save state, keeping only last 24h of sent alerts."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=24)).isoformat()
    state["sent"] = [s for s in state["sent"] if s.get("time", "") > cutoff]
    state["last_check"] = now.isoformat()
    STATE_FILE.write_text(json.dumps(state, indent=2))


def content_hash(text):
    """Generate hash for deduplication."""
    text = text.lower()
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'[^\w\s]', '', text)
    text = ' '.join(text.split())
    return hashlib.md5(text.encode()).hexdigest()[:12]


def has_trigger_keyword(text):
    """Check if text contains any trigger keywords."""
    for pattern in TRIGGER_PATTERNS:
        if pattern.search(text):
            return True
    return False


def fetch_twitter(account, count=5):
    """Fetch recent tweets from an account."""
    try:
        result = subprocess.run(
            ["bird", "search", f"from:{account}", "-n", str(count)],
            capture_output=True,
            text=True,
            timeout=30,
            env={**os.environ}
        )
        if result.returncode != 0:
            return []
        
        tweets = []
        lines = result.stdout.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            if line.startswith('@') and ':' in line:
                account_match = re.match(r'@(\w+)\s*\([^)]+\):', line)
                if account_match:
                    tweet = {"account": account_match.group(1), "source": "twitter"}
                    
                    i += 1
                    text_lines = []
                    while i < len(lines):
                        current = lines[i]
                        if current.startswith('📅'):
                            tweet["time"] = current[1:].strip()
                            i += 1
                            break
                        elif current.startswith('🔗') or current.startswith('────'):
                            break
                        else:
                            text_lines.append(current.strip())
                        i += 1
                    
                    tweet["text"] = ' '.join(text_lines).strip()
                    
                    while i < len(lines):
                        current = lines[i]
                        if current.startswith('🔗'):
                            tweet["url"] = current[1:].strip()
                            i += 1
                            break
                        elif current.startswith('────'):
                            break
                        i += 1
                    
                    if tweet.get("text"):
                        tweets.append(tweet)
            i += 1
        
        return tweets
    except Exception as e:
        print(f"Twitter error @{account}: {e}", file=sys.stderr)
        return []


def fetch_rss(name, url, count=5):
    """Fetch recent items from an RSS feed."""
    try:
        import feedparser
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:count]:
            items.append({
                "account": name,
                "source": "rss",
                "text": entry.get("title", "") + " " + entry.get("summary", "")[:200],
                "url": entry.get("link", ""),
                "time": entry.get("published", ""),
            })
        return items
    except Exception as e:
        print(f"RSS error {name}: {e}", file=sys.stderr)
        return []


def check_twitter_auth():
    """Check if Twitter auth is available."""
    auth_token = os.environ.get("AUTH_TOKEN")
    ct0 = os.environ.get("CT0")
    return bool(auth_token and ct0)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Monitor breaking news")
    parser.add_argument("--check", action="store_true", help="Check for new breaking news")
    parser.add_argument("--twitter-only", action="store_true", help="Only use Twitter")
    parser.add_argument("--rss-only", action="store_true", help="Only use RSS feeds")
    parser.add_argument("--count", type=int, default=3, help="Items per source")
    parser.add_argument("--mark-sent", type=str, help="Mark hashes as sent")
    parser.add_argument("--clear-state", action="store_true", help="Clear sent state")
    parser.add_argument("--no-filter", action="store_true", help="Skip keyword filtering")
    args = parser.parse_args()

    if args.clear_state:
        STATE_FILE.unlink(missing_ok=True)
        print("State cleared")
        return

    if args.mark_sent:
        state = get_state()
        now = datetime.now(timezone.utc).isoformat()
        for h in args.mark_sent.split(','):
            h = h.strip()
            if h:
                state["sent"].append({"hash": h, "time": now})
        save_state(state)
        print(f"Marked as sent: {args.mark_sent}")
        return

    state = get_state()
    sent_hashes = {s["hash"] for s in state["sent"]}
    all_items = []
    twitter_worked = False
    
    # Try Twitter first (fastest)
    if not args.rss_only and check_twitter_auth():
        for account in TWITTER_ACCOUNTS:
            tweets = fetch_twitter(account, args.count)
            if tweets:
                twitter_worked = True
            all_items.extend(tweets)
    
    # Use RSS as fallback or if requested
    if args.rss_only or (not twitter_worked and not args.twitter_only):
        for name, url in RSS_FEEDS:
            items = fetch_rss(name, url, args.count)
            all_items.extend(items)
    
    if not all_items:
        print("HEARTBEAT_OK")
        return
    
    # Filter out already-sent and dedupe
    new_items = []
    seen_hashes = set()
    for item in all_items:
        text = item.get("text", "")
        if not text:
            continue
        h = content_hash(text)
        if h not in sent_hashes and h not in seen_hashes:
            item["hash"] = h
            new_items.append(item)
            seen_hashes.add(h)
    
    if not new_items:
        print("HEARTBEAT_OK")
        return
    
    # KEYWORD PRE-FILTER: Only proceed to AI review if trigger keywords found
    if not args.no_filter:
        triggered_items = [item for item in new_items if has_trigger_keyword(item.get("text", ""))]
        
        # Mark all non-triggered items as sent (so we don't check them again)
        non_triggered = [item for item in new_items if not has_trigger_keyword(item.get("text", ""))]
        if non_triggered:
            now = datetime.now(timezone.utc).isoformat()
            for item in non_triggered:
                state["sent"].append({"hash": item["hash"], "time": now})
            save_state(state)
        
        if not triggered_items:
            print("HEARTBEAT_OK")
            return
        
        new_items = triggered_items
    
    # Output for agent (only items with trigger keywords)
    source_type = "Twitter" if twitter_worked else "RSS"
    print(f"🔴 BREAKING NEWS CHECK ({source_type})")
    print(f"Found {len(new_items)} potentially noteworthy items.\n")
    
    for i, item in enumerate(new_items, 1):
        source_icon = "🐦" if item.get("source") == "twitter" else "📰"
        print(f"[{i}] {source_icon} {item.get('account', 'Unknown')}")
        print(f"    {item.get('text', '')[:280]}")
        if item.get('url'):
            print(f"    🔗 {item['url']}")
        print()
    
    print("---")
    print("TASK: Review these items (pre-filtered for keywords).")
    print("Alert ONLY if TRULY NOTEWORTHY:")
    print("  ✓ Death of notable person (politician, celebrity, business leader)")
    print("  ✓ Major disaster (plane crash, earthquake, mass casualty)")
    print("  ✓ Significant geopolitical event (war, coup, major attack)")
    print("  ✗ Skip: routine mentions of keywords, minor events")
    print()
    print("If noteworthy: Send alert with 🚨 + brief summary")
    print("If nothing noteworthy: Output HEARTBEAT_OK")
    print()
    all_hashes = ','.join(item['hash'] for item in new_items)
    print(f"After reviewing, mark processed:")
    print(f"uv run skills/breaking-news/scripts/breaking_news.py --mark-sent={all_hashes}")


if __name__ == "__main__":
    main()
