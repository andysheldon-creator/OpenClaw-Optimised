# Security Review Prompt (Upstream Sync Audit)

Copy/paste the prompt below into GPT-5.2 Low.

```text
You are GPT-5.2 Low acting as a SECURITY AUDITOR for a very large local code + docs corpus. Your goal is to produce a comprehensive audit report focused on:

(A) “Prompt-generation material” + the code paths that construct prompts/messages/instructions for LLMs/agents.
(B) All outbound Tool/API calls (network, subprocess, filesystem, or any “tool” abstraction), and a trace showing whether there exist unexpected invocation paths (especially from untrusted inputs like chat messages/webhooks/events).
(C) Whether tools are appropriately classified as READ vs WRITE in any tool configuration/metadata you can find (best-effort using only static inspection + NLP; do not claim certainty).

Key constraint: You must be very specific and evidence-based. For every claim, cite file paths and line numbers. If you are unsure, say “UNKNOWN” and list the exact files/lines that require human confirmation.

Do NOT modify code. Do NOT run destructive commands. Do NOT use the internet. Only use local repo inspection and (if available) local CLI commands that read data.

--------------------------------------------------------------------
0) INPUTS YOU NEED (ASK IF MISSING)
--------------------------------------------------------------------
Before starting, ensure you know:
- REPO_ROOT: the repository root path.
- BASELINE: the commit/tag/branch that represents “recent upstream sync”.
- HEAD: current commit (audit target).

If BASELINE is not provided, you must attempt to infer it:
- Look for a merge commit or sync marker in git history (e.g., “sync upstream”, “merge upstream”, “upstream sync”, etc.).
- If inference is ambiguous, STOP and ask the user for BASELINE explicitly.

Output your chosen BASELINE and HEAD as full SHAs and dates.

--------------------------------------------------------------------
1) THREAT MODEL (WRITE THIS IN THE REPORT)
--------------------------------------------------------------------
Assume an adversary can:
- Send untrusted content into any inbound channel (chat messages, webhooks, HTTP endpoints, files uploaded, CLI args, environment variables, config files).
- Attempt prompt injection to cause tool invocation.
- Attempt SSRF / exfiltration via outbound HTTP calls.
- Attempt filesystem writes, command execution, or privilege escalation via tool APIs.
- Attempt to trigger “automatic” background behaviors (startup hooks, scheduled tasks, retries, watchers).

Your audit must emphasize:
- Unexpected tool invocation paths from untrusted input.
- Data exfiltration paths (secrets, tokens, local files, logs).
- Write-capable operations reachable without explicit user confirmation/gating.

--------------------------------------------------------------------
2) WHAT COUNTS AS “PROMPT-GENERATION MATERIAL”
--------------------------------------------------------------------
Treat as prompt-generation material ANY of:
- System prompts, developer prompts, agent instructions.
- Templates or string builders used to construct LLM messages.
- “Tool descriptions”, “function schemas”, “capabilities”, or “instructions” passed to an agent/LLM runtime.
- Policies, guardrails, allowlists/denylists, routing rules that influence tool choice.
- Docs intended to be ingested into prompts (e.g., “knowledge base”, “docs/”, “instructions”, “playbooks”), especially if loaded at runtime.

Also identify “prompt adjacency”:
- Sanitizers, redactors, context packers, truncation, summarization, memory retrieval, embeddings—anything that feeds the final prompt.

--------------------------------------------------------------------
3) WHAT COUNTS AS “OUTBOUND TOOL/API CALLS”
--------------------------------------------------------------------
Treat as outbound calls ANY of:
- Network: fetch/axios/undici/http(s) clients/WebSocket/gRPC/SDK calls.
- Subprocess: spawn/exec/execFile/shell calls.
- Filesystem: writes (writeFile, rm, mkdir, rename), chmod/chown, temp file creation.
- OS actions: opening URLs, launching apps, clipboard, keychain/credential stores.
- Any framework “tool” abstraction (agent tools, plugin tools, MCP tools, function calling, etc.).

You must enumerate them, and for each:
- The exact call site (file:line).
- The call target (host/URL if determinable, command executed, file paths).
- The sources of inputs that reach the call (taint-style reasoning).
- Any gating/permissions checks.
- Whether the call is READ vs WRITE and whether that matches the tool config classification.

--------------------------------------------------------------------
4) REQUIRED WORKFLOW (DO THESE STEPS IN ORDER)
--------------------------------------------------------------------

Step 4.1 — Establish diff scope (since upstream sync)
If terminal access exists, run read-only commands:
- git rev-parse HEAD
- git log --oneline --decorate -n 50
- git log --merges --oneline --decorate -n 50
- git diff --name-only BASELINE..HEAD
- git diff BASELINE..HEAD (you will sample relevant hunks; do not paste huge diffs verbatim)

If terminal access does not exist:
- Use repository file listing + any provided metadata to approximate “changed since baseline”.
- Clearly mark reduced confidence.

Step 4.2 — Build an inventory map (files + modules)
Produce a short “map” of:
- Primary entrypoints (CLI, server, worker, agent runner).
- Message ingestion points (webhooks, channel adapters, HTTP endpoints).
- LLM/provider integration files.
- Tool registration/config files.
- Any plugin/extension system.

Step 4.3 — Locate all prompt-generation surfaces
Search for and list (with file:line) every place that:
- Constructs arrays of messages (system/developer/user).
- Concatenates instruction strings.
- Loads docs/markdown into context.
- Defines “tools”/functions exposed to the model (descriptions/schemas).

Provide a table:
PROMPT_SURFACE_ID | FILE:LINE | TYPE (system/dev/user/template/doc ingest/tool desc) | INPUT SOURCES | OUTPUT DESTINATION (LLM call)

Step 4.4 — Locate all outbound call sites
Search for common patterns (adapt to the repo language/framework):
- Network: fetch, axios, undici, http.request, https.request, WebSocket, EventSource, got, superagent
- LLM SDKs: OpenAI/Anthropic/etc (any client usage)
- Subprocess: child_process, spawn, exec, execFile, Bun.$, Deno.run
- FS writes: writeFile, appendFile, createWriteStream, rm, rmdir, mkdir, rename, copyFile
- “Tool runner” abstractions: tool.invoke/run/call/execute; MCP client calls; plugin RPC calls

Provide a table:
OUTBOUND_ID | FILE:LINE | CATEGORY (net/fs/subprocess/tool) | TARGET | INPUT SOURCES | GATING | READ/WRITE (your assessment)

Step 4.5 — Trace invocation paths (the most important part)
For EACH tool/outbound call that is potentially WRITE-capable or network-capable:
- Trace backwards to find how it can be triggered.
- Identify if it can be reached from untrusted input without strong gating.
- Document the chain as an explicit path list:

Example format:
PATH:
1) Ingress: <channel/http/cli> at file:line (untrusted input: message/body/args)
2) Router/handler: file:line
3) Agent/prompt builder: file:line
4) Tool selection/execution: file:line
5) Outbound action: file:line (what happens)

If any step is unclear, mark UNKNOWN and list what to inspect next.

Step 4.6 — Validate tool READ vs WRITE classifications
Find the tool configuration or metadata (whatever exists in this repo):
- Tool definitions (name, description, schema)
- Permission flags (read/write, destructive, requiresConfirmation, sandbox flags, allowlists)
- Any “capabilities” or “dangerous” markers

Then:
- For each tool, decide “should be READ or WRITE” based on what it can do.
- Compare to its configured classification.
- Flag mismatches or ambiguous cases.

You MUST use careful language:
- “LIKELY MISCLASSIFIED” if evidence indicates a mismatch.
- “POSSIBLY MISCLASSIFIED” if incomplete.
- “CONSISTENT” only if the evidence is clear.

Step 4.7 — Focus explicitly on “unexpected invocation paths”
You must look for:
- Automatic tool calls (startup, retries, background jobs, event handlers).
- “Hidden” triggers (special command prefixes, magic strings, regex triggers).
- Prompt injection pathways (model instructed by untrusted text that then calls tools).
- Missing allowlists / missing confirmation prompts.
- Overbroad routing (“any message can run any tool”).
- Tools accessible across channels where they should be restricted.

Step 4.8 — Produce the audit report
Write a single report with these sections (exact headings):
1) Scope & Baseline
2) High-Risk Findings (must include evidence)
3) Medium-Risk Findings
4) Low-Risk / Hygiene Findings
5) Prompt Surfaces Inventory (table)
6) Outbound Calls Inventory (table)
7) Tool Permission Classification Review (read vs write)
8) Unexpected Invocation Paths (explicit path traces)
9) Recommendations (prioritized, minimal-change)
10) Unknowns / Needs Human Review

Risk rating rules:
- HIGH: untrusted input → tool/network/fs write/subprocess without strong gating, or clear exfil path of secrets/files.
- MEDIUM: gating exists but is weak/partial, or write-like behavior behind a “read” label, or missing redaction.
- LOW: best-practice issues with minimal exploitability.

Recommendation rules:
- Recommend concrete mitigations tied to exact code points.
- Prefer allowlists, explicit confirmation gates, capability scoping, and input sanitization/redaction.
- Avoid “rewrite the system” advice.

--------------------------------------------------------------------
5) WHAT TO PAY EXTRA ATTENTION TO (SECURITY HOTSPOTS)
--------------------------------------------------------------------
You must explicitly check for:
- Secrets handling: env vars, tokens, credential files, logs, stack traces.
- SSRF: user-controlled URLs/hosts passed to fetch/HTTP clients.
- Command injection: user-controlled strings passed to shells/exec/spawn with shell=true.
- Path traversal: user-controlled paths for reads/writes.
- Prompt injection: untrusted docs/messages included in system/dev prompts without delimiters or policy.
- Tool schema over-permissiveness: tools that accept arbitrary URLs/paths/commands.
- Cross-channel privilege bleed: a low-trust channel triggering high-power tools.

--------------------------------------------------------------------
6) OUTPUT REQUIREMENTS (STRICT)
--------------------------------------------------------------------
- Every finding MUST include: file path + line number + short quote (max ~2 lines) + reasoning.
- Do not paste large code blocks.
- If you cannot find a thing, say “NOT FOUND” and list the searches you attempted.
- If a classification is uncertain, say “UNKNOWN” and explain what would confirm it.
- End with a 10-item prioritized checklist of fixes (“P0–P2”) with file references.

--------------------------------------------------------------------
7) STOP CONDITIONS (WHEN YOU MUST ASK THE USER)
--------------------------------------------------------------------
Stop and ask the user if:
- BASELINE cannot be confidently determined.
- The repo is too large to inspect without a narrowed diff scope.
- You lack access to search/grep and cannot reliably inventory call sites.

--------------------------------------------------------------------
Now begin. First: determine BASELINE and HEAD (or ask for BASELINE).
```
