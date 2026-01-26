import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema, getPresenceManager } from "clawdbot/plugin-sdk";

import { discordPlugin } from "./src/channel.js";
import { setDiscordRuntime } from "./src/runtime.js";

const plugin = {
  id: "discord",
  name: "Discord",
  description: "Discord channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setDiscordRuntime(api.runtime);
    api.registerChannel({ plugin: discordPlugin });

    // Register message_sent hook for presence updates
    api.registerHook({
      hookName: "message_sent",
      priority: 5,
      handler: async (event, ctx) => {
        // Only handle Discord channel
        if (ctx.channelId !== "discord") {
          return;
        }

        // Find the presence manager for this account
        const accountId = ctx.accountId ?? "default";
        const manager = getPresenceManager(accountId);
        if (!manager) {
          return;
        }

        // Update presence with usage info
        manager.updatePresence({
          sessionKey: ctx.sessionKey,
          tokens: event.usage?.totalTokens,
          inputTokens: event.usage?.inputTokens,
          outputTokens: event.usage?.outputTokens,
          model: event.usage?.model,
          provider: event.usage?.provider,
        });
      },
    });
  },
};

export default plugin;
