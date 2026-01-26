/**
 * Whoop Tool for Clawdbot
 * Provides agent access to Whoop fitness data
 */

import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages.mjs";
import { WhoopApiClient } from "./whoop-api.js";
import { refreshAccessToken } from "./oauth.js";

interface WhoopPluginConfig {
  clientId: string;
  clientSecret: string;
}

interface WhoopCredential {
  type: "oauth";
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  userId?: string;
}

async function getAccessToken(api: ClawdbotPluginApi, config: WhoopPluginConfig): Promise<string> {
  const credentials = api.runtime?.credentials;
  if (!credentials) {
    throw new Error("Credentials runtime not available");
  }

  // Find Whoop credential
  const creds = await credentials.list();
  const whoopCred = creds.find((c) => c.provider === "whoop" && c.type === "oauth") as
    | WhoopCredential
    | undefined;

  if (!whoopCred) {
    throw new Error(
      "No Whoop credentials found. Please run: clawdbot login whoop (or authenticate via the UI)",
    );
  }

  // Check if token needs refresh
  if (Date.now() >= whoopCred.expires) {
    api.logger.info("Refreshing Whoop access token");
    const refreshed = await refreshAccessToken(whoopCred.refresh, config.clientId, config.clientSecret);

    // Update stored credentials
    await credentials.update(whoopCred.profileId || "whoop:default", {
      type: "oauth",
      provider: "whoop",
      access: refreshed.access,
      refresh: refreshed.refresh,
      expires: refreshed.expires,
      userId: refreshed.userId,
    });

    return refreshed.access;
  }

  return whoopCred.access;
}

export function createWhoopTool(api: ClawdbotPluginApi): Tool {
  return {
    name: "get_whoop_data",
    description: `Query Whoop fitness data including:
- Recovery scores (HRV, RHR, SpO2, skin temp)
- Sleep analysis (stages, quality, sleep debt)
- Cycle/strain data (daily strain, heart rate)
- Workout tracking (activities, heart rate zones, calories)

Use this tool to answer questions about fitness metrics, sleep quality, recovery readiness, and workout performance.`,
    input_schema: {
      type: "object",
      properties: {
        data_type: {
          type: "string",
          enum: ["recovery", "sleep", "cycle", "workout"],
          description: "The type of Whoop data to retrieve",
        },
        query: {
          type: "string",
          enum: ["latest", "recent", "by_id"],
          description: "How to query the data: 'latest' for most recent single record, 'recent' for last 7 days, 'by_id' for specific record",
        },
        id: {
          type: "number",
          description: "The ID of the specific record (required when query is 'by_id')",
        },
        limit: {
          type: "number",
          description: "Number of records to return for 'recent' query (default: 7, max: 25)",
        },
      },
      required: ["data_type", "query"],
    },
    async handler(input: unknown) {
      const params = input as {
        data_type: "recovery" | "sleep" | "cycle" | "workout";
        query: "latest" | "recent" | "by_id";
        id?: number;
        limit?: number;
      };

      // Get config
      const config = api.config?.plugins?.entries?.whoop?.config as WhoopPluginConfig | undefined;

      if (!config?.clientId || !config?.clientSecret) {
        return {
          error:
            "Whoop plugin not configured. Please add your Client ID and Client Secret to the configuration.",
        };
      }

      let accessToken: string;
      try {
        accessToken = await getAccessToken(api, config);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { error: errorMessage };
      }

      const client = new WhoopApiClient({ accessToken });

      try {
        // Handle query by ID
        if (params.query === "by_id") {
          if (!params.id) {
            return { error: "ID is required when query is 'by_id'" };
          }

          let result;
          switch (params.data_type) {
            case "recovery":
              result = await client.getRecoveryById(params.id);
              break;
            case "sleep":
              result = await client.getSleepById(params.id);
              break;
            case "cycle":
              result = await client.getCycleById(params.id);
              break;
            case "workout":
              result = await client.getWorkoutById(params.id);
              break;
          }

          return { data: result };
        }

        // Handle latest query
        if (params.query === "latest") {
          let result;
          switch (params.data_type) {
            case "recovery":
              result = await client.getCurrentRecovery();
              break;
            case "sleep":
              result = await client.getLatestSleep();
              break;
            case "cycle":
              result = await client.getLatestCycle();
              break;
            case "workout":
              result = await client.getLatestWorkout();
              break;
          }

          if (!result) {
            return { message: `No ${params.data_type} data found` };
          }

          return { data: result };
        }

        // Handle recent query
        if (params.query === "recent") {
          const limit = Math.min(params.limit || 7, 25);
          let result;

          switch (params.data_type) {
            case "recovery":
              result = await client.getRecovery(limit);
              break;
            case "sleep":
              result = await client.getSleep(limit);
              break;
            case "cycle":
              result = await client.getCycles(limit);
              break;
            case "workout":
              result = await client.getWorkouts(limit);
              break;
          }

          return {
            data: result.records,
            count: result.records.length,
            next_token: result.next_token,
          };
        }

        return { error: "Invalid query type" };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        api.logger.error("Whoop API error:", { error: errorMessage });

        return {
          error: `Failed to fetch Whoop data: ${errorMessage}`,
        };
      }
    },
  };
}
