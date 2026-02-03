# PRD-04: External API Throttling (ElevenLabs TTS) & Rate Limit Monitoring/Logging

**Status:** Not Started  
**Priority:** P2 — Medium  
**Depends on:** PRD-01 (Core Rate Limiter)  
**Blocks:** Nothing

---

## Summary

Close the ElevenLabs TTS client-side throttling gap (the one external API without rate protection), and add structured logging + monitoring for all rate limiting events across the system. This provides visibility into rate limit enforcement and helps operators tune limits.

## Findings Reference (RATE-LIMIT-REVIEW.md)

### Section 6 — External API Rate Limits

- **ElevenLabs TTS — ⚠️ Needs Attention**: "No client-side rate limiting. Each `tts.convert` call directly hits the ElevenLabs API." Recommendation: token-bucket limiter, 10 req/min default.
- **Already handled ✅**: Telegram (`@grammyjs/transformer-throttler`), Discord (retry + backoff), AI Providers (profile cooldown + exponential backoff + failover).
- **Slack Web API**: Built-in retry. ✅
- **Gmail Pub/Sub**: Google controls rate. ✅

### Monitoring gap

- No structured logging exists for rate limit events
- No visibility into which IPs/clients are being rate limited
- No metrics for tuning rate limit values

## Design

### Part 1: ElevenLabs TTS Throttling

Add a token-bucket rate limiter in the TTS module to cap outbound ElevenLabs API calls:

- Default: 10 requests/min (ElevenLabs starter tier allows ~10 concurrent)
- Configurable via `rateLimits.external.ttsPerMinute`
- When exceeded: queue or reject with a user-friendly error ("TTS rate limit — try again in Xs")
- Applied in `src/tts/tts.ts` before the actual ElevenLabs API call

### Part 2: Rate Limit Event Logging

Structured log entries for all rate limiting events using the project's existing `tslog` logger:

```typescript
// On rate limit deny
logger.warn("rate-limit-denied", {
  layer: "http" | "ws" | "auth" | "external",
  endpoint: "/v1/chat/completions",
  key: "192.168.1.100",  // IP or client ID (don't log full tokens)
  remaining: 0,
  retryAfterMs: 5000,
  limiterName: "agent-per-ip",
});

// On auth lockout
logger.warn("auth-lockout", {
  ip: "192.168.1.100",
  failures: 10,
  windowMinutes: 15,
});

// Periodic summary (every 5 min if any denials occurred)
logger.info("rate-limit-summary", {
  period: "5m",
  denials: { http: 12, ws: 3, auth: 1, external: 0 },
  topKeys: [{ key: "192.168.1.100", denials: 10 }],
});
```

### Part 3: Rate Limit Stats API (WS method)

Expose a `rateLimits.stats` WS method for the control UI:

```typescript
// Response
{
  enabled: true,
  denials: {
    http: { total: 45, last5m: 3 },
    ws: { total: 12, last5m: 0 },
    auth: { total: 2, last5m: 0 },
    external: { total: 0, last5m: 0 },
  },
  config: { /* resolved config snapshot */ }
}
```

## Files to Create

| File | Description |
|---|---|
| `src/infra/rate-limit-logger.ts` | Structured logging helpers for rate limit events |
| `src/infra/rate-limit-logger.test.ts` | Tests for logging helpers |

## Files to Modify

| File | Change |
|---|---|
| `src/tts/tts.ts` | Add rate limiter before ElevenLabs API calls. When limit exceeded, return error or queue. |
| `src/config/types.gateway.ts` | Add `external?: { ttsPerMinute?: number }` to `RateLimitsConfig` |
| `src/gateway/server-http.ts` | Add logging calls on rate limit denials (uses helpers from PRD-02) |
| `src/gateway/server/ws-connection/message-handler.ts` | Add logging calls on WS rate limit denials (uses helpers from PRD-03) |
| `src/gateway/auth.ts` | Add logging on auth lockout events |

## Implementation Steps

