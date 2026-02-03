# Partial Security Audit: Tool Policy, Gating, and READ vs WRITE Classification (Best-effort)

Date: 2026-02-02

Scope of this partial:

- Identify how tools are enabled/disabled and filtered (policy layers).
- Best-effort READ vs WRITE classification based on tool behavior + policy groupings.
- Flag likely misclassifications or over-broad allow/deny semantics.

Important constraint:

- I did not find a single canonical “READ vs WRITE” flag in tool definitions/config. Classification here is inferred from tool behavior and grouping.

---

## 1) Tool policy model (allow/deny + profiles + groups)

### 1.1 Tool name normalization + groups

Evidence:

- Tool aliases:
  - `bash: "exec"` and `"apply-patch": "apply_patch"` (`src/agents/tool-policy.ts:8-11`)
- Tool groups (used for allow/deny expansion):
  - `group:fs` includes `read`, `write`, `edit`, `apply_patch` (`src/agents/tool-policy.ts:18-19`)
  - `group:runtime` includes `exec`, `process` (`src/agents/tool-policy.ts:20-21`)
  - `group:web` includes `web_search`, `web_fetch` (`src/agents/tool-policy.ts:16-17`)
  - `group:automation` includes `cron`, `gateway` (`src/agents/tool-policy.ts:32-33`)
- Group expansion logic:
  - `expandToolGroups(list)` expands `group:*` entries into tool names (`src/agents/tool-policy.ts:106-118`)

Implication:

- The grouping is a de facto capability taxonomy. It mixes READ and WRITE tools in the same group (notably `group:fs` includes both read and write-capable tools).

### 1.2 Tool profiles (higher-level presets)

Evidence:

- Tool profiles defined:
  - `minimal`, `coding`, `messaging`, `full` (`src/agents/tool-policy.ts:59-76`)
- Example:
  - `coding.allow` includes `group:fs` and `group:runtime` and `group:sessions` and `group:memory` (`src/agents/tool-policy.ts:63-65`)

Implication:

- Profile “coding” implicitly enables write/exec by including `group:fs` (write/edit/apply_patch) and `group:runtime` (exec/process).

### 1.3 Policy resolution layers (global, per-provider, per-agent, per-group, subagent, sandbox)

Evidence:

- Policy data model allows `allow`, `alsoAllow`, `deny`, and `profile` (`src/config/types.tools.ts:141-152`).
- Subagent tool policy defaults deny high-power tools:
  - `DEFAULT_SUBAGENT_TOOL_DENY` includes `gateway`, `agents_list`, `cron`, memory tools, and session tools (`src/agents/pi-tools.policy.ts:79-96`)
  - `resolveSubagentToolPolicy` merges defaults with config overrides (`src/agents/pi-tools.policy.ts:98-106`)
- Group tool policy is resolved via group context:
  - `resolveGroupToolPolicy` exists and is invoked by tool assembly (seen earlier in `src/agents/pi-tools.ts`), and in gateway invoke path (see below).
- Effective policy resolution returns multiple policy components:
  - `resolveEffectiveToolPolicy` computes global/agent/provider policies + profiles (`src/agents/pi-tools.policy.ts:230-260`)

Gateway `/tools/invoke` applies policy filtering in order:

- Builds tools and resolves plugin groups, then applies `filterToolsByPolicy` repeatedly (`src/gateway/tools-invoke-http.ts:273-296`).

---

## 2) A notable policy quirk: allowing `exec` implicitly allows `apply_patch`

Evidence:

- In policy matcher:
  - `if (normalized === "apply_patch" && matchesAny("exec", allow)) { return true; }` (`src/agents/pi-tools.policy.ts:72-75`)

Risk:

- This is an implicit privilege coupling: a policy that allowlists `exec` but not `apply_patch` still permits `apply_patch`.
- If an operator intended to allow `exec` for a narrow purpose but forbid file writes, this coupling can violate that intent.

Assessment:

- **POSSIBLY MISCLASSIFIED / OVER-PERMISSIVE** design choice. It may be deliberate (“if you can exec you can patch”), but it is a security-relevant escalation surface.

Recommended follow-up:

- Confirm the rationale and whether it should be conditional (e.g., only in some runtimes), or removed in favor of explicit allowlisting.

---

## 3) Best-effort READ vs WRITE classification (inferred)

### 3.1 Tools that are clearly WRITE-capable (high impact)

Based on group membership + known semantics:

- `exec` (subprocess / remote exec): in `group:runtime` (`src/agents/tool-policy.ts:20-21`)
- `write`, `edit`, `apply_patch`: in `group:fs` (`src/agents/tool-policy.ts:18-19`)
- `gateway` (restart/apply config/run updates): in `group:automation` (`src/agents/tool-policy.ts:32-33`) and described as admin-level in system prompt elsewhere.
- `cron` (scheduling): in `group:automation` (`src/agents/tool-policy.ts:32-33`)
- `message` (sends): in `group:messaging` (`src/agents/tool-policy.ts:34`)

### 3.2 Tools that are primarily READ-capable

- `read` (filesystem read): in `group:fs` (`src/agents/tool-policy.ts:18-19`)
- `web_search`, `web_fetch`: in `group:web` (`src/agents/tool-policy.ts:16-17`)
- `sessions_list/history` are data access (but can leak info; still side-effect-free in many designs).

### 3.3 Ambiguous / mixed-impact tools

- `browser`: can trigger downloads and file writes depending on how it is wired; grouped under `group:ui` (`src/agents/tool-policy.ts:30`) which is not purely read-only.
- `nodes`: can likely execute commands or capture camera/screen depending on implementation; grouped under `group:nodes` (`src/agents/tool-policy.ts:36`).

---

## 4) Explicit config knobs that gate high-power tools (selected)

Evidence:

- Elevated mode:
  - `tools.elevated.allowFrom` is a per-provider allowlist (`src/config/types.tools.ts:486-492`)
- Exec tool defaults:
  - `tools.exec.host/security/ask` (`src/config/types.tools.ts:222-229`)
- Cross-context messaging:
  - `tools.message.crossContext.allowAcrossProviders` (default false per schema docs, see `src/config/schema.ts:430-437` and config typing at `src/config/types.tools.ts:460-474`)
- Coding-task tool wrapper (Claude Agent SDK):
  - Enabled is opt-in (`src/config/types.tools.ts:165`)
  - Tool preset `readonly` vs `claude_code` (`src/config/types.tools.ts:176`)
  - `buildCodingTaskSdkOptions` defaults toolPreset to `"readonly"` (`src/agents/claude-agent-sdk/coding-task-options.ts:48-54`)

---

## 5) Unknowns / needs human review (policy/classification)

1. Canonical “READ vs WRITE” classification metadata:
   - NOT FOUND in the inspected config/types/policy files; classification appears implicit via tool names and groups.
2. Whether policy is enforced uniformly across all tool entrypoints:
   - Gateway `/tools/invoke` applies policy filtering (`src/gateway/tools-invoke-http.ts:273-296`), but other runners may build tools differently; confirm there are no bypass paths.
3. Whether plugin tools declare capabilities (read/write) in metadata:
   - Plugin tool meta is referenced via `getPluginToolMeta` in other files, but classification fields were not inspected in this partial.
