# Partial Security Audit: Prompt-Generation Surfaces

Date: 2026-02-02

Scope of this partial:

- Enumerate prompt-generation material and “prompt adjacency” (context packing, doc ingestion, sanitization) used for LLM/agent interactions.
- For each surface: file:line evidence, input sources, and output destination (what LLM/runtime consumes it).
- Mark UNKNOWN where runtime wiring is not fully confirmed in this pass.

---

## 1) System prompt construction (core agent)

### 1.1 `buildAgentSystemPrompt` (primary system prompt template)

Evidence:

- Entry point: `src/agents/system-prompt.ts:164` defines `buildAgentSystemPrompt(params: { ... })`.
- Tool summaries injected into system prompt:
  - `coreToolSummaries` includes `exec`, `web_search`, `web_fetch`, `gateway`, `apply_patch`, etc. (`src/agents/system-prompt.ts:217-245`)
- “Injected files” boundary marker:
  - `"## Workspace Files (injected)"` (`src/agents/system-prompt.ts:487`)
  - `"These user-editable files are loaded by OpenClaw and included below in Project Context."` (`src/agents/system-prompt.ts:488`)
- Project context files are appended with full raw contents:
  - `lines.push("# Project Context", ...);` (`src/agents/system-prompt.ts:542`)
  - `lines.push(\`## ${file.path}\`, "", file.content, "");` (`src/agents/system-prompt.ts:549-551`)

Input sources:

- `params.contextFiles` — user-editable workspace files (see bootstrap file loading below).
- `params.toolNames` / `params.toolSummaries` — tool exposure surface.
- `params.extraSystemPrompt` — channel/group/system additional instructions (`src/agents/system-prompt.ts:502-507`, shown earlier in sampled output).

Output destination:

- Returned string is used as the model’s “system prompt” in multiple runtimes (embedded runner, CLI runner).

Security relevance:

- Prompt injection risk: raw file contents (`file.content`) are concatenated directly into the system prompt (`src/agents/system-prompt.ts:549-551`).
- Controls for subagents: promptMode “minimal” reduces some sections (definition at `src/agents/system-prompt.ts:13`) and bootstrap file allowlist exists (see `filterBootstrapFilesForSession` below).

### 1.2 Embedded runner uses `buildAgentSystemPrompt` + injected files

Evidence:

- `src/agents/pi-embedded-runner/system-prompt.ts:50-74` calls `buildAgentSystemPrompt({ ... toolNames, toolSummaries, contextFiles ... })`.

Output destination:

- Returned system prompt is fed into the embedded agent runtime (OpenClaw’s “pi-embedded” runner). The exact provider call site is later in the embedded runner flow (see `run/attempt.ts` below).

---

## 2) Workspace/doc ingestion (“Project Context”)

### 2.1 Workspace bootstrap files are created from templates (user-editable prompt inputs)

Evidence:

