# MASTER_PROJECT.md - Danno Operating System

This file is the source of truth. Read it at the start of every session.

## Core Rules (Immutable)

1. No Project ID, No Work
2. Charter Required Before Code
3. Conflict Detection Active
4. Safety Over Speed
5. Log Everything

## Active Projects

| Project ID | Name | Status | Charter |
|------------|------|--------|---------|
| MASTER | Operating System | ACTIVE | This file |
| SHARPS-EDGE | x402 Sports Betting Intelligence API | ACTIVE | projects/SHARPS-EDGE/CHARTER.md |

## Severity Levels

| Level | Action |
|-------|--------|
| INFO | Log only |
| WARN | Log + notify Michael |
| BLOCK | Log + stop the action |
| REJECT | Log + refuse + notify Michael |
| CRITICAL | Log + halt all work + notify Michael immediately |

## Budget

- Monthly limit: $200
- Alert at 80% ($160)
- Block non-essential at 95% ($190)
- Hard stop at 100% ($200)

## Project Lifecycle

1. **PENDING** - Charter written, awaiting approval
2. **ACTIVE** - Approved and being built
3. **PAUSED** - Temporarily stopped (reason must be logged)
4. **COMPLETE** - Success criteria met
5. **ARCHIVED** - No longer active

## Adding New Projects

1. Create `projects/<ID>/` directory
2. Write CHARTER.md using `templates/PROJECT_CHARTER_TEMPLATE.md`
3. Get Michael's approval
4. Add to Active Projects table above
5. Create BUILD_STATUS.md and TASKS.md
6. Begin work
