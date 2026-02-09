/**
 * Coworker list tool: lists all projects/coworkers the user has access to.
 *
 * This tool calls the Identity-Service API to retrieve the user's projects
 * with details like name, role, description, and projectId.
 */

import { jsonResult } from "openclaw/plugin-sdk";
import type { DataServiceConfig } from "./config.js";
import { getEffectiveUserContext, hasUserContext, MISSING_CONTEXT_ERROR } from "./config.js";
import { makeIdentityServiceRequest } from "./http.js";
import { CoworkerListSchema } from "./schemas.js";

export function createCoworkerListTool(dsConfig: DataServiceConfig) {
  return {
    label: "Coworker List",
    name: "coworker_list",
    description: `List all projects/coworkers the user has access to. Returns project details including name, role, description, and projectId.

**Use this when:**
- User asks about their projects or coworkers
- You need to know what projects/coworkers are available
- User wants to see their workspace structure
- You need projectId for other operations

This is a read-only/pull action — execute autonomously without asking permission.`,
    parameters: CoworkerListSchema,
    execute: async (_toolCallId: string, _args: unknown) => {
      // Check if user context is set
      if (!hasUserContext()) {
        return jsonResult({ success: false, error: MISSING_CONTEXT_ERROR });
      }

      const userCtx = getEffectiveUserContext();
      const { userId } = userCtx;

      // Debug logging to verify context is being received
      console.log("[data-service] coworker_list called with context:", {
        userId,
        hasContext: !!userId,
      });

      const endpoint = `/system/user-projects?userId=${encodeURIComponent(userId || "")}`;
      const result = await makeIdentityServiceRequest(endpoint, {
        method: "GET",
        config: dsConfig,
      });

      // Debug logging to see API response
      console.log("[data-service] coworker_list API response:", {
        success: result.success,
        error: result.error,
      });

      if (!result.success) {
        return jsonResult({ success: false, error: result.error });
      }

      const responseData = result.data as {
        projects?: Array<{
          agentKey: string;
          projectId: string;
          projectName: string;
          description: string;
          coworkerRole: string;
          orgId: string;
          onboardingStep: number;
        }>;
        products?: Record<string, unknown>;
        total?: number;
      };

      return jsonResult({
        success: true,
        description: "Projects/coworkers accessible to the user",
        projects: responseData.projects || [],
        products: responseData.products || {},
        total: responseData.total || 0,
      });
    },
  };
}
