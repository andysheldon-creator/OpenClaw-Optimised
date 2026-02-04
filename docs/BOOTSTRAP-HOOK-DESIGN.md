# Bootstrap Hook Context Injection — Design Document

> **Status**: FUTURE / PLANNED — Not being implemented now.  
> **Author**: OpenClaw Agent  
> **Date**: 2026-02-04  
> **Related**: `src/agents/bootstrap-hooks.ts`, `src/hooks/internal-hooks.ts`, `src/agents/workspace.ts`

---

## Problem Statement

Currently, bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, etc.) are loaded **statically** from the agent's workspace directory via `loadWorkspaceBootstrapFiles()` in `src/agents/workspace.ts`. While a global MD loader (see below) addresses the simplest case of shared instructions, there remain significant limitations:

1. **No dynamic composition**: Bootstrap content cannot vary based on agent identity, time of day, session type, or other runtime context.
2. **No per-agent overrides with inheritance**: Agents can't inherit a global base and selectively override specific files.
3. **No conditional injection**: There's no way to inject instructions like "it's overnight — work autonomously" or "this is a CI session — minimize tool use".
4. **No programmatic control**: External integrations cannot modify the bootstrap sequence without editing files on disk.

### Current Architecture (Baseline)

```
┌─────────────────────────────────┐
│   loadWorkspaceBootstrapFiles() │
│   (src/agents/workspace.ts)     │
│                                 │
│  1. Read files from workspace/  │
│  2. Read global files (~/.oc/)  │  ← Added by global MD loader
│  3. Merge (global prepended)    │
│  4. Return WorkspaceBootstrapFile[] │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  applyBootstrapHookOverrides()  │
│  (src/agents/bootstrap-hooks.ts)│
│                                 │
│  Fires agent:bootstrap hook     │
│  Handlers can mutate file list  │
│  Returns updated file list      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  filterBootstrapFilesForSession │
│  (subagent allowlist filter)    │
└────────────┬────────────────────┘
             │
             ▼
       Final bootstrap content
       injected into system prompt
```

The `applyBootstrapHookOverrides()` function already exists and fires the `agent:bootstrap` internal hook. However, there are **no bundled handlers** that leverage this hook for dynamic content injection. This design doc proposes a comprehensive system built on top of this existing hook point.

---

## Proposed Architecture

### Overview

The Bootstrap Hook Context Injection system extends the existing `agent:bootstrap` hook to support rich, dynamic bootstrap composition through a series of **composable hook handlers**. These handlers are registered in priority order and can:

- **Add** new bootstrap files (from any source: filesystem, API, database)
- **Remove** files by name
- **Prepend / Append** content to existing files
- **Replace** file content entirely
- **Conditionally** include/exclude files based on runtime context

### Architecture Diagram

```
                    ┌──────────────────────────────┐
                    │      Session Initialization    │
                    │  (session key, agent ID, etc.) │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  loadWorkspaceBootstrapFiles() │
                    │  + Global MD loader merge      │
                    │  → base WorkspaceBootstrapFile[]│
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  applyBootstrapHookOverrides() │
                    │                                │
                    │  Fires: agent:bootstrap         │
                    │  Context:                       │
                    │    - bootstrapFiles[]           │
                    │    - workspaceDir               │
                    │    - agentId                    │
                    │    - sessionKey                 │
                    │    - cfg (OpenClawConfig)       │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │   Hook Handler Pipeline       │
                    │   (priority-ordered)           │
                    │                                │
                    │  ┌────────────────────────┐   │
                    │  │ 1. Global Overrides     │   │
                    │  │    Handler              │   │
                    │  └────────────┬───────────┘   │
                    │               ▼                │
                    │  ┌────────────────────────┐   │
                    │  │ 2. Per-Agent Override    │   │
                    │  │    Handler              │   │
                    │  └────────────┬───────────┘   │
                    │               ▼                │
                    │  ┌────────────────────────┐   │
                    │  │ 3. Time-of-Day          │   │
                    │  │    Context Handler      │   │
                    │  └────────────┬───────────┘   │
                    │               ▼                │
                    │  ┌────────────────────────┐   │
                    │  │ 4. Custom User          │   │
                    │  │    Handlers (plugins)   │   │
                    │  └────────────┬───────────┘   │
                    │               ▼                │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  filterBootstrapFilesForSession│
                    │  (subagent allowlist applied)  │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                         Final system prompt
```

