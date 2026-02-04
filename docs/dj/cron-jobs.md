# DJ Cron Jobs

Automated scheduled tasks for the DJ assistant profile.

## Overview

| Job | Schedule | Description |
|-----|----------|-------------|
| Daily Brief | 8:00 AM local | Morning agenda + task summary |
| Weekly Review | Sunday 7:00 PM local | Week recap + next week preview |
| Ops Digest | 10:30 PM local | Daily spend + failures + top actions |
| Monthly Podcast | 15th 9:00 AM local | Podcast pipeline check-in (M5) |
| Weekly Improve Audit | Saturday 10:00 AM local | Codebase improvement scan (M6) |

## Daily Brief

Delivers a morning summary to Telegram including:
- Today's calendar events
- Tasks due today
- Tasks due this week (preview)
- Any urgent items flagged

### Configuration

Add to your cron jobs via `openclaw cron create` or directly in cron store:

```json
{
  "name": "dj-daily-brief",
  "description": "Morning agenda and task summary",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "0 8 * * *",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Generate my daily brief. Include: 1) Today's calendar events from Google Calendar, 2) Tasks due today from Notion, 3) Tasks due this week as a preview, 4) Any high-priority items that need attention. Format as a concise morning briefing.",
    "deliver": true,
    "channel": "telegram",
    "to": "YOUR_TELEGRAM_USER_ID"
  },
  "isolation": {
    "postToMainMode": "summary",
    "postToMainPrefix": "[Daily Brief]"
  }
}
```

### CLI Setup

```bash
# Create the daily brief cron job
openclaw cron create \
  --name "dj-daily-brief" \
  --description "Morning agenda and task summary" \
  --agent dj-personal \
  --schedule "0 8 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "Generate my daily brief. Include: 1) Today's calendar events from Google Calendar, 2) Tasks due today from Notion, 3) Tasks due this week as a preview, 4) Any high-priority items that need attention. Format as a concise morning briefing." \
  --deliver \
  --channel telegram \
  --to "YOUR_TELEGRAM_USER_ID"
```

### Example Output

```
☀️ Daily Brief — Mon Feb 3, 2026

📅 TODAY'S SCHEDULE
• 10:00-11:00 — Team standup
• 14:00-16:00 — Studio session (blocked)
• 20:00-02:00 — Gig @ Club XYZ

✅ DUE TODAY
• Review contract from label (🔴 High)
• Send updated rider to venue
• Post story about tonight's set

📋 THIS WEEK
• Tue: Podcast recording with Guest Name
• Wed: Mix submission deadline
• Fri: Travel to Berlin

⚠️ ATTENTION
• Contract review is overdue by 1 day
• No prep doc for Tuesday's podcast yet
```

## Weekly Review

Delivers a Sunday evening summary including:
- Week accomplishments (completed tasks)
- Unfinished business (overdue/incomplete)
- Next week preview
- Key metrics (if tracked)

### Configuration

```json
{
  "name": "dj-weekly-review",
  "description": "Week recap and next week preview",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "0 19 * * 0",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Generate my weekly review. Include: 1) Tasks completed this week from Notion, 2) Tasks that are overdue or incomplete, 3) Next week's calendar preview (key events), 4) Any projects that need attention. Format as a Sunday evening recap to prep for the week ahead.",
    "deliver": true,
    "channel": "telegram",
    "to": "YOUR_TELEGRAM_USER_ID"
  },
  "isolation": {
    "postToMainMode": "summary",
    "postToMainPrefix": "[Weekly Review]"
  }
}
```

### CLI Setup

```bash
# Create the weekly review cron job
openclaw cron create \
  --name "dj-weekly-review" \
  --description "Week recap and next week preview" \
  --agent dj-personal \
  --schedule "0 19 * * 0" \
  --tz "America/New_York" \
  --session isolated \
  --message "Generate my weekly review. Include: 1) Tasks completed this week from Notion, 2) Tasks that are overdue or incomplete, 3) Next week's calendar preview (key events), 4) Any projects that need attention. Format as a Sunday evening recap to prep for the week ahead." \
  --deliver \
  --channel telegram \
  --to "YOUR_TELEGRAM_USER_ID"
```

### Example Output

