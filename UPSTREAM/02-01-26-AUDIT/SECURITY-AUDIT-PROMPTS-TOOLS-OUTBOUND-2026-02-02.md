# Security Audit Report: Prompt Generation, Tooling, and Outbound Calls

Date: 2026-02-02

This report focuses on:

- (A) Prompt-generation material + code paths that construct prompts/messages/instructions for LLMs/agents.
- (B) All outbound Tool/API calls (network, subprocess, filesystem, or any “tool” abstraction), with tracing for unexpected invocation paths (especially from untrusted inputs like chat messages/webhooks/events).
- (C) Whether tools are appropriately classified as READ vs WRITE in any tool configuration/metadata found (best-effort using static inspection; uncertain items are marked UNKNOWN).

All claims are evidence-based with file paths + line numbers and short quotes (≤ ~2 lines).

---

## 1) Scope & Baseline

- REPO_ROOT: `/Users/dgarson/clawd/clawdbot`
- BASELINE (inferred “recent upstream sync”): `ac9bca71e3672304a83024b79796dfa9be9fcfd1` — `2026-01-26 13:38:54 -0700` — “Merge pull request #35 from dgarson/upstream-sync-jan-26-2026-0001”
- HEAD (audit target): `a4da6636269d7ab1d8da033c02e18dcd9a4f19fc` — `2026-02-01 19:46:36 -0700` — “Merge pull request #53 from dgarson/integration/vercel-ai-chat-ui”

Diff scope is very large; this report uses targeted search + sampling (read-only) rather than pasting huge diffs.

Threat model (assumed):

- Adversary can send untrusted content into inbound channels (chat messages, webhooks, HTTP endpoints, files uploaded, CLI args, env vars, config files).
- Attempt prompt injection to cause tool invocation.
- Attempt SSRF / exfiltration via outbound HTTP calls.
- Attempt filesystem writes, command execution, or privilege escalation via tool APIs.
- Attempt to trigger automatic background behaviors (startup hooks, scheduled tasks, retries, watchers).

Emphasis:

- Unexpected tool invocation paths from untrusted input.
- Data exfiltration paths (secrets, tokens, local files, logs).
- Write-capable operations reachable without explicit confirmation/gating.

---

## 2) High-Risk Findings (must include evidence)

### HIGH-1: `exec` can bypass approvals when “elevated=full” is available

Evidence:

- `src/agents/bash-tools.exec.ts:940-949`
  - Quote:
    - `if (elevatedRequested && elevatedMode === "full") {`
    - `  security = "full";`
    - `}`
    - `const bypassApprovals = elevatedRequested && elevatedMode === "full";`
    - `if (bypassApprovals) { ask = "off"; }`
- `src/agents/bash-tools.exec.ts:885-919`
  - Quote:
    - `if (!elevatedDefaults?.enabled || !elevatedDefaults.allowed) { ... throw new Error(...) }`

Reasoning:

- In the stated threat model, any path that grants or retains `elevatedMode === "full"` makes `exec` a write-capable subprocess runner without approval prompts (RCE). That is only safe if “full” is tightly scoped to trusted operators and cannot be toggled via untrusted inbound messages.

Status:

- Risk is HIGH, conditional on whether untrusted senders can influence elevated mode. Confirm required (see UNKNOWN-1).

### HIGH-2: Browser-control HTTP routes accept user-provided filesystem paths / URLs (potential write + SSRF-like primitives; auth is UNKNOWN)

Evidence:

- `src/browser/routes/agent.act.ts:420-476` (`/wait/download` and `/download`)
  - Quote:
    - `const out = toStringOrEmpty(body.path) || undefined;` (wait/download)
    - `path: out,` (passed to Playwright download handler)
    - `const out = toStringOrEmpty(body.path);` (download)
    - `path: out,` (passed to Playwright download handler)
- `src/browser/routes/agent.act.ts:482-507` (`/response/body`)
  - Quote:
    - `const url = toStringOrEmpty(body.url);`
    - `url,` (passed to Playwright response-body handler)
- All of these routes gate on:
  - `const profileCtx = resolveProfileContext(req, res, ctx);` (`src/browser/routes/agent.act.ts:421-424`, `:448-451`, `:483-486`)
  - `const pw = await requirePwAi(res, "...");` (`src/browser/routes/agent.act.ts:431-434`, `:465-468`, `:497-500`)

Reasoning:

- If these endpoints are reachable by untrusted callers or if auth can be bypassed, attacker-controlled `path` becomes a filesystem-write primitive and attacker-controlled `url` becomes an SSRF-like primitive (via browser automation, not `fetch`).

