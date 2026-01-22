# Setup Notes - This Instance

## Overview
This Clawdbot instance is configured slightly differently from the standard build.

## Auth Configuration
- **Auth location:** `/root/.clawdbot/agents/main/agent/auth-profiles.json`
- **Config:** `/root/.clawdbot/clawdbot.json`
- **Channel:** Telegram (primary)
- **Owner:** Anthony (Telegram ID: 6632715854)

## Key Differences
1. **Memory search disabled** - No OpenAI/Google API keys configured for embeddings
   - Workaround: Manual file reads instead of semantic search
   
2. **Whisper transcription** - Installed but sandbox memory-limited
   - Workaround: Need OpenAI API key for cloud Whisper API, or type messages
   
3. **Gateway/Cron** - Occasionally drops connection
   - Workaround: HEARTBEAT.md contains scheduled tasks for heartbeat polling

## Custom Skills
- `headline-grabber` - NY Post style headline generator
- `prophetx-api` - ProphetX prediction market integration

## Workspace Structure
```
/root/clawd/
├── AGENTS.md
├── BOOTSTRAP.md (delete after setup)
├── HEARTBEAT.md (daily checklist)
├── IDENTITY.md
├── SOUL.md
├── TOOLS.md
├── USER.md
└── memory/
    ├── decisions.md (decision journal)
    ├── health.md (workout & nutrition plan)
    ├── mental-models.md (Munger models curriculum)
    ├── projects.md (vibe code queue)
    ├── setup-notes.md (this file)
    ├── todo.md (to-do list)
    ├── trading.md (copy trade watchlist)
    └── weekly-reviews.md (weekly reflection)
```

## Backup
Workspace is backed up to: https://github.com/IWONTHEMONEY-01/clawdbot/tree/main/workspace

## Last Updated
2026-01-22
