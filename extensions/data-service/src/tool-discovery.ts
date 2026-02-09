/**
 * Discovery tools: connector_list, connector_actions, connector_schema,
 * connector_lookup, and user_connectors.
 *
 * For Wexa Coworker Web integration:
 * - User context (orgId/userId) MUST be set via data-service.setContext
 * - Tools that require user context will fail with clear error if not set
 */

import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import type { DataServiceConfig } from "./config.js";
import { getEffectiveUserContext, hasUserContext, MISSING_CONTEXT_ERROR } from "./config.js";
import { makeDataServiceRequest } from "./http.js";
import {
  ConnectorActionsSchema,
  ConnectorListSchema,
  ConnectorLookupSchema,
  ConnectorSchemaSchema,
  UserConnectorsSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// connector_list
// ---------------------------------------------------------------------------

export function createConnectorListTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector List",
    name: "connector_list",
    description:
      "List all available connector types from the system. Shows connectors that CAN be configured (not necessarily ones the user has). Use user_connectors to see the user's configured connectors. This is a read-only/pull action — execute autonomously without asking permission.",
    parameters: ConnectorListSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      const params = args as Record<string, unknown>;
      const category = readStringParam(params, "category", { required: false });

      const endpoint = category
        ? `/retrieve/all/connectors?category=${encodeURIComponent(category)}`
        : "/retrieve/all/connectors";

      const result = await makeDataServiceRequest(endpoint, { method: "GET", config: dsConfig });

      if (!result.success) {
        return jsonResult({ success: false, error: result.error });
      }

      // Trim response to essential fields only — the raw API returns huge payloads
      // (base64 readmes, full tool schemas, UI forms) that overwhelm the LLM context.
      const raw = result.data as { data?: unknown[] } | unknown[];
      const items = Array.isArray(raw) ? raw : ((raw?.data ?? []) as unknown[]);
      const trimmed = (items as Array<Record<string, unknown>>).map((c) => ({
        name: c.name,
        description:
          typeof c.description === "string" ? c.description.slice(0, 200) : c.description,
        category: c.category,
        connector_type: c.connector_type,
        actions: Array.isArray(c.actions)
          ? (c.actions as Array<Record<string, unknown>>).map((a) => ({
              name: a.name,
              action: a.sort ?? a.name,
              description: a.description,
            }))
          : [],
        data_loaders: Array.isArray(c.data_loaders)
          ? (c.data_loaders as Array<Record<string, unknown>>).map((d) => ({
              name: d.name,
              description: d.description,
            }))
          : [],
        is_mcp: c.is_mcp ?? false,
      }));

      return jsonResult({
        success: true,
        description: "Available connector types that can be configured",
        total: trimmed.length,
        connectors: trimmed,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// connector_actions
// ---------------------------------------------------------------------------

export function createConnectorActionsTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector Actions",
    name: "connector_actions",
    description:
      "Get available actions for a specific connector type. Returns action names, descriptions, and required input parameters. This is a read-only/pull action — execute autonomously. Use this to discover what actions a connector supports before calling connector_search for the exact schema.",
    parameters: ConnectorActionsSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      const params = args as Record<string, unknown>;
      const connector = readStringParam(params, "connector", { required: true });

      const endpoint = `/retrieve/all/connectors?search_key=${encodeURIComponent(connector)}&limit=10`;
      const result = await makeDataServiceRequest(endpoint, { method: "GET", config: dsConfig });

      if (!result.success) {
        return jsonResult({ success: false, connector, error: result.error });
      }

      const responseData = result.data as {
        data?: Array<{
          category?: string;
          actions?: Array<{ name?: string; sort?: string; description?: string }>;
        }>;
      };
      const connectors = responseData?.data ?? [];
      const matchingConnector = connectors.find(
        (c) => c.category?.toLowerCase() === connector.toLowerCase(),
      );

      if (!matchingConnector) {
        return jsonResult({
          success: false,
          connector,
          error: `Connector "${connector}" not found. Use connector_list to see available connectors.`,
        });
      }

      const actionsWithSchema: Array<Record<string, unknown>> = [];
      for (const action of matchingConnector.actions ?? []) {
        const actionName = action.sort ?? action.name?.toLowerCase();
        if (!actionName) continue;

        const schemaEndpoint = `/actions/${connector}/${actionName}`;
        const schemaResult = await makeDataServiceRequest(schemaEndpoint, {
          method: "GET",
          config: dsConfig,
        });

        if (schemaResult.success && schemaResult.data) {
          const schemaData = schemaResult.data as {
            input?: {
              fields?: Array<{
                required?: boolean;
                field_id?: string;
                label?: string;
                type?: string;
                description?: string;
              }>;
            };
            description?: string;
          };
          const fields = schemaData.input?.fields ?? [];
          actionsWithSchema.push({
            name: action.name,
            action: actionName,
            description: schemaData.description ?? action.description,
            required_fields: fields.filter((f) => f.required),
            optional_fields: fields.filter((f) => !f.required),
          });
        } else {
          actionsWithSchema.push({
            name: action.name,
            action: actionName,
            description: action.description,
            note: "Could not fetch detailed schema. Use connector_execute and check error for required fields.",
          });
        }
      }

      return jsonResult({ success: true, connector, actions: actionsWithSchema });
    },
  };
}