```
📊 Weekly Review — Week of Jan 27, 2026

✅ COMPLETED (12 tasks)
• Finished remix for Label X
• Sent press kit to 3 venues
• Recorded podcast ep #47
• Updated website bio
• ... and 8 more

⚠️ INCOMPLETE/OVERDUE
• Contract review (due Jan 30) — needs attention
• Mix submission (due Feb 1) — in progress
• Guest research for podcast — not started

📅 NEXT WEEK HIGHLIGHTS
• Mon: Team standup, Studio session
• Tue: Podcast recording
• Wed: Mix deadline
• Fri: Travel to Berlin
• Sat: Gig @ Berghain

🎯 PROJECTS STATUS
• Album Release: 60% complete (on track)
• Summer Tour: Booking in progress
• Podcast: 2 episodes ahead of schedule

💡 SUGGESTIONS
• Block time for contract review Monday AM
• Start guest research before Tuesday
• Pack for Berlin by Thursday
```

## Ops Digest

Nightly operational digest for monitoring spend and system health.

### What's Included

- Today's total spend (tokens + estimated cost)
- Top 5 most expensive actions/sessions
- Any errors or failures
- Budget limit warnings or breaches
- System health summary

### Configuration

```json
{
  "name": "dj-ops-digest",
  "description": "Nightly spend and operations digest",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "30 22 * * *",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Generate my nightly ops digest. Include: 1) Today's total token usage and estimated cost from session transcripts, 2) Top 5 most expensive actions or sessions, 3) Any errors or failures that occurred, 4) Budget warnings or limit breaches. Format as a brief operational summary.",
    "deliver": true,
    "channel": "telegram",
    "to": "YOUR_TELEGRAM_USER_ID"
  },
  "isolation": {
    "postToMainMode": "summary",
    "postToMainPrefix": "[Ops Digest]"
  }
}
```

### CLI Setup

```bash
# Create the ops digest cron job
openclaw cron create \
  --name "dj-ops-digest" \
  --description "Nightly spend and operations digest" \
  --agent dj-personal \
  --schedule "30 22 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "Generate my nightly ops digest. Include: 1) Today's total token usage and estimated cost from session transcripts, 2) Top 5 most expensive actions or sessions, 3) Any errors or failures that occurred, 4) Budget warnings or limit breaches. Format as a brief operational summary." \
  --deliver \
  --channel telegram \
  --to "YOUR_TELEGRAM_USER_ID"
```

### Example Output

```
🔧 Ops Digest — Mon Feb 3, 2026

💰 TODAY'S SPEND
• Tokens: 127,450 (in: 108k, out: 19k)
• Estimated cost: $1.23
• Sessions: 18
• Tool calls: 245

📊 TOP ACTIONS BY COST
1. Deep research: podcast guests ($0.45)
2. Weekly review generation ($0.31)
3. Email draft + revision ($0.18)
4. Calendar analysis ($0.12)
5. Task capture batch ($0.08)

⚠️ WARNINGS
• Approached 80% of normal tool call limit (40/50)
• 2 retry attempts on Notion API

❌ ERRORS
• None today ✓

📈 TRENDS
• +15% vs yesterday
• -8% vs 7-day average
• On track for monthly budget
```

## Monthly Podcast Check-in (M5)

Monthly podcast pipeline review on the 15th of each month.

**IMPORTANT**: This job always runs with `profile=normal`. Cron jobs NEVER inherit deep mode for safety.

### What's Included

- Episode pipeline status (in-progress episodes)
- If no episode in progress: next episode proposal + guest ideas
- If episode in progress: status summary + next actions with deadlines
- Monthly content calendar suggestions

### Configuration

```json
{
  "name": "dj-podcast-monthly",
  "description": "Monthly podcast pipeline check-in",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "0 9 15 * *",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Monthly podcast check-in. Review the podcast pipeline:\n\n1. Use /podcast status latest to check current episode status\n2. If no episode in progress: propose next episode plan with guest suggestions and topic ideas\n3. If episode in progress: summarize status and propose next actions with deadlines\n4. Review any episodes stuck in intermediate states\n\nFormat as a monthly podcast planning brief.",
    "deliver": true,
    "channel": "telegram",
    "to": "YOUR_TELEGRAM_USER_ID"
  },
  "isolation": {
    "postToMainMode": "summary",
    "postToMainPrefix": "[Monthly Podcast]"
  }
}
```

### CLI Setup

```bash
# Create the monthly podcast cron job
openclaw cron create \
  --name "dj-podcast-monthly" \
  --description "Monthly podcast pipeline check-in" \
  --agent dj-personal \
  --schedule "0 9 15 * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "Monthly podcast check-in. Review the podcast pipeline: 1) Use /podcast status latest to check current episode status, 2) If no episode in progress: propose next episode plan with guest suggestions, 3) If episode in progress: summarize status and propose next actions with deadlines." \
  --deliver \
  --channel telegram \
  --to "YOUR_TELEGRAM_USER_ID"
```

### Example Output (No Episode In Progress)

