import crypto from "node:crypto";
import path from "node:path";
import { resolveQueueSettings } from "../auto-reply/reply/queue.js";
import { loadConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveMainSessionKey,
  resolveStorePath,
} from "../config/sessions.js";
import { callGateway } from "../gateway/call.js";
import { normalizeMainKey } from "../routing/session-key.js";
import { defaultRuntime } from "../runtime.js";
import {
  type DeliveryContext,
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.js";
import { resolveAgentConfig } from "./agent-scope.js";
import { completeDelegation, listDelegationsForAgent } from "./delegation-registry.js";
import { resolveAgentIdentity } from "./identity.js";
import { isEmbeddedPiRunActive, queueEmbeddedPiMessage } from "./pi-embedded.js";
import { type AnnounceQueueItem, enqueueAnnounce } from "./subagent-announce-queue.js";
import { resolveRootSessionKey } from "./subagent-registry.js";
import { readLatestAssistantReply } from "./tools/agent-step.js";

function formatDurationShort(valueMs?: number) {
  if (!valueMs || !Number.isFinite(valueMs) || valueMs <= 0) {
    return undefined;
  }
  const totalSeconds = Math.round(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTokenCount(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function formatUsd(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(4)}`;
}

function resolveModelCost(params: {
  provider?: string;
  model?: string;
  config: ReturnType<typeof loadConfig>;
}):
  | {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    }
  | undefined {
  const provider = params.provider?.trim();
  const model = params.model?.trim();
  if (!provider || !model) {
    return undefined;
  }
  const models = params.config.models?.providers?.[provider]?.models ?? [];
  const entry = models.find((candidate) => candidate.id === model);
  return entry?.cost;
}

async function waitForSessionUsage(params: { sessionKey: string }) {
  const cfg = loadConfig();
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
  const storePath = resolveStorePath(cfg.session?.store, { agentId });
  let entry = loadSessionStore(storePath)[params.sessionKey];
  if (!entry) {
    return { entry, storePath };
  }
  const hasTokens = () =>
    entry &&
    (typeof entry.totalTokens === "number" ||
      typeof entry.inputTokens === "number" ||
      typeof entry.outputTokens === "number");
  if (hasTokens()) {
    return { entry, storePath };
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    entry = loadSessionStore(storePath)[params.sessionKey];
    if (hasTokens()) {
      break;
    }
  }
  return { entry, storePath };
}

type DeliveryContextSource = Parameters<typeof deliveryContextFromSession>[0];

function resolveAnnounceOrigin(
  entry?: DeliveryContextSource,
  requesterOrigin?: DeliveryContext,
): DeliveryContext | undefined {
  // requesterOrigin (captured at spawn time) reflects the channel the user is
  // actually on and must take priority over the session entry, which may carry
  // stale lastChannel / lastTo values from a previous channel interaction.
  return mergeDeliveryContext(requesterOrigin, deliveryContextFromSession(entry));
}

async function sendAnnounce(item: AnnounceQueueItem) {
  const origin = item.origin;
  const threadId =
    origin?.threadId != null && origin.threadId !== "" ? String(origin.threadId) : undefined;
  await callGateway({
    method: "agent",
    params: {
      sessionKey: item.sessionKey,
      message: item.prompt,
      channel: origin?.channel,
      accountId: origin?.accountId,
      to: origin?.to,
      threadId,
      deliver: true,
      idempotencyKey: crypto.randomUUID(),
    },
    expectFinal: true,
    timeoutMs: 60_000,
  });
}

function resolveRequesterStoreKey(
  cfg: ReturnType<typeof loadConfig>,
  requesterSessionKey: string,
): string {
  const raw = requesterSessionKey.trim();
  if (!raw) {
    return raw;
  }
  if (raw === "global" || raw === "unknown") {
    return raw;
  }
  if (raw.startsWith("agent:")) {
    return raw;
  }
  const mainKey = normalizeMainKey(cfg.session?.mainKey);
  if (raw === "main" || raw === mainKey) {
    return resolveMainSessionKey(cfg);
  }
  const agentId = resolveAgentIdFromSessionKey(raw);
  return `agent:${agentId}:${raw}`;
}

function loadRequesterSessionEntry(requesterSessionKey: string) {
  const cfg = loadConfig();
  const canonicalKey = resolveRequesterStoreKey(cfg, requesterSessionKey);
  const agentId = resolveAgentIdFromSessionKey(canonicalKey);
  const storePath = resolveStorePath(cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[canonicalKey];
  return { cfg, entry, canonicalKey };
}

async function maybeQueueSubagentAnnounce(params: {
  requesterSessionKey: string;
  triggerMessage: string;
  summaryLine?: string;
  requesterOrigin?: DeliveryContext;
}): Promise<"steered" | "queued" | "none"> {
  const { cfg, entry } = loadRequesterSessionEntry(params.requesterSessionKey);
  const canonicalKey = resolveRequesterStoreKey(cfg, params.requesterSessionKey);
  const sessionId = entry?.sessionId;
  if (!sessionId) {
    return "none";
  }

  const queueSettings = resolveQueueSettings({
    cfg,
    channel: entry?.channel ?? entry?.lastChannel,
    sessionEntry: entry,
  });
  const isActive = isEmbeddedPiRunActive(sessionId);

  const shouldSteer = queueSettings.mode === "steer" || queueSettings.mode === "steer-backlog";
  if (shouldSteer) {
    const steered = queueEmbeddedPiMessage(sessionId, params.triggerMessage);
    if (steered) {
      return "steered";
    }
  }

  const shouldFollowup =
    queueSettings.mode === "followup" ||
    queueSettings.mode === "collect" ||
    queueSettings.mode === "steer-backlog" ||
    queueSettings.mode === "interrupt";
  if (isActive && (shouldFollowup || queueSettings.mode === "steer")) {
    const origin = resolveAnnounceOrigin(entry, params.requesterOrigin);
    enqueueAnnounce({
      key: canonicalKey,
      item: {
        prompt: params.triggerMessage,
        summaryLine: params.summaryLine,
        enqueuedAt: Date.now(),
        sessionKey: canonicalKey,
        origin,
      },
      settings: queueSettings,
      send: sendAnnounce,
    });
    return "queued";
  }

  return "none";
}

async function buildSubagentStatsLine(params: {
  sessionKey: string;
  startedAt?: number;
  endedAt?: number;
}) {
  const cfg = loadConfig();
  const { entry, storePath } = await waitForSessionUsage({
    sessionKey: params.sessionKey,
  });

  const sessionId = entry?.sessionId;
  const transcriptPath =
    sessionId && storePath ? path.join(path.dirname(storePath), `${sessionId}.jsonl`) : undefined;

  const input = entry?.inputTokens;
  const output = entry?.outputTokens;
  const total =
    entry?.totalTokens ??
    (typeof input === "number" && typeof output === "number" ? input + output : undefined);
  const runtimeMs =
    typeof params.startedAt === "number" && typeof params.endedAt === "number"
      ? Math.max(0, params.endedAt - params.startedAt)
      : undefined;

  const provider = entry?.modelProvider;
  const model = entry?.model;
  const costConfig = resolveModelCost({ provider, model, config: cfg });
  const cost =
    costConfig && typeof input === "number" && typeof output === "number"
      ? (input * costConfig.input + output * costConfig.output) / 1_000_000
      : undefined;

  const parts: string[] = [];
  const runtime = formatDurationShort(runtimeMs);
  parts.push(`runtime ${runtime ?? "n/a"}`);
  if (typeof total === "number") {
    const inputText = typeof input === "number" ? formatTokenCount(input) : "n/a";
    const outputText = typeof output === "number" ? formatTokenCount(output) : "n/a";
    const totalText = formatTokenCount(total);
    parts.push(`tokens ${totalText} (in ${inputText} / out ${outputText})`);
  } else {
    parts.push("tokens n/a");
  }
  const costText = formatUsd(cost);
  if (costText) {
    parts.push(`est ${costText}`);
  }
  parts.push(`sessionKey ${params.sessionKey}`);
  if (sessionId) {
    parts.push(`sessionId ${sessionId}`);
  }
  if (transcriptPath) {
    parts.push(`transcript ${transcriptPath}`);
  }

  return `Stats: ${parts.join(" \u2022 ")}`;
}

export function buildSubagentSystemPrompt(params: {
  requesterSessionKey?: string;
  requesterOrigin?: DeliveryContext;
  childSessionKey: string;
  label?: string;
  task?: string;
  cleanup?: "delete" | "keep" | "idle";
}) {
  const taskText =
    typeof params.task === "string" && params.task.trim()
      ? params.task.replace(/\s+/g, " ").trim()
      : "{{TASK_DESCRIPTION}}";
  const isIdle = params.cleanup === "idle";
  const lines = [
    "# Team Context",
    "",
    "You're working as part of a team on a specific assignment.",
    "",
    "## Your Assignment",
    `**Task:** ${taskText}`,
    "",
    "## How We Work",
    "- **Own your deliverable** — you're responsible for shipping quality work on this task",
    "- **Talk to your teammates** — use `sessions_send` to consult specialists, ask questions, share findings. Don't work in isolation",
    "- **Delegate when it makes sense** — if part of your task belongs to another specialist's domain, use `sessions_spawn` to delegate it (max depth: 3 levels)",
    "- **Be proactive** — if you spot something that affects another team member's work, ping them. That's what good teammates do",
    "- **Stay in scope** — your primary goal is this assignment. Side quests are fine only if they directly support the task",
    "",
    "## Communication Style",
    "- Write like you're on Slack with your team — clear, direct, informal",
    "- When consulting a specialist, be specific about what you need from them",
    "- When reporting back, lead with the key insight, then details",
    "- Skip the corporate speak. Just be real",
    "",
    "## When You're Done",
    "Wrap up with:",
    "1. What you shipped / found / decided",
    "2. Anything the team should know (blockers, risks, trade-offs)",
    "3. Keep it tight — your report goes straight to the team lead",
    "",
    isIdle
      ? "Your session stays open for follow-ups. The team lead might have questions or need you to iterate."
      : "Your session closes after you deliver. That's normal — you did your part.",
    "",
    "## Boundaries",
    "- Don't reply directly to end users (that's the orchestrator's job)",
    "- Don't schedule cron jobs or set up persistent processes",
    "- Don't pretend to be the team lead or orchestrator",
    "",
    "## Session Info",
    params.label ? `- Label: ${params.label}` : undefined,
    params.requesterSessionKey ? `- Team lead session: ${params.requesterSessionKey}` : undefined,
    params.requesterOrigin?.channel ? `- Channel: ${params.requesterOrigin.channel}` : undefined,
    `- Your session: ${params.childSessionKey}`,
    "",
  ].filter((line): line is string => line !== undefined);
  return lines.join("\n");
}

export type SubagentRunOutcome = {
  status: "ok" | "error" | "timeout" | "unknown";
  error?: string;
};

export async function runSubagentAnnounceFlow(params: {
  childSessionKey: string;
  childRunId: string;
  requesterSessionKey: string;
  requesterOrigin?: DeliveryContext;
  requesterDisplayKey: string;
  task: string;
  timeoutMs: number;
  cleanup: "delete" | "keep" | "idle";
  roundOneReply?: string;
  waitForCompletion?: boolean;
  startedAt?: number;
  endedAt?: number;
  label?: string;
  outcome?: SubagentRunOutcome;
}): Promise<boolean> {
  let didAnnounce = false;
  try {
    const requesterOrigin = normalizeDeliveryContext(params.requesterOrigin);
    let reply = params.roundOneReply;
    let outcome: SubagentRunOutcome | undefined = params.outcome;
    if (!reply && params.waitForCompletion !== false) {
      const waitMs = Math.min(params.timeoutMs, 60_000);
      const wait = await callGateway<{
        status?: string;
        startedAt?: number;
        endedAt?: number;
        error?: string;
      }>({
        method: "agent.wait",
        params: {
          runId: params.childRunId,
          timeoutMs: waitMs,
        },
        timeoutMs: waitMs + 2000,
      });
      const waitError = typeof wait?.error === "string" ? wait.error : undefined;
      if (wait?.status === "timeout") {
        outcome = { status: "timeout" };
      } else if (wait?.status === "error") {
        outcome = { status: "error", error: waitError };
      } else if (wait?.status === "ok") {
        outcome = { status: "ok" };
      }
      if (typeof wait?.startedAt === "number" && !params.startedAt) {
        params.startedAt = wait.startedAt;
      }
      if (typeof wait?.endedAt === "number" && !params.endedAt) {
        params.endedAt = wait.endedAt;
      }
      if (wait?.status === "timeout") {
        if (!outcome) {
          outcome = { status: "timeout" };
        }
      }
      reply = await readLatestAssistantReply({
        sessionKey: params.childSessionKey,
      });
    }

    if (!reply) {
      reply = await readLatestAssistantReply({
        sessionKey: params.childSessionKey,
      });
    }

    if (!outcome) {
      outcome = { status: "unknown" };
    }

    // Build stats
    const statsLine = await buildSubagentStatsLine({
      sessionKey: params.childSessionKey,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
    });

    // Build status label
    const statusLabel =
      outcome.status === "ok"
        ? "completed successfully"
        : outcome.status === "timeout"
          ? "timed out"
          : outcome.status === "error"
            ? `failed: ${outcome.error || "unknown error"}`
            : "finished with unknown status";

    // Check announce mode from config
    const cfg = loadConfig();
    const childAgentId = resolveAgentIdFromSessionKey(params.childSessionKey);
    const announceMode = cfg.agents?.defaults?.subagents?.announceMode ?? "system";

    // Build message based on announce mode
    const taskLabel = params.label || params.task || "background task";
    let triggerMessage: string;
    let useDirectInject = false;

    // Resolve agent identity for direct mode
    const identity = resolveAgentIdentity(cfg, childAgentId);
    const agentConfig = resolveAgentConfig(cfg, childAgentId);
    const senderEmoji = identity?.emoji ?? "🤖";
    const senderName = agentConfig?.name ?? identity?.name ?? childAgentId;
    const senderAvatar = identity?.avatar;

    if (announceMode === "direct") {
      // Direct mode: inject response with agent identity, no main agent processing
      if (outcome.status === "ok" && reply) {
        // Success: use plain response (identity will be shown via senderIdentity)
        triggerMessage = reply;
        useDirectInject = true;
      } else {
        // Error/timeout: still show with identity but indicate issue
        const errorNote =
          outcome.status === "timeout"
            ? "(tempo esgotado)"
            : outcome.status === "error"
              ? `(erro: ${outcome.error || "desconhecido"})`
              : "(status desconhecido)";
        triggerMessage = `${reply || "(sem resposta)"} ${errorNote}`;
        useDirectInject = true;
      }
    } else {
      // System mode (default): wrap in background task format for main agent to summarize
      triggerMessage = [
        `A background task "${taskLabel}" just ${statusLabel}.`,
        "",
        "Findings:",
        reply || "(no output)",
        "",
        statsLine,
        "",
        "Summarize this naturally for the user. Keep it brief (1-2 sentences). Flow it into the conversation naturally.",
        "Do not mention technical details like tokens, stats, or that this was a background task.",
        "You can respond with NO_REPLY if no announcement is needed (e.g., internal task with no user-facing result).",
      ].join("\n");
    }

    // Skip queue for direct inject mode - always inject immediately with identity
    if (!useDirectInject) {
      const queued = await maybeQueueSubagentAnnounce({
        requesterSessionKey: params.requesterSessionKey,
        triggerMessage,
        summaryLine: taskLabel,
        requesterOrigin,
      });
      if (queued === "steered") {
        didAnnounce = true;
        return true;
      }
      if (queued === "queued") {
        didAnnounce = true;
        return true;
      }
    }

    // Resolve delivery context
    let directOrigin = requesterOrigin;
    if (!directOrigin) {
      const { entry } = loadRequesterSessionEntry(params.requesterSessionKey);
      directOrigin = deliveryContextFromSession(entry);
    }

    // Always resolve root webchat session so results are visible to the human
    const rootSession = resolveRootSessionKey(params.requesterSessionKey);

    if (useDirectInject) {
      // Direct mode: inject message directly to chat with agent identity
      await callGateway({
        method: "chat.inject",
        params: {
          sessionKey: rootSession,
          message: triggerMessage,
          // Pass sender identity for webchat display
          senderAgentId: childAgentId,
          senderName,
          senderEmoji,
          senderAvatar,
        },
        timeoutMs: 30_000,
      });
    } else {
      // System mode: also inject into root webchat for Slack-like visibility,
      // then send to main agent for summarization
      try {
        await callGateway({
          method: "chat.inject",
          params: {
            sessionKey: rootSession,
            message: `Task completed: ${taskLabel}\n\n${(reply || "(no output)").slice(0, 500)}`,
            senderAgentId: childAgentId,
            senderName,
            senderEmoji,
            senderAvatar,
          },
          timeoutMs: 10_000,
        });
      } catch {
        // Non-critical — still send to main agent below
      }

      await callGateway({
        method: "agent",
        params: {
          sessionKey: params.requesterSessionKey,
          message: triggerMessage,
          deliver: true,
          channel: directOrigin?.channel,
          accountId: directOrigin?.accountId,
          to: directOrigin?.to,
          threadId:
            directOrigin?.threadId != null && directOrigin.threadId !== ""
              ? String(directOrigin.threadId)
              : undefined,
          idempotencyKey: crypto.randomUUID(),
        },
        expectFinal: true,
        timeoutMs: 60_000,
      });
    }

    didAnnounce = true;
    // Auto-close delegation records when subagent finishes
    try {
      const targetAgentId = resolveAgentIdFromSessionKey(params.childSessionKey);
      const delegs = listDelegationsForAgent(targetAgentId).filter(
        (d) =>
          d.toSessionKey === params.childSessionKey &&
          d.state !== "completed" &&
          d.state !== "failed",
      );
      for (const d of delegs) {
        completeDelegation(d.id, {
          status: outcome.status === "ok" ? "success" : "failure",
          summary: "Subagent task completed",
        });
      }
    } catch {
      // Non-critical
    }
  } catch (err) {
    defaultRuntime.error?.(`Subagent announce failed: ${String(err)}`);
    // Best-effort follow-ups; ignore failures to avoid breaking the caller response.
  } finally {
    // Patch label after all writes complete
    if (params.label) {
      try {
        await callGateway({
          method: "sessions.patch",
          params: { key: params.childSessionKey, label: params.label },
          timeoutMs: 10_000,
        });
      } catch {
        // Best-effort
      }
    }
    // "idle" mode: keep session alive for follow-up instructions.
    // "keep" mode: delete after successful announce only (handled in finalizeSubagentCleanup).
    // "delete" mode: delete immediately.
    if (params.cleanup === "delete") {
      try {
        await callGateway({
          method: "sessions.delete",
          params: { key: params.childSessionKey, deleteTranscript: true },
          timeoutMs: 10_000,
        });
      } catch {
        // ignore
      }
    }
  }
  return didAnnounce;
}
