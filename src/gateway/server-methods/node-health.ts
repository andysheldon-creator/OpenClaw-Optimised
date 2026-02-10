import type { GatewayRequestHandlers } from "./types.js";
import { getLatestNodeHealthFrames, getRecentNodeHealthFrames } from "../node-health.js";
import { ErrorCodes, errorShape, validateNodeHealthGetParams } from "../protocol/index.js";
import { respondInvalidParams } from "./nodes.helpers.js";

export const nodeHealthHandlers: GatewayRequestHandlers = {
  "node.health.get": async ({ params, respond }) => {
    if (!validateNodeHealthGetParams(params)) {
      respondInvalidParams({
        respond,
        method: "node.health.get",
        validator: validateNodeHealthGetParams,
      });
      return;
    }

    const p = params as { nodeId?: string; limit?: number };
    const rawNodeId = typeof p.nodeId === "string" ? p.nodeId : undefined;
    const nodeId = typeof rawNodeId === "string" ? rawNodeId.trim() : "";

    // Defensive check: older validators (or other callers) might allow whitespace-only values.
    if (rawNodeId !== undefined && nodeId.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId must not be blank"));
      return;
    }

    if (!nodeId) {
      if (p.limit !== undefined) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "limit requires nodeId"));
        return;
      }
      respond(true, { ts: Date.now(), entries: getLatestNodeHealthFrames() }, undefined);
      return;
    }

    const entries = getRecentNodeHealthFrames({ nodeId, limit: p.limit });
    respond(true, { ts: Date.now(), nodeId, entries }, undefined);
  },
};
