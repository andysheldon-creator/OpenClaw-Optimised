# Session State and Metadata Service

## Summary

The session state and metadata service centralizes all updates to session stores after a run. It ensures that model usage, runtime session ids, token counts, and transcript paths are updated consistently for every entry point.

## Problem Statement

Session metadata updates are currently implemented in multiple places. Each entry point updates session stores, token counts, and runtime specific session ids in its own way. This makes it easy to miss fields or introduce inconsistent behavior.

## Current State and Pain Points

The following call sites update session metadata directly:

- `src/commands/agent.ts` updates model, provider, and token counts after each run.
- `src/cron/isolated-agent/run.ts` does similar updates with slightly different rules.
- `src/auto-reply/reply/followup-runner.ts` updates session metadata in yet another location.

Consequences:

- Runtime specific session ids are not always persisted consistently.
- Session metadata may drift between auto reply and cron runs.
- Changes to session tracking require edits in multiple places.

## Goals

- One shared service for session updates after a turn.
- Uniform handling of model, provider, and token counts.
- Consistent persistence of runtime specific session ids.
- Clear boundaries for transcript path resolution.

## Proposed Service

Introduce a Session Store Service that exposes a small API surface. The Session Kernel calls this service after every turn.

```ts
export type SessionUpdateInput = {
  sessionKey?: string;
  sessionId: string;
  agentId: string;
  runResult: AgentRuntimeResult;
  fallback?: { provider: string; model?: string };
  storePath?: string;
};

export interface SessionStoreService {
  updateAfterRun(input: SessionUpdateInput): Promise<void>;
  resolveTranscriptPath(sessionId: string, agentId: string): string;
}
```

## Update Rules

The service should apply a consistent set of rules:

- Persist model provider and model used, preferring runtime metadata if present.
- Persist token counts using the normalized usage fields.
- Update runtime session ids for CLI and SDK if returned by the run.
- Update `updatedAt` and other timestamp fields once per run.

## Concurrency and Consistency

Updates should be serialized per session key to avoid conflicting writes. The service should use the existing session store update mechanism to preserve atomic writes.

## Transcript Paths

Transcript path resolution should be centralized to avoid divergent file layouts between entry points. The service should be the only code that decides where session transcripts are stored on disk.

## Impact and Complexity Reduction

- Session updates are defined once and shared everywhere.
- Easier to add new metadata fields without touching many entry points.
- Consistent behavior between auto reply, cron, and CLI runs.

## Migration Plan

1. Extract session update logic into the new service.
2. Update the Session Kernel to call the service after each turn.
3. Remove direct session store updates from entry points.

## Testing and Validation

- Unit tests for token and model updates across runtimes.
- Regression tests to ensure session ids are persisted correctly.
- File path tests for transcript resolution.

## Forward Looking Use Cases

- Session usage analytics without custom per entry point logic.
- Consistent session resume behavior across runtime kinds.
- Automated session cleanup or retention policies.
- Session health metrics and diagnostics.
- Shared transcript indexing for search.

## Related Docs

- [Agent Session Kernel](/refactor/agent-session-kernel)
- [Runtime Context Resolver](/refactor/runtime-context-resolver)
- [Session Management and Compaction](/reference/session-management-compaction)
- [Gateway Configuration](/gateway/configuration)
