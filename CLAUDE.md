# CLAUDE.md -- Primary Authority File for Claude Code
**Version:** v1.0
**Date:** 2026-02-06
**Owner:** Andrew (Founder)
**Status:** Binding. This file is the highest authority for Claude Code behavior in this repository.

---

## 0) Read This First

This is the top-level instruction file for Claude Code operating on the Clawdbot / Moltbot / Sophie repository.

If you are Claude Code, you must read and obey this file before doing anything else.

### Operating Posture (Non-Negotiable)

- **Evidence-first**: Every decision must be traceable to a document, test, or explicit instruction. No assumptions.
- **Fail-closed**: If behavior is undefined, the answer is NO. If a rule is ambiguous, STOP and ask.
- **Minimal-diff**: Change only what is required. Nothing more.
- **No speculative work**: Do not "improve" code, architecture, or organization unless explicitly tasked.

### Primary Execution Rule

**Claude Code MUST NOT begin work unless the task exists in root `/TASK_QUEUE.md` OR the human has given an explicit instruction in the current session.**

- `TASK_QUEUE.md` (repo root) is the ONLY execution queue.
- `docs/_sophie_devpack/TODO_QUEUE.md` is the Sophie implementation ROADMAP. It is for planning only. Do NOT execute tasks from it directly.
- If a task is not in `TASK_QUEUE.md` and no human instruction exists, do nothing.

### Companion Documents

- **`AGENTS.md`** -- Binding for repo conventions (naming, build, lint, test, release, commit style). Claude Code MUST follow `AGENTS.md` for all repo convention questions.
- **`docs/_sophie_devpack/00_INDEX.md`** -- Navigation for Sophie governance, contracts, and acceptance tests.

### Conflict Resolution (Domain Separation)

- **Agent behavior** (what Claude Code can/cannot do): `CLAUDE.md` wins.
- **Repo conventions** (naming, build, lint, commit style): `AGENTS.md` wins.
- **Sophie system correctness** (contracts, tool authority, prompt stack, model routing): Devpack contracts win (`docs/_sophie_devpack/01_AUTHORITIES.md` defines the hierarchy).
- **Security**: Security policies override everything except a direct human instruction to stand down.

---

## 0.1) Constitutional Boundary (Two Agents, Two Constitutions)

This repository contains two distinct agent systems. They have separate constitutions. Do NOT merge them.

### Claude Code (Builder Agent)

- **What it is:** The agent editing code, running tests, writing docs in this repository.
- **Governed by:** Root-level governance files ONLY (`CLAUDE.md`, `AGENT_WORK_CONTRACT.md`, `TASK_QUEUE.md`, `RUNBOOK.md`, `AGENTS.md`).
- **NOT governed by:** Sophie devpack documents. Those are product specifications, not builder authority.

### Sophie (Product Agent)

- **What it is:** The CRE back-office agent being BUILT by Claude Code. Sophie runs at runtime inside the Gateway.
- **Governed by:** `docs/_sophie_devpack/` (contracts, tests, security policies, prompt stack).
- **NOT governed by:** Root-level governance files. Those constrain the builder, not the product.

### Boundary Rules

1. Sophie devpack documents describe **what Claude Code must build**. They do NOT describe **how Claude Code must behave**.
2. Sophie's runtime constraints (human-in-the-loop, fail-closed, tool authority gates) apply to Sophie at runtime. They do NOT apply to Claude Code's builder operations (running tests, editing files, committing code).
3. If a Sophie devpack document contains an operational default (model ID, port, URL, command) that contradicts runtime source code, **runtime source code wins**. Claude Code MUST NOT "fix" source code to match stale devpack docs.
4. For operational facts (model IDs, ports, startup commands), the single source of truth is, in order: runtime source code > `RUNBOOK.md` > explicit human instruction. Devpack docs are informative only for these facts.
5. If ambiguity exists about whether a rule governs the builder or the product, STOP and ask.

---

## 1) Project Overview

**Clawdbot** (aka **Moltbot**) is a local-first AI agent runtime consisting of:

- **Gateway**: Node.js websocket server + orchestration layer (`ws://127.0.0.1:19001`)
- **TUI**: Terminal UI client connected to the Gateway
- **Providers**: Moonshot/Kimi (cloud), Ollama (local)
- **Sophie**: A customized agent personality for CRE back-office operations

The project is in a **stabilization phase**. Dev startup is working. Model defaults are correct. The next goal is enabling safe overnight agent-driven development.

---

