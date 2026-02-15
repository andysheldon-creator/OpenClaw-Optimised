# PR Split Plan: feature/devsecops-framework → Upstream

> Strategy for breaking the monolithic `feature/devsecops-framework` branch
> (21 commits, ~10,400 lines) into focused, reviewable upstream PRs.

---

## Branch Overview

| # | Commit | Lines | Theme |
|---|--------|-------|-------|
| 1 | `72b32b478` | +568 | DevSecOps framework |
| 2 | `d64fb2a9d` | +144 | Biome lint fixes (gateway) |
| 3 | `1d20e6fad` | +339 | Biome lint fixes (gateway phase 2) |
| 4 | `0b59d7408` | +1 | Flaky test fix (routing perf) |
| 5 | `bb701ede6` | +5 | Swift protocol regen |
| 6 | `a9611e1f4` | +1 | Flaky test fix (embed perf) |
| 7 | `21c0a1dbc` | +155 | Budget cap + cost tracker |
| 8 | `421bccd4a` | +108 | Windows test fixes |
| 9 | `ee26ac776` | +166 | Installation UX (model select) |
| 10 | `6bb5bdfa2` | +145 | Workspace file detection |
| 11 | `8a828a10b` | +146 | Smart workspace upgrade |
| 12 | `a7240d0d7` | +74 | Workspace MD personality fix |
| 13 | `063089c3e` | +471 | Subscription + hybrid routing |
| 14 | `288a2312d` | +361 | Subscription onboarding wizard |
| 15 | `57ec1e11a` | +50 | Unattended subscription mode |
| 16 | `3c8000223` | +3,454 | Core: tasks, voice, alerting |
| 17 | `2cab68c78` | +524 | Configure wizard (new sections) |
| 18 | `1b6f69f03` | +256 | One-line installer script |
| 19 | `783ff3bb8` | +1,713 | Unit tests + Telegram voice loop |
| 20 | `ba619349e` | +975 | Control UI: Tasks + Voice tabs |
| 21 | `f9c3a1dc7` | +796 | Mission Control integration |

---

## Recommended PR Sequence

PRs should be opened in this order. Each builds on the previous and
can be reviewed independently.

### PR 1: DevSecOps Framework + Lint Fixes
**Branch:** `pr/devsecops-lint`
**Commits:** 1-3 (`72b32b478` → `1d20e6fad`)
**Lines:** ~1,050 | **Risk:** Low

**What:** CI/CD pipelines, security scanning config, failure tracking,
Biome lint fixes across gateway files.

**Files:**
- `.github/workflows/security.yml` (new)
- `CLAUDE.md`, docs (BACKLOG, FAILURES, METRICS)
- `config/zap-config.yml`, scripts (`run-sast.sh`, `run-dast.sh`)
- `src/gateway/*.ts` (lint fixes only)
- `src/services/performance.test.ts` (lint fixes)

**Why first:** No functional changes to runtime code. Establishes CI
quality gates that subsequent PRs benefit from.

---

### PR 2: Test Stability + Platform Fixes
**Branch:** `pr/test-stability`
**Commits:** 4-6, 8 (`0b59d7408`, `bb701ede6`, `a9611e1f4`, `421bccd4a`)
**Lines:** ~115 | **Risk:** Low

**What:** Fix flaky performance tests (relax thresholds for CI runners),
regenerate Swift protocol, fix 22 Windows-specific test failures.

**Files:**
- `src/services/performance.test.ts` (threshold tweaks)
- `apps/macos/Sources/.../GatewayModels.swift` (1 field)
- 7 test files (Windows path + timing fixes)

**Why second:** Pure test/build reliability improvements. No feature changes.

---

### PR 3: Cost Controls + Budget Cap
**Branch:** `pr/cost-controls`
**Commits:** 7 (`21c0a1dbc`)
**Lines:** ~155 | **Risk:** Low

**What:** Default model to Sonnet 4.5, add monthly budget cap
(`agent.monthlyBudgetUsd`), add cost tracker service with per-session
and per-model tracking, bounded-size cache metrics.

