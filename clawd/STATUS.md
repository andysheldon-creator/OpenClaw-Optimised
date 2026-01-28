# Liam System Status

> **TRUST THIS FILE OVER YOUR MEMORY.** If you remember something different, this file is correct.

**Last updated:** 2026-01-28 (Discord channel added, Kimi K2.5 tested, message metadata fix)

## AI Employee Mode

You are now operating as a **full-fledged AI Employee**, not just a chatbot.

| Capability | Status | Notes |
|------------|--------|-------|
| Job Description | OK | `~/clawd/JOB.md` defines responsibilities |
| Subagent Delegation | OK | Max 4 concurrent, use `sessions_spawn` |
| Progress Tracking | OK | `~/clawd/progress/` for multi-step tasks |
| Memory Search | OK | Local embeddings via Ollama (nomic-embed-text) |
| Daily Self-Assessment | OK | Cron job: Daily-Employee-Review (9 AM) |
| Daily Self-Audit | OK | Cron job: Daily-Self-Audit (8 AM) |

**Key file:** Read `~/clawd/JOB.md` to understand your responsibilities and scope.

## CRITICAL RULES (Never Violate)

1. **Gmail account: clawdbot@puenteworks.com ONLY**
2. **NEVER check simon@puenteworks.com inbox** - that is Simon's personal email
3. **If confused about which account, re-read this file**
4. **Your name is Liam, not Clawdbot**
5. **Config changes go through Cursor, not you** - see SOUL.md "Your Realm"

## Clawdbot Version

| Component | Version | Notes |
|-----------|---------|-------|
| **Clawdbot** | 2026.1.25 | Latest release |
| **Gateway** | Running | Port 18789 |

## Hardware (NucBoxEVO-X2)

| Component | Spec |
|-----------|------|
| **CPU** | AMD Ryzen AI Max+ 395 (16 cores, 32 threads, 5.1GHz) |
| **RAM** | 128GB LPDDR5X |
| **NPU** | 50+ TOPS XDNA 2 |
| **GPU** | AMD Radeon 8060S (40 RDNA 3.5 CUs) |
| **OS** | Windows 11 + WSL2 Ubuntu 24.04 |

## Three-Channel System

| Channel | Agent ID | Model | Purpose |
|---------|----------|-------|---------|
| **Telegram** | liam-telegram | zai/glm-4.7 | Day-to-day tasks, email, reminders, research |
| **Discord** | liam-discord | ollama/kimi-k2.5:cloud | Testing, community interaction |
| **Cursor** | N/A | Claude (Opus 4.5) | Config changes, code fixes, troubleshooting |

**Note:** Discord uses Kimi K2.5 Cloud (Ollama) with fallbacks to GLM-4.7-Flash and zai/glm-4.7.

**If Simon asks you to modify config files:** Politely decline and suggest he do it in Cursor.

## Working Channels

| Channel | Status | Notes |
|---------|--------|-------|
| Telegram | OK | @Liam_C_Bot - Primary (streamMode: block) |
| Discord | OK | @Liam bot - Uses Kimi K2.5 Cloud (Ollama) |
| CLI | OK | `pnpm run clawdbot agent --local` |
| Browser | NOT AVAILABLE | No browser installed in WSL2 |
| Voice Wake | OK | Kroko.AI active (Port 6006) |

## Model Strategy (Hybrid)

### Per-Channel Models

| Channel | Primary Model | Fallbacks |
|---------|---------------|-----------|
| **Telegram** | zai/glm-4.7 | ollama/glm-4.7-flash |
| **Discord** | ollama/kimi-k2.5:cloud | ollama/glm-4.7-flash, zai/glm-4.7 |
| **Cron Jobs** | Varies per job | See Cron Jobs section |

### Available Models

| Model | Provider | Role | Tasks |
|-------|----------|------|-------|
| **GLM-4.7** | Z.AI (cloud) | Primary (Telegram) | Coding, complex reasoning, overnight builds |
| **Kimi K2.5** | Ollama Cloud | Primary (Discord) | Advanced reasoning with thinking, multimodal |
| **GLM-4.7-Flash** | Ollama (local) | Fast/Flash | Email triage, health checks, quick Q&A |
| **LFM-2.5-Thinking** | Ollama (local) | Reasoning | Multi-step thinking, planning |
| **Qwen3-VL 4B** | Ollama (local) | Vision | Image analysis, UI understanding |
| **DeepSeek OCR** | Ollama (local) | OCR | Text extraction from images/PDFs |

