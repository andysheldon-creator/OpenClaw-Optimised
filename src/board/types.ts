/**
 * Board of Directors — Core Types
 *
 * Defines the multi-agent system types: agent roles, consultation protocol,
 * meeting coordination, and Telegram topic mapping.
 */

// ── Agent Roles ──────────────────────────────────────────────────────────────

/** The six fixed board agent roles. */
export type BoardAgentRole =
  | "general"
  | "research"
  | "content"
  | "finance"
  | "strategy"
  | "critic";

export const BOARD_AGENT_ROLES: readonly BoardAgentRole[] = [
  "general",
  "research",
  "content",
  "finance",
  "strategy",
  "critic",
] as const;

export function isBoardAgentRole(value: string): value is BoardAgentRole {
  return (BOARD_AGENT_ROLES as readonly string[]).includes(value);
}

// ── Agent Definition ─────────────────────────────────────────────────────────

export type BoardAgentDef = {
  /** Agent role identifier. */
  role: BoardAgentRole;
  /** Display name (e.g., "Research Analyst"). */
  name: string;
  /** Short title (e.g., "CFO"). */
  title: string;
  /** Emoji prefix for messages. */
  emoji: string;
  /** System prompt personality fragment (the agent's SOUL). */
  personality: string;
  /** Optional model override (provider/model). */
  model?: string;
  /** Optional thinking level override. */
  thinkingDefault?: "off" | "minimal" | "low" | "medium" | "high";
  /** Telegram forum topic ID (set during topic setup). */
  telegramTopicId?: number;
};

// ── Consultation Protocol ────────────────────────────────────────────────────

export type ConsultationRequest = {
  /** Unique consultation ID. */
  id: string;
  /** Agent sending the request. */
  fromAgent: BoardAgentRole;
  /** Agent receiving the request. */
  toAgent: BoardAgentRole;
  /** The question to answer. */
  question: string;
  /** Optional background context. */
  context?: string;
  /** Current consultation depth (0 = original user query). */
  depth: number;
  /** If part of a board meeting. */
  meetingId?: string;
  /** Timeout in ms for this consultation. */
  timeoutMs: number;
  /** Timestamp when the request was created. */
  createdAt: number;
};

export type ConsultationResponse = {
  /** Matches the request ID. */
  requestId: string;
  /** Agent that answered. */
  fromAgent: BoardAgentRole;
  /** The response text. */
  response: string;
  /** Self-assessed confidence 0-1. */
  confidence?: number;
  /** Suggestion to consult another agent. */
  suggestConsult?: BoardAgentRole;
  /** Duration in ms. */
  durationMs: number;
};

// ── Board Meeting ────────────────────────────────────────────────────────────

export type MeetingStatus =
  | "pending"
  | "in-progress"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

export type MeetingAgentInput = {
  agent: BoardAgentRole;
  status: "pending" | "in-progress" | "completed" | "failed" | "skipped";
  prompt: string;
  response?: string;
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
};

export type BoardMeeting = {
  /** Unique meeting ID. */
  id: string;
  /** The topic/question being discussed. */
  topic: string;
  /** Current meeting status. */
  status: MeetingStatus;
  /** Who initiated the meeting (usually "general"). */
  initiatedBy: BoardAgentRole;
  /** Individual agent inputs. */
  inputs: MeetingAgentInput[];
  /** Final synthesized recommendation (set when status=completed). */
  synthesis?: string;
  /** Meeting timestamps. */
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  /** Max duration in ms. */
  maxDurationMs: number;
  /** Max turns per agent. */
  maxTurnsPerAgent: number;
};

// ── Telegram Topic Mapping ───────────────────────────────────────────────────

export type TopicMapping = {
  /** Telegram forum topic ID. */
  topicId: number;
  /** Board agent role this topic routes to. */
  agentRole: BoardAgentRole;
  /** Topic name as displayed in Telegram. */
  topicName: string;
};

// ── Board Router Context ─────────────────────────────────────────────────────

/**
 * Context passed through the reply pipeline when board is enabled.
 * Attached to the MsgContext to propagate agent routing decisions.
 */
export type BoardRoutingContext = {
  /** Resolved agent role for this message. */
  agentRole: BoardAgentRole;
  /** Whether this message is part of a consultation. */
  isConsultation: boolean;
  /** Consultation depth (0 for direct user messages). */
  consultationDepth: number;
  /** Active meeting ID if in a board meeting. */
  meetingId?: string;
};
