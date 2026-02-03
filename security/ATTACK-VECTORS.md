# Attack Vectors & Vulnerable Points (Obvious + Nonobvious)

This document enumerates high-signal security surfaces that can lead to:

- prompt injection (especially via untrusted channel text / webhooks / “skills” / memory / docs),
- unexpected outbound API calls (network/subprocess/filesystem),
- privilege escalation (tool policy, elevated modes, remote admin APIs).

Format: each entry includes evidence (file:line + short quote) and the primary risk.

## 0) Baseline assumptions

Even if **all current local files are trusted** and **no malicious user has accessed the host**, the system still has high-impact “latent” surfaces where:

- a single credential leak,
- a configuration mistake,
- or a future bug in auth/routing

can turn into remote tool execution, remote file modification, or unintended outbound network calls.

## 1) Ingress: untrusted text into the agent (channels / webhooks / callbacks)

### 1.1 Channel messages (generic prompt injection risk)

All chat channels can deliver attacker-crafted content (“jailbreak prompts”) which is then used by the agent runner. The codebase also supports **per-group tool policies** which can inadvertently allow higher-power tools in group contexts.

- Evidence (per-channel docks include per-group tool policy resolvers):
  - `resolveToolPolicy: resolveTelegramGroupToolPolicy,` (`src/channels/dock.ts:112-115`)
  - `resolveToolPolicy: resolveWhatsAppGroupToolPolicy,` (`src/channels/dock.ts:151-154`)

- Evidence (example resolver binds tool policy to sender + group metadata):
  - `return resolveChannelGroupToolsPolicy({` (`src/channels/plugins/group-mentions.ts:258-267`)

Risk:

- A “Moltbook/social network” style channel message can be a pure prompt injection attempt; the damage depends on which tools are enabled for that session/group and how the system prompt frames tool use.

NOT FOUND:

- No code-level references to a “moltbook” channel were found via `rg -n "moltbook" -S src extensions packages ui docs`.

### 1.2 Webhook HTTP entrypoints (Telegram + Slack)

Webhooks are a “direct internet ingress” surface: an attacker may spoof requests unless secrets/signatures are enforced.

- Evidence (Telegram webhook server starts and registers webhook):
  - `await startTelegramWebhook({` (`src/telegram/monitor.ts:151`)
  - `const handler = webhookCallback(bot, "http", {` (`src/telegram/webhook.ts:46`)

- Evidence (Slack HTTP webhook path registration exists):
  - `normalizeSlackWebhookPath` (`src/slack/http/registry.ts:17`)
  - `registerSlackHttpHandler` used by provider (`src/slack/monitor/provider.ts:14`)

Risk:

- Forged webhook events can inject arbitrary chat messages (prompt injection) and may trigger downstream behaviors (auto-reply, tool selection) depending on routing.

UNKNOWN:

- Signature/secret enforcement details per provider are not fully enumerated in this doc. Confirm per-provider verification paths (Slack signing secret, Telegram secret token, etc.) in the relevant modules.

### 1.3 Inline buttons “callback_data” routes back as a user message

The system prompt explicitly states that inline button callback data becomes a “user message”.

- Evidence:
  - `callback_data routes back as a user message` (`src/agents/system-prompt.ts:122`)

Risk:

- Any place that creates buttons whose `callback_data` is derived from untrusted content can create a “second-stage prompt injection” path (payload is delivered as if user-authored).

## 2) Prompt generation and prompt-adjacent injection surfaces

### 2.1 Raw context file injection into system prompt (“Project Context”)

The system prompt includes arbitrary “context files” verbatim. This is a powerful injection vector if any upstream path can write those files.

- Evidence:
  - `lines.push("# Project Context"...` (`src/agents/system-prompt.ts:542`)
  - `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:550`)

Risk:

- A channel-delivered jailbreak prompt doesn’t need to “win” immediately; it can try to induce the agent to write to a context file, causing persistent prompt injection.

### 2.2 SOUL.md persona override

SOUL.md is explicitly treated as a persona authority.

- Evidence:
  - `If SOUL.md is present, embody its persona and tone...` (`src/agents/system-prompt.ts:545`)

Risk:

- Any attacker who can get a write into SOUL.md (directly or indirectly) can bias all future behavior.

### 2.3 Skills system: “read and follow SKILL.md”

The system prompt instructs the model to select and read SKILL.md files (which are effectively executable playbooks).

- Evidence:
  - `## Skills (mandatory)` (`src/agents/system-prompt.ts:28`)
  - `read its SKILL.md ... then follow it.` (`src/agents/system-prompt.ts:30`)

Risk:

- If a skill’s SKILL.md is attacker-controlled or unexpectedly modified, it becomes a prompt-injection payload with high authority.

### 2.4 Remote skill installation (supply chain → prompt injection)

Skills can be installed via the gateway methods and may download/extract archives.

- Evidence (remote install method):
  - `"skills.install": async` (`src/gateway/server-methods/skills.ts:108`)
  - `const result = await installSkill({` (`src/gateway/server-methods/skills.ts:127`)

