import { Cron } from "croner";
import type { CronSchedule } from "./types.js";
import { parseAbsoluteTimeMs } from "./parse.js";

function resolveCronTimezone(tz?: string) {
  const trimmed = typeof tz === "string" ? tz.trim() : "";
  if (trimmed) {
    return trimmed;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    // Handle both canonical `at` (string) and legacy `atMs` (number) fields.
    // The store migration should convert atMs→at, but be defensive in case
    // the migration hasn't run yet or was bypassed.
    const sched = schedule as { at?: string; atMs?: number | string };
    const atMs =
      typeof sched.atMs === "number" && Number.isFinite(sched.atMs) && sched.atMs > 0
        ? sched.atMs
        : typeof sched.atMs === "string"
          ? parseAbsoluteTimeMs(sched.atMs)
          : typeof sched.at === "string"
            ? parseAbsoluteTimeMs(sched.at)
            : null;
    if (atMs === null) {
      return undefined;
    }
    return atMs > nowMs ? atMs : undefined;
  }

  if (schedule.kind === "every") {
    // Bug fix #8: Enforce a minimum interval of 10 seconds to prevent
    // accidental tight loops from misconfigured jobs.
    const everyMs = Math.max(10_000, Math.floor(schedule.everyMs));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
    if (nowMs < anchor) {
      return anchor;
    }
    const elapsed = nowMs - anchor;
    // Bug fix #4: Use strict ceiling division so that when nowMs lands exactly
    // on a boundary we return the *next* boundary, not the current one.
    // This prevents double-firing when nowMs === nextRunAtMs.
    const steps = Math.floor(elapsed / everyMs) + 1;
    return anchor + steps * everyMs;
  }

  const expr = schedule.expr.trim();
  if (!expr) {
    return undefined;
  }
  const cron = new Cron(expr, {
    timezone: resolveCronTimezone(schedule.tz),
    catch: false,
  });
  // Use a tiny lookback (1ms) so croner doesn't skip the current second
  // boundary. Without this, a job updated at exactly its cron time would
  // be scheduled for the *next* matching time (e.g. 24h later for daily).
  const next = cron.nextRun(new Date(nowMs - 1));
  if (!next) {
    return undefined;
  }
  const nextMs = next.getTime();
  return Number.isFinite(nextMs) && nextMs >= nowMs ? nextMs : undefined;
}
