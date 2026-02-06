/**
 * COLLABORATION + SESSIONS_SPAWN INTEGRATION
 *
 * Automatically inject collaboration context into spawned agents
 * so they know about shared decisions and team context.
 */

import { getCollaborationContext } from "../gateway/server-methods/collaboration.js";
import { getCollaborationSystemPrompt, getRoleSpecificGuidance } from "./collaboration-prompts.js";
import { loadCollaborationSession } from "./collaboration-storage.js";
import { listDelegationsForAgent } from "./delegation-registry.js";

/**
 * When spawning agents after a debate, build context they need
 */
export async function buildCollaborationContext(params: {
  debateSessionKey?: string;
  agentId: string;
  agentRole?: string;
  agentExpertise?: string;
  teamContext?: string;
  decisionIds?: string[]; // which decisions to reference
}): Promise<{
  systemPromptAddendum: string;
  decisionContext: string;
  sharedContext: string;
}> {
  let decisionContext = "";
  let sharedContext = "";

  // If referencing a debate session, load the decisions
  // Check both the in-memory store (live gateway sessions) and disk storage
  if (params.debateSessionKey) {
    const session =
      getCollaborationContext(params.debateSessionKey) ??
      (await loadCollaborationSession(params.debateSessionKey));
    if (session) {
      // Build context from debate
      sharedContext = `
SHARED TEAM CONTEXT:
Topic: ${session.topic}
Team Members: ${session.members.join(", ")}
Moderator: ${session.moderator || "None"}

DISCUSSION THREAD:
`;

      for (const message of session.messages) {
        sharedContext += `- ${message.from}: ${message.content}\n`;
      }

      // Build decision context
      decisionContext = "\nDECISIONS FROM TEAM DEBATE:\n";
      for (const decision of session.decisions) {
        if (params.decisionIds && !params.decisionIds.includes(decision.id)) {
          continue; // Skip if not in filter
        }

        decisionContext += `\n### ${decision.topic}\n`;
        if (decision.consensus) {
          decisionContext += `CONSENSUS DECISION: ${decision.consensus.finalDecision}\n`;
          // Handle both in-memory (agreed) and disk (agreedBy) formats
          const agreedList =
            "agreedBy" in decision.consensus
              ? (decision.consensus as { agreedBy: string[] }).agreedBy
              : "agreed" in decision.consensus
                ? (decision.consensus as { agreed: string[] }).agreed
                : [];
          decisionContext += `Agreed by: ${agreedList.join(", ")}\n`;
        } else {
          decisionContext += `Proposals:\n`;
          for (const proposal of decision.proposals) {
            decisionContext += `- ${proposal.from}: ${proposal.proposal}\n`;
          }
        }
      }
    }
  }

  // Get role-specific guidance
  const roleGuidance = params.agentRole ? getRoleSpecificGuidance(params.agentRole) : "";

  // Get collaboration system prompt for the phase
  const collabPrompt = getCollaborationSystemPrompt({
    role: params.agentRole || "Unknown",
    expertise: params.agentExpertise || "General",
    teamContext: params.teamContext || "No additional context",
    debateTopic: "Implementation based on shared decisions",
    phase: "finalization", // After debate, we're in implementation phase
  });

  // Inject delegation context if the agent has active delegations
  let delegationContext = "";
  try {
    const activeDelegations = listDelegationsForAgent(params.agentId);
    const inProgress = activeDelegations.filter(
      (d) => d.state === "assigned" || d.state === "in_progress",
    );
    if (inProgress.length > 0) {
      delegationContext = "\nACTIVE DELEGATIONS:\n";
      for (const d of inProgress) {
        const dir = d.fromAgentId === params.agentId ? "delegated to" : "received from";
        const other = d.fromAgentId === params.agentId ? d.toAgentId : d.fromAgentId;
        delegationContext += `- [${d.priority}] ${dir} ${other}: ${d.task}\n`;
      }
    }
  } catch {
    // Delegation data is optional
  }

  const systemPromptAddendum = `
${collabPrompt}

${roleGuidance}

${decisionContext}

${sharedContext}

${delegationContext}

YOUR TASK:
You are now implementing decisions that were made by the full team.
- Reference team decisions in your work
- Ask for clarification if something is ambiguous
- Work within the constraints defined by the team
- Update the team if you encounter issues with the design
- Use the delegation tool to delegate subtasks or request help from superiors
`;

  return {
    systemPromptAddendum,
    decisionContext,
    sharedContext,
  };
}

/**
 * Example: Spawning implementation team after debate
 *
 * Usage:
 * ```typescript
 * const debateSessionKey = "collab:oauth2:123456";
 *
 * // Build context for Backend
 * const backendContext = await buildCollaborationContext({
 *   debateSessionKey,
 *   agentId: "backend-architect",
 *   agentRole: "Backend Architect",
 *   agentExpertise: "API design, security"
 * });
 *
 * // Spawn with shared context
 * sessions_spawn({
 *   task: `Implement OAuth2 API based on team decisions.
 *
 * ${backendContext.systemPromptAddendum}
 *
 * IMPLEMENTATION CHECKLIST:
 * [ ] POST /auth/oauth endpoint
 * [ ] GET /auth/callback handler
 * [ ] Token exchange endpoint
 * [ ] PKCE validation middleware
 * [ ] State parameter validation
 * [ ] Secure cookie handling
 *   `,
 *   agentId: "backend-architect",
 *   label: "OAuth2 API Implementation"
 * });
 * ```
 */

/**
 * Helper to format decisions as a task section
 */
export function formatDecisionsForTask(
  decisions: Array<{
    id: string;
    topic: string;
    consensus?: { finalDecision: string };
    proposals?: Array<{ from: string; proposal: string }>;
  }>,
): string {
  let formatted = "\n## TEAM DECISIONS\n\n";

  for (const decision of decisions) {
    formatted += `### ${decision.topic}\n`;
    if (decision.consensus) {
      formatted += `**Decision**: ${decision.consensus.finalDecision}\n`;
    } else if (decision.proposals) {
      formatted += `**Proposals**:\n`;
      for (const proposal of decision.proposals) {
        formatted += `- ${proposal.from}: ${proposal.proposal}\n`;
      }
    }
    formatted += "\n";
  }

  return formatted;
}

/**
 * Wrapper for sessions_spawn that automatically handles collaboration
 */
export interface SpawnWithCollaborationOptions {
  task: string;
  agentId: string;
  label?: string;
  debateSessionKey?: string; // Reference to prior debate
  agentRole?: string;
  agentExpertise?: string;
  teamContext?: string;
  decisionIds?: string[]; // Which decisions to include
  timeout?: number;
  model?: string;
}

/**
 * Build a task with collaboration context pre-injected
 */
export async function buildCollaborationAwareTask(
  options: SpawnWithCollaborationOptions,
): Promise<string> {
  let task = options.task;

  if (options.debateSessionKey) {
    const context = await buildCollaborationContext({
      debateSessionKey: options.debateSessionKey,
      agentId: options.agentId,
      agentRole: options.agentRole,
      agentExpertise: options.agentExpertise,
      teamContext: options.teamContext,
      decisionIds: options.decisionIds,
    });

    // Prepend collaboration context to task
    task = `
${context.systemPromptAddendum}

---

ORIGINAL TASK:
${task}
`;
  }

  return task;
}