### Data Flow

1. **Base Loading**: `loadWorkspaceBootstrapFiles()` loads workspace + global files (existing behavior after global MD loader implementation).
2. **Hook Trigger**: `applyBootstrapHookOverrides()` fires the `agent:bootstrap` event with full context.
3. **Handler Pipeline**: Each registered handler receives the `AgentBootstrapHookContext` and can mutate `bootstrapFiles[]`.
4. **Subagent Filter**: `filterBootstrapFilesForSession()` applies the allowlist for subagent sessions.
5. **Output**: Final `WorkspaceBootstrapFile[]` is used to build the system prompt.

---

## Hook Handler Interface

### Enhanced Context (Proposed)

```typescript
// Extended from existing AgentBootstrapHookContext
export type AgentBootstrapHookContext = {
  workspaceDir: string;
  bootstrapFiles: WorkspaceBootstrapFile[];
  cfg?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;

  // NEW: Rich context for dynamic decisions
  sessionType?: "interactive" | "subagent" | "scheduled" | "ci";
  timeContext?: {
    hour: number; // 0-23, local time
    dayOfWeek: number; // 0-6 (Sunday=0)
    isWeekend: boolean;
    timezone: string;
  };
  channelContext?: {
    provider: string; // "slack", "discord", "cli", etc.
    channelId?: string;
    channelName?: string;
  };
};
```

### Helper Utilities (Proposed)

To simplify handler authoring, provide a `BootstrapFileHelper` utility:

```typescript
export class BootstrapFileHelper {
  constructor(private context: AgentBootstrapHookContext) {}

  /** Add a new bootstrap file */
  addFile(name: WorkspaceBootstrapFileName, content: string, source?: string): void {
    this.context.bootstrapFiles.push({
      name,
      path: source ?? `<dynamic:${name}>`,
      content,
      missing: false,
    });
  }

  /** Remove a file by name */
  removeFile(name: WorkspaceBootstrapFileName): void {
    this.context.bootstrapFiles = this.context.bootstrapFiles.filter((f) => f.name !== name);
  }

  /** Prepend content to an existing file (or create if missing) */
  prependToFile(name: WorkspaceBootstrapFileName, content: string): void {
    const file = this.context.bootstrapFiles.find((f) => f.name === name && !f.missing);
    if (file) {
      file.content = content + "\n\n---\n\n" + (file.content ?? "");
    } else {
      this.addFile(name, content);
    }
  }

  /** Append content to an existing file (or create if missing) */
  appendToFile(name: WorkspaceBootstrapFileName, content: string): void {
    const file = this.context.bootstrapFiles.find((f) => f.name === name && !f.missing);
    if (file) {
      file.content = (file.content ?? "") + "\n\n---\n\n" + content;
    } else {
      this.addFile(name, content);
    }
  }

  /** Replace file content entirely */
  replaceFileContent(name: WorkspaceBootstrapFileName, content: string): void {
    const file = this.context.bootstrapFiles.find((f) => f.name === name);
    if (file) {
      file.content = content;
      file.missing = false;
    } else {
      this.addFile(name, content);
    }
  }

  /** Check if a file exists and has content */
  hasFile(name: WorkspaceBootstrapFileName): boolean {
    return this.context.bootstrapFiles.some((f) => f.name === name && !f.missing);
  }

  /** Get file content by name */
  getFileContent(name: WorkspaceBootstrapFileName): string | undefined {
    return this.context.bootstrapFiles.find((f) => f.name === name && !f.missing)?.content;
  }
}
```

---

## Example Implementations

### 1. Time-of-Day Context Handler

Injects time-aware instructions based on the current hour.

