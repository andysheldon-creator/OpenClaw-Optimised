import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { discordPlugin } from "./src/channel.js";
import { setDiscordRuntime } from "./src/runtime.js";
import { 
  initializeVoiceIntegration, 
  cleanupVoiceIntegration,
  handleDiscordMessageForVoice,
  getVoiceSessionManager,
} from "./src/voice-integration.js";

const plugin = {
  id: "discord",
  name: "Discord",
  description: "Discord channel plugin with voice support",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    api.logger.info("[discord-plugin] Register called");
    setDiscordRuntime(api.runtime);
    api.registerChannel({ plugin: discordPlugin });

    // Initialize voice integration (fire-and-forget, plugin system doesn't support async register)
    const config = api.config;
    const discordConfig = config.channels?.discord;
    api.logger.info(`[discord-plugin] Voice enabled check: ${discordConfig?.voice?.enabled}`);
    
    if (discordConfig?.voice?.enabled) {
      api.logger.info("Initializing Discord voice support...");
      
      // Get Discord token - use resolveDiscordToken from runtime config
      // We need to access the token that's being used by the Discord monitor
      const token = discordConfig?.token || process.env.DISCORD_BOT_TOKEN || "";
      
      if (!token) {
        console.error("Cannot initialize Discord voice: token not found");
        return;
      }
      
      // Get API keys from config
      const groqApiKey = config.models?.providers?.groq?.apiKey;
      const elevenlabsApiKey = config.messages?.tts?.elevenlabs?.apiKey;
      const elevenlabsVoiceId = config.messages?.tts?.elevenlabs?.voiceId;
      const elevenlabsModelId = config.messages?.tts?.elevenlabs?.modelId;

      // Initialize in background (don't await - plugin register must be sync)
      initializeVoiceIntegration({
        token,
        groqApiKey,
        elevenlabsApiKey,
        elevenlabsVoiceId,
        elevenlabsModelId,
      }).catch((error) => {
        console.error("Failed to initialize Discord voice integration:", error);
      });
    }
  },
  unregister() {
    // Cleanup voice sessions on unregister
    cleanupVoiceIntegration().catch(console.error);
  },
};

// Export voice utilities for use by Discord runtime
export { 
  handleDiscordMessageForVoice,
  getVoiceSessionManager,
};

export default plugin;
