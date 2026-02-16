/**
 * Board of Directors — Cross-Agent Consultation Protocol
 *
 * Enables agents to consult each other within defined boundaries.
 * Depth-limited to prevent infinite consultation loops.
 */

import crypto from "node:crypto";

import type {
  BoardAgentRole,
  ConsultationRequest,
  ConsultationResponse,
} from "./types.js";

// ── Active Consultation Tracking ─────────────────────────────────────────────

/**
 * In-memory tracker for active consultations.
 * Prevents duplicate consultations and enforces depth limits.
 */
const ACTIVE_CONSULTATIONS = new Map<string, ConsultationRequest>();

/** Maximum number of concurrent consultations. */
const MAX_CONCURRENT_CONSULTATIONS = 10;

// ── Consultation Factory ─────────────────────────────────────────────────────

/**
 * Create a new consultation request.
 * Returns undefined if depth limit exceeded or too many active consultations.
 */
export function createConsultation(params: {
  fromAgent: BoardAgentRole;
  toAgent: BoardAgentRole;
  question: string;
  context?: string;
  depth: number;
  maxDepth: number;
  meetingId?: string;
  timeoutMs?: number;
}): ConsultationRequest | undefined {
  const {
    fromAgent,
    toAgent,
    question,
    context,
    depth,
    maxDepth,
    meetingId,
    timeoutMs = 120_000,
  } = params;

  // Depth limit check
  if (depth >= maxDepth) {
    return undefined;
  }

  // Cannot consult yourself
  if (fromAgent === toAgent) {
    return undefined;
  }

  // Concurrent consultation limit
  if (ACTIVE_CONSULTATIONS.size >= MAX_CONCURRENT_CONSULTATIONS) {
    return undefined;
  }

  const request: ConsultationRequest = {
    id: `consult-${crypto.randomUUID().slice(0, 8)}`,
    fromAgent,
    toAgent,
    question,
    context,
    depth,
    meetingId,
    timeoutMs,
    createdAt: Date.now(),
  };

  ACTIVE_CONSULTATIONS.set(request.id, request);
  return request;
}

/**
 * Complete a consultation and remove it from active tracking.
 */
export function completeConsultation(
  requestId: string,
  response: string,
  options?: {
    confidence?: number;
    suggestConsult?: BoardAgentRole;
  },
): ConsultationResponse | undefined {
  const request = ACTIVE_CONSULTATIONS.get(requestId);
  if (!request) return undefined;

  ACTIVE_CONSULTATIONS.delete(requestId);

  return {
    requestId,
    fromAgent: request.toAgent,
    response,
    confidence: options?.confidence,
    suggestConsult: options?.suggestConsult,
    durationMs: Date.now() - request.createdAt,
  };
}

/**
 * Cancel a consultation (e.g., on timeout).
 */
export function cancelConsultation(requestId: string): boolean {
  return ACTIVE_CONSULTATIONS.delete(requestId);
}

/**
 * Get an active consultation by ID.
 */
export function getConsultation(
  requestId: string,
): ConsultationRequest | undefined {
  return ACTIVE_CONSULTATIONS.get(requestId);
}

/**
 * Get all active consultations.
 */
export function getActiveConsultations(): ConsultationRequest[] {
  return Array.from(ACTIVE_CONSULTATIONS.values());
}

/**
 * Clear timed-out consultations.
 */
export function cleanupTimedOutConsultations(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, request] of ACTIVE_CONSULTATIONS) {
    if (now - request.createdAt > request.timeoutMs) {
      ACTIVE_CONSULTATIONS.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Clear all active consultations (for testing or shutdown).
 */
export function clearAllConsultations(): void {
  ACTIVE_CONSULTATIONS.clear();
}

// ── Consultation Prompt Builder ──────────────────────────────────────────────

/**
 * Build the prompt that will be sent to the consulted agent.
 * Includes context about who is asking and why.
 */
export function buildConsultationPrompt(request: ConsultationRequest): string {
  const lines: string[] = [];

  if (request.meetingId) {
    lines.push(
      `[Board Meeting Consultation — requested by ${request.fromAgent}]`,
    );
  } else {
    lines.push(
      `[Consultation from ${request.fromAgent} agent — depth ${request.depth}/${request.depth + 1}]`,
    );
  }

  lines.push("");

  if (request.context) {
    lines.push("**Context:**");
    lines.push(request.context);
    lines.push("");
  }

  lines.push("**Question:**");
  lines.push(request.question);
  lines.push("");
  lines.push(
    "Please respond with your specialist perspective. Be concise but thorough. Focus on your area of expertise.",
  );

  return lines.join("\n");
}

/**
 * Format a consultation response for injection into the requesting agent's context.
 */
export function formatConsultationResult(
  response: ConsultationResponse,
): string {
  const lines: string[] = [];
  lines.push(
    `[Response from ${response.fromAgent} agent (${response.durationMs}ms)]`,
  );
  if (response.confidence !== undefined) {
    const pct = Math.round(response.confidence * 100);
    lines.push(`Confidence: ${pct}%`);
  }
  lines.push("");
  lines.push(response.response);

  if (response.suggestConsult) {
    lines.push("");
    lines.push(
      `💡 ${response.fromAgent} suggests also consulting ${response.suggestConsult}.`,
    );
  }

  return lines.join("\n");
}
