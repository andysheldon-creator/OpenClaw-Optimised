---
summary: "Molt: self-healing update agent for Clawdbot"
read_when:
  - Setting up automatic updates from upstream
  - Recovering from failed nightly updates
  - Contributing self-healing infrastructure to Clawdbot
---
# Molt: Self-Healing Update Agent

> *Lobsters molt to grow — shedding their old shell and emerging fresh. Molt gives your Clawdbot the same resilience.*

## Problem

Running Clawdbot on a self-hosted server (VM, Raspberry Pi, home lab) means you want automatic updates from upstream. But updates can break things:

- `pnpm install` fails due to network issues or dependency conflicts
- New code has a bug that crashes the gateway
- The gateway doesn't come back up after restart
- You're not at your desk (or even awake) when this happens

Currently, if a nightly update breaks Maja, she goes silent. You discover this hours later when she doesn't respond. You SSH in, diagnose the issue, roll back, and restart. This is manual, slow, and defeats the purpose of automation.

## Philosophy: Agentic Recovery

Traditional self-updaters try to be **deterministic**: build complex rollback mechanisms, staging directories, blue/green deployments. That's great for production fleets, but overkill for a single self-hosted bot.

Molt takes a different approach: **agentic recovery**.

The insight is simple: you already have access to a very smart AI (Claude Opus) that can diagnose problems and fix them. The current "SSH in and fix it" process *works* — we're just automating the "SSH in" part.

**Key principles:**

1. **Try first, fix later** — Don't over-engineer prevention. Try the update, see what happens.
2. **Smart beats deterministic** — A simple rollback that fails 20% of the time + an AI that can fix the other 20% beats a complex rollback that fails 5% of the time but leaves you stuck.
3. **Context-aware health** — "Is the gateway healthy?" depends on what *you* use. If Discord is broken but you only use Slack, that's not a failure.
4. **Observable failures** — When something breaks, capture enough context for the AI (or you) to fix it.

## Module Manifest

Not everyone uses every Clawdbot feature. If you don't use Discord, you don't care if the Discord adapter crashed overnight.

Molt uses a **module manifest** to know what *you* care about:

```json5
// ~/.clawdbot/molt/modules.json
{
  "modules": {
    // Channels you actively use
    "channels": ["slack", "telegram"],

    // Integrations you depend on
    "integrations": ["todoist", "obsidian", "google-calendar"],

    // Features you'd notice if broken
    "features": ["cron", "memory", "heartbeat"],

    // MCP servers you need running
    "mcp": ["filesystem", "obsidian"]
  },

  // What counts as "healthy" for you
  "healthCriteria": {
    "gateway": true,           // Gateway process running (always required)
    "ping": true,              // Gateway responds to ping (always required)
    "channels": "any",         // "any" = at least one channel works, "all" = all must work
    "integrations": "best-effort"  // Log failures but don't rollback
  }
}
```

**Health check behavior:**

| Module State | channels: "any" | channels: "all" |
|--------------|-----------------|-----------------|
| Slack up, Telegram down | Healthy | Unhealthy |
| Both down | Unhealthy | Unhealthy |
| Both up | Healthy | Healthy |

This means if an update breaks Telegram but you primarily use Slack, Molt won't rollback — it'll just note "Telegram adapter failed to start" in the report.

### Auto-Discovery

On first run, Molt can scan your config to suggest a manifest:

```bash
clawdbot molt init
# Scans clawdbot.json, detects enabled channels/integrations
# Generates ~/.clawdbot/molt/modules.json
# You review and tweak
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MOLT UPDATE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │ Phase 0  │──▶│  Phase 1 │──▶│  Phase 2 │──▶│  Phase 3 │     │
│  │ Preflight│   │  Update  │   │  Verify  │   │  Report  │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  Acquire lock   git pull       Health check   Slack/Log        │
│  Check remote   pnpm install   Module checks  Changelog        │
│  Save state     Restart        Stability wait Update history   │
│                                                                 │
│                      │                                          │
│                      ▼ (on failure)                             │
│               ┌──────────────┐                                  │
│               │   Rollback   │                                  │
│               └──────┬───────┘                                  │
│                      │                                          │
│          ┌──────────┴──────────┐                               │
│          ▼                     ▼                                │
│   ┌─────────────┐      ┌─────────────┐                         │
│   │  Rollback   │      │  Rollback   │                         │
│   │  SUCCEEDS   │      │   FAILS     │                         │
│   └──────┬──────┘      └──────┬──────┘                         │
│          │                    │                                 │
│          ▼                    ▼                                 │
│   ┌─────────────┐      ┌─────────────┐                         │
│   │ AUTONOMOUS  │      │  RECOVERY   │                         │
│   │  RECOVERY   │      │    .md      │                         │
│   │             │      │  (manual)   │                         │
│   │ Gateway UP  │      └─────────────┘                         │
│   │ Agent runs  │                                               │
│   │ Diagnose    │                                               │
│   │ Fix & retry │                                               │
│   └─────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Autonomous Recovery Flow:**
```
Rollback succeeds
       │
       ▼