- Workspace templates are loaded and then written on first-run:
  - `loadTemplate(...)` reads packaged templates (`src/agents/workspace.ts:45-55`)
  - `writeFileIfMissing(... flag: "wx")` (`src/agents/workspace.ts:76-87`)
  - Templates include `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `BOOTSTRAP.md` (`src/agents/workspace.ts:21-28`, `:146-153`)
- Workspace directory is created if missing:
  - `await fs.mkdir(dir, { recursive: true });` (`src/agents/workspace.ts:140`)

Input sources:

- Packaged templates in the workspace template directory (`src/agents/workspace.ts:46-55`).
- User edits to those files after creation.

### 2.2 Bootstrap files are loaded and then converted into embedded “context files”

Evidence:

- `loadWorkspaceBootstrapFiles` reads file contents:
  - `const content = await fs.readFile(entry.filePath, "utf-8");` (`src/agents/workspace.ts:279`)
- `resolveBootstrapContextForRun` builds embedded context files:
  - `const contextFiles = buildBootstrapContextFiles(bootstrapFiles, { maxChars: ..., warn: ... });` (`src/agents/bootstrap-files.ts:54-58`)
- Subagent bootstrap allowlist reduces injected files:
  - `SUBAGENT_BOOTSTRAP_ALLOWLIST = new Set([DEFAULT_AGENTS_FILENAME, DEFAULT_TOOLS_FILENAME]);` (`src/agents/workspace.ts:293`)
  - `filterBootstrapFilesForSession` filters on that allowlist when `isSubagentSessionKey(sessionKey)` (`src/agents/workspace.ts:295-303`)

Security relevance:

- Subagents get fewer injected files by default; main agent receives a broader set of user-editable context files.
- Actual “max chars” truncation happens in `buildBootstrapContextFiles` (not inspected here); potential for partial-file prompt injection remains if truncation drops important delimiters.

---

## 3) Tool exposure and tool descriptions (prompt-adjacent material)

### 3.1 OpenClaw tool list assembly (core + plugins)

Evidence:

- `createOpenClawTools` constructs core tool list and appends plugin tools:
  - `const tools: AnyAgentTool[] = [ createBrowserTool(...), createCanvasTool(), ... createWebSearchTool(...), createWebFetchTool(...), createImageTool(...)]` (`src/agents/openclaw-tools.ts:73-141`)
  - `const pluginTools = resolvePluginTools({ ... toolAllowlist: options?.pluginToolAllowlist })` (`src/agents/openclaw-tools.ts:143-159`)
  - `return [...tools, ...pluginTools];` (`src/agents/openclaw-tools.ts:161`)

Security relevance:

- Tool exposure is a major “prompt surface”: the model learns what can be invoked and with which schemas/descriptions.
- Plugin tools expand attack surface and rely on tool allowlists (`src/agents/openclaw-tools.ts:158-159`).

---

## 4) Embedded agent run (prompt assembly + system prompt report generation)

### 4.1 Embedded runner composes system prompt with runtime metadata and config-derived prompts

Evidence:

- Builds tool list via `createOpenClawCodingTools(...)` (includes exec/write/edit/apply_patch/etc) and sanitizes for Google:
  - `createOpenClawCodingTools({ ... config: params.config, ... })` (`src/agents/pi-embedded-runner/run/attempt.ts:207-240`)
  - `const tools = sanitizeToolsForGoogle({ tools: toolsRaw, provider: params.provider });` (`src/agents/pi-embedded-runner/run/attempt.ts:241`)
- Loads bootstrap context files:
  - `resolveBootstrapContextForRun({ workspaceDir: effectiveWorkspace, ... })` (`src/agents/pi-embedded-runner/run/attempt.ts:189-196`)
- Builds skills prompt (from snapshot or workspace skill entries):
  - `const skillsPrompt = resolveSkillsPromptForRun({ ... workspaceDir: effectiveWorkspace })` (`src/agents/pi-embedded-runner/run/attempt.ts:181-186`)
- Heartbeat prompt only for default agent:
  - `heartbeatPrompt: isDefaultAgent ? resolveHeartbeatPrompt(...) : undefined` (`src/agents/pi-embedded-runner/run/attempt.ts:351-353`)
- Finally creates system prompt:
  - `const appendPrompt = buildEmbeddedSystemPrompt({ ... skillsPrompt, contextFiles, tools, ... })` (`src/agents/pi-embedded-runner/run/attempt.ts:344-369`)
- Generates a system prompt report containing injected file contents and tool list:
  - `const systemPromptReport = buildSystemPromptReport({ ... systemPrompt: appendPrompt, injectedFiles: contextFiles, skillsPrompt, tools })` (`src/agents/pi-embedded-runner/run/attempt.ts:370-391`)

Security relevance:

- `systemPromptReport` appears to serialize prompt structure and injected content. If exposed to untrusted users (e.g. via UI/status endpoints), it may leak sensitive workspace content. Exposure path is UNKNOWN in this pass.

---

## 5) Heartbeat prompt generation (scheduled/automatic LLM polling)

Evidence:

- Heartbeat reads workspace `HEARTBEAT.md` to decide whether to skip:
  - `const heartbeatFileContent = await fs.readFile(heartbeatFilePath, "utf-8");` (`src/infra/heartbeat-runner.ts:513`)
  - `if (isHeartbeatContentEffectivelyEmpty(...) && !isExecEventReason) { ... return skipped ... }` (`src/infra/heartbeat-runner.ts:514-521`)
- Heartbeat constructs a model prompt and calls `getReplyFromConfig`:
  - `const prompt = ... resolveHeartbeatPrompt(...)` (`src/infra/heartbeat-runner.ts:548`)
  - `const ctx = { Body: prompt, ... Provider: ... "heartbeat" ... }` (`src/infra/heartbeat-runner.ts:549-555`)
  - `const replyResult = await getReplyFromConfig(ctx, { isHeartbeat: true }, cfg);` (`src/infra/heartbeat-runner.ts:597`)

Security relevance:

- “Automatic tool invocation” risk: heartbeat may run on a schedule and generate outbound LLM calls without a human actively prompting it.
- Heartbeat prompt text is a high-value prompt-injection surface via workspace `HEARTBEAT.md` contents (included in broader “Project Context” elsewhere, and directly referenced by heartbeat logic).

---

## 6) Extension prompt builders (memory-lancedb)

### 6.1 Memory extraction prompt

Evidence:

- Uses OpenAI Chat Completions with explicit system+user messages:
  - `messages: [ { role: "system", content: systemPrompt }, { role: "user", content: \`CONVERSATION:\\n${conversation}\` } ]` (`extensions/memory-lancedb/src/services/openai-extractor.ts:76-81`)

Security relevance:

- `conversation` is an untrusted text aggregation; prompt-injection can attempt to alter the extractor’s behavior (mitigated partially by “Return ONLY raw JSON” style instruction, but not a security boundary).

### 6.2 URL summarization prompt (includes arbitrary URL and fetched content)

Evidence:

- `systemPrompt = "Summarize the following web content..."` (`extensions/memory-lancedb/src/services/openai-extractor.ts:105-106`)
- User message includes raw URL and fetched content:
  - `{ role: "user", content: \`URL: ${url}\\n\\nCONTENT:\\n${truncated}\` }` (`extensions/memory-lancedb/src/services/openai-extractor.ts:124-126`)

Security relevance:

- This prompt builder is adjacent to a network fetch (`fetch(url)` at `extensions/memory-lancedb/src/services/openai-extractor.ts:110`) and thus overlaps with SSRF/exfil concerns (covered in outbound-calls partial).

### 6.3 Query expansion prompt

Evidence:

- `systemPrompt = \`You are an expert query rewriting engine...\`` (`extensions/memory-lancedb/src/services/openai-expander.ts:44-54`)
- User message contains `HISTORY` and `USER MESSAGE` (`extensions/memory-lancedb/src/services/openai-expander.ts:61-63`)

---

## 7) Key UNKNOWNs for prompt surfaces

1. Whether `systemPromptReport` is accessible to untrusted users (potential sensitive-content leak):
   - `src/agents/pi-embedded-runner/run/attempt.ts:370-391`
2. Exact truncation/delimiting rules in `buildBootstrapContextFiles` (risk of partial injection / broken delimiters):
   - `src/agents/bootstrap-files.ts:55-58` calls it, but implementation not inspected here.
3. Provider-specific message packing and sanitization (OpenAI/Anthropic/Google) outside the snippets above:
   - A large number of provider-related files exist under `src/providers/*`; only limited sampling done here.
