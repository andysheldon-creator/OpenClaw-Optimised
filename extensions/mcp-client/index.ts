/**
 * OpenClaw Generic MCP Client Plugin
 *
 * Connects to any Model Context Protocol server (filesystem, database, APIs, etc.)
 * Supports multiple simultaneous MCP server connections.
 *
 * Compatible with all standard MCP servers:
 * - Filesystem (mcp-server-filesystem)
 * - GitHub (mcp-server-github)
 * - Postgres (mcp-server-postgres)
 * - Slack (mcp-server-slack)
 * - Skyline API Gateway (skyline-mcp)
 * - And any other MCP-compliant server
 */

import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  toolPrefix?: string;
  autoReconnect?: boolean;
}

interface MCPClientConfig {
  enabled?: boolean;
  servers?: Record<string, MCPServerConfig>;
}

interface MCPMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 1;
  private pendingCalls = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = "";
  private tools: MCPTool[] = [];

  constructor(
    private serverName: string,
    private config: MCPServerConfig,
    private logger: OpenClawPluginApi["logger"],
  ) {
    super();
  }

  async start(): Promise<void> {
    this.logger.info(
      `[mcp-client] [${this.serverName}] starting MCP server: ${this.config.command}`,
    );

    // Spawn MCP server binary
    this.process = spawn(this.config.command, this.config.args || [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...this.config.env,
      },
    });

    // Handle stdout (MCP messages)
    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Handle stderr (logs)
    this.process.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line.includes("Error") || line.includes("error")) {
          this.logger.error(`[mcp-client] [${this.serverName}] ${line}`);
        } else {
          this.logger.debug(`[mcp-client] [${this.serverName}] ${line}`);
        }
      }
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      this.logger.info(
        `[mcp-client] [${this.serverName}] process exited (code: ${code}, signal: ${signal})`,
      );
      this.emit("exit", { code, signal });

      if (this.config.autoReconnect) {
        this.logger.info(`[mcp-client] [${this.serverName}] reconnecting in 5 seconds...`);
        setTimeout(() => this.start(), 5000);
      }
    });

    // Handle errors
    this.process.on("error", (err) => {
      this.logger.error(`[mcp-client] [${this.serverName}] process error: ${err.message}`);
      this.emit("error", err);
    });

    // Initialize MCP protocol
    await this.initialize();
    await this.fetchTools();

    this.logger.info(
      `[mcp-client] [${this.serverName}] connected (${this.tools.length} tools loaded)`,
    );
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message: MCPMessage = JSON.parse(line);

        if (message.id !== undefined) {
          // Response to a request
          const pending = this.pendingCalls.get(Number(message.id));
          if (pending) {
            this.pendingCalls.delete(Number(message.id));
            if (message.error) {
              pending.reject(new Error(`MCP Error: ${message.error.message}`));
            } else {
              pending.resolve(message.result);
            }
          }
        }
      } catch (err) {
        this.logger.error(`[mcp-client] [${this.serverName}] failed to parse message: ${line}`);
      }
    }
  }

  private call(method: string, params?: any): Promise<any> {
    const id = this.messageId++;
    const message: MCPMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    this.process?.stdin?.write(JSON.stringify(message) + "\n");

    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 30000);
    });
  }

  private async initialize(): Promise<void> {
    await this.call("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "openclaw-mcp-client",
        version: "1.0.0",
      },
    });
  }

  private async fetchTools(): Promise<void> {
    const response = await this.call("tools/list");
    this.tools = response.tools || [];
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const response = await this.call("tools/call", {
      name,
      arguments: args,
    });

    // MCP returns: { content: [{ type: "text", text: "..." }] }
    if (response.content && Array.isArray(response.content)) {
      const textContent = response.content.find((c: any) => c.type === "text");
      if (textContent?.text) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
    }

    return response;
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    for (const [id, { reject }] of this.pendingCalls) {
      reject(new Error("MCP client stopped"));
    }
    this.pendingCalls.clear();
  }
}

export default function register(api: OpenClawPluginApi) {
  const config = api.pluginConfig as MCPClientConfig | undefined;

  // Graceful disable if not configured
  if (!config?.enabled) {
    api.logger.info("[mcp-client] plugin disabled (set enabled: true to activate)");
    return;
  }

  // Validate servers config
  if (!config.servers || Object.keys(config.servers).length === 0) {
    api.logger.error("[mcp-client] no MCP servers configured");
    return;
  }

  const mcpClients = new Map<string, MCPClient>();

  const service: OpenClawPluginService = {
    id: "mcp-client",
    start: async () => {
      // Start each MCP server
      for (const [serverName, serverConfig] of Object.entries(config.servers!)) {
        const client = new MCPClient(serverName, serverConfig, api.logger);

        try {
          // Wait for connection
          await client.start();

          // Register all tools from this server
          const toolPrefix = serverConfig.toolPrefix || `${serverName}_`;
          const tools = client.getTools();

          for (const tool of tools) {
            const toolName = `${toolPrefix}${tool.name.replace(/[^a-zA-Z0-9_]/g, "_")}`;

            api.registerTool({
              name: toolName,
              description: tool.description || `${serverName} MCP tool: ${tool.name}`,
              parameters: tool.inputSchema,
              async execute(_toolCallId: string, args: Record<string, any>) {
                try {
                  const result = await client.callTool(tool.name, args);
                  return {
                    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
                    details: result,
                  };
                } catch (err: any) {
                  api.logger.error(
                    `[mcp-client] [${serverName}] tool ${toolName} failed: ${err.message}`,
                  );
                  throw err;
                }
              },
            });
          }

          mcpClients.set(serverName, client);
          api.logger.info(`[mcp-client] [${serverName}] registered ${tools.length} tools`);
        } catch (err: any) {
          api.logger.error(`[mcp-client] [${serverName}] failed to start: ${err.message}`);
        }
      }

      const totalTools = Array.from(mcpClients.values()).reduce(
        (sum, client) => sum + client.getTools().length,
        0,
      );
      api.logger.info(
        `[mcp-client] connected to ${mcpClients.size} servers (${totalTools} total tools)`,
      );
    },
    stop: async () => {
      for (const [serverName, client] of mcpClients) {
        api.logger.info(`[mcp-client] [${serverName}] stopping...`);
        client.stop();
      }
      mcpClients.clear();
    },
  };

  api.registerService(service);

  // Register status command
  api.registerCommand({
    name: "mcp",
    description: "Check MCP client connection status",
    handler: async () => {
      if (mcpClients.size === 0) {
        return { text: "MCP Client: No servers connected" };
      }

      const lines = [`MCP Client: Connected to ${mcpClients.size} servers`, ""];

      for (const [serverName, client] of mcpClients) {
        const tools = client.getTools();
        lines.push(`**${serverName}** (${tools.length} tools)`);
        lines.push(`Sample tools:`);
        for (const tool of tools.slice(0, 3)) {
          lines.push(`  • ${tool.name}: ${tool.description}`);
        }
        if (tools.length > 3) {
          lines.push(`  • ... and ${tools.length - 3} more`);
        }
        lines.push("");
      }

      return { text: lines.join("\n") };
    },
  });

  api.logger.info("[mcp-client] plugin registered successfully");
}
