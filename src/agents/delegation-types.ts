/**
 * DELEGATION TYPES
 *
 * Hierarchical delegation model with direction-aware authorization:
 * - Downward delegation: superior assigns tasks to subordinates (direct)
 * - Upward requests: subordinates request from superiors (requires review)
 */

import type { AgentRole } from "../config/types.agents.js";

export type DelegationDirection = "downward" | "upward";

export type DelegationState =
  | "created"
  | "pending_review"
  | "assigned"
  | "in_progress"
  | "completed"
  | "rejected"
  | "failed"
  | "redirected";

export type DelegationPriority = "critical" | "high" | "normal" | "low";

export type DelegationReview = {
  reviewerId: string;
  decision: "approve" | "reject" | "redirect";
  reasoning: string;
  evaluations: {
    withinScope: boolean;
    requiresEscalation: boolean;
    canDelegateToOther: boolean;
    suggestedAlternative?: string;
  };
};

export type DelegationInteraction = {
  agentId: string;
  type: "message" | "tool_call" | "review" | "status_update" | "collaboration_event";
  timestamp: number;
};

export type DelegationResult = {
  status: "success" | "failure" | "partial";
  summary: string;
};

export type DelegationRecord = {
  id: string;
  direction: DelegationDirection;
  state: DelegationState;
  priority: DelegationPriority;
  fromAgentId: string;
  fromSessionKey: string;
  fromRole: AgentRole;
  toAgentId: string;
  toSessionKey?: string;
  toRole: AgentRole;
  task: string;
  justification?: string;
  review?: DelegationReview;
  redirectedTo?: { agentId: string; reason: string };
  interactions: DelegationInteraction[];
  result?: DelegationResult;
  createdAt: number;
  reviewedAt?: number;
  startedAt?: number;
  completedAt?: number;
};

export type DelegationMetrics = {
  sent: number;
  received: number;
  pending: number;
  completed: number;
  rejected: number;
  interactionCount: number;
};
