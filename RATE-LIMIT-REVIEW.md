# Rate Limiting Review — OpenClaw

**Date:** 2025-07-25  
**Reviewer:** Subagent (rate-limit analysis)  
**Scope:** Full codebase analysis for rate limiting gaps and recommendations

---

## 1. Project Overview

### What is OpenClaw?

OpenClaw is a **personal AI assistant** you self-host. It runs a Gateway (Node.js, TypeScript) that acts as a control plane connecting:
- **Messaging channels** (WhatsApp/Baileys, Telegram/grammY, Discord/discord.js, Slack/Bolt, Signal, iMessage, Microsoft Teams, Google Chat, Matrix, WebChat, etc.)
- **AI providers** (Anthropic Claude, OpenAI, etc.) via OAuth or API keys
- **Companion apps** (macOS, iOS, Android nodes)
- **Tools** (browser control via Playwright, canvas, cron, skills, exec)

### Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (Node ≥22) |
| HTTP server | Raw `node:http` (`createServer`) + Express (browser control only) |
| WebSocket | `ws` library |
| Build | `tsc` + `pnpm` |
| Channels | Baileys (WhatsApp), grammY (Telegram), discord.js, @slack/bolt, etc. |
| AI providers | @mariozechner/pi-ai, @mariozechner/pi-agent-core |
| TTS | ElevenLabs API, Edge TTS, OpenAI TTS |
| Browser | Playwright-core |

### Architecture

```
Messaging Channels (WhatsApp/Telegram/Discord/Slack/Signal/etc.)
        │
        ▼
┌─────────────────────────────┐
│       Gateway Server        │  ← Single Node.js process
│   HTTP + WebSocket (ws)     │
│   ws://127.0.0.1:18789      │
└──────────┬──────────────────┘
           │
           ├── HTTP routes: /hooks/*, /v1/chat/completions, /v1/responses, /tools/invoke, /slack/*, control-ui, canvas
           ├── WebSocket RPC: ~50+ methods (agent, send, chat, config, sessions, cron, etc.)
           ├── Browser control server (Express, separate port, localhost-only)
           └── Channel-specific transports (Baileys WS, grammY polling/webhook, etc.)
```

### Deployment Model

- **Single-server, single-process** — the Gateway is one Node.js process
- Default bind: **loopback** (`127.0.0.1`) — not internet-facing
- Optional exposure via **Tailscale Serve** (tailnet-only) or **Tailscale Funnel** (public internet)
- Can also be exposed via SSH tunnels or reverse proxies
- **No Redis, no external state store** — everything is in-memory or on-disk (SQLite for memory plugin)

---

## 2. Current State — Existing Rate Limiting / Throttling

### What exists today

| Area | Mechanism | File |
|---|---|---|
| **Telegram outbound** | `@grammyjs/transformer-throttler` — throttles outbound Telegram API calls to respect Telegram's rate limits | `src/telegram/bot.ts` |
| **Discord outbound** | Retry with exponential backoff on `RateLimitError` from `@buape/carbon` | `src/infra/retry-policy.ts` |
| **AI provider rate limits** | Profile-level cooldown/backoff when rate limited (429s) — exponential backoff with configurable billing backoff | `src/agents/auth-profiles/usage.ts`, `src/agents/pi-embedded-helpers/errors.ts`, `src/agents/model-fallback.ts` |
| **Agent concurrency** | Lane-based concurrency limits for cron, main agent, and subagent runs | `src/gateway/server-lanes.ts`, `src/process/command-queue.ts` |
| **Hook body size** | `maxBodyBytes` on hooks (default 256KB), OpenAI endpoint (1MB), Responses endpoint (20MB), tools-invoke (2MB) | `src/gateway/hooks.ts`, `src/gateway/openai-http.ts`, etc. |
| **Browser control body** | Express `json({ limit: "1mb" })` | `src/browser/server.ts` |

### What does NOT exist

- **No HTTP request rate limiting** on any endpoint (hooks, OpenAI-compat, Responses, tools-invoke, control-ui)
- **No WebSocket message rate limiting** (no per-client message throttle)
- **No per-IP connection limiting** on the HTTP or WebSocket server
- **No auth brute-force protection** (no lockout after N failed attempts)
- **No WebChat rate limiting** (WebChat clients connect via WebSocket with password auth)
- **No DM flood protection** on messaging channels (handled per-channel by allowlists, but no rate gate)

---

## 3. Vulnerability Analysis

Ranked by priority (P0 = critical, P3 = nice-to-have). Severity accounts for the fact that **most deployments are loopback-only** — the exposure surface expands significantly when Tailscale Funnel or a reverse proxy is used.

### P0 — Critical (when internet-exposed)

| Endpoint | Risk | Why |
|---|---|---|
| **`POST /hooks/agent`** | **Agent invocation flooding** | Each call dispatches a full AI agent run (expensive: LLM API calls, tool execution). An attacker with a leaked hook token can burn API credits rapidly. Token auth exists but no rate cap. |
| **`POST /v1/chat/completions`** | **AI credit burn** | OpenAI-compatible endpoint. Each request triggers a full agent run. Auth required (Bearer token), but no rate limit after auth. |
| **`POST /v1/responses`** | **AI credit burn** | OpenResponses endpoint. Same risk as above — full agent run per request with file upload support (20MB body limit). |
| **`POST /tools/invoke`** | **Arbitrary tool execution** | Allows invoking any tool the agent has access to. Auth required, but no rate limit. Could be abused for exec, browser control, etc. |

