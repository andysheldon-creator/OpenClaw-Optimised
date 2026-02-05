# Agent Execution Layer

**Status:** Synthesized Proposal
**Author:** Claude Opus 4.5
**Date:** 2026-02-04
**Synthesizes:** Agent Session Kernel, Runtime Context Resolver, Turn Execution Pipeline, Event/Hook Normalization, Session State Service, Entry Point Consolidation

---

## Summary

The Agent Execution Layer is a unified orchestration architecture that replaces the current scattered entry points with a single, layered execution stack. Every agent run—whether from CLI, auto-reply, cron, or extension—flows through the same pipeline with consistent runtime selection, execution, normalization, event emission, and state persistence.

---

## Problem Statement

OpenClaw currently starts agent sessions from multiple entry points that each assemble configuration, runtime context, callbacks, and state updates in their own way:

| Entry Point       | Location                                         | Issues                                 |
| ----------------- | ------------------------------------------------ | -------------------------------------- |
| CLI agent command | `src/commands/agent.ts`                          | Own runtime selection, session updates |
| Auto-reply runner | `src/auto-reply/reply/agent-runner-execution.ts` | Custom streaming, block reply logic    |
| Followup runner   | `src/auto-reply/reply/followup-runner.ts`        | Duplicates runtime selection           |
| Cron isolated     | `src/cron/isolated-agent/run.ts`                 | Own run loop, different events         |
| Hybrid planner    | `src/agents/hybrid-planner.ts`                   | Direct Pi calls, custom prompts        |

This creates:

- **Behavioral drift**: Same operation behaves differently depending on entry point
- **Bug multiplication**: Fixes must be applied in 5+ places
- **Testing burden**: Each path needs separate coverage
- **Onboarding friction**: New contributors must learn multiple patterns

---

## Goals

1. **One canonical execution path** for all agent runs
2. **Layered architecture** with clear responsibilities per layer
3. **Consistent runtime selection** regardless of entry point
4. **Unified event emission** for observability and hooks
5. **Single session state management** for metadata persistence
6. **Thin entry points** that only handle I/O and routing

## Non-Goals

- Replacing Pi or SDK runtime implementations
- Introducing a new tool system
- Changing the Claude Code SDK's internal architecture
- Breaking existing user-facing behavior without parity tests

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Entry Points                           │
│  (CLI, Auto-Reply, Cron, Extensions, Gateway RPC)           │
│                                                             │
│  Responsibility: Parse input, build ExecutionRequest,       │
│                  deliver output to appropriate channel      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Execution Kernel                         │
│                                                             │
│  Responsibility: Orchestrate the full turn lifecycle        │
│  - Validate and normalize input                             │
│  - Delegate to resolver, executor, state service            │
│  - Return unified ExecutionResult                           │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Runtime Resolver│ │  Turn Executor  │ │  State Service  │
│                 │ │                 │ │                 │
│ - Runtime kind  │ │ - Run turn      │ │ - Update session│
│ - Tool policy   │ │ - Normalize out │ │ - Persist tokens│
│ - Sandbox ctx   │ │ - Emit events   │ │ - Store metadata│
└─────────────────┘ └─────────────────┘ └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Event Router                           │
│                                                             │
│  Responsibility: Route events to hooks, logs, UI            │
│  - Canonical event schema                                   │
│  - Plugin hook dispatch                                     │
│  - Diagnostic stream                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Types

### ExecutionRequest

The single input type that all entry points build:

```ts
export interface ExecutionRequest {
  // Identity
  agentId: string;
  sessionId: string;
  sessionKey?: string;
  runId?: string;

  // Context
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  messageContext?: MessageContext;

  // Turn input
  prompt: string;
  images?: ImageContent[];
  extraSystemPrompt?: string;

  // Constraints
  timeoutMs?: number;
  maxTokens?: number;

  // Callbacks (optional, for streaming)
  onPartialReply?: (text: string) => void;
  onToolStart?: (name: string, id: string) => void;
  onToolEnd?: (name: string, id: string, result: unknown) => void;
}
```

### ExecutionResult

The single output type that all entry points receive:

```ts
export interface ExecutionResult {
  // Status
  success: boolean;
  aborted: boolean;
  error?: ExecutionError;

  // Output
  reply: string;
  payloads: ReplyPayload[];

  // Runtime info
  runtime: {
    kind: "pi" | "claude" | "cli";
    provider?: string;
    model?: string;
    fallbackUsed: boolean;
  };

  // Usage
  usage: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };

  // Events
  events: ExecutionEvent[];

  // Tool activity
  toolCalls: ToolCallSummary[];
  didSendViaMessagingTool: boolean;
}
```

### ExecutionEvent

Canonical event schema for all lifecycle, tool, and hook events:

```ts
export type ExecutionEventKind =
  | "lifecycle.start"
  | "lifecycle.end"
  | "lifecycle.error"
  | "tool.start"
  | "tool.end"
  | "assistant.partial"
  | "assistant.complete"
  | "compaction.start"
  | "compaction.end"
  | "hook.triggered";

export interface ExecutionEvent {
  kind: ExecutionEventKind;
  timestamp: number;
  runId: string;
  data: Record<string, unknown>;
}
```

---

## Layer Specifications

### Layer 1: Execution Kernel

The kernel is the single entry point for all agent execution. It orchestrates the other layers.

```ts
export interface ExecutionKernel {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  abort(runId: string): Promise<void>;
}
```

**Responsibilities:**

1. Validate `ExecutionRequest` fields
2. Generate `runId` if not provided
3. Call `RuntimeResolver.resolve()` to get runtime context
4. Call `TurnExecutor.execute()` to run the turn
5. Call `StateService.persist()` to update session state
6. Route events through `EventRouter`
7. Build and return `ExecutionResult`

**Invariants:**

- Every execution emits exactly one `lifecycle.start` and one `lifecycle.end` or `lifecycle.error`
- No exceptions escape; all errors are captured in `ExecutionResult`

### Layer 2: Runtime Resolver

Resolves which runtime to use and assembles runtime-specific context.

```ts
export interface RuntimeResolver {
  resolve(request: ExecutionRequest): Promise<RuntimeContext>;
}

export interface RuntimeContext {
  kind: "pi" | "claude" | "cli";
  runtime: AgentRuntime | CliRuntimeAdapter;
  toolPolicy: ToolPolicy;
  sandbox: SandboxContext | null;
  meta: {
    supportsTools: boolean;
    supportsStreaming: boolean;
    supportsImages: boolean;
  };
}
```

**Resolution Order:**

1. Check explicit runtime kind in request
2. Check session key inheritance
3. Check agent configuration
4. Apply global defaults
5. Resolve tool policy from config + channel context
6. Resolve sandbox context if tools enabled

**Key Rule:** This is the **only** place that instantiates runtimes. Entry points never call `createSdkMainAgentRuntime` or `runCliAgent` directly.

### Layer 3: Turn Executor

Executes a single turn and normalizes all output.

```ts
export interface TurnExecutor {
  execute(
    context: RuntimeContext,
    request: ExecutionRequest,
    emitter: EventEmitter,
  ): Promise<TurnOutcome>;
}

export interface TurnOutcome {
  reply: string;
  payloads: ReplyPayload[];
  toolCalls: ToolCallSummary[];
  usage: UsageMetrics;
  fallbackUsed: boolean;
  didSendViaMessagingTool: boolean;
}
```

**Normalization Rules:**

1. Strip heartbeat tokens from empty responses
2. Strip `<antThinking>` tags and reasoning blocks
3. Normalize whitespace-only payloads to empty
4. Deduplicate overlapping partial and block replies
5. Apply block reply chunking per session configuration

**Streaming Handling:**

- Accumulate partial replies
- Invoke `onPartialReply` callback if provided
- Track typing signals for channels that support them

### Layer 4: State Service

Persists session state after execution.

```ts
export interface StateService {
  persist(request: ExecutionRequest, outcome: TurnOutcome, context: RuntimeContext): Promise<void>;

  resolveTranscriptPath(sessionId: string, agentId: string): string;
}
```

**Update Rules:**

1. Persist `provider` and `model` from runtime metadata
2. Persist token counts from usage metrics
3. Update runtime session IDs (CLI session ID, SDK session ID)
4. Update `updatedAt` timestamp
5. Serialize per session key to avoid concurrent write conflicts

### Layer 5: Event Router

Routes execution events to consumers.

```ts
export interface EventRouter {
  emit(event: ExecutionEvent): void;
  subscribe(listener: EventListener): () => void;
}

export type EventListener = (event: ExecutionEvent) => void;
```

