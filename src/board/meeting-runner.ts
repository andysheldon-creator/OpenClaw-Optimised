/**
 * Board of Directors — Async Meeting Runner
 *
 * Replaces the synchronous text-pipe approach in executeMeeting() with
 * real task-based autonomous meetings. Each specialist gets a full
 * multi-step task (Plan → Execute → Synthesize) that runs with tools,
 * web search, etc. — delivering progress to their own Telegram topic.
 *
 * When all specialist tasks complete, a General synthesis task is created
 * automatically. The final summary is delivered to the General topic.
 *
 * Flow:
 *   1. startAsyncBoardMeeting() → creates 5 specialist tasks in parallel
 *   2. Each task reports progress to its own Telegram topic
 *   3. onMeetingTaskComplete() fires as each finishes
 *   4. When all done → createAgentTask() for General to synthesize
 *   5. General synthesis delivered to General topic → meeting complete
 */

import crypto from "node:crypto";

import type { ClawdisConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging.js";
import { sendMessageTelegram } from "../telegram/send.js";
import { resolveTelegramToken } from "../telegram/token.js";
import type { Task } from "../tasks/types.js";

import {
  createAgentTask,
  onMeetingTaskComplete,
} from "./agent-tasks.js";
import { resolveAgentDef } from "./agents.js";
import type { BoardAgentRole } from "./types.js";

const log = createSubsystemLogger("board:meeting");

// ── Types ───────────────────────────────────────────────────────────────────

export type AsyncMeetingState = {
  /** Unique meeting ID. */
  id: string;
  /** The topic being discussed. */
  topic: string;
  /** Current status. */
  status: "running" | "synthesizing" | "completed" | "failed" | "cancelled";
  /** Map from agent role → task ID. */
  agentTaskIds: Map<BoardAgentRole, string>;
  /** Map from agent role → task result text (filled as tasks complete). */
  agentResults: Map<BoardAgentRole, string>;
  /** The General synthesis task ID (set when synthesis begins). */
  synthesisTaskId?: string;
  /** Telegram group chat ID for announcements. */
  chatId: string;
  /** Config snapshot for creating synthesis task later. */
  config: ClawdisConfig;
  /** Workspace dir for personality loading. */
  workspaceDir: string;
  /** Timestamps. */
  startedAt: number;
  completedAt?: number;
  /** Max duration in ms (default: 30 minutes). */
  maxDurationMs: number;
};

// ── Meeting Store ───────────────────────────────────────────────────────────

const ASYNC_MEETINGS = new Map<string, AsyncMeetingState>();

/** Max concurrent async meetings. */
const MAX_ASYNC_MEETINGS = 3;

/** Default max meeting duration: 30 minutes. */
const DEFAULT_MEETING_DURATION_MS = 30 * 60 * 1000;

// ── Specialists ─────────────────────────────────────────────────────────────

const SPECIALIST_ROLES: readonly BoardAgentRole[] = [
  "research",
  "finance",
  "content",
  "strategy",
  "critic",
] as const;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start an async board meeting. Creates specialist tasks that run
 * autonomously via the task runner.
 *
 * Returns an acknowledgment message for the user.
 */
export async function startAsyncBoardMeeting(params: {
  topic: string;
  config: ClawdisConfig;
  workspaceDir: string;
}): Promise<string> {
  const { topic, config, workspaceDir } = params;
  const boardConfig = config.board;

  // Check limits
  const active = Array.from(ASYNC_MEETINGS.values()).filter(
    (m) => m.status === "running" || m.status === "synthesizing",
  );
  if (active.length >= MAX_ASYNC_MEETINGS) {
    return "⚠️ Too many board meetings in progress. Please wait for one to complete.";
  }

  // Resolve chat ID for announcements
  const chatId = boardConfig?.telegramGroupId
    ? String(boardConfig.telegramGroupId)
    : "";

  const meetingId = `async-meeting-${crypto.randomUUID().slice(0, 8)}`;
  const maxDurationMs =
    boardConfig?.meetings?.maxDurationMs ?? DEFAULT_MEETING_DURATION_MS;

  // Create the meeting state
  const meeting: AsyncMeetingState = {
    id: meetingId,
    topic,
    status: "running",
    agentTaskIds: new Map(),
    agentResults: new Map(),
    chatId,
    config,
    workspaceDir,
    startedAt: Date.now(),
    maxDurationMs,
  };

  ASYNC_MEETINGS.set(meetingId, meeting);

  // Announce the meeting in the General topic
  if (chatId) {
    const generalDef = resolveAgentDef("general", boardConfig?.agents);
    const { token } = resolveTelegramToken(config);
    try {
      await sendMessageTelegram(chatId,
        `🏛️ **Board Meeting Called**\n\n` +
        `📋 **Topic:** ${topic}\n\n` +
        `Specialists are being briefed. Each will work autonomously and ` +
        `report progress in their own topics. A synthesis will follow ` +
        `once all perspectives are gathered.`,
        {
          token: token || undefined,
          messageThreadId: generalDef.telegramTopicId,
          verbose: false,
        },
      );
    } catch (err) {
      log.warn(`Failed to announce meeting: ${String(err)}`);
    }
  }

  // Create specialist tasks in parallel
  const taskPromises = SPECIALIST_ROLES.map(async (role) => {
    const agentDef = resolveAgentDef(role, boardConfig?.agents);
    try {
      const result = await createAgentTask({
        role,
        directive: buildSpecialistDirective(agentDef.title, topic),
        config,
        workspaceDir,
        meetingId,
        // Custom single-step for meetings (faster than 3-step)
        customSteps: [
          {
            description: `${agentDef.emoji} ${agentDef.name}: Analyzing "${topic.slice(0, 50)}"`,
            prompt: buildSpecialistPrompt(role, agentDef.title, topic),
          },
        ],
        reportEverySteps: 1,
      });
      meeting.agentTaskIds.set(role, result.task.id);
      log.info(
        `Meeting ${meetingId}: created task ${result.task.id} for ${role}`,
      );
    } catch (err) {
      log.error(
        `Meeting ${meetingId}: failed to create task for ${role}: ${String(err)}`,
      );
    }
  });

  await Promise.allSettled(taskPromises);

  // Check if we created any tasks
  if (meeting.agentTaskIds.size === 0) {
    meeting.status = "failed";
    return "❌ Failed to create any specialist tasks for the board meeting.";
  }

  log.info(
    `Meeting ${meetingId} started: "${topic}" with ${meeting.agentTaskIds.size} specialists`,
  );

  // Build acknowledgment
  const roles = Array.from(meeting.agentTaskIds.keys());
  const roleEmojis = roles.map((r) => {
    const def = resolveAgentDef(r, boardConfig?.agents);
    return `${def.emoji} ${def.name}`;
  });

  return (
    `🏛️ **Board Meeting: "${topic}"**\n\n` +
    `Specialists briefed:\n` +
    roleEmojis.map((r) => `• ${r}`).join("\n") +
    `\n\nEach agent will work autonomously with real tools. ` +
    `Progress appears in their topics. ` +
    `A synthesis will be delivered when all are done.`
  );
}

/**
 * Get the current status of an async meeting.
 */
export function getAsyncMeeting(
  meetingId: string,
): AsyncMeetingState | undefined {
  return ASYNC_MEETINGS.get(meetingId);
}

/**
 * List active async meetings.
 */
export function getActiveAsyncMeetings(): AsyncMeetingState[] {
  return Array.from(ASYNC_MEETINGS.values()).filter(
    (m) => m.status === "running" || m.status === "synthesizing",
  );
}

/**
 * Cancel an async meeting.
 */
export function cancelAsyncMeeting(meetingId: string): boolean {
  const meeting = ASYNC_MEETINGS.get(meetingId);
  if (!meeting) return false;
  meeting.status = "cancelled";
  meeting.completedAt = Date.now();
  return true;
}

/**
 * Clean up old completed meetings.
 */
export function cleanupOldAsyncMeetings(
  maxAgeMs: number = 3_600_000,
): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, meeting] of ASYNC_MEETINGS) {
    if (
      meeting.status === "completed" ||
      meeting.status === "failed" ||
      meeting.status === "cancelled"
    ) {
      const endTime = meeting.completedAt ?? meeting.startedAt;
      if (now - endTime > maxAgeMs) {
        ASYNC_MEETINGS.delete(id);
        cleaned++;
      }
    }
  }
  return cleaned;
}

