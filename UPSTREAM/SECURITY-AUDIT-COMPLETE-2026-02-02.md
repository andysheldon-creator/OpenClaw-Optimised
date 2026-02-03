# Security Audit Report (Comprehensive): Prompt Generation, Tooling, and Outbound Calls

Date: 2026-02-02

Focus:

- (A) Prompt-generation material + code paths that construct prompts/messages/instructions for LLMs/agents.
- (B) All outbound Tool/API calls (network, subprocess, filesystem, or “tool” abstraction), with traces for unexpected invocation paths from untrusted inputs.
- (C) Whether tools are appropriately classified as READ vs WRITE in any tool configuration/metadata found (best-effort, static inspection). If uncertain: marked UNKNOWN.

Key constraint observed:

- Evidence-based: findings include file path + line number + short quote (≤ ~2 lines) + reasoning.

Threat model (assumed):

- Adversary can inject untrusted content via channel messages, webhooks/HTTP endpoints, files in workspace, CLI args, env vars, config files.
- Attacker attempts prompt injection to cause tool invocation.
- Attacker attempts SSRF/exfil via outbound HTTP.
- Attacker attempts filesystem writes, command execution, privilege escalation via tool APIs.
- Attacker attempts to trigger automatic background behaviors (heartbeats, retries, watchers).

---

## 1) Scope & Baseline

- REPO_ROOT: `/Users/dgarson/clawd/clawdbot`
- BASELINE (inferred “recent upstream sync”): `ac9bca71e3672304a83024b79796dfa9be9fcfd1` — `2026-01-26 13:38:54 -0700` — “Merge pull request #35 from dgarson/upstream-sync-jan-26-2026-0001”
- HEAD (audit target): `a4da6636269d7ab1d8da033c02e18dcd9a4f19fc` — `2026-02-01 19:46:36 -0700` — “Merge pull request #53 from dgarson/integration/vercel-ai-chat-ui”

Verification (from local git, ISO timestamps):

- `BASELINE ac9bca71e3672304a83024b79796dfa9be9fcfd1 2026-01-26T13:38:54-07:00 Merge pull request #35 from dgarson/upstream-sync-jan-26-2026-0001`
- `HEAD a4da6636269d7ab1d8da033c02e18dcd9a4f19fc 2026-02-01T19:46:36-07:00 Merge pull request #53 from dgarson/integration/vercel-ai-chat-ui`

This report is built from read-only inspection and targeted searches across `src/` and `extensions/`.

---

## Synopsis: Prompt Injection & “Unexpected API Calls” (since BASELINE vs pre-existing)

This synopsis emphasizes (1) prompt injection surfaces where untrusted content is elevated into system/developer context, and (2) outbound calls / tool execution paths that may be “unexpected” to an operator or to a developer reading upstream call sites.

### Prompt injection highlights

1. **Injected workspace/context files are concatenated verbatim into the system prompt (pre-existing; wording updated post-BASELINE).**

- Evidence (explicit “injected files” section and raw file inclusion):
  - `"## Workspace Files (injected)"` (`src/agents/system-prompt.ts:487`)
  - `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:550`)
- Why it’s “unexpected”: a developer may assume “workspace files” are just local context, but here they are first-class system prompt material; an attacker who can modify these files can attempt prompt injection to steer tool use.

2. **SOUL.md persona takeover is explicitly encouraged (pre-existing; high prompt-injection leverage if attacker can write/replace SOUL.md).**

- Evidence:
  - `If SOUL.md is present, embody its persona and tone...` (`src/agents/system-prompt.ts:545`)
- Why it’s “unexpected”: this is a direct instruction to treat a file as authoritative behavioral policy; it increases the blast radius of any filesystem write path (including worktree RPC and patch tools).

3. **The system prompt advertises an “elevated” mode that can auto-approve exec (pre-existing; increases social-engineering risk via prompt injection).**

- Evidence:
  - `Current elevated level: ... (ask runs exec on host with approvals; full auto-approves).` (`src/agents/system-prompt.ts:476`)