**Routing Targets:**

- **Hooks**: Plugin hooks receive filtered events via `before_agent_start`, `agent_end`, etc.
- **Logs**: All events are written to session transcript
- **UI**: Connected operator clients receive events for real-time display
- **Diagnostics**: Events are available for `clawdbrain status --deep`

**Hook Mapping:**

| Event Kind       | Hook               |
| ---------------- | ------------------ |
| lifecycle.start  | before_agent_start |
| lifecycle.end    | agent_end          |
| tool.start       | before_tool_use    |
| tool.end         | after_tool_use     |
| compaction.start | before_compaction  |
| compaction.end   | after_compaction   |

---

## Entry Point Transformation

### Before (Current State)

```ts
// src/commands/agent.ts (simplified)
export async function runAgent(args: AgentArgs) {
  const sessionKey = resolveSessionKey(args);
  const runtimeKind = await resolveSessionRuntimeKind(config, sessionKey);
  const runtime = await createSdkMainAgentRuntime(/* ... */);

  const result = await runtime.run(args.prompt, {
    onPartialReply: (text) => {
      /* custom handling */
    },
    // ... more callbacks
  });

  await updateSessionMetadata(sessionKey, result);
  return result;
}
```

### After (With Execution Layer)

```ts
// src/commands/agent.ts (simplified)
export async function runAgent(args: AgentArgs) {
  const request: ExecutionRequest = {
    agentId: args.agent,
    sessionId: resolveSessionId(args),
    sessionKey: args.sessionKey,
    workspaceDir: args.cwd,
    prompt: args.message,
    images: args.images,
    timeoutMs: args.timeout,
  };

  const result = await executionKernel.execute(request);

  if (result.success) {
    console.log(result.reply);
  } else {
    console.error(result.error?.message);
  }
}
```

**Entry point is now ~10 lines instead of ~100+.**

---

## Migration Plan

### Phase 0: Foundation

1. Define all types in `src/execution/types.ts`
2. Implement `EventRouter` with subscriber support
3. Add feature flag `execution.useNewLayer`

### Phase 1: State Service

1. Extract session update logic into `StateService`
2. Add unit tests for update rules
3. Wire into existing entry points behind flag

### Phase 2: Runtime Resolver

1. Implement `RuntimeResolver` with all resolution logic
2. Add parity tests against current behavior
3. Replace direct runtime creation calls

### Phase 3: Turn Executor

1. Extract streaming normalization into shared module
2. Implement `TurnExecutor` with all normalization rules
3. Add parity tests for reasoning tag stripping

### Phase 4: Execution Kernel

1. Compose all layers into `ExecutionKernel`
2. Migrate `src/commands/agent.ts` to use kernel
3. Verify parity with extensive tests

### Phase 5: Entry Point Migration

1. Migrate auto-reply runner
2. Migrate followup runner
3. Migrate cron isolated runner
4. Migrate hybrid planner

### Phase 6: Cleanup

1. Remove old helper functions
2. Remove feature flag
3. Delete deprecated code paths

---

## Testing Strategy

### Unit Tests

- Runtime resolution for all runtime kinds
- Tool policy resolution for different channels
- Normalization rules (reasoning tags, heartbeats, whitespace)
- Event sequencing (exactly one start/end)
- State service update correctness

### Parity Tests

For each migrated entry point, compare:

- Same `ExecutionResult.reply` for identical inputs
- Same session metadata after run
- Same events emitted

### Integration Tests

- Full turn execution with mock runtime
- Event routing to hook subscribers
- Abort handling mid-execution

---

## Risks and Mitigations

| Risk                    | Mitigation                                |
| ----------------------- | ----------------------------------------- |
| Behavioral regression   | Parity tests before each migration        |
| Performance overhead    | Profile kernel overhead; optimize if >5ms |
| Complex debugging       | Execution tracing with runId correlation  |
| Partial migration state | Feature flag allows gradual rollout       |

---

## Success Criteria

1. All entry points use `ExecutionKernel.execute()`
2. Zero behavioral regressions in parity tests
3. Entry point code reduced by 70%+
4. Single place to fix runtime selection bugs
5. Consistent events across all execution modes

---

## Related Docs

- [Gateway Configuration](/gateway/configuration)
- [Hooks](/hooks)
- [Session Management](/reference/session-management-compaction)
- [Tools Overview](/tools)
