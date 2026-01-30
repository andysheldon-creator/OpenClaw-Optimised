/**
 * Arcade.dev API Client
 *
 * Handles all communication with the Arcade.dev API for tool listing,
 * authorization, and execution.
 */

import type { ArcadeConfig } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export type ArcadeToolParameter = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  items?: ArcadeToolParameter;
  properties?: Record<string, ArcadeToolParameter>;
};

export type ArcadeToolkit = {
  name: string;
  description?: string;
  version?: string;
};

export type ArcadeToolDefinition = {
  name: string;
  fully_qualified_name?: string;
  qualified_name?: string;
  description: string;
  toolkit: ArcadeToolkit;
  input?: {
    parameters?: Array<{
      name: string;
      required?: boolean;
      description?: string;
      value_schema?: {
        val_type?: string;
        enum?: string[];
      };
      inferrable?: boolean;
    }>;
  };
  requires_auth?: boolean;
  auth_provider?: string;
  // Legacy format support
  parameters?: {
    type: "object";
    properties?: Record<string, ArcadeToolParameter>;
    required?: string[];
  };
};

export type ArcadeAuthStatus = "completed" | "pending" | "failed";

export type ArcadeAuthResponse = {
  status: ArcadeAuthStatus;
  authorization_id?: string;
  authorization_url?: string;
  scopes?: string[];
  context?: Record<string, unknown>;
};

export type ArcadeExecuteResult = {
  success: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  authorization_required?: boolean;
  authorization_url?: string;
};

export type ArcadeToolsListResponse = {
  items: ArcadeToolDefinition[];
  total_count: number;
  page_count: number;
  limit: number;
  offset: number;
};

// ============================================================================
// Client Implementation
// ============================================================================

export type ArcadeClientOptions = {
  /** Maximum retries on transient errors */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  retryDelayMs?: number;
  /** Request timeout (ms) */
  timeoutMs?: number;
};

export class ArcadeClient {
  private baseUrl: string;
  private apiKey: string;
  private userId: string;
  private toolsCache: Map<string, { tools: ArcadeToolDefinition[]; timestamp: number }> = new Map();
  private cacheTtlMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private rateLimitResetTime: number = 0;

  constructor(config: ArcadeConfig, options?: ArcadeClientOptions) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey ?? "";
    this.userId = config.userId ?? "";
    this.cacheTtlMs = config.cacheToolsTtlMs;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 1000;
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update client configuration
   */
  configure(config: Partial<{ apiKey: string; userId: string; baseUrl: string }>) {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.userId !== undefined) this.userId = config.userId;
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  // ==========================================================================
  // HTTP Helpers
  // ==========================================================================