// ---------------------------------------------------------------------------
// connector_schema
// ---------------------------------------------------------------------------

export function createConnectorSchemaTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector Schema",
    name: "connector_schema",
    description: `Get the required input fields for a connector action. Read-only — execute autonomously.

**Use this when:**
- You want to preview required fields before executing
- You need to know what information to gather (via other connectors or by asking the user)

Note: connector_search also returns schema when you specify an action, so you may not need this separately.`,
    parameters: ConnectorSchemaSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      const params = args as Record<string, unknown>;
      const connector = readStringParam(params, "connector", { required: true });
      const action = readStringParam(params, "action", { required: true });

      const endpoint = `/actions/${connector}/${action}`;
      const result = await makeDataServiceRequest(endpoint, { method: "GET", config: dsConfig });

      if (!result.success) {
        return jsonResult({ success: false, connector, action, error: result.error });
      }

      const schemaData = result.data as {
        input?: {
          fields?: Array<{
            required?: boolean;
            field_id?: string;
            label?: string;
            type?: string;
            description?: string;
            default_value?: unknown;
          }>;
        };
        output?: {
          fields?: Array<{
            field_id?: string;
            label?: string;
            type?: string;
            description?: string;
          }>;
        };
        description?: string;
      };

      const inputFields = schemaData.input?.fields ?? [];
      return jsonResult({
        success: true,
        connector,
        action,
        description: schemaData.description,
        input: {
          required_fields: inputFields.filter((f) => f.required),
          optional_fields: inputFields.filter((f) => !f.required),
        },
        output: schemaData.output,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// connector_lookup
// ---------------------------------------------------------------------------

export function createConnectorLookupTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector Lookup",
    name: "connector_lookup",
    description:
      "Look up if a user has a specific connector configured and get its connector_id. Read-only — execute autonomously. Useful when chaining connectors: check if the user has a connector before trying to use it.",
    parameters: ConnectorLookupSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      // Check if user context is set
      if (!hasUserContext()) {
        return jsonResult({ success: false, error: MISSING_CONTEXT_ERROR });
      }

      const params = args as Record<string, unknown>;
      const connector = readStringParam(params, "connector", { required: true });

      const userCtx = getEffectiveUserContext();
      const { orgId, userId, projectId } = userCtx;

      // Build query with user_id and optionally projectID
      const query: Record<string, string> = { user_id: userId || "", category: connector };
      if (projectId) {
        query.projectID = projectId;
      }

      const endpoint = `/retrieve/connectors/${orgId}/on/query`;
      const result = await makeDataServiceRequest(endpoint, {
        method: "POST",
        body: {
          query,
          projection: { _id: 1, category: 1, name: 1, logo: 1, status: 1, data_to_verify: 1 },
        },
        config: dsConfig,
      });

      if (!result.success) {
        if (result.status === 404 || result.error?.toLowerCase().includes("not found")) {
          return jsonResult({
            success: false,
            connector,
            configured: false,
            message: `The "${connector}" connector is not configured for this user.`,
            action_required: "connect_service",
            help: `To use ${connector}, please connect it through the Data-Service dashboard.`,
          });
        }
        return jsonResult({ success: false, connector, error: result.error });
      }

      // The /on/query endpoint returns an array
      const dataArray = result.data as Array<{
        _id?: string;
        connectorID?: string;
        name?: string;
        status?: string;
      }>;

      const data = Array.isArray(dataArray) && dataArray.length > 0 ? dataArray[0] : null;
      const connectorId = data?._id ?? data?.connectorID;
      if (!connectorId) {
        return jsonResult({
          success: false,
          connector,
          configured: false,
          message: `The "${connector}" connector is not configured for this user.`,
          action_required: "connect_service",
        });
      }

      return jsonResult({
        success: true,
        connector,
        configured: true,
        connector_id: connectorId,
        name: data?.name,
        status: data?.status,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// user_connectors
// ---------------------------------------------------------------------------

export function createUserConnectorsTool(dsConfig: DataServiceConfig) {
  return {
    label: "User Connectors",
    name: "user_connectors",
    description: `**ALWAYS CALL THIS FIRST** before any connector operation.

Returns all connectors the user has configured and ready to use.

**WORKFLOW after calling this:**
1. Identify which configured connector(s) are relevant to the user's request
2. Call connector_search(query="category", action="action_name") to get the exact schema
3. If the task needs data you don't have, chain OTHER user connectors to look it up (e.g., use LinkedIn to get an email, use search to research a topic)
4. For pull/read actions → execute autonomously, then summarize
5. For push/write actions → show draft, get approval, then execute

**NEVER fabricate data.** If no connector can provide a required value, ask the user.`,
    parameters: UserConnectorsSchema,
    execute: async (_toolCallId: string, _args: unknown) => {
      // Check if user context is set
      if (!hasUserContext()) {
        return jsonResult({ success: false, error: MISSING_CONTEXT_ERROR });
      }

      const userCtx = getEffectiveUserContext();
      const { orgId, userId, projectId } = userCtx;

      // Debug logging to verify context is being received
      console.log("[data-service] user_connectors called with context:", {
        orgId,
        userId,
        projectId,
        hasContext: !!(orgId && userId),
      });

      // Build query with user_id and optionally projectID
      const query: Record<string, string> = { user_id: userId || "" };
      if (projectId) {
        query.projectID = projectId;
      }

      const endpoint = `/retrieve/connectors/${orgId}/on/query`;
      const result = await makeDataServiceRequest(endpoint, {
        method: "POST",
        body: {
          query,
          projection: { _id: 1, category: 1, name: 1, logo: 1, status: 1 },
        },
        config: dsConfig,
      });

      // Debug logging to see API response
      console.log("[data-service] user_connectors API response:", {
        success: result.success,
        dataLength: Array.isArray(result.data) ? result.data.length : 0,
        error: result.error,
      });

      if (result.success && result.data) {
        const data = result.data as unknown[];
        if (Array.isArray(data) && data.length > 0) {
          return jsonResult({
            success: true,
            description: "Connectors configured by the user",
            connectors: data,
          });
        }
      }

      return jsonResult({
        success: true,
        description: "No connectors found for this user",
        connectors: [],
        message:
          "The user has not configured any connectors yet. To use external services, please connect them through the Data-Service dashboard.",
        help: "Available connector types can be discovered using the connector_list tool.",
      });
    },
  };
}
