# Agent Workflow Guide

> **Private fork** (`clawdbot-dev`). PRs flow: `dev` → `fork` → `upstream`

## Quick Start

1. Root `AGENTS.md` → source of truth for coding standards
2. `/dev:help` → available commands
3. `/dev:gate` → run before every commit

---

## Structure

```
.workflow/
├── AGENTS.md                    # This file
├── signals/                     # Drop issues/ideas here
└── automation/
    ├── agent-automation.md      # Claude Code config
    └── infrastructure.md        # Worktrees, tmux, daily builds

.claude/
├── commands/dev/                # /dev:* commands
├── commands/build/              # /build:* commands
├── skills/                      # writing-tests, e2e-testing, reviewing-code
└── hooks/pre-bash.sh            # Safety validation
```

**Dev-only** (never push to fork/upstream): `.workflow/`, `.claude/`, `scripts/setup-*.sh`, `scripts/daily-*.sh`

---

## Git Remotes

`dev` (private) → `fork` (public) → `upstream` (target)

---

## Commands

Run `/dev:help` for full list.

| Command | Purpose |
|---------|---------|
| `/dev:gate` | Quality gate (lint, build, test) |
| `/dev:fix-issue <num>` | Fix upstream issue with TDD |
| `/dev:pr-review <num>` | Review PR (read-only) |
| `/dev:pr-test <num>` | Test PR locally |
| `/dev:tdd <phase>` | TDD workflow |
| `/build:release [ver]` | Build with hotfixes |

---

## Upstream Contributions

### Fix an Issue

```bash
git fetch upstream && git checkout -b pr/fix-123 upstream/main
/dev:tdd red "description"
/dev:tdd green
/dev:gate
scripts/committer "fix: description (#123)" <files>
git push fork pr/fix-123
gh pr create --repo clawdbot/clawdbot --base main --head petter-b:pr/fix-123
```

### Review a PR

```bash
gh pr view 123 --repo clawdbot/clawdbot
gh pr diff 123 --repo clawdbot/clawdbot
# Do NOT checkout - read-only review
```

### Test a PR

```bash
git checkout -b temp/test-123 main
gh pr checkout 123 --repo clawdbot/clawdbot
/dev:gate && /dev:e2e
git checkout main && git branch -D temp/test-123
```

---

## Release Builds

```bash
/build:release              # Latest with hotfixes
/build:release v2026.1.8    # Specific version
./scripts/release-fixes-status.sh  # Check hotfix status
```

**Hotfix convention**: Name branches `hotfix/*` → auto-applied during builds, auto-skipped when merged upstream.

**Artifacts**: `.worktrees/<version>/`, `.local/latest` symlink

---

## Daily Builds

```bash
./scripts/daily-all.sh      # ARM + x86 parallel (06:00 scheduled)
```

Results: `~/.clawdbot/daily-builds/summary-$(date +%Y-%m-%d).log`

---

## Multi-Agent Safety

From root `AGENTS.md` (source of truth):
- Don't stash, switch branches, or modify worktrees
- Scope commits to your files via `scripts/committer`
- Use `.worktrees/<agent>/` for isolation

---

## Quality Standards

From root `AGENTS.md`:
- Run `/dev:gate` before commits
- 70% coverage threshold
- Files under ~700 LOC
- CHANGELOG: `- Feature: description. (#PR) - thanks @contributor`

---

## Troubleshooting

```bash
pgrep -f clawdbot && pkill -f clawdbot   # Stuck processes
lsof -i :8080                             # Port conflicts
git worktree list                         # Worktree issues
pnpm format                               # Lint auto-fix
```

See `automation/infrastructure.md` for logs and environment variables.

---

## Signals

Drop issues/ideas in `.workflow/signals/`:

```markdown
# signals/YYYY-MM-DD-<topic>.md
**Type**: issue | idea | blocker | observation
**Context**: <what you were doing>
<2-3 sentences>
```

Higher-tier agents handle triage.

---

## Upstream Patterns

- Issues: https://github.com/clawdbot/clawdbot/issues
- PRs: focused scope, tests, CHANGELOG entry, conventional commit title
- AI-assisted: mark in PR description, note testing level
