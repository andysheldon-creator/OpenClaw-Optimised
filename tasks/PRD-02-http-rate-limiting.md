# PRD-02: HTTP Endpoint Rate Limiting

**Status:** Not Started  
**Priority:** P0 — Critical when internet-exposed  
**Depends on:** PRD-01 (Core Rate Limiter)  
**Blocks:** Nothing (can be done in parallel with PRD-03)

---

## Summary

Apply rate limiting to all HTTP endpoints on the Gateway server. This covers a global per-IP rate limit applied early in the request pipeline, plus stricter per-endpoint limits on expensive operations (agent invocation, chat completions, tool execution).

## Findings Reference (RATE-LIMIT-REVIEW.md)

### P0 — Critical (when internet-exposed)

- **`POST /hooks/agent`**: Each call dispatches a full AI agent run. Token auth exists but no rate cap. Attacker with leaked hook token can burn API credits.
- **`POST /v1/chat/completions`**: OpenAI-compatible endpoint. Each request triggers a full agent run. Auth required, but no rate limit after auth.
- **`POST /v1/responses`**: OpenResponses endpoint. Full agent run per request with 20MB body limit.
- **`POST /tools/invoke`**: Allows invoking any tool. Auth required, no rate limit.

### P1 — High

- **`POST /hooks/wake`**: Triggers heartbeat/wake cycles. Less expensive but still triggers processing.

### P2 — Medium

- **Control UI (static files)**: Serves static files, no caching headers or rate limits.
- **`POST /slack/*`**: Slack webhook events forwarded here.

### Existing patterns

- IP resolution already exists: `resolveGatewayClientIp()` in `src/gateway/net.ts`
- Body size limits already applied: `maxBodyBytes` on hooks (256KB), OpenAI (1MB), Responses (20MB)
- Auth checks already in place via `authorizeGatewayConnect()` in `src/gateway/auth.ts`

## Design

### Layer 1: Global HTTP Middleware

Applied at the top of `handleRequest()` in `server-http.ts`, before any route matching:

```
1. Extract client IP via resolveGatewayClientIp()
2. Check global rate limiter (default: 100 req/min per IP)
3. If exceeded → 429 with Retry-After header, return immediately
4. If rateLimits.enabled === false → skip entirely
```

### Layer 2: Per-Endpoint Limits

Applied within each handler, after auth but before processing:

| Endpoint | Default Limit | Key | Rationale |
|---|---|---|---|
| `POST /hooks/agent` | 10 req/min | hook token hash | Full agent run = expensive LLM call |
| `POST /hooks/wake` | 20 req/min | hook token hash | Triggers processing cycle |
| `POST /v1/chat/completions` | 10 req/min | client IP | Full agent run |
| `POST /v1/responses` | 10 req/min | client IP | Full agent run + file uploads |
| `POST /tools/invoke` | 20 req/min | client IP | Tool execution |
| `GET /control-ui/*` | 200 req/min | client IP | Static files, generous |
| `POST /slack/*` | 50 req/min | client IP | Slack has own retry logic |

### 429 Response Format

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 5
Content-Type: application/json

