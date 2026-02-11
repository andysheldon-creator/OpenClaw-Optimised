import type { ClawdbotPluginApi } from "../../src/plugins/types.js";

import type { RubeOAuthCredentials } from "./src/auth.js";
import { wrapCachedMcpTools, type CachedMcpTool } from "./src/tool-wrapper.js";
import { getStoredCredentials, getCachedTools, saveCredentials, createRubeCommands } from "./src/cli.js";

type RubePluginConfig = {
  enabled?: boolean;
  oauth?: RubeOAuthCredentials;
  cachedTools?: CachedMcpTool[];
};

export default function register(api: ClawdbotPluginApi) {
  const config = api.pluginConfig as RubePluginConfig | undefined;

  // Check if plugin is disabled
  if (config?.enabled === false) {
    api.logger.debug("Rube MCP plugin disabled via config");
    return;
  }

  // Register CLI commands
  api.registerCli(
    ({ program }) => {
      createRubeCommands(program, api);
    },
    { commands: ["rube"] },
  );

  // Get cached tools (synchronous)
  const cachedTools = getCachedTools(api);

  if (cachedTools.length === 0) {
    api.logger.debug("Rube MCP: No cached tools. Run 'clawdbot rube login' to authenticate and cache tools.");
    return;
  }

  // Register tools from cache (synchronous)
  const tools = wrapCachedMcpTools(
    cachedTools,
    () => getStoredCredentials(api),
    async (creds) => {
      await saveCredentials(api, creds);
    },
  );

  api.logger.info(`Rube MCP: Loaded ${tools.length} tools from cache`);

  // Register each tool
  for (const tool of tools) {
    api.registerTool(tool, { name: tool.name });
  }
}