Gateway is UP (old version)
       │
       ▼
clawdbot wake --text "diagnose and fix"
       │
       ▼
Agent reads crash log
       │
       ├──▶ Fixable? ──▶ Apply fix ──▶ Retry molt.sh ──▶ Success!
       │
       └──▶ Not fixable? ──▶ Report to user via Slack
```

## Phases

### Phase 0: Preflight

Before doing anything:

```bash
# Acquire lock (prevent concurrent runs)
if ! mkdir ~/.clawdbot/molt/lock 2>/dev/null; then
  echo "Another molt run in progress, exiting"
  exit 0
fi
trap "rmdir ~/.clawdbot/molt/lock" EXIT

# Fetch and check if there's anything to do
cd $CLAWDBOT_DIR
git fetch origin

CURRENT=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$CURRENT" = "$REMOTE" ]; then
  echo "Already up to date"
  exit 0
fi

# Save state for potential rollback
echo "$CURRENT" > ~/.clawdbot/molt/pre-update-head
cp pnpm-lock.yaml ~/.clawdbot/molt/pre-update-lock.yaml
git log --oneline -1 > ~/.clawdbot/molt/pre-update-info

# Check for clean workdir (configurable)
if [ -n "$(git status --porcelain)" ]; then
  echo "Workdir not clean, aborting"
  # Notify but don't rollback (nothing to rollback to)
  exit 1
fi
```

**Key difference from v1:** We fetch *before* deciding to proceed, and we don't stop the gateway yet.

### Phase 1: Update

```bash
# Merge (fail-fast on conflicts)
if ! git merge origin/main --ff-only; then
  echo "Merge failed (diverged history?), manual intervention needed"
  exit 1
fi

# Install deps
pnpm install --frozen-lockfile --prefer-offline

# Build (if applicable)
pnpm build

# Now restart the gateway
clawdbot daemon restart
```

**Note:** We restart *after* install/build succeed. If `pnpm install` fails, the old gateway is still running — no downtime.

### Phase 2: Verify

Health check with stability window:

```bash
# Wait for gateway to come up
MAX_WAIT=60
STABILITY_WINDOW=30

# Stage 1: Gateway responds to ping
waited=0
while [ $waited -lt $MAX_WAIT ]; do
  if clawdbot ping --timeout 5 2>/dev/null; then
    break
  fi
  sleep 5
  waited=$((waited + 5))
done

if [ $waited -ge $MAX_WAIT ]; then
  echo "Gateway didn't come up"
  exit 1
fi

# Stage 2: Stability window (catch crash loops)
echo "Gateway up, waiting ${STABILITY_WINDOW}s for stability..."
sleep $STABILITY_WINDOW

if ! clawdbot ping --timeout 5 2>/dev/null; then
  echo "Gateway crashed during stability window"
  exit 1
fi

# Stage 3: Module health checks (based on manifest)
clawdbot molt check-modules
```

**Module health checks** are based on your manifest:

```bash
# Pseudo-code for check-modules
for channel in manifest.channels:
  status = clawdbot channels status $channel
  if status != "connected":
    if manifest.healthCriteria.channels == "all":
      fail("Channel $channel not connected")
    else:
      warn("Channel $channel not connected")

# Similar for integrations, mcp servers, etc.
```

### Phase 3: Report & Recover

Always report what happened:

```bash
OLD_HEAD=$(cat ~/.clawdbot/molt/pre-update-head)
NEW_HEAD=$(git rev-parse HEAD)

# Generate changelog
git log --oneline $OLD_HEAD..$NEW_HEAD > ~/.clawdbot/molt/changelog.md

# Summarize for notification
COMMIT_COUNT=$(git rev-list --count $OLD_HEAD..$NEW_HEAD)
LAST_MSG=$(git log -1 --format=%s)

# Send notification based on outcome
case $OUTCOME in
  success)
    notify "Updated to $NEW_HEAD ($COMMIT_COUNT commits). Latest: $LAST_MSG"
    ;;
  rollback)
    notify "Update failed, rolled back to $OLD_HEAD. Error: $ERROR"
    ;;
  partial)
    notify "Updated but with issues: $WARNINGS"
    ;;
  manual)
    notify "Update needs manual intervention: $ERROR"
    ;;
