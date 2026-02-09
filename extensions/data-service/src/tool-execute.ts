/**
 * connector_execute tool -- executes actions on Data-Service connectors.
 *
 * This is STEP 2 of the workflow: search → confirm → execute.
 *
 * For Wexa Coworker Web integration:
 * - User context (orgId/userId) MUST be set via data-service.setContext
 */

import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import type { DataServiceConfig } from "./config.js";
import { hasUserContext, MISSING_CONTEXT_ERROR } from "./config.js";
import { lookupUserConnector, makeDataServiceRequest } from "./http.js";
import { ConnectorExecuteSchema } from "./schemas.js";

export function createConnectorExecuteTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector Execute",
    name: "connector_execute",
    description: `Execute a connector action.

**PREREQUISITES — do these BEFORE calling this tool:**
1. Called connector_search(query, action) to get the exact schema and field names
2. Verified you have ALL required field values from REAL sources (user message, tool responses, other connectors)
3. Identified if this is a PULL or PUSH action (see below)

**NEVER HALLUCINATE VALUES:**
- Every value in the input JSON MUST come from: the user's message, a connector tool response, or another real source.
- If you don't have a required value (e.g., email, ID, name), use other connectors to look it up or ask the user.
- NEVER fabricate emails, phone numbers, IDs, names, URLs, or any other data.

**FIELD NAMES — USE EXACT SCHEMA NAMES:**
- Use ONLY the field_id names from connector_search schema.
- If the schema says a field expects an identifier/slug, extract it from any URL you have.

**PULL vs PUSH — IMPORTANT:**
- **PULL actions** (search, read, list, get, fetch, lookup, retrieve, validate, find, query): Execute IMMEDIATELY without asking user. These are read-only and safe.
- **PUSH actions** (send, create, update, delete, upload, reply, post, write, modify, remove): MUST show a preview/draft to user and get explicit confirmation BEFORE executing. These have side effects.

**CRITICAL — WHEN TO STOP:**
- If response contains \`"DO_NOT_RETRY": true\` → STOP. Tell user the \`user_message\`.
- If error is "timeout", "rate limit", "unauthorized" → STOP. Do not retry.
- You may retry ONCE only for "missing field" or "invalid field name" errors.
- After 1 failed retry → STOP and tell the user what happened.

**Usage:**
- connector: The connector category (from connector_search)
- action: The action name (from connector_search available_actions)
- input: JSON string with EXACT field names from the schema`,
    parameters: ConnectorExecuteSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      // Check if user context is set
      if (!hasUserContext()) {
        return jsonResult({ success: false, error: MISSING_CONTEXT_ERROR });
      }

      const params = args as Record<string, unknown>;
      const connector = readStringParam(params, "connector", { required: true });
      const action = readStringParam(params, "action", { required: true });
      const inputStr = readStringParam(params, "input", { required: true });
      const connectorIdParam = readStringParam(params, "connector_id", { required: false });

      // Parse input JSON
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(inputStr);
      } catch {
        return jsonResult({ success: false, error: `Invalid JSON input: ${inputStr}` });
      }

      // STEP 1: Check if the connector exists in the system
      const systemCheckEndpoint = `/retrieve/all/connectors?search_key=${encodeURIComponent(connector)}&limit=5`;
      const systemCheckResult = await makeDataServiceRequest(systemCheckEndpoint, {
        method: "GET",
        config: dsConfig,
      });

      let connectorExistsInSystem = false;
      let availableActions: string[] = [];

      if (systemCheckResult.success && systemCheckResult.data) {
        const responseData = systemCheckResult.data as {
          data?: Array<{ category?: string; actions?: Array<{ name?: string; sort?: string }> }>;
        };
        const connectors = responseData?.data ?? [];
        const matchingConnector = connectors.find(
          (c) => c.category?.toLowerCase() === connector.toLowerCase(),
        );
        if (matchingConnector) {
          connectorExistsInSystem = true;
          availableActions = (matchingConnector.actions ?? [])
            .map((a) => a.sort ?? a.name)
            .filter(Boolean) as string[];
        }
      }

      if (!connectorExistsInSystem) {
        return jsonResult({
          success: false,
          error: `The connector "${connector}" does not exist in the system.`,
          message: `"${connector}" is not a valid connector type. Use connector_list to see all available connectors.`,
          suggestion:
            "Check the connector name spelling or use connector_list to discover available connectors.",
        });
      }

      if (availableActions.length > 0 && !availableActions.includes(action)) {
        return jsonResult({
          success: false,
          error: `The action "${action}" is not available for connector "${connector}".`,
          available_actions: availableActions,
          suggestion: `Use one of the available actions: ${availableActions.join(", ")}`,
        });
      }

      // STEP 2: Resolve connector_id
      let connectorId = connectorIdParam;

      if (!connectorId && dsConfig.connectorIds?.[connector]) {
        connectorId = dsConfig.connectorIds[connector];
      }

      if (!connectorId) {
        const lookup = await lookupUserConnector(connector, dsConfig);
        if (lookup.error) {
          return jsonResult({ success: false, error: lookup.error });
        }
        if (lookup.notConfigured || !lookup.connectorId) {
          return jsonResult({
            success: false,
            error: `The "${connector}" connector is not configured for this user.`,
            connector_exists_in_system: true,
            user_has_connected: false,
            message: `The "${connector}" connector exists but you haven't connected it yet. Please connect the "${connector}" service first.`,
            action_required: "connect_service",
            connector,
            help: `To use ${connector}, you need to:\n1. Go to the Data-Service dashboard\n2. Find "${connector}" in the available connectors\n3. Click "Connect" and follow the authentication flow\n4. Once connected, this tool will automatically find and use the connector.`,
          });
        }
        connectorId = lookup.connectorId;
      }

      // STEP 3: Fetch schema to validate input
      const schemaEndpoint = `/actions/${connector}/${action}`;
      const schemaResult = await makeDataServiceRequest(schemaEndpoint, {
        method: "GET",
        config: dsConfig,
      });

      let requiredFields: Array<{ field_id?: string; type?: string; description?: string }> = [];
      let optionalFields: Array<{ field_id?: string; type?: string; description?: string }> = [];

      if (schemaResult.success && schemaResult.data) {
        const schemaData = schemaResult.data as {
          input?: {
            fields?: Array<{
              required?: boolean;
              field_id?: string;
              type?: string;
              description?: string;
            }>;
          };
        };
        const fields = schemaData.input?.fields ?? [];
        requiredFields = fields
          .filter((f) => f.required)
          .map((f) => ({ field_id: f.field_id, type: f.type, description: f.description }));
        optionalFields = fields
          .filter((f) => !f.required)
          .map((f) => ({ field_id: f.field_id, type: f.type, description: f.description }));

        // STEP 4: Validate required fields
        const missingFields = requiredFields.filter((f) => f.field_id && !(f.field_id in input));
        if (missingFields.length > 0) {
          return jsonResult({
            success: false,
            connector,
            action,
            error: `Missing required fields: ${missingFields.map((f) => f.field_id).join(", ")}`,
            missing_fields: missingFields,
            all_required_fields: requiredFields,
            optional_fields: optionalFields,
            your_input: input,
            hint: "Please provide all required fields in the input JSON.",
          });
        }
      }

      // STEP 5: Execute the action
      const endpoint = `/actions/${connector}/${action}/${connectorId}`;
      const result = await makeDataServiceRequest(endpoint, {
        method: "POST",
        body: input,
        config: dsConfig,
      });

      if (!result.success) {
        const errorLower = (result.error ?? "").toLowerCase();

        // Check for non-retryable errors
        const isTimeout = errorLower.includes("timeout") || errorLower.includes("timed out");
        const isRateLimit = errorLower.includes("rate limit") || errorLower.includes("too many");
        const isAuthError =
          errorLower.includes("unauthorized") || errorLower.includes("authentication");
        const isServerError =
          errorLower.includes("service unavailable") || /5\d\d/.test(result.error ?? "");
        const isNonRetryable = isTimeout || isRateLimit || isAuthError || isServerError;

        const inputValues = Object.values(input);
        const hasUrlLikeValue = inputValues.some(
          (v) => typeof v === "string" && (v.includes("http") || v.includes(".com/")),
        );

        let suggestion: string | undefined;
        if (hasUrlLikeValue && !isNonRetryable) {
          suggestion =
            "You provided a URL but this action may expect an internal ID. Call connector_search with different actions to find one that accepts URLs.";
        }

        // Build response with explicit stop instructions for non-retryable errors
        const response: Record<string, unknown> = {
          success: false,
          connector,
          action,
          connector_id: connectorId,
          error: result.error,
          your_input: input,
        };

        if (isNonRetryable) {
          response.DO_NOT_RETRY = true;
          response.STOP_NOW =
            "This error cannot be fixed by retrying. Tell the user what happened and stop.";
          if (isTimeout) {
            response.user_message = `The ${connector} service is taking too long to respond. Please try again in a few minutes.`;
          } else if (isRateLimit) {
            response.user_message = `The ${connector} service is rate-limited. Please wait a moment and try again.`;
          } else if (isAuthError) {
            response.user_message = `The ${connector} connector needs to be reconnected. Please reconnect it in the settings.`;
          } else {
            response.user_message = `The ${connector} service is temporarily unavailable. Please try again later.`;
          }
        } else {
          response.hint = "Check the schema and fix the field names/values. Max 2 retries allowed.";
          response.suggestion = suggestion;
          response.schema = { required_fields: requiredFields, optional_fields: optionalFields };
        }

        return jsonResult(response);
      }

      return jsonResult({
        success: true,
        connector,
        action,
        connector_id: connectorId,
        // Cap response size — some actions return very large payloads that
        // overwhelm the LLM context and cause the agent to stop without summary.
        data: truncateResponseData(result.data),
      });
    },
  };
}

/** Recursively truncate large string values and cap array lengths to keep
 *  tool output within a reasonable size for LLM consumption. */
function truncateResponseData(data: unknown, maxStringLen = 500, maxArrayLen = 20): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    return data.length > maxStringLen ? `${data.slice(0, maxStringLen)}… (truncated)` : data;
  }
  if (Array.isArray(data)) {
    const sliced = data.slice(0, maxArrayLen);
    const mapped = sliced.map((item) => truncateResponseData(item, maxStringLen, maxArrayLen));
    if (data.length > maxArrayLen) {
      return [...mapped, `… and ${data.length - maxArrayLen} more items`];
    }
    return mapped;
  }
  if (typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Skip heavyweight fields that aren't useful for the agent
      if (key === "readme_b64" || key === "tools" || key === "ui_form" || key === "server_params")
        continue;
      out[key] = truncateResponseData(value, maxStringLen, maxArrayLen);
    }
    return out;
  }
  return data;
}