/** Clear all meetings (for testing). */
export function clearAllAsyncMeetings(): void {
  ASYNC_MEETINGS.clear();
}

// ── Meeting Task Completion ─────────────────────────────────────────────────

/**
 * Called when a specialist's task completes (via the hook chain:
 * runner.ts → agent-tasks.ts → meeting-runner.ts).
 *
 * Checks if all specialists are done and triggers synthesis if so.
 */
async function handleMeetingTaskComplete(
  meetingId: string,
  completedTask: Task,
): Promise<void> {
  const meeting = ASYNC_MEETINGS.get(meetingId);
  if (!meeting || meeting.status !== "running") return;

  const role = completedTask.metadata?.agentRole as
    | BoardAgentRole
    | undefined;
  if (!role) return;

  // Store this agent's result
  const result = completedTask.finalResult ?? completedTask.finalSummary ?? "";
  meeting.agentResults.set(role, result);

  log.info(
    `Meeting ${meetingId}: ${role} completed (${meeting.agentResults.size}/${meeting.agentTaskIds.size})`,
  );

  // Check if all specialists are done
  const allDone = Array.from(meeting.agentTaskIds.keys()).every(
    (r) => meeting.agentResults.has(r),
  );

  if (!allDone) return;

  // Check timeout
  if (Date.now() - meeting.startedAt > meeting.maxDurationMs) {
    meeting.status = "failed";
    meeting.completedAt = Date.now();
    log.warn(`Meeting ${meetingId} timed out`);
    return;
  }

  // All specialists done → trigger synthesis
  meeting.status = "synthesizing";
  log.info(`Meeting ${meetingId}: all specialists done, triggering synthesis`);

  try {
    await triggerSynthesis(meeting);
  } catch (err) {
    log.error(`Meeting ${meetingId}: synthesis failed: ${String(err)}`);
    meeting.status = "failed";
    meeting.completedAt = Date.now();
  }
}