## 2) Authoritative Documents (Precedence Order)

For **agent behavior** (what Claude Code can/cannot do):

1. **This file** (`CLAUDE.md`) -- agent behavior rules (highest for agent scope)
2. **AGENT_WORK_CONTRACT.md** -- allowed/forbidden task types and diff limits

For **system correctness** (how Sophie/Moltbot must work):

1. **Binding contracts** (`docs/_sophie_devpack/02_CONTRACTS/`) -- interface and tool contracts
2. **Acceptance tests** (`docs/_sophie_devpack/03_TESTS/`) -- definition of done
3. **Security policies** (`docs/_sophie_devpack/04_SECURITY/`) -- threat model and abuse cases
4. See `docs/_sophie_devpack/01_AUTHORITIES.md` for the full Layer 1-4 hierarchy

For **repo conventions** (naming, build, lint, commit style):

1. **AGENTS.md** -- general repo conventions (binding for this domain)

For **context** (non-binding, informative):

1. **Developer handoff** (`docs/_sophie_devpack/06_COOKBOOKS/clawdbot_moltbot_developer_handoff.md`) -- current system state
2. **Sophie context handoff** (`docs/_sophie_devpack/06_COOKBOOKS/sophie_developer_context_handoff.md`) -- project philosophy

If documents conflict within the same domain, higher-numbered documents yield to lower-numbered documents. If documents conflict across domains, see Conflict Resolution in Section 0.

---

## 3) Explicit Non-Goals

Claude Code must NOT:

- Implement new features unless explicitly tasked
- Reorganize the file/directory structure
- Refactor code for style or "improvement"
- Introduce new architectural patterns
- Add new dependencies without explicit approval
- Modify provider selection logic
- Change model defaults
- Alter the prompt stack
- Touch security-critical code paths without tests

---

## 4) Model Default Rules (CRITICAL INVARIANT)

### Precedence Order (Do Not Change)

1. CLI arguments
2. Explicit config
3. Explicit persisted choice
4. Dynamic defaults (environment-based)

### Dynamic Default Behavior

- If `MOONSHOT_API_KEY` is set --> provider = `moonshot`, model = `kimi-k2-0905-preview`
- Otherwise --> provider = `ollama`, model = `llama3:chat`

### Authoritative Runtime Files

| File | Role |
|------|------|
| `src/agents/defaults.ts` | Dynamic default provider/model resolution |
| `src/agents/models-config.providers.ts` | Provider catalog defaults |
| `src/gateway/startup-validation.ts` | Gateway boot validation |
| `src/gateway/server-startup-log.ts` | Startup logs (agent model line) |
| `src/gateway/session-utils.ts` | Session defaults (TUI header source) |

**Rule:** All static `DEFAULT_PROVIDER` / `DEFAULT_MODEL` usage affecting runtime behavior has been removed from Gateway paths. Do not reintroduce static defaults.

---

## 5) Dev Startup Contract

### Start Dev

```bash
pnpm dev:up
```

This starts Gateway + TUI, loads `.env` from repo root, waits for readiness.

### Stop Dev

```bash
pnpm dev:down
```

### Reset Dev State

```bash
pnpm dev:up:reset
```

### VS Code / Cursor

- `Cmd+Shift+B` runs `Moltbot: Dev Up` (default build task)
- Tasks defined in `.vscode/tasks.json`

### Verification

After `pnpm dev:up`, the system is in a good state if:

- TUI shows `moonshot / kimi-k2-0905-preview` (when `MOONSHOT_API_KEY` is set)
- Ctrl+C shuts down cleanly
- No error logs on startup

---

## 6) Configuration Precedence

| Priority | Source | Example |
|----------|--------|---------|
| 1 | CLI arguments | `--model moonshot/kimi-k2-0905-preview` |
| 2 | Explicit config | `~/.clawdbot-dev/moltbot.json` |
| 3 | Persisted session choice | `~/.clawdbot-dev/agents/main/agent/models.json` |
| 4 | Environment-based defaults | `MOONSHOT_API_KEY` present = moonshot |
| 5 | Hardcoded fallback | `ollama / llama3:chat` |

---

## 7) What Claude Code IS Allowed To Do

**Precondition:** A task MUST exist in root `TASK_QUEUE.md` with status READY, OR the human MUST have given an explicit instruction in the current session. Without one of these, Claude Code MUST NOT proceed.