{"error": {"message": "Rate limit exceeded", "type": "rate_limit_error", "retry_after_ms": 5000}}
```

For OpenAI-compatible endpoints, match the OpenAI error format so clients handle it correctly.

## Files to Create

| File | Description |
|---|---|
| `src/gateway/http-rate-limit.ts` | Helper: creates rate limiter instances, shared `send429()` response helper |
| `src/gateway/http-rate-limit.test.ts` | Integration tests for HTTP rate limiting |

## Files to Modify

| File | Change |
|---|---|
| `src/gateway/server-http.ts` | Add global rate limit check at top of `handleRequest()`. Import rate limiter config. Create global limiter instance on server start. |
| `src/gateway/openai-http.ts` | Add per-endpoint rate limit check in `handleOpenAiHttpRequest()` after auth, before processing |
| `src/gateway/openresponses-http.ts` | Add per-endpoint rate limit check in `handleOpenResponsesHttpRequest()` after auth |
| `src/gateway/tools-invoke-http.ts` | Add per-endpoint rate limit check after auth |
| `src/gateway/hooks.ts` | Add per-hook-token rate limit check (or in `server-http.ts` hook handling section) |
| `src/gateway/http-common.ts` | Add `send429(res, retryAfterMs)` helper alongside existing `sendUnauthorized`, `sendMethodNotAllowed` |

## Implementation Steps

1. **Create `src/gateway/http-rate-limit.ts`**
   - Export factory: `createHttpRateLimiters(config: ResolvedRateLimitsConfig)` → returns object with named limiters (global, agent, hook, static)
   - Export `send429(res: ServerResponse, retryAfterMs: number, format?: "openai" | "default")` helper
   - Export `checkRateLimit(limiter: RateLimiter, key: string, res: ServerResponse, format?): boolean` — returns true if allowed, sends 429 and returns false if denied

2. **Add `send429` to `src/gateway/http-common.ts`**
   - Follow existing pattern of `sendUnauthorized()`, `sendMethodNotAllowed()`, `sendJson()`

3. **Integrate global limit in `src/gateway/server-http.ts`**
   - At server creation time, instantiate rate limiters from config
   - At the very top of `handleRequest()`, before route matching:
     ```typescript
     const clientIp = resolveGatewayClientIp(req, trustedProxies);
     if (!checkGlobalRateLimit(clientIp, res)) return;
     ```
   - Pass limiters through to route handlers or attach to server context

4. **Integrate per-endpoint limits**
   - `openai-http.ts`: After `authorizeGatewayConnect()` succeeds, check agent limiter
   - `openresponses-http.ts`: Same pattern
   - `tools-invoke-http.ts`: Same pattern  
   - `hooks.ts` / `server-http.ts` hook section: Check hook limiter keyed by token hash

5. **Wire config**
   - Read `rateLimits` from loaded config in server-http.ts
   - Pass resolved config to `createHttpRateLimiters()`
   - Skip all checks when `config.rateLimits.enabled === false`

6. **Write tests**

## Tests Required

### `src/gateway/http-rate-limit.test.ts`

```
describe("HTTP Rate Limiting")
  describe("Global rate limit")
    ✓ allows requests within global limit
    ✓ returns 429 when global limit exceeded
    ✓ includes Retry-After header in 429 response
    ✓ different IPs have independent limits
    ✓ limit resets after refill interval
    ✓ skipped entirely when rateLimits.enabled is false

  describe("Per-endpoint rate limits")
    ✓ /v1/chat/completions returns 429 after 10 req/min from same IP
    ✓ /v1/chat/completions 429 uses OpenAI error format
    ✓ /v1/responses returns 429 after limit exceeded
    ✓ /tools/invoke returns 429 after limit exceeded
    ✓ /hooks/agent returns 429 after 10 req/min per token
    ✓ /hooks/wake returns 429 after 20 req/min per token
    ✓ different hook tokens have independent limits

  describe("429 response format")
    ✓ includes retry_after_ms in JSON body
    ✓ sets Retry-After header in seconds (rounded up)
    ✓ Content-Type is application/json

  describe("Config integration")
    ✓ custom globalPerMinute value is respected
    ✓ custom agentPerMinute value is respected
    ✓ enabled: false bypasses all rate limit checks
```

### Modify existing tests (if they mock HTTP requests)

- `src/gateway/hooks.test.ts` — ensure existing tests still pass with rate limiting enabled
- `src/gateway/openai-http.ts` tests — if they exist, verify no regressions

## Conventions to Follow

- **HTTP helpers**: Follow existing `http-common.ts` patterns (`sendJson`, `sendUnauthorized`, etc.)
- **IP resolution**: Use existing `resolveGatewayClientIp()` from `net.ts` — do NOT re-implement
- **Config loading**: Follow existing `loadConfig()` pattern — rate limits config flows through the same path
- **Error response**: Match existing error shapes. For OpenAI-compat endpoints, use OpenAI's error format
- **No Express middleware**: The main server is raw `node:http`. Only `src/browser/server.ts` uses Express

## Acceptance Criteria

- [ ] Global per-IP rate limit applied to all HTTP requests
- [ ] Per-endpoint limits applied to `/hooks/agent`, `/hooks/wake`, `/v1/chat/completions`, `/v1/responses`, `/tools/invoke`
- [ ] 429 responses include `Retry-After` header and JSON body with `retry_after_ms`
- [ ] OpenAI-compat endpoints return OpenAI-formatted 429 errors
- [ ] Rate limiting is configurable via `rateLimits.http.*` config
- [ ] Rate limiting can be disabled via `rateLimits.enabled: false`
- [ ] All new and existing tests pass: `pnpm test`
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] No new dependencies
