/**
 * Board of Directors — Meeting Coordination
 *
 * Orchestrates multi-agent "board meetings" where the General agent
 * coordinates input from all specialists on a topic, then synthesizes
 * a final recommendation.
 */

import crypto from "node:crypto";

import { resolveAgentDef } from "./agents.js";
import type {
  BoardAgentDef,
  BoardAgentRole,
  BoardMeeting,
  MeetingAgentInput,
} from "./types.js";

// ── Meeting Store ────────────────────────────────────────────────────────────

/** In-memory meeting store. Meetings are short-lived coordination objects. */
const MEETINGS = new Map<string, BoardMeeting>();

/** Maximum concurrent meetings. */
const MAX_CONCURRENT_MEETINGS = 3;

// ── Meeting Lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new board meeting.
 * Returns undefined if too many meetings are already active.
 */
export function createMeeting(params: {
  topic: string;
  initiatedBy?: BoardAgentRole;
  maxDurationMs?: number;
  maxTurnsPerAgent?: number;
  configAgents?: Array<{
    role: string;
    name?: string;
    emoji?: string;
  }>;
}): BoardMeeting | undefined {
  // Limit concurrent meetings
  const activeMeetings = Array.from(MEETINGS.values()).filter(
    (m) => m.status === "pending" || m.status === "in-progress",
  );
  if (activeMeetings.length >= MAX_CONCURRENT_MEETINGS) {
    return undefined;
  }

  const {
    topic,
    initiatedBy = "general",
    maxDurationMs = 600_000,
    maxTurnsPerAgent = 3,
    configAgents,
  } = params;

  // Build input slots for each specialist (excluding the orchestrator)
  const specialists: BoardAgentRole[] = [
    "research",
    "finance",
    "content",
    "strategy",
    "critic",
  ];

  const inputs: MeetingAgentInput[] = specialists.map((role) => {
    const agent = resolveAgentDef(role, configAgents);
    return {
      agent: role,
      status: "pending" as const,
      prompt: buildMeetingPromptForAgent(agent, topic),
    };
  });

  const meeting: BoardMeeting = {
    id: `meeting-${crypto.randomUUID().slice(0, 8)}`,
    topic,
    status: "pending",
    initiatedBy,
    inputs,
    createdAt: Date.now(),
    maxDurationMs,
    maxTurnsPerAgent,
  };

  MEETINGS.set(meeting.id, meeting);
  return meeting;
}

/**
 * Start executing a meeting (transition from pending to in-progress).
 */
export function startMeeting(meetingId: string): BoardMeeting | undefined {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting || meeting.status !== "pending") return undefined;

  meeting.status = "in-progress";
  meeting.startedAt = Date.now();
  return meeting;
}

/**
 * Record an agent's response in the meeting.
 */
export function recordAgentInput(
  meetingId: string,
  agentRole: BoardAgentRole,
  response: string,
  durationMs?: number,
): BoardMeeting | undefined {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return undefined;
  if (meeting.status !== "in-progress") return undefined;

  const input = meeting.inputs.find((i) => i.agent === agentRole);
  if (!input) return undefined;

  input.response = response;
  input.status = "completed";
  input.completedAt = Date.now();
  input.durationMs = durationMs;

  // Check if all inputs are completed or failed/skipped
  const allDone = meeting.inputs.every(
    (i) =>
      i.status === "completed" ||
      i.status === "failed" ||
      i.status === "skipped",
  );
  if (allDone) {
    meeting.status = "synthesizing";
  }

  return meeting;
}

/**
 * Mark an agent's input as failed (e.g., timeout).
 */
export function failAgentInput(
  meetingId: string,
  agentRole: BoardAgentRole,
  reason?: string,
): BoardMeeting | undefined {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return undefined;

  const input = meeting.inputs.find((i) => i.agent === agentRole);
  if (!input) return undefined;

  input.status = "failed";
  input.response = reason ?? "Agent failed to respond";
  input.completedAt = Date.now();

  // Check if all done
  const allDone = meeting.inputs.every(
    (i) =>
      i.status === "completed" ||
      i.status === "failed" ||
      i.status === "skipped",
  );
  if (allDone) {
    meeting.status = "synthesizing";
  }

  return meeting;
}

/**
 * Skip an agent's input (e.g., agent not relevant to this topic).
 */
export function skipAgentInput(
  meetingId: string,
  agentRole: BoardAgentRole,
): BoardMeeting | undefined {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return undefined;

  const input = meeting.inputs.find((i) => i.agent === agentRole);
  if (!input) return undefined;

  input.status = "skipped";
  input.completedAt = Date.now();

  return meeting;
}

/**
 * Set the final synthesis and complete the meeting.
 */
export function completeMeeting(
  meetingId: string,
  synthesis: string,
): BoardMeeting | undefined {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return undefined;
  if (meeting.status !== "synthesizing" && meeting.status !== "in-progress") {
    return undefined;
  }

  meeting.synthesis = synthesis;
  meeting.status = "completed";
  meeting.completedAt = Date.now();
  return meeting;
}