```
🎙️ Monthly Podcast Check-in — Feb 15, 2026

📊 PIPELINE STATUS
• No episode currently in progress
• Last published: E041 (Jan 28)
• 2 ideas in backlog

📝 NEXT EPISODE PROPOSAL

Episode E042: [Suggested Title]

Guest Ideas:
1. [Guest Name] — [Topic expertise]
2. [Guest Name] — [Topic expertise]
3. [Guest Name] — [Topic expertise]

Topic Ideas:
• [Topic 1 based on trends]
• [Topic 2 based on audience feedback]
• [Topic 3 seasonal/timely]

📅 SUGGESTED TIMELINE
• Feb 18-20: Guest outreach
• Feb 22-25: Recording
• Feb 26-28: Editing + pack generation
• Mar 1: Target publish

🎯 ACTION ITEMS
- [ ] Review guest list and pick top choice
- [ ] Schedule recording time
- [ ] Prepare research notes
```

### Example Output (Episode In Progress)

```
🎙️ Monthly Podcast Check-in — Feb 15, 2026

📊 CURRENT EPISODE: E042

Status: Pack Complete
Transcript Hash: a1b2c3d4...
Days Since Ingest: 8

✅ COMPLETED
• Transcript ingested (Feb 7)
• Pack generated (Feb 10)
  - 10 titles ready
  - Show notes complete
  - 5 clips planned

⏳ PENDING
• Site draft creation
• Final review
• Publish

📅 RECOMMENDED TIMELINE
• Feb 16: Create site draft (/podcast draft-site E042)
• Feb 17: Final review + edits
• Feb 18: Publish

⚠️ ATTENTION
• Episode has been in Pack Complete for 5 days
• Consider publishing soon to maintain cadence
```

### Budget Note

This cron job explicitly uses the `normal` budget profile. Unlike interactive sessions where you can arm `deep` mode, cron jobs are designed to be bounded and predictable. If the monthly check-in needs more resources than `normal` allows, it will provide a partial result and suggest following up interactively.

## Notion Sync Retry (M5)

Lightweight cron job to auto-retry failed Notion writes from the outbox queue.

**Schedule**: Every 30 minutes during waking hours (8 AM - 10 PM local)

**Behavior**:
- If outbox is empty → does nothing (no tool calls)
- If outbox has entries → retries until success, budget cap, or 5 retries this run
- Uses `normal` profile (bounded)
- Silent success (no notification unless errors persist)

### Configuration

```json
{
  "name": "dj-notion-sync-retry",
  "description": "Retry failed Notion writes from outbox",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "*/30 8-22 * * *",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Check Notion outbox and retry any pending writes. Use the PodcastService.retryNotionSync() method. If outbox is empty, respond with 'Outbox empty, nothing to retry.' If retries succeed, respond with count. If errors persist after 3+ attempts, notify via Telegram.",
    "deliver": false
  },
  "isolation": {
    "postToMainMode": "none"
  }
}
```

### CLI Setup

```bash
# Create the sync retry cron job
openclaw cron create \
  --name "dj-notion-sync-retry" \
  --description "Retry failed Notion writes from outbox" \
  --agent dj-personal \
  --schedule "*/30 8-22 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "Check Notion outbox and retry pending writes using retryNotionSync(). Notify on persistent errors."
```

### Notification Behavior

| Scenario | Action |
|----------|--------|
| Outbox empty | Silent (no notification) |
| All retries succeed | Silent (no notification) |
| Some succeed, some pending | Silent (will retry next run) |
| Entry at max retries (10+) | Telegram notification with error |

---

## Weekly Improve Audit (M6)

Weekly codebase improvement scan on Saturday mornings.

**CRITICAL**: This job NEVER creates PRs automatically. It only scans and reports findings. All PRs require human approval and manual creation.

**IMPORTANT**: This job always runs with `profile=normal`. Cron jobs NEVER inherit deep mode for safety.

### What's Included

- Scans for improvement opportunities in the codebase
- Reports findings by type (bugfix, refactor, perf, test, docs)
- Lists files that were skipped due to blocklist
- Provides confidence-ranked opportunity summary
- Does NOT create plans or PRs automatically

### Configuration

```json
{
  "name": "dj-improve-audit",
  "description": "Weekly codebase improvement scan",
  "enabled": true,
  "agentId": "dj-personal",
  "schedule": {
    "kind": "cron",
    "expr": "0 10 * * 6",
    "tz": "America/New_York"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Weekly improve audit. Use /improve scan to scan the codebase for improvement opportunities. Report:\n1. Total opportunities found by type\n2. High-confidence opportunities (top 5)\n3. Files blocked by security policy\n4. Recommendations for which opportunities to address first\n\nDo NOT create any plans or PRs. This is an audit only.",
    "deliver": true,
    "channel": "telegram",
    "to": "YOUR_TELEGRAM_USER_ID"
  },
  "isolation": {
    "postToMainMode": "summary",
    "postToMainPrefix": "[Improve Audit]"
  }
}
```

