/**
 * Progress reporter for long-running tasks.
 *
 * Sends periodic progress updates to the user's preferred channel using
 * the same multi-channel delivery infrastructure as the heartbeat runner
 * and cron isolated agent.
 */

import { chunkText, resolveTextChunkLimit } from "../auto-reply/chunk.js";
import type { ClawdisConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { sendMessageDiscord } from "../discord/send.js";
import { sendMessageIMessage } from "../imessage/send.js";
import { sendMessageSignal } from "../signal/send.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { resolveTelegramToken } from "../telegram/token.js";
import { normalizeE164 } from "../utils.js";
import { sendMessageWhatsApp } from "../web/outbound.js";

import type { Task, TaskProgressReport, TaskStep } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProgressReporterDeps = {
  sendWhatsApp?: typeof sendMessageWhatsApp;
  sendTelegram?: typeof sendMessageTelegram;
  sendDiscord?: typeof sendMessageDiscord;
  sendSignal?: typeof sendMessageSignal;
  sendIMessage?: typeof sendMessageIMessage;
};

type ResolvedTarget = {
  channel: "whatsapp" | "telegram" | "discord" | "signal" | "imessage";
  to: string;
  /** Telegram forum topic ID (message_thread_id) for topic-aware delivery. */
  messageThreadId?: number;
};

// ─── Target Resolution ───────────────────────────────────────────────────────
// Follows the same pattern as resolveDeliveryTarget() in isolated-agent.ts.

function resolveReportTarget(
  cfg: ClawdisConfig,
  task: Task,
): ResolvedTarget | null {
  const sessionCfg = cfg.session;
  const mainKey = (sessionCfg?.mainKey ?? "main").trim() || "main";
  const storePath = resolveStorePath(sessionCfg?.store);
  const store = loadSessionStore(storePath);
  const main = store[mainKey];

  const requestedChannel = task.reportChannel ?? "last";
  const explicitTo = task.reportTo?.trim() || undefined;

  const lastChannel =
    main?.lastChannel && main.lastChannel !== "webchat"
      ? main.lastChannel
      : undefined;
  const lastTo = typeof main?.lastTo === "string" ? main.lastTo.trim() : "";

  const channel = (() => {
    if (
      requestedChannel === "whatsapp" ||
      requestedChannel === "telegram" ||
      requestedChannel === "discord" ||
      requestedChannel === "signal" ||
      requestedChannel === "imessage"
    ) {
      return requestedChannel;
    }
    return (lastChannel as ResolvedTarget["channel"]) ?? "telegram";
  })();

  const to = explicitTo || lastTo || undefined;
  if (!to) return null;

  // Carry through the Telegram forum topic ID for topic-aware delivery.
  const messageThreadId =
    channel === "telegram" ? task.reportTopicId : undefined;

  if (channel === "whatsapp") {
    const rawAllow = cfg.whatsapp?.allowFrom ?? [];
    if (rawAllow.includes("*")) return { channel, to };
    const allowFrom = rawAllow
      .map((val) => normalizeE164(val))
      .filter((val) => val.length > 1);
    if (allowFrom.length === 0) return { channel, to };
    const normalized = normalizeE164(to);
    if (allowFrom.includes(normalized)) return { channel, to: normalized };
    return { channel, to: allowFrom[0] };
  }

  return { channel, to, messageThreadId };
}

// ─── Message Formatting ──────────────────────────────────────────────────────

function formatProgressMessage(task: Task, step: TaskStep): string {
  const completedCount = task.steps.filter(
    (s) => s.status === "completed",
  ).length;
  const total = task.steps.length;
  const percent = Math.round((completedCount / total) * 100);
  const resultPreview = step.result
    ? `\nResult: ${step.result.slice(0, 300)}${step.result.length > 300 ? "…" : ""}`
    : "";
  return (
    `📋 [Task: ${task.name}] Step ${completedCount}/${total} done (${percent}%)` +
    `\n→ ${step.description}${resultPreview}`
  );
}

function formatCompletionMessage(task: Task): string {
  const summary = task.finalSummary
    ? `\nSummary: ${task.finalSummary.slice(0, 500)}${task.finalSummary.length > 500 ? "…" : ""}`
    : "";
  return `✅ [Task: ${task.name}] Complete!${summary}`;
}

function formatFailureMessage(task: Task, error: string): string {
  const stepInfo =
    task.currentStepIndex < task.steps.length
      ? ` at step ${task.currentStepIndex + 1}/${task.steps.length}`
      : "";
  return `❌ [Task: ${task.name}] Failed${stepInfo}: ${error.slice(0, 300)}`;
}

// ─── Delivery ────────────────────────────────────────────────────────────────

async function deliver(
  cfg: ClawdisConfig,
  target: ResolvedTarget,
  text: string,
  deps: ProgressReporterDeps,
): Promise<void> {
  const sendWA = deps.sendWhatsApp ?? sendMessageWhatsApp;
  const sendTG = deps.sendTelegram ?? sendMessageTelegram;
  const sendDC = deps.sendDiscord ?? sendMessageDiscord;
  const sendSIG = deps.sendSignal ?? sendMessageSignal;
  const sendIM = deps.sendIMessage ?? sendMessageIMessage;

  const textLimit = resolveTextChunkLimit(cfg, target.channel);
  const { token: telegramToken } = resolveTelegramToken(cfg);

  switch (target.channel) {
    case "whatsapp":
      for (const chunk of chunkText(text, textLimit)) {
        await sendWA(target.to, chunk, { verbose: false });
      }
      break;
    case "telegram":
      for (const chunk of chunkText(text, textLimit)) {
        await sendTG(target.to, chunk, {
          verbose: false,
          token: telegramToken || undefined,
          messageThreadId: target.messageThreadId,
        });
      }
      break;
    case "discord":
      await sendDC(target.to, text, { verbose: false });
      break;
    case "signal":
      for (const chunk of chunkText(text, textLimit)) {
        await sendSIG(target.to, chunk);
      }
      break;
    case "imessage":
      for (const chunk of chunkText(text, textLimit)) {
        await sendIM(target.to, chunk);
      }
      break;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check whether a progress report is due for the completed step.
 */
export function shouldReportProgress(task: Task, _step: TaskStep): boolean {
  const completedCount = task.steps.filter(
    (s) => s.status === "completed",
  ).length;
  return completedCount > 0 && completedCount % task.reportEverySteps === 0;
}

/**
 * Send a progress report for a completed step.
 */
export async function reportProgress(
  cfg: ClawdisConfig,
  task: Task,
  step: TaskStep,
  deps?: ProgressReporterDeps,
): Promise<TaskProgressReport | null> {
  const target = resolveReportTarget(cfg, task);
  if (!target) return null;

  const message = formatProgressMessage(task, step);
  await deliver(cfg, target, message, deps ?? {});

  const completedCount = task.steps.filter(
    (s) => s.status === "completed",
  ).length;
  const report: TaskProgressReport = {
    taskId: task.id,
    stepIndex: step.index,
    totalSteps: task.steps.length,
    percentComplete: Math.round((completedCount / task.steps.length) * 100),
    currentStepDescription: step.description,
    summary: message,
    sentAtMs: Date.now(),
    channel: target.channel,
    to: target.to,
  };
  return report;
}

/**
 * Send a task completion report.
 */
export async function reportCompletion(
  cfg: ClawdisConfig,
  task: Task,
  deps?: ProgressReporterDeps,
): Promise<void> {
  const target = resolveReportTarget(cfg, task);
  if (!target) return;
  const message = formatCompletionMessage(task);
  await deliver(cfg, target, message, deps ?? {});
}

/**
 * Send a task failure report.
 */
export async function reportFailure(
  cfg: ClawdisConfig,
  task: Task,
  error: string,
  deps?: ProgressReporterDeps,
): Promise<void> {
  const target = resolveReportTarget(cfg, task);
  if (!target) return;
  const message = formatFailureMessage(task, error);
  await deliver(cfg, target, message, deps ?? {});
}
