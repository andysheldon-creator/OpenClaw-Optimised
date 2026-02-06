/**
 * AGENT ORCHESTRATOR
 *
 * Coordinates multi-agent collaboration and debates.
 * Enables teams of agents to work together like humans in a corporate hierarchy.
 */

import { callGateway } from "../gateway/call.js";

export type OrchestratorDecision = {
  topic: string;
  proposals: Array<{
    agentId: string;
    agentRole: string;
    proposal: string;
    reasoning: string;
  }>;
  challenges: Array<{
    from: string;
    against: string;
    challenge: string;
  }>;
  consensus?: {
    finalDecision: string;
    agreedBy: string[];
    decidedAt: number;
  };
};

export type DebatePhase = "opening" | "proposals" | "debate" | "consensus" | "concluded";

export interface AgentOrchestrator {
  /**
   * Initialize a team debate where multiple agents discuss and reach consensus
   */
  startTeamDebate(params: {
    topic: string;
    agents: Array<{ id: string; role: string; expertise: string }>;
    moderator?: { id: string; role: string };
    context?: string;
  }): Promise<string>; // Returns sessionKey

  /**
   * Get the current state of a debate
   */
  getDebateState(sessionKey: string): Promise<{
    phase: DebatePhase;
    proposals: OrchestratorDecision["proposals"];
    challenges: OrchestratorDecision["challenges"];
    agreements: string[];
    disagreements: string[];
  }>;

  /**
   * Move debate to next phase
   */
  advanceDebatePhase(sessionKey: string): Promise<void>;

  /**
   * Fetch all decisions made in a debate
   */
  getDebateDecisions(sessionKey: string): Promise<OrchestratorDecision[]>;

  /**
   * Spawn a team to implement based on debate decisions
   */
  spawnImplementationTeam(params: {
    debateSessionKey: string;
    implementationAgents: Array<{ id: string; role: string }>;
    label?: string;
  }): Promise<string>; // Returns implementation sessionKey
}

/**
 * Implementation of the Agent Orchestrator
 */