esac
```

### Recovery (Agentic & Autonomous)

When verification fails, Molt doesn't just rollback and give up. It leverages the fact that **after a successful rollback, Clawdbot is running again** — so it can use Clawdbot's own agent system to diagnose and fix the issue.

**The key insight:** Rollback restores the old (working) version → Gateway is up → Agent can run → Agent diagnoses and fixes → Retry update.

```
Update fails → Rollback succeeds → Gateway UP → Trigger agent → Diagnose & fix → Retry
```

**Recovery flow:**

1. **Capture context** — Crash logs, error messages, failed commit
2. **Rollback** — `git checkout $OLD_HEAD && pnpm install && restart`
3. **If rollback succeeds** — Trigger autonomous recovery agent via `clawdbot wake`
4. **If rollback fails** — Write RECOVERY.md for manual intervention

**Autonomous recovery agent prompt:**

```bash
# After successful rollback, wake the agent to diagnose and fix
clawdbot wake --mode now --text "$(cat <<'EOF'
🦞 MOLT AUTONOMOUS RECOVERY

The nightly update failed, but rollback succeeded. I'm running on the old version.

## Your Mission
1. Diagnose what went wrong
2. If fixable, fix it and retry the update
3. If not fixable, report findings to the user

## Context
- Old HEAD (current): ${CURRENT_HEAD}
- Failed HEAD: ${NEW_HEAD}
- Crash log: ~/.clawdbot/molt/crash-log.txt

## Steps
1. Read the crash log: cat ~/.clawdbot/molt/crash-log.txt
2. Identify the error (common causes below)
3. If you can fix it:
   - Apply the fix
   - Run: ~/.clawdbot/molt/molt.sh
   - If it succeeds, we're done!
4. If you can't fix it:
   - Explain what went wrong
   - Message the user via Slack with your findings

## Common Fixable Issues
- "Cannot find module X" → Try: cd ~/clawd && pnpm install --force
- "ENOSPC" (disk full) → Try: pnpm store prune && pnpm cache clean
- Network timeout during install → Just retry: ~/.clawdbot/molt/molt.sh
- Lockfile conflict → Try: rm pnpm-lock.yaml && git checkout pnpm-lock.yaml && pnpm install

## Important
- You have 1 retry attempt. If molt.sh fails again, report to the user.
- Don't get stuck in a loop - if unsure, ask for help.
EOF
)"
```

**Why this works:**
- Uses existing Clawdbot infrastructure (no new agent framework)
- Agent has full access to bash, file reading, etc.
- Agent can iterate: try fix → retry molt → verify
- Falls back to human if truly stuck

**Fallback (rollback fails):**

If rollback itself fails, Clawdbot is down and can't help. In this case, Molt writes a `RECOVERY.md` file with:
- What happened
- Crash log location
- Manual recovery steps
- Context for an external AI (like Claude Code via SSH) to fix

```markdown
# Molt Recovery Required

The nightly update failed and automatic rollback also failed.

## What happened
- Old HEAD: abc123
- Failed HEAD: def456
- Error: Gateway didn't start

## Crash log
~/.clawdbot/molt/crash-log.txt

## Manual recovery
1. SSH into the server
2. cd ~/clawd && git checkout abc123 && pnpm install && pnpm build
3. systemctl --user restart clawdbot-gateway
```

## Configuration

```json5
// ~/.clawdbot/molt/config.json
{
  // Update source
  "repo": "/home/corey/clawd",
  "remote": "origin",
  "branch": "main",

  // Health check timing
  "health": {
    "startupTimeoutSeconds": 60,
    "stabilityWindowSeconds": 30,
    "pingTimeoutSeconds": 5
  },

  // What to check (references modules.json)
  "moduleManifest": "~/.clawdbot/molt/modules.json",

  // Notifications
  "notify": {
    "channel": "slack",
    "onSuccess": true,
    "onNoChange": false,
    "onRollback": true,
    "onManualNeeded": true,
    "rateLimitHours": 24  // Don't spam if failing repeatedly
  },

  // Recovery behavior
  "recovery": {
    "autoRollback": true,
    "captureLogLines": 100,
    "writeRecoveryDoc": true
  },

  // Safety
  "requireCleanWorkdir": true,
  "dryRun": false
}
```

## State Files

All state lives in `~/.clawdbot/molt/` (persists across reboots):

| File | Purpose |
|------|---------|
| `config.json` | Molt configuration |
| `modules.json` | Module manifest (what you care about) |
| `pre-update-head` | Git commit before current update |
| `pre-update-lock.yaml` | pnpm-lock before current update |
| `last-good` | Last commit that passed health checks |
| `history.jsonl` | Update history log |
| `changelog.md` | Human-readable changelog |
| `crash-log.txt` | Gateway logs on failure |
| `RECOVERY.md` | Instructions when manual fix needed |
| `lock/` | Directory-based lock (exists = locked) |

## CLI Interface

```bash
# Initialize (scan config, generate module manifest)
clawdbot molt init

