# QUICK_REFERENCE.md - Cheat Sheet

## Nine Laws (Short Form)

1. Lock project isolation
2. Master project = OS
3. Charter before code
4. No project ID, no work
5. Conflict detection always
6. Log all conflicts
7. Pipe errors to human
8. Use severity levels
9. Kill wrong fast

## Pre-Action Checklist

1. Scope - within charter scope IN, not in scope OUT?
2. Resources - budget and API quotas available?
3. Contention - no conflicting work in progress?
4. Authority - have permission for this action?
5. Safety - won't break existing functionality?
6. Charter - doesn't violate guardrails?

## Severity Quick Guide

| Level | When | Action |
|-------|------|--------|
| INFO | Normal operation | Log only |
| WARN | Approaching limits, minor issues | Log + notify |
| BLOCK | Check failed, action prevented | Log + stop |
| REJECT | Unauthorized or out of scope | Log + refuse + notify |
| CRITICAL | Security risk, data loss risk | Log + halt all + notify |

## Key Files

| File | Purpose |
|------|---------|
| MASTER_PROJECT.md | Operating system, source of truth |
| AGENTS.md | Nine Laws and operating instructions |
| CONFLICT_DETECTION.md | Six pre-action checks |
| projects/SHARPS-EDGE/CHARTER.md | Project scope and guardrails |
| projects/SHARPS-EDGE/BUILD_STATUS.md | Current build state |
| projects/SHARPS-EDGE/TASKS.md | Task queue |

## Budget

- $200/month total
- ~$6.67/day target
- WARN at 80% ($160)
- BLOCK at 95% ($190)
- HALT at 100% ($200)
