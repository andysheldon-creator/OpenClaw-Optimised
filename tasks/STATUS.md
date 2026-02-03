# Rate Limiting Implementation — Status Tracker

**Created:** 2025-07-25  
**Source:** [RATE-LIMIT-REVIEW.md](../RATE-LIMIT-REVIEW.md)  
**Total estimated new code:** ~300-400 lines across ~12 files

---

## PRD Overview

| PRD | Title | Priority | Status | Depends On |
|---|---|---|---|---|
| [PRD-01](PRD-01-core-rate-limiter.md) | Core Rate Limiter Middleware | P0 | ✅ Done | — |
| [PRD-02](PRD-02-http-rate-limiting.md) | HTTP Endpoint Rate Limiting | P0 | ✅ Done | PRD-01 |
| [PRD-03](PRD-03-websocket-rate-limiting.md) | WebSocket Rate Limiting & Auth Brute-Force | P1 | ✅ Done | PRD-01 |
| [PRD-04](PRD-04-external-api-throttling-monitoring.md) | External API Throttling & Monitoring | P2 | ✅ Done | PRD-01 |

## Implementation Order

```
PRD-01 (Core Rate Limiter)
   │
   ├──→ PRD-02 (HTTP Rate Limiting)     ← can run in parallel
   ├──→ PRD-03 (WS Rate Limiting)       ← can run in parallel
   └──→ PRD-04 (External API + Logging) ← can run in parallel, or last
```

**PRD-01 must be completed first.** PRDs 02, 03, and 04 can be implemented in parallel after that, or sequentially in priority order.

## Key Files Touched

### New Files
- `src/infra/rate-limiter.ts` — Token bucket implementation (PRD-01)
- `src/infra/rate-limiter.test.ts` — Core limiter tests (PRD-01)
- `src/gateway/http-rate-limit.ts` — HTTP rate limit helpers (PRD-02)
- `src/gateway/http-rate-limit.test.ts` — HTTP rate limit tests (PRD-02)
- `src/gateway/ws-rate-limit.ts` — WS rate limit helpers (PRD-03)
- `src/gateway/ws-rate-limit.test.ts` — WS rate limit tests (PRD-03)
- `src/gateway/auth-rate-limit.ts` — Auth brute-force tracker (PRD-03)
- `src/gateway/auth-rate-limit.test.ts` — Auth brute-force tests (PRD-03)
- `src/infra/rate-limit-logger.ts` — Logging helpers (PRD-04)
- `src/infra/rate-limit-logger.test.ts` — Logging tests (PRD-04)

### Modified Files
- `src/config/types.gateway.ts` — Config types (PRD-01)
- `src/gateway/server-http.ts` — Global HTTP rate limit (PRD-02)
- `src/gateway/openai-http.ts` — Per-endpoint limit (PRD-02)
- `src/gateway/openresponses-http.ts` — Per-endpoint limit (PRD-02)
- `src/gateway/tools-invoke-http.ts` — Per-endpoint limit (PRD-02)
- `src/gateway/hooks.ts` — Hook rate limit (PRD-02)
- `src/gateway/http-common.ts` — `send429()` helper (PRD-02)
- `src/gateway/auth.ts` — Auth failure tracking (PRD-03)
- `src/gateway/server/ws-connection.ts` — Connection limits (PRD-03)
- `src/gateway/server/ws-connection/message-handler.ts` — Message throttling (PRD-03)
- `src/gateway/server/ws-types.ts` — Client type extension (PRD-03)
- `src/tts/tts.ts` — ElevenLabs throttling (PRD-04)

## Validation Checklist (per PRD)

- [ ] `pnpm build` — TypeScript compiles
- [ ] `pnpm lint` — No new lint warnings
- [ ] `pnpm test` — All tests pass
- [ ] No new dependencies in `package.json`
- [ ] Config is backward-compatible (all new fields optional with defaults)
- [ ] Rate limiting enabled by default, disableable via `rateLimits.enabled: false`

## Status Legend

- ⬜ Not Started
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked
