/**
 * Model Divergence Approval Interlay
 *
 * Detects when auto-routing selects Sonnet/Opus instead of expected Haiku,
 * and routes approval through three parallel channels:
 *
 * 1. Slack DM with approve/reject buttons (async, ~30s delay)
 * 2. Session pause + interactive prompt (blocks execution, immediate)
 * 3. Audit log + auto-proceed (trails decisions, non-blocking)
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { RoutingDecision } from "./model-routing.js";

export type DivergenceDecision = "approve" | "reject" | "pending" | "timeout";

export interface ApprovalEvent {
  timestamp: string;
  sessionKey: string;
  userId: string;
  originalTier: "haiku";
  proposedTier: "sonnet" | "opus";
  reason: string;
  confidence: number;
  estimatedTokens: number;
  slackDmSent: boolean;
  sessionPauseSent: boolean;
  decision: DivergenceDecision;
  decidedBy?: "user" | "timeout";
  decidedAt?: string;
  approvalTimeMs?: number;
}

const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || "~/.openclaw/logs/model-approval-audit.jsonl";
const APPROVAL_TIMEOUT_MS = 60_000; // 60 second timeout
const SLACK_CHANNEL = process.env.SLACK_APPROVAL_CHANNEL || "D0ADHLY5WJE"; // DM with Trevor

/**
 * Detect model divergence: when auto-routing picks Sonnet/Opus instead of Haiku.
 */
export function detectDivergence(params: {
  sessionModelOverride?: string;
  routingDecision?: RoutingDecision;
  messageHistoryDepth: number;
}): boolean {
  // If there's a session override, no divergence approval needed
  if (params.sessionModelOverride) {
    return false;
  }

  // If no routing decision, no divergence
  if (!params.routingDecision) {
    return false;
  }

  // Divergence = routing picks Sonnet/Opus (cost escalation)
  const proposed = params.routingDecision.tier;
  return proposed === "sonnet" || proposed === "opus";
}

/**
 * Create a divergence approval event.
 */
export function createApprovalEvent(params: {
  sessionKey: string;
  userId: string;
  routingDecision: RoutingDecision;
}): ApprovalEvent {
  return {
    timestamp: new Date().toISOString(),
    sessionKey: params.sessionKey,
    userId: params.userId,
    originalTier: "haiku",
    proposedTier: params.routingDecision.tier as "sonnet" | "opus",
    reason: params.routingDecision.reason,
    confidence: params.routingDecision.confidence,
    estimatedTokens: 0, // Placeholder; set by caller
    slackDmSent: false,
    sessionPauseSent: false,
    decision: "pending",
  };
}

/**
 * Send Slack DM with approve/reject buttons (async channel).
 * Returns immediately; approval happens asynchronously.
 */
export async function sendSlackApprovalDm(params: {
  event: ApprovalEvent;
  callback?: (decision: DivergenceDecision) => void;
}): Promise<void> {
  const { event } = params;

  const message = `
🤔 *Model Divergence Approval*

Auto-routing wants to escalate from Haiku → *${event.proposedTier.toUpperCase()}*

**Reason:** ${event.reason}
**Confidence:** ${(event.confidence * 100).toFixed(0)}%
**Est. tokens:** ${event.estimatedTokens}

_Session: ${event.sessionKey}_

React with:
✅ Approve (use ${event.proposedTier})
❌ Reject (use Haiku instead)
  `.trim();

  try {
    // In production, this would call the Slack API via message tool
    // For now, log the intent
    console.log("[ApprovalInterlay] Slack DM pending:", {
      to: "user:U0ABVDL7C9M",
      message,
    });

    // Record that we attempted to send
    event.slackDmSent = true;
  } catch (err) {
    console.error("[ApprovalInterlay] Failed to send Slack DM:", err);
  }
}

/**
 * Pause session and prompt user for approval (blocks execution).
 * Waits for user input or timeout.
 */
