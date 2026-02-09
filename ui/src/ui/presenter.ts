import type { CronJob, GatewaySessionRow, PresenceEntry } from "./types.ts";
import { formatRelativeTimestamp, formatDurationHuman, formatMs } from "./format.ts";
import { t } from "./i18n/i18n-manager.ts";

export function formatPresenceSummary(entry: PresenceEntry): string {
  const host = entry.host ?? t("common.unknown");
  const ip = entry.ip ? `(${entry.ip})` : "";
  const mode = entry.mode ?? "";
  const version = entry.version ?? "";
  return `${host} ${ip} ${mode} ${version}`.trim();
}

export function formatPresenceAge(entry: PresenceEntry): string {
  const ts = entry.ts ?? null;
  return ts ? formatRelativeTimestamp(ts) : t("common.na");
}

export function formatNextRun(ms?: number | null) {
  if (!ms) {
    return t("common.na");
  }
  return `${formatMs(ms)} (${formatRelativeTimestamp(ms)})`;
}

export function formatSessionTokens(row: GatewaySessionRow) {
  if (row.totalTokens == null) {
    return t("common.na");
  }
  const total = row.totalTokens ?? 0;
  const ctx = row.contextTokens ?? 0;
  return ctx ? `${total} / ${ctx}` : String(total);
}

export function formatEventPayload(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    // oxlint-disable typescript/no-base-to-string
    return String(payload);
  }
}

export function formatCronState(job: CronJob) {
  const state = job.state ?? {};
  const next = state.nextRunAtMs ? formatMs(state.nextRunAtMs) : t("common.na");
  const last = state.lastRunAtMs ? formatMs(state.lastRunAtMs) : t("common.na");
  const lastStatus = state.lastStatus;
  const status = lastStatus ? t(`common.${lastStatus}`) || lastStatus : t("common.na");
  return `${status} · ${t("cron.nextLabel")} ${next} · ${t("cron.lastLabel")} ${last}`;
}

export function formatCronSchedule(job: CronJob) {
  const s = job.schedule;
  if (s.kind === "at") {
    const atMs = Date.parse(s.at);
    return Number.isFinite(atMs) ? `${t("cron.at")} ${formatMs(atMs)}` : `${t("cron.at")} ${s.at}`;
  }
  if (s.kind === "every") {
    return `${t("cron.every")} ${formatDurationHuman(s.everyMs)}`;
  }
  return `${t("cron.cron")} ${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
}

export function formatCronPayload(job: CronJob) {
  const p = job.payload;
  if (p.kind === "systemEvent") {
    return `${t("cron.systemLabel")}: ${p.text}`;
  }
  const base = `${t("cron.agent")}: ${p.message}`;
  const delivery = job.delivery;
  if (delivery && delivery.mode !== "none") {
    const target =
      delivery.channel || delivery.to
        ? ` (${delivery.channel ?? t("cron.lastLabel")}${delivery.to ? ` -> ${delivery.to}` : ""})`
        : "";
    return `${base} · ${delivery.mode}${target}`;
  }
  return base;
}