  /**
   * Check if we're currently rate limited
   */
  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitResetTime;
  }

  /**
   * Wait for rate limit to reset
   */
  private async waitForRateLimit(): Promise<void> {
    const waitTime = this.rateLimitResetTime - Date.now();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Make HTTP request with retry logic, timeout, and rate limit handling
   */
  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    // Wait if rate limited
    if (this.isRateLimited()) {
      await this.waitForRateLimit();
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(url, {
            method,
            headers,
            ...(method !== "GET" && body ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Handle rate limiting (429)
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.retryDelayMs * Math.pow(2, attempt);
            this.rateLimitResetTime = Date.now() + waitMs;

            if (attempt < this.maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, waitMs));
              continue;
            }

            throw new ArcadeRateLimitError(
              "Rate limit exceeded",
              waitMs,
              response.headers.get("X-RateLimit-Limit") ?? undefined,
            );
          }

          // Handle server errors with retry
          if (response.status >= 500 && attempt < this.maxRetries) {
            const delay = this.retryDelayMs * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            let errorJson: unknown;
            try {
              errorJson = JSON.parse(errorText);
            } catch {
              // Not JSON
            }

            const errorMessage =
              errorJson && typeof errorJson === "object" && "message" in errorJson
                ? String((errorJson as { message: string }).message)
                : errorText;

            throw new ArcadeApiError(
              response.status,
              errorMessage,
              errorJson as Record<string, unknown> | undefined,
            );
          }

          // Handle empty responses
          const text = await response.text();
          if (!text) return {} as T;

          return JSON.parse(text) as T;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on abort (timeout) or non-retriable errors
        if (err instanceof Error && err.name === "AbortError") {
          throw new ArcadeTimeoutError(`Request timed out after ${this.timeoutMs}ms`, path);
        }

        // Don't retry on client errors (4xx except 429)
        if (err instanceof ArcadeApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }

        // Retry on other errors
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  // ==========================================================================
  // Health & Config
  // ==========================================================================

  /**
   * Check API health
   */
  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/v1/health");
  }

  /**
   * Get engine configuration
   */
  async getConfig(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/config");
  }

  // ==========================================================================
  // Tools
  // ==========================================================================

  /**
   * List available tools, optionally filtered by toolkit
   */
  async listTools(opts?: {
    toolkit?: string;
    limit?: number;
    offset?: number;
    forceRefresh?: boolean;
  }): Promise<ArcadeToolDefinition[]> {
    const cacheKey = opts?.toolkit ?? "__all__";
    const cached = this.toolsCache.get(cacheKey);

    // Return cached if valid and not forcing refresh
    if (cached && !opts?.forceRefresh && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.tools;
    }

    const params = new URLSearchParams();
    if (opts?.toolkit) params.set("toolkit", opts.toolkit);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));

    const query = params.toString();
    const path = `/v1/tools${query ? `?${query}` : ""}`;

    const response = await this.request<ArcadeToolsListResponse>("GET", path);

    // Cache the result
    this.toolsCache.set(cacheKey, {
      tools: response.items,
      timestamp: Date.now(),
    });

    return response.items;
  }

  /**
   * Fetch all available tools with pagination
   * @param opts.batchSize - Number of tools to fetch per request (default: 250)
   * @param opts.onProgress - Callback for progress updates
   */
  async listAllTools(opts?: {
    batchSize?: number;
    onProgress?: (fetched: number, total: number | null) => void;
  }): Promise<ArcadeToolDefinition[]> {
    const batchSize = opts?.batchSize ?? 250;
    const allTools: ArcadeToolDefinition[] = [];
    let offset = 0;
    let totalCount: number | null = null;

    while (true) {
      const params = new URLSearchParams();
      params.set("limit", String(batchSize));
      params.set("offset", String(offset));

      const response = await this.request<ArcadeToolsListResponse>(
        "GET",
        `/v1/tools?${params.toString()}`,
      );

      if (totalCount === null) {
        totalCount = response.total_count;
      }

      allTools.push(...response.items);
      opts?.onProgress?.(allTools.length, totalCount);

      // Check if we've fetched all tools
      if (response.items.length === 0 || allTools.length >= totalCount) {
        break;
      }

      offset += batchSize;
    }

    // Update in-memory cache with all tools
    this.toolsCache.set("__all__", {
      tools: allTools,
      timestamp: Date.now(),
    });

    return allTools;
  }

  /**
   * Get a specific tool definition
   */
  async getTool(toolName: string): Promise<ArcadeToolDefinition> {
    return this.request<ArcadeToolDefinition>("GET", `/v1/tools/${encodeURIComponent(toolName)}`);
  }

  /**
   * Get tools formatted for a specific LLM provider (OpenAI, Anthropic)
   */
  async getFormattedTools(
    provider: "openai" | "anthropic",
    toolkit?: string,
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("format", provider);
    if (toolkit) params.set("toolkit", toolkit);

    return this.request<unknown[]>("GET", `/v1/formatted_tools?${params.toString()}`);
  }

  // ==========================================================================
  // Authorization
  // ==========================================================================

  /**
   * Initiate authorization for a tool
   */
  async authorize(toolName: string, userId?: string): Promise<ArcadeAuthResponse> {
    const response = await this.request<ArcadeAuthResponse>("POST", "/v1/tools/authorize", {
      tool_name: toolName,
      user_id: userId ?? this.userId,
    });
    return response;
  }

  /**
   * Check authorization status
   */
  async checkAuthStatus(authorizationId: string): Promise<ArcadeAuthResponse> {
    return this.request<ArcadeAuthResponse>(
      "GET",
      `/v1/auth/status?authorization_id=${encodeURIComponent(authorizationId)}`,
    );
  }

  /**
   * Wait for authorization to complete (polls status)
   */
  async waitForAuthorization(
    authorizationId: string,
    opts?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      onPoll?: (status: ArcadeAuthStatus) => void;
    },
  ): Promise<ArcadeAuthResponse> {
    const timeout = opts?.timeoutMs ?? 120000; // 2 minutes default
    const interval = opts?.pollIntervalMs ?? 2000; // 2 seconds default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.checkAuthStatus(authorizationId);
      opts?.onPoll?.(status.status);

      if (status.status === "completed") {
        return status;
      }

      if (status.status === "failed") {
        throw new ArcadeAuthError("Authorization failed", status);
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new ArcadeAuthError("Authorization timed out", {
      status: "pending",
      authorization_id: authorizationId,
    });
  }

  // ==========================================================================
  // Tool Execution
  // ==========================================================================

  /**
   * Execute a tool
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    userId?: string,
  ): Promise<ArcadeExecuteResult> {
    try {
      const response = await this.request<ArcadeExecuteResult>("POST", "/v1/tools/execute", {
        tool_name: toolName,
        input,
        user_id: userId ?? this.userId,
      });
      return response;
    } catch (err) {
      if (err instanceof ArcadeApiError) {
        // Check if this is an authorization error
        if (err.status === 401 || err.status === 403) {
          return {
            success: false,
            authorization_required: true,
            error: {
              code: "AUTH_REQUIRED",
              message: "Authorization required for this tool",
              details: err.details,
            },
          };
        }
      }
      throw err;
    }
  }

  /**
   * Execute a tool with automatic authorization handling
   */
  async executeWithAuth(
    toolName: string,
    input: Record<string, unknown>,
    opts?: {
      userId?: string;
      onAuthRequired?: (authUrl: string) => Promise<boolean>;
    },
  ): Promise<ArcadeExecuteResult> {
    const userId = opts?.userId ?? this.userId;

    // First, try to authorize the tool
    const authResponse = await this.authorize(toolName, userId);

    // If authorization required, handle it
    if (authResponse.status !== "completed" && authResponse.authorization_url) {
      if (opts?.onAuthRequired) {
        const shouldProceed = await opts.onAuthRequired(authResponse.authorization_url);
        if (!shouldProceed) {
          return {
            success: false,
            authorization_required: true,
            authorization_url: authResponse.authorization_url,
            error: {
              code: "AUTH_REQUIRED",
              message: "User did not complete authorization",
            },
          };
        }
      }

      // Wait for authorization to complete
      if (authResponse.authorization_id) {
        await this.waitForAuthorization(authResponse.authorization_id);
      }
    }

    // Execute the tool
    return this.execute(toolName, input, userId);
  }

  // ==========================================================================
  // User Connections
  // ==========================================================================

  /**
   * List user's auth connections
   */
  async listUserConnections(userId?: string): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (userId ?? this.userId) {
      params.set("user_id", userId ?? this.userId);
    }
    return this.request<unknown[]>("GET", `/v1/admin/user_connections?${params.toString()}`);
  }

  /**
   * Delete a user connection
   */
  async deleteUserConnection(connectionId: string): Promise<void> {
    await this.request<void>("DELETE", `/v1/admin/user_connections/${connectionId}`);
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Clear the tools cache
   */
  clearCache(): void {
    this.toolsCache.clear();
  }
}

// ============================================================================
// Error Classes
// ============================================================================

export class ArcadeApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ArcadeApiError";
  }

  /** Check if this is a retriable error */
  isRetriable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

export class ArcadeAuthError extends Error {
  constructor(
    message: string,
    public readonly authResponse: ArcadeAuthResponse,
  ) {
    super(message);
    this.name = "ArcadeAuthError";
  }
}

export class ArcadeRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly limit?: string,
  ) {
    super(message);
    this.name = "ArcadeRateLimitError";
  }
}

export class ArcadeTimeoutError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = "ArcadeTimeoutError";
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new Arcade client instance
 */
export function createArcadeClient(config: ArcadeConfig): ArcadeClient {
  return new ArcadeClient(config);
}