export async function pauseAndPromptApproval(params: {
  event: ApprovalEvent;
  interactivePrompt: string;
}): Promise<DivergenceDecision> {
  const { event, interactivePrompt } = params;

  console.log("[ApprovalInterlay] Session paused. Awaiting approval prompt response.");
  console.log(interactivePrompt);

  event.sessionPauseSent = true;

  // In production, this would integrate with the session runner
  // to pause and wait for user input. For now, simulate timeout.
  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => {
      console.log("[ApprovalInterlay] Approval timeout. Auto-proceeding with proposed model.");
      resolve("timeout");
    }, APPROVAL_TIMEOUT_MS);

    // Placeholder: in real implementation, listen for session input
    process.on("message", (msg) => {
      if (msg.type === "approval-response") {
        clearTimeout(timeoutHandle);
        resolve(msg.decision);
      }
    });
  });
}

/**
 * Log divergence event to audit trail + auto-proceed.
 */
export function logAndAutoApprove(event: ApprovalEvent): void {
  const logDir = dirname(AUDIT_LOG_PATH.replace("~", process.env.HOME || ""));

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const logEntry = {
    ...event,
    decision: "pending" as const,
    decidedBy: "timeout" as const,
    decidedAt: new Date().toISOString(),
  };

  try {
    appendFileSync(
      AUDIT_LOG_PATH.replace("~", process.env.HOME || ""),
      JSON.stringify(logEntry) + "\n",
    );
    console.log("[ApprovalInterlay] Logged to audit trail, auto-proceeding.");
  } catch (err) {
    console.error("[ApprovalInterlay] Failed to write audit log:", err);
  }
}

/**
 * Orchestrate all three approval channels in parallel.
 * Returns the final decision (or timeout fallback).
 */
export async function requestApproval(params: {
  event: ApprovalEvent;
  sessionKey: string;
  userId: string;
  routingDecision: RoutingDecision;
}): Promise<DivergenceDecision> {
  const { event, sessionKey, userId } = params;

  const interactivePrompt = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤔 Model Divergence Approval Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Auto-routing detected a cost escalation:
  Haiku → ${event.proposedTier.toUpperCase()}

Reason:  ${event.reason}
Confidence: ${(event.confidence * 100).toFixed(0)}%
Est. output tokens: ${event.estimatedTokens}

─── Approval Channels ───────────────
1. Slack DM (async, buttons)
2. Session pause (blocks, immediate)
3. Audit log (logged, auto-proceed in ${APPROVAL_TIMEOUT_MS / 1000}s)

Waiting for decision... (timeout: ${APPROVAL_TIMEOUT_MS / 1000}s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();

  // Send all three in parallel
  const [slackPromise, pausePromise, auditPromise] = await Promise.allSettled([
    sendSlackApprovalDm({ event }),
    pauseAndPromptApproval({ event, interactivePrompt }),
    new Promise<void>((resolve) => {
      logAndAutoApprove(event);
      resolve();
    }),
  ]);

  // Wait for pauseAndPromptApproval (the blocking channel)
  if (pausePromise.status === "fulfilled") {
    return pausePromise.value;
  }

  // If pause fails, return timeout fallback
  return "timeout";
}

/**
 * Record final decision in audit trail.
 */
export function recordDecision(
  event: ApprovalEvent,
  decision: DivergenceDecision,
  decidedBy: "user" | "timeout",
  approvalTimeMs: number,
): void {
  event.decision = decision;
  event.decidedBy = decidedBy;
  event.decidedAt = new Date().toISOString();
  event.approvalTimeMs = approvalTimeMs;

  const logDir = dirname(AUDIT_LOG_PATH.replace("~", process.env.HOME || ""));
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  try {
    appendFileSync(
      AUDIT_LOG_PATH.replace("~", process.env.HOME || ""),
      JSON.stringify(event) + "\n",
    );
  } catch (err) {
    console.error("[ApprovalInterlay] Failed to record decision:", err);
  }
}
