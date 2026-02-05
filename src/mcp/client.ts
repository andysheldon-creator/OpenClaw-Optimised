import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AnyAgentTool } from "../agents/tools/common.js";

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export class McpClientManager {
  private client: Client;
  private transport: StdioClientTransport;

  constructor(config: McpServerConfig) {
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    this.client = new Client(
      {
        name: "openclaw-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );
  }

  async connect() {
    await this.client.connect(this.transport);
  }

  async close() {
    await this.client.close();
  }

  async listTools(): Promise<AnyAgentTool[]> {
    const result = await this.client.listTools();

    return result.tools.map((tool) => ({
      name: tool.name,
      label: tool.name,
      description: tool.description ?? "MCP Tool",
      parameters: tool.inputSchema as Record<string, unknown>,
      execute: async (_id, args) => {
        const executeResult = (await this.client.callTool({
          name: tool.name,
          arguments: args as Record<string, unknown>,
        })) as unknown as {
          content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        };

        // Convert MCP result to OpenClaw AgentToolResult
        const content = executeResult.content.map((item) => {
          if (item.type === "text") {
            return { type: "text" as const, text: String(item.text ?? "") };
          }
          if (item.type === "image") {
            return {
              type: "image" as const,
              data: String(item.data ?? ""),
              mimeType: String(item.mimeType ?? ""),
            };
          }
          return { type: "text" as const, text: JSON.stringify(item) };
        });

        return {
          content,
          details: executeResult,
        };
      },
    }));
  }
}
