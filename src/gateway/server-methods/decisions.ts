import type { CreateDecisionParams, DecisionStatus } from "../../infra/decisions/store.types.js";
import type { GatewayRequestHandlers } from "./types.js";
import {
  createDecision,
  getDecision,
  listDecisions,
  respondToDecision,
} from "../../infra/decisions/store.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

type DecisionCreateParams = CreateDecisionParams & {
  sessionKey?: string;
  agentId?: string;
  goalId?: string;
  assignmentId?: string;
};

type DecisionRespondParams = {
  decisionId: string;
  optionId?: string;
  optionValue?: string;
  textValue?: string;
  respondedBy: {
    userId: string;
    userName?: string;
  };
};

type DecisionListParams = {
  status?: DecisionStatus;
  agentId?: string;
  sessionKey?: string;
};

type DecisionGetParams = {
  decisionId: string;
};

function isValidDecisionType(type: unknown): type is "binary" | "choice" | "text" | "confirmation" {
  return type === "binary" || type === "choice" || type === "text" || type === "confirmation";
}

export const decisionHandlers: GatewayRequestHandlers = {
  "decision.create": ({ params, respond }) => {
    const request = params as DecisionCreateParams;

    if (!request.title || !request.question || !isValidDecisionType(request.type)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title, question, and valid type required"),
      );
      return;
    }

    if (request.type === "choice" && (!request.options || request.options.length < 2)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "choice type requires at least 2 options"),
      );
      return;
    }

    const decision = createDecision({
      type: request.type,
      title: request.title,
      question: request.question,
      options: request.options,
      context: {
        sessionKey: request.sessionKey,
        agentId: request.agentId,
        goalId: request.goalId,
        assignmentId: request.assignmentId,
      },
      timeoutMinutes: request.timeoutMinutes,
    });

    respond(true, { decision }, undefined);
  },

  "decision.respond": ({ params, respond }) => {
    const request = params as DecisionRespondParams;

    if (!request.decisionId || !request.respondedBy?.userId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "decisionId and respondedBy.userId required"),
      );
      return;
    }

    const decision = respondToDecision({
      decisionId: request.decisionId,
      optionId: request.optionId,
      optionValue: request.optionValue,
      textValue: request.textValue,
      respondedBy: request.respondedBy,
    });

    if (!decision) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "decision not found or already responded"),
      );
      return;
    }

    respond(true, { decision }, undefined);
  },

  "decision.list": ({ params, respond }) => {
    const request = params as DecisionListParams;
    const decisions = listDecisions({
      status: request.status,
      agentId: request.agentId,
      sessionKey: request.sessionKey,
    });
    respond(true, { decisions }, undefined);
  },

  "decision.get": ({ params, respond }) => {
    const request = params as DecisionGetParams;

    if (!request.decisionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "decisionId required"));
      return;
    }

    const decision = getDecision(request.decisionId);
    if (!decision) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "decision not found"));
      return;
    }

    respond(true, { decision }, undefined);
  },
};
