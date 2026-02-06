/**
 * Collaboration Observer — Observes multi-agent interactions
 *
 * Tracks agreement/challenge patterns, updates trust scores between agent pairs,
 * records conflict resolution approaches, and identifies team chemistry patterns.
 *
 * This observer is called from the collaboration tool after each action
 * (proposal.publish, proposal.challenge, proposal.agree, decision.finalize).
 */

import type { ConflictHistory } from "../models/types.js";
import {
  isHumanizationEnabled,
  getHumanizationService,
  fireAndForget,
  recordPairInteraction,
  getPairInteractions,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollaborationAction =
  | "proposal.publish"
  | "proposal.challenge"
  | "proposal.agree"
  | "decision.finalize"
  | "session.init";

export interface CollaborationEvent {
  /** The agent performing the action. */
  agentId: string;
  /** The collaboration action taken. */
  action: CollaborationAction;
  /** The collaboration session key. */
  sessionKey: string;
  /** Decision thread ID (if applicable). */
  decisionId?: string;
  /** Other agents involved in this specific action. */
  involvedAgents: string[];
  /** All agents in the collaboration session. */
  sessionAgents: string[];
  /** The proposal/challenge/decision text. */
  content?: string;
  /** Whether the action was a response to a challenge. */
  isResponseToChallenge?: boolean;
  /** Outcome of a finalized decision (if action is decision.finalize). */
  finalOutcome?: string;
  /** Timestamp of the event. */
  timestamp?: Date;
}

export interface CollaborationObserverResult {
  /** Trust score adjustments computed (agent pair -> delta). */
  trustAdjustments: Array<{ agent1: string; agent2: string; delta: number }>;
  /** Chemistry assessment (if enough data). */
  chemistryUpdate?: {
    agent1: string;
    agent2: string;
    score: number;
    worksWell: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trust boost when agents agree. */
const AGREE_TRUST_DELTA = 0.02;

/** Trust change when an agent challenges (slight decrease for challenged agent). */
const CHALLENGE_TRUST_DELTA = -0.01;

/** Trust boost for challenger if challenge leads to better outcome. */
const _CONSTRUCTIVE_CHALLENGE_BONUS = 0.03;

/** Trust boost for successful collaboration finalization. */
const FINALIZE_TRUST_DELTA = 0.03;

/** Minimum interactions needed to calculate chemistry. */
const MIN_INTERACTIONS_FOR_CHEMISTRY = 5;

/** Agreement ratio threshold for "works well" chemistry. */
const HIGH_CHEMISTRY_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Main observer
// ---------------------------------------------------------------------------

/**
 * Observe a collaboration event. Synchronous path records in-memory;
 * DB persistence is fire-and-forget.
 */
export function observeCollaboration(event: CollaborationEvent): CollaborationObserverResult {
  if (!isHumanizationEnabled()) {
    return { trustAdjustments: [] };
  }

  const timestamp = event.timestamp ?? new Date();
  const trustAdjustments: CollaborationObserverResult["trustAdjustments"] = [];
  let chemistryUpdate: CollaborationObserverResult["chemistryUpdate"];

  switch (event.action) {
    case "proposal.agree": {
      // Record agreement interaction
      for (const otherAgent of event.involvedAgents) {
        if (otherAgent === event.agentId) {
          continue;
        }

        recordPairInteraction(event.agentId, otherAgent, {
          type: "agree",
          timestamp: timestamp.getTime(),
        });

        trustAdjustments.push({
          agent1: event.agentId,
          agent2: otherAgent,
          delta: AGREE_TRUST_DELTA,
        });
      }
      break;
    }

    case "proposal.challenge": {
      // Record challenge interaction
      for (const otherAgent of event.involvedAgents) {
        if (otherAgent === event.agentId) {
          continue;
        }

        recordPairInteraction(event.agentId, otherAgent, {
          type: "challenge",
          timestamp: timestamp.getTime(),
        });

        // Slight trust decrease for challenged party (not for challenger)
        trustAdjustments.push({
          agent1: event.agentId,
          agent2: otherAgent,
          delta: CHALLENGE_TRUST_DELTA,
        });
      }
      break;
    }

    case "decision.finalize": {
      // Finalization is positive for all participants
      for (const otherAgent of event.sessionAgents) {
        if (otherAgent === event.agentId) {
          continue;
        }

        recordPairInteraction(event.agentId, otherAgent, {
          type: "finalize",
          timestamp: timestamp.getTime(),
          quality: "good",
        });

        trustAdjustments.push({
          agent1: event.agentId,
          agent2: otherAgent,
          delta: FINALIZE_TRUST_DELTA,
        });
      }
      break;
    }

    case "proposal.publish":
    case "session.init":
      // These are informational — no trust adjustments needed
      break;
  }

  // Check chemistry for all involved pairs
  const checkedPairs = new Set<string>();
  for (const agent1 of event.sessionAgents) {
    for (const agent2 of event.sessionAgents) {
      if (agent1 >= agent2) {
        continue;
      } // Avoid duplicates
      const pairId = `${agent1}::${agent2}`;
      if (checkedPairs.has(pairId)) {
        continue;
      }
      checkedPairs.add(pairId);

      const chemistry = assessChemistry(agent1, agent2);
      if (chemistry) {
        chemistryUpdate = chemistry;
        // Only report the most recent pair update
      }
    }
  }

  // Fire-and-forget: persist trust adjustments
  if (trustAdjustments.length > 0) {
    fireAndForget("collab:trust-update", async () => {
      await persistTrustAdjustments(trustAdjustments);
    });
  }

  // Fire-and-forget: persist conflict history for challenges
  if (event.action === "proposal.challenge") {
    fireAndForget("collab:conflict-record", async () => {
      await recordConflict(event);
    });
  }

  // Fire-and-forget: update chemistry scores
  if (chemistryUpdate) {
    const cu = chemistryUpdate;
    fireAndForget("collab:chemistry-update", async () => {
      await persistChemistryUpdate(cu);
    });
  }

  return { trustAdjustments, chemistryUpdate };
}

// ---------------------------------------------------------------------------
// Chemistry assessment
// ---------------------------------------------------------------------------

function assessChemistry(
  agent1: string,
  agent2: string,
): CollaborationObserverResult["chemistryUpdate"] | undefined {
  const interactions = getPairInteractions(agent1, agent2);

  if (interactions.length < MIN_INTERACTIONS_FOR_CHEMISTRY) {
    return undefined;
  }

  const agrees = interactions.filter((i) => i.type === "agree").length;
  const challenges = interactions.filter((i) => i.type === "challenge").length;
  const total = interactions.length;

  // Chemistry score: weighted by agreement rate and total interactions
  const agreementRate = agrees / total;
  const challengeRate = challenges / total;

  // High agreement = good chemistry; frequent challenges = potential friction
  const score = Math.min(
    1,
    Math.max(
      0,
      agreementRate * 0.6 + (1 - challengeRate) * 0.3 + Math.min(total / 20, 1) * 0.1, // Familiarity bonus (more interactions = more reliable)
    ),
  );

  const worksWell = agreementRate >= HIGH_CHEMISTRY_THRESHOLD;

  return { agent1, agent2, score, worksWell };
}

// ---------------------------------------------------------------------------
// Async persistence (fire-and-forget)
// ---------------------------------------------------------------------------

async function persistTrustAdjustments(
  adjustments: Array<{ agent1: string; agent2: string; delta: number }>,
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  for (const adj of adjustments) {
    // TODO: await service.updateRelationship(adj.agent1, adj.agent2, {
    //   trustDelta: adj.delta,
    //   interactionType: 'collaboration',
    // });
    console.debug(
      `[humanization:collab] Trust adjustment: ${adj.agent1}<->${adj.agent2} delta=${adj.delta > 0 ? "+" : ""}${adj.delta}`,
    );
  }
}

async function recordConflict(event: CollaborationEvent): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  const _conflict: Omit<ConflictHistory, "id"> = {
    agentId: event.agentId,
    otherAgentId: event.involvedAgents[0],
    conflictType: "design", // Collaboration challenges are typically design disagreements
    description: event.content?.slice(0, 500),
    resolution: "waiting", // Will be updated when decision is finalized
  };

  // TODO: await service.recordConflict(conflict);
  console.debug(
    `[humanization:collab] Conflict recorded: ${event.agentId} challenged ${event.involvedAgents.join(", ")} ` +
      `in session ${event.sessionKey}`,
  );
}

async function persistChemistryUpdate(
  update: NonNullable<CollaborationObserverResult["chemistryUpdate"]>,
): Promise<void> {
  const service = getHumanizationService();
  if (!service) {
    return;
  }

  // TODO: await service.updateChemistry(update);
  console.debug(
    `[humanization:collab] Chemistry update: ${update.agent1}<->${update.agent2} ` +
      `score=${(update.score * 100).toFixed(0)}% worksWell=${update.worksWell}`,
  );
}
