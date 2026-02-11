# Sprint 1.3 Manager Context (Rift)

## Scope lock

You are implementing **Sprint 1.3 only** for job:

- `6ba2f3f8-c8e9-4fbe-b29f-f214b7bd7c56`
- Title: Notifier worker + unread/read state + delivery badges

## Preconditions

- Sprint 1.1 foundation exists (task_messages + thread UI basics).
- Sprint 1.2 exists (notifications queue + state/retry metadata + dedupe + debug endpoint).

## Required in Sprint 1.3

1. Delivery worker

- Poll notifications in queued/retry-ready states
- Deliver via sessions_send to target session
- Persist lifecycle transitions and retry/dead-letter behavior

2. Reaction/Ack contract

- Track states:
  queued -> delivering -> delivered -> seen -> accepted -> in_progress -> completed
  branches: declined | deferred_busy | timeout | failed | dead_letter | reassigned
- Capture timestamps and actor session where relevant

3. Busy-agent handling

- Metadata fields: busy_reason, eta_at, next_check_at
- If deferred_busy, re-check at next_check_at
- SLA expiry -> escalate/reassign/timeout path

4. Read/unread

- thread_read_state table + APIs
- unread counts computable per (task_id, session_key)

5. UI

- delivery/reaction badges in task thread
- unread indicators
- busy reason + ETA surface

## Hard acceptance criteria

1. Mention delivery executes automatically and updates state.
2. At least one reaction path recorded end-to-end.
3. Busy defer flow works with deferred_busy -> resumed check.
4. Timeout/escalation path triggers on SLA breach.
5. Read/unread pointers update and render.

## Mandatory output evidence

- PASS/FAIL per criterion with command outputs
- files changed
- migration SQL
- state machine transition table
- demo run with two agents including one busy defer case

Do not claim complete without evidence.
