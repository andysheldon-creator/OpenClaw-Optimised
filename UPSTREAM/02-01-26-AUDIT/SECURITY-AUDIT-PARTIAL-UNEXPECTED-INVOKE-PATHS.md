# Partial Security Audit: Unexpected Invocation Paths (tool/network/write/exec)

Date: 2026-02-02

Scope of this partial:

- Identify “unexpected” or high-impact invocation chains that can be triggered by inbound inputs (chat messages, webhooks, HTTP endpoints, scheduled tasks).
- Provide explicit path traces (Ingress → routing → prompt/tool selection → outbound action).
- Mark UNKNOWN where the chain cannot be fully confirmed via the inspected files.

---

## PATH-1: Telegram webhook → bot message handler → auto-reply → agent run (LLM) → tools

1. Ingress (untrusted HTTP):
   - Telegram webhook server accepts `POST` to `path` and passes request to grammy webhook handler (`src/telegram/webhook.ts:60-70`).
   - Quote: `const handled = handler(req, res);` (`src/telegram/webhook.ts:69`)

2. Channel listener (untrusted message content):
   - Telegram bot listens to messages: `bot.on("message", async (ctx) => { ... })` (`src/telegram/bot-handlers.ts:477`)

3. Basic gating examples (groups):
   - GroupPolicy can block or require allowlist (`src/telegram/bot-handlers.ts:537-565`)

4. Agent invocation:
   - Downstream auto-reply/agent runner wiring from Telegram handler is **UNKNOWN** in this partial (not traced through Telegram->auto-reply call sites). Needs follow-up in `src/telegram/*` to confirm exact call chain.

Outbounds (eventual, from other partials):

- Tool calls include `exec`, `write`, `apply_patch`, `web_fetch`, etc., depending on tool policy and model behavior (see `src/agents/pi-embedded-runner/run/attempt.ts:207-240` for tool assembly).

---

## PATH-2: Chat message → `/bash` or `!` command → `exec` tool → subprocess (RCE) (explicit, high impact)

1. Ingress:
   - Any message that becomes a command string can be normalized into `command.commandBodyNormalized` (command context builder shown in `src/auto-reply/reply/commands-context.ts:27-41`).

2. Command router detects `/bash` or `!`:
   - `bashSlashRequested = commandBodyNormalized === "/bash" || startsWith("/bash ")` (`src/auto-reply/reply/commands-bash.ts:10-12`)
   - `bashBangRequested = commandBodyNormalized.startsWith("!")` (`src/auto-reply/reply/commands-bash.ts:12-13`)

3. Authorization gate:
   - Requires `command.isAuthorizedSender` (`src/auto-reply/reply/commands-bash.ts:16-19`)
   - Quote: `Ignoring /bash from unauthorized sender` (`src/auto-reply/reply/commands-bash.ts:17-18`)

4. Feature flag gate:
   - `/bash` requires `commands.bash === true` (`src/auto-reply/reply/bash-command.ts:218-222`)

5. Elevated permission gate:
   - `/bash` requires elevated enabled+allowed; otherwise returns detailed failure message:
     - `if (!params.elevated.enabled || !params.elevated.allowed) { ... formatElevatedUnavailableMessage(...) }`
       (`src/auto-reply/reply/bash-command.ts:231-243`)

6. Outbound: executes host shell command via `execTool.execute(...)` with `elevated: true`
   - `const execTool = createExecTool({ ... elevated: { enabled, allowed, defaultLevel: "on" } })` (`src/auto-reply/reply/bash-command.ts:363-374`)
   - `await execTool.execute("chat-bash", { command: commandText, ... elevated: true })` (`src/auto-reply/reply/bash-command.ts:375-381`)

Risk:

- This is a direct “chat → host shell exec” path. Security relies on:
  - sender authorization (`src/auto-reply/reply/commands-bash.ts:16-19`),
  - config flag `commands.bash` (`src/auto-reply/reply/bash-command.ts:218-222`),
  - elevated allowlists (`tools.elevated.allowFrom.<provider>`, see `src/config/types.tools.ts:486-492` and resolution in `src/auto-reply/reply/reply-elevated.ts:175-187`).

Potential “unexpected” angle:

- If the elevated allowlist fallback is broader than intended (e.g., derived from channel allowFrom), authorized senders might gain shell exec where operator expected “no shell from chat”. Confirm `allowFromFallback` behavior per channel dock (UNKNOWN in this partial).

---

## PATH-3: Chat message → `/config set/unset` → disk write of config (high impact)

1. Ingress:
   - `/config` is parsed from text via `parseConfigCommand` (`src/auto-reply/reply/config-commands.ts:9-70`).

2. Authorization gate:
   - Requires `params.command.isAuthorizedSender` (`src/auto-reply/reply/commands-config.ts:33-38`).

