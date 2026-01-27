# Clawdbot Security Hardening Plan - Phase 1

**Location:** This file lives in the security worktree at `~/clawdbot-security`
**Branch:** `phase1-security`
**Purpose:** Tracks progress on Phase 1 Security Hardening tasks. Other Claude Code sessions can pick up incomplete tasks.

---

## Worktree Setup

Git worktrees are set up for parallel development:

```bash
~/clawdbot-analysis/        # main branch (original clone)
~/clawdbot-security/        # phase1-security branch (THIS WORKTREE)
```

To create additional worktrees for other phases:
```bash
cd ~/clawdbot-analysis
git worktree add ../clawdbot-architecture -b phase2-architecture
git worktree add ../clawdbot-ux -b phase3-ux
```

---

## Phase 1 Task Status

### ✅ COMPLETED

#### 1.1 Prompt Injection Defense
- **Files Modified:**
  - `src/gateway/chat-sanitize.ts` - Added 300+ lines of injection detection
  - `src/gateway/chat-sanitize.test.ts` - 38 tests
- **Features:**
  - Regex-based jailbreak detection with tiered severity (critical/high/medium/low)
  - Prompt boundary markers (`[USER_INPUT_START]`/`[USER_INPUT_END]`)
  - Configurable blocking, logging, and warning features
  - Patterns: ignore instructions, DAN/jailbreak, system prompt extraction, role manipulation
- **Commit:** `77c93a8dc` "security: add prompt injection defense system"

#### 1.2 Command Execution Blocklist
- **Files Created/Modified:**
  - `src/infra/exec-blocklist.ts` - New blocklist module (~400 lines)
  - `src/infra/exec-blocklist.test.ts` - 47 tests
  - `src/infra/exec-approvals.ts` - Integrated blocklist check
  - `src/infra/exec-approvals.test.ts` - Updated for blocklist behavior
- **Features:**
  - Critical: rm -rf /, dd to disk, mkfs, halt/reboot, fork bombs (ALWAYS BLOCKED)
  - High: sudo, passwd, visudo, iptables, user management (BLOCKED, requires explicit approval)
  - Medium: command substitution, eval, curl POST (WARNED, allowed by default)
  - Blocklist is checked BEFORE allowlist evaluation
- **Commit:** `33eeb033c` "security: add command execution blocklist"

#### 1.3 Secrets Manager (Core + Integration)
- **Files Created/Modified:**
  - `src/infra/secrets-manager.ts` - Cross-platform secrets manager (~700 lines)
  - `src/infra/secrets-manager.test.ts` - 27 tests
  - `src/discord/token.ts` - Added secrets as Priority 1 source
  - `src/discord/token.test.ts` - Updated tests with `skipSecrets` option
  - `src/discord/accounts.ts` - Updated type to include "secrets" source
  - `src/telegram/token.ts` - Added secrets as Priority 1 source
  - `src/telegram/token.test.ts` - Updated tests with `skipSecrets` option
  - `src/telegram/accounts.ts` - Updated type to include "secrets" source
  - `src/slack/accounts.ts` - Added secrets as Priority 1 source with `skipSecrets` option
  - `src/web/auth-store.ts` - Added encrypted credentials support for WhatsApp
- **Features:**
  - macOS Keychain via `security` command
  - Linux Secret Service via `secret-tool` (libsecret)
  - Fallback to AES-256-GCM encrypted files with PBKDF2 key derivation
  - Machine-derived encryption key for file fallback
  - Utilities: generateSecureToken, hashSecret, verifySecretHash
  - File encryption utilities: encryptFile, decryptFile, readPossiblyEncryptedFile
  - WhatsApp creds.json now supports .enc encrypted format
  - Migration helper: migrateWebCredsToEncrypted() for WhatsApp
  - All token resolution functions now check secrets-manager first
- **Commits:**
  - `a6f48ac29` "security: add cross-platform secrets manager"
  - TBD "security: integrate secrets-manager with all token stores"
- **TODO:**
  - Add migration CLI command: `clawdbot secrets migrate`
  - Update `clawdbot doctor` to check for unencrypted credentials

#### 1.4 Gateway Authentication & Rate Limiting
- **Files Created/Modified:**
  - `src/gateway/rate-limit.ts` - New rate limiting module (~370 lines)
  - `src/gateway/rate-limit.test.ts` - 19 tests
  - `src/gateway/server-startup-log.ts` - Added security warnings
  - `src/gateway/server-startup-log.test.ts` - 9 tests
  - `src/gateway/server.impl.ts` - Integrated rate limiter and security warnings
  - `src/config/types.gateway.ts` - Added GatewayRateLimitConfig type
