# Partial Security Audit: Ingress / Entrypoints / Trust Boundaries

Date: 2026-02-02

Scope of this partial:

- Identify primary ingress points (webhooks/HTTP servers/channel listeners/CLI).
- For each ingress, document what untrusted inputs enter, and the apparent gating/auth.
- Mark UNKNOWN where auth/gating requires deeper reading.

This partial is evidence-based (file:line + short quotes).

---

## A) HTTP servers / webhooks

### A1) Telegram webhook server (public HTTP)

Entrypoint:

- `src/telegram/webhook.ts:19-127` starts an HTTP server and registers a Telegram webhook.

Evidence:

- Server binds to `host` (default `0.0.0.0`) and `port` (default `8787`):
  - `const host = opts.host ?? "0.0.0.0";` (`src/telegram/webhook.ts:36`)
  - `const port = opts.port ?? 8787;` (`src/telegram/webhook.ts:35`)
  - `await new Promise<void>((resolve) => server.listen(port, host, resolve));` (`src/telegram/webhook.ts:112`)
- Webhook requests are routed by path and method:
  - `if (req.url !== path || req.method !== "POST") { ... 404 ... }` (`src/telegram/webhook.ts:60-64`)
- Telegram secret token support is wired through grammy:
  - `const handler = webhookCallback(bot, "http", { secretToken: opts.secret })` (`src/telegram/webhook.ts:46-48`)
  - `bot.api.setWebhook(publicUrl, { secret_token: opts.secret, ... })` (`src/telegram/webhook.ts:106-109`)

Untrusted inputs:

- Entire Telegram Update payload (request body handled by grammy `webhookCallback`).

Gating/auth:

- LIKELY: Telegram secret token verification via grammy when `opts.secret` is set (`src/telegram/webhook.ts:46-48`).
- UNKNOWN: Behavior when `opts.secret` is omitted/empty; whether any further auth is applied by upstream infrastructure.

Risk notes:

- Binding to `0.0.0.0` exposes a public surface; security depends heavily on the Telegram secret token being set and on network-level controls.

### A2) Voice-call webhook server (public HTTP + optional WebSocket upgrades)

Entrypoint:

- `extensions/voice-call/src/webhook.ts:146-184` starts an HTTP server; `:159-171` adds WebSocket upgrades.

Evidence:

- Server binds and logs URL:
  - `this.server.listen(port, bind, () => { const url = \`http://${bind}:${port}${webhookPath}\`; ... })` (`extensions/voice-call/src/webhook.ts:175-182`)
- Webhook request parsing:
  - Path check: `if (!url.pathname.startsWith(webhookPath)) { 404 }` (`extensions/voice-call/src/webhook.ts:212-217`)
  - Method check: `if (req.method !== "POST") { 405 }` (`extensions/voice-call/src/webhook.ts:219-224`)
  - Body read then context creation includes remoteAddress and rawBody (`extensions/voice-call/src/webhook.ts:226-237`)
- Signature verification is delegated to the provider:
  - `const verification = this.provider.verifyWebhook(ctx);`
  - `if (!verification.ok) { ... 401 ... }` (`extensions/voice-call/src/webhook.ts:239-246`)
- WebSocket upgrades:
  - `this.server.on("upgrade", ...)` (`extensions/voice-call/src/webhook.ts:161`)
  - upgrades accepted only for `streamPath` else `socket.destroy()` (`extensions/voice-call/src/webhook.ts:164-169`)

Untrusted inputs:

- Provider webhook events; media stream WebSocket traffic (if enabled).
- Transcript contents are logged:
  - `console.log(\`[voice-call] Transcript for ${providerCallId}: ${transcript}\`);` (`extensions/voice-call/src/webhook.ts:72-74`)

Gating/auth:

- Provider signature verification is present, but specifics depend on provider implementations (not inspected here).

Risk notes:

- Potential privacy/logging issue: raw transcripts logged to stdout (`extensions/voice-call/src/webhook.ts:72-74`).
- WebSocket upgrade path is a network-exposed surface when streaming is enabled.

### A3) Browser control server (local-only HTTP; high-power capabilities)

Entrypoint:

- `src/browser/server.ts:15-68` starts a browser control Express server.

Evidence:

- Explicit loopback bind:
  - `const s = app.listen(port, "127.0.0.1", () => resolve(s));` (`src/browser/server.ts:36`)
  - Log: `Browser control listening on http://127.0.0.1:${port}/` (`src/browser/server.ts:66`)
- Many endpoints exist (profiles, start/stop/reset, act, download, cookies/storage, etc.).
  - Example: `/profiles/create` accepts body fields including `cdpUrl` (`src/browser/routes/basic.ts:124-146`).