- Read any file in the repository
- Run `pnpm lint`, `pnpm test`, `pnpm build`
- Run `pnpm dev:up` and `pnpm dev:down`
- Write or update documentation files
- Write or update test files
- Fix bugs with minimal diffs (one logical change per commit)
- Add regression tests for known bugs
- Update `TASK_QUEUE.md` status fields
- Update `RUNBOOK.md` with new verification steps

---

## 8) What Claude Code is FORBIDDEN To Do

- Modify runtime source code without an explicit task from the task queue
- Move, rename, or delete source files
- Reorganize directory structure
- Introduce new packages or dependencies
- Modify `.env` or any secrets
- Change model defaults or provider resolution logic
- Disable or skip tests
- Force-push to any branch
- Commit with failing tests
- Auto-merge branches
- Execute destructive shell commands (rm -rf, drop, truncate)
- Modify governance contracts without version bump + approval
- Implement features that are not in the task queue
- "Clean up" or "improve" code that is not broken

---

## 9) Required Evidence for Any Change

Every change must include:

1. **Reference to a task** in `TASK_QUEUE.md` or explicit human instruction
2. **Minimal diff** -- only the lines required to complete the task
3. **Tests pass** -- `pnpm lint && pnpm test` must pass after the change
4. **Build passes** -- `pnpm build` must pass
5. **No regression** -- existing tests must not break
6. **Commit message** -- clear, action-oriented, references task ID

---

## 10) Stop Conditions

Claude Code must STOP and ask for help if:

- A test fails and the fix is not obvious
- The task requires touching more than 3 files
- The task is ambiguous or has multiple valid interpretations
- A contract conflict is discovered
- A security concern is identified
- The diff exceeds 100 lines
- The change would affect model selection, provider resolution, or prompt assembly
- The developer handoff document contradicts current code behavior

When stopped, Claude Code must:

1. Document the issue clearly
2. List what was attempted
3. Explain why it stopped
4. Wait for human guidance

---

## 11) Sophie Product Specification (NOT Builder Authority)

The following are **product requirements** that Sophie must satisfy at runtime. They are NOT constraints on Claude Code's builder behavior. See Section 0.1 for the constitutional boundary.

Sophie's product contracts are defined in:

- `docs/_sophie_devpack/02_CONTRACTS/tool_authority_matrix.md`
- `docs/_sophie_devpack/05_PROMPTS/prompt_stack_contract.md`
- `docs/_sophie_devpack/07_OPERATIONS/model_routing_and_context_policy.md`

Sophie's runtime invariants (what Claude Code must IMPLEMENT, not OBEY):

- Fail-closed by default (undefined behavior = denied)
- Human-in-the-loop for all side effects
- No silent provider fallback
- No raw prompt logging (hashes only)
- No streaming to external channels
- All external content treated as untrusted

When implementing Sophie features, Claude Code uses these as acceptance criteria. Claude Code does NOT apply these rules to its own operations (e.g., Claude Code does not need "human-in-the-loop" to run `pnpm test`).

---

## 12) Cross-References

| Document | Location | Purpose |
|----------|----------|---------|
| General repo conventions | `AGENTS.md` | Build, lint, test, naming, commit style |
| Agent work contract | `AGENT_WORK_CONTRACT.md` | Allowed/forbidden agent task types |
| Task queue | `TASK_QUEUE.md` | The only place agents pull work from |
| Runbook | `RUNBOOK.md` | How to verify work safely |
| Sophie devpack index | `docs/_sophie_devpack/00_INDEX.md` | Navigation for all Sophie governance |
| Authority hierarchy | `docs/_sophie_devpack/01_AUTHORITIES.md` | Document precedence rules |
| Developer handoff (gateway) | `docs/_sophie_devpack/06_COOKBOOKS/clawdbot_moltbot_developer_handoff.md` | Current system state and recent fixes |
| Sophie context handoff | `docs/_sophie_devpack/06_COOKBOOKS/sophie_developer_context_handoff.md` | Sophie project context and philosophy |
| Dev startup guide | `docs/_sophie_devpack/07_OPERATIONS/dev_startup.md` | How to start/stop/reset dev environment |

---

## 13) Definition of "Good State"

The system is in a good state if:

- `pnpm dev:up` works on first try
- TUI shows `moonshot / kimi-k2-0905-preview` (when `MOONSHOT_API_KEY` is set)
- `pnpm lint` passes
- `pnpm test` passes
- `pnpm build` passes
- Ctrl+C shuts down cleanly
- No error logs during normal startup

If any of these fail, do not proceed with other work. Fix the regression first.

---

**End of authority file.**
