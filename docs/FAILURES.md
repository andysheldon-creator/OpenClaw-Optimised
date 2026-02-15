# Failure & Incident Log

> Every failure is a learning opportunity. Log it, learn from it, prevent it.
> Add entries in reverse chronological order (newest first).

## Template

### [DATE] - [SHORT TITLE]
- **Severity:** critical / high / medium / low
- **Category:** build / test / security / deploy / runtime / dependency
- **Description:** What happened?
- **Root Cause:** Why did it happen?
- **Impact:** What was affected? How long?
- **What We Learned:** Key takeaway
- **Prevention Measures:** What was changed to prevent recurrence?
- **Related:** PR/commit link, backlog item, etc.

---

## Failure Log

### 2026-02-15 - CI lint failures on all main-branch merges since Phase 1
- **Severity:** medium
- **Category:** build
- **Description:** All 5 Phase 1 security PRs (#2-#7) merged to main with failing CI. The `pnpm lint` step (Biome check) reported 8 errors across `config-mask.ts` and `performance.test.ts` -- string concatenation instead of template literals, unused imports, untyped variable, unorganized imports, non-null assertions, long lines.
- **Root Cause:** Phase 1 security fixes were written and merged without running `pnpm lint` locally first. The CI was already failing before our PRs, so we did not notice the lint failures were from our code.
- **Impact:** CI red on every main-branch commit since Phase 1 (5 consecutive failed runs). No production impact -- lint errors are code-quality only, not functional bugs.
- **What We Learned:** Always run `pnpm lint` (or better, `pnpm lint:fix`) locally before pushing. Never merge to main with failing CI, even if failures appear to be pre-existing -- investigate first.
- **Prevention Measures:** Fixed all 8 errors via `biome check --write --unsafe` + manual `RecallResult` type annotation. Added lint-check reminder to CLAUDE.md workflow notes.
- **Related:** PR #8 (devsecops-framework), affected files: `src/gateway/config-mask.ts`, `src/services/performance.test.ts`.
### 2026-02-14 - MITRE ATLAS Security Audit: 3 of 4 critical incidents fully vulnerable
- **Severity:** critical
- **Category:** security
- **Description:** MITRE ATLAS investigation (PR-26-00176-1) identified 4 critical security incidents in the OpenClaw codebase. 3 were fully vulnerable, 1 partially mitigated. 13 of 17 ATLAS technique vectors rated CRITICAL.
- **Root Cause:** Gateway had zero CSRF protection, no origin validation on WebSocket, default auth=none on loopback, no rate limiting, credentials returned unmasked in config.get RPC.
- **Impact:** Full attack chain confirmed: malicious webpage → WebSocket to localhost → auth bypass → config.set → bash tool → RCE on host machine.
- **What We Learned:** Security fundamentals (CSRF, origin validation, auth defaults) must be in place from the start, not bolted on later. A single missing defense (CSRF) enabled a complete kill chain.
- **Prevention Measures:** Phase 1 fixes implemented across 5 PRs (#2-#6): WebSocket origin validation, credential masking, rate limiting, default auth=password, CSRF tokens on state-changing RPCs. All merged to main.
- **Related:** PRs #2, #3, #4, #5, #6. MITRE ref: PR-26-00176-1. Backlog items FB-001 through FB-005.

### 2026-02-15 - Voicewake tests failing on Windows (os.homedir() ignores HOME env)
- **Severity:** low
- **Category:** test
- **Description:** 3 gateway tests failed on Windows: voicewake.get, voicewake.changed, agent events stream. Tests passed on Linux/macOS CI.
- **Root Cause:** `os.homedir()` on Windows ignores `process.env.HOME`, always returns real user profile directory. Voicewake module's `defaultBaseDir()` used `os.homedir()`, so tests read/wrote real home dir instead of temp test dir.
- **Impact:** 3 test failures on Windows only. No production impact.
- **What We Learned:** `os.homedir()` behaves differently on Windows vs POSIX. Any module using it needs mocking in tests when HOME override is expected.
- **Prevention Measures:** Added `vi.mock("../infra/voicewake.js")` to server.test.ts that wraps loadVoiceWakeConfig and setVoiceWakeTriggers to use `process.env.HOME`. PR #7.
- **Related:** PR #7, commit 0467ff462