- Evidence (download + extract uses external tools):
  - `const response = await fetch(url, { signal: controller.signal });` (`src/agents/skills-install.ts:182`)
  - `const argv = ["unzip"...]; return await runCommandWithTimeout(argv...)` (`src/agents/skills-install.ts:212-213`)
  - `const argv = ["tar", "xf", ...]; return await runCommandWithTimeout(argv...)` (`src/agents/skills-install.ts:219-223`)

Risk:

- Even if today’s skills are benign, the feature creates a path where “future benign usage” (installing a new skill) becomes a high-trust prompt injection vector if the archive source is compromised or mis-validated.

## 3) Tool and API execution paths that are “unexpected”

### 3.1 Remote tool runner: `POST /tools/invoke`

This HTTP endpoint executes a tool by name (subject to auth + tool policy filtering).

- Evidence (route + auth):
  - `if (url.pathname !== "/tools/invoke") {` (`src/gateway/tools-invoke-http.ts:108`)
  - `const token = getBearerToken(req);` (`src/gateway/tools-invoke-http.ts:118`)
- Evidence (dynamic execution):
  - `await (tool as any).execute?.(\`http-${Date.now()}\`, toolArgs);` (`src/gateway/tools-invoke-http.ts:313`)

Risk:

- If a gateway token leaks, attackers can invoke high-power tools remotely without involving the model at all.

### 3.2 NEW remote filesystem API: Gateway “worktree” RPC (write/delete/move/mkdir)

The gateway protocol supports direct workspace file operations and explicitly classifies them as WRITE methods.

- Evidence (WRITE classification):
  - `"worktree.write",` (`src/gateway/server-methods.ts:127`)
  - `"worktree.delete",` (`src/gateway/server-methods.ts:128`)

- Evidence (actual write):
  - `await fs.writeFile(absolutePath, request.content, "utf8");` (`src/gateway/server-methods/worktree.ts:273`)

Risk:

- A compromised or overly-permissive gateway client can become a “remote file editor” (leading to persistent prompt injection by modifying context files / skills / configs).

### 3.3 Chat-to-shell command execution via `/bash`

There is a direct path from chat content to host shell execution, gated by config + authorization + elevated checks.

- Evidence (bash disabled unless enabled):
  - `bash is disabled. Set commands.bash=true` (`src/auto-reply/reply/bash-command.ts:220`)
- Evidence (exec tool invocation for chat-bash):
  - `await execTool.execute("chat-bash", {` (`src/auto-reply/reply/bash-command.ts:375`)

Risk:

- This is an extremely high-impact feature even when gated; any future auth regression or misconfiguration makes it a prime “unexpected RCE” path.

### 3.4 Nonobvious permission expansion: allowing `exec` implicitly allows `apply_patch`

- Evidence:
  - `if (normalized === "apply_patch" && matchesAny("exec", allow)) {` (`src/agents/pi-tools.policy.ts:72`)

Risk:

- An operator/dev enabling “just exec” may not realize it also enables file modification through patches.

### 3.5 Outbound fetch surfaces outside `web_fetch` (SSRF/exfil bypass of intended choke point)

These call sites fetch arbitrary URLs directly, not through the hardened `web_fetch` tool.

- Evidence (automations webhook executor):
  - `const response = await fetch(config.url, {` (`src/automations/executors/webhook.ts:219`)

- Evidence (memory-lancedb URL summarizer):
  - `const res = await fetch(url);` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)

Risk:

- “Jailbreak prompt” → “please summarize this URL / call this webhook” can become SSRF or exfil unless URLs are restricted/validated consistently.

## 4) Outbound subprocess surfaces (command injection / privilege escalation / data leakage)

- Evidence (spawning external binaries in extensions):
  - `const proc = spawn("ngrok", args, {` (`extensions/voice-call/src/tunnel.ts:62`)
  - `const proc = spawn("tailscale", args, {` (`extensions/voice-call/src/webhook.ts:346`)

- Evidence (ssh spawn):
  - `const child = spawn("/usr/bin/ssh", args, {` (`src/infra/ssh-tunnel.ts:158`)

Risk:

- Any user-controlled influence over args/environment becomes a command injection/abuse vector; even if today the sources are trusted, these are high-impact primitives that require strict gating.

## 5) Automatic/background behavior (nonobvious triggers)

There are non-chat triggers (cron, watchers, retries) that can cause outbound calls or tool execution.

- Evidence (cron tool exists and is described as “Manage cron jobs and wake events”):
  - `cron: "Manage cron jobs and wake events ..."` (`src/agents/system-prompt.ts:233`)

Risk:

- A single prompt injection could schedule future actions (“time-bomb” behaviors) if cron is enabled.

## 6) What to treat as “prompt injection adjacent”

Even when input is “just text”, consider it prompt-adjacent if it gets:

- persisted (memory/logging),
- elevated to system prompt (context files, skills),
- turned into structured directives (inline actions, callback_data),
- or used to select/gate tools (group policies, allowFrom lists).

This is the bridge from “social network jailbreak prompt” to “real side effects”.
