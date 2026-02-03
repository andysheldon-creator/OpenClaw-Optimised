---
summary: "How the web app surfaces approval requests and how Snooze behaves"
read_when:
  - You see approvals waiting and want to respond quickly
  - You want to understand Snooze behavior and limitations
  - You are implementing approval UX in an operator UI
---

# Approvals (web)

Some tool actions require an explicit operator decision (approve or deny). The web app surfaces these as an attention state so approvals do not get stuck behind an unobvious counter.

## MVP behavior

- When approvals are pending, the app shows a persistent, low-friction banner with:
  - **Review**: jump to the waiting list
  - **Open next**: jump to the next agent that needs input
  - **Snooze**: silence reminders for a short period
- Keyboard navigation includes a fast path to waiting approvals (see [Dashboard](/web/dashboard)).
- The banner is intentionally compact and does not try to explain every detail of why an approval is pending.

## Snooze semantics

Snooze is **UI-only**:

- Snooze does **not** pause the agent, the tool call, or any external system.
- Snooze does **not** extend timeouts.
- Snooze only hides reminders until the snooze window ends, then reminders resume if approvals are still pending.

If you snooze and the approval later fails, treat it as a normal failure and ask the agent to retry the action.

## Known limitations (MVP)

For MVP we intentionally keep behavior simple and best-effort:

- No countdown or TTL display per approval, because external systems can expire tokens and tickets unpredictably.
- No staleness scoring or “this is likely expired” warnings.
- Background tabs may delay reminder timers due to browser throttling; the banner will still appear when you return.

## Planned improvements (short-term)

After MVP, if the “approval timed out” experience is frequent or confusing, add one or more of:

- **Per-approval age** and “requested X minutes ago” display (UI-only).
- **TTL metadata** from the runtime (for example `expiresAtMs`), enabling accurate countdowns and better snooze guidance.
- **Focus and visibility re-alerting** (check on tab focus/visibility change) to reduce reliance on background timers.
