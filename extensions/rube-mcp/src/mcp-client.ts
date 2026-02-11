import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { RubeOAuthCredentials } from "./auth.js";
import { isRubeTokenExpired, refreshTokens } from "./auth.js";

export const RUBE_MCP_ENDPOINT = "https://rube.app/mcp";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type McpToolCallResponse = {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
};

/**
 * MCP client for Rube using the official MCP SDK
 */
export class RubeMcpClient {
  private credentials: RubeOAuthCredentials;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private fetchFn: typeof fetch;
  private onCredentialsRefreshed?: (creds: RubeOAuthCredentials) => Promise<void>;

  constructor(params: {
    credentials: RubeOAuthCredentials;
    fetchFn?: typeof fetch;
    onCredentialsRefreshed?: (creds: RubeOAuthCredentials) => Promise<void>;
  }) {
    this.credentials = params.credentials;
    this.fetchFn = params.fetchFn ?? fetch;
    this.onCredentialsRefreshed = params.onCredentialsRefreshed;
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   */
  private async ensureValidToken(): Promise<string> {
    if (isRubeTokenExpired(this.credentials)) {
      this.credentials = await refreshTokens({
        credentials: this.credentials,
        fetchFn: this.fetchFn,
      });
      await this.onCredentialsRefreshed?.(this.credentials);
      // Reconnect with new token
      this.client = null;
      this.transport = null;
    }
    return this.credentials.accessToken;
  }

  /**
   * Get or create the MCP client connection
   */
  private async getClient(): Promise<Client> {
    // Always check token expiry before reusing client (may invalidate existing client)
    const token = await this.ensureValidToken();

    if (this.client) {
      return this.client;
    }

    this.client = new Client(
      {
        name: "clawdbot-rube",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    // Create HTTP transport with auth headers
    this.transport = new StreamableHTTPClientTransport(new URL(RUBE_MCP_ENDPOINT), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    await this.client.connect(this.transport);

    return this.client;
  }

  /**
   * List available tools from Rube MCP
   */
  async listTools(): Promise<McpTool[]> {
    const client = await this.getClient();

    const result = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );

    return (result.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as McpTool["inputSchema"],
    }));
  }

  /**
   * Call a tool on Rube MCP
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResponse> {
    const client = await this.getClient();

    const result = await client.request(
      {
        method: "tools/call",
        params: { name, arguments: args },
      },
      CallToolResultSchema,
    );

    return {
      content: result.content.map((c) => ({
        type: c.type,
        text: "text" in c ? c.text : undefined,
        ...c,
      })),
      isError: result.isError,
    };
  }

  /**
   * Close the MCP connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
    }
  }

  /**
   * Get current credentials (may have been refreshed)
   */
  getCredentials(): RubeOAuthCredentials {
    return this.credentials;
  }
}