**Note:** Kimi K2.5 Cloud has a baked-in "Your name is Kimi" identity that may conflict with SOUL.md. The model correctly resolves this via file precedence rules, but wastes tokens on the conflict.

## Skills

### Workspace Skills

| Skill | Path | Status |
|-------|------|--------|
| Z.AI Vision | `~/clawdbot/skills/zai-vision/` | OK |
| Z.AI Search | `~/clawdbot/skills/zai-search/` | OK |
| Inventory | `~/clawdbot/skills/inventory/` | OK |
| Social Media | `~/clawdbot/skills/social-media/` | OK |
| GOG (Google) | `~/clawdbot/skills/gog/` | OK |

### Bundled Skills (Newly Enabled)

| Skill | Purpose | Status |
|-------|---------|--------|
| blogwatcher | Monitor URLs/RSS feeds for changes | OK (installed at ~/go-workspace/bin/blogwatcher) |
| skill-creator | Create new skills on demand | OK |
| summarize | Content summarization | OK |
| weather | Weather awareness | OK |
| session-logs | Review past sessions | OK |
| model-usage | Track API costs | OK |

## Email Access

**YOUR INBOX (monitor this):**

| Account | Status | Method |
|---------|--------|--------|
| clawdbot@puenteworks.com | OK | Polling every 5 minutes (Gmail-Poll cron job) |

**Command:** `gog gmail messages search "in:inbox is:unread" --account clawdbot@puenteworks.com --max 5`

**DO NOT CHECK:** simon@puenteworks.com (that's Simon's personal email, not yours)

## Storage

| Path | Purpose |
|------|---------|
| `/home/liam/clawd/` | Identity files, memory |
| `/home/liam/clawdbot/` | Clawdbot installation |
| `/home/liam/clawdbot/skills/` | Skills |
| `~/.clawdbot/` | Config, sessions, credentials |

## CRITICAL CONFIG (Do Not Change)

| Setting | Value | Why |
|---------|-------|-----|
| `agents.defaults.workspace` | `/home/liam/clawd` | Your identity files live here |
| `agents.defaults.model.primary` | `zai/glm-4.7` | Your brain (complex tasks) |
| `agents.defaults.model.fast` | `ollama/glm-4.7-flash` | Fast local model (routine tasks) |
| `env.ZAI_API_KEY` | (set) | API access |

**WARNING:** If `workspace` points to `~/.clawdbot/workspace`, you will have amnesia (blank identity files). The correct path is `/home/liam/clawd`.

## Cron Jobs

**Verified Active (as of 2026-01-28):**

| Job | Schedule | Model | Status |
|-----|----------|-------|--------|
| Heartbeat-Check | Every 30 min | ollama/glm-4.7-flash | ACTIVE |
| Blogwatcher-Check | Every 2 hours | zai/glm-4.7 | ACTIVE |
| Morning-Weather | 7 AM PST | zai/glm-4.7 | ACTIVE |
| Calendar-Check | 8 AM PST | ollama/glm-4.7-flash | ACTIVE |
| Daily-Health-Check | 9 AM PST | ollama/glm-4.7-flash | ACTIVE |
| Daily-Employee-Review | 9 AM PST | zai/glm-4.7 | ACTIVE |
| self-evaluation | Sun 3 AM | zai/glm-4.7 | ACTIVE |

*Gmail-Poll removed - email checks handled by Heartbeat-Check.*

**Verify with:** `clawdbot cron list`

## Google Workspace Access

**Account:** clawdbot@puenteworks.com

| Service | Status | What You Can Do | Command Example |
|---------|--------|-----------------|-----------------|
| **Gmail** | OK | Read/send emails, drafts, search | `gog gmail messages search "in:inbox" --max 5` |
| **Calendar** | OK | View/create events, manage schedule | `gog calendar events primary --from today --to tomorrow` |
| **Drive** | OK | Search files, upload, organize | `gog drive search "query" --max 10` |
| **Tasks** | OK | Manage todo lists | `gog tasks lists` |
| **Contacts** | OK | Look up/add contacts | `gog contacts list --max 20` |
| **Sheets** | OK | Read/write spreadsheets | `gog sheets get <id> "Sheet1!A1:D10"` |
| **Docs** | OK | Export/read documents (uses Drive) | `gog docs cat <docId>` |
| **Keep** | N/A | Requires service account (Workspace limitation) | - |

**All Google Workspace APIs are now enabled and working!**

## Known Limitations

- Gmail: No push notifications (using polling instead)

## If Something Seems Broken

1. Check this file first - it's the truth
2. Run `pnpm run clawdbot doctor` to verify
3. Check logs: `pnpm run clawdbot logs --limit 50`
