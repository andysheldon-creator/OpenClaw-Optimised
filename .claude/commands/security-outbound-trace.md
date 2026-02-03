---
name: security-outbound-trace
description: Trace all outbound call sites (network, subprocess, filesystem writes) back to ingress points. Flags paths from untrusted input to write-capable operations without strong gating. Use for upstream sync security audits.
disable-model-invocation: true
argument-hint: [baseline-commit]
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(rg *)
---

# Security Audit: Outbound Call Trace

You are performing a security audit focused on **unexpected invocation paths** from untrusted input to sensitive outbound operations in an autonomous agent codebase.

## Baseline

- BASELINE commit: $ARGUMENTS (if not provided, infer from recent merge commit with "upstream" or "sync" in message)
- HEAD: current commit
- Run `git log --oneline --grep="upstream\|sync" -5` to find baseline if needed

## Threat Model

Assume an adversary can:

- Send untrusted content into inbound channels (chat messages, webhooks, HTTP endpoints, CLI args, env vars, config files)
- Attempt prompt injection to cause tool invocation
- Attempt SSRF / exfiltration via outbound HTTP calls
- Attempt filesystem writes, command execution, or privilege escalation via tool APIs
- Attempt to trigger automatic background behaviors (heartbeats, retries, watchers, scheduled tasks)

---

## CRITICAL: Known High-Risk Patterns from Previous Audits

### SSRF-Vulnerable fetch() Calls (NO SSRF GUARDS)

These locations perform `fetch()` on user-influenced URLs WITHOUT the pinned dispatcher used by `web_fetch`:

| Location                                                         | Risk | What to Check                                     |
| ---------------------------------------------------------------- | ---- | ------------------------------------------------- |
| `src/automations/executors/webhook.ts:219`                       | HIGH | `fetch(config.url, ...)` - automation webhook URL |
| `extensions/memory-lancedb/src/services/openai-extractor.ts:110` | HIGH | `fetch(url)` - URL summarization                  |
| `src/agents/skills-install.ts:182`                               | HIGH | `fetch(url, ...)` - skill archive download        |

**Compare to safe pattern**: `src/agents/tools/web-fetch.ts:209-217` uses `resolvePinnedHostname()` + `createPinnedDispatcher()` from `src/infra/net/ssrf.ts`

### RCE Paths (Chat → Shell Execution)

| Path               | Key Files                                                                                     | Gating                                                               |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/bash` command    | `src/auto-reply/reply/commands-bash.ts:10-19`, `src/auto-reply/reply/bash-command.ts:218-243` | `isAuthorizedSender` + `commands.bash === true` + elevated allowlist |
| `!` prefix         | Same as above                                                                                 | Same gating                                                          |
| `exec` tool direct | `src/agents/bash-tools.exec.ts:826-949`                                                       | Tool policy + approvals (UNLESS `elevated === "full"`)               |

**CRITICAL CHECK**: `src/agents/bash-tools.exec.ts:940-949` - when `elevatedMode === "full"`, approvals are BYPASSED:

```typescript
if (elevatedRequested && elevatedMode === "full") {
  security = "full";
}
const bypassApprovals = elevatedRequested && elevatedMode === "full";
if (bypassApprovals) {
  ask = "off";
}
```

### Gateway Universal Tool Runner

| Endpoint             | File                                       | Risk                                         |
| -------------------- | ------------------------------------------ | -------------------------------------------- |
| `POST /tools/invoke` | `src/gateway/tools-invoke-http.ts:108-314` | Bearer token auth → execute ANY allowed tool |

Check: Token extraction at `:118`, auth at `:119-128`, tool execution at `:313-314`

### Supply Chain / Archive Extraction

| Location                               | Risk                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/agents/skills-install.ts:212-223` | Downloads arbitrary URL, extracts via `tar`/`unzip` - zip-slip/path traversal possible |

Check for post-extraction path validation (likely MISSING).

### Implicit Tool Coupling

| Location                              | Issue                                           |
| ------------------------------------- | ----------------------------------------------- |
| `src/agents/pi-tools.policy.ts:72-75` | Allowing `exec` IMPLICITLY allows `apply_patch` |

```typescript
if (normalized === "apply_patch" && matchesAny("exec", allow)) {
  return true;
}
```

---

## Discovery Phase

### Step 1: Find ALL fetch() calls in changed files

```bash
git diff $BASELINE..HEAD --name-only | xargs rg -n 'fetch\(' 2>/dev/null | grep -v '\.test\.'
```

For each hit, check if it uses SSRF guards (pinned dispatcher, allowlist, fixed host).

### Step 2: Find ALL subprocess execution

```bash
rg -n '(spawn|exec|execFile|execSync|spawnSync|child_process|Bun\.\$)' src/ extensions/ --type ts | grep -v '\.test\.'
```

Key patterns:

- `runCommandWithTimeout(["tar"` / `["unzip"` - archive extraction
- `spawn("tailscale"` / `spawn("ngrok"` - tunnel creation
- `execTool.execute(` - tool-based exec

### Step 3: Find ALL filesystem writes

```bash
rg -n '(writeFile|appendFile|createWriteStream|fs\.rename|fs\.rm|fs\.mkdir|fs\.copyFile)' src/ extensions/ --type ts | grep -v '\.test\.'
```

Key sinks:

- `src/media/store.ts:132,207` - media saves
- `src/hooks/install.ts:172,179-180` - hooks install (rename/rm)
- `src/config/write.ts` - config writes
- `src/agents/skills-install.ts:187` - skill archive writes

