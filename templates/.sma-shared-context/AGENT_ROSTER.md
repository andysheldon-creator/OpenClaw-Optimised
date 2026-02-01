# AGENT_ROSTER.md — Who Does What

**Last Updated:** <!-- Update this timestamp when modifying -->

---

## Active Agents

### 🦊 Kip (User-Facing Domain)

- **Model:** Claude (Anthropic)
- **Scope:** Messaging, preferences, notifications, user intent, summaries
- **Channels:** Telegram, Webchat, File Inbox
- **Response Time:** <5 seconds for quick questions
- **Inbox:** `~/clawd/inbox/`

### 🚀 Antigravity (Code-Heavy Domain)

- **Model:** Gemini (Google)
- **Scope:** Refactoring, deep analysis, IDE tasks, multi-file edits, MCP tools
- **Channels:** IDE integration, File Outbox
- **Inbox:** Reads from `~/clawd/outbox/`
- **Outbox:** Writes to `~/clawd/inbox/antigravity/`

### 🤖 ArchAgents (Infrastructure Domain)

- **Model:** Gemini Flash (Tool-calling only)
- **Scope:** Services, ports, Docker, Redis, health checks
- **Channels:** Terminal/CLI
- **Limitation:** No autonomous action without explicit command

---

## Human Arbiter

### 👤 Osman

- **Role:** Final decision maker when agents disagree
- **Trigger:** Agents escalate via `discussion-*.md` or direct message
- **Authority:** Issues `DIRECTIVE-*.md` files that override all agent preferences

---

## Routing Quick Reference

| Task Type                | Route To                   |
| ------------------------ | -------------------------- |
| "Explain X to me"        | Kip                        |
| "Fix this bug"           | Antigravity                |
| "Is the server up?"      | ArchAgents                 |
| "Refactor and notify me" | Antigravity → Kip callback |

---

_Update this roster when agents or capabilities change._
