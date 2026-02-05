# Turn Execution Pipeline

## Summary

The turn execution pipeline is a single, reusable flow that executes an agent turn and normalizes streaming, block replies, reasoning tag stripping, and tool results. It isolates message formatting and reply accumulation from entry points.

## Problem Statement

Streaming and reply accumulation behavior currently lives in several places. Auto reply has custom logic for partial replies, typing signals, reasoning tags, and block reply chunking, while other entry points call runtimes directly. This leads to inconsistent output, duplicated code, and difficult debugging.

## Current State and Pain Points

Examples of duplication:

- `src/auto-reply/reply/agent-runner-execution.ts` normalizes streaming text and strips reasoning tags.
- `src/commands/agent.ts` runs runtime and emits lifecycle events separately.
- `src/cron/isolated-agent/run.ts` does not use the same streaming normalization or block reply flow.

Consequences:

- A fix to streaming behavior must be applied in multiple places.
- It is hard to guarantee that reasoning tags never leak to channels.
- Tool result delivery is not uniform between runtime kinds.

## Goals

- A single place to normalize partial replies and final payloads.
- One implementation of reasoning tag stripping and heartbeat filtering.
- Consistent block reply behavior regardless of entry point.
- A stable TurnOutcome shape for downstream delivery.

## Non Goals

- Changing the semantics of each runtime output.
- Removing the block reply pipeline or typing signals.

## Proposed Pipeline

Introduce a Turn Executor that is invoked by the Session Kernel. The executor is responsible for:

- Preparing run ids and registering run context.
- Executing the runtime with fallback logic.
- Normalizing streaming and block replies.
- Emitting lifecycle and tool events in a consistent format.

## Turn Input and Output

```ts
export type TurnInput = {
  prompt: string;
  images?: ImageContent[];
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  timeoutMs: number;
  runId?: string;
};

export type TurnOutcome = {
  result: AgentRuntimeResult;
  events: AgentEventPayload[];
  payloads: ReplyPayload[];
  fallback?: { provider: string; model?: string };
  didSendViaMessagingTool?: boolean;
};
```

## Normalization Rules

The pipeline should apply a single set of text rules across all runtimes:

- Strip heartbeat tokens when the response has no meaningful content.
- Strip reasoning tags and reasoning blocks before delivery.
- Normalize empty or whitespace only payloads to no output.
- Deduplicate partial replies that overlap with block replies.

These rules should be implemented once and reused by all entry points.

## Block Reply Handling

The executor should own block reply chunking and the timing of flushes. The block reply configuration should be derived from session defaults and not from entry point ad hoc logic.

## Tool Result Emission

Tool result emission should be consistent for Pi and SDK runtimes. If an SDK runtime uses hooks to emit tool events, the executor should still output a normalized `onToolResult` callback for downstream consumers.

## Error and Abort Handling

The executor should capture all runtime errors and emit a lifecycle end or error event exactly once. Aborts should set the same metadata fields regardless of runtime.

## Impact and Complexity Reduction

- A single implementation of streaming behavior and output normalization.
- One source of truth for reasoning tag stripping.
- Fewer differences between auto reply, cron, and CLI execution.

## Migration Plan

1. Extract streaming normalization and reply accumulation into a shared module.
2. Introduce the Turn Executor and adopt it in auto reply.
3. Switch command and cron entry points to call the executor.

## Testing and Validation

- Parity tests for reasoning tag stripping and heartbeat behavior.
- Block reply chunking tests across runtimes.
- Regression tests for tool result callbacks and lifecycle events.

## Forward Looking Use Cases

- Streaming output to multiple channels from one execution.
- Unified reply preview and final delivery flow.
- Deterministic replay of past runs for diagnostics.
- Consistent policy enforcement for partial replies in plugins.
- A stable interface for UI components that render streaming output.

## Related Docs

- [Agent Session Kernel](/refactor/agent-session-kernel)
- [Runtime Context Resolver](/refactor/runtime-context-resolver)
- [Hooks](/hooks)
- [Tools Overview](/tools)