- **Features:**
  - Token bucket algorithm for smooth rate limiting with burst support
  - Per-client tracking (separate buckets per IP/session)
  - Configurable limits: unauthenticated (60/min), authenticated (unlimited by default)
  - Channel message rate limiting (200/min per channel)
  - Exponential backoff after auth failures (1s base, 60s max)
  - Security warning at startup if binding to non-loopback without auth
  - All settings configurable in `gateway.rateLimit` config
- **Commit:** TBD

---

### ⏳ PENDING

#### 1.5 Pairing & Approval Hardening
**Objective:** Increase entropy and add replay protection.

**Files to Modify:**
- `src/pairing/pairing-store.ts`
  - Increase pairing code from 8 chars (~40 bits) to 16 chars (~80 bits)
  - Add rate limiting on pairing attempts (1/sec max)
  - Sign pairing store with HMAC
- `src/infra/exec-approvals.ts`
  - Implement one-time-use nonces for approval tokens
  - Add nonce tracking to prevent replay attacks

**Current Pairing Code:**
- 8 chars, alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars = 5 bits each)
- Total entropy: ~40 bits (too low for security-sensitive use)

**Target:**
- 16 chars = ~80 bits entropy
- Add HMAC signature to pairing-store.json
- Rate limit: 1 attempt/second per IP/session

#### 1.6 Security Documentation
**Objective:** Create formal security documentation.

**Files to Create:**
- `docs/security/threat-model.md` - Cover channels, tools, browser, local files
- `docs/security/data-handling.md` - Retention, logs, consent, export/delete
- `docs/security/security-posture.md` - Public-facing security overview

**Files to Modify:**
- `src/commands/doctor.ts` - Add security audit checks
  - Detect unencrypted credentials
  - Check for public gateway binding without auth
  - Verify pairing code entropy

---

## How to Continue This Work

### For a New Claude Code Session:

1. **Navigate to the worktree:**
   ```bash
   cd ~/clawdbot-security
   ```

2. **Read this plan file:**
   ```bash
   cat CLAWDBOT-SECURITY-PLAN.md
   ```

3. **Check current branch and status:**
   ```bash
   git log --oneline -5
   git status
   ```

4. **Pick an IN PROGRESS or PENDING task and continue.**

5. **Follow commit conventions:**
   ```bash
   git commit -m "security: <description>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

### Parallel Work Guidelines:
- Each task modifies different files, so parallel work is safe
- If touching the same file, coordinate or work sequentially
- Run `npx vitest run <path>` after changes to verify tests pass

---

## Testing Commands

```bash
# Run specific test file
npx vitest run src/gateway/chat-sanitize.test.ts
npx vitest run src/infra/exec-blocklist.test.ts
npx vitest run src/infra/secrets-manager.test.ts

# Run all tests
pnpm test

# Type check
pnpm build
```

---

## Files Changed Summary

| Phase | File | Status | Lines Changed |
|-------|------|--------|---------------|
| 1.1 | src/gateway/chat-sanitize.ts | ✅ | +320 |
| 1.1 | src/gateway/chat-sanitize.test.ts | ✅ | +200 |
| 1.2 | src/infra/exec-blocklist.ts | ✅ | +450 |
| 1.2 | src/infra/exec-blocklist.test.ts | ✅ | +250 |
| 1.2 | src/infra/exec-approvals.ts | ✅ | +50 |
| 1.3 | src/infra/secrets-manager.ts | ✅ | +700 |
| 1.3 | src/infra/secrets-manager.test.ts | ✅ | +270 |
| 1.3 | src/discord/token.ts | ✅ | +25 |
| 1.3 | src/discord/token.test.ts | ✅ | +10 |
| 1.3 | src/discord/accounts.ts | ✅ | +5 |
| 1.3 | src/telegram/token.ts | ✅ | +30 |
| 1.3 | src/telegram/token.test.ts | ✅ | +10 |
| 1.3 | src/telegram/accounts.ts | ✅ | +5 |
| 1.3 | src/slack/accounts.ts | ✅ | +40 |
| 1.3 | src/web/auth-store.ts | ✅ | +120 |
| 1.4 | src/gateway/rate-limit.ts | ✅ | +370 |
| 1.4 | src/gateway/rate-limit.test.ts | ✅ | +310 |
| 1.4 | src/gateway/server-startup-log.ts | ✅ | +60 |
| 1.4 | src/gateway/server-startup-log.test.ts | ✅ | +170 |
| 1.4 | src/gateway/server.impl.ts | ✅ | +15 |
| 1.4 | src/config/types.gateway.ts | ✅ | +45 |
| 1.5 | src/pairing/pairing-store.ts | ⏳ | TBD |
| 1.6 | docs/security/*.md | ⏳ | TBD |

---

## Contact / Context

- **Original Plan:** `/Users/ronitchidara/Desktop/clawdbot-production-readiness-analysis.md`
- **Main Codebase:** `~/clawdbot-analysis`
- **Security Worktree:** `~/clawdbot-security` (this location)

---

*Last updated: 2026-01-27 by Claude Opus 4.5*
