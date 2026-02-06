/**
 * ADVANCED COLLABORATION FEATURES
 *
 * - Voting system for consensus
 * - Appeal mechanism for disputed decisions
 * - Metrics and quality tracking
 * - Broadcasting/notifications
 */

import type { GatewayRequestHandlers } from "./types.js";
import {
  getCollaborationMetrics,
  exportCollaborationAsMarkdown,
} from "../../agents/collaboration-storage.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { getCollaborationContext } from "./collaboration.js";

type VoteRecord = {
  agentId: string;
  vote: "approve" | "reject" | "abstain";
  confidence: number; // 0-1
  timestamp: number;
  rationale?: string;
};

type Appeal = {
  id: string;
  agentId: string;
  decisionId: string;
  reason: string;
  timestamp: number;
  status: "pending" | "approved" | "rejected";
  resolution?: string;
};

// In-memory storage for votes and appeals
const votes = new Map<string, VoteRecord[]>();
const appeals = new Map<string, Appeal[]>();

/**
 * Register a vote on a decision
 */
export function registerVote(params: {
  sessionKey: string;
  decisionId: string;
  agentId: string;
  vote: "approve" | "reject" | "abstain";
  confidence: number;
  rationale?: string;
}): { voteId: string; voteCount: number } {
  const voteKey = `${params.sessionKey}:${params.decisionId}`;
  if (!votes.has(voteKey)) {
    votes.set(voteKey, []);
  }

  const voteList = votes.get(voteKey)!;

  // Update existing vote or add new
  const existingIdx = voteList.findIndex((v) => v.agentId === params.agentId);
  if (existingIdx >= 0) {
    voteList[existingIdx] = {
      agentId: params.agentId,
      vote: params.vote,
      confidence: params.confidence,
      timestamp: Date.now(),
      rationale: params.rationale,
    };
  } else {
    voteList.push({
      agentId: params.agentId,
      vote: params.vote,
      confidence: params.confidence,
      timestamp: Date.now(),
      rationale: params.rationale,
    });
  }

  return {
    voteId: `vote:${voteKey}:${params.agentId}`,
    voteCount: voteList.length,
  };
}

/**
 * Get vote summary for a decision
 */
export function getVoteSummary(sessionKey: string, decisionId: string) {
  const voteKey = `${sessionKey}:${decisionId}`;
  const voteList = votes.get(voteKey) || [];

  let approveCount = 0;
  let rejectCount = 0;
  let abstainCount = 0;
  let totalConfidence = 0;

  for (const vote of voteList) {
    if (vote.vote === "approve") {
      approveCount++;
    } else if (vote.vote === "reject") {
      rejectCount++;
    } else {
      abstainCount++;
    }
    totalConfidence += vote.confidence;
  }

  const total = voteList.length;
  const averageConfidence = total > 0 ? totalConfidence / total : 0;

  return {
    approve: approveCount,
    reject: rejectCount,
    abstain: abstainCount,
    total,
    approvalRate: total > 0 ? approveCount / total : 0,
    averageConfidence,
    voteList,
  };
}

/**
 * Submit an appeal for a decision
 */
export function submitAppeal(params: {
  sessionKey: string;
  decisionId: string;
  agentId: string;
  reason: string;
}): string {
  const appealKey = `${params.sessionKey}:${params.decisionId}`;
  if (!appeals.has(appealKey)) {
    appeals.set(appealKey, []);
  }

  const appeal: Appeal = {
    id: `appeal:${appealKey}:${Date.now()}`,
    agentId: params.agentId,
    decisionId: params.decisionId,
    reason: params.reason,
    timestamp: Date.now(),
    status: "pending",
  };

  appeals.get(appealKey)!.push(appeal);
  return appeal.id;
}

/**
 * Resolve an appeal
 */
export function resolveAppeal(params: {
  sessionKey: string;
  decisionId: string;
  appealId: string;
  approved: boolean;
  resolution: string;
  moderatorId: string;
}): void {
  const appealKey = `${params.sessionKey}:${params.decisionId}`;
  const appealList = appeals.get(appealKey) || [];

  for (const appeal of appealList) {
    if (appeal.id === params.appealId) {
      appeal.status = params.approved ? "approved" : "rejected";
      appeal.resolution = params.resolution;
      return;
    }
  }
}

/**
 * Get appeals for a decision
 */
export function getAppeals(sessionKey: string, decisionId: string): Appeal[] {
  const appealKey = `${sessionKey}:${decisionId}`;
  return appeals.get(appealKey) || [];
}

/**
 * Export handlers
 */
export const collaborationAdvancedHandlers: GatewayRequestHandlers = {
  "collab.vote.register": ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        decisionId: string;
        agentId: string;
        vote: "approve" | "reject" | "abstain";
        confidence: number;
        rationale?: string;
      };

      const result = registerVote(p);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.vote.summary": ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        decisionId: string;
      };

      const summary = getVoteSummary(p.sessionKey, p.decisionId);
      respond(true, summary, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.appeal.submit": ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        decisionId: string;
        agentId: string;
        reason: string;
      };

      const appealId = submitAppeal(p);
      respond(true, { appealId }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.appeal.resolve": ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        decisionId: string;
        appealId: string;
        approved: boolean;
        resolution: string;
        moderatorId: string;
      };

      resolveAppeal(p);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.appeal.list": ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        decisionId: string;
      };

      const appealList = getAppeals(p.sessionKey, p.decisionId);
      respond(true, { appeals: appealList }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.metrics.get": async ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
      };

      const metrics = await getCollaborationMetrics(p.sessionKey);
      if (!metrics) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
        return;
      }

      respond(true, metrics, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "collab.session.export": async ({ params, respond }) => {
    try {
      const p = params as {
        sessionKey: string;
        format: "markdown" | "json";
      };

      if (p.format === "markdown") {
        const markdown = await exportCollaborationAsMarkdown(p.sessionKey);
        respond(true, { content: markdown, format: "markdown" }, undefined);
      } else {
        const session = getCollaborationContext(p.sessionKey);
        respond(true, { content: JSON.stringify(session, null, 2), format: "json" }, undefined);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