- Why it’s “unexpected”: untrusted chat content can attempt to persuade operators to enable `/elevated full`, and the system prompt itself normalizes that control path.

### Unexpected outbound/tool execution highlights

4. **NEW since BASELINE (2026-02-01): Gateway “worktree RPC” adds remote filesystem write/delete/move/mkdir via the Gateway protocol.**

- Evidence (explicitly classified as WRITE methods):
  - `"worktree.write",` (`src/gateway/server-methods.ts:127`)
  - `"worktree.delete",` (`src/gateway/server-methods.ts:128`)
- Evidence (actual FS writes in the handler):
  - `await fs.mkdir(path.dirname(absolutePath), { recursive: true });` (`src/gateway/server-methods/worktree.ts:245`)
  - `await fs.writeFile(absolutePath, request.content, "utf8");` (`src/gateway/server-methods/worktree.ts:273`)
- Evidence (untrusted network frame → handler dispatch, post-auth):
  - `await handleGatewayRequest({` (`src/gateway/server/ws-connection/message-handler.ts:936`)
  - `const authResult = await authorizeGatewayConnect({` (`src/gateway/server/ws-connection/message-handler.ts:570`)
- Why it’s “unexpected”: a developer reading “chat” features may not expect the Gateway WebSocket protocol to include direct write primitives for arbitrary workspace paths; the operator impact is “remote file modification” once a client is authorized.

5. **Pre-existing (added 2026-01-24, before BASELINE): `POST /tools/invoke` is a remote tool runner that executes any available tool by name.**

- Evidence (endpoint selection + bearer token auth):
  - `if (url.pathname !== "/tools/invoke") {` (`src/gateway/tools-invoke-http.ts:108`)
  - `const token = getBearerToken(req);` (`src/gateway/tools-invoke-http.ts:118`)
- Evidence (dynamic tool execution):
  - `const result = await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);` (`src/gateway/tools-invoke-http.ts:313`)
- Why it’s “unexpected”: developers may assume tools are invoked only by an LLM runtime, but this endpoint allows direct HTTP invocation (subject to auth + policy filtering), turning “tool APIs” into a remotely-callable interface.

6. **NEW since BASELINE (2026-01-31): policy coupling can silently broaden WRITE capability — allowing `exec` also allows `apply_patch`.**

- Evidence:
  - `if (normalized === "apply_patch" && matchesAny("exec", allow)) {` (`src/agents/pi-tools.policy.ts:72`)
- Why it’s “unexpected”: a reviewer might allow `exec` (thinking “shell commands only”) but unintentionally allow repo modification via patches as well.

7. **Network calls that may surprise operators because they are not “LLM web_fetch” and may be triggered by configs or message content.**

- Automations webhook executor fetches `config.url` (introduced 2026-01-26 evening; post-BASELINE timestamp):
  - `const response = await fetch(config.url, {` (`src/automations/executors/webhook.ts:219`)
- memory-lancedb summarizer fetches arbitrary `url` (introduced 2026-01-26 evening; post-BASELINE timestamp):
  - `const res = await fetch(url);` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)
- Why it’s “unexpected”: these bypass the repo’s hardened `web_fetch` tool SSRF protections (the hardening location is outside these call sites), so “fetching a URL” can happen through other code paths with different safeguards.

8. **NEW since BASELINE (2026-02-01): `packages/vercel-ai-agent` introduces “tools passed to model API” semantics (potential implicit tool execution), but core wiring is UNKNOWN.**

- Evidence (tools passed into model calls):
  - `tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,` (`packages/vercel-ai-agent/src/agent.ts:267`)
  - `tools: Object.keys(self.tools).length > 0 ? self.tools : undefined,` (`packages/vercel-ai-agent/src/agent.ts:460`)
- Evidence (arbitrary tool registration with weak typing):
  - `registerTool(name: string, tool: any): this {` (`packages/vercel-ai-agent/src/agent.ts:194`)