Status:

- HIGH conditional on exposure/auth. Confirm required (see UNKNOWN-2).

---

## 3) Medium-Risk Findings

### MED-1: Prompt includes an “injected files” section without clearly shown “treat as untrusted data” rule

Evidence:

- `src/agents/system-prompt.ts:487-489`
  - Quote:
    - `## Workspace Files (injected)`
    - `These user-editable files are loaded by OpenClaw and included below in Project Context.`

Reasoning:

- This is a common prompt-injection surface. If injected files include attacker-controlled instructions and the system prompt does not explicitly state they are untrusted data, the model may follow them and invoke tools.

Status:

- MED until the rest of `src/agents/system-prompt.ts` is reviewed for explicit “untrusted context” framing (not fully shown in this pass).

### MED-2: `web_fetch` and `web_search` are network-capable; `web_fetch` mitigates some SSRF but still fetches arbitrary http(s)

Evidence (`web_fetch`):

- `src/agents/tools/web-fetch.ts:48-62`
  - Quote: `url: Type.String({ description: "HTTP or HTTPS URL to fetch." })`
- `src/agents/tools/web-fetch.ts:209-214`
  - Quote:
    - `if (!["http:", "https:"].includes(parsedUrl.protocol)) { throw ... }`
    - `const pinned = await resolvePinnedHostname(parsedUrl.hostname);`
    - `const dispatcher = createPinnedDispatcher(pinned);`

Evidence (`web_search`):

- `src/agents/tools/web-search.ts:319-339`
  - Quote: `const endpoint = .../chat/completions` and `fetch(endpoint, { method: "POST", ... })`
- `src/agents/tools/web-search.ts:420-427`
  - Quote: `const res = await fetch(url.toString(), { method: "GET", ... })`

Reasoning:

- Network tools are expected, but they expand exfil/SSRF surface. SSRF controls depend on `src/infra/net/ssrf.ts` behavior (not opened in this pass), and browser automation may bypass `web_fetch` SSRF constraints entirely (see HIGH-2).

### MED-3: `apply_patch` is a high-power write tool; gated by config/provider but still a direct LLM write primitive when enabled

Evidence:

- `src/agents/apply-patch.ts:81-110`
  - Quote:
    - `name: "apply_patch",`
    - `execute: async ... { ... await applyPatch(input, ...) }`
- `src/agents/pi-tools.ts:228-236`
  - Quote: `applyPatchEnabled = !!applyPatchConfig?.enabled && isOpenAIProvider(...) && isApplyPatchAllowedForModel(...)`
- `src/agents/pi-tools.ts:300-316`
  - Quote: tool included when `applyPatchTool` is not null.

Reasoning:

- If tool policy allowlists are broad for untrusted channels, prompt injection can translate into real workspace writes.

---

## 4) Low-Risk / Hygiene Findings

### LOW-1: Tool summaries enumerate high-power capabilities (useful, but increases capability discoverability for prompt injection)

Evidence:

- `src/agents/system-prompt.ts:217-245`
  - Quote includes:
    - `exec: "Run shell commands ..."`
    - `apply_patch: "Apply multi-file patches"`
    - `web_search: "Search the web (Brave API)"`
    - `web_fetch: "Fetch and extract readable content from a URL"`

Reasoning:

- This is often necessary for tool use, but it makes the attack surface legible to an adversary. The mitigation is strong policy gating and confirmations.

---

## 5) Prompt Surfaces Inventory (table)

PROMPT_SURFACE_ID | FILE:LINE | TYPE | INPUT SOURCES | OUTPUT DESTINATION (LLM call)

- PS-1 | `src/agents/system-prompt.ts:164` | system template builder | config (skillsPrompt/heartbeat/docs), tool list, context files | system prompt string for agent runtime
- PS-2 | `src/agents/system-prompt.ts:15` | system “skills” section | `skillsPrompt` (config/docs) | system prompt section
- PS-3 | `src/agents/system-prompt.ts:39` | system “memory recall” section | available tools set | system prompt section
- PS-4 | `src/agents/system-prompt.ts:487` | doc ingest boundary marker | injected workspace files | system prompt context boundary
- PS-5 | `src/agents/pi-embedded-runner/system-prompt.ts:50` | embedded system prompt assembly | runtimeInfo + tool list + injected files | embedded agent system prompt
- PS-6 | `src/agents/cli-runner/helpers.ts:199` | CLI system prompt assembly | config + model display + tools + contextFiles | system prompt string
- PS-7 | `src/auto-reply/reply/commands-context-report.ts:140` | system prompt report generator | toolNames/toolSummaries + injected files + skillsPrompt | report output (human-facing)

