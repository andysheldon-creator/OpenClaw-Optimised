# CLAUDE.md — OpenClaw-Optimised

## Project Overview

Optimised fork of the OpenClaw AI agent platform. Multi-platform (Node.js, Bun, macOS, iOS, Android) with gateway server, chat interfaces (Discord, Telegram, WhatsApp, Signal, Slack), browser control, voice, and skill system.

This fork applies security hardening (MITRE ATLAS Phase 1 complete), performance optimizations (RAG, hybrid LLM routing, tiered memory), and DevSecOps practices.

## Tech Stack

- **Language:** TypeScript (ES modules, `"type": "module"`)
- **Runtime:** Node.js ≥22.12.0, Bun (secondary)
- **Package manager:** pnpm 10.23.0 (pinned via `packageManager` field)
- **Testing:** Vitest 4.0 (unit + E2E), coverage thresholds at 70%
- **Linting:** Biome + oxlint (NOT ESLint)
- **Build:** `pnpm build` (rolldown), type check: `npx tsc --noEmit`
- **CI/CD:** GitHub Actions (ci.yml for build, security.yml for SAST/SCA)
- **Platforms:** macOS (Swift/Xcode), iOS (disabled in CI), Android (Gradle)

## Important Technical Notes

### CRLF Line Endings in server.ts
`src/gateway/server.ts` uses CRLF (`\r\n`) line endings. String replacements with `\n` patterns will silently fail. Use line-based approaches (`content.split('\r\n')`) or hex Buffer manipulation for edits.

### Schema Validation
The gateway uses Typebox schemas with `additionalProperties: false`. Extra fields in RPC params cause validation errors. The CSRF `_csrf` field is stripped before dispatch.

### os.homedir() on Windows
Does NOT respect `process.env.HOME`. Any test relying on HOME override needs mocking. See the voicewake mock pattern in `server.test.ts`.

## Key Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm lint` | Biome + oxlint |
| `pnpm test` | Vitest unit tests |
| `pnpm test:coverage` | Tests with coverage report |
| `pnpm build` | Build project |
| `npx tsc --noEmit` | Type check only |
| `npx vitest run src/gateway/server.test.ts` | Gateway tests (78 tests) |

## Security Status

**MITRE ATLAS Phase 1: COMPLETE** (5 critical fixes, PRs #2-#6)
- WebSocket Origin validation (CVE-2026-25253)
- Credential masking in config.get (AML.CS0048)
- Rate limiting on gateway auth (AML.CS0048)
- Default auth=password (all incidents)
- CSRF token for state-changing RPC (CVE-2026-25253)

**Phase 2: NOT STARTED** — see `docs/BACKLOG.md` for pending items.

## DevSecOps Pipeline

**Every push:** `ci.yml` runs lint → test → build (Node + Bun matrix) + security.yml runs SAST (Semgrep + pnpm audit)

**Weekly (Monday 6am UTC):** Full SAST with OWASP Top 10 + CWE Top 25 rulesets

## Key Files

| File | Purpose |
|------|---------|
| `src/gateway/server.ts` | Main gateway server (~250KB, CRLF) |
| `src/gateway/auth.ts` | Authentication + origin validation |
| `src/gateway/rate-limit.ts` | Token bucket rate limiter |
| `src/gateway/config-mask.ts` | Credential masking utility |
| `src/gateway/protocol/schema.ts` | RPC schemas (includes CSRF) |
| `src/gateway/server.test.ts` | Gateway tests (78 tests) |
| `docs/BACKLOG.md` | Feature backlog with Phase 2 items |
| `docs/FAILURES.md` | Post-mortem failure log |
| `docs/METRICS.md` | Development metrics dashboard |

## Code Quality Rules (MUST follow before any commit)

When writing or modifying code in this repository, you MUST complete ALL of the following steps before creating a commit:

1. **Lint**: Run `npx biome check --apply .` — fix all violations
2. **Type check**: Run `npx tsc --noEmit` — zero errors allowed
3. **Unit tests**: Run `npx vitest run` — all tests must pass
4. **Security scan**: Run `npx semgrep --config p/javascript --config p/typescript .` if semgrep is available
5. **No secrets**: NEVER commit API keys, tokens, passwords, or credentials (check `.env`, `credentials.json`, etc.)
6. **Focused changes**: One concern per commit — keep changes atomic and reviewable
7. **Test new code**: Write unit tests for any new functions or significant logic changes

If any check fails, fix the issue and re-run ALL checks before committing. Do not skip steps or commit with known failures.

## Git Workflow

- Branch naming: `fix/`, `feature/`, `docs/` prefixes
- Every fix on its own feature branch off `main`
- Squash merge via PR
- Commit messages: Use conventional commits (`fix:`, `feat:`, `docs:`, `refactor:`, `test:`)
- All commits end with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