- UNKNOWN (core invocation path): `rg -n "vercel-ai-agent" src packages ui` finds only the package’s own `package.json` (no static import usage found).

## 2) High-Risk Findings (must include evidence)

### HIGH-1: Chat → `/bash` / `!` → host shell execution via `exec` tool (RCE), gated but extremely high impact

Evidence (command routing + authorization):

- `/bash` handler requires authorized sender:
  - `if (!command.isAuthorizedSender) { ... return { shouldContinue: false }; }` (`src/auto-reply/reply/commands-bash.ts:16-19`)
- `/bash` requires config enablement:
  - `if (params.cfg.commands?.bash !== true) { ... "bash is disabled. Set commands.bash=true" ... }` (`src/auto-reply/reply/bash-command.ts:218-222`)
- `/bash` requires elevated allowed:
  - `if (!params.elevated.enabled || !params.elevated.allowed) { ... formatElevatedUnavailableMessage(...) }`
    (`src/auto-reply/reply/bash-command.ts:231-243`)

Evidence (exec invocation):

- Creates exec tool and runs with `elevated: true`:
  - `const execTool = createExecTool({ ... elevated: { enabled: ..., allowed: ..., defaultLevel: "on" } })` (`src/auto-reply/reply/bash-command.ts:363-374`)
  - `await execTool.execute("chat-bash", { command: commandText, ... elevated: true })` (`src/auto-reply/reply/bash-command.ts:375-381`)

Reasoning:

- Even with gating, this is a direct path from chat input to subprocess execution. Any mistake in sender authorization, elevated allowlists, or config hygiene results in immediate RCE risk.

### HIGH-2: Authenticated `POST /tools/invoke` executes arbitrary tools (remote tool runner if token leaks)

Evidence (endpoint + auth):

- Route match and bearer token auth:
  - `if (url.pathname !== "/tools/invoke") { return false; }` (`src/gateway/tools-invoke-http.ts:108-110`)
  - `const token = getBearerToken(req);` (`src/gateway/tools-invoke-http.ts:118`)
  - `authorizeGatewayConnect(... connectAuth: token ? { token, password: token } : null ...)` (`src/gateway/tools-invoke-http.ts:119-124`)
  - `if (!authResult.ok) { sendUnauthorized(res); }` (`src/gateway/tools-invoke-http.ts:125-128`)

Evidence (tool selection + execution):

- Tool list includes core + plugins and is policy-filtered:
  - `const allTools = createOpenClawTools({ ... pluginToolAllowlist: collectExplicitAllowlist([...]) })` (`src/gateway/tools-invoke-http.ts:214-229`)
  - `filterToolsByPolicy(...)` applied repeatedly (`src/gateway/tools-invoke-http.ts:273-296`)
- Execution:
  - `const result = await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);`
(`src/gateway/tools-invoke-http.ts:313-314`)

Reasoning:

- This is an “API surface to execute tools” guarded by bearer token. If the token is compromised (logs, env leaks, MITM, etc.), attacker can invoke any allowed tool (including write/exec tools) subject to policies.

### HIGH-3: SSRF/exfil risks via “fetch arbitrary URL” features outside the hardened `web_fetch` tool

#### HIGH-3a: Automations webhook executor fetches `config.url` (potential SSRF)

Evidence:

- `const response = await fetch(config.url, { ... })` (`src/automations/executors/webhook.ts:219-223`)

Reasoning:

- If `config.url` can be influenced by untrusted users/events (automation configs are often user-set), this creates SSRF and data exfiltration opportunities. No SSRF guard/allowlist is visible at this call site.

#### HIGH-3b: memory-lancedb URL summarizer fetches arbitrary `url` directly

Evidence:

- `const res = await fetch(url);` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)

Reasoning:

- If the URL originates from untrusted chat content (likely), SSRF is possible. Unlike `web_fetch`, there is no visible pinning/SSRF guard here.

### HIGH-4: Skill installer downloads arbitrary URL and extracts via `tar`/`unzip` (supply chain + path traversal risk)

Evidence:

- Downloads arbitrary URL:
  - `const response = await fetch(url, { signal: controller.signal });` (`src/agents/skills-install.ts:182`)
- Writes to disk:
  - `const file = fs.createWriteStream(destPath);` (`src/agents/skills-install.ts:187`)
- Extracts with external tools:
  - `runCommandWithTimeout(["unzip", ...])` (`src/agents/skills-install.ts:212-214`)
  - `runCommandWithTimeout(["tar", "xf", ...])` (`src/agents/skills-install.ts:219-223`)

Reasoning:

- If `spec.url` is attacker-controlled (directly or indirectly), this is a “download + extract” pipeline that can be abused (malicious archives, zip-slip/tar traversal, unexpected file overwrites). The extraction safety properties are UNKNOWN without deeper validation of extraction behavior and post-extract path checks.

---

## 3) Medium-Risk Findings

### MED-1: Prompt injection surface: raw workspace files concatenated into system prompt (“Project Context”)

Evidence:

- Injected context files are appended verbatim:
  - `lines.push("# Project Context", "", "The following project context files have been loaded:");` (`src/agents/system-prompt.ts:542`)
  - `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:549-551`)
- The prompt explicitly states these files are user-editable and included:
  - `"## Workspace Files (injected)"` (`src/agents/system-prompt.ts:487`)
  - `"These user-editable files are loaded ... included below in Project Context."` (`src/agents/system-prompt.ts:488`)

Reasoning:

- Attacker-controlled content in these files can attempt prompt injection to induce tool invocation or data exfil. Protection depends on:
  - explicit “treat injected context as untrusted data” instruction (NOT FOUND in inspected prompt sections),
  - tool policy gating and approvals.

### MED-2: `exec` can become approval-less when elevated mode is “full”

Evidence:

- Approval bypass in exec tool:
  - `if (elevatedRequested && elevatedMode === "full") { security = "full"; }` (`src/agents/bash-tools.exec.ts:940-942`)
  - `const bypassApprovals = elevatedRequested && elevatedMode === "full"; if (bypassApprovals) { ask = "off"; }`
    (`src/agents/bash-tools.exec.ts:946-949`)

Reasoning:

- If elevated “full” is available in any session reachable from lower-trust channels, it removes a major safety gate.

### MED-3: Policy coupling: allowlisting `exec` implicitly allows `apply_patch` in some policy matchers

Evidence:

- `if (normalized === "apply_patch" && matchesAny("exec", allow)) { return true; }`
  (`src/agents/pi-tools.policy.ts:72-75`)

Reasoning:

- This can violate operator intent: enabling “runtime exec” may unintentionally enable multi-file patch writes. This may be deliberate, but it is security-relevant and should be treated as a potential over-permission.

### MED-4: Browser control server is local-only but exposes high-power endpoints (local attacker model)

Evidence:

- Binds loopback only:
  - `app.listen(port, "127.0.0.1", ...)` (`src/browser/server.ts:36`)
- Exposes endpoints that can start/stop/reset browser and create/delete profiles:
  - `/start` runs `ensureBrowserAvailable` (`src/browser/routes/basic.ts:75-87`)
  - `/profiles/create` accepts `cdpUrl` from request body (`src/browser/routes/basic.ts:124-146`)

Reasoning:

- Loopback binding is a strong mitigation, but any local process can potentially invoke these endpoints; threat depends on whether local untrusted processes are in scope.

### MED-5: Voice-call streaming logs transcripts (privacy/secret leakage risk)

Evidence:

- `console.log(\`[voice-call] Transcript for ${providerCallId}: ${transcript}\`);` (`extensions/voice-call/src/webhook.ts:72-74`)

Reasoning:

- Transcripts can contain sensitive data; stdout/stderr often ends up in centralized logs.

---

## 4) Low-Risk / Hygiene Findings

### LOW-1: Telegram webhook defaults to `0.0.0.0` bind; security relies on secret token being set

Evidence:

