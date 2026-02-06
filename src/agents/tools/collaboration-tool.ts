import { Type } from "@sinclair/typebox";
import { resolveSessionAgentId } from "../agent-scope.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringArrayParam, readStringParam } from "./common.js";
import { callGatewayTool } from "./gateway.js";

const COLLAB_ACTIONS = [
  "session.init",
  "proposal.publish",
  "proposal.challenge",
  "proposal.agree",
  "decision.finalize",
  "session.get",
  "thread.get",
] as const;

// Flattened schema — discriminator (action) determines which fields are relevant.
// Runtime validates required fields per action.
const CollaborationToolSchema = Type.Object({
  action: stringEnum(COLLAB_ACTIONS, {
    description:
      "session.init: create a collaborative debate session. " +
      "proposal.publish: submit a proposal to a decision thread. " +
      "proposal.challenge: challenge an existing proposal. " +
      "proposal.agree: agree with a decision. " +
      "decision.finalize: moderator finalizes a decision. " +
      "session.get: read full session state. " +
      "thread.get: read a specific decision thread.",
  }),
  // session.init
  topic: Type.Optional(Type.String({ description: "Session topic (for session.init)" })),
  agents: Type.Optional(
    Type.Array(Type.String(), {
      description: "Agent IDs to include in the session (for session.init, minimum 2)",
    }),
  ),
  moderator: Type.Optional(
    Type.String({ description: "Moderator agent ID (for session.init, optional)" }),
  ),
  // shared across most actions
  sessionKey: Type.Optional(
    Type.String({ description: "Collaboration session key (returned by session.init)" }),
  ),
  // proposal.publish
  decisionTopic: Type.Optional(
    Type.String({ description: "Topic for the decision thread (for proposal.publish)" }),
  ),
  proposal: Type.Optional(Type.String({ description: "The proposal text (for proposal.publish)" })),
  reasoning: Type.Optional(
    Type.String({ description: "Reasoning behind the proposal (for proposal.publish)" }),
  ),
  // proposal.challenge / proposal.agree / decision.finalize
  decisionId: Type.Optional(
    Type.String({
      description: "Decision thread ID (for proposal.challenge, proposal.agree, decision.finalize)",
    }),
  ),
  challenge: Type.Optional(Type.String({ description: "Challenge text (for proposal.challenge)" })),
  suggestedAlternative: Type.Optional(
    Type.String({
      description: "Alternative suggestion when challenging (for proposal.challenge, optional)",
    }),
  ),
  // decision.finalize
  finalDecision: Type.Optional(
    Type.String({ description: "The final decision text (for decision.finalize)" }),
  ),
});

export function createCollaborationTool(opts?: { agentSessionKey?: string }): AnyAgentTool {
  return {
    label: "Collaboration",
    name: "collaboration",
    description:
      "Multi-agent collaboration: create debate sessions, publish proposals, challenge or agree with proposals, and finalize decisions. " +
      "Use session.init to start a collaborative session, then proposal.publish/challenge/agree to debate, and decision.finalize to conclude.",
    parameters: CollaborationToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const agentId = resolveSessionAgentId({ sessionKey: opts?.agentSessionKey });

      if (action === "session.init") {
        const topic = readStringParam(params, "topic", { required: true });
        const agents = readStringArrayParam(params, "agents", { required: true });
        const moderator = readStringParam(params, "moderator");
        const result = await callGatewayTool(
          "collab.session.init",
          {},
          { topic, agents, moderator },
        );
        return jsonResult(result);
      }

      if (action === "proposal.publish") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const decisionTopic = readStringParam(params, "decisionTopic", { required: true });
        const proposal = readStringParam(params, "proposal", { required: true });
        const reasoning = readStringParam(params, "reasoning", { required: true });
        const result = await callGatewayTool(
          "collab.proposal.publish",
          {},
          {
            sessionKey,
            agentId,
            decisionTopic,
            proposal,
            reasoning,
          },
        );
        return jsonResult(result);
      }

      if (action === "proposal.challenge") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const decisionId = readStringParam(params, "decisionId", { required: true });
        const challenge = readStringParam(params, "challenge", { required: true });
        const suggestedAlternative = readStringParam(params, "suggestedAlternative");
        const result = await callGatewayTool(
          "collab.proposal.challenge",
          {},
          {
            sessionKey,
            decisionId,
            agentId,
            challenge,
            suggestedAlternative,
          },
        );
        return jsonResult(result);
      }

      if (action === "proposal.agree") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const decisionId = readStringParam(params, "decisionId", { required: true });
        const result = await callGatewayTool(
          "collab.proposal.agree",
          {},
          {
            sessionKey,
            decisionId,
            agentId,
          },
        );
        return jsonResult(result);
      }

      if (action === "decision.finalize") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const decisionId = readStringParam(params, "decisionId", { required: true });
        const finalDecision = readStringParam(params, "finalDecision", { required: true });
        const result = await callGatewayTool(
          "collab.decision.finalize",
          {},
          {
            sessionKey,
            decisionId,
            finalDecision,
            moderatorId: agentId,
          },
        );
        return jsonResult(result);
      }

      if (action === "session.get") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const result = await callGatewayTool("collab.session.get", {}, { sessionKey });
        return jsonResult(result);
      }

      if (action === "thread.get") {
        const sessionKey = readStringParam(params, "sessionKey", { required: true });
        const decisionId = readStringParam(params, "decisionId", { required: true });
        const result = await callGatewayTool("collab.thread.get", {}, { sessionKey, decisionId });
        return jsonResult(result);
      }

      throw new Error(`Unknown collaboration action: ${action}`);
    },
  };
}
