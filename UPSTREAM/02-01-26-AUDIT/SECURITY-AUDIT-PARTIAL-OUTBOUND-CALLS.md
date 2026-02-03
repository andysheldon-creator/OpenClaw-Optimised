# Partial Security Audit: Outbound Calls (network / subprocess / filesystem)

Date: 2026-02-02

Scope of this partial:

- Enumerate outbound call sites (network, subprocess, filesystem writes) in `src/` and `extensions/` (best-effort, static inspection).
- For each major call site: evidence (file:line + short quote), target, input sources, gating, and READ/WRITE assessment.
- Highlight high-risk “untrusted input → network/write/exec” paths.

Search method (best-effort):

- `rg -n fetch\\(` and `WebSocket\\(`, `spawn|execFile|execSync|spawnSync` and common fs write ops, excluding `*.test.*` / `*.e2e.*` where possible.

---

## 1) Network outbound calls

### NET-1: Automation “webhook executor” fetches arbitrary configured URLs (SSRF/exfil risk)

Evidence:

- `src/automations/executors/webhook.ts:219-223`
  - Quote:
    - `const response = await fetch(config.url, {`
    - `  ...requestOptions,`
    - `  signal: controller.signal,`
    - `});`

Target:

- `config.url` (arbitrary URL; exact scheme/host restrictions not shown in snippet).

Input sources / taint:

- LIKELY user-configurable automation settings (webhook URL, headers, body). Confirm by tracing automation config ingestion (UNKNOWN in this partial).

Gating:

- Timeout + retry logic exists (`src/automations/executors/webhook.ts:160-205`), but no allowlist/SSRF guard is visible in this snippet.

Assessment:

- **READ (network)** but **HIGH RISK** if `config.url` can be influenced by untrusted inputs, as it creates SSRF and data exfiltration opportunities.

### NET-2: `web_fetch` tool fetches arbitrary http(s) URLs with pinned dispatcher (SSRF mitigation present)

Evidence:

- `src/agents/tools/web-fetch.ts:209-214`
  - Quote:
    - `if (!["http:", "https:"].includes(parsedUrl.protocol)) { throw ... }`
    - `const pinned = await resolvePinnedHostname(parsedUrl.hostname);`
    - `const dispatcher = createPinnedDispatcher(pinned);`
- Actual fetch:
  - `res = await fetch(parsedUrl.toString(), { ... dispatcher })` (`src/agents/tools/web-fetch.ts:217-227`)

Target:

- Tool argument `url` (http/https).

Input sources:

- LLM tool argument (untrusted, prompt-injection-influenced).

Gating:

- Protocol restriction + SSRF pinning via `src/infra/net/ssrf.ts` (implementation not inspected in this partial).

Assessment:

- **READ (network)**; risk depends on SSRF implementation completeness (UNKNOWN here).

### NET-3: Slack media downloads follow redirects; saves inbound media to disk

Evidence:

- Initial Slack-protected fetch:
  - `fetch(url, { headers: { Authorization: \`Bearer ${token}\` }, redirect: "manual" })` (`src/slack/monitor/media.ts:15-18`)
- Redirect follow without auth header:
  - `return fetch(resolvedUrl, { redirect: "follow" });` (`src/slack/monitor/media.ts:36`)
- Saves to media store:
  - `const saved = await saveMediaBuffer(...)` (`src/slack/monitor/media.ts:70-75`)

Targets:

- `url` from Slack file metadata (`file.url_private_download`/`file.url_private`) (`src/slack/monitor/media.ts:50-53`)
- Redirect target is derived from response header `location` (`src/slack/monitor/media.ts:26-33`)

Input sources:

- Slack event payloads (untrusted, but typically authenticated by Slack signing upstream—auth not shown in this file).

Gating:

- Uses Slack token provided by caller (`src/slack/monitor/media.ts:39-46`).
- Size limit checked: `if (fetched.buffer.byteLength > params.maxBytes) continue;` (`src/slack/monitor/media.ts:67-69`)

Assessment:

- **READ (network)** + **WRITE (filesystem)** (via media store). Redirect handling intentionally drops Authorization to avoid leaking tokens cross-origin.

### NET-4: Telegram file download uses bot token + file_id/file_path; saves inbound media to disk