3. Feature flag gate:
   - `/config` requires `commands.config === true` (`src/auto-reply/reply/commands-config.ts:39-46`).

4. Channel-level write gate:
   - For set/unset: `resolveChannelConfigWrites(...)` must allow writes (`src/auto-reply/reply/commands-config.ts:54-73`).

5. Validates config before writing:
   - `validateConfigObjectWithPlugins(parsedBase)` (`src/auto-reply/reply/commands-config.ts:127-136` and `:153-162`).

6. Outbound: writes config file on disk:
   - `await writeConfigFile(validated.config);` (`src/auto-reply/reply/commands-config.ts:137-141` and `:163-174`)

Risk:

- Disk write of runtime configuration. Even with authorization gates, this is high-impact and can change tool policies, allowlists, or webhook endpoints.

---

## PATH-4: Chat message (group) → inline directives (`/elevated`, `/exec`) → runtime mode changes / exec defaults (conditional)

1. Inline directive parsing:
   - `parseInlineDirectives(commandText, ...)` (`src/auto-reply/reply/get-reply-directives.ts:191-194`)

2. Group mention gating for elevated/exec directives:
   - Elevated: if group and not mentioned, non-`off` elevated directives are stripped:
     - `if (isGroup && ctx.WasMentioned !== true && parsedDirectives.hasElevatedDirective) { if (parsedDirectives.elevatedLevel !== "off") { ... hasElevatedDirective: false ... } }`
       (`src/auto-reply/reply/get-reply-directives.ts:203-212`)
   - Exec: if group and not mentioned, exec directives with security != deny are stripped:
     - `if (isGroup && ctx.WasMentioned !== true && parsedDirectives.hasExecDirective) { if (parsedDirectives.execSecurity !== "deny") { ... hasExecDirective: false ... } }`
       (`src/auto-reply/reply/get-reply-directives.ts:213-232`)

3. Elevated allowlist gate (per-provider allowFrom):
   - `resolveElevatedPermissions` checks `tools.elevated.allowFrom.<provider>` gates and returns failures (`src/auto-reply/reply/reply-elevated.ts:175-187`).

Risk:

- Inline directives are a “hidden trigger” mechanism. Mention gating reduces group abuse, but DMs remain higher risk if sender authorization is weak.

UNKNOWN:

- There is a potential logic discrepancy between directive parsing and tests asserting “ignore elevated directive for unapproved sender”; confirming exact behavior requires deeper run-path tracing in `resolveReplyDirectives` and its callsites.

---

## PATH-5: Scheduled heartbeat → getReplyFromConfig → LLM call (automatic behavior)

1. Trigger:
   - `runHeartbeatOnce(...)` is a background runner (`src/infra/heartbeat-runner.ts:476-499`).

2. Reads `HEARTBEAT.md` to decide whether to skip:
   - `const heartbeatFileContent = await fs.readFile(heartbeatFilePath, "utf-8");` (`src/infra/heartbeat-runner.ts:513`)

3. Constructs model prompt and calls reply generator:
   - `const ctx = { Body: prompt, Provider: ... "heartbeat", SessionKey: sessionKey, ... }` (`src/infra/heartbeat-runner.ts:549-555`)
   - `const replyResult = await getReplyFromConfig(ctx, { isHeartbeat: true }, cfg);` (`src/infra/heartbeat-runner.ts:597`)

Risk:

- Automatic model calls can be induced by edits to `HEARTBEAT.md` (workspace file) and may run without interactive human review.

---

## PATH-6: Authenticated gateway client → `POST /tools/invoke` → arbitrary tool execution (high impact if token leaks)

1. Ingress:
   - `POST /tools/invoke` (`src/gateway/tools-invoke-http.ts:108-115`)

2. Auth:
   - Bearer token extracted and passed to `authorizeGatewayConnect` (`src/gateway/tools-invoke-http.ts:118-124`)

3. Tool selection:
   - Tool list built via `createOpenClawTools(...)` and filtered by policies (`src/gateway/tools-invoke-http.ts:214-229`, `:273-296`)

4. Tool execution:
   - `await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);` (`src/gateway/tools-invoke-http.ts:313-314`)

Risk:

- This endpoint is a powerful “remote tool runner”. Security hinges on token confidentiality and correct scope/policy enforcement.

---

## PATH-7: Automation webhook executor → network fetch to arbitrary URL (SSRF)

1. Trigger:
   - Automations executor runs a webhook action (scheduling/trigger path not inspected here).

2. Outbound:
   - `fetch(config.url, ...)` (`src/automations/executors/webhook.ts:219-223`)

Risk:

- Potential SSRF if `config.url` is attacker-controlled or can be influenced by untrusted inbound events.
