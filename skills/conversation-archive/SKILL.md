---
name: conversation-archive
description: Archive a Clawdbot chat session into a folder (transcript + summary + resume context) so you can restart a fresh context window later.
metadata: {"clawdbot":{"emoji":"🗂️","requires":{"bins":["jq"]}}}
---

# conversation-archive

Use this when Phil wants to “close out” a conversation and store it as an archive bundle so we can start a new chat and later pick up exactly where we left off.

## What it produces

A folder bundle containing:
- `transcript.md` — readable transcript with only `user`/`assistant` text (no tool calls / no thinking)
- `summary.md` — a long-form summary (best-effort via the `summarize` CLI if installed)
- `resume.md` — lightweight instructions/prompts for how to restart a fresh session and continue

Default output location:
- `~/clawd/archives/<topic>/<YYYY-MM-DD>/<sessionId>/...`

## Typical workflow

1. **Pick a topic slug** (examples: `recipes`, `recipe-grocery`, `grocery-sales`, `notion-schema`).
2. Run the archive script (it defaults to the latest session log):

```bash
cd /Users/phil/Code/clawdbot
bun scripts/conversation-archive.ts --topic recipe-grocery
```

3. Start a fresh chat.
4. When you want to resume, use the convenience pointer written at:
   - `~/clawd/archives/<topic>/latest.txt` (contains the last bundle path)
   - `~/clawd/archives/index.json` (topic → latest bundle path)

On mobile, you can just paste the path from `latest.txt` (or tell the assistant “resume topic <topic>” and paste that file path).

## Useful options

- Archive a specific session file:

```bash
bun scripts/conversation-archive.ts --topic recipe-grocery --sessionJsonl ~/.clawdbot/agents/main/sessions/<session-id>.jsonl
```

- Choose a different output root:

```bash
bun scripts/conversation-archive.ts --topic recipe-grocery --outDir ~/Documents/clawd-archives
```

- Skip summarization (if `summarize` isn’t installed/configured yet):

```bash
bun scripts/conversation-archive.ts --topic recipe-grocery --no-summary
```

- Force a model for `summarize` (optional):

```bash
bun scripts/conversation-archive.ts --topic recipe-grocery --model openai/gpt-5.2
```

## Resume prompt template

When you want to pick up later, paste a link/path to the archive folder and ask:

- “Load `resume.md` + `summary.md`, then tell me: decisions, open questions, and next 5 concrete steps.”
