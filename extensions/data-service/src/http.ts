/**
 * Shared HTTP helpers for Data-Service API calls.
 *
 * For Wexa Coworker Web integration:
 * - User context (orgId/userId) MUST be set via data-service.setContext
 * - All API calls require valid user context
 */

import type { DataServiceConfig } from "./config.js";
import { getEffectiveUserContext, hasUserContext, MISSING_CONTEXT_ERROR } from "./config.js";

/** Standard API response wrapper */
export type ApiResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
};

/** Make an authenticated request to the Data-Service API. */
export async function makeDataServiceRequest(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    config: DataServiceConfig;
  },
): Promise<ApiResult> {
  const { method = "GET", body, config } = options;

  // Get user context from request context (set via data-service.setContext)
  const userCtx = getEffectiveUserContext();

  const url = `${config.url}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.serverKey) {
    headers["x-server-key"] = config.serverKey;
  }
  if (userCtx.apiKey) {
    headers["Authorization"] = `Bearer ${userCtx.apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      return {
        success: false,
        error:
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : `HTTP ${response.status}: ${responseText.slice(0, 200)}`,
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message.includes("abort") ? "Request timed out" : message,
    };
  }
}

/** Make an authenticated request to the Identity-Service API. */
export async function makeIdentityServiceRequest(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    config: DataServiceConfig;
  },
): Promise<ApiResult> {
  const { method = "GET", body, config } = options;

  const url = `${config.identityServiceUrl}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.identityServiceServerKey) {
    headers["x-server-key"] = config.identityServiceServerKey;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? 30000);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      return {
        success: false,
        error:
          typeof data === "object" && data && "error" in data
            ? String((data as { error: unknown }).error)
            : `HTTP ${response.status}: ${responseText.slice(0, 200)}`,
        status: response.status,
      };
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message.includes("abort") ? "Request timed out" : message,
    };
  }
}

/**
 * Look up a user's connector_id from Data-Service.
 * Returns the connector_id if found, or null if not configured.
 *
 * Requires user context to be set via data-service.setContext.
 */
export async function lookupUserConnector(
  connector: string,
  config: DataServiceConfig,
): Promise<{ connectorId: string | null; error?: string; notConfigured?: boolean }> {
  // Check if user context is set
  if (!hasUserContext()) {
    return {
      connectorId: null,
      error: MISSING_CONTEXT_ERROR,
    };
  }

  const userCtx = getEffectiveUserContext();
  const { orgId, userId, projectId } = userCtx;

  // Build query with user_id, category, and optionally projectID
  const query: Record<string, string> = { user_id: userId, category: connector };
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
    config,
  });

  if (!result.success) {
    if (result.status === 404 || result.error?.toLowerCase().includes("not found")) {
      return { connectorId: null, notConfigured: true };
    }
    return { connectorId: null, error: result.error };
  }

  // The /on/query endpoint returns an array
  const dataArray = result.data as Array<{ _id?: string; connectorID?: string }> | null;
  if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
    return { connectorId: null, notConfigured: true };
  }

  const data = dataArray[0];
  const connectorId = data._id ?? data.connectorID;
  if (!connectorId) {
    return { connectorId: null, notConfigured: true };
  }

  return { connectorId };
}
