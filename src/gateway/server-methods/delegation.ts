/**
 * DELEGATION GATEWAY HANDLERS
 *
 * RPC handlers for the hierarchical delegation system.
 * Pattern follows collaboration.ts.
 */

import type { DelegationDirection, DelegationReview } from "../../agents/delegation-types.js";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveAgentRole } from "../../agents/agent-scope.js";
import { evaluateDelegationRequest } from "../../agents/delegation-decision-tree.js";
import {
  completeDelegation,
  getAgentDelegationMetrics,
  getDelegation,
  listDelegationsForAgent,
  listPendingReviewsForAgent,
  registerDelegation,
  reviewDelegation,
  updateDelegationState,
} from "../../agents/delegation-registry.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { broadcastHierarchyFullRefresh } from "../server-hierarchy-events.js";

export const delegationHandlers: GatewayRequestHandlers = {
  "delegation.create": ({ params, respond }) => {
    try {
      const p = params as {
        fromAgentId: string;
        fromSessionKey: string;
        toAgentId: string;
        task: string;
        priority?: string;
        justification?: string;
      };

      if (!p.fromAgentId || !p.toAgentId || !p.task) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "fromAgentId, toAgentId, and task are required"),
        );
        return;
      }

      const cfg = loadConfig();
      const fromRole = resolveAgentRole(cfg, p.fromAgentId);
      const toRole = resolveAgentRole(cfg, p.toAgentId);

      const record = registerDelegation({
        fromAgentId: p.fromAgentId,
        fromSessionKey: p.fromSessionKey || `agent:${p.fromAgentId}:main`,
        fromRole,
        toAgentId: p.toAgentId,
        toRole,
        task: p.task,
        priority: (p.priority as "critical" | "high" | "normal" | "low") ?? "normal",
        justification: p.justification,
      });

      // For upward requests, provide decision tree evaluation context
      let evaluation = undefined;
      if (record.direction === "upward") {
        evaluation = evaluateDelegationRequest({
          request: record,
          superiorRole: toRole,
          superiorAgentId: p.toAgentId,
        });
      }

      broadcastHierarchyFullRefresh();
      respond(true, { delegation: record, evaluation }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.review": ({ params, respond }) => {
    try {
      const p = params as {
        delegationId: string;
        reviewerId: string;
        decision: string;
        reasoning: string;
        redirectToAgentId?: string;
        redirectReason?: string;
      };

      if (!p.delegationId || !p.reviewerId || !p.decision || !p.reasoning) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "delegationId, reviewerId, decision, and reasoning are required",
          ),
        );
        return;
      }

      const review: DelegationReview = {
        reviewerId: p.reviewerId,
        decision: p.decision as "approve" | "reject" | "redirect",
        reasoning: p.reasoning,
        evaluations: {
          withinScope: true,
          requiresEscalation: false,
          canDelegateToOther: p.decision === "redirect",
          suggestedAlternative: p.redirectToAgentId,
        },
      };

      const record = reviewDelegation(p.delegationId, review);
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Delegation not found or not in pending_review state",
          ),
        );
        return;
      }

      broadcastHierarchyFullRefresh();
      respond(true, { delegation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.accept": ({ params, respond }) => {
    try {
      const p = params as { delegationId: string; agentId: string };

      if (!p.delegationId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "delegationId required"));
        return;
      }

      const record = updateDelegationState(p.delegationId, "in_progress");
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Delegation not found or invalid state transition",
          ),
        );
        return;
      }

      broadcastHierarchyFullRefresh();
      respond(true, { delegation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.complete": ({ params, respond }) => {
    try {
      const p = params as {
        delegationId: string;
        resultStatus: string;
        resultSummary: string;
      };

      if (!p.delegationId || !p.resultStatus || !p.resultSummary) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "delegationId, resultStatus, and resultSummary required",
          ),
        );
        return;
      }

      const record = completeDelegation(p.delegationId, {
        status: p.resultStatus as "success" | "failure" | "partial",
        summary: p.resultSummary,
      });

      if (!record) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Delegation not found or invalid state for completion",
          ),
        );
        return;
      }

      broadcastHierarchyFullRefresh();
      respond(true, { delegation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.reject": ({ params, respond }) => {
    try {
      const p = params as { delegationId: string; agentId: string; reasoning?: string };

      if (!p.delegationId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "delegationId required"));
        return;
      }

      const record = updateDelegationState(p.delegationId, "rejected");
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "Delegation not found or invalid state transition",
          ),
        );
        return;
      }

      broadcastHierarchyFullRefresh();
      respond(true, { delegation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.get": ({ params, respond }) => {
    try {
      const p = params as { delegationId: string };

      if (!p.delegationId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "delegationId required"));
        return;
      }

      const record = getDelegation(p.delegationId);
      if (!record) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Delegation not found"));
        return;
      }

      respond(true, { delegation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.list": ({ params, respond }) => {
    try {
      const p = params as { agentId: string; direction?: string };

      if (!p.agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId required"));
        return;
      }

      const records = listDelegationsForAgent(p.agentId, {
        direction: p.direction as DelegationDirection | undefined,
      });

      respond(true, { delegations: records }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.pending": ({ params, respond }) => {
    try {
      const p = params as { agentId: string };

      if (!p.agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId required"));
        return;
      }

      const records = listPendingReviewsForAgent(p.agentId);
      respond(true, { delegations: records }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "delegation.metrics": ({ params, respond }) => {
    try {
      const p = params as { agentId: string };

      if (!p.agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId required"));
        return;
      }

      const metrics = getAgentDelegationMetrics(p.agentId);
      respond(true, { metrics }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
