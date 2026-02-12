---
name: learn
description: Discover, install, and manage AI agent skills from agentskill.sh. Search for capabilities, install mid-session with security scanning, and provide feedback. Use when asked to find skills, install extensions, or check skill safety.
---

# Learn — Find & Install Agent Skills

Discover, install, and manage AI agent skills from [agentskill.sh](https://agentskill.sh). This skill turns your agent into a self-improving system that can search for capabilities it lacks, install them mid-session, and provide feedback after use.

## Overview

Use this skill when the user asks to find, search, discover, or install agent skills, when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or when they express interest in extending capabilities.

## Safety

**Two-layer security model:**

1. **Registry-side (agentskill.sh)**: All skills are pre-scanned before publication. Security score is computed and stored. Dangerous skills are flagged or rejected.

2. **Client-side (this skill)**: Security score is displayed to user before install. Skills scoring <70 are blocked. User must acknowledge warnings for scores 70-89.

| Score  | Rating  | Action                          |
| ------ | ------- | ------------------------------- |
| 90-100 | SAFE    | Install proceeds, user informed |
| 70-89  | REVIEW  | User must acknowledge issues    |
| <70    | BLOCKED | Installation refused            |

## Commands

### `/learn <query>` — Search for Skills

1. Use `web_fetch` to call: `https://agentskill.sh/api/agent/search?q=<URL-encoded query>&limit=5`
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

### `/learn config autorating <on|off>` — Toggle Auto-Rating

Enable or disable automatic skill rating after use.

## Install Flow

1. Fetch skill content from API (includes pre-computed `securityScore`)
2. Display security score to user with explanation
3. If score >= 90: Show preview, ask confirmation
4. If score 70-89: Show warnings, require explicit acknowledgment
5. If score < 70: BLOCK installation, explain why
6. Write skill file with metadata header:
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
7. Track successful install via POST to API (fire-and-forget, only after file written)

**Note**: Install tracking happens after successful file write. This is intentional — we only count completed installs, not failed attempts.

## Security Scanning

Skills on agentskill.sh are pre-scanned using these pattern categories:

**CRITICAL patterns** (score penalty: -20 each, 5+ = score 0):

- Prompt injection: `ignore.*previous`, `forget.*instructions`, `you are now`, `DAN mode`, `jailbreak`
- Remote code execution: `curl.*\|.*bash`, `wget.*\|.*sh`, `eval\s*\(`, `base64.*-d.*\|.*bash`
- Credential theft: `cat.*\.aws`, `cat.*\.ssh`, `keychain`, `credentials`
- Reverse shells: `/dev/tcp/`, `nc\s+-e`, `socket.*connect`
- Destructive: `rm\s+-rf\s+/`, `mkfs`, `dd.*if=/dev/zero`

**HIGH patterns** (score penalty: -10 each):

- Obfuscation: base64 strings >100 chars, `\x[0-9a-f]{2}` sequences
- Zero-width unicode: `\u200b`, `\u200c`, `\u200d`, `\ufeff`
- Suspicious URLs: `bit.ly`, `tinyurl`, raw GitHub from new accounts
- Persistence: `crontab`, `\.bashrc`, `systemctl.*enable`
- Hardcoded secrets: `AKIA[0-9A-Z]{16}`, `ghp_[a-zA-Z0-9]{36}`

**MEDIUM patterns** (score penalty: -3 each):

- Unverified deps: `pip install` from URLs, unknown npm packages
- Privacy collection: `uname`, `hostname`, `env` enumeration

The security score displayed during install reflects these scans performed at publish time.

## Platform Detection

Install to the appropriate directory based on detected platform:

| Platform    | Directory                                |
| ----------- | ---------------------------------------- |
| OpenClaw    | `~/.openclaw/workspace/skills/<slug>.md` |
| Claude Code | `.claude/skills/<slug>.md`               |
| Cursor      | `.cursor/skills/<slug>.md`               |
| Codex       | `.codex/skills/<slug>.md`                |
| Copilot     | `.github/copilot/skills/<slug>.md`       |
| Windsurf    | `.windsurf/skills/<slug>.md`             |
| Cline       | `.cline/skills/<slug>.md`                |

## Auto-Rating (Opt-Out)

After using a skill from agentskill.sh, the agent rates it to help improve discovery.

**Default behavior** (can be disabled):

1. Agent evaluates skill effectiveness (1-5 scale)
2. Shows rating to user: `Rated **<skill>** 4/5 — clear instructions, worked well`
3. Asks: `Send rating? (Y/n) — disable: /learn config autorating off`
4. If confirmed or no response in 5s, submits rating
5. User can override anytime: `/learn feedback <slug> <score> [comment]`

**What's sent** (no PII):

- Score (1-5)
- Brief comment (what worked/didn't)
- Platform name (e.g., "openclaw")
- Timestamp

**Disable auto-rating**:

```
/learn config autorating off
```

| Score | Criteria                    |
| ----- | --------------------------- |
| 5     | Task completed perfectly    |
| 4     | Completed with minor issues |
| 3     | Completed with friction     |
| 2     | Partially completed         |
| 1     | Failed or misleading        |

## API Reference

All endpoints on `https://agentskill.sh`:

| Endpoint                           | Method | Purpose                            |
| ---------------------------------- | ------ | ---------------------------------- |
| `/api/agent/search`                | GET    | Search skills                      |
| `/api/agent/skills/:slug/install`  | GET    | Get skill content + security score |
| `/api/agent/skills/:slug/version`  | GET    | Version check                      |
| `/api/skills/:slug/install`        | POST   | Track install                      |
| `/api/skills/:slug/agent-feedback` | POST   | Submit rating                      |

## Links

- **Marketplace**: https://agentskill.sh
- **Full Documentation**: https://github.com/agentskill-sh/learn
- **Report Issues**: https://github.com/agentskill-sh/learn/issues
