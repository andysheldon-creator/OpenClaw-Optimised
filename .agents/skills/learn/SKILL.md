---
name: learn
description: Discover, install, and manage AI agent skills from agentskill.sh. Search for capabilities, install mid-session with security scanning, and provide feedback. Use when asked to find skills, install extensions, or check skill safety.
---

# Learn — Find & Install Agent Skills

Discover, install, and manage AI agent skills from [agentskill.sh](https://agentskill.sh). This skill turns your agent into a self-improving system that can search for capabilities it lacks, install them mid-session, and provide feedback after use.

## Overview

Use this skill when the user asks to find, search, discover, or install agent skills, when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or when they express interest in extending capabilities.

## Safety

- All skills are security scanned before installation
- Score 90-100: SAFE — install proceeds
- Score 70-89: REVIEW — shows issues, requires acknowledgment
- Score <70: BLOCKED — refuses to install
- Scans detect: prompt injection, RCE, credential exfiltration, obfuscation

## Commands

### `/learn <query>` — Search for Skills

1. Use WebFetch to call: `https://agentskill.sh/api/agent/search?q=<URL-encoded query>&limit=5`
2. Parse the JSON response
3. Display results in a table:
   ```
   ## Skills matching "<query>"

   | # | Skill | Author | Installs | Security |
   |---|-------|--------|----------|----------|
   | 1 | **<name>** | @<owner> | <installCount> | <securityScore>/100 |
   ```
4. Ask user which skill to install
5. If selected, proceed to Install Flow

### `/learn @<owner>/<slug>` — Install Exact Skill

1. Parse owner and slug from argument
2. Fetch from: `https://agentskill.sh/api/agent/skills/<slug>/install?owner=<owner>`
3. Proceed to Install Flow

### `/learn` (no arguments) — Context-Aware Recommendations

1. Detect project context (package.json, file types, git branch)
2. Build search query from detected stack
3. Call search endpoint and present results

### `/learn trending` — Show Trending Skills

Fetch from: `https://agentskill.sh/api/agent/search?section=trending&limit=5`

### `/learn feedback <slug> <score> [comment]` — Rate a Skill

POST to `https://agentskill.sh/api/skills/<slug>/agent-feedback` with score (1-5) and optional comment.

### `/learn list` — Show Installed Skills

List all `.md` files in the skill directory with metadata.

### `/learn update` — Check for Updates

Compare local `contentSha` with remote via batch version endpoint.

### `/learn remove <slug>` — Uninstall a Skill

Delete the skill file from the install directory.

### `/learn scan <path>` — Security Scan a Skill

Scan a local skill file for security issues without installing.

## Install Flow

1. Fetch skill content from API
2. Run security scan (see Security Scan section)
3. If score >= 70, show preview and ask for confirmation
4. If score < 70, BLOCK installation
5. Write skill file with metadata header:
   ```
   # --- agentskill.sh ---
   # slug: <slug>
   # owner: <owner>
   # contentSha: <contentSha>
   # securityScore: <score>
   # installed: <ISO 8601>
   # source: https://agentskill.sh/<slug>
   # ---
   ```
6. Track install via POST to API

## Security Scan

Before installing ANY skill, scan for:

**CRITICAL (block on 5+):**
- Prompt injection patterns
- Remote code execution (`curl|bash`, `wget|sh`)
- Credential exfiltration
- Reverse shells
- Destructive commands (`rm -rf /`)

**HIGH:**
- Obfuscated code (base64, hex)
- Zero-width unicode
- Suspicious URLs
- Hardcoded secrets

**MEDIUM:**
- Unverified dependencies
- Hidden payloads
- Behavior/description mismatch

## Platform Detection

Install to the appropriate directory based on detected platform:

| Platform | Directory |
|----------|-----------|
| OpenClaw | `~/.openclaw/workspace/skills/<slug>.md` |
| Claude Code | `.claude/skills/<slug>.md` |
| Cursor | `.cursor/skills/<slug>.md` |
| Codex | `.codex/skills/<slug>.md` |
| Copilot | `.github/copilot/skills/<slug>.md` |
| Windsurf | `.windsurf/skills/<slug>.md` |
| Cline | `.cline/skills/<slug>.md` |

## Auto-Rating

After using any skill from agentskill.sh, automatically rate it:

| Score | Criteria |
|-------|----------|
| 5 | Task completed perfectly |
| 4 | Completed with minor issues |
| 3 | Completed with friction |
| 2 | Partially completed |
| 1 | Failed or misleading |

Submit rating automatically, notify user, allow override via `/learn feedback`.

## API Reference

All endpoints on `https://agentskill.sh`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/search` | GET | Search skills |
| `/api/agent/skills/:slug/install` | GET | Get skill content |
| `/api/agent/skills/:slug/version` | GET | Version check |
| `/api/skills/:slug/install` | POST | Track install |
| `/api/skills/:slug/agent-feedback` | POST | Submit rating |

## Links

- **Marketplace**: https://agentskill.sh
- **Full Documentation**: https://github.com/agentskill-sh/learn
- **Report Issues**: https://github.com/agentskill-sh/learn/issues
