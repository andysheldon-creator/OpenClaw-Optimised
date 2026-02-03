# Prompt Injection: Where It Can Come From, How It Escalates, and How to Mitigate

This doc focuses narrowly on prompt injection and “instruction hijacking” risks, including high-quality jailbreak attempts delivered via any social/chat channel.

## 1) Primary injection sources

### 1.1 Untrusted user messages (all channels)

Any channel can deliver adversarial text. The blast radius is determined by:

- which tools are enabled,
- whether the prompt clearly labels untrusted inputs as data,
- whether tool invocation requires explicit confirmation or approvals,
- and whether the system can perform writes that persist into future prompts.

Evidence that tool availability is explicitly enumerated in the system prompt:

- `const coreToolSummaries = { ... exec: "Run shell commands" ... }` (`src/agents/system-prompt.ts:220-226`)

### 1.2 Inline callbacks re-enter as “user messages”

- Evidence:
  - `callback_data routes back as a user message` (`src/agents/system-prompt.ts:122`)

This is effectively a second ingestion channel; treat callback payloads as untrusted user input.

### 1.3 Skills and playbooks (SKILL.md as “high-trust instructions”)

The system prompt instructs the agent to read and follow SKILL.md.

- Evidence:
  - `## Skills (mandatory)` (`src/agents/system-prompt.ts:28`)
  - `read its SKILL.md ... then follow it.` (`src/agents/system-prompt.ts:30`)

If a skill is compromised (or even just poorly written), it can “override intent” and drive tool use.

### 1.4 Workspace/context files (“Project Context”) become system prompt material

These are not merely files; they are injected into system prompt output verbatim.

- Evidence:
  - `lines.push("# Project Context"...` (`src/agents/system-prompt.ts:542`)
  - `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:550`)

### 1.5 SOUL.md persona override

- Evidence:
  - `If SOUL.md is present, embody its persona and tone...` (`src/agents/system-prompt.ts:545`)

This increases the security stakes of any write primitive that can modify SOUL.md.

## 2) Escalation patterns (“how jailbreaks turn into side effects”)

### 2.1 “Write-to-persist” escalation

Common jailbreak pattern:

1. attacker convinces the agent to write a “policy” file, skill, or context file,
2. future runs ingest it as system prompt content,
3. tool use becomes easier to induce.

Evidence (raw context file inclusion):

- `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:550`)

### 2.2 “Toolchain confusion” escalation

Attackers try to reframe “helpful” tools as necessary:

- “run this shell command” → `exec`,
- “patch this file” → `apply_patch`,
- “download/install this” → skill install,
- “fetch this URL” → SSRF/exfil.

Evidence (nonobvious policy expansion):

- `if (normalized === "apply_patch" && matchesAny("exec", allow)) {` (`src/agents/pi-tools.policy.ts:72`)

### 2.3 “Remote admin surface” escalation (credential leak or misbinding)

If a gateway token leaks, an attacker can bypass prompt injection entirely and invoke tools directly:

- `POST /tools/invoke` (`src/gateway/tools-invoke-http.ts:108`, `src/gateway/tools-invoke-http.ts:313`)

If a gateway client is authorized, it can write files remotely:

- `worktree.write` (`src/gateway/server-methods.ts:127`, `src/gateway/server-methods/worktree.ts:273`)

## 3) Mitigations (minimal-change, high leverage)

### 3.1 Prompt hardening and trust boundaries

1. **Treat injected context as untrusted data by default.**
   - Place explicit instructions adjacent to `# Project Context` to never treat it as policy/instructions, and to ignore tool-usage requests embedded there.
   - Evidence (current injection point): `lines.push("# Project Context"...` (`src/agents/system-prompt.ts:542`)

2. **Reduce “persona authority” of SOUL.md or constrain it.**
   - Evidence (persona instruction): (`src/agents/system-prompt.ts:545`)

3. **Add “tool-use requires user intent” guidance to mitigate social engineering.**
   - Evidence (tool list includes exec/process/gateway): (`src/agents/system-prompt.ts:220-236`)

### 3.2 Capability scoping and channel-specific least privilege

1. Default group policy should deny high-power tools and only allow a small subset (read-only tools, message tool).
   - Evidence (group policy exists): `resolveToolPolicy: resolveTelegramGroupToolPolicy` (`src/channels/dock.ts:114`)

2. For “social network” style channels: require explicit mention + enforce per-sender tool policy and disallow “write/exec/gateway”.

### 3.3 Centralize URL-fetch policy (SSRF defense-in-depth)

Enforce a single SSRF/URL allowlist helper for:

- `fetch(config.url)` (`src/automations/executors/webhook.ts:219`)
- `fetch(url)` (`extensions/memory-lancedb/src/services/openai-extractor.ts:110`)
- any future “fetch arbitrary URL” features.

### 3.4 Reduce “unexpected remote execution” surfaces

1. Consider binding `POST /tools/invoke` to loopback-only, or add extra authentication layers and rate limits.
   - Evidence (endpoint): (`src/gateway/tools-invoke-http.ts:108`)

2. For worktree RPC: ensure per-client scopes can distinguish read vs write, and default to read-only for non-operator roles.
   - Evidence (worktree write method exists): (`src/gateway/server-methods.ts:127`)

### 3.5 Skills supply-chain hardening

1. Restrict remote skill install sources to allowlisted domains/refs.
   - Evidence (downloads arbitrary URL): (`src/agents/skills-install.ts:182`)

2. Add zip-slip/tar traversal checks beyond invoking `tar`/`unzip`.
   - Evidence (external extraction): (`src/agents/skills-install.ts:212-223`)
