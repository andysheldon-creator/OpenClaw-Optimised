---
name: security-corpus-analyze
description: NLP-driven security corpus analyzer. Provide a natural language description of the file set to analyze, or omit to analyze git diff since last upstream sync. Builds a scan plan, executes targeted analysis, and produces a security report.
disable-model-invocation: true
argument-hint: [corpus-description OR analysis-type]
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(rg *), Bash(ls *), Bash(wc *)
---

# Security Corpus Analyzer

You are an NLP-driven security analyzer for autonomous agent codebases. Your job is to:

1. Interpret the user's natural language description of what to analyze
2. Discover relevant files using ls/grep/rg/git
3. Build a comprehensive scan plan (abbreviated with regex where possible)
4. Execute the plan and produce security analysis

## Input Interpretation

**If arguments provided**: Parse the NLP description to determine:

- File patterns (e.g., "markdown files" → `**/*.md`, "tool implementations" → `src/**/tool*.ts`)
- Scope (e.g., "changed since sync" → use git diff, "all prompt files" → full repo search)
- Analysis type (e.g., "prompt injection" → focus on injection surfaces, "API calls" → focus on outbound)

**If no arguments**:

1. Default to `git diff` scope (changes since last upstream sync)
2. Ask the user what type of analysis they want:
   - (1) **Prompt injection surfaces** - Find all prompt-related content and injection risks
   - (2) **Outbound call traces** - Trace network/subprocess/fs calls to ingress points
   - (3) **Tool permission classification** - Audit READ vs WRITE tool classifications
   - (4) **Ingress/trust boundary audit** - Map all entry points and their auth
   - (5) **Full security audit** - Comprehensive analysis covering all of the above

---

## CRITICAL: Security Patterns to Always Check

Based on previous audits, ALWAYS look for these patterns regardless of corpus:

### HIGH-RISK Patterns

| Pattern            | Regex                                      | Risk            |
| ------------------ | ------------------------------------------ | --------------- |
| Unguarded fetch    | `fetch\([^)]*\)` without pinned dispatcher | SSRF            |
| Shell execution    | `spawn\|exec\|execFile\|execSync`          | RCE             |
| Archive extraction | `tar\|unzip` with external input           | Path traversal  |
| Elevated bypass    | `elevatedMode.*full\|bypassApprovals`      | Approval bypass |
| Tool coupling      | `apply_patch.*exec\|exec.*apply_patch`     | Implicit allow  |
| Config writes      | `writeConfigFile\|writeFile.*config`       | Persistence     |

### PROMPT INJECTION Patterns

| Pattern                | Regex                                         | Risk                 |
| ---------------------- | --------------------------------------------- | -------------------- |
| Raw file injection     | `file\.content\|contextFiles.*push`           | Injection surface    |
| System prompt building | `role.*system\|systemPrompt`                  | Message construction |
| Untrusted in prompt    | `conversation\|userMessage\|body` in messages | Injection point      |
| Missing boundary       | `injected\|Project Context` without policy    | No fence             |
| Automatic execution    | `isHeartbeat\|runHeartbeatOnce\|schedule`     | No human review      |

### INGRESS Patterns

| Pattern            | Regex                                   | Risk            |
| ------------------ | --------------------------------------- | --------------- |
| Public HTTP bind   | `0\.0\.0\.0\|listen.*host`              | Exposure        |
| Webhook handlers   | `webhookCallback\|POST.*webhook`        | Untrusted input |
| Bearer token auth  | `getBearerToken\|Authorization.*Bearer` | Token leak risk |
| Missing auth check | `req\.body\|req\.params` without auth   | Bypass          |

---

## Discovery Phase

### Step 1: Determine Baseline

```bash
# Find last upstream sync commit
git log --oneline --grep="upstream\|sync\|merge" -10
```

Use most recent sync merge as BASELINE. If ambiguous, ask user.

### Step 2: Translate NLP to File Patterns

Based on the corpus description, generate discovery commands:

**For "tool implementations"**:

```bash
rg -l 'export.*Tool|createTool|tool.*execute' src/ --type ts
```

**For "prompt templates"**:

```bash
rg -l 'system.*prompt|role.*system|messages\[' src/ --type ts
```