- Default host bind is public:
  - `const host = opts.host ?? "0.0.0.0";` (`src/telegram/webhook.ts:36`)
- Secret token is optional input:
  - `webhookCallback(... { secretToken: opts.secret })` (`src/telegram/webhook.ts:46-48`)

Reasoning:

- This is not inherently insecure, but misconfiguration (no secret token + public bind) is a common failure mode. The runtime config that ensures `opts.secret` is set is UNKNOWN here.

---

## 5) Prompt Surfaces Inventory (table)

PROMPT_SURFACE_ID | FILE:LINE | TYPE | INPUT SOURCES | OUTPUT DESTINATION

- PS-1 | `src/agents/system-prompt.ts:164` | system template | config + tools + injected files | system prompt string
- PS-2 | `src/agents/system-prompt.ts:542` | doc ingest | `params.contextFiles` | system prompt “Project Context”
- PS-3 | `src/agents/bootstrap-files.ts:43` | context packer | workspace bootstrap files + truncation | embedded contextFiles
- PS-4 | `src/agents/pi-embedded-runner/run/attempt.ts:344` | embedded system prompt assembly | skillsPrompt + heartbeatPrompt + tools + contextFiles | embedded runner system prompt
- PS-5 | `src/infra/heartbeat-runner.ts:549` | scheduled prompt | `HEARTBEAT.md` + config | `getReplyFromConfig` (LLM call)
- PS-6 | `extensions/memory-lancedb/src/services/openai-extractor.ts:76` | OpenAI messages[] builder | conversation / URL content | OpenAI chat.completions
- PS-7 | `extensions/memory-lancedb/src/services/openai-expander.ts:44` | OpenAI messages[] builder | history + user message | OpenAI chat.completions

NOT FOUND (search attempts):

- A separate “developer prompt” layer distinct from system prompt composition; tool usage relies primarily on system prompt + tool schemas.

---

## 6) Outbound Calls Inventory (table)

OUTBOUND_ID | FILE:LINE | CATEGORY | TARGET | INPUT SOURCES | GATING | READ/WRITE (assessment)

- OC-1 | `src/auto-reply/reply/bash-command.ts:375` | subprocess/tool | host shell command | chat message body | `commands.bash` + sender auth + elevated allowlist | WRITE (RCE)
- OC-2 | `src/gateway/tools-invoke-http.ts:313` | tool abstraction | any tool `.execute` | HTTP body | bearer auth + policy filters | MIXED (depends on tool)
- OC-3 | `src/automations/executors/webhook.ts:219` | network | `config.url` | automation config | timeout/retry only | READ (net), high impact
- OC-4 | `extensions/memory-lancedb/src/services/openai-extractor.ts:110` | network | arbitrary URL | likely user URL | none shown | READ (net), high impact
- OC-5 | `src/agents/tools/web-fetch.ts:217` | network | arbitrary http(s) URL | LLM tool args | protocol + pinned dispatcher | READ (net)
- OC-6 | `src/slack/monitor/media.ts:15` | network+fs | Slack file URL (+ redirect) | Slack event payload | token auth + size limit | READ (net) + WRITE (fs)
- OC-7 | `src/telegram/download.ts:12` | network+fs | Telegram API file URL | Telegram message attachment | fixed host + maxBytes | READ (net) + WRITE (fs)
- OC-8 | `src/agents/skills-install.ts:182` | network+fs+subprocess | download + extract | skill spec | timeout only | WRITE (fs) + subprocess
- OC-9 | `extensions/voice-call/src/providers/telnyx.ts:53` | network | Telnyx API | webhook/call flow | provider credentials | WRITE (side-effect)

---

## 7) Tool Permission Classification Review (read vs write)

What exists:

- Tool policy is allow/deny lists + profiles + groups, not explicit READ/WRITE classification:
  - `ToolPolicyConfig` includes `allow`, `alsoAllow`, `deny`, `profile` (`src/config/types.tools.ts:141-152`)
  - Tool groups include mixed capabilities (`group:fs` contains both `read` and write tools) (`src/agents/tool-policy.ts:18-19`)

