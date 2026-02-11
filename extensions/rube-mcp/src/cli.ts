import type { Command } from "commander";
import { randomBytes } from "node:crypto";
import type { ClawdbotPluginApi } from "../../../src/plugins/types.js";
import type { RubeOAuthCredentials } from "./auth.js";
import type { CachedMcpTool } from "./tool-wrapper.js";
import {
  generatePkce,
  registerClient,
  buildAuthorizationUrl,
  startCallbackServer,
  exchangeCodeForTokens,
} from "./auth.js";
import { RubeMcpClient } from "./mcp-client.js";

// Storage key for credentials in plugin config
export const RUBE_CREDENTIALS_KEY = "oauth";

type RubePluginConfig = {
  enabled?: boolean;
  oauth?: RubeOAuthCredentials;
  cachedTools?: CachedMcpTool[];
};

/**
 * Get stored Rube credentials from plugin config
 */
export function getStoredCredentials(api: ClawdbotPluginApi): RubeOAuthCredentials | null {
  // pluginConfig comes from plugins.entries["rube-mcp"].config
  const config = api.pluginConfig as RubePluginConfig | undefined;
  return config?.oauth ?? null;
}

/**
 * Get cached tool definitions from plugin config
 */
export function getCachedTools(api: ClawdbotPluginApi): CachedMcpTool[] {
  const config = api.pluginConfig as RubePluginConfig | undefined;
  return config?.cachedTools ?? [];
}

/**
 * Save Rube credentials to plugin config
 */
export async function saveCredentials(
  api: ClawdbotPluginApi,
  credentials: RubeOAuthCredentials | null,
): Promise<void> {
  // Load current config through runtime
  const config = await api.runtime.config.loadConfig();

  // Ensure plugins.entries section exists
  config.plugins = config.plugins ?? {};
  config.plugins.entries = config.plugins.entries ?? {};
  config.plugins.entries["rube-mcp"] = config.plugins.entries["rube-mcp"] ?? {};
  config.plugins.entries["rube-mcp"].config = config.plugins.entries["rube-mcp"].config ?? {};

  if (credentials) {
    (config.plugins.entries["rube-mcp"].config as Record<string, unknown>).oauth = credentials;
  } else {
    delete (config.plugins.entries["rube-mcp"].config as Record<string, unknown>).oauth;
  }

  // Write back through runtime
  await api.runtime.config.writeConfigFile(config);
}

/**
 * Save cached tools to plugin config
 */
export async function saveCachedTools(
  api: ClawdbotPluginApi,
  tools: CachedMcpTool[] | null,
): Promise<void> {
  const config = await api.runtime.config.loadConfig();

  config.plugins = config.plugins ?? {};
  config.plugins.entries = config.plugins.entries ?? {};
  config.plugins.entries["rube-mcp"] = config.plugins.entries["rube-mcp"] ?? {};
  config.plugins.entries["rube-mcp"].config = config.plugins.entries["rube-mcp"].config ?? {};

  if (tools && tools.length > 0) {
    (config.plugins.entries["rube-mcp"].config as Record<string, unknown>).cachedTools = tools;
  } else {
    delete (config.plugins.entries["rube-mcp"].config as Record<string, unknown>).cachedTools;
  }

  await api.runtime.config.writeConfigFile(config);
}

/**
 * Fetch and cache tool definitions from Rube MCP
 */
async function refreshToolCache(api: ClawdbotPluginApi): Promise<CachedMcpTool[]> {
  const credentials = getStoredCredentials(api);
  if (!credentials) {
    throw new Error("Not authenticated. Run 'clawdbot rube login' first.");
  }

  const client = new RubeMcpClient({
    credentials,
    onCredentialsRefreshed: async (creds) => saveCredentials(api, creds),
  });

  try {
    const mcpTools = await client.listTools();

    // Convert to cached format (serializable)
    const cachedTools: CachedMcpTool[] = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    await saveCachedTools(api, cachedTools);

    return cachedTools;
  } finally {
    await client.close();
  }
}

/**
 * Create Rube CLI commands on the given program
 */