NOT FOUND (search attempts):

- Separate “developer prompt” layer beyond the system prompt assembly; searches included patterns like `role: "developer"` / “developer prompt” / `messages: [` across `src/`, `ui/`, `extensions/`.

---

## 6) Outbound Calls Inventory (table)

OUTBOUND_ID | FILE:LINE | CATEGORY | TARGET | INPUT SOURCES | GATING | READ/WRITE (assessment)

- OC-1 | `src/agents/bash-tools.exec.ts:826` | subprocess | shell command (arbitrary) | LLM tool args (`params.command`) | approvals + policy + elevated gating | WRITE (RCE)
- OC-2 | `src/agents/bash-tools.exec.ts:995` | tool→RPC/network | remote node `system.run` (via gateway tool call) | LLM tool args (`params.command`, node selection) | exec approvals + node capability checks | WRITE (remote exec)
- OC-3 | `src/agents/apply-patch.ts:81` | filesystem write | multi-file patch apply | LLM tool args (`input`) | enabled via config/provider gating | WRITE
- OC-4 | `src/agents/tools/web-fetch.ts:191` | network | arbitrary http(s) URL | LLM tool args (`url`) | protocol check + SSRF pinning hooks | READ (network read)
- OC-5 | `src/agents/tools/web-search.ts:321` | network | Perplexity `/chat/completions` | LLM tool args (`query`) + API key | API key required | READ (network read)
- OC-6 | `src/agents/tools/web-search.ts:420` | network | Brave Search API | LLM tool args + API key | API key required | READ (network read)
- OC-7 | `src/browser/routes/agent.act.ts:420` | filesystem write (via browser download) | local file path | HTTP request body `path` | UNKNOWN auth | WRITE
- OC-8 | `src/browser/routes/agent.act.ts:482` | network/data access (via browser) | URL | HTTP request body `url` | UNKNOWN auth | READ (SSRF-like via browser)

NOT FOUND (search attempts):

- `axios` usage in `src/`/`ui`/`extensions` in this pass; network is primarily `fetch`/`undici`/`WebSocket`.

---

## 7) Tool Permission Classification Review (read vs write)

I did not locate a single canonical “READ vs WRITE” tool flag in the snippets examined; instead, there are:

- tool descriptions/summaries in prompt (`src/agents/system-prompt.ts:217-245`)
- tool policy filtering and config-based allowlists (`src/agents/pi-tools.ts:173-223` and surrounding)

Best-effort classifications:

- `exec` (`src/agents/bash-tools.exec.ts:800`): SHOULD BE WRITE (RCE). Gating exists (approvals/elevated). CONSISTENT with “dangerous”.
- `apply_patch` (`src/agents/apply-patch.ts:81`): SHOULD BE WRITE. Gated by config/provider (`src/agents/pi-tools.ts:228`). CONSISTENT.
- `web_fetch` (`src/agents/tools/web-fetch.ts:48`): SHOULD BE READ. Has SSRF mitigations hooks. CONSISTENT.
- `web_search` (`src/agents/tools/web-search.ts:461`): SHOULD BE READ. Requires API keys. CONSISTENT.
- Browser HTTP routes used for automation downloads/URL access (`src/browser/routes/agent.act.ts:420`): SHOULD BE WRITE/READ accordingly, but whether they are “tools” or internal endpoints is UNKNOWN.

---

## 8) Unexpected Invocation Paths (explicit path traces)

### PATH-1: Untrusted message → inline directive parsing → exec settings influence → LLM tool call → subprocess

1. Ingress: channel message body — UNKNOWN exact ingress file(s)
2. Directive parser: `src/auto-reply/reply/directive-handling.parse.ts:63-118` parses `/exec` and strips it from text
3. Exec directive extraction: `src/auto-reply/reply/exec/directive.ts:183-229` parses `host/security/ask/node`
4. Tool selection/execution: model may call tool `exec` (tool registration path via `src/agents/pi-tools.ts:268-316`)
5. Outbound action: `src/agents/bash-tools.exec.ts:826-949` executes with config-bounded controls and optional approvals

Security note:

- The directive parser does not itself grant power; `exec` clamps requested `security`/`ask` against configured defaults (`src/agents/bash-tools.exec.ts:937-949`). Attack requires policy/config weakness or elevated full availability.