### CLI Setup

```bash
# Create the weekly improve audit cron job
openclaw cron create \
  --name "dj-improve-audit" \
  --description "Weekly codebase improvement scan" \
  --agent dj-personal \
  --schedule "0 10 * * 6" \
  --tz "America/New_York" \
  --session isolated \
  --message "Weekly improve audit. Scan for improvement opportunities and report findings. Do NOT create plans or PRs." \
  --deliver \
  --channel telegram \
  --to "YOUR_TELEGRAM_USER_ID"
```

### Example Output

```
🔍 Weekly Improve Audit — Sat Feb 8, 2026

📊 SCAN SUMMARY
• Files scanned: 234
• Opportunities found: 18
• Files blocked: 7 (security policy)

📈 BY TYPE
• bugfix: 5 (TODO/FIXME comments)
• refactor: 8 (long functions, duplication)
• test: 4 (missing test coverage)
• docs: 1 (outdated comments)

⭐ TOP OPPORTUNITIES (High Confidence)

1. src/utils/helpers.ts:45
   Bugfix: Address TODO comment
   Est: ~10 lines

2. src/services/api.ts:120
   Refactor: Break down long function (~85 lines)
   Est: ~50 lines

3. src/handlers/webhook.ts:33
   Bugfix: Improve error handling (currently just logs)
   Est: ~5 lines

4. src/models/user.ts:15
   Test: Consider adding tests
   Est: ~50 lines

5. src/config/settings.ts:78
   Refactor: Potential duplication (~3 occurrences)
   Est: ~20 lines

🔒 BLOCKED FILES
• src/dj/web-policy.ts (security policy)
• src/dj/web-operator.ts (security policy)
• .env (environment)
• ... and 4 more

💡 RECOMMENDATIONS
1. Address the TODO comments first (quick wins)
2. The long function in api.ts is a good refactor candidate
3. Consider adding tests before major refactors

📋 NEXT STEPS
To act on these findings:
1. Review the opportunities above
2. Use /improve plan <ids> to create a plan
3. Review and approve the plan
4. Use /improve pr <plan-id> to create a PR
5. Review and merge the PR on GitHub
```

### Safety Guarantees

| Guarantee | Enforcement |
|-----------|-------------|
| No auto-PR | Job only scans and reports |
| No auto-merge | PRs require manual creation and merge |
| Budget bounded | Always uses `normal` profile |
| Blocklist enforced | Protected files never included |

### Budget Note

This cron job explicitly uses the `normal` budget profile. Unlike interactive sessions where you can arm `deep` mode, cron jobs are designed to be bounded and predictable. If the scan runs out of budget, it will report partial results and indicate truncation.

---

## Managing Cron Jobs

### List Jobs

```bash
openclaw cron list
```

### Enable/Disable

```bash
openclaw cron disable dj-daily-brief
openclaw cron enable dj-daily-brief
```

### Update Schedule

```bash
openclaw cron update dj-daily-brief --schedule "0 9 * * *"
```

### Delete

```bash
openclaw cron delete dj-daily-brief
```

### Manual Trigger

```bash
openclaw cron run dj-daily-brief
```

## Timezone Notes

- Cron expressions use the timezone specified in `tz` field
- Default timezone comes from USER.md or system
- Daylight saving time is handled automatically
- Use IANA timezone names (e.g., "America/New_York", "Europe/Berlin")

## Delivery Configuration

Both jobs deliver to Telegram by default. To change:

```bash
# Deliver to WhatsApp instead
openclaw cron update dj-daily-brief --channel whatsapp --to "+1234567890"

# Deliver to Discord
openclaw cron update dj-daily-brief --channel discord --to "channel_id"
```

## Troubleshooting

### Job Not Running

1. Check if enabled: `openclaw cron list`
2. Check Gateway is running: `openclaw gateway status`
3. Check agent is configured: `openclaw config get agents.list`
4. Check logs: `openclaw logs --filter cron`

### Delivery Failing

1. Verify channel is configured and authenticated
2. Check `--to` recipient is valid
3. Ensure channel allows bot messages
4. Check rate limits haven't been hit

### Wrong Timezone

1. Update job: `openclaw cron update <job> --tz "Your/Timezone"`
2. Or set user timezone in USER.md
3. Verify with: `openclaw cron next <job>`
