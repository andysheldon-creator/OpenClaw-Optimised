/**
 * Board of Directors — Message Router
 *
 * Determines which board agent should handle an incoming message based on:
 * 1. Telegram topic ID → agent mapping
 * 2. Explicit @agent mention in message body
 * 3. /agent:<role> directive in message body
 * 4. Default to "general" agent
 */

import type { BoardAgentRole } from "./types.js";
import { BOARD_AGENT_ROLES, isBoardAgentRole } from "./types.js";

// ── Agent Mention Detection ──────────────────────────────────────────────────

/** Pattern for explicit agent targeting: @research, @finance, etc. */
const AGENT_MENTION_RE =
  /(?:^|\s)@(general|research|content|finance|strategy|critic)\b/i;

/** Pattern for directive-style targeting: /agent:finance */
const AGENT_DIRECTIVE_RE =
  /(?:^|\s)\/agent\s*:\s*(general|research|content|finance|strategy|critic)\b/i;

/** Pattern for natural-language role references. */
const ROLE_KEYWORDS: Record<BoardAgentRole, readonly string[]> = {
  general: [],
  research: [
    "research",
    "data",
    "analyze",
    "evidence",
    "study",
    "studies",
    "survey",
  ],
  content: [
    "marketing",
    "brand",
    "messaging",
    "audience",
    "creative",
    "content",
    "copy",
    "positioning",
  ],
  finance: [
    "cost",
    "budget",
    "roi",
    "revenue",
    "pricing",
    "financial",
    "profit",
    "cash flow",
    "runway",
  ],
  strategy: [
    "strategy",
    "strategic",
    "long-term",
    "competitive",
    "vision",
    "roadmap",
    "positioning",
  ],
  critic: [
    "risk",
    "devil",
    "critique",
    "challenge",
    "weakness",
    "flaw",
    "stress-test",
    "what could go wrong",
  ],
} as const;

// ── Router ───────────────────────────────────────────────────────────────────

export type RouteResult = {
  /** The resolved agent role. */
  agentRole: BoardAgentRole;
  /** How the route was determined. */
  reason: "topic" | "mention" | "directive" | "keyword" | "default";
  /** Cleaned message body (with routing directives stripped). */
  cleanedBody: string;
};

/**
 * Route an incoming message to the appropriate board agent.
 *
 * Priority:
 * 1. Telegram topic ID mapping (highest — user explicitly chose a topic)
 * 2. /agent:<role> directive
 * 3. @<role> mention
 * 4. Keyword-based inference (only if confidence is high)
 * 5. Default to "general"
 */
export function routeMessage(params: {
  /** Raw message body. */
  body: string;
  /** Telegram message_thread_id (forum topic), if present. */
  telegramTopicId?: number;
  /** Topic ID → agent role mapping from config. */
  topicMap?: Map<number, BoardAgentRole>;
}): RouteResult {
  const { body, telegramTopicId, topicMap } = params;

  // 1. Telegram topic mapping
  if (telegramTopicId !== undefined && topicMap) {
    const topicAgent = topicMap.get(telegramTopicId);
    if (topicAgent) {
      return {
        agentRole: topicAgent,
        reason: "topic",
        cleanedBody: body,
      };
    }
  }

  // 2. /agent:<role> directive
  const directiveMatch = body.match(AGENT_DIRECTIVE_RE);
  if (directiveMatch) {
    const role = directiveMatch[1].toLowerCase();
    if (isBoardAgentRole(role)) {
      const cleanedBody = body
        .replace(AGENT_DIRECTIVE_RE, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        agentRole: role,
        reason: "directive",
        cleanedBody: cleanedBody || body,
      };
    }
  }

  // 3. @<role> mention
  const mentionMatch = body.match(AGENT_MENTION_RE);
  if (mentionMatch) {
    const role = mentionMatch[1].toLowerCase();
    if (isBoardAgentRole(role)) {
      const cleanedBody = body
        .replace(AGENT_MENTION_RE, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        agentRole: role,
        reason: "mention",
        cleanedBody: cleanedBody || body,
      };
    }
  }

  // 4. Keyword-based inference (only strong matches)
  const keywordRole = inferRoleFromKeywords(body);
  if (keywordRole) {
    return {
      agentRole: keywordRole,
      reason: "keyword",
      cleanedBody: body,
    };
  }

  // 5. Default to general
  return {
    agentRole: "general",
    reason: "default",
    cleanedBody: body,
  };
}

