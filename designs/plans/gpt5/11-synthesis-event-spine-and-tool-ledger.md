# Synthesis: Event Spine + Tool Ledger (hooks, runtimes, and durability)

This document rewrites and synthesizes the intent behind:

- `designs/refactor-proposal/agent-event-hook-normalization.md`
- `designs/primitive-brainstorms/results-3/unified-event-pipeline.md`
- `designs/primitive-brainstorms/results-1/hook-event-pipeline.md`
- `designs/primitive-brainstorms/results-3/tool-artifact-ledger.md`
- `designs/primitive-brainstorms/results-2/tool-result-event-pipeline.md`

## Problem

OpenClaw currently has “event-like” signals in multiple shapes and multiple dispatch systems:

- internal hooks (type/action pairs)
- plugin hooks (named lifecycle hooks with different semantics)
- runtime-specific event emissions (Pi vs SDK)
- tool result persistence logic (guards + hook transforms)

This creates:

- divergent semantics (ordering, error policy, concurrency)
- brittle hook handlers that need to parse/adapt payloads repeatedly
- inconsistent debuggability (what happened in a run depends on how it was started)

## Goal

Create one canonical **Event Spine** (typed envelope + ordering + sinks) and one canonical **Tool Ledger** (durable tool lifecycle records) such that:

- every runtime emits the same canonical run event stream
- hook systems are implemented as adapters/sinks (compat preserved)
- tool calls/results are recorded once, consistently, with explicit policies for synthetic results
- consumers (hooks, logs, UI, traces) get stable metadata and reason codes

## Non-goals

- Replace existing plugin hook names immediately (compat first).
- Expose raw prompts or sensitive tool output broadly.
- Build a full distributed tracing system (start with local, deterministic events).

## The Event Spine

### Canonical envelope (stable, versioned)

The spine transports **events**, not arbitrary blobs. Every event has:

- stable envelope fields: `version`, `runId`, `seq`, timestamps, `sessionId/sessionKey`, `agentId`
- a strict discriminated union for `kind`
- a `visibility` contract (safe vs private) to control what sinks receive

```ts
type EventVisibility = "safe" | "private";

type EventEnvelope<TKind extends string, TPayload extends object> = {
  version: 1;
  runId: string;
  seq: number; // monotonic per run
  at: string; // ISO timestamp
  agentId: string;
  sessionId: string;
  sessionKey?: string;
  source: "kernel" | "runtime" | "tool-ledger" | "hook-adapter";
  visibility: EventVisibility;
  kind: TKind;
  payload: TPayload;
};
```

### Minimal event taxonomy (start small, grow deliberately)

Start with a tight set that maps cleanly across runtimes:

- `lifecycle.started` / `lifecycle.ended` / `lifecycle.failed`
- `assistant.delta` (stream chunk) / `assistant.final`
- `tool.call.started` / `tool.call.finished` / `tool.call.failed`
- `compaction.phase` (if applicable)
- `warning` (non-fatal issues)

Everything else should be derived from these or added only when there’s a clear consumer.

### Ordering and semantics

- Exactly one `lifecycle.started` and one terminal (`ended|failed`) per run.
- `seq` is assigned centrally (TurnEngine or a spine emitter) to guarantee monotonic ordering.
- Sinks must see events in order; per-sink concurrency can be used only when it preserves ordering for that sink.

### Sinks (composition, not inheritance)

The spine routes events to sinks:

```ts
type EventSink = {
  name: string;
  accepts: (e: EventEnvelope<string, object>) => boolean; // kind + visibility + filters
  handle: (e: EventEnvelope<string, object>) => Promise<void>;
};
```

Core sinks:

- **HookAdapterSink**: maps canonical events into existing internal/plugin hook APIs.
- **TranscriptSink**: appends safe event summaries or metadata to session transcripts (if desired).
- **LogSink**: structured logs.
- **TraceSink**: writes JSONL trace files (see Run Trace Bundle proposal).

## Tool Ledger (the source of truth for tools)

### Why a ledger (vs “tool result pipeline” only)

The ledger provides durable, queryable tool lifecycle records:

- tools become debuggable without scraping transcripts
- hooks can consume standardized metadata without re-parsing
- synthetic tool result policies are centralized and explicit

### Ledger responsibilities

- record tool call intent (name, call id, input shape hash, start time)
- record tool result (success/failure, end time, sizes, error classification)
- apply tool-result hooks (`tool_result_persist`) once, consistently
- persist a normalized record to storage (JSONL, session files, or a DB)
- emit `tool.call.*` events into the Event Spine

### Synthetic tool results (make it a policy, not a side-effect)

Define one policy surface:

- when a runtime/tool path requires a “result” but none exists, the ledger can synthesize a result
- ledger marks `isSynthetic` and includes a `reason` code
- downstream consumers treat synthetic results explicitly

### Privacy / visibility

Tool records should separate:

- **safe metadata**: tool name, duration, sizes, error codes
- **private content**: full tool input/output (often sensitive)

Sinks (and especially hooks) should receive safe metadata by default; private payloads should require explicit opt-in.

## Compatibility strategy (don’t break hooks)

### Internal hooks

Map `InternalHookEvent` into spine events via a small adapter:

- old triggers continue to fire
- new spine events can be introduced without changing hook handlers immediately

### Plugin hooks

Maintain existing plugin hook names (`before_agent_start`, `after_tool_call`, etc.) by implementing them as a sink:

- the sink watches canonical spine events
- it calls plugin hook runner with a stable, documented payload
- it can emulate existing merge/priority semantics

Longer-term: plugins can register directly against canonical event kinds, but that should be additive.

## Migration plan

1. **Introduce spine core + sink interface**
   - Implement emitter with `runId` + monotonic `seq`.
   - Add a log sink first (easy to validate).

2. **Introduce tool ledger (in-memory + JSONL persistence)**
   - Wrap existing tool result guard by delegating persistence to the ledger.
   - Emit `tool.call.*` spine events.

3. **Add hook adapter sink**
   - Map canonical events to internal hooks and plugin hook runner.
   - Keep existing hook APIs stable.

4. **Instrument runtimes**
   - Update Pi and SDK runtime adapters to emit canonical spine events.
   - Ensure event ordering and terminal semantics.

5. **Turn on trace recording for targeted debugging**
   - Implement TraceSink (see Run Trace Bundle).

## Testing strategy

- Event ordering invariants: per run exactly one start/terminal, monotonic `seq`.
- Hook adapter compatibility tests: same hooks fire with same semantics as before.
- Tool ledger tests:
  - synthetic results policy is explicit and stable
  - persistence record format stable
  - hook transforms apply exactly once

## Design constraints (avoid creating a new mess)

1. **Keep the taxonomy small**.
2. **Keep sink boundaries strict** (no sink should mutate core event ordering/state).
3. **Separate safe vs private** at the type level so leaks are hard.
4. **Prefer adapters** over breaking plugin APIs.