export function createRubeCommands(program: Command, api: ClawdbotPluginApi): void {
  const rube = program.command("rube").description("Rube MCP integration - connect to 500+ apps");

  rube
    .command("login")
    .description("Authenticate with Rube")
    .action(async () => {
      const { openUrl } = await import("../../../src/commands/onboard-helpers.js");

      console.log("Starting Rube authentication...\n");

      // Step 1: Dynamic Client Registration
      console.log("Registering client...");
      const clientId = await registerClient();
      console.log("Client registered.\n");

      // Step 2: Generate PKCE and state
      const pkce = generatePkce();
      const state = randomBytes(16).toString("hex");

      // Step 3: Start callback server
      console.log("Starting local callback server...");
      const callbackPromise = startCallbackServer({ state, timeoutMs: 120_000 });

      // Step 4: Open browser
      const authUrl = buildAuthorizationUrl({ clientId, pkce, state });
      console.log("\nOpening browser for authentication...");
      console.log(`If browser doesn't open, visit:\n${authUrl}\n`);

      await openUrl(authUrl);

      // Step 5: Wait for callback
      console.log("Waiting for authentication...");
      const { code } = await callbackPromise;
      console.log("\nReceived authorization code.\n");

      // Step 6: Exchange code for tokens
      console.log("Exchanging code for tokens...");
      const credentials = await exchangeCodeForTokens({
        clientId,
        code,
        codeVerifier: pkce.verifier,
      });

      // Step 7: Save credentials
      await saveCredentials(api, credentials);

      // Step 8: Cache tool definitions
      console.log("Fetching tool definitions...");
      try {
        const tools = await refreshToolCache(api);
        console.log(`Cached ${tools.length} tools.\n`);
      } catch (err) {
        console.log(
          `Warning: Could not cache tools: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.log("Run 'clawdbot rube refresh' to try again.\n");
      }

      console.log("Rube authentication successful!");
      console.log("Restart the gateway to make Rube tools available.\n");
    });

  rube
    .command("logout")
    .description("Disconnect from Rube")
    .action(async () => {
      await saveCredentials(api, null);
      await saveCachedTools(api, null);
      console.log("Rube credentials and cached tools removed.");
    });

  rube
    .command("refresh")
    .description("Refresh cached tool definitions from Rube")
    .action(async () => {
      console.log("Refreshing tool cache...\n");
      try {
        const tools = await refreshToolCache(api);
        console.log(`Cached ${tools.length} tools.`);
        console.log("Restart the gateway to use updated tools.\n");
      } catch (err) {
        console.error(`Failed to refresh: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  rube
    .command("status")
    .description("Show Rube connection status")
    .action(async () => {
      const credentials = getStoredCredentials(api);

      if (!credentials) {
        console.log("Status: Not connected");
        console.log("\nRun 'clawdbot rube login' to authenticate.");
        return;
      }

      const now = Date.now();
      const tokenExpired = now >= credentials.expiresAt;
      const expiresIn = Math.max(0, Math.round((credentials.expiresAt - now) / 1000 / 60));

      console.log("Status: Connected");
      console.log(
        `Token expires: ${tokenExpired ? "Expired (will refresh on next use)" : `in ${expiresIn} minutes`}`,
      );

      // Try to list tools
      let client: RubeMcpClient | null = null;
      try {
        console.log("\nFetching available tools...");
        client = new RubeMcpClient({
          credentials,
          onCredentialsRefreshed: async (creds) => saveCredentials(api, creds),
        });
        const tools = await client.listTools();
        console.log(`Available tools: ${tools.length}`);

        if (tools.length > 0) {
          console.log("\nSample tools:");
          for (const tool of tools.slice(0, 5)) {
            console.log(`  - ${tool.name}: ${tool.description?.slice(0, 60) ?? ""}...`);
          }
          if (tools.length > 5) {
            console.log(`  ... and ${tools.length - 5} more`);
          }
        }
      } catch (err) {
        console.log(`\nFailed to fetch tools: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await client?.close();
      }
    });

  rube
    .command("tools")
    .description("List all available Rube tools")
    .action(async () => {
      const credentials = getStoredCredentials(api);

      if (!credentials) {
        console.log("Not connected. Run 'clawdbot rube login' first.");
        return;
      }

      const client = new RubeMcpClient({
        credentials,
        onCredentialsRefreshed: async (creds) => saveCredentials(api, creds),
      });

      try {
        console.log("Fetching tools from Rube...\n");
        const tools = await client.listTools();

        console.log(`Found ${tools.length} tools:\n`);
        for (const tool of tools) {
          console.log(`${tool.name}`);
          if (tool.description) {
            console.log(`  ${tool.description}`);
          }
          console.log();
        }
      } finally {
        await client.close();
      }
    });
}