Inferred classification (best-effort):

- CLEAR WRITE-capable: `exec`, `write`, `edit`, `apply_patch`, `gateway`, `cron`, `message` (see group definitions and known semantics in `src/agents/tool-policy.ts:18-35`).
- CLEAR READ-capable: `read`, `web_search`, `web_fetch` (`src/agents/tool-policy.ts:16-19`).
- AMBIGUOUS/MIXED: `browser`, `nodes` (not purely read-only; can have real-world side effects depending on implementation) (`src/agents/tool-policy.ts:30-36`).

Possible misclassification / over-permission:

- `apply_patch` implicitly allowed when `exec` is allowed (`src/agents/pi-tools.policy.ts:72-75`) → **POSSIBLY MISCLASSIFIED** relative to an operator’s expectation of separating exec from file writes.

---

## 8) Unexpected Invocation Paths (explicit path traces)

### PATH-A: Chat `/bash` → exec → host shell

1. Ingress: chat message containing `/bash ...` or `!...` (normalized command body)
2. Command router: `handleBashCommand` matches `/bash`/`!` (`src/auto-reply/reply/commands-bash.ts:10-14`)
3. Auth gate: `command.isAuthorizedSender` required (`src/auto-reply/reply/commands-bash.ts:16-19`)
4. Feature gate: `commands.bash === true` (`src/auto-reply/reply/bash-command.ts:218-222`)
5. Elevated allowlist gate: blocks if not allowed (`src/auto-reply/reply/bash-command.ts:231-243`)
6. Outbound: `execTool.execute(... elevated: true)` (`src/auto-reply/reply/bash-command.ts:375-381`)

### PATH-B: Chat `/config set|unset` → writeConfigFile (disk write)

1. Ingress: chat message containing `/config ...` (`src/auto-reply/reply/config-commands.ts:9-70`)
2. Auth gate: `isAuthorizedSender` required (`src/auto-reply/reply/commands-config.ts:33-38`)
3. Feature gate: `commands.config === true` (`src/auto-reply/reply/commands-config.ts:39-46`)
4. Channel write gate: `resolveChannelConfigWrites(...)` required for set/unset (`src/auto-reply/reply/commands-config.ts:54-73`)
5. Validation: `validateConfigObjectWithPlugins(...)` (`src/auto-reply/reply/commands-config.ts:127-136`)
6. Outbound: `writeConfigFile(validated.config)` (`src/auto-reply/reply/commands-config.ts:137-141`)

### PATH-C: Heartbeat schedule → LLM call without interactive prompt

1. Trigger: `runHeartbeatOnce` background runner (`src/infra/heartbeat-runner.ts:476-505`)
2. Reads `HEARTBEAT.md` (`src/infra/heartbeat-runner.ts:513`)
3. Outbound: `getReplyFromConfig(ctx, { isHeartbeat: true }, cfg)` (`src/infra/heartbeat-runner.ts:597`)

### PATH-D: Gateway `POST /tools/invoke` → execute tool

1. Ingress: HTTP `POST /tools/invoke` (`src/gateway/tools-invoke-http.ts:108-115`)
2. Auth: `authorizeGatewayConnect(...)` (`src/gateway/tools-invoke-http.ts:119-124`)
3. Tool filtering: `filterToolsByPolicy(...)` chain (`src/gateway/tools-invoke-http.ts:273-296`)
4. Outbound: tool `.execute(...)` (`src/gateway/tools-invoke-http.ts:313-314`)

### PATH-E: Automations webhook executor → fetch arbitrary URL

1. Trigger: automation run (trigger path UNKNOWN here)
2. Outbound: `fetch(config.url, ...)` (`src/automations/executors/webhook.ts:219-223`)

---

## 9) Recommendations (prioritized, minimal-change)

P0

1. Add SSRF guardrails for any “fetch arbitrary URL” outside `web_fetch`, especially:
   - `src/automations/executors/webhook.ts:219`
   - `extensions/memory-lancedb/src/services/openai-extractor.ts:110`
