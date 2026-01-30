import type { CommandHandler, CommandHandlerResult } from "./commands-types.js";

export const handleVoiceCommands: CommandHandler = async (
  params,
  allowTextCommands,
): Promise<CommandHandlerResult | null> => {
  if (!allowTextCommands) return null;

  const match = params.command.commandBodyNormalized.match(/^\/voice(?:\s+(.+))?$/);
  if (!match) return null;

  const action = match[1]?.trim().toLowerCase() || "status";
  const { provider, cfg } = params;

  // Only Discord supports voice channels currently
  if (provider !== "discord") {
    return {
      reply: {
        text: "❌ Voice commands are only available in Discord.",
      },
      shouldContinue: false,
    };
  }

  // Check if voice is enabled in config
  const discordConfig = cfg.channels?.discord;
  const voiceEnabled = discordConfig?.voice?.enabled === true;

  if (!voiceEnabled) {
    return {
      reply: {
        text:
          "❌ Voice is not enabled. Ask your admin to enable it in the config:\n\n" +
          '```json\n{\n  "channels": {\n    "discord": {\n      "voice": {\n        "enabled": true\n      }\n    }\n  }\n}\n```',
      },
      shouldContinue: false,
    };
  }

  // For now, provide instructions since the Discord voice integration needs to be wired up
  let response: string;

  switch (action) {
    case "join":
      response =
        "🎙️ Voice joining is configured but the Discord integration is still being wired up.\n\n" +
        "The voice session manager and audio pipeline are ready, but the connection to Discord's voice API needs to be completed.\n\n" +
        "**What's ready:**\n" +
        "✅ Voice session manager\n" +
        "✅ Audio pipeline (STT → LLM → TTS)\n" +
        "✅ Config enabled\n\n" +
        "**What's needed:**\n" +
        "🔧 Wire voice commands to Discord client\n" +
        "🔧 Connect to Discord voice gateway\n\n" +
        "This will be completed in the next update!";
      break;

    case "leave":
      response = "ℹ️ Not currently in a voice channel.";
      break;

    case "status":
    case "info":
      response =
        "🎙️ **Voice Status**\n\n" +
        `Enabled: ${voiceEnabled ? "Yes" : "No"}\n` +
        `STT Provider: ${discordConfig?.voice?.providers?.stt || "groq"}\n` +
        `TTS Provider: ${discordConfig?.voice?.providers?.tts || "elevenlabs"}\n` +
        `Interrupt Enabled: ${discordConfig?.voice?.interruptEnabled !== false ? "Yes" : "No"}\n` +
        `Idle Timeout: ${(discordConfig?.voice?.idleTimeoutMs || 60000) / 1000}s\n\n` +
        "**Status:** Infrastructure ready, Discord connection pending";
      break;

    default:
      response =
        "ℹ️ **Voice Commands**\n\n" +
        "Available commands:\n" +
        "• `/voice join` - Join your current voice channel\n" +
        "• `/voice leave` - Leave the voice channel\n" +
        "• `/voice status` - Show voice connection status\n\n" +
        "Voice system is configured but Discord integration is still being completed.";
      break;
  }

  return {
    reply: { text: response },
    shouldContinue: false,
  };
};
