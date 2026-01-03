import type { CronSchedule } from "./types.js";

type TimeParts = { hour: number; minute: number };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const durationByUnit = new Map<string, number>([
  ["minute", MINUTE_MS],
  ["minutes", MINUTE_MS],
  ["hour", HOUR_MS],
  ["hours", HOUR_MS],
  ["day", DAY_MS],
  ["days", DAY_MS],
]);

function parseTime(input: string): TimeParts | null {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  const hourRaw = Number(match[1]);
  const minuteRaw = match[2] ? Number(match[2]) : 0;
  const meridian = match[3];

  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return null;
  if (minuteRaw < 0 || minuteRaw > 59) return null;

  if (meridian) {
    if (hourRaw < 1 || hourRaw > 12) return null;
    const hour = (hourRaw % 12) + (meridian === "pm" ? 12 : 0);
    return { hour, minute: minuteRaw };
  }

  if (hourRaw < 0 || hourRaw > 23) return null;
  return { hour: hourRaw, minute: minuteRaw };
}

export function parseNaturalSchedule(
  text: string,
  tz?: string,
  nowMs: number = Date.now(),
): CronSchedule | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;

  const inMatch = normalized.match(
    /^in (\d+)\s+(minute|minutes|hour|hours|day|days)$/,
  );
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = inMatch[2];
    const perUnit = durationByUnit.get(unit);
    if (!perUnit || Number.isNaN(amount) || amount <= 0) return null;
    return { kind: "at", atMs: nowMs + amount * perUnit };
  }

  const everyMatch = normalized.match(
    /^every (\d+)\s+(minute|minutes|hour|hours)$/,
  );
  if (everyMatch) {
    const amount = Number(everyMatch[1]);
    const unit = everyMatch[2];
    const perUnit = durationByUnit.get(unit);
    if (!perUnit || Number.isNaN(amount) || amount <= 0) return null;
    return { kind: "every", everyMs: amount * perUnit };
  }

  const everyDayAtMatch = normalized.match(/^every day at (.+)$/);
  if (everyDayAtMatch) {
    const time = parseTime(everyDayAtMatch[1]);
    if (!time) return null;
    return { kind: "cron", expr: `${time.minute} ${time.hour} * * *`, tz };
  }

  const tomorrowAtMatch = normalized.match(/^tomorrow at (.+)$/);
  if (tomorrowAtMatch) {
    const time = parseTime(tomorrowAtMatch[1]);
    if (!time) return null;
    const target = new Date(nowMs);
    target.setDate(target.getDate() + 1);
    target.setHours(time.hour, time.minute, 0, 0);
    return { kind: "at", atMs: target.getTime() };
  }

  const atMatch = normalized.match(/^at (.+)$/);
  if (atMatch) {
    const time = parseTime(atMatch[1]);
    if (!time) return null;
    return { kind: "cron", expr: `${time.minute} ${time.hour} * * *`, tz };
  }

  return null;
}
