# Security Audit Synopsis: Prompt Injection & Unexpected API Calls

Date: 2026-02-02

Audit target:

- BASELINE: `ac9bca71e3672304a83024b79796dfa9be9fcfd1` (`2026-01-26T13:38:54-07:00`)
- HEAD: `a4da6636269d7ab1d8da033c02e18dcd9a4f19fc` (`2026-02-01T19:46:36-07:00`)

This synopsis is intentionally narrow: it highlights prompt-injection leverage points and outbound/tool execution paths that may be “unexpected” to an operator or to a developer reading upstream logic.

## Major highlights

### 1) Prompt injection surfaces with high leverage

- **Raw “Project Context” file injection into system prompt (prompt injection if attacker can change these files).**
  - Evidence: `lines.push("# Project Context", "", "The following project context files have been loaded:");` (`src/agents/system-prompt.ts:542`)
  - Evidence: `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:550`)

- **SOUL.md persona escalation: system prompt instructs the model to follow a user-editable file’s persona.**
  - Evidence: `If SOUL.md is present, embody its persona and tone...` (`src/agents/system-prompt.ts:545`)

- **“Elevated full auto-approves” is described in the system prompt (social-engineering vector).**
  - Evidence: `Current elevated level: ... (ask runs exec on host with approvals; full auto-approves).` (`src/agents/system-prompt.ts:476`)

### 2) “Unexpected API calls” and invocation paths

- **NEW since BASELINE: remote workspace filesystem writes via Gateway worktree RPC.**
  - Evidence (WRITE methods enumerated): `"worktree.write",` (`src/gateway/server-methods.ts:127`)
  - Evidence (actual write): `await fs.writeFile(absolutePath, request.content, "utf8");` (`src/gateway/server-methods/worktree.ts:273`)
  - Evidence (network frame dispatch): `await handleGatewayRequest({` (`src/gateway/server/ws-connection/message-handler.ts:936`)
  - Gate (auth exists but remains a “remote write API” once authorized): `const authResult = await authorizeGatewayConnect({` (`src/gateway/server/ws-connection/message-handler.ts:570`)

- **Pre-existing (before BASELINE): `POST /tools/invoke` executes arbitrary tools by name over HTTP (if auth token leaks).**
  - Evidence (route + token): `if (url.pathname !== "/tools/invoke") {` (`src/gateway/tools-invoke-http.ts:108`) and `const token = getBearerToken(req);` (`src/gateway/tools-invoke-http.ts:118`)
  - Evidence (dynamic execution): `const result = await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);` (`src/gateway/tools-invoke-http.ts:313`)

- **NEW since BASELINE: “exec allow” implicitly allows `apply_patch` (silent write expansion).**
  - Evidence: `if (normalized === "apply_patch" && matchesAny("exec", allow)) {` (`src/agents/pi-tools.policy.ts:72`)

- **Network fetches that bypass the SSRF-hardened `web_fetch` tool path (trigger source depends on config/message routing).**
  - Evidence (automations webhook): `const response = await fetch(config.url, {` (`src/automations/executors/webhook.ts:219`)
  - Evidence (memory-lancedb URL summarizer): `const res = await fetch(url);` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)

### 3) Newly added components with UNKNOWN wiring (requires human confirmation)

- **NEW since BASELINE: `packages/vercel-ai-agent` passes a `tools` object to `generateText` / `streamText` (potential implicit tool execution).**
  - Evidence: `tools: Object.keys(this.tools).length > 0 ? this.tools : undefined,` (`packages/vercel-ai-agent/src/agent.ts:267`)
  - Evidence: `registerTool(name: string, tool: any): this {` (`packages/vercel-ai-agent/src/agent.ts:194`)
  - UNKNOWN: no static usage found in core (`rg -n "vercel-ai-agent" src packages ui` only finds the package itself).

## Why these are “unexpected” (operator + developer perspective)

- Operators can be surprised by “remote tool runner” (`/tools/invoke`) and “remote file write API” (worktree RPC) because they don’t look like “chat features” but can be driven by authenticated clients and are high-impact if credentials leak.
- Developers can be surprised by “prompt-as-code” behaviors (`SOUL.md` persona, injected files) because they expand the blast radius of any file write path: editing a file becomes equivalent to editing policy.

## Next review targets (to reduce UNKNOWNs)

- Confirm the ingress/auth/binding for Gateway WS and `/tools/invoke` in the actual runtime deployment configs (loopback vs LAN, proxy exposure, token storage/logging).
- Confirm whether `packages/vercel-ai-agent` is wired into any runtime path, and if so, which tools it exposes in which channels.
