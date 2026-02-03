# PRD-03: WebSocket Rate Limiting & Auth Brute-Force Protection

**Status:** Not Started  
**Priority:** P1 — High  
**Depends on:** PRD-01 (Core Rate Limiter)  
**Blocks:** Nothing

---

## Summary

Add rate limiting to the WebSocket control plane: per-client message throttling, connection limits, per-method rate limits for expensive operations (agent invocations, TTS), and auth brute-force protection with per-IP lockout.

## Findings Reference (RATE-LIMIT-REVIEW.md)

### P1 — High

- **WebSocket `connect` + auth**: WS handshake includes token/password. No lockout or rate limit on failed auth attempts. Timing-safe compare exists but doesn't prevent enumeration attempts.
- **WebSocket `agent` / `agent.wait` / `chat.send` methods**: Authenticated WS clients can spam agent runs with no throttle.
- **WebSocket connection flood**: No max connections limit. Each WS connection consumes memory for message handlers, presence tracking, etc.

### P2 — Medium

- **TTS conversion (`tts.convert` WS method)**: Each call hits ElevenLabs API. No per-client rate limit.

### Existing patterns

- WebSocket server uses `ws` library
- Connection handling in `src/gateway/server/ws-connection.ts`
- Message handling in `src/gateway/server/ws-connection/message-handler.ts`
- Auth via `authorizeGatewayConnect()` in `src/gateway/auth.ts` — already uses `timingSafeEqual`
- Client type: `GatewayWsClient` in `src/gateway/server/ws-types.ts`

## Design

### 1. Connection Limiting

Applied during WebSocket upgrade in `ws-connection.ts`:
- Track active connection count
- Reject new connections with 429 when `maxConnections` (default: 50) is reached
- Per-IP connection limit: max 5 concurrent connections from same IP

### 2. Auth Brute-Force Protection

Applied in `src/gateway/auth.ts`:
- Track failed auth attempts per IP: `Map<string, { failures: number; windowStart: number }>`
- After `maxFailures` (default: 10) in `windowMinutes` (default: 15) → reject immediately with 429
- Reset failure count on successful auth
- Works for both HTTP auth and WS handshake auth

### 3. Per-Client Message Throttling

Applied in the WS message handler:
- Track messages per client per window: extend `GatewayWsClient` with rate limit state
- Default: 60 messages/min per client
- When exceeded: send error message over WS, then close connection if continued

### 4. Per-Method Rate Limits

Applied in the message handler for specific expensive methods:
- `agent`, `agent.wait`, `chat.send`: 10/min per client (each triggers a full LLM run)
- `tts.convert`: 20/min per client (each hits ElevenLabs API)
- When exceeded: send JSON error response on the WS with `{ error: "rate_limit", method, retryAfterMs }`

## Files to Create

| File | Description |
|---|---|
| `src/gateway/ws-rate-limit.ts` | WS-specific rate limit helpers, auth failure tracker |
| `src/gateway/ws-rate-limit.test.ts` | Tests for WS rate limiting |
| `src/gateway/auth-rate-limit.ts` | Auth brute-force tracker (shared between HTTP and WS auth) |
| `src/gateway/auth-rate-limit.test.ts` | Tests for auth brute-force protection |

## Files to Modify

| File | Change |
|---|---|
| `src/gateway/auth.ts` | Integrate auth failure tracking: check before auth, record failures, reset on success |
| `src/gateway/server/ws-connection.ts` | Add connection count limit, per-IP connection limit, wire message rate limiting |
| `src/gateway/server/ws-connection/message-handler.ts` | Add per-method rate limit checks before dispatching expensive methods |
| `src/gateway/server/ws-types.ts` | Extend `GatewayWsClient` type with rate limit tracking fields |

## Implementation Steps

1. **Create `src/gateway/auth-rate-limit.ts`**
   - `AuthRateLimiter` class using `RateLimiter` from PRD-01
   - `checkAuthAllowed(ip: string): { allowed: boolean; retryAfterMs?: number }`
   - `recordFailure(ip: string): void`
   - `recordSuccess(ip: string): void` — resets the failure count
   - Configurable via `rateLimits.auth` settings

2. **Integrate auth protection in `src/gateway/auth.ts`**
   - Accept `AuthRateLimiter` as parameter to `authorizeGatewayConnect()`
   - Before checking credentials: `if (!authLimiter.checkAuthAllowed(ip).allowed)` → return failure
   - After auth result: call `recordFailure()` or `recordSuccess()`
   - The limiter instance is created at server startup and shared