### P1 — High

| Endpoint | Risk | Why |
|---|---|---|
| **WebSocket `connect` + auth** | **Auth brute-force** | WS handshake includes token/password. No lockout or rate limit on failed auth attempts. Timing-safe compare exists but doesn't prevent enumeration attempts. |
| **WebSocket `agent` / `agent.wait` / `chat.send` methods** | **Agent flooding via WS** | Authenticated WS clients can spam agent runs with no throttle. |
| **`POST /hooks/wake`** | **Wake flooding** | Triggers heartbeat/wake cycles. Less expensive than agent, but still triggers processing. |
| **WebSocket connection flood** | **Resource exhaustion** | No max connections limit. Each WS connection consumes memory for message handlers, presence tracking, etc. |

### P2 — Medium

| Endpoint | Risk | Why |
|---|---|---|
| **Control UI (static files)** | **Bandwidth abuse** | Serves static files (HTML/JS/CSS). Low risk but no caching headers or rate limits. |
| **`POST /slack/*`** | **Slack event replay** | Slack webhook events are forwarded here. Slack has its own retry logic. |
| **TTS conversion (`tts.convert` WS method)** | **ElevenLabs credit burn** | Each call hits ElevenLabs API. No per-client rate limit. |
| **Browser control (Express, localhost)** | **Browser abuse** | Localhost-only, but any local process can hit it. Each request can launch browsers, navigate, screenshot. |

### P3 — Nice-to-Have

| Area | Risk |
|---|---|
| **Inbound messaging channel flood** | Users on allowlist could spam messages. Current protection is allowlist only. |
| **Cron job creation** | Authenticated users can create unlimited cron jobs. |
| **Session creation** | No limit on concurrent sessions. |

---

## 4. Recommended Approach

### In-Memory vs Redis

**Recommendation: In-memory rate limiting.**

Rationale:
- OpenClaw is a **single-process, single-server** application
- No Redis dependency exists in the project
- Adding Redis would be a significant operational burden for a personal assistant
- In-memory is sufficient since all requests go through one process
- If the process restarts, rate limit counters reset — acceptable for this use case

### Library Choice

**Recommendation: Custom lightweight in-memory rate limiter (token bucket or sliding window).**

Rationale:
- `express-rate-limit` only works for Express routes (browser server only)
- The main Gateway HTTP server uses raw `node:http`, not Express
- The WebSocket server needs rate limiting too
- A simple `Map<string, { tokens: number, lastRefill: number }>` token bucket is ~30 lines
- No new dependency needed

Alternative: Extract the rate limiter into a shared utility (`src/infra/rate-limiter.ts`) that works for both HTTP and WS.

### Middleware vs Per-Route

**Recommendation: Layered approach.**

1. **Global HTTP middleware** — applied in `createGatewayHttpServer` before any route handler
   - IP-based rate limit: 100 req/min per IP (generous, catches floods)
   - Applies to all HTTP routes
   
2. **Per-endpoint-group limits** — applied within specific handlers
   - Expensive endpoints (agent, chat completions, responses, tools-invoke): stricter limits
   - Hook endpoints: moderate limits
   - Static assets: generous limits
   
3. **WebSocket message rate limiting** — in `ws-connection/message-handler.ts`
   - Per-client message rate: 60 msg/min
   - Per-client agent invocations: 10/min
   
4. **Auth failure rate limiting** — in `auth.ts`
   - Per-IP: 10 failed auth attempts / 15 min, then 429 for 15 min

---

## 5. Implementation Plan

### Step 1: Create rate limiter utility

**New file: `src/infra/rate-limiter.ts`**

```typescript
// Token-bucket rate limiter
// - Keyed by string (IP, client ID, etc.)
// - Configurable: maxTokens, refillRate, refillIntervalMs
// - Auto-cleanup of stale entries (GC every 5 min)
// - Returns { allowed: boolean, retryAfterMs?: number }
```

### Step 2: HTTP rate limiting

**File: `src/gateway/server-http.ts`** — modify `createGatewayHttpServer`

Add at the top of `handleRequest()`:
```
1. Extract client IP (already have resolveGatewayClientIp in net.ts)
2. Check global rate limit (100 req/min per IP)
3. If exceeded, return 429 with Retry-After header
```

**Per-endpoint limits** (add checks inside each handler):

| Endpoint | Limit | Key |
|---|---|---|
| `POST /hooks/agent` | 10 req/min per token | hook token hash |
| `POST /hooks/wake` | 20 req/min per token | hook token hash |
| `POST /v1/chat/completions` | 10 req/min per IP | client IP |
| `POST /v1/responses` | 10 req/min per IP | client IP |
| `POST /tools/invoke` | 20 req/min per IP | client IP |
| Control UI static | 200 req/min per IP | client IP |