**Files:**
- `src/agents/defaults.ts` (model default)
- `src/services/cost-tracker.ts` (new)

---

### PR 4: Workspace Upgrade + Onboarding UX
**Branch:** `pr/onboarding-ux`
**Commits:** 9-12 (`ee26ac776` → `a7240d0d7`)
**Lines:** ~530 | **Risk:** Medium

**What:** Smarter workspace upgrades that preserve personality files,
detect pre-existing workspace content during onboarding, model selection
UI with cost visibility.

**Files:**
- `src/agents/workspace.ts` (smart upgrade logic)
- `src/commands/configure.ts` (workspace detection)
- `src/commands/onboard-helpers.ts` (file detection utils)
- `src/commands/onboard-interactive.ts` (model selection, cost display)
- `.env.example`, `README.md`, `docs/configuration.md`

---

### PR 5: Claude Code Subscription + Hybrid Routing
**Branch:** `pr/subscription-routing`
**Commits:** 13-15 (`063089c3e` → `57ec1e11a`)
**Lines:** ~880 | **Risk:** Medium

**What:** Claude Code subscription backend (detecting active sub,
using `claude -p` for inference), hybrid routing tier that falls
through API → Subscription → Ollama, subscription onboarding wizard,
unattended subscription mode.

**Files:**
- `src/agents/claude-cli-runner.ts` (subscription backend)
- `src/auto-reply/reply.ts` (hybrid routing integration)
- `src/services/hybrid-router.ts` (tier additions)
- `src/commands/onboard-interactive.ts` (subscription wizard)
- `src/commands/onboard-non-interactive.ts`
- `src/commands/onboard-types.ts`
- `src/gateway/server.ts` (unattended mode)

---

### PR 6: Autonomous Tasks + Voice + Alerting (Core Features)
**Branch:** `pr/tasks-voice-alerting`
**Commits:** 16-17 (`3c8000223`, `2cab68c78`)
**Lines:** ~3,980 | **Risk:** High (largest PR)

**What:** The main feature PR. Autonomous multi-step task system,
ElevenLabs voice calls (TTS + conversational), crash alerting with
multi-channel dispatch, gateway protocol extensions, configure wizard
sections for all new features.

**Files:**
- `src/tasks/` (runner, store, types, progress-reporter — all new)
- `src/voice/` (tts, session, context — all new)
- `src/infra/alerting.ts` (new)
- `src/gateway/server.ts` (protocol handlers)
- `src/gateway/protocol/schema.ts` (message types)
- `src/config/config.ts` (new config types)
- `src/commands/configure.ts` (wizard sections)
- `docs/FORK_DELTA_ANALYSIS.md`, `docs/MISSION_CONTROL_INTEGRATION.md`

**Review tip:** The task system (`src/tasks/`) and voice system
(`src/voice/`) are independent and can be reviewed separately.

---

### PR 7: Unit Tests + Telegram Voice Loop
**Branch:** `pr/tests-telegram-voice`
**Commits:** 19 (`783ff3bb8`)
**Lines:** ~1,713 | **Risk:** Low

**What:** 95 unit tests for task/voice systems, Telegram inbound
voice-note → TTS reply loop, remove unused elevenlabs dependency.

**Files:**
- `src/tasks/*.test.ts` (store, runner, progress-reporter tests)
- `src/voice/*.test.ts` (tts, session, context tests)
- `src/telegram/bot.ts` (voice note handling)
- `package.json` (remove unused dep)

**Depends on:** PR 6

---

### PR 8: Control UI Dashboard Tabs
**Branch:** `pr/ui-tasks-voice`
**Commits:** 20 (`ba619349e`)
**Lines:** ~975 | **Risk:** Low

**What:** Tasks tab (create, monitor, cancel, pause/resume, progress bars,
step detail) and Voice tab (session status, start/end, live transcript)
in the Control UI dashboard.