3. **Add connection limiting in `src/gateway/server/ws-connection.ts`**
   - Track active connections in a counter (increment on connect, decrement on close)
   - Track per-IP connections: `Map<string, number>`
   - On upgrade: check total < maxConnections AND per-IP < 5, otherwise reject

4. **Extend `GatewayWsClient` in `src/gateway/server/ws-types.ts`**
   - Add optional `rateLimit?: { messageCount: number; windowStart: number }`
   - Populated lazily on first message

5. **Add message throttling in `message-handler.ts`**
   - At the top of message handling, before method dispatch:
     ```typescript
     if (!checkWsMessageRate(client)) {
       ws.send(JSON.stringify({ error: "rate_limit", message: "Too many messages" }));
       return;
     }
     ```
   - For specific methods (`agent`, `agent.wait`, `chat.send`, `tts.convert`):
     ```typescript
     if (!checkWsMethodRate(client, method)) {
       ws.send(JSON.stringify({ error: "rate_limit", method, retryAfterMs }));
       return;
     }
     ```

6. **Wire config**
   - Read `rateLimits.ws` and `rateLimits.auth` from config
   - Pass to connection handler and message handler
   - Skip when `rateLimits.enabled === false`

7. **Write tests**

## Tests Required

### `src/gateway/auth-rate-limit.test.ts`

```
describe("AuthRateLimiter")
  ✓ allows auth attempts within limit
  ✓ blocks auth after maxFailures exceeded
  ✓ returns retryAfterMs when blocked
  ✓ resets failure count on successful auth
  ✓ separate tracking per IP
  ✓ failures expire after windowMinutes
  ✓ does not block when rateLimits.enabled is false
```

### `src/gateway/ws-rate-limit.test.ts`

```
describe("WS Rate Limiting")
  describe("Connection limits")
    ✓ allows connections within maxConnections limit
    ✓ rejects connections when maxConnections reached
    ✓ allows new connection after a previous one closes
    ✓ limits per-IP concurrent connections to 5
    ✓ different IPs have independent connection counts

  describe("Message throttling")
    ✓ allows messages within per-client limit
    ✓ sends rate_limit error when exceeded
    ✓ window resets after interval
    ✓ separate tracking per client

  describe("Per-method limits")
    ✓ agent method limited to 10/min per client
    ✓ chat.send method limited to 10/min per client
    ✓ tts.convert method limited to 20/min per client
    ✓ non-limited methods unaffected
    ✓ error response includes method name and retryAfterMs

  describe("Config integration")
    ✓ custom messagesPerMinute respected
    ✓ custom agentPerMinute respected
    ✓ custom maxConnections respected
    ✓ enabled: false bypasses all WS rate limiting
```

### Existing test modifications

- `src/gateway/auth.test.ts` — add test cases verifying auth rate limiting integration
- `src/gateway/client.test.ts` — ensure existing WS client tests pass with rate limiting active

## Conventions to Follow

- **WS error format**: Use JSON `{ error: string, method?: string, retryAfterMs?: number }` — check existing WS error patterns in the codebase
- **Connection close**: When closing due to rate limiting, use appropriate WS close code (1008 = Policy Violation)
- **Client state**: Extend `GatewayWsClient` type minimally — add optional fields, don't break existing consumers
- **Auth function signature**: `authorizeGatewayConnect` is called from multiple places — keep changes backward-compatible (optional limiter param)
- **Cleanup**: Decrement counters on `ws.on("close")` — prevent counter drift

## Acceptance Criteria

- [ ] Auth brute-force protection: 10 failures in 15 min triggers lockout
- [ ] Lockout cleared on successful auth
- [ ] WebSocket connections capped at configurable maximum (default: 50)
- [ ] Per-IP connection limit enforced (default: 5)
- [ ] Per-client message rate limited (default: 60/min)
- [ ] Agent-invoking WS methods rate limited (default: 10/min per client)
- [ ] TTS method rate limited (default: 20/min per client)
- [ ] Rate limit errors sent as JSON over WS before close
- [ ] WS close code 1008 used for rate limit disconnections
- [ ] All configurable via `rateLimits.ws.*` and `rateLimits.auth.*`
- [ ] Disabled when `rateLimits.enabled: false`
- [ ] All tests pass: `pnpm test`
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] No new dependencies
