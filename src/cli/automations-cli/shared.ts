/**
 * Shared utilities for automations CLI commands.
 */

import { defaultRuntime } from "../../runtime.js";
import { callGatewayFromCli } from "../gateway-rpc.js";

export async function warnIfAutomationsDisabled(opts: Record<string, unknown>): Promise<void> {
  try {
    const res = await callGatewayFromCli("automations.list", opts, {});
    if (res && typeof res === "object" && "automations" in res) {
      const automations = res.automations as Array<{ enabled: boolean }>;
      const allDisabled = automations.length > 0 && automations.every((a) => !a.enabled);
      if (allDisabled) {
        defaultRuntime.log(
          "Note: All automations are disabled. Use 'clawdbrain automations enable <id>' to enable.",
        );
      }
    }
  } catch {
    // Ignore errors
  }
}

export async function formatAutomationsList(
  automations: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    enabled: boolean;
    schedule: { type: string; expr?: string; everyMs?: number; atMs?: number };
    nextRunAt?: number;
    lastRun?: { at: number; status: string };
  }>,
): Promise<string> {
  if (automations.length === 0) {
    return "No automations found.";
  }

  const lines: string[] = [];
  lines.push("Automations:");
  lines.push("");

  for (const automation of automations) {
    const statusStr = automation.enabled ? automation.status : "disabled";
    const statusIcon = automation.enabled ? "✓" : "✗";
    const scheduleStr = formatSchedule(automation.schedule);
    const lastRunStr = automation.lastRun
      ? `last run: ${new Date(automation.lastRun.at).toLocaleString()} (${automation.lastRun.status})`
      : "never run";

    lines.push(
      `  ${statusIcon} ${automation.name} (${automation.id})`,
      `      Type: ${automation.type} | Status: ${statusStr}`,
      `      Schedule: ${scheduleStr}`,
      `      ${lastRunStr}`,
    );
  }

  return lines.join("\n");
}

function formatSchedule(schedule: {
  type: string;
  expr?: string;
  everyMs?: number;
  atMs?: number;
}): string {
  switch (schedule.type) {
    case "at":
      return schedule.atMs ? `at ${new Date(schedule.atMs).toLocaleString()}` : "at (not set)";
    case "every":
      return schedule.everyMs ? `every ${formatDuration(schedule.everyMs)}` : "every (not set)";
    case "cron":
      return schedule.expr || "cron (not set)";
    default:
      return "unknown";
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export async function formatAutomationsHistory(
  records: Array<{
    id: string;
    automationName: string;
    startedAt: number;
    completedAt?: number;
    status: string;
    durationMs?: number;
    error?: string;
  }>,
): Promise<string> {
  if (records.length === 0) {
    return "No run history found.";
  }

  const lines: string[] = [];
  lines.push("Run History:");
  lines.push("");

  for (const record of records) {
    const statusIcon = record.status === "success" ? "✓" : record.status === "failed" ? "✗" : "○";
    const startedAt = new Date(record.startedAt).toLocaleString();
    const durationStr = record.durationMs ? formatDuration(record.durationMs) : "running...";
    const errorStr = record.error ? ` | Error: ${record.error}` : "";

    lines.push(
      `  ${statusIcon} ${record.automationName} (${record.id})`,
      `      Started: ${startedAt} | Duration: ${durationStr} | Status: ${record.status}${errorStr}`,
    );
  }

  return lines.join("\n");
}