Untrusted inputs:

- Any local process that can reach `127.0.0.1:${port}` can hit these endpoints.
- Several endpoints accept paths/URLs for browser automation flows (see earlier report + `src/browser/routes/agent.act.ts:420-476`).

Gating/auth:

- UNKNOWN: per-request auth; routes rely on `getProfileContext(req, ctx)` (`src/browser/routes/basic.ts:28-32`) which validates profile selection, but this is not authentication.
- This server being loopback-only is a major mitigation, but local attackers (malware/other users on same host) remain in scope under some threat models.

### A4) Gateway tool-invocation HTTP endpoint (`POST /tools/invoke`)

Entrypoint:

- `src/gateway/tools-invoke-http.ts:102-320` handles `POST /tools/invoke` and executes tools.

Evidence:

- Route match + method gate:
  - `if (url.pathname !== "/tools/invoke") return false;` (`src/gateway/tools-invoke-http.ts:108-110`)
  - `if (req.method !== "POST") { sendMethodNotAllowed(res, "POST"); }` (`src/gateway/tools-invoke-http.ts:112-115`)
- Authorization required:
  - `const token = getBearerToken(req);` (`src/gateway/tools-invoke-http.ts:118`)
  - `authorizeGatewayConnect(... connectAuth: token ? { token, password: token } : null ...)` (`src/gateway/tools-invoke-http.ts:119-124`)
  - `if (!authResult.ok) { sendUnauthorized(res); }` (`src/gateway/tools-invoke-http.ts:125-128`)
- After auth, tool list is built and filtered by multiple policy layers:
  - `const allTools = createOpenClawTools({ ... pluginToolAllowlist: collectExplicitAllowlist([...]) })` (`src/gateway/tools-invoke-http.ts:214-229`)
  - successive `filterToolsByPolicy` calls (`src/gateway/tools-invoke-http.ts:273-296`)
  - tool lookup: `const tool = subagentFiltered.find((t) => t.name === toolName);` (`src/gateway/tools-invoke-http.ts:298`)
- Tool execution:
  - `const result = await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);` (`src/gateway/tools-invoke-http.ts:313-314`)

Untrusted inputs:

- HTTP JSON body includes `tool`, `action`, `args`, `sessionKey`, `dryRun` (`src/gateway/tools-invoke-http.ts:37-43`).

Gating/auth:

- Stronger than many surfaces: bearer token authorization + tool policy filtering.

Risk notes:

- This endpoint is a “universal tool runner” after auth. The security model depends on:
  - correctness of `authorizeGatewayConnect` (`src/gateway/tools-invoke-http.ts:119-124`),
  - correctness of policy resolution/filtering,
  - correctness of each tool’s own internal validation.

---

## B) Channel listeners (message ingress)

### B1) Telegram bot listener (message handling + allowlist behavior)

Entrypoint:

- `src/telegram/bot-handlers.ts:477` handles `bot.on("message", ...)`.

Evidence of gating patterns (groups):

- GroupPolicy can disable or require allowlist:
  - `const groupPolicy = telegramCfg.groupPolicy ?? defaultGroupPolicy ?? "open";` (`src/telegram/bot-handlers.ts:537`)
  - `if (groupPolicy === "disabled") { ... return; }` (`src/telegram/bot-handlers.ts:538-541`)
  - `if (groupPolicy === "allowlist") { ... must be in allowFrom ... }` (`src/telegram/bot-handlers.ts:542-565`)
- Topic/group enabled flags:
  - `if (groupConfig?.enabled === false) return;` (`src/telegram/bot-handlers.ts:505-508`)
  - `if (topicConfig?.enabled === false) return;` (`src/telegram/bot-handlers.ts:509-514`)

Untrusted inputs:

- Telegram message bodies and metadata; forwarded into auto-reply pipeline downstream (not traced fully in this partial).

---

## C) Key UNKNOWNs for ingress that require follow-up

1. Browser control route auth: how `getProfileContext` prevents unauthorized control beyond profile selection.
   - Start points: `src/browser/routes/utils.ts` (not inspected here), plus `src/browser/server-context.ts` and `src/browser/pw-ai.ts` call paths.
2. Voice-call provider signature verification: depends on provider-specific code paths.
   - Start points: provider implementations under `extensions/voice-call/src/providers/*` and `extensions/voice-call/src/webhook-security.*`.
3. Telegram webhook secret requirements: behavior when `opts.secret` is omitted.
   - Start point: grammy `webhookCallback` behavior + config code that sets `opts.secret` (not inspected here).