**For "webhook handlers"**:

```bash
rg -l 'webhookCallback|POST.*webhook|app\.post' src/ extensions/ --type ts
```

**For "SSRF-vulnerable"**:

```bash
rg -l 'fetch\(' src/ extensions/ --type ts | xargs rg -L 'pinnedDispatcher|resolvePinnedHostname'
```

**For "changed files only"**:

```bash
git diff $BASELINE..HEAD --name-only
```

### Step 3: Build Scan Plan

Create an abbreviated plan using regex patterns:

```
SCAN PLAN:
1. src/agents/*.ts (15 files) - Core agent logic
   Patterns to check:
   - system prompt builders
   - tool registration
   - elevated mode handling

2. src/agents/tools/*.ts (12 files) - Tool implementations
   Patterns to check:
   - execute functions
   - outbound calls (fetch, spawn)
   - input validation

3. src/auto-reply/**/*.ts (20 files) - Message handling
   Patterns to check:
   - command routing (/bash, /config)
   - directive parsing (/elevated, /exec)
   - authorization checks

4. src/gateway/*.ts (8 files) - Gateway server
   Patterns to check:
   - HTTP endpoints
   - auth middleware
   - tool invocation

5. extensions/**/*.ts (pattern: **/webhook*.ts, **/extractor*.ts)
   Patterns to check:
   - external API calls
   - URL handling
   - prompt construction

Total files: ~60 | Estimated patterns to check: 25
```

---

## Execution Phase

For each plan item, extract and analyze using the appropriate focus:

### For Prompt-Related Files

Check for:

- [ ] System/developer/user message construction
- [ ] Tool descriptions and schemas
- [ ] Document injection points (contextFiles, bootstrapFiles)
- [ ] Boundary markers between trusted/untrusted content
- [ ] Automatic execution paths (heartbeat, scheduled)

### For Outbound Call Files

Check for:

- [ ] Network calls (fetch, http, WebSocket) - do they use SSRF guards?
- [ ] Subprocess execution (spawn, exec) - what inputs reach them?
- [ ] Filesystem writes (writeFile, rm, mkdir) - path validation?
- [ ] Input sources that reach these calls
- [ ] Gating/permission checks before execution

### For Ingress/Auth Files

Check for:

- [ ] HTTP server bind address (loopback vs public)
- [ ] Authentication middleware (bearer token, secret token)
- [ ] Authorization checks (isAuthorizedSender, allowFrom)
- [ ] Input validation before processing

### For Tool Policy Files

Check for:

- [ ] Tool groupings (group:fs, group:runtime) - mixed READ/WRITE?
- [ ] Implicit coupling (exec → apply_patch)
- [ ] Subagent restrictions (DEFAULT_SUBAGENT_TOOL_DENY)
- [ ] Elevated mode handling

---

## Known File Locations Reference

### Prompt Generation

| Purpose                | File                                                         |
| ---------------------- | ------------------------------------------------------------ |
| Primary system prompt  | `src/agents/system-prompt.ts`                                |
| Embedded runner prompt | `src/agents/pi-embedded-runner/system-prompt.ts`             |
| Workspace file loading | `src/agents/workspace.ts`                                    |
| Bootstrap context      | `src/agents/bootstrap-files.ts`                              |
| Heartbeat prompt       | `src/infra/heartbeat-runner.ts`                              |
| Memory extraction      | `extensions/memory-lancedb/src/services/openai-extractor.ts` |

### Outbound Calls

| Purpose          | File                                   |
| ---------------- | -------------------------------------- |
| exec tool        | `src/agents/bash-tools.exec.ts`        |
| web_fetch tool   | `src/agents/tools/web-fetch.ts`        |
| SSRF guards      | `src/infra/net/ssrf.ts`                |
| Skill installer  | `src/agents/skills-install.ts`         |
| Webhook executor | `src/automations/executors/webhook.ts` |
| Media store      | `src/media/store.ts`                   |

### Ingress Points