```typescript
// src/hooks/bundled/time-context/handler.ts
import type { InternalHookEvent } from "../../../hooks/internal-hooks.js";
import { isAgentBootstrapEvent } from "../../../hooks/internal-hooks.js";
import { BootstrapFileHelper } from "../../../agents/bootstrap-file-helper.js";

const timeContextHandler = async (event: InternalHookEvent) => {
  if (!isAgentBootstrapEvent(event)) return;

  const helper = new BootstrapFileHelper(event.context);
  const hour = new Date().getHours();

  if (hour >= 22 || hour < 6) {
    // Overnight mode
    helper.appendToFile(
      "AGENTS.md",
      `
## 🌙 Overnight Mode Active

You are operating during overnight hours. Special guidelines:
- Work autonomously — the user is likely asleep
- Prioritize queued tasks over asking questions
- Batch notifications for morning review
- If uncertain, make the safe choice and document your reasoning
    `.trim(),
    );
  } else if (hour >= 6 && hour < 9) {
    // Morning briefing mode
    helper.appendToFile(
      "AGENTS.md",
      `
## ☀️ Morning Mode

Good morning! Consider:
- Summarize overnight activity if any
- Review and prioritize the day's task queue
- Flag any blockers discovered overnight
    `.trim(),
    );
  }
};

export default timeContextHandler;
```

### 2. Per-Agent Override Handler

Loads agent-specific override files from a directory structure.

```typescript
// src/hooks/bundled/agent-overrides/handler.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { InternalHookEvent } from "../../../hooks/internal-hooks.js";
import { isAgentBootstrapEvent } from "../../../hooks/internal-hooks.js";
import { BootstrapFileHelper } from "../../../agents/bootstrap-file-helper.js";

/**
 * Loads per-agent override files from:
 *   ~/.openclaw/agents/<agentId>/AGENTS.md
 *   ~/.openclaw/agents/<agentId>/SOUL.md
 *   etc.
 *
 * These override (replace) the merged global+workspace content
 * for the specific agent.
 */
const agentOverrideHandler = async (event: InternalHookEvent) => {
  if (!isAgentBootstrapEvent(event)) return;

  const { agentId } = event.context;
  if (!agentId) return;

  const overrideDir = path.join(process.env.HOME ?? "/tmp", ".openclaw", "agents", agentId);

  const bootstrapFileNames = [
    "AGENTS.md",
    "SOUL.md",
    "TOOLS.md",
    "IDENTITY.md",
    "USER.md",
    "HEARTBEAT.md",
    "BOOTSTRAP.md",
  ] as const;

  for (const name of bootstrapFileNames) {
    const filePath = path.join(overrideDir, name);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const helper = new BootstrapFileHelper(event.context);
      // Per-agent files append to existing content
      helper.appendToFile(name, `\n## Agent-Specific: ${agentId}\n\n${content}`);
    } catch {
      // File doesn't exist for this agent — skip
    }
  }
};

export default agentOverrideHandler;
```

### 3. CI/Automation Session Handler

Strips interactive-only instructions when running in CI.

```typescript
// src/hooks/bundled/ci-mode/handler.ts
import type { InternalHookEvent } from "../../../hooks/internal-hooks.js";
import { isAgentBootstrapEvent } from "../../../hooks/internal-hooks.js";
import { BootstrapFileHelper } from "../../../agents/bootstrap-file-helper.js";

const ciModeHandler = async (event: InternalHookEvent) => {
  if (!isAgentBootstrapEvent(event)) return;

  // Detect CI environment
  const isCI = process.env.CI === "true" || process.env.OPENCLAW_SESSION_TYPE === "ci";
  if (!isCI) return;

  const helper = new BootstrapFileHelper(event.context);

  // Remove interactive-only files
  helper.removeFile("HEARTBEAT.md");
  helper.removeFile("USER.md");

  // Add CI-specific instructions
  helper.appendToFile(
    "AGENTS.md",
    `
## 🤖 CI Mode

This session is running in a CI/automation pipeline. Guidelines:
- Never prompt for user input
- Fail fast on errors — don't retry interactively
- Log all actions for audit trail
- Exit cleanly when task is complete
  `.trim(),
  );
};