### Step 4: Find tool execution paths

```bash
rg -n '\.execute\(|tool\.invoke|toolRunner|createExecTool' src/ --type ts | grep -v '\.test\.'
```

---

## Trace Phase

For EACH outbound call site that is write-capable or network-capable:

1. **Identify the call site**: file:line, function name, what it does
2. **Trace backwards** through callers to find:
   - Ingress points (HTTP handlers, webhook receivers, message handlers, CLI arg parsing)
   - Gating checks (auth, allowlists, approval prompts, elevated mode checks)
   - Tool registration paths (where LLM can invoke)
3. **Document the chain** as an explicit path

### Path Trace Format

```
PATH-ID: <descriptive name>
RISK: HIGH/MEDIUM/LOW
1) Ingress: <channel/http/cli> at file:line (untrusted input: message/body/args)
2) Router/handler: file:line (what routing logic)
3) Gating: file:line (what checks exist, or NONE)
4) Agent/prompt builder: file:line (if applicable)
5) Tool selection/execution: file:line
6) Outbound action: file:line (what happens)
NOTES: <any bypass conditions, missing gates, etc.>
```

---

## Known Invocation Paths to Verify

### PATH-1: Telegram webhook → message → auto-reply → agent → tools

```
1) Ingress: POST to webhook path at src/telegram/webhook.ts:60-70
2) Channel listener: bot.on("message") at src/telegram/bot-handlers.ts:477
3) Group policy gating: src/telegram/bot-handlers.ts:537-565
4) Auto-reply routing: TRACE NEEDED to src/auto-reply/*
5) Tool execution: src/agents/pi-embedded-runner/run/attempt.ts:207-240
```

### PATH-2: Chat `/bash` → exec → host shell (RCE)

```
1) Ingress: chat message with /bash or ! prefix
2) Command router: src/auto-reply/reply/commands-bash.ts:10-14
3) Auth gate: isAuthorizedSender at :16-19
4) Feature gate: commands.bash === true at bash-command.ts:218-222
5) Elevated gate: at bash-command.ts:231-243
6) Outbound: execTool.execute() at bash-command.ts:375-381
```

### PATH-3: Chat `/config set` → disk write

```
1) Ingress: chat message with /config
2) Parser: src/auto-reply/reply/config-commands.ts:9-70
3) Auth gate: isAuthorizedSender at commands-config.ts:33-38
4) Feature gate: commands.config === true at :39-46
5) Channel write gate: resolveChannelConfigWrites at :54-73
6) Validation: validateConfigObjectWithPlugins at :127-136
7) Outbound: writeConfigFile at :137-141
```

### PATH-4: Heartbeat schedule → automatic LLM call

```
1) Trigger: runHeartbeatOnce() at src/infra/heartbeat-runner.ts:476-499
2) Reads HEARTBEAT.md at :513
3) Prompt construction at :548-555
4) Outbound: getReplyFromConfig() at :597
NOTE: Automatic, no interactive human review
```

### PATH-5: Gateway /tools/invoke → tool execution

```
1) Ingress: POST /tools/invoke at src/gateway/tools-invoke-http.ts:108-115
2) Auth: Bearer token + authorizeGatewayConnect at :118-128
3) Tool filtering: filterToolsByPolicy at :273-296
4) Outbound: tool.execute() at :313-314
NOTE: If token leaks, RCE possible
```

### PATH-6: Automation webhook → arbitrary URL fetch (SSRF)

```
1) Trigger: automation executor (trigger path UNKNOWN)
2) Outbound: fetch(config.url) at src/automations/executors/webhook.ts:219
NOTE: NO SSRF guards visible
```

### PATH-7: Inline directives → mode changes

```
1) Parser: parseInlineDirectives at src/auto-reply/reply/get-reply-directives.ts:191-194
2) /elevated directive: can toggle elevated mode
3) /exec directive: can influence exec behavior
4) Group mention gating: at :203-232 (strips if not mentioned)
NOTE: "Hidden triggers" - DMs higher risk
```

---

## Checklist: What to Verify for Each Outbound

- [ ] Is there auth/authorization? (who can trigger this)
- [ ] Is there input validation? (what values are accepted)
- [ ] Is there SSRF protection? (for network calls)
- [ ] Is there path traversal protection? (for file writes)
- [ ] Are there approval prompts? (for destructive actions)
- [ ] Can elevated mode bypass approvals?
- [ ] Can tool policy coupling grant unintended access?
- [ ] Is the gating consistent across all channels?

---

## Output Format

### Summary Table

```
OUTBOUND_ID | FILE:LINE | CATEGORY | TARGET | INPUT_SOURCES | GATING | READ/WRITE | RISK
```

Categories: `net` (network), `fs` (filesystem), `proc` (subprocess), `tool` (tool abstraction)

### Detailed Path Traces

For each HIGH and MEDIUM risk item, provide full path trace in the format above.

### Risk Rating

- **HIGH**: untrusted input → tool/network/fs write/subprocess without strong gating, or clear exfil path, or approval bypass possible
- **MEDIUM**: gating exists but is weak/partial, or write-like behavior behind a "read" label, or implicit coupling
- **LOW**: best-practice issues with minimal exploitability

---

## Prioritized Findings Format

```
P0 (Fix immediately):
1) FILE:LINE - Issue - Recommendation

P1 (Fix soon):
4) FILE:LINE - Issue - Recommendation

P2 (Hygiene):
7) FILE:LINE - Issue - Recommendation
```
