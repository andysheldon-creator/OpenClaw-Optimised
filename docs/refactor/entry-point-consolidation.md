# Entry Point Consolidation Plan

## Summary

Entry point consolidation defines how OpenClaw will move from multiple bespoke entry points to a single Session Kernel and Turn Executor path. It provides the sequence of changes, acceptance criteria, and a low risk migration strategy.

## Problem Statement

OpenClaw currently has several entry points that start agent runs in different ways. Each path carries its own configuration logic and runtime decisions. This increases maintenance cost and makes it harder to reason about correct behavior.

## Entry Point Inventory

The following entry points should be consolidated:

- `src/commands/agent.ts` for direct CLI runs.
- `src/auto-reply/reply/agent-runner-execution.ts` for auto reply runs.
- `src/auto-reply/reply/followup-runner.ts` for follow up runs.
- `src/cron/isolated-agent/run.ts` for isolated and hook runs.
- `src/agents/hybrid-planner.ts` for planner runs.

## Target Entry Point Shape

Each entry point should be reduced to:

- Parse inbound input and channel context.
- Build `SessionKernelInput` and `TurnInput`.
- Call the Session Kernel and Turn Executor.
- Deliver output payloads to the appropriate channel.

All runtime and policy decisions should happen inside the kernel and resolver layers.

## Phased Consolidation Plan

1. Phase 0, introduce the kernel and runtime resolver with a feature flag that allows opt in.
2. Phase 1, migrate `src/commands/agent.ts` and add parity tests.
3. Phase 2, migrate auto reply and follow up paths.
4. Phase 3, migrate cron isolated runs and planner runs.
5. Phase 4, remove old helper logic and deprecated branches.

## Acceptance Criteria

- Same runtime selection for every entry point and session key.
- Same output payloads for a representative test suite.
- Same session metadata after a run.
- No change in default tool policy behavior.

## Impact and Complexity Reduction

- Entry points become thin and easier to audit.
- Runtime changes and safety fixes are applied once.
- Diagnostic paths become consistent across modes.

## Risks and Mitigations

- Behavior regressions can be limited by a staged rollout and parity tests.
- Entry points with unique requirements can use adapters during migration.
- Feature flags allow gradual adoption and rollbacks.

## Forward Looking Use Cases

- Adding a new entry point without reimplementing runtime logic.
- Unified testing harness that covers all entry points.
- Consistent tool policy for new channels and extensions.
- Shared troubleshooting steps across all user facing modes.
- Cleaner deprecation of legacy paths.

## Related Docs

- [Agent Session Kernel](/refactor/agent-session-kernel)
- [Runtime Context Resolver](/refactor/runtime-context-resolver)
- [Turn Execution Pipeline](/refactor/turn-execution-pipeline)
- [Session State Service](/refactor/session-state-metadata-service)
- [Gateway Configuration](/gateway/configuration)