# Run update cycle
clawdbot molt run
clawdbot molt run --dry-run

# Check module health (without updating)
clawdbot molt check

# View status
clawdbot molt status

# View history
clawdbot molt history

# Manual rollback
clawdbot molt rollback              # to pre-update-head
clawdbot molt rollback --last-good  # to last-good
clawdbot molt rollback <commit>     # to specific commit
```

## Scheduling

```bash
# Via Clawdbot cron (recommended)
clawdbot cron add \
  --name "Nightly molt" \
  --cron "0 2 * * *" \
  --tz "UTC" \
  --session isolated \
  --message "Run: clawdbot molt run"

# Via system cron (alternative)
0 2 * * * /home/corey/.local/bin/clawdbot molt run >> ~/.clawdbot/molt/cron.log 2>&1
```

## Platform Support

**Linux is the primary target.** The examples use bash and assume systemd.

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (systemd) | Primary | Full support |
| Linux (other) | Supported | Uses `clawdbot daemon` |
| macOS | Planned | Phase 2 |
| Windows | Aspirational | Phase 3, maybe |
| Docker | Different pattern | Orchestrator handles updates |

For macOS/Windows, the core logic is the same but process management differs. We'll abstract that when we get there.

## Handling GPT-5.2's Valid Concerns

The review raised good points. Here's how we address them without over-engineering:

### "Stopping gateway before knowing you can build"

**Solution:** We don't. Phase 1 does `git merge`, `pnpm install`, `pnpm build` *before* restarting. If any fail, old gateway keeps running.

### "Molt depends on the thing it's updating"

**Partial solution:** Molt's core logic (the bash scripts / simple TypeScript) doesn't use complex Clawdbot internals. It only calls:
- `clawdbot daemon restart` (thin wrapper around systemctl)
- `clawdbot ping` (simple health check)

If those break, yes, we have a problem. But they're stable, simple commands unlikely to break. If they do break, the AI can still use `systemctl` directly.

**Future:** Could extract Molt to a separate minimal package, but that's optimization for later.

### "State in /tmp is fragile"

**Fixed:** State lives in `~/.clawdbot/molt/`, persists across reboots.

### "Need a lock"

**Fixed:** Directory-based lock at `~/.clawdbot/molt/lock/`.

### "Stability window"

**Added:** 30-second stability window after gateway comes up, catches crash loops.

### "Blue/green deployments"

**Intentionally skipped:** Too complex for single-instance self-hosted. If rollback fails 5% of the time, the AI can handle that 5%.

## Success Criteria

1. **Zero-touch updates** — Nightly updates work without intervention for 30+ days
2. **Smart recovery** — When things break, enough context is captured for AI/human to fix quickly
3. **No false alarms** — If Discord breaks but you use Slack, you're not woken up
4. **Visibility** — Every update cycle produces a clear log/notification

## Implementation Plan

### Phase 1: MVP (Your Setup)

- [x] PRD (this document)
- [ ] Module manifest schema + init command
- [ ] Core update cycle (bash script or simple TS)
- [ ] Health check with stability window + module checks
- [ ] Simple rollback
- [ ] Slack notification
- [ ] Crash log capture
- [ ] Lock file

### Phase 2: Polish

- [ ] Full CLI (`clawdbot molt *`)
- [ ] History tracking
- [ ] Dry-run mode
- [ ] Rate-limited notifications
- [ ] RECOVERY.md generation

### Phase 3: Upstream

- [ ] Abstract platform differences
- [ ] Tests
- [ ] Documentation
- [ ] GitHub issue/PR

## References

- [Clawdbot Cron Jobs](/automation/cron-jobs) — scheduling
- [Clawdbot Hooks](/hooks) — event-driven automation
- [GitHub Issue #1620](https://github.com/clawdbot/clawdbot/issues/1620) — related: auto-revert config changes
- [CLAUDE.md](/CLAUDE.md) — current manual recovery guide

---

*Molt: because your bot deserves to grow, not just break.*
