# HEARTBEAT.md - Builder Mode

On each heartbeat, check the following in order:

1. Read `projects/SHARPS-EDGE/BUILD_STATUS.md` - is anything stalled?
2. Read `projects/SHARPS-EDGE/TASKS.md` - is there a pending task?
3. Check budget status - are we approaching the $200/month limit?
4. Check `logs/errors/` for today - any unresolved errors?

## Actions

- If a task is stalled for more than 2 hours: WARN Michael.
- If budget is above 80%: WARN Michael with remaining budget.
- If budget is above 95%: BLOCK non-essential actions.
- If there are unresolved errors: summarize and WARN Michael.
- If there's a pending task and nothing is blocked: start working on it.
- If everything is clear: respond with HEARTBEAT_OK and current build status.

## Format

When reporting heartbeat status:

```
HEARTBEAT | YYYY-MM-DD HH:MM
Status: OK / WARN / BLOCKED
Active Project: SHARPS-EDGE
Current Task: [task name or IDLE]
Budget: $X.XX / $200.00 (XX%)
Pending Tasks: N
Blocked: [reason or NONE]
```
