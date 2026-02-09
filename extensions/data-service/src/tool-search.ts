/**
 * connector_search tool -- STEP 1 of the workflow.
 *
 * Searches for a connector, checks user configuration, and returns the action schema.
 *
 * For Wexa Coworker Web integration:
 * - User context (orgId/userId) MUST be set via data-service.setContext
 */

import { jsonResult, readStringParam } from "openclaw/plugin-sdk";
import type { DataServiceConfig } from "./config.js";
import { hasUserContext, MISSING_CONTEXT_ERROR } from "./config.js";
import { lookupUserConnector, makeDataServiceRequest } from "./http.js";
import { ConnectorSearchSchema } from "./schemas.js";

export function createConnectorSearchTool(dsConfig: DataServiceConfig) {
  return {
    label: "Connector Search",
    name: "connector_search",
    description: `**STEP 1: Get connector schema** — ALWAYS call this before connector_execute.

This tool:
1. Finds the connector in the system
2. Checks if the user has it configured
3. Returns the action schema with exact field names and types

**CRITICAL:** Always specify the action parameter to get the exact field names.
If you don't know the action name, call this WITHOUT the action first to see available_actions, then call again WITH the correct action.

**NEVER hallucinate values.** Every value used in a later connector_execute must come from:
- The user's message
- A tool response (this tool, user_connectors, or another connector)
- If a value cannot be found, ASK the user — do NOT invent it.

**Chain connectors:** If the schema requires an email, ID, or other data you don't have, use the user's OTHER configured connectors to look it up first.

**URL handling:** If you have a URL and need an identifier/slug, extract it yourself (e.g., from "linkedin.com/in/john-doe-123" the identifier is "john-doe-123").

**IF the action is not found:**
- Check the available_actions list in the response — it shows EXACT action names.
- Retry once with the correct action name from that list.

**Usage:**
- query: The connector category (e.g., "email", "linkedin", "jira")
- action: The specific action to get schema for

**Workflow:**
1. Call connector_search with query and action → get schema
2. Check: do I have ALL required field values from real sources?
3. If missing values → chain other connectors or ask the user
4. For pull actions → execute autonomously
5. For push actions → show draft, confirm, then execute`,
    parameters: ConnectorSearchSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      // Check if user context is set
      if (!hasUserContext()) {
        return jsonResult({ success: false, error: MISSING_CONTEXT_ERROR });
      }

      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const action = readStringParam(params, "action", { required: false });

      // STEP 1: Search for connector in the system
      const searchEndpoint = `/retrieve/all/connectors?search_key=${encodeURIComponent(query)}&limit=10`;
      const searchResult = await makeDataServiceRequest(searchEndpoint, {
        method: "GET",
        config: dsConfig,
      });

      if (!searchResult.success) {
        return jsonResult({ success: false, error: searchResult.error });
      }

      const responseData = searchResult.data as {
        data?: Array<{
          category?: string;
          name?: string;
          description?: string;
          actions?: Array<{ name?: string; sort?: string; description?: string }>;
        }>;
      };
      const connectors = responseData?.data ?? [];

      if (connectors.length === 0) {
        return jsonResult({
          success: false,
          error: `No connector found matching "${query}".`,
          suggestion:
            "Try a different search term or use connector_list to see all available connectors.",
        });
      }

      const matchingConnector =
        connectors.find((c) => c.category?.toLowerCase() === query.toLowerCase()) ?? connectors[0];
      const connectorCategory = matchingConnector.category ?? query;
      const availableActions = (matchingConnector.actions ?? []).map((a) => ({
        action: a.sort ?? a.name,
        display_name: a.name,
        description: a.description,
      }));

      // STEP 2: Check if user has this connector configured
      let userConfigured = false;
      let connectorId: string | null = null;

      const lookup = await lookupUserConnector(connectorCategory, dsConfig);
      if (lookup.connectorId) {
        userConfigured = true;
        connectorId = lookup.connectorId;
      }

      // STEP 3: If action specified, fetch the schema
      let actionSchema: {
        required_fields: Array<{ field_id?: string; type?: string; description?: string }>;
        optional_fields: Array<{ field_id?: string; type?: string; description?: string }>;
        description?: string;
      } | null = null;

      if (action) {
        const schemaEndpoint = `/actions/${connectorCategory}/${action}`;
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
                type?: string;
                description?: string;
              }>;
            };
            description?: string;
          };
          const fields = schemaData.input?.fields ?? [];
          actionSchema = {
            required_fields: fields
              .filter((f) => f.required)
              .map((f) => ({ field_id: f.field_id, type: f.type, description: f.description })),
            optional_fields: fields
              .filter((f) => !f.required)
              .map((f) => ({ field_id: f.field_id, type: f.type, description: f.description })),
            description: schemaData.description,
          };
        }
      }

      // Build response
      const response: Record<string, unknown> = {
        success: true,
        connector: connectorCategory,
        connector_name: matchingConnector.name,
        connector_description: matchingConnector.description,
        user_configured: userConfigured,
        available_actions: availableActions,
      };

      if (userConfigured && connectorId) {
        response.connector_id = connectorId;
        response.ready_to_execute = true;
      } else {
        response.ready_to_execute = false;
        response.message = `The "${connectorCategory}" connector is available but you haven't connected it yet.`;
        response.action_required = "connect_service";
        response.help = `To use ${connectorCategory}, please connect it through the Data-Service dashboard first.`;
      }

      if (action) {
        response.requested_action = action;
        if (actionSchema) {
          response.schema = actionSchema;
          response.usage_hint = `Use connector_execute with: connector="${connectorCategory}", action="${action}", input='{...}' where input contains the required fields.`;
        } else {
          response.schema_error = `Could not fetch schema for action "${action}". Check if the action name is correct.`;
          response.available_actions_hint = `Available actions (use the 'action' field): ${availableActions.map((a) => a.action).join(", ")}`;
        }
      }

      if (!action && availableActions.length > 0) {
        response.suggestion = `Specify an action to get its schema. Use the 'action' field value: ${availableActions.map((a) => a.action).join(", ")}`;
      }

      return jsonResult(response);
    },
  };
}