/**
 * Infer an agent role from message keywords.
 * Only returns a role if there's a strong, unambiguous signal.
 * Returns undefined if the signal is weak or ambiguous.
 */
function inferRoleFromKeywords(body: string): BoardAgentRole | undefined {
  const lower = body.toLowerCase();
  const scores: Partial<Record<BoardAgentRole, number>> = {};

  for (const role of BOARD_AGENT_ROLES) {
    if (role === "general") continue; // General is the default fallback
    const keywords = ROLE_KEYWORDS[role];
    let score = 0;
    for (const keyword of keywords) {
      // Word boundary match to avoid partial matches
      const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
      if (re.test(lower)) {
        score += keyword.length > 5 ? 2 : 1; // Longer keywords get higher weight
      }
    }
    if (score > 0) {
      scores[role] = score;
    }
  }

  const entries = Object.entries(scores) as Array<[BoardAgentRole, number]>;
  if (entries.length === 0) return undefined;

  // Sort by score descending
  entries.sort((a, b) => b[1] - a[1]);

  // Only return if the top score is significantly higher than the second
  const [topRole, topScore] = entries[0];
  const secondScore = entries.length > 1 ? entries[1][1] : 0;

  // Require minimum score of 3 and at least 2x the second-place score
  if (topScore >= 3 && (secondScore === 0 || topScore >= secondScore * 2)) {
    return topRole;
  }

  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Consultation Tag Extraction ──────────────────────────────────────────────

/** Pattern for consultation tags in agent replies (captures the question until end-of-line or next tag). */
const CONSULT_TAG_RE =
  /\[\[consult:(general|research|content|finance|strategy|critic)\]\]\s*([^\n]+?)(?=\s*\[\[consult:|\s*$)/gim;

export type ConsultTag = {
  toAgent: BoardAgentRole;
  question: string;
};

/**
 * Extract consultation tags from an agent's reply text.
 * Format: `[[consult:<role>]] <question>`
 */
export function extractConsultTags(text: string): ConsultTag[] {
  const tags: ConsultTag[] = [];
  const matches = text.matchAll(CONSULT_TAG_RE);
  for (const match of matches) {
    const role = match[1].toLowerCase();
    const question = match[2].trim();
    if (isBoardAgentRole(role) && question) {
      tags.push({ toAgent: role, question });
    }
  }
  return tags;
}

/** Simpler pattern for stripping: removes [[consult:role]] and everything to end of that line. */
const CONSULT_STRIP_RE =
  /\[\[consult:(general|research|content|finance|strategy|critic)\]\][^\n]*/gi;

/**
 * Strip consultation tags from text (for the user-facing reply).
 */
export function stripConsultTags(text: string): string {
  return text
    .replace(CONSULT_STRIP_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Board Meeting Tag Extraction ─────────────────────────────────────────────

/** Pattern for board meeting trigger tag. */
const MEETING_TAG_RE = /\[\[board_meeting\]\]\s*(.+?)$/im;

/**
 * Extract a board meeting trigger from the general agent's reply.
 * Format: `[[board_meeting]] <topic>`
 */
export function extractMeetingTag(text: string): { topic: string } | undefined {
  const match = text.match(MEETING_TAG_RE);
  if (!match) return undefined;
  const topic = match[1].trim();
  return topic ? { topic } : undefined;
}

/**
 * Strip the board meeting tag from text.
 */
export function stripMeetingTag(text: string): string {
  return text
    .replace(MEETING_TAG_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Topic Map Builder ────────────────────────────────────────────────────────

/**
 * Build a topic ID → agent role mapping from board config.
 */
export function buildTopicMap(
  agents?: Array<{
    role: string;
    telegramTopicId?: number;
  }>,
): Map<number, BoardAgentRole> {
  const map = new Map<number, BoardAgentRole>();
  if (!agents) return map;
  for (const agent of agents) {
    if (agent.telegramTopicId !== undefined && isBoardAgentRole(agent.role)) {
      map.set(agent.telegramTopicId, agent.role);
    }
  }
  return map;
}