Files to modify:
- `src/gateway/server-http.ts` — global middleware
- `src/gateway/openai-http.ts` — per-endpoint
- `src/gateway/openresponses-http.ts` — per-endpoint
- `src/gateway/tools-invoke-http.ts` — per-endpoint

### Step 3: WebSocket rate limiting

**File: `src/gateway/server/ws-connection.ts`** — in the connection handler

- Track per-client message rate
- Add to `GatewayWsClient` type: `{ messageCount: number, windowStart: number }`
- In message handler: check 60 msg/min per client, close connection if exceeded

**File: `src/gateway/server/ws-connection/message-handler.ts`** — per-method limits

- `agent`, `agent.wait`, `chat.send`: 10/min per client
- `tts.convert`: 20/min per client

### Step 4: Auth brute-force protection

**File: `src/gateway/auth.ts`** — modify `authorizeGatewayConnect`

- Track failed auth attempts per IP (in-memory Map)
- After 10 failures in 15 min → reject with 429 for 15 min
- Reset on successful auth

**File: `src/gateway/server/ws-connection.ts`** — WS auth failures

- Same per-IP tracking for WebSocket handshake auth failures
- Close connection immediately on rate limit

### Step 5: Configuration

**File: `src/config/types.gateway.ts`** — add rate limit config

```typescript
rateLimits?: {
  enabled?: boolean; // default: true
  http?: {
    globalPerMinute?: number; // default: 100
    agentPerMinute?: number; // default: 10
    hookPerMinute?: number; // default: 20
  };
  ws?: {
    messagesPerMinute?: number; // default: 60
    agentPerMinute?: number; // default: 10
  };
  auth?: {
    maxFailures?: number; // default: 10
    windowMinutes?: number; // default: 15
  };
};
```

### Files to modify (summary)

| File | Change |
|---|---|
| `src/infra/rate-limiter.ts` | **NEW** — token bucket implementation |
| `src/gateway/server-http.ts` | Add global HTTP rate limiting in `handleRequest()` |
| `src/gateway/openai-http.ts` | Add per-endpoint rate limit check after auth |
| `src/gateway/openresponses-http.ts` | Add per-endpoint rate limit check after auth |
| `src/gateway/tools-invoke-http.ts` | Add per-endpoint rate limit check after auth |
| `src/gateway/hooks.ts` or `server-http.ts` | Add per-hook rate limit |
| `src/gateway/auth.ts` | Add auth failure tracking |
| `src/gateway/server/ws-connection.ts` | Add per-client WS rate limiting |
| `src/gateway/server/ws-connection/message-handler.ts` | Add per-method WS rate limiting |
| `src/config/types.gateway.ts` | Add `rateLimits` config type |
| `src/config/schema.ts` | Add descriptions for rate limit config keys |

---

## 6. External API Rate Limits — Client-Side Throttling

### Already handled ✅

| External API | Mechanism | Status |
|---|---|---|
| **Telegram Bot API** | `@grammyjs/transformer-throttler` auto-throttles outbound calls | ✅ Good |
| **Discord API** | Retry with backoff on `RateLimitError` | ✅ Good |
| **AI Providers (Anthropic/OpenAI/etc.)** | Profile cooldown with exponential backoff on 429s; automatic failover to next auth profile | ✅ Good |

### Needs attention ⚠️

| External API | Current State | Recommendation |
|---|---|---|
| **ElevenLabs TTS** | No client-side rate limiting. Each `tts.convert` call directly hits the ElevenLabs API. | Add a token-bucket limiter in `src/tts/tts.ts` — suggest 10 req/min default, configurable |
| **Brave Search** (if used via skills) | No built-in throttle | Skills are user-managed; document best practices |
| **Gmail Pub/Sub** | Webhook-driven, Google controls the rate | ✅ OK (Google handles backoff) |
| **WhatsApp (Baileys)** | Baileys has internal queuing but no explicit rate limit for outbound messages | Low risk for personal use, but could add a per-chat send throttle if needed |
| **Slack Web API** | `@slack/web-api` has built-in retry for rate limits | ✅ OK |

### No action needed

- **Playwright/Browser**: localhost-only, single browser instance, inherently serial
- **Signal-cli**: process-based, inherently serial
- **iMessage**: macOS API, no HTTP rate limits

---

## Summary

OpenClaw currently has **no HTTP or WebSocket rate limiting** on the Gateway. The main risk is when the Gateway is exposed to the internet (via Tailscale Funnel or reverse proxy), where unauthenticated or authenticated attackers could:

1. **Burn AI API credits** by flooding agent endpoints
2. **Brute-force auth** on WebSocket connections
3. **Exhaust server resources** via connection floods

The recommended approach is a **lightweight in-memory token-bucket rate limiter** (no new dependencies) applied at three layers:
1. Global HTTP rate limit per IP
2. Per-endpoint limits for expensive operations
3. Per-client WebSocket message rate limiting + auth failure protection

This is straightforward to implement (~200-300 lines of new code across ~10 files) and the configuration should be opt-out (enabled by default with sensible defaults).
