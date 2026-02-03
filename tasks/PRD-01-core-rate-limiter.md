# PRD-01: Core Rate Limiter Middleware

**Status:** Not Started  
**Priority:** P0 — Foundation for all other rate limiting PRDs  
**Depends on:** Nothing  
**Blocks:** PRD-02, PRD-03, PRD-04

---

## Summary

Implement a lightweight, in-memory token-bucket rate limiter as a shared utility. This is the foundational building block used by all subsequent rate limiting work (HTTP endpoints, WebSocket throttling, auth brute-force protection, external API throttling).

## Findings Reference (RATE-LIMIT-REVIEW.md)

- **Section 2 — "What does NOT exist"**: No HTTP request rate limiting, no WebSocket message rate limiting, no per-IP connection limiting, no auth brute-force protection.
- **Section 4 — "In-Memory vs Redis"**: Single-process, single-server app. No Redis. In-memory `Map<string, { tokens, lastRefill }>` is sufficient (~30 lines).
- **Section 4 — "Library Choice"**: `express-rate-limit` only works for Express; Gateway uses raw `node:http`. Custom lightweight implementation recommended.
- **Section 5 — Step 1**: Token-bucket with auto-cleanup of stale entries.

## Design

### Token Bucket Algorithm

Each limiter instance tracks buckets keyed by a string (IP address, client ID, token hash, etc.):

```typescript
interface RateLimiterConfig {
  /** Maximum tokens (burst capacity) */
  maxTokens: number;
  /** Tokens refilled per interval */
  refillRate: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until a token is available (set when denied) */
  retryAfterMs?: number;
  /** Remaining tokens after this check */
  remaining: number;
}
```

### Feature Flag / Config Schema

Add a `rateLimits` section to the gateway config. Rate limiting is **enabled by default** with sensible defaults and can be toggled off.

```typescript
rateLimits?: {
  /** Master switch — default: true */
  enabled?: boolean;
  http?: {
    /** Global per-IP requests/min — default: 100 */
    globalPerMinute?: number;
    /** Agent-invoking endpoints per-IP req/min — default: 10 */
    agentPerMinute?: number;
    /** Hook endpoints per-token req/min — default: 20 */
    hookPerMinute?: number;
    /** Static/control-ui per-IP req/min — default: 200 */
    staticPerMinute?: number;
  };
  ws?: {
    /** Messages per client per minute — default: 60 */
    messagesPerMinute?: number;
    /** Agent invocations per client per minute — default: 10 */
    agentPerMinute?: number;
    /** Max concurrent WS connections — default: 50 */
    maxConnections?: number;
  };
  auth?: {
    /** Failed attempts before lockout — default: 10 */
    maxFailures?: number;
    /** Lockout window in minutes — default: 15 */
    windowMinutes?: number;
  };
};
```

### Stale Entry Cleanup

A GC sweep runs every 5 minutes, removing buckets that haven't been touched in 10+ minutes. This prevents unbounded memory growth from unique IPs.

## Files to Create

| File | Description |
|---|---|
| `src/infra/rate-limiter.ts` | Token bucket implementation, `RateLimiter` class |
| `src/infra/rate-limiter.test.ts` | Unit tests for the rate limiter |

## Files to Modify

| File | Change |
|---|---|
| `src/config/types.gateway.ts` | Add `RateLimitsConfig` type and `rateLimits?` field to `GatewayConfig` |
| `src/config/schema.ts` | Add config key descriptions for `rateLimits.*` (if schema descriptions exist here) |

## Implementation Steps

1. **Create `src/infra/rate-limiter.ts`**
   - Export `RateLimiter` class with constructor taking `RateLimiterConfig`
   - `check(key: string): RateLimitResult` — consume a token or deny
   - `reset(key: string): void` — clear a bucket (for use on successful auth)
   - `destroy(): void` — stop GC timer (for clean shutdown in tests)
   - Internal: `Map<string, { tokens: number; lastRefill: number; lastAccess: number }>`
   - GC interval: `setInterval` with `unref()` so it doesn't keep the process alive

2. **Create `src/config/types.gateway.ts` additions**
   - Add `RateLimitsConfig` type (nested: `http`, `ws`, `auth`)
   - Add `rateLimits?: RateLimitsConfig` to the existing gateway config type

3. **Add defaults resolver**
   - Helper function `resolveRateLimitsConfig(raw?: RateLimitsConfig): ResolvedRateLimitsConfig`
   - Fills in defaults for any unset values
   - Returns `{ enabled: false, ... }` when `enabled` is explicitly `false`

4. **Write comprehensive tests**

## Tests Required

### `src/infra/rate-limiter.test.ts`

```
describe("RateLimiter")
  ✓ allows requests within capacity
  ✓ denies requests when bucket is empty
  ✓ returns correct retryAfterMs when denied
  ✓ returns correct remaining count
  ✓ refills tokens after interval elapses
  ✓ does not exceed maxTokens on refill
  ✓ tracks separate buckets per key
  ✓ reset() clears a specific bucket
  ✓ GC removes stale entries (mock timers)
  ✓ GC does not remove active entries
  ✓ destroy() stops the GC timer
  ✓ handles rapid sequential calls correctly
  ✓ burst: allows maxTokens requests then denies
```

### Config type tests (if project has config validation tests)

```
  ✓ rateLimits config is optional (undefined → defaults)
  ✓ rateLimits.enabled: false disables all limiting
  ✓ partial config merges with defaults correctly
```

## Conventions to Follow

- **File naming**: kebab-case (`rate-limiter.ts`), matching existing `src/infra/` patterns (see `retry-policy.ts`, `backoff.ts`)
- **Exports**: Named exports only (no default exports — project convention)
- **Tests**: Co-located `.test.ts` files (project uses vitest, tests live next to source)
- **Types**: Use TypeScript strict mode; project uses `@sinclair/typebox` for schemas but plain TS types for internal config
- **No new dependencies**: Pure TypeScript implementation
- **Timer cleanup**: Use `timer.unref()` to avoid keeping the process alive

## Acceptance Criteria

- [ ] `RateLimiter` class created in `src/infra/rate-limiter.ts`
- [ ] Config types added to `src/config/types.gateway.ts`
- [ ] All unit tests pass: `pnpm test -- src/infra/rate-limiter.test.ts`
- [ ] `pnpm build` succeeds (TypeScript compiles without errors)
- [ ] `pnpm lint` passes with no new warnings
- [ ] No new dependencies added to `package.json`
- [ ] GC cleanup prevents memory leaks from stale entries
- [ ] `destroy()` method for clean test teardown
