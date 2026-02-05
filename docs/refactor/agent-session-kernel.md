# Agent Session Kernel

## Summary

The agent session kernel is a shared orchestration layer that prepares and runs agent turns in a single canonical path. It centralizes session resolution, runtime selection, tool policy, callbacks, and run metadata so every entry point behaves the same way.

## Problem Statement

OpenClaw currently starts agent sessions from multiple entry points that each assemble configuration, runtime context, and callbacks in their own way. The result is a sprawling foundation where defaults and safety logic are not uniformly applied. This makes AgentRuntime harder to use consistently and pushes correctness burden onto each caller.

## Background and Current State

Today, several call sites directly assemble run parameters and choose runtime behavior:

- `src/commands/agent.ts` performs runtime selection, fallback selection, and session metadata updates.
- `src/auto-reply/reply/agent-runner-execution.ts` contains streaming normalization and block reply logic.
- `src/auto-reply/reply/followup-runner.ts` repeats runtime selection and passes slightly different callbacks.
- `src/cron/isolated-agent/run.ts` has its own run loop and session update behavior.
- `src/agents/hybrid-planner.ts` runs Pi directly with its own prompt and system behavior.

There is also a general dispatch helper in `src/agents/agent-runtime-dispatch.ts`, but it is not used by most entry points.

These paths overlap but are not identical. Examples:

- Runtime kind is resolved in multiple places but not always with the same inheritance or fallback rules.
- Reply accumulation and reasoning tag stripping happen in auto reply but not uniformly elsewhere.
- Session metadata updates and run context registration are duplicated and slightly different.

## Goals

- One canonical place to create and run a session turn.
- Consistent runtime selection, tool policy, and sandbox resolution.
- Centralized run metadata, callbacks, and event registration.
- Normalized reply accumulation and delivery behavior.
- Clear separation between input preparation and turn execution.

## Non Goals

- Replacing the Pi or SDK runtime implementations.
- Introducing a new tool system.
- Changing the user facing behavior of existing commands without parity tests.

## Proposed Architecture

Introduce a Session Kernel that owns the full lifecycle of a run. The kernel exposes two main operations:

- `prepareSession`: validate and normalize session level inputs, resolve runtime, and assemble shared context.
- `executeTurn`: run a single prompt turn using the prepared context and produce a normalized outcome.

The kernel is consumed by all entry points. Entry points stay focused on IO and channel routing.

## Kernel Responsibilities

- Resolve agentId, sessionKey, workspaceDir, and agentDir.
- Resolve runtime kind and build runtime context with tool policy.
- Apply shared defaults for timeouts, reasoning behavior, and safety.
- Register run context and unify lifecycle events.
- Provide consistent streaming normalization and reply accumulation.
- Return a normalized TurnOutcome for downstream delivery.

## Kernel Interface

```ts
export type SessionKernelInput = {
  agentId: string;
  sessionKey?: string;
  sessionId: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  messageContext?: MessageContext;
  runOptions?: RunOptions;
};

export type PreparedSession = {
  session: SessionKernelInput;
  runtimeContext: RuntimeContext;
  toolPolicy: ToolPolicy;
  sessionFile: string;
  defaults: NormalizedDefaults;
};

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
  fallback?: { provider: string; model?: string };
};
```

## Execution Flow

1. Entry point builds `SessionKernelInput` from inbound request.
2. Kernel normalizes defaults and resolves session metadata.
3. Kernel resolves runtime context and tool policy.
4. Kernel executes a turn via the Turn Executor and returns `TurnOutcome`.
5. Kernel updates session state via the Session Store Service.
6. Entry point decides delivery behavior based on `TurnOutcome`.

## Impact and Complexity Reduction

- One canonical run path replaces several near duplicates.
- Fewer call sites need to understand runtime differences.
- Session metadata logic is centralized and testable.
- A single place to debug runtime selection, callbacks, and policy.

## Migration Plan

1. Add the kernel and plug in a single entry point, likely `src/commands/agent.ts`.
2. Port auto reply runner and follow up runner to the kernel.
3. Port cron isolated runs and hybrid planner.
4. Remove duplicate helper logic and redundant runtime decisions.

## Testing and Validation

- Add kernel unit tests that validate runtime resolution and defaults.
- Add parity tests comparing old and new entry point outputs.
- Run existing integration tests with the kernel path enabled.

## Risks and Tradeoffs

- Initial refactor may surface implicit behavior differences.
- The kernel becomes a critical dependency and must remain stable.
- Some entry points may require transitional adapters for missing data.

## Forward Looking Use Cases

- Uniform multi agent workflows with predictable policy.
- Prewarming or caching session context before runs.
- Pluggable delivery sinks for the same turn output.
- Unified run replay for debugging and support.
- New runtime backends without changing entry points.

## Related Docs

- [Runtime Context Resolver](/refactor/runtime-context-resolver)
- [Turn Execution Pipeline](/refactor/turn-execution-pipeline)
- [Session State Service](/refactor/session-state-metadata-service)
- [Gateway Configuration](/gateway/configuration)
- [Hooks](/hooks)
- [Session Management and Compaction](/reference/session-management-compaction)
