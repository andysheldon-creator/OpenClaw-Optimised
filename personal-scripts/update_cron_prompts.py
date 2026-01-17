#!/usr/bin/env python3
"""Update cron job prompts to use silent output pattern instead of HEARTBEAT_OK."""
import json
import re

JOBS_FILE = "/Users/steve/.clawdbot/cron/jobs.json"

# New prompt pattern - starts with RULES to prevent preamble commentary
NEW_PROMPT_PREFIX = "RULES: Output ONLY the script result. NO preamble like 'I'll check...' If script produces no output, reply with NOTHING.\n\n"

# Jobs that need updating and their new simplified prompts
PROMPT_UPDATES = {
    "crypto-alert-check": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/clawd-opie && uv run skills/crypto-tracker/scripts/crypto.py check-alerts",
    
    "etsy-sales-monitor": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/.clawd && python3 scripts/etsy_sales_monitor.py",
    
    "otter-transcript-check": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/.clawd && uv run skills/otter/scripts/otter.py list --since 24h\n\nIf transcripts found: 🎙️ New transcript: [title] ([duration])",
    
    "vikunja-twenty-sync": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/.clawd && uv run skills/vikunja/scripts/vikunja.py sync-twenty\n\nIf projects created: 📋 Created [N] new Vikunja projects from Twenty",
    
    "archive-media": NEW_PROMPT_PREFIX + "Run: /Users/steve/.clawd/scripts/archive-media.sh",
    
    "hope-church-service": NEW_PROMPT_PREFIX + "Fetch Hope Church service details from https://hopechristianchurch.updates.church/\n\n⛪ This Sunday at Hope:\nSermon: [title] - [scripture]\nSongs: [list]\n\nIf unavailable, output nothing.",
    
    "steve-email-check": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/clawd && ./personal-scripts/check-email-steve.sh",
    
    "breaking-news-check": NEW_PROMPT_PREFIX + "Run: cd /Users/steve/clawd && uv run skills/breaking-news/scripts/breaking_news.py --check\n\nIf major news: 🚨 [one line summary]\nThen run --mark-sent command if shown\n\nIf no news: output nothing",
}

def main():
    with open(JOBS_FILE, 'r') as f:
        data = json.load(f)
    
    updated = 0
    for job in data.get('jobs', []):
        job_name = job.get('name')
        if job_name in PROMPT_UPDATES:
            old_msg = job['payload'].get('message', '')
            new_msg = PROMPT_UPDATES[job_name]
            job['payload']['message'] = new_msg
            print(f"✓ Updated: {job_name}")
            updated += 1
    
    with open(JOBS_FILE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\nDone! Updated {updated} jobs.")

if __name__ == "__main__":
    main()
