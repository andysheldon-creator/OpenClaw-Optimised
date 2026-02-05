/**
 * Agent Management API Handler
 *
 * Provides REST API endpoints for managing agent configurations.
 * Enables organizations to create, read, update, and delete custom agents.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { extractTenantContext, getBearerToken } from "./http-utils.js";
import {
  getAgentConfigManager,
  type AgentConfig,
  type CreateAgentConfigInput,
  type UpdateAgentConfigInput,
} from "../agents/agent-config.js";

type AgentsApiHttpOptions = {
  auth: ResolvedGatewayAuth;
  maxBodyBytes?: number;
  trustedProxies?: string[];
};

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

/**
 * Handle agent management API requests
 *
 * Endpoints:
 * - POST /v1/agents - Create new agent
 * - GET /v1/agents - List agents
 * - GET /v1/agents/:agentId - Get agent details
 * - PATCH /v1/agents/:agentId - Update agent
 * - DELETE /v1/agents/:agentId - Delete agent
 */
export async function handleAgentsApiHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: AgentsApiHttpOptions,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

  // Only handle /v1/agents endpoints
  if (!url.pathname.startsWith("/v1/agents")) {
    return false;
  }

  // Authorize request
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: { token, password: token },
    req,
    trustedProxies: opts.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  // Extract tenant context (organization/workspace)
  const tenantContext = extractTenantContext(req);
  if (!tenantContext.organizationId) {
    sendJson(res, 400, {
      error: {
        message: "Missing X-Organization-Id header",
        type: "invalid_request_error",
      },
    });
    return true;
  }

  const configManager = getAgentConfigManager();

  // Parse path: /v1/agents or /v1/agents/:agentId
  const pathMatch = url.pathname.match(/^\/v1\/agents(?:\/([^/]+))?$/);
  if (!pathMatch) {
    return false;
  }

  const agentId = pathMatch[1];

  // GET /v1/agents - List agents
  if (req.method === "GET" && !agentId) {
    try {
      const enabledOnlyParam = url.searchParams.get("enabled");
      const enabledOnly = enabledOnlyParam === "true";

      const agents = await configManager.listAgentConfigs({
        organizationId: tenantContext.organizationId,
        workspaceId: tenantContext.workspaceId,
        enabledOnly,
      });

      sendJson(res, 200, {
        object: "list",
        data: agents,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "api_error" },
      });
    }
    return true;
  }

  // GET /v1/agents/:agentId - Get agent details
  if (req.method === "GET" && agentId) {
    try {
      const agent = await configManager.getAgentConfig({
        organizationId: tenantContext.organizationId,
        workspaceId: tenantContext.workspaceId,
        agentId,
      });

      if (!agent) {
        sendJson(res, 404, {
          error: {
            message: `Agent ${agentId} not found`,
            type: "not_found_error",
          },
        });
        return true;
      }

      sendJson(res, 200, agent);
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "api_error" },
      });
    }
    return true;
  }

  // POST /v1/agents - Create agent
  if (req.method === "POST" && !agentId) {
    const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }

    try {
      const input = body as CreateAgentConfigInput;

      // Validate required fields
      if (!input.agentId || typeof input.agentId !== "string") {
        sendJson(res, 400, {
          error: {
            message: "Missing or invalid 'agentId' field",
            type: "invalid_request_error",
          },
        });
        return true;
      }

      if (!input.agentType || typeof input.agentType !== "string") {
        sendJson(res, 400, {
          error: {
            message: "Missing or invalid 'agentType' field",
            type: "invalid_request_error",
          },
        });
        return true;
      }

      if (!input.name || typeof input.name !== "string") {
        sendJson(res, 400, {
          error: {
            message: "Missing or invalid 'name' field",
            type: "invalid_request_error",
          },
        });
        return true;
      }

      // Ensure organizationId and workspaceId match tenant context
      const config: CreateAgentConfigInput = {
        ...input,
        organizationId: tenantContext.organizationId,
        workspaceId: tenantContext.workspaceId,
        enabled: input.enabled ?? true,
        description: input.description ?? "",
      };

      const agent = await configManager.createAgentConfig(config);

      sendJson(res, 201, agent);
    } catch (err) {
      // Handle duplicate key error
      const errMsg = String(err);
      if (errMsg.includes("duplicate key") || errMsg.includes("E11000")) {
        sendJson(res, 409, {
          error: {
            message: "Agent with this ID already exists",
            type: "duplicate_error",
          },
        });
      } else {
        sendJson(res, 500, {
          error: { message: errMsg, type: "api_error" },
        });
      }
    }
    return true;
  }

  // PATCH /v1/agents/:agentId - Update agent
  if (req.method === "PATCH" && agentId) {
    const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }

    try {
      const updates = body as UpdateAgentConfigInput;

      const updatedAgent = await configManager.updateAgentConfig({
        organizationId: tenantContext.organizationId,
        workspaceId: tenantContext.workspaceId,
        agentId,
        updates,
      });

      if (!updatedAgent) {
        sendJson(res, 404, {
          error: {
            message: `Agent ${agentId} not found`,
            type: "not_found_error",
          },
        });
        return true;
      }

      sendJson(res, 200, updatedAgent);
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "api_error" },
      });
    }
    return true;
  }

  // DELETE /v1/agents/:agentId - Delete agent
  if (req.method === "DELETE" && agentId) {
    try {
      const deleted = await configManager.deleteAgentConfig({
        organizationId: tenantContext.organizationId,
        workspaceId: tenantContext.workspaceId,
        agentId,
      });

      if (!deleted) {
        sendJson(res, 404, {
          error: {
            message: `Agent ${agentId} not found`,
            type: "not_found_error",
          },
        });
        return true;
      }

      sendJson(res, 200, { deleted: true, agentId });
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "api_error" },
      });
    }
    return true;
  }

  // Method not allowed for this endpoint
  sendMethodNotAllowed(res);
  return true;
}
