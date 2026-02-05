# New primitive proposal: Run Trace Bundle (debuggability + support)

This proposal is intentionally “glue”: it becomes valuable once you have (or are building) a canonical execution kernel and event spine, but it can also start small and still pay off.

## Problem

When debugging reliability issues, you typically need answers to:

- Which entry point ran the agent (CLI vs auto-reply vs cron)?
- Which runtime was selected and why?
- What tool calls happened, in what order, and what did they return?
- What policies were applied (message gating, tool allowlists, sandbox mode)?
- What output was streamed vs delivered, and why were some chunks dropped?

Today, reconstructing this often means correlating:

- session transcripts (not structured)
- ad-hoc logs (not consistently keyed by run)
- hook logs (format varies)
- runtime-specific outputs (Pi vs SDK differences)

## Goal

Introduce a `RunTraceBundle` primitive that captures a structured “flight recorder” per run:

- deterministic ordering
- stable schemas
- easy to export/share for support
- safe-by-default (no sensitive payloads unless explicitly enabled)

## Non-goals

- Full deterministic replay of LLM outputs (providers are non-deterministic).
- Centralized cloud tracing (start local).

## Proposed shape

Each run produces a trace bundle directory:

```
traces/<runId>/
  meta.json
  events.jsonl
  tools.jsonl
  payloads.jsonl
  redactions.json
```

### `meta.json`

Minimum fields:

- run identifiers: `runId`, `sessionId`, `sessionKey`, `agentId`
- entry point: `cli|auto-reply|cron|planner|hook`
- resolved runtime: `pi|sdk|cli`
- model/provider selection + fallbacks
- workspace path (or stable workspace id)
- config snapshot hash (not the full config by default)
- timestamps + duration

### `events.jsonl`

The canonical Event Spine stream (safe visibility by default).

### `tools.jsonl`

Tool ledger records (safe metadata by default):

- tool name, call id
- durations + sizes
- error code classification
- `isSynthetic` marker + reason code

### `payloads.jsonl`

Delivered payloads (text/media references) in final form:

- what was sent
- chunk boundaries
- which sink/deliverer sent it

## Privacy model

Two modes:

1. **Safe mode (default)**:
   - store only safe metadata, hashes, sizes, and reason codes
   - tool input/output elided
   - prompts elided

2. **Private mode (explicit opt-in)**:
   - store prompts + tool payloads (still with redaction hooks)
   - gated behind an explicit config flag and/or CLI flag

Even in private mode, allow “redaction hooks” to remove tokens/secrets (plugin-provided optional).

## Integration points

- TurnEngine writes `events.jsonl` through an Event Spine TraceSink.
- Tool Ledger writes `tools.jsonl`.
- Kernel writes `meta.json` at start and finalizes it at end.
- Channel deliverers write `payloads.jsonl`.

## Operator UX (minimal)

Suggested commands (names are illustrative):

- `openclaw debug trace list` (recent runs)
- `openclaw debug trace show <runId>` (summary)
- `openclaw debug trace export <runId> --out ./trace.zip`

## Retention + size

- Default retention: N days or N MB (configurable).
- Hard caps per file (rotate JSONL).
- If a run produces excessive output, store tails with clear truncation markers.

## Why this is worth it

This primitive turns reliability/debugging from “grep logs and guess” into “inspect structured run artifacts”.

It also enables future work:

- a UI “run inspector”
- automated anomaly detection on tool failures or missing results
- support workflows (“attach trace bundle”)
