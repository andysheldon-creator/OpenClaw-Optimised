/**
 * OpenClaw Cursor MCP Plugin
 *
 * This plugin integrates OpenClaw with Cursor IDE through the Model Context Protocol (MCP).
 * It allows Cursor to use OpenClaw as an AI backend and provides tools for managing
 * conversations, sessions, and messaging channels.
 *
 * Usage in Cursor:
 * 1. Add to Cursor's MCP configuration (~/.cursor/mcp.json or Cursor Settings > Features > MCP)
 * 2. Use the openclaw_* tools in Cursor's Composer Agent
 *
 * Configuration example for mcp.json:
 * {
 *   "mcpServers": {
 *     "openclaw": {
 *       "command": "openclaw",
 *       "args": ["mcp", "serve"],
 *       "env": {
 *         "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789",
 *         "OPENCLAW_GATEWAY_TOKEN": "your-token"
 *       }
 *     }
 *   }
 * }
 */

import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export type CursorMcpPluginConfig = {
  enabled?: boolean;
  port?: number;
  autoApproveTools?: string[];
};

const cursorMcpPlugin = {
  id: "cursor-mcp",
  name: "Cursor MCP Server",
  description: "MCP server integration for Cursor IDE - enables OpenClaw as an AI agent in Cursor",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // Register the CLI command for starting the MCP server
    api.registerCli(
      async (ctx) => {
        const mcpCommand = ctx.program
          .command("mcp")
          .description("MCP server for IDE integration");

        mcpCommand
          .command("serve")
          .description("Start the MCP server for Cursor IDE integration")
          .option("--url <url>", "Gateway WebSocket URL", "ws://127.0.0.1:18789")
          .option("--token <token>", "Gateway auth token")
          .option("--password <password>", "Gateway auth password")
          .option("--session <key>", "Default session key", "agent:main:cursor")
          .action(async (opts) => {
            // Dynamic import to avoid loading MCP SDK unless needed
            const { OpenClawMcpServer } = await import("./src/server.js");

            const server = new OpenClawMcpServer({
              gatewayUrl: opts.url,
              gatewayToken: opts.token,
              gatewayPassword: opts.password,
              defaultSessionKey: opts.session,
            });

            process.on("SIGINT", async () => {
              await server.stop();
              process.exit(0);
            });

            process.on("SIGTERM", async () => {
              await server.stop();
              process.exit(0);
            });

            await server.start();
          });

        mcpCommand
          .command("info")
          .description("Show MCP server configuration information for Cursor")
          .action(() => {
            console.log(`
OpenClaw MCP Server - Cursor IDE Integration

To use OpenClaw in Cursor, add the following to your Cursor MCP configuration:

1. Open Cursor Settings > Features > MCP
2. Click "+ Add New MCP Server"
3. Configure:
   - Name: openclaw
   - Type: stdio
   - Command: openclaw mcp serve

Or manually edit ~/.cursor/mcp.json:

{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789"
      }
    }
  }
}

Environment Variables:
- OPENCLAW_GATEWAY_URL: Gateway WebSocket URL (default: ws://127.0.0.1:18789)
- OPENCLAW_GATEWAY_TOKEN: Authentication token
- OPENCLAW_GATEWAY_PASSWORD: Authentication password
- OPENCLAW_SESSION_KEY: Default session key (default: agent:main:cursor)

Available Tools:
- openclaw_chat: Chat with the OpenClaw AI agent
- openclaw_list_sessions: List active sessions
- openclaw_get_session: Get session details
- openclaw_clear_session: Clear session history
- openclaw_execute_command: Execute OpenClaw commands
- openclaw_send_message: Send messages through channels
- openclaw_get_status: Get gateway status
- openclaw_list_models: List available models

Available Resources:
- openclaw://status: Gateway status
- openclaw://models: Available models
- openclaw://sessions: Active sessions
- openclaw://config: Configuration (sanitized)

Available Prompts:
- code_review: Review code for issues
- explain_code: Explain how code works
- generate_tests: Generate tests
- refactor_code: Suggest refactoring
- debug_help: Help debug issues
- send_notification: Send notification via channels
`);
          });
      },
      { commands: ["mcp"] },
    );
  },
};

export default cursorMcpPlugin;