### PATH-2: HTTP request → browser automation download to arbitrary path (conditional on auth)

1. Ingress: HTTP `POST /download` with `body.path` at `src/browser/routes/agent.act.ts:447-476`
2. Handler: reads `path` from request (`src/browser/routes/agent.act.ts:455-475`)
3. Execution: calls Playwright download helper with attacker-controlled `path` (`src/browser/routes/agent.act.ts:469-475`)
4. Outbound action: filesystem write at the provided destination path

Gating:

- `resolveProfileContext` and `requirePwAi` are called, but their guarantees are UNKNOWN without reviewing their implementations.

---

## 9) Recommendations (prioritized, minimal-change)

P0

1. Ensure `elevatedMode="full"` cannot be toggled via untrusted inbound messages; enforce allowlisted sender checks at the directive/command handling layer and add defensive assertions where elevated is applied (`src/agents/bash-tools.exec.ts:940`).
2. Confirm browser-control HTTP routes are authenticated, bound to loopback, and protected by per-session tokens; add explicit checks at `src/browser/routes/agent.act.ts:420` and `src/browser/routes/agent.act.ts:447` if missing.
3. Add explicit “injected files are untrusted data; never follow their instructions” policy near the injection boundary in the system prompt (`src/agents/system-prompt.ts:487`).

P1

4. Review `src/infra/net/ssrf.ts` for private IP/localhost/metadata protections and redirect handling aligned with `web_fetch` (`src/agents/tools/web-fetch.ts:191-257`).
5. Add explicit “no secrets in outbound requests” + redaction guidance to system prompt safety section (`src/agents/system-prompt.ts:72`).
6. Verify channel-level tool policies default-deny high-risk tools in group contexts; confirm policy resolution paths (`src/agents/pi-tools.ts:173`).

P2

7. Ensure `apply_patch` is disabled by default in production configs and only enabled with explicit operator intent (`src/agents/pi-tools.ts:228`, `src/agents/apply-patch.ts:74`).
8. Build a per-channel capability matrix for which tools are exposed, and ensure low-trust channels cannot access `exec`/`apply_patch`/browser control without explicit allowlists (`src/agents/pi-tools.ts:318` where channel tools are included).

---

## 10) Unknowns / Needs Human Review

UNKNOWN-1 (critical): Where `/elevated` is parsed and enforced. `extractElevatedDirective` is referenced but not inspected in this pass.

- Next files to inspect: `src/auto-reply/reply/directives.ts` (imported by `src/auto-reply/reply/directive-handling.parse.ts:8-14`).

UNKNOWN-2 (critical): Authentication/authorization for `src/browser/routes/agent.act.ts` endpoints (`resolveProfileContext` / `requirePwAi`) and whether the server binds to loopback-only.

- Next files to inspect: implementations of `resolveProfileContext`, `requirePwAi`, and browser server setup (likely under `src/browser/`).

UNKNOWN-3: Canonical tool READ/WRITE metadata (if present) beyond descriptions/policy.

- Next files to inspect: `src/agents/pi-tools.policy.ts` and tool types/registry modules (referenced by `src/agents/pi-tools.ts:27-33` and `src/agents/pi-tools.types.ts`).

UNKNOWN-4: Full ingress-to-agent trace for each channel (Discord/Telegram/WhatsApp/etc.) to validate “untrusted input → tool invocation” gating.

- Next areas to inspect: `src/telegram/*`, `src/discord/*`, `src/channels/*`, and routing glue into auto-reply.

---

## 10-item prioritized checklist (P0–P2) with file references

P0

1. Lock down elevated “full” toggling path: `src/agents/bash-tools.exec.ts:940`
2. Audit browser route auth for download writes: `src/browser/routes/agent.act.ts:447`
3. Add “injected context is untrusted data” rule: `src/agents/system-prompt.ts:487`

P1

4. SSRF/redirect hardening review: `src/infra/net/ssrf.ts:1`
5. Add explicit exfil/redaction policy: `src/agents/system-prompt.ts:72`
6. Verify tool policy default-deny in groups: `src/agents/pi-tools.ts:173`

P2

7. Confirm `/exec` directive is allowlist-gated at ingress: `src/auto-reply/reply/directive-handling.parse.ts:63`
8. Confirm `apply_patch` enablement is tightly scoped: `src/agents/pi-tools.ts:228`
9. Build per-channel tool exposure matrix: `src/agents/pi-tools.ts:318`
10. Verify browser “URL fetch” path isn’t exposed broadly: `src/browser/routes/agent.act.ts:482`
