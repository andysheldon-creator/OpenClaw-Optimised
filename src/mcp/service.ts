import type { AnyAgentTool } from "../agents/tools/common.js";
import type { OpenClawConfig } from "../config/config.js";
import { McpClientManager } from "./client.js";

const clientCache = new Map<string, McpClientManager>();

export async function loadMcpTools(cfg: OpenClawConfig): Promise<AnyAgentTool[]> {
  const servers = cfg.mcp?.servers;
  if (!servers) {
    return [];
  }

  const tools: AnyAgentTool[] = [];

  for (const [id, config] of Object.entries(servers)) {
    if (config.enabled === false) {
      continue;
    }

    let manager = clientCache.get(id);
    if (!manager) {
      manager = new McpClientManager({
        command: config.command,
        args: config.args,
        env: config.env,
      });
      try {
        await manager.connect();
        clientCache.set(id, manager);
      } catch (err) {
        // Use console directly or a proper logger if available.
        // Assuming global console is safe here.
        console.warn(`Failed to connect to MCP server ${id}:`, err);
        continue;
      }
    }

    try {
      const serverTools = await manager.listTools();
      // Prefix tool names with server ID to avoid collisions
      const prefixedTools = serverTools.map((tool) => ({
        ...tool,
        name: `${id}_${tool.name}`,
        description: `[MCP: ${id}] ${tool.description}`,
      }));
      tools.push(...prefixedTools);
    } catch (err) {
      console.warn(`Failed to list tools from MCP server ${id}:`, err);
    }
  }

  return tools;
}

export async function cleanupMcpClients() {
  for (const manager of clientCache.values()) {
    await manager.close().catch(() => {});
  }
  clientCache.clear();
}
