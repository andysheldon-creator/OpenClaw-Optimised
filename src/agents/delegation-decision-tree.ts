/**
 * DELEGATION DECISION TREE
 *
 * Structured evaluation when a superior receives an upward request.
 * Provides context and recommendation — the superior makes the final decision.
 */

import type { AgentRole } from "../config/types.agents.js";
import type { DelegationRecord } from "./delegation-types.js";
import { AGENT_ROLE_RANK } from "./agent-scope.js";

export type DecisionTreeResult = {
  recommendation: "approve" | "reject" | "redirect";
  reasoning: string;
  withinScope: boolean;
  requiresEscalation: boolean;
  canDelegateToOther: boolean;
  suggestedAlternative?: string;
  confidence: number;
};

type EvaluationInput = {
  request: DelegationRecord;
  superiorRole: AgentRole;
  superiorAgentId: string;
  availableSubordinates?: Array<{
    agentId: string;
    role: AgentRole;
    activeTaskCount: number;
  }>;
};

/**
 * Evaluate an upward delegation request from a subordinate.
 * Returns a structured recommendation with reasoning.
 */
export function evaluateDelegationRequest(input: EvaluationInput): DecisionTreeResult {
  const { request, superiorRole, availableSubordinates } = input;

  // 1. Scope check: does the task match the requestor's domain?
  const scopeCheck = checkScope(request, superiorRole);

  // 2. Escalation check: does it exceed the superior's authority?
  const escalationCheck = checkEscalation(request, superiorRole);

  // 3. Redirect check: is there a better-suited subordinate?
  const redirectCheck = checkRedirect(request, availableSubordinates);

  // 4. Priority assessment
  const priorityWeight = getPriorityWeight(request.priority);

  // Build recommendation
  if (escalationCheck.requiresEscalation) {
    return {
      recommendation: "reject",
      reasoning: `Task requires escalation beyond ${superiorRole} authority. ${escalationCheck.reason}`,
      withinScope: scopeCheck.withinScope,
      requiresEscalation: true,
      canDelegateToOther: false,
      confidence: 0.9,
    };
  }

  if (redirectCheck.canRedirect && redirectCheck.betterTarget) {
    return {
      recommendation: "redirect",
      reasoning: `A better-suited agent (${redirectCheck.betterTarget.agentId}) is available with lower workload. ${redirectCheck.reason}`,
      withinScope: scopeCheck.withinScope,
      requiresEscalation: false,
      canDelegateToOther: true,
      suggestedAlternative: redirectCheck.betterTarget.agentId,
      confidence: 0.7,
    };
  }

  if (!scopeCheck.withinScope) {
    return {
      recommendation: "reject",
      reasoning: `Task may be outside the requestor's typical scope. ${scopeCheck.reason}`,
      withinScope: false,
      requiresEscalation: false,
      canDelegateToOther: redirectCheck.canRedirect,
      suggestedAlternative: redirectCheck.betterTarget?.agentId,
      confidence: 0.6,
    };
  }

  // Default: approve if justified and priority is sufficient
  const hasJustification = Boolean(request.justification?.trim());
  const confidence = hasJustification ? 0.8 + priorityWeight * 0.1 : 0.5;

  return {
    recommendation: "approve",
    reasoning: hasJustification
      ? `Request is within scope, justified, and priority (${request.priority}) warrants attention.`
      : "Request is within scope but lacks detailed justification.",
    withinScope: true,
    requiresEscalation: false,
    canDelegateToOther: redirectCheck.canRedirect,
    suggestedAlternative: redirectCheck.betterTarget?.agentId,
    confidence: Math.min(1, confidence),
  };
}

function checkScope(
  request: DelegationRecord,
  superiorRole: AgentRole,
): { withinScope: boolean; reason: string } {
  // Workers requesting from leads/specialists is normal workflow
  const fromRank = AGENT_ROLE_RANK[request.fromRole];
  const superiorRank = AGENT_ROLE_RANK[superiorRole];

  if (superiorRank - fromRank > 2) {
    return {
      withinScope: false,
      reason: "Request skips intermediate hierarchy levels.",
    };
  }

  return { withinScope: true, reason: "Request follows normal hierarchy chain." };
}

function checkEscalation(
  request: DelegationRecord,
  superiorRole: AgentRole,
): { requiresEscalation: boolean; reason: string } {
  // Critical priority from a worker to a specialist might need lead/orchestrator
  if (request.priority === "critical" && AGENT_ROLE_RANK[superiorRole] < 2) {
    return {
      requiresEscalation: true,
      reason: "Critical priority requests should be handled by lead or orchestrator.",
    };
  }

  return { requiresEscalation: false, reason: "" };
}

function checkRedirect(
  request: DelegationRecord,
  availableSubordinates?: Array<{
    agentId: string;
    role: AgentRole;
    activeTaskCount: number;
  }>,
): {
  canRedirect: boolean;
  betterTarget?: { agentId: string; role: AgentRole };
  reason: string;
} {
  if (!availableSubordinates || availableSubordinates.length === 0) {
    return { canRedirect: false, reason: "No alternative subordinates available." };
  }

  // Find subordinates with fewer active tasks (load balancing)
  const candidates = availableSubordinates
    .filter((s) => s.agentId !== request.fromAgentId)
    .toSorted((a, b) => a.activeTaskCount - b.activeTaskCount);

  if (candidates.length === 0) {
    return { canRedirect: false, reason: "No alternative subordinates available." };
  }

  const best = candidates[0];
  if (best.activeTaskCount < 3) {
    return {
      canRedirect: true,
      betterTarget: { agentId: best.agentId, role: best.role },
      reason: `${best.agentId} has lower workload (${best.activeTaskCount} active tasks).`,
    };
  }

  return { canRedirect: false, reason: "All available subordinates are at capacity." };
}

function getPriorityWeight(priority: string): number {
  const weights: Record<string, number> = {
    critical: 1.0,
    high: 0.75,
    normal: 0.5,
    low: 0.25,
  };
  return weights[priority] ?? 0.5;
}
