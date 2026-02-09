---
name: human-readable-timestamp-logging
description: Add human-readable timestamped logging with per-function timing breakdowns to identify latency bottlenecks. Use when instrumenting code, adding observability, profiling request flows (API routes, dependencies, DB calls), or when the user asks to measure latency, performance, or bottlenecks.
---

# Human-Readable Timestamp Logging & Latency Breakdown

Goal: produce logs that are **easy for humans to read** and show **detailed timing breakdowns** per function/step so bottlenecks are obvious.  
Do **not** add noisy logs everywhere—log **structured spans** around meaningful steps.

## What “Good” Looks Like

### Log requirements

- **Human-readable timestamp** (local time) at the start of each main log line.
- A **correlation id** per request/operation (e.g., short hex) to connect all lines.
- A **scope label** (e.g., `[categories:d4914999]`) for route/module context.
- **Per-step durations** in ms with consistent alignment.
- **Indented sub-spans** for nested steps (dependencies, DB, external calls).
- **Total** time for the whole operation + **route total**.
- Optional metadata: `rows=`, `status=`, `cache=hit/miss`, `db=pool`, etc.

### Example output style (format target)

This is a format target; actual code can differ.

INFO: 127.0.0.1:52715 - "OPTIONS /api/v1/categories/{id}/exam/status HTTP/1.1" 200 OK
├─ dependency.db.acquire: 0.1ms
├─ dependency.auth.validate: 0.0ms
INFO: [categories:d4914999] db.connection 99.04 ms
⚠️ [15464d1a] repo.category.get_all_active 69.50 ms
INFO: [categories:d4914999] repo.get_all_active 69.66 ms | rows=16
INFO: [categories:d4914999] repo.get_all_category_progress 2.09 ms | rows=17
INFO: [categories:d4914999] repo.get_card_counts_batch 1.80 ms | rows=16
INFO: [categories:d4914999] python.build_response 0.48 ms | rows=16
INFO: [categories:d4914999] total 173.87 ms
📍 [15464d1a] route.categories.list 175.60 ms

---

## Non-Negotiable Rules

1. **Never sacrifice code quality for logging**
   - Logging must be readable, maintainable, and low-risk.
   - No invasive changes that reduce clarity or correctness.

2. **Logging must be cheap**
   - Use monotonic clocks for duration (e.g., `perf_counter()`).
   - Avoid heavy formatting unless the log level is enabled.
   - Avoid repeated initialization of loggers/handlers.

3. **Every request/operation must have an ID**
   - Generate once at the entry point (middleware / route wrapper).
   - Pass via context (contextvar / request state / thread-local).

4. **Prefer spans over scattershot logs**
   - Wrap meaningful units: dependency validation, DB acquire, query, serialization, external API.
   - Do not log inside tight loops unless aggregated.

5. **Always log totals**
   - Total per route/request.
   - Total per major subsystem if applicable (db total, external total).

---

## Implementation Pattern (Default)

### 1) Correlation & Context

- Create `request_id` at request start (middleware) and attach to:
  - request context label (route/module name)
  - logger extra fields
  - contextvar for deep calls

Preferred propagation order:

1. `contextvars` (async-safe)
2. request state (`request.state`)
3. explicit parameter (if small surface)

### 2) Timing Spans (Recommended Abstraction)

Use a small, reusable timing utility:

- `span(name, level=INFO, warn_ms=..., meta=...)`
- Supports nesting with indentation
- Emits:
  - `name` aligned
  - duration ms
  - optional metadata (rows, status, cache info)

### 3) Logging Format

- Use consistent columns:
  - timestamp
  - level
  - [scope:request_id]
  - span name padded/aligned
  - duration in `xx.xx ms`
  - meta suffix: `| key=value ...`

### 4) Warnings & Highlighting

- Define thresholds:
  - `warn_ms`: emit ⚠️ when span exceeds threshold
  - `error_ms` optional for critical paths
- Highlight only slow spans to avoid noise.

---

## Step-by-Step Workflow (When Adding Logging)

### Step 1 — Identify the critical path

Instrument entry points:

- API route handler (or service entry function)
- dependencies (auth, db acquire)
- DB query functions
- external API calls
- response building/serialization

### Step 2 — Add request-scoped context

- Ensure `request_id` and `scope` exist and are accessible everywhere.

### Step 3 — Wrap spans around meaningful work

- Add spans at boundaries, not inside low-level loops.
- Example span names:
  - `dependency.auth.validate`
  - `dependency.db.acquire`
  - `db.query.users_by_id`
  - `repo.category.get_all_active`
  - `python.build_response`
  - `total`

### Step 4 — Add structured metadata

- DB results: `rows=`, `query=`, `table=`
- Cache: `cache=hit/miss`, `redis_pool=`
- External: `provider=`, `status=`, `retries=`

### Step 5 — Verify output readability

- All spans aligned
- Clear nesting
- Totals present
- Slow spans highlighted

---

## Guardrails (Avoid These Anti-Patterns)

- ❌ Logging every loop iteration
- ❌ Printing instead of using logger
- ❌ Multiple logger initializations per call
- ❌ Using wall-clock time for durations (use monotonic)
- ❌ Blocking operations in log formatting
- ❌ Hard-coding environment-specific timezones/paths

---

## Review Checklist (Always Apply)

Before finalizing instrumentation, verify:

- [ ] Each request has a single correlation id used everywhere
- [ ] Durations use a monotonic clock
- [ ] Spans wrap meaningful steps (not noisy)
- [ ] Indentation reflects nesting correctly
- [ ] Totals are printed (route + internal total)
- [ ] Slow spans are highlighted with a threshold
- [ ] Logging overhead is minimal (guarded by log level)
- [ ] Code remains clean and maintainable