export function createAgentOrchestrator(): AgentOrchestrator {
  return {
    async startTeamDebate(params) {
      // Step 1: Initialize collaborative session in gateway
      const sessionResponse = await callGateway({
        method: "collab.session.init",
        params: {
          topic: params.topic,
          agents: params.agents.map((a) => a.id),
          moderator: params.moderator?.id,
        },
        clientName: "cli",
        mode: "cli",
      });

      const sessionKey = (sessionResponse as { sessionKey?: string }).sessionKey;
      if (!sessionKey) {
        throw new Error("Failed to initialize collaborative session");
      }

      // Step 2: Send opening brief to all agents
      const _openingBrief = `
You are participating in a team debate.

Topic: ${params.topic}

Your team:
${params.agents.map((a) => `- ${a.id} (${a.role}, expertise: ${a.expertise})`).join("\n")}

Context: ${params.context || "No additional context"}

Instructions:
1. You will debate with other agents about the best approach
2. Listen to other agents' proposals and challenges
3. Defend your position with reasoning
4. Work toward consensus
5. Be open to changing your mind if convinced

Debate session: ${sessionKey}
      `;

      // Step 3: Spawn all agents to participate in the debate
      // (In a real implementation, each agent would receive the context)

      return sessionKey;
    },

    async getDebateState(sessionKey) {
      const session = await callGateway({
        method: "collab.session.get",
        params: { sessionKey },
        clientName: "cli",
        mode: "cli",
      });

      const collabSession = session as {
        messages?: Array<{
          from: string;
          type: string;
          content: string;
        }>;
        decisions?: Array<{
          consensus?: { agreed: string[] };
        }>;
      };

      const proposals: OrchestratorDecision["proposals"] = [];
      const challenges: OrchestratorDecision["challenges"] = [];
      const agreements: string[] = [];
      const disagreements: string[] = [];

      // Parse messages to extract phase state
      if (collabSession.messages) {
        for (const msg of collabSession.messages) {
          if (msg.type === "proposal") {
            proposals.push({
              agentId: msg.from,
              agentRole: "unknown",
              proposal: msg.content.split("Proposal:")[1]?.split("Reasoning:")[0] || "",
              reasoning: msg.content.split("Reasoning:")[1] || "",
            });
          } else if (msg.type === "challenge") {
            const proposals_sample = proposals[0];
            if (proposals_sample) {
              challenges.push({
                from: msg.from,
                against: proposals_sample.agentId,
                challenge: msg.content,
              });
            }
          } else if (msg.type === "agreement") {
            agreements.push(msg.from);
          }
        }
      }

      return {
        phase: "debate",
        proposals,
        challenges,
        agreements,
        disagreements,
      };
    },

    async advanceDebatePhase(_sessionKey) {
      // Placeholder: in a full implementation, this would
      // - Evaluate current proposals
      // - Determine if consensus is reached
      // - Move to next phase
      // - Notify all agents
    },

    async getDebateDecisions(sessionKey) {
      const session = await callGateway({
        method: "collab.session.get",
        params: { sessionKey },
        clientName: "cli",
        mode: "cli",
      });

      const collabSession = session as {
        decisions?: Array<{
          topic: string;
          proposals?: Array<{
            from: string;
            proposal: string;
            reasoning: string;
          }>;
          consensus?: {
            finalDecision: string;
          };
        }>;
      };

      if (!collabSession.decisions) {
        return [];
      }

      return collabSession.decisions.map((decision) => ({
        topic: decision.topic,
        proposals:
          decision.proposals?.map((p) => ({
            agentId: p.from,
            agentRole: "unknown",
            proposal: p.proposal,
            reasoning: p.reasoning,
          })) || [],
        challenges: [],
        consensus: decision.consensus
          ? {
              finalDecision: decision.consensus.finalDecision,
              agreedBy: [],
              decidedAt: Date.now(),
            }
          : undefined,
      }));
    },

    async spawnImplementationTeam(params) {
      // Get decisions from debate
      const decisions = await this.getDebateDecisions(params.debateSessionKey);

      // Create implementation context from decisions
      const _implementationContext = decisions
        .map(
          (d) =>
            `Decision: ${d.topic}\n` +
            `Final: ${d.consensus?.finalDecision || "Pending"}\n` +
            `Reasoning: ${d.proposals.map((p) => `${p.agentId}: ${p.reasoning}`).join("; ")}`,
        )
        .join("\n\n");

      // Create implementation session key (would be done via sessions_spawn in real usage)
      const implSessionKey = `impl:${params.debateSessionKey}:${Date.now()}`;

      return implSessionKey;
    },
  };
}

/**
 * Example usage pattern for starting a team debate
 */
export async function exampleTeamDebate() {
  const orchestrator = createAgentOrchestrator();

  const debateSessionKey = await orchestrator.startTeamDebate({
    topic: "OAuth2 Authentication Architecture",
    agents: [
      {
        id: "backend-architect",
        role: "Backend",
        expertise: "API design, security best practices",
      },
      {
        id: "frontend-architect",
        role: "Frontend",
        expertise: "User experience, OAuth flows",
      },
      {
        id: "security-engineer",
        role: "Security",
        expertise: "OWASP, threat modeling, compliance",
      },
    ],
    moderator: {
      id: "cto",
      role: "Technical Leadership",
    },
    context: "Design OAuth2 flow for new platform with mobile + web clients",
  });

  console.log("Debate started:", debateSessionKey);

  // Wait for proposals
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const state = await orchestrator.getDebateState(debateSessionKey);
  console.log("Debate state:", state);

  // After consensus
  const decisions = await orchestrator.getDebateDecisions(debateSessionKey);
  console.log("Final decisions:", decisions);

  // Spawn implementation team
  const implSessionKey = await orchestrator.spawnImplementationTeam({
    debateSessionKey,
    implementationAgents: [
      { id: "backend-architect", role: "Backend" },
      { id: "frontend-architect", role: "Frontend" },
      { id: "testing-specialist", role: "QA" },
    ],
    label: "OAuth2 Implementation",
  });

  console.log("Implementation team spawned:", implSessionKey);
}
