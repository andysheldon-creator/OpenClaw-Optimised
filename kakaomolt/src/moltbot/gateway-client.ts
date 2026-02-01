/**
 * Moltbot Gateway Client
 *
 * Connects to a running Moltbot Gateway instance for AI processing.
 * This allows KakaoMolt to leverage the full Moltbot agent capabilities:
 * - Memory search and storage
 * - Conversation context management
 * - Tool execution
 * - Multi-model support
 */

export interface GatewayConfig {
  /** Gateway URL (default: http://localhost:18789) */
  url: string;
  /** Agent ID to use */
  agentId: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 120000) */
  timeoutMs?: number;
}

export interface SendMessageOptions {
  /** User identifier for session management */
  userId: string;
  /** Message text */
  text: string;
  /** Optional session key for conversation continuity */
  sessionKey?: string;
  /** Optional media URLs to include */
  mediaUrls?: string[];
  /** Model override (e.g., "claude-3-haiku-20240307") */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Whether to use memory search */
  useMemory?: boolean;
  /** Maximum tokens in response */
  maxTokens?: number;
}

export interface GatewayResponse {
  success: boolean;
  text?: string;
  sessionId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  error?: string;
  toolResults?: unknown[];
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory" | "sessions";
}

export interface GatewayStatus {
  online: boolean;
  version?: string;
  agentId?: string;
  memoryStatus?: {
    files: number;
    chunks: number;
    dirty: boolean;
  };
  error?: string;
}

/**
 * Moltbot Gateway Client
 *
 * Provides interface to communicate with Moltbot Gateway for AI processing.
 */
export class MoltbotGatewayClient {
  private config: GatewayConfig;

  constructor(config: Partial<GatewayConfig> & { agentId: string }) {
    this.config = {
      url: config.url ?? "http://localhost:18789",
      agentId: config.agentId,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs ?? 120000,
    };
  }

  /**
   * Check if gateway is online and accessible
   */
  async checkStatus(): Promise<GatewayStatus> {
    try {
      const response = await this.fetch("/health", { method: "GET" });

      if (!response.ok) {
        return { online: false, error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as {
        version?: string;
        agentId?: string;
        memory?: { files: number; chunks: number; dirty: boolean };
      };

      return {
        online: true,
        version: data.version,
        agentId: data.agentId,
        memoryStatus: data.memory,
      };
    } catch (err) {
      return {
        online: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send a message to the agent and get a response
   */
  async sendMessage(options: SendMessageOptions): Promise<GatewayResponse> {
    try {
      const response = await this.fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          agentId: this.config.agentId,
          userId: options.userId,
          message: options.text,
          sessionKey: options.sessionKey,
          mediaUrls: options.mediaUrls,
          model: options.model,
          systemPrompt: options.systemPrompt,
          useMemory: options.useMemory ?? true,
          maxTokens: options.maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Gateway error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        text?: string;
        sessionId?: string;
        usage?: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
        };
        toolResults?: unknown[];
      };

      return {
        success: true,
        text: data.text,
        sessionId: data.sessionId,
        usage: data.usage,
        toolResults: data.toolResults,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Search memory for relevant context
   */
  async searchMemory(query: string, options?: { maxResults?: number; minScore?: number }): Promise<{
    success: boolean;
    results?: MemorySearchResult[];
    error?: string;
  }> {
    try {
      const response = await this.fetch("/api/memory/search", {
        method: "POST",
        body: JSON.stringify({
          agentId: this.config.agentId,
          query,
          maxResults: options?.maxResults ?? 10,
          minScore: options?.minScore ?? 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Memory search error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as { results: MemorySearchResult[] };

      return {
        success: true,
        results: data.results,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Sync memory index
   */
  async syncMemory(options?: { force?: boolean }): Promise<{
    success: boolean;
    stats?: { files: number; chunks: number };
    error?: string;
  }> {
    try {
      const response = await this.fetch("/api/memory/sync", {
        method: "POST",
        body: JSON.stringify({
          agentId: this.config.agentId,
          force: options?.force ?? false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Memory sync error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as { files: number; chunks: number };

      return {
        success: true,
        stats: data,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(sessionKey: string): Promise<{
    success: boolean;
    messages?: Array<{
      role: "user" | "assistant" | "system";
      content: string;
      timestamp?: number;
    }>;
    error?: string;
  }> {
    try {
      const response = await this.fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/history`, {
        method: "GET",
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { success: true, messages: [] };
        }
        const errorText = await response.text();
        return {
          success: false,
          error: `Session history error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as {
        messages: Array<{
          role: "user" | "assistant" | "system";
          content: string;
          timestamp?: number;
        }>;
      };

      return {
        success: true,
        messages: data.messages,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Export all data from gateway (for sync)
   */
  async exportData(): Promise<{
    success: boolean;
    data?: {
      memory: unknown;
      sessions: unknown;
    };
    error?: string;
  }> {
    try {
      const response = await this.fetch("/api/export", {
        method: "POST",
        body: JSON.stringify({
          agentId: this.config.agentId,
          includeMemory: true,
          includeSessions: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Export error: ${response.status} - ${errorText}`,
        };
      }

      const data = (await response.json()) as { memory: unknown; sessions: unknown };

      return {
        success: true,
        data,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Import data to gateway (from sync)
   */
  async importData(data: { memory?: unknown; sessions?: unknown }): Promise<{
    success: boolean;
    stats?: { files: number; chunks: number; sessions: number };
    error?: string;
  }> {
    try {
      const response = await this.fetch("/api/import", {
        method: "POST",
        body: JSON.stringify({
          agentId: this.config.agentId,
          memory: data.memory,
          sessions: data.sessions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Import error: ${response.status} - ${errorText}`,
        };
      }

      const result = (await response.json()) as { files: number; chunks: number; sessions: number };

      return {
        success: true,
        stats: result,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Internal fetch wrapper with auth and timeout
   */
  private async fetch(
    path: string,
    options: { method: string; body?: string },
  ): Promise<Response> {
    const url = `${this.config.url}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a gateway client with default configuration
 */
export function createGatewayClient(options: {
  agentId: string;
  url?: string;
  apiKey?: string;
}): MoltbotGatewayClient {
  return new MoltbotGatewayClient(options);
}

/**
 * Discover local gateway instances
 */
export async function discoverLocalGateway(): Promise<{
  found: boolean;
  url?: string;
  error?: string;
}> {
  const defaultPorts = [18789, 8789, 3000];

  for (const port of defaultPorts) {
    const url = `http://localhost:${port}`;
    try {
      const response = await fetch(`${url}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        return { found: true, url };
      }
    } catch {
      // Try next port
    }
  }

  return { found: false, error: "No local gateway found" };
}