| Purpose                | File                                   |
| ---------------------- | -------------------------------------- |
| Telegram webhook       | `src/telegram/webhook.ts`              |
| Telegram bot handlers  | `src/telegram/bot-handlers.ts`         |
| Voice-call webhook     | `extensions/voice-call/src/webhook.ts` |
| Browser control server | `src/browser/server.ts`                |
| Gateway tools invoke   | `src/gateway/tools-invoke-http.ts`     |

### Tool Policy

| Purpose             | File                            |
| ------------------- | ------------------------------- |
| Tool groups/aliases | `src/agents/tool-policy.ts`     |
| Policy resolution   | `src/agents/pi-tools.policy.ts` |
| Tool assembly       | `src/agents/pi-tools.ts`        |
| Config types        | `src/config/types.tools.ts`     |

### Command Handling

| Purpose             | File                                                            |
| ------------------- | --------------------------------------------------------------- |
| /bash command       | `src/auto-reply/reply/commands-bash.ts`, `bash-command.ts`      |
| /config command     | `src/auto-reply/reply/commands-config.ts`, `config-commands.ts` |
| Directive parsing   | `src/auto-reply/reply/get-reply-directives.ts`                  |
| Elevated resolution | `src/auto-reply/reply/reply-elevated.ts`                        |

---

## Output Format

### Summary Section

```
CORPUS ANALYZED: <description>
FILES SCANNED: <count>
BASELINE: <commit> (<date>)
HEAD: <commit> (<date>)
ANALYSIS TYPE: <type>
```

### Findings by Risk

**HIGH RISK** (P0 - Fix immediately)

```
H1: FILE:LINE - Issue description
    Evidence: "short quote"
    Risk: Why this is dangerous
    Recommendation: Specific fix
```

**MEDIUM RISK** (P1 - Fix soon)

```
M1: FILE:LINE - Issue description
    Evidence: "short quote"
    Risk: Why this matters
    Recommendation: Specific fix
```

**LOW RISK** (P2 - Hygiene)

```
L1: FILE:LINE - Issue description
    Recommendation: Suggested improvement
```

### Detailed Tables

**For prompt analysis:**

```
SURFACE_ID | FILE:LINE | TYPE | UNTRUSTED_INPUTS | BOUNDARY | RISK
```

**For outbound analysis:**

```
CALL_ID | FILE:LINE | CATEGORY | TARGET | GATING | READ/WRITE | RISK
```

**For ingress analysis:**

```
INGRESS_ID | FILE:LINE | BIND | AUTH | UNTRUSTED_INPUTS | RISK
```

**For tool classification:**

```
TOOL_NAME | FILE:LINE | GROUP | ACTUAL_CAPABILITY | CLASSIFICATION | MATCH
```

### Unknowns Section

```
UNKNOWN-1: <description>
  Evidence: What was found/not found
  Files to inspect: <list>
  Impact if unresolved: <assessment>

UNKNOWN-2: <description>
  Evidence: What was found/not found
  Files to inspect: <list>
  Impact if unresolved: <assessment>
```

---

## Interactive Mode

If the corpus description is ambiguous or missing, ask clarifying questions:

1. **What files should I analyze?**
   - All changed since upstream sync (git diff)
   - Specific directories (specify path)
   - Pattern match (describe what you're looking for)
   - Full repository scan

2. **What type of security analysis?**
   - Prompt injection surfaces
   - Outbound call traces
   - Tool permission audit
   - Ingress/trust boundary mapping
   - Full comprehensive audit

3. **What's the baseline commit?**
   - Auto-detect from git history
   - Specific commit SHA
   - Specific date range

4. **What risk level to focus on?**
   - All findings
   - HIGH only (fastest)
   - HIGH + MEDIUM

---

## 10-Item Prioritized Checklist Template

After analysis, always produce a prioritized checklist:

```
P0 (Critical - fix before merge):
1) FILE:LINE - Issue - Fix
2) FILE:LINE - Issue - Fix
3) FILE:LINE - Issue - Fix

P1 (High - fix soon):
4) FILE:LINE - Issue - Fix
5) FILE:LINE - Issue - Fix
6) FILE:LINE - Issue - Fix

P2 (Medium - hygiene):
7) FILE:LINE - Issue - Fix
8) FILE:LINE - Issue - Fix
9) FILE:LINE - Issue - Fix
10) FILE:LINE - Issue - Fix
```