**Files:**
- `ui/src/ui/controllers/tasks.ts` (new)
- `ui/src/ui/controllers/voice.ts` (new)
- `ui/src/ui/views/tasks.ts` (new)
- `ui/src/ui/views/voice.ts` (new)
- `ui/src/ui/navigation.ts`, `app.ts`, `app-render.ts` (wiring)

**Depends on:** PR 6

---

### PR 9: One-Line Installer
**Branch:** `pr/installer`
**Commits:** 18 (`1b6f69f03`)
**Lines:** ~256 | **Risk:** Low

**What:** `curl | bash` installer for Linux (Mint/Ubuntu/Debian).
Installs Node.js 22, pnpm, clones repo, builds, configures systemd,
runs onboarding wizard.

**Files:**
- `install.sh` (new)

**Standalone:** No dependencies on other PRs.

---

### PR 10: Mission Control Integration
**Branch:** `pr/mission-control`
**Commits:** 21 (`f9c3a1dc7`)
**Lines:** ~796 | **Risk:** Low

**What:** Gateway reverse-proxy for Mission Control at `/mc/`, Docker
Compose services for MC stack, setup script, configure wizard section.

**Files:**
- `src/gateway/mission-control-proxy.ts` (new)
- `src/gateway/mission-control-proxy.test.ts` (10 tests)
- `scripts/setup-mission-control.sh` (new)
- `docker-compose.yml`, `src/config/config.ts`, `src/gateway/server.ts`,
  `src/commands/configure.ts` (additions)
- `docs/MISSION_CONTROL_INTEGRATION.md` (updated)

**Depends on:** PR 6 (for config types)

---

## Dependency Graph

```
PR 1 (DevSecOps) ─── standalone
PR 2 (Tests)     ─── standalone
PR 3 (Budget)    ─── standalone
PR 4 (Onboarding)─── standalone
PR 5 (Subscription)── depends on PR 4 (onboarding changes)
PR 6 (Core)      ─── depends on PR 3 (config types)
PR 7 (Tests)     ─── depends on PR 6
PR 8 (UI Tabs)   ─── depends on PR 6
PR 9 (Installer) ─── standalone
PR 10 (MC)       ─── depends on PR 6
```

**Critical path:** PR 3 → PR 6 → PR 7/8/10

---

## Splitting Strategy

### Option A: Cherry-Pick (Recommended for Clean History)

```bash
# For each PR, create a branch from upstream main:
git checkout -b pr/devsecops-lint upstream/main
git cherry-pick 72b32b478 d64fb2a9d 1d20e6fad
git push origin pr/devsecops-lint
gh pr create --title "feat: DevSecOps framework + lint fixes" ...
```

Repeat for each PR. Cherry-pick preserves individual commits.
May need conflict resolution for later PRs.

### Option B: Diff-Based (Simpler, Squash-Merges)

```bash
# For each PR, create a branch and apply a filtered diff:
git checkout -b pr/devsecops-lint upstream/main
# Copy only the relevant files from feature branch
git checkout feature/devsecops-framework -- .github/ CLAUDE.md config/ docs/BACKLOG.md docs/FAILURES.md docs/METRICS.md scripts/run-*.sh
git commit -m "feat: DevSecOps framework — SAST pipeline, failure tracking, metrics"
```

Simpler but loses individual commit history.

---

## Summary

| PR | Title | Lines | Risk | Depends On |
|----|-------|-------|------|------------|
| 1 | DevSecOps + lint | ~1,050 | Low | — |
| 2 | Test stability | ~115 | Low | — |
| 3 | Cost controls | ~155 | Low | — |
| 4 | Onboarding UX | ~530 | Med | — |
| 5 | Subscription routing | ~880 | Med | PR 4 |
| 6 | Tasks + Voice + Alerting | ~3,980 | High | PR 3 |
| 7 | Unit tests + Telegram voice | ~1,713 | Low | PR 6 |
| 8 | Control UI tabs | ~975 | Low | PR 6 |
| 9 | Installer script | ~256 | Low | — |
| 10 | Mission Control | ~796 | Low | PR 6 |
| **Total** | | **~10,450** | | |
