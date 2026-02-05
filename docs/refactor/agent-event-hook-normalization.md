# Agent Event and Hook Normalization

## Summary

Agent event and hook normalization defines a single event schema and hook routing strategy for Pi and SDK runtimes. It ensures that lifecycle, tool, and compaction signals are emitted consistently across all entry points.

## Problem Statement

Event and hook signals currently differ by runtime and entry point. Pi has its own event handlers and hook triggers, while the SDK runtime emits hook events through a separate adapter. Entry points also emit lifecycle events directly in several places. This makes it difficult to rely on a stable event format.

## Current State and Pain Points

- `src/infra/agent-events.ts` provides a generic event bus but is not used uniformly.
- Pi runtime emits hook related events in `src/agents/pi-embedded-subscribe.handlers.*`.
- SDK runtime emits hook related events in `src/agents/claude-agent-sdk/sdk-hooks.ts`.
- Entry points sometimes emit lifecycle events directly and sometimes rely on runtime behavior.

Consequences:

- Event consumers must handle multiple shapes and missing fields.
- Hooks do not provide consistent coverage across runtimes.
- Debugging a run requires knowledge of which entry point was used.

## Goals

- A canonical event schema for lifecycle, tool, hook, and error signals.
- A single hook router that maps runtime events to plugin hooks.
- Consistent run context registration and event sequencing.

## Proposed Event Schema

The event schema should be fixed and documented. Example fields:

| Stream     | Purpose                      | Example Fields                             |
| ---------- | ---------------------------- | ------------------------------------------ |
| lifecycle  | Start, end, and error events | `phase`, `startedAt`, `endedAt`, `aborted` |
| tool       | Tool use start and end       | `toolName`, `toolCallId`, `durationMs`     |
| assistant  | Assistant output milestones  | `format`, `chars`                          |
| compaction | Compaction phase changes     | `phase`, `willRetry`                       |
| hook       | Hook events from SDK or Pi   | `hookEventName`, `toolUseId`               |
| error      | Non fatal warnings           | `message`, `code`                          |

## Hook Router

The hook router should receive normalized events and translate them into plugin hook calls. This should include:

- `before_agent_start` and `agent_end` hooks.
- Tool related hooks for allowlist or mutation.
- Compaction related hooks that are aligned with the SDK signals.

The router should never expose raw prompts or sensitive tool output. It should only pass safe metadata.

## Event Sequencing Rules

- Every run must emit exactly one lifecycle start and one lifecycle end or error event.
- Tool events must be ordered within a run and retain monotonic sequence numbers.
- Hook events are emitted in the same stream regardless of runtime kind.

## Impact and Complexity Reduction

- Event consumers can rely on a single schema.
- Hook implementations are less brittle.
- Observability and diagnostics become consistent across entry points.

## Migration Plan

1. Define and document the canonical event schema in `src/infra/agent-events.ts`.
2. Update Pi runtime handlers to emit canonical events.
3. Update SDK hook adapter to map to the same schema.
4. Route all events through the Session Kernel and Turn Executor.

## Testing and Validation

- Unit tests for event ordering and required fields.
- Hook routing tests for both Pi and SDK runtimes.
- Regression tests for compaction and tool event coverage.

## Forward Looking Use Cases

- Unified event streaming for UI dashboards.
- Consistent logging for agent run analysis.
- External auditing and diagnostics tools that depend on stable events.
- Real time monitoring of tool usage across runtimes.
- Safer plugin hook behaviors through standardized event payloads.

## Related Docs

- [Agent Session Kernel](/refactor/agent-session-kernel)
- [Turn Execution Pipeline](/refactor/turn-execution-pipeline)
- [Hooks](/hooks)
- [Session Management and Compaction](/reference/session-management-compaction)