/**
 * Create a synthesis task for the General agent with all specialist results.
 */
async function triggerSynthesis(meeting: AsyncMeetingState): Promise<void> {
  const boardConfig = meeting.config.board;

  // Build the synthesis prompt with all specialist results
  const specialistInputs = Array.from(meeting.agentResults.entries())
    .map(([role, result]) => {
      const def = resolveAgentDef(role, boardConfig?.agents);
      return `### ${def.emoji} ${def.name} (${def.title})\n${result}`;
    })
    .join("\n\n");

  const synthesisDirective = `Synthesize board meeting: "${meeting.topic}"`;

  const synthesisPrompt = [
    `[Board Meeting Synthesis — Topic: ${meeting.topic}]`,
    "",
    "All board members have completed their autonomous analysis. Each specialist " +
      "used real tools (web search, data analysis) to gather evidence. " +
      "Their full reports are below:",
    "",
    specialistInputs,
    "",
    "---",
    "",
    "As the General (Orchestrator), synthesize ALL perspectives into a clear, " +
      "actionable executive recommendation.",
    "",
    "Structure your synthesis as:",
    "1. **Executive Summary** — One-paragraph recommendation",
    "2. **Key Findings** — Top 3-5 insights across all specialist reports",
    "3. **Recommendation** — What to do, with specific rationale",
    "4. **Risks & Mitigations** — Main risks identified by the Critic and others",
    "5. **Next Steps** — Concrete, prioritized actions",
    "",
    "This is a high-stakes board decision. Be specific and decisive.",
  ].join("\n");

  const result = await createAgentTask({
    role: "general",
    directive: synthesisDirective,
    config: meeting.config,
    workspaceDir: meeting.workspaceDir,
    meetingId: meeting.id,
    customSteps: [
      {
        description: `🎯 General: Synthesizing board meeting on "${meeting.topic.slice(0, 50)}"`,
        prompt: synthesisPrompt,
      },
    ],
  });

  meeting.synthesisTaskId = result.task.id;
  log.info(
    `Meeting ${meeting.id}: synthesis task ${result.task.id} created`,
  );
}