2. Harden skill installer archive extraction (zip-slip/tar traversal defense-in-depth):
   - `src/agents/skills-install.ts:212`
   - `src/agents/skills-install.ts:219`
3. Tighten and audit chat-to-exec (`/bash`) posture:
   - Ensure `tools.elevated.allowFrom.<provider>` cannot accidentally broaden via fallbacks; confirm in dock configs (start at `src/auto-reply/reply/reply-elevated.ts:167-187` and channel docks).

P1

4. Add explicit “treat injected context files as untrusted data” instruction near the Project Context boundary in system prompt:
   - `src/agents/system-prompt.ts:542`
5. Review and potentially remove implicit `exec` → `apply_patch` allow coupling:
   - `src/agents/pi-tools.policy.ts:72`
6. Ensure elevated “full” is never enabled for low-trust channels and cannot be toggled remotely without strong operator controls:
   - `src/agents/bash-tools.exec.ts:940`
   - `src/config/types.agent-defaults.ts:172-173` (default elevated level option)

P2

7. Reduce sensitive logging (voice transcripts) or make it opt-in:
   - `extensions/voice-call/src/webhook.ts:72`
8. Add operational safety docs/guardrails for public webhook binds + secret token requirements:
   - `src/telegram/webhook.ts:36` and `:46`
9. Audit browser-control endpoints for least privilege (even though loopback):
   - `src/browser/routes/basic.ts:75` and `:124`
10. Create a single shared “network fetch policy” helper (allowlist/deny private IPs, metadata, localhost) and require its use by all URL-fetching features:

- Candidate existing SSRF code: `src/infra/net/ssrf.ts` (used by `web_fetch`, but not used by automations/memory-lancedb in inspected code).

---

## 10) Unknowns / Needs Human Review

UNKNOWN-1: Telegram webhook secret-token enforcement when `opts.secret` is omitted.

- Evidence: secret token is optional input to grammy callback (`src/telegram/webhook.ts:46-48`), but this report did not verify grammy behavior for missing secrets.

UNKNOWN-2: Full channel-to-auto-reply ingress wiring for every channel (Discord/Slack/WhatsApp/etc.).

- This report sampled Telegram and Slack flows but did not trace all monitors end-to-end to the agent runner.

UNKNOWN-3: Archive extraction safety beyond invoking `tar`/`unzip`.

- No post-extract path validation is shown around `runCommandWithTimeout(["tar"...])` / `["unzip"...]` (`src/agents/skills-install.ts:212-223`).

UNKNOWN-4: Whether `systemPromptReport` content (including injected files) can be accessed by untrusted clients.

- It is constructed during embedded runs (`src/agents/pi-embedded-runner/run/attempt.ts:370-391`), but exposure path is not confirmed here.

---

## 10-item prioritized checklist of fixes (P0–P2) with file references

P0

1. SSRF guard for automations webhook URL: `src/automations/executors/webhook.ts:219`
2. SSRF guard for memory-lancedb URL summarizer: `extensions/memory-lancedb/src/services/openai-extractor.ts:110`
3. Zip-slip/tar traversal mitigations for skill downloads: `src/agents/skills-install.ts:212`

P1

4. Add “untrusted Project Context” instruction: `src/agents/system-prompt.ts:542`
5. Remove/justify `exec`→`apply_patch` implicit allow: `src/agents/pi-tools.policy.ts:72`
6. Ensure elevated `full` cannot be enabled in low-trust sessions: `src/agents/bash-tools.exec.ts:940`

P2

7. Reduce transcript logging: `extensions/voice-call/src/webhook.ts:72`
8. Enforce Telegram webhook secret/token configuration guidance: `src/telegram/webhook.ts:46`
9. Lock down `/tools/invoke` operationally (token storage/logging): `src/gateway/tools-invoke-http.ts:118`
10. Confirm `/bash` remains strictly allowlisted + elevated-gated: `src/auto-reply/reply/commands-bash.ts:16`
