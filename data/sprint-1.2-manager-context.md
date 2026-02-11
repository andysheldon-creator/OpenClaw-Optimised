# Sprint 1.2 Manager Context (Rift)

## Scope lock

You are implementing **Sprint 1.2 only** for job:

- `b35e111e-910f-41f3-91d0-fb9617913df7`
- Title: Mentions + notification queue + retry states

Do NOT implement Sprint 1.3 features (worker delivery/unread badges).

## What Sprint 1.1 already delivered

- Task threads foundation is implemented:
  - `task_messages` persistence
  - GET/POST task message APIs
  - basic UI thread read/write
- Mention extraction exists at message creation layer, but delivery pipeline is not done.

## Required in Sprint 1.2

1. Add `notifications` table (+ indexes)
2. Mention resolution:
   - alias -> session_key via `agent_aliases`
   - enqueue one notification per target
3. Notification lifecycle states:
   - `queued | delivering | delivered | failed | dead_letter`
4. Retry metadata fields:
   - `attempts`, `retry_at`, `error`
5. Read-only debug endpoint for queue state

## Hard acceptance criteria

1. Posting `@alias` creates queued notification rows.
2. Notification rows can transition states with retry metadata (without worker delivery yet).
3. No duplicates for same `(message_id, target_session_key)`.

## Evidence required in final response

- PASS/FAIL for each acceptance criterion with command outputs
- Exact files changed
- Migration SQL used
- Demo lifecycle example (sample ids + state transitions)
- Clear list of what is deferred to Sprint 1.3

## Safety checks

- Keep changes additive and compatible with Sprint 1.1
- No regressions to existing mission-control job APIs
