This PR fixes a critical bug where cron jobs would incorrectly jump to the next day's first scheduled slot after a gateway restart (SIGUSR1), instead of continuing from the next available slot on the current day.

### Problem

When the gateway restarts, `recomputeNextRuns` is called to re-initialize job schedules. The previous implementation of `computeNextRunAtMs` used a manual cursor loop with `cron.nextRun(new Date(cursor))`. For certain complex cron expressions (e.g., specific hour ranges with intervals), passing an explicit date cursor caused the underlying `croner` library to skip the remaining slots of the current day and return the first slot of the next day.

### Changes

- **Direct NextRun Call**: Updated `computeNextRunAtMs` in `src/cron/schedule.ts` to call `cron.nextRun()` without arguments. This allows `croner` to use its internal steady-state clock, which is more reliable for "next slot" calculations.
- **Test Determinism**: Updated `src/cron/schedule.test.ts` to use Vitest's fake timers. This ensures the unit tests remain deterministic now that the calculation relies on the active system clock.
- **Regression Test**: Added a new test case in `src/cron/service.issue-regressions.test.ts` that mocks a restart scenario and verifies the `nextRunAtMs` does not drift to the next day.

### Validation

- **Lint**: `pnpm lint` (0 warnings, 0 errors).
- **Unit Tests**: `pnpm test src/cron/schedule.test.ts` (All passed).
- **Regression Tests**: `pnpm test src/cron/service.issue-regressions.test.ts` (All passed, including the new restart test).

Fixes #11569