/**
 * Cancel a meeting.
 */
export function cancelMeeting(meetingId: string): boolean {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return false;
  meeting.status = "cancelled";
  meeting.completedAt = Date.now();
  return true;
}

/**
 * Check if a meeting has exceeded its max duration.
 */
export function isMeetingTimedOut(meetingId: string): boolean {
  const meeting = MEETINGS.get(meetingId);
  if (!meeting) return false;
  if (meeting.status === "completed" || meeting.status === "cancelled") {
    return false;
  }
  const startTime = meeting.startedAt ?? meeting.createdAt;
  return Date.now() - startTime > meeting.maxDurationMs;
}

// ── Meeting Queries ──────────────────────────────────────────────────────────

export function getMeeting(meetingId: string): BoardMeeting | undefined {
  return MEETINGS.get(meetingId);
}

export function getActiveMeetings(): BoardMeeting[] {
  return Array.from(MEETINGS.values()).filter(
    (m) =>
      m.status === "pending" ||
      m.status === "in-progress" ||
      m.status === "synthesizing",
  );
}

/**
 * Clean up completed/cancelled/failed meetings older than the given age.
 */
export function cleanupOldMeetings(maxAgeMs: number = 3_600_000): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, meeting] of MEETINGS) {
    if (
      meeting.status === "completed" ||
      meeting.status === "cancelled" ||
      meeting.status === "failed"
    ) {
      const endTime = meeting.completedAt ?? meeting.createdAt;
      if (now - endTime > maxAgeMs) {
        MEETINGS.delete(id);
        cleaned++;
      }
    }
  }
  return cleaned;
}

/** Clear all meetings (for testing). */
export function clearAllMeetings(): void {
  MEETINGS.clear();
}

// ── Prompt Building ──────────────────────────────────────────────────────────

/**
 * Build the consultation prompt for a specialist in a board meeting.
 */
function buildMeetingPromptForAgent(
  agent: BoardAgentDef,
  topic: string,
): string {
  const lines: string[] = [];
  lines.push(`[Board Meeting — ${agent.emoji} ${agent.name} (${agent.title})]`);
  lines.push("");
  lines.push("The General has called a board meeting on the following topic:");
  lines.push("");
  lines.push(`**Topic:** ${topic}`);
  lines.push("");
  lines.push(
    `As the ${agent.title}, provide your specialist analysis. Focus specifically on what your expertise reveals about this topic.`,
  );
  lines.push("");
  lines.push("Be concise but thorough. Structure your response with:");
  lines.push("1. **Key findings** from your area of expertise");
  lines.push("2. **Recommendations** — what you'd advise");
  lines.push("3. **Risks/concerns** specific to your domain");
  lines.push("4. **Questions** the board should consider");
  return lines.join("\n");
}

/**
 * Build the synthesis prompt for the General agent after all inputs are collected.
 */
export function buildSynthesisPrompt(meeting: BoardMeeting): string {
  const lines: string[] = [];
  lines.push(`[Board Meeting Synthesis — Topic: ${meeting.topic}]`);
  lines.push("");
  lines.push(
    "All board members have provided their input. Below is what each specialist reported:",
  );
  lines.push("");

  for (const input of meeting.inputs) {
    const label =
      input.status === "completed"
        ? `${input.agent.toUpperCase()}`
        : `${input.agent.toUpperCase()} (${input.status})`;

    lines.push(`### ${label}`);
    if (input.response) {
      lines.push(input.response);
    } else {
      lines.push("*No response received.*");
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "As the General (Orchestrator), synthesize all perspectives above into a clear, actionable recommendation.",
  );
  lines.push("");
  lines.push("Structure your synthesis as:");
  lines.push("1. **Executive Summary** — One-paragraph recommendation");
  lines.push("2. **Key Findings** — Top 3-5 insights across all perspectives");
  lines.push("3. **Recommendation** — What to do, with rationale");
  lines.push("4. **Risks & Mitigations** — Main risks and how to address them");
  lines.push("5. **Next Steps** — Concrete actions to take");

  return lines.join("\n");
}

/**
 * Format a completed meeting as a user-facing summary.
 */
export function formatMeetingSummary(meeting: BoardMeeting): string {
  if (meeting.status !== "completed" || !meeting.synthesis) {
    return `Board meeting on "${meeting.topic}" is ${meeting.status}.`;
  }

  const durationMs =
    (meeting.completedAt ?? Date.now()) -
    (meeting.startedAt ?? meeting.createdAt);
  const durationSec = Math.round(durationMs / 1000);

  const lines: string[] = [];
  lines.push(`🏛️ **Board Meeting: ${meeting.topic}**`);
  lines.push(
    `*${meeting.inputs.filter((i) => i.status === "completed").length}/${meeting.inputs.length} specialists responded (${durationSec}s)*`,
  );
  lines.push("");
  lines.push(meeting.synthesis);

  return lines.join("\n");
}