Evidence:

- File metadata fetch:
  - `fetch(\`https://api.telegram.org/bot${token}/getFile?file_id=...\`)` (`src/telegram/download.ts:12-14`)
- File content download:
  - `const url = \`https://api.telegram.org/file/bot${token}/${info.file_path}\`;`
  - `const res = await fetch(url);` (`src/telegram/download.ts:33-35`)
- Saves to media store:
  - `const saved = await saveMediaBuffer(array, mime, "inbound", maxBytes, info.file_path);` (`src/telegram/download.ts:45`)

Targets:

- Telegram API endpoints (fixed domains).

Input sources:

- `fileId` and `info.file_path` come from Telegram message attachments (untrusted).

Gating:

- Domain is fixed to Telegram API; size bound via `maxBytes` (passed in) and via media store constraints (not inspected here).

Assessment:

- **READ (network)** + **WRITE (filesystem)** (saved inbound media).

### NET-5: Update check fetches npm registry for `openclaw` tags

Evidence:

- `fetchWithTimeout(\`https://registry.npmjs.org/openclaw/${encodeURIComponent(tag)}\`, timeoutMs)` (`src/infra/update-check.ts:318-321`)

Target:

- Fixed npm registry host; tag is user/config-chosen.

Input sources:

- `tag` parameter (`src/infra/update-check.ts:311-317`).

Assessment:

- **READ (network)**; lower risk (fixed host).

### NET-6: memory-lancedb URL summarization fetches arbitrary URL directly (SSRF risk)

Evidence:

- `const res = await fetch(url);` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)

Target:

- Arbitrary `url` string passed into `summarizeUrl(url, api)` (`extensions/memory-lancedb/src/services/openai-extractor.ts:104-112`).

Input sources:

- LIKELY user chat messages containing URLs (tests suggest URL detection). Exact wiring is UNKNOWN in this partial.

Gating:

- No SSRF protections shown; truncates response to 10k chars (`extensions/memory-lancedb/src/services/openai-extractor.ts:116-118`) but that does not mitigate SSRF.

Assessment:

- **READ (network)** but **HIGH RISK** if URL is untrusted and environment can access internal hosts.

### NET-7: Provider/model discovery uses local Ollama endpoint

Evidence:

- `fetch(\`${OLLAMA_API_BASE_URL}/api/tags\`, { signal: AbortSignal.timeout(5000) })` (`src/agents/models-config.providers.ts:100-102`)

Target:

- Fixed loopback default: `http://127.0.0.1:11434` (`src/agents/models-config.providers.ts:69`)

Assessment:

- **READ (network)**; local-only.

### NET-8: Voice-call providers call remote telephony/TTS APIs

Evidence:

- Twilio:
  - `fetch(\`${params.baseUrl}${params.endpoint}\`, { method: "POST", headers: { Authorization: Basic ... } ... })` (`extensions/voice-call/src/providers/twilio/api.ts:23-30`)
- Telnyx:
  - `fetch(\`${this.baseUrl}${endpoint}\`, { method: "POST", headers: { Authorization: Bearer ... } ... })` (`extensions/voice-call/src/providers/telnyx.ts:53-60`)
- Plivo:
  - `fetch(\`${this.baseUrl}${endpoint}\`, { ... Authorization: Basic ... } ...)` (`extensions/voice-call/src/providers/plivo.ts:70-77`)

Input sources:

- Config-derived API keys/tokens + call metadata. Webhook events ultimately come from untrusted callers, but these requests are to provider-controlled endpoints.

Assessment:

- **WRITE (network)** in effect (causes telephony actions) even though it is “network I/O”; treat as high-impact side effects.

---

## 2) Subprocess execution (host exec)

### PROC-1: Skill installer downloads archives and executes `tar`/`unzip`

Evidence:

- Download + write to disk:
  - `const response = await fetch(url, { signal: controller.signal });` (`src/agents/skills-install.ts:182`)
  - `const file = fs.createWriteStream(destPath);` (`src/agents/skills-install.ts:187`)
  - `await pipeline(readable, file);` (`src/agents/skills-install.ts:192`)