export default ciModeHandler;
```

---

## Handler Registration & Priority

Handlers should be registered with explicit priority ordering. The existing hook system uses a simple array (first-registered, first-called). For bootstrap hooks, we propose adding a priority system:

```typescript
export interface BootstrapHookRegistration {
  id: string;
  handler: InternalHookHandler;
  priority: number; // Lower = runs first. Default: 100
  description?: string;
}

// Built-in priorities:
// 10  - Global file loader (filesystem-based, runs first)
// 50  - Per-agent overrides
// 100 - Time-of-day context (default)
// 150 - User-defined custom handlers
// 200 - CI/automation mode (runs last, can strip things)
```

### Registration API

```typescript
// In src/agents/bootstrap-hooks.ts
export function registerBootstrapHandler(registration: BootstrapHookRegistration): void;
export function unregisterBootstrapHandler(id: string): void;
export function listBootstrapHandlers(): BootstrapHookRegistration[];
```

---

## Configuration

Bootstrap hook handlers can be configured via `openclaw.yaml`:

```yaml
# openclaw.yaml
bootstrap:
  hooks:
    time-context:
      enabled: true
      overnight_start: 22 # hour (24h)
      overnight_end: 6
    agent-overrides:
      enabled: true
      override_dir: ~/.openclaw/agents/
    ci-mode:
      enabled: true
      # auto-detect from CI env var, or force:
      # force: true
```

---

## Migration Path from Current System

### Phase 1: Global MD Loader (CURRENT — being implemented now)

- Simple file-based global instructions via `~/.openclaw/`
- Merged into workspace files at load time
- No hooks involved — purely filesystem-based

### Phase 2: Bootstrap Hook Handlers (THIS DESIGN)

- Implement the `BootstrapFileHelper` utility class
- Add time-context handler as first bundled handler
- Add per-agent override handler
- All existing behavior preserved — hooks are additive

### Phase 3: Rich Context Injection

- Extend `AgentBootstrapHookContext` with session type, channel, time
- Populate context from session initialization
- Enable conditional logic in handlers

### Phase 4: User-Defined Handlers

- Allow users to register custom handlers via `openclaw.yaml`
- Support loading handlers from `~/.openclaw/hooks/` directory
- Provide a handler template/scaffold tool

### Backward Compatibility

- **Phase 1** is fully backward compatible — no bootstrap files in `~/.openclaw/` means zero behavior change.
- **Phase 2+** uses the existing hook system. No handlers registered = no change.
- The `SUBAGENT_BOOTSTRAP_ALLOWLIST` filter always runs last, ensuring subagent security is maintained regardless of what hooks add.
- Global files from Phase 1 become the "default" layer in the Phase 2 priority system (priority 10).

---

## Open Questions

1. **Should per-agent overrides replace or append?** Current design says append. Replacement could be supported via a `mode: "replace" | "append" | "prepend"` config.
2. **How to handle hook errors?** Current system logs and continues. Should a bootstrap hook error abort session initialization?
3. **Should there be a "dry-run" mode?** To preview what the final bootstrap content looks like after all hooks run.
4. **Max content size?** Should there be a cap on total bootstrap content to avoid prompt overflow?

---

## File Locations

| Component              | Path                                             |
| ---------------------- | ------------------------------------------------ |
| Hook context types     | `src/hooks/internal-hooks.ts`                    |
| Bootstrap hook trigger | `src/agents/bootstrap-hooks.ts`                  |
| Workspace file loader  | `src/agents/workspace.ts`                        |
| Bundled hook handlers  | `src/hooks/bundled/<handler-name>/`              |
| Bootstrap file helper  | `src/agents/bootstrap-file-helper.ts` (proposed) |
| Handler config         | `openclaw.yaml` → `bootstrap.hooks`              |
| Per-agent overrides    | `~/.openclaw/agents/<agentId>/`                  |
| Global bootstrap files | `~/.openclaw/`                                   |
