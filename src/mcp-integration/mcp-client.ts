/**
 * Multi-tenant MCP Client
 *
 * Connects to MCP servers (HubSpot, BigQuery, Qdrant) with
 * tenant-specific credentials and provides unified tool execution.
 */

import { spawn } from 'child_process';
import type {
  TenantContext,
  MCPTool,
  MCPCallResult,
  HubSpotCredentials,
  BigQueryCredentials,
  QdrantCredentials,
} from './types.js';
import { CredentialManager } from './credential-manager.js';

export interface MCPClientConfig {
  credentialManager: CredentialManager;
  bigqueryMcpUrl?: string;
  qdrantMcpUrl?: string;
  hubspotClientId?: string;
  hubspotClientSecret?: string;
}

export class MCPClient {
  private credentialManager: CredentialManager;
  private bigqueryUrl: string;
  private qdrantUrl: string;
  private hubspotConfig?: { clientId: string; clientSecret: string };

  constructor(config: MCPClientConfig) {
    this.credentialManager = config.credentialManager;
    this.bigqueryUrl = config.bigqueryMcpUrl || process.env.BIGQUERY_MCP_URL || '';
    this.qdrantUrl = config.qdrantMcpUrl || process.env.QDRANT_MCP_URL || '';

    if (config.hubspotClientId && config.hubspotClientSecret) {
      this.hubspotConfig = {
        clientId: config.hubspotClientId,
        clientSecret: config.hubspotClientSecret,
      };
    }
  }

  /**
   * List all available tools for a tenant across all MCP servers
   */
  async listAllTools(context: TenantContext): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];

    // Get credentials for this tenant
    const creds = await this.credentialManager.getCredentials(context);

    if (!creds) {
      return tools;
    }

    // List tools from each server the tenant has access to
    const promises: Promise<MCPTool[]>[] = [];

    if (creds.hubspot) {
      promises.push(this.listHubSpotTools(context));
    }

    if (creds.bigquery && this.bigqueryUrl) {
      promises.push(this.listBigQueryTools());
    }

    if (creds.qdrant && this.qdrantUrl) {
      promises.push(this.listQdrantTools());
    }

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        tools.push(...result.value);
      }
    }

    return tools;
  }

  /**
   * Call a tool on an MCP server with tenant credentials
   */
  async callTool(
    context: TenantContext,
    server: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    switch (server) {
      case 'hubspot':
        return this.callHubSpotTool(context, toolName, args);
      case 'bigquery':
        return this.callBigQueryTool(context, toolName, args);
      case 'qdrant':
        return this.callQdrantTool(context, toolName, args);
      default:
        return {
          success: false,
          error: `Unknown MCP server: ${server}`,
        };
    }
  }

  /**
   * List HubSpot tools using the official HubSpot MCP server
   */
  private async listHubSpotTools(context: TenantContext): Promise<MCPTool[]> {
    const creds = await this.credentialManager.getHubSpotCredentials(
      context,
      this.hubspotConfig
    );

    if (!creds) {
      return [];
    }

    try {
      const result = await this.callHubSpotMCPServer(creds.accessToken, 'tools/list', {});

      if ('error' in result) {
        return [];
      }

      const tools = (result as { result?: { tools?: unknown[] } }).result?.tools || [];

      return tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {},
        server: 'hubspot',
      }));
    } catch {
      return [];
    }
  }

  /**
   * List BigQuery tools
   */
  private async listBigQueryTools(): Promise<MCPTool[]> {
    try {
      const response = await fetch(`${this.bigqueryUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const tools = data.result?.tools || [];

      return tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {},
        server: 'bigquery',
      }));
    } catch {
      return [];
    }
  }

  /**
   * List Qdrant tools
   */
  private async listQdrantTools(): Promise<MCPTool[]> {
    try {
      // Use MCP SDK for SSE transport
      const { ClientSession, sse_client } = await import('mcp');

      const tools: MCPTool[] = [];

      await sse_client(this.qdrantUrl, async (read, write) => {
        const session = new ClientSession(read, write);
        await session.initialize();

        const result = await session.list_tools();

        if (result?.tools) {
          tools.push(
            ...result.tools.map((tool: any) => ({
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema || {},
              server: 'qdrant',
            }))
          );
        }
      });

      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Call HubSpot tool
   */
  private async callHubSpotTool(
    context: TenantContext,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    const creds = await this.credentialManager.getHubSpotCredentials(
      context,
      this.hubspotConfig
    );

    if (!creds) {
      return {
        success: false,
        error: 'No HubSpot credentials found for this tenant',
      };
    }

    try {
      const result = await this.callHubSpotMCPServer(creds.accessToken, 'tools/call', {
        name: toolName,
        arguments: args,
      });

      if ('error' in result) {
        return {
          success: false,
          error: JSON.stringify(result.error),
        };
      }

      return {
        success: true,
        data: (result as { result?: unknown }).result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Call BigQuery tool
   */
  private async callBigQueryTool(
    context: TenantContext,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    try {
      const response = await fetch(`${this.bigqueryUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();

      if ('error' in data) {
        return {
          success: false,
          error: JSON.stringify(data.error),
        };
      }

      return {
        success: true,
        data: data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Call Qdrant tool
   */
  private async callQdrantTool(
    context: TenantContext,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    try {
      const { ClientSession, sse_client } = await import('mcp');

      let result: MCPCallResult = { success: false, error: 'No result' };

      await sse_client(this.qdrantUrl, async (read, write) => {
        const session = new ClientSession(read, write);
        await session.initialize();

        const toolResult = await session.call_tool(toolName, args);

        if (toolResult.isError) {
          result = {
            success: false,
            isError: true,
            error: toolResult.content?.[0]?.text || 'Unknown error',
          };
        } else {
          result = {
            success: true,
            content: toolResult.content,
          };
        }
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Call HubSpot MCP server via stdio (spawns npx process)
   */
  private async callHubSpotMCPServer(
    accessToken: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['-y', '@hubspot/mcp-server'], {
        env: {
          ...process.env,
          HUBSPOT_ACCESS_TOKEN: accessToken,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`HubSpot MCP process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch {
          resolve({ result: stdout });
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Send JSON-RPC request
      child.stdin?.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        })
      );
      child.stdin?.end();
    });
  }
}