1. **Add ElevenLabs throttling in `src/tts/tts.ts`**
   - Import `RateLimiter` from `src/infra/rate-limiter.ts`
   - Create module-level limiter: `new RateLimiter({ maxTokens: 10, refillRate: 10, refillIntervalMs: 60_000 })`
   - Before ElevenLabs API call: `check("elevenlabs")`
   - If denied: throw or return error with `retryAfterMs`
   - Read config from `rateLimits.external.ttsPerMinute` if available

2. **Create `src/infra/rate-limit-logger.ts`**
   - `logRateLimitDenied(logger, { layer, endpoint, key, remaining, retryAfterMs, limiterName })`
   - `logAuthLockout(logger, { ip, failures, windowMinutes })`
   - `RateLimitStats` class: tracks denial counts per layer, computes 5-min rolling window
   - `getSummary(): RateLimitSummary` for periodic logging and stats API

3. **Integrate logging into HTTP rate limiting (PRD-02 files)**
   - In `server-http.ts` global rate limit: call `logRateLimitDenied()` on 429
   - In per-endpoint handlers: call `logRateLimitDenied()` with endpoint name

4. **Integrate logging into WS rate limiting (PRD-03 files)**
   - In `message-handler.ts`: call `logRateLimitDenied()` on WS rate limit
   - In `auth.ts`: call `logAuthLockout()` on lockout

5. **Add periodic summary logging**
   - Every 5 minutes (piggybacking on existing GC timer or separate), log a summary if any denials occurred
   - Use `logger.info()` level — not warn (summary is informational)

6. **Wire `rateLimits.stats` WS method** (optional, lower priority)
   - Register in WS method handler
   - Return current stats from `RateLimitStats` instance
   - Requires auth (control-level access)

7. **Write tests**

## Tests Required

### `src/infra/rate-limit-logger.test.ts`

```
describe("RateLimitLogger")
  ✓ logRateLimitDenied calls logger.warn with correct structure
  ✓ logAuthLockout calls logger.warn with correct structure
  ✓ does not log sensitive data (full tokens, passwords)
  ✓ key field is truncated/masked for privacy

describe("RateLimitStats")
  ✓ tracks denial counts per layer
  ✓ getSummary returns correct totals
  ✓ rolling 5-min window excludes old events
  ✓ topKeys returns top offenders sorted by count
  ✓ reset clears all stats
```

### TTS throttling tests (in existing or new TTS test file)

```
describe("TTS ElevenLabs throttling")
  ✓ allows TTS calls within rate limit
  ✓ rejects TTS calls when rate limit exceeded
  ✓ returns retryAfterMs on rejection
  ✓ rate limit resets after refill interval
  ✓ config ttsPerMinute overrides default
  ✓ skipped when rateLimits.enabled is false
```

## Conventions to Follow

- **Logging**: Use existing `tslog` logger from `src/logging/` — follow existing subsystem logger patterns (`createSubsystemLogger`)
- **Privacy**: Never log full tokens, passwords, or Bearer values. Mask IPs in logs if needed (or log full IP — check project's existing logging practices)
- **TTS module**: Check existing error handling patterns in `src/tts/tts.ts` — follow the same error propagation style
- **Config extension**: Add to existing `RateLimitsConfig` type from PRD-01 — don't create separate config
- **WS methods**: If adding `rateLimits.stats`, follow existing WS method registration pattern

## Acceptance Criteria

- [ ] ElevenLabs TTS calls rate limited to configurable req/min (default: 10)
- [ ] TTS rate limit returns user-friendly error with retry timing
- [ ] All rate limit denials logged with structured data (layer, endpoint, key)
- [ ] Auth lockouts logged with IP and failure count
- [ ] No sensitive data in logs (tokens, passwords)
- [ ] `RateLimitStats` tracks denial counts per layer
- [ ] Periodic summary logged every 5 min when denials occurred
- [ ] `rateLimits.external.ttsPerMinute` config respected
- [ ] All tests pass: `pnpm test`
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] No new dependencies