// ── Meeting Synthesis Completion ────────────────────────────────────────────

/**
 * Also handles completion of the General's synthesis task.
 * The same hook fires for the synthesis task as for specialist tasks.
 */
async function handleSynthesisComplete(
  meeting: AsyncMeetingState,
  completedTask: Task,
): Promise<void> {
  meeting.status = "completed";
  meeting.completedAt = Date.now();

  const synthesis = completedTask.finalResult ?? completedTask.finalSummary ?? "";
  const durationSec = Math.round(
    (meeting.completedAt - meeting.startedAt) / 1000,
  );

  log.info(
    `Meeting ${meeting.id} completed in ${durationSec}s`,
  );

  // Deliver the final summary to the General topic
  if (meeting.chatId) {
    const generalDef = resolveAgentDef(
      "general",
      meeting.config.board?.agents,
    );
    const { token } = resolveTelegramToken(meeting.config);

    const summary =
      `🏛️ **Board Meeting Complete: "${meeting.topic}"**\n` +
      `*${meeting.agentResults.size} specialists responded (${durationSec}s)*\n\n` +
      synthesis;

    try {
      await sendMessageTelegram(meeting.chatId, summary, {
        token: token || undefined,
        messageThreadId: generalDef.telegramTopicId,
        verbose: false,
      });
    } catch (err) {
      log.warn(`Failed to deliver meeting summary: ${String(err)}`);
    }
  }
}

// ── Combined Hook ───────────────────────────────────────────────────────────

/**
 * Entry point called from agent-tasks.ts via onMeetingTaskComplete hook.
 * Routes to specialist completion or synthesis completion.
 */
async function meetingTaskCompleteHandler(
  meetingId: string,
  completedTask: Task,
): Promise<void> {
  const meeting = ASYNC_MEETINGS.get(meetingId);
  if (!meeting) return;

  // Check if this is the synthesis task completing
  if (
    meeting.status === "synthesizing" &&
    meeting.synthesisTaskId &&
    completedTask.id === meeting.synthesisTaskId
  ) {
    await handleSynthesisComplete(meeting, completedTask);
    return;
  }

  // Otherwise it's a specialist task completing
  if (meeting.status === "running") {
    await handleMeetingTaskComplete(meetingId, completedTask);
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

/**
 * Register the meeting completion hook with agent-tasks.ts.
 * Call this during bot startup (after initAgentTasks).
 */
export function initMeetingRunner(): void {
  onMeetingTaskComplete(meetingTaskCompleteHandler);
  log.info("Meeting runner initialized");
}

// ── Prompt Helpers ──────────────────────────────────────────────────────────

function buildSpecialistDirective(title: string, topic: string): string {
  return `Board meeting analysis (${title}): ${topic}`;
}

function buildSpecialistPrompt(
  role: BoardAgentRole,
  title: string,
  topic: string,
): string {
  return [
    `[Board Meeting — You are the ${title}]`,
    "",
    "The General has called a board meeting on the following topic:",
    "",
    `**Topic:** ${topic}`,
    "",
    `As the ${title}, conduct a thorough analysis using your expertise.`,
    "Use web search and any available tools to gather real, current data.",
    "",
    "Provide:",
    "1. **Key findings** — backed by evidence and data",
    "2. **Analysis** — your expert interpretation through the lens of your role",
    "3. **Recommendations** — specific, actionable advice",
    "4. **Risks/concerns** — what could go wrong from your perspective",
    "5. **Key data points** — specific numbers, quotes, or facts (as bullet points)",
    "",
    "Be thorough and evidence-based. This is a real board decision.",
  ].join("\n");
}