- Extraction uses external binaries:
  - `return await runCommandWithTimeout(["unzip", ...], { timeoutMs });` (`src/agents/skills-install.ts:212-214`)
  - `return await runCommandWithTimeout(["tar", "xf", ...], { timeoutMs });` (`src/agents/skills-install.ts:219-223`)

Input sources:

- `spec.url` (`src/agents/skills-install.ts:232-241`) likely from skill definitions (which may be user-editable or plugin-provided).

Gating:

- Checks presence of binaries `tar`/`unzip` (`src/agents/skills-install.ts:208-218`).
- NO allowlist on `spec.url` shown here.

Assessment:

- **WRITE (filesystem)** + **subprocess**. If `spec.url` is attacker-controlled, this becomes a supply-chain style “download and execute extractor” path. Archive extraction itself can be dangerous (path traversal) unless `tar/unzip` invocation is hardened; hardening is UNKNOWN from this snippet.

### PROC-2: Voice-call webhook can spawn `tailscale` (and ngrok elsewhere)

Evidence:

- `extensions/voice-call/src/webhook.ts:346` shows `spawn("tailscale", args, ...)` (details not shown in snippet earlier).
- `extensions/voice-call/src/tunnel.ts` contains multiple `spawn("ngrok", ...)` and `spawn("tailscale", ...)` calls (identified by search; not expanded here).

Assessment:

- **WRITE (subprocess/network)**; impact depends on how/when tunnel setup is triggered and who can request it (needs deeper trace).

---

## 3) Filesystem writes (selected high-signal cases)

### FS-1: Media store writes inbound files to disk

Evidence (entrypoints calling it):

- Slack path: `saveMediaBuffer(...)` called from `src/slack/monitor/media.ts:70-75`
- Telegram path: `saveMediaBuffer(...)` called from `src/telegram/download.ts:45`

Evidence (media store implementation writes):

- `createWriteStream(dest, { mode: 0o600 })` (`src/media/store.ts:132`)
- `await fs.writeFile(dest, buffer, { mode: 0o600 })` (`src/media/store.ts:207`)
- Temp-to-final rename:
  - `await fs.rename(tempDest, finalDest);` (`src/media/store.ts:191`)

Assessment:

- **WRITE (filesystem)**. Primary risk is path traversal or attacker-controlled filenames; media store likely normalizes paths (not inspected here).

### FS-2: Hooks and plugins installers modify directories (rename/rm)

Evidence:

- Hooks install:
  - `await fs.rename(targetDir, backupDir);` (`src/hooks/install.ts:172`)
  - `await fs.rm(targetDir, { recursive: true, force: true })` (`src/hooks/install.ts:179-180`)
- Plugins install:
  - Similar rename/rm patterns (`src/plugins/install.ts:149-156` from search results; not expanded here).

Input sources:

- Operator/CLI invocation; but could be triggered indirectly if tools expose it (UNKNOWN).

Assessment:

- **WRITE (filesystem)**; potentially destructive operations.

### FS-3: Sandbox registry writes state files

Evidence:

- `await fs.writeFile(SANDBOX_REGISTRY_PATH, ... )` (`src/agents/sandbox/registry.ts:50`)

Assessment:

- **WRITE (filesystem)**; likely internal state.

---

## 4) High-risk summaries (from this partial)

HIGH (conditional on untrusted input reachability):

1. Arbitrary webhook URL fetch in automations executor: `src/automations/executors/webhook.ts:219`
2. Arbitrary URL fetch in memory-lancedb summarizer: `extensions/memory-lancedb/src/services/openai-extractor.ts:110`
3. Download + extract of arbitrary URL in skills installer: `src/agents/skills-install.ts:182`, `:212`, `:219`

---

## 5) Unknowns / needs human review (outbound calls)

1. SSRF policy coverage:
   - Whether there is a shared SSRF guard used by automations/webhook or memory-lancedb (none shown in the snippets above).
2. Archive extraction safety in `skills-install`:
   - Whether extracted paths are validated against `targetDir` to prevent path traversal (“zip slip”, tar path traversal). Current code delegates to `tar`/`unzip` directly (`src/agents/skills-install.ts:212-223`).
3. Media store path safety:
   - Whether `saveMediaBuffer` sanitizes filename hints and prevents traversal or collisions (implementation not audited here beyond write calls).
