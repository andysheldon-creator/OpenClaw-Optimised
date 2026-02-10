import { stripReasoningTagsFromText } from "../../../src/shared/text/reasoning-tags.js";
import { t } from "./i18n/i18n-manager.ts";

export function formatMs(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return t("common.na");
  }
  return new Date(ms).toLocaleString();
}

/**
 * Localized version of formatRelativeTimestamp.
 * Replaces upstream implementation to support i18n.
 */
export function formatRelativeTimestamp(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return t("common.na");
  }
  const diff = Date.now() - ms;
  const absDiff = Math.abs(diff);
  const isFuture = diff < 0;
  const sec = Math.round(absDiff / 1000);

  if (sec < 60) {
    return isFuture ? t("common.time.inLessMinute") : t("common.time.secondsAgo", { count: sec });
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return isFuture
      ? t("common.time.inMinutes", { count: min })
      : t("common.time.minutesAgo", { count: min });
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return isFuture
      ? t("common.time.inHours", { count: hr })
      : t("common.time.hoursAgo", { count: hr });
  }
  const day = Math.round(hr / 24);
  return isFuture
    ? t("common.time.inDays", { count: day })
    : t("common.time.daysAgo", { count: day });
}

/**
 * Localized version of formatDurationHuman.
 */
export function formatDurationHuman(ms?: number | null, fallback?: string): string {
  if (!ms && ms !== 0) {
    return fallback ?? t("common.na");
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return t("common.time.seconds", { count: sec });
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return t("common.time.minutes", { count: min });
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return t("common.time.hours", { count: hr });
  }
  const day = Math.round(hr / 24);
  return t("common.time.days", { count: day });
}

export function formatList(values?: Array<string | null | undefined>): string {
  if (!values || values.length === 0) {
    return t("common.none");
  }
  return values.filter((v): v is string => Boolean(v && v.trim())).join(", ");
}

export function clampText(value: string, max = 120): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function truncateText(
  value: string,
  max: number,
): {
  text: string;
  truncated: boolean;
  total: number;
} {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  };
}

export function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function stripThinkingTags(value: string): string {
  return stripReasoningTagsFromText(value, { mode: "preserve", trim: "start" });
}
