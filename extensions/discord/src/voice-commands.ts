import type { Message, VoiceBasedChannel } from "discord.js";
import { voiceSessionManager } from "./voice-session.js";
import { getDiscordRuntime } from "./runtime.js";
import { getUserVoiceChannel, getVoiceGuild } from "./voice-client.js";

interface VoiceCommandContext {
  message: Message;
  args: string[];
}

/**
 * Handle /voice join command
 */
export async function handleVoiceJoin(ctx: VoiceCommandContext): Promise<string> {
  const { message } = ctx;

  if (!message.guild) {
    return "❌ This command can only be used in a server.";
  }

  // Check if user is in a voice channel using the voice client
  const voiceChannel = getUserVoiceChannel(message.guild.id, message.author.id);

  if (!voiceChannel) {
    return "❌ You need to be in a voice channel first!";
  }

  try {
    // Check if already in a voice channel in this guild
    const existingSession = voiceSessionManager.getSession(message.guild.id);
    if (existingSession && existingSession.isSessionActive()) {
      return "ℹ️ I'm already in a voice channel in this server.";
    }

    // Create voice session (adapterCreator is fetched internally from voice-client)
    const session = await voiceSessionManager.createSession({
      guildId: message.guild.id,
      channelId: voiceChannel.id,
      userId: message.author.id,
      idleTimeoutMs: 60_000, // 1 minute idle timeout
      interruptEnabled: true,
    });

    // Join the channel
    await session.join();

    // Set up session event handlers
    session.on("idle", async () => {
      try {
        await message.channel.send("⏱️ Voice session timed out due to inactivity.");
      } catch (error) {
        console.error("Failed to send idle message:", error);
      }
    });

    session.on("error", async (error) => {
      console.error("Voice session error:", error);
      try {
        await message.channel.send(`❌ Voice error: ${error.message}`);
      } catch (sendError) {
        console.error("Failed to send error message:", sendError);
      }
    });

    session.on("disconnected", async () => {
      try {
        await message.channel.send("👋 Left voice channel.");
      } catch (error) {
        console.error("Failed to send disconnect message:", error);
      }
    });

    // Get channel name safely
    const channelName = typeof voiceChannel === "string" ? "voice channel" : voiceChannel.name;
    return `✅ Joined ${channelName}! Speak to interact with me.`;
  } catch (error) {
    console.error("Failed to join voice:", error);
    return `❌ Failed to join voice channel: ${(error as Error).message}`;
  }
}

/**
 * Handle /voice leave command
 */
export async function handleVoiceLeave(ctx: VoiceCommandContext): Promise<string> {
  const { message } = ctx;

  if (!message.guild) {
    return "❌ This command can only be used in a server.";
  }

  const session = voiceSessionManager.getSession(message.guild.id);

  if (!session || !session.isSessionActive()) {
    return "ℹ️ I'm not in a voice channel.";
  }

  try {
    await voiceSessionManager.destroySession(message.guild.id);
    return "👋 Left voice channel.";
  } catch (error) {
    console.error("Failed to leave voice:", error);
    return `❌ Failed to leave voice channel: ${(error as Error).message}`;
  }
}

/**
 * Handle /voice status command
 */
export async function handleVoiceStatus(ctx: VoiceCommandContext): Promise<string> {
  const { message } = ctx;

  if (!message.guild) {
    return "❌ This command can only be used in a server.";
  }

  const session = voiceSessionManager.getSession(message.guild.id);

  if (!session || !session.isSessionActive()) {
    return "ℹ️ Not connected to any voice channel.";
  }

  const connection = session.getConnection();
  const isSpeaking = session.getSpeakingState();

  let statusText = "🎙️ **Voice Status**\n\n";
  statusText += `📊 State: ${connection?.state.status || "Unknown"}\n`;
  statusText += `🗣️ Speaking: ${isSpeaking ? "Yes" : "No"}\n`;

  // Get channel info from voice guild
  try {
    const guild = getVoiceGuild(message.guild.id);
    const botMember = guild?.members.cache.get(guild.client.user.id);
    const voiceChannel = botMember?.voice.channel;
    if (voiceChannel) {
      statusText += `📍 Channel: ${voiceChannel.name}\n`;
      statusText += `👥 Users: ${voiceChannel.members.size}\n`;
    }
  } catch (error) {
    console.error("Failed to get channel info:", error);
  }

  return statusText;
}

/**
 * Main voice command router
 */
export async function handleVoiceCommand(message: Message): Promise<void> {
  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args[1]?.toLowerCase();

  const ctx: VoiceCommandContext = {
    message,
    args: args.slice(2),
  };

  let response: string;

  switch (command) {
    case "join":
      response = await handleVoiceJoin(ctx);
      break;
    case "leave":
      response = await handleVoiceLeave(ctx);
      break;
    case "status":
      response = await handleVoiceStatus(ctx);
      break;
    default:
      response = `ℹ️ **Voice Commands**

Available commands:
• \`/voice join\` - Join your current voice channel
• \`/voice leave\` - Leave the voice channel
• \`/voice status\` - Show voice connection status

You can also say "Hey Liam, join voice" in a text channel.`;
      break;
  }

  await message.reply(response);
}

/**
 * Check if message is a voice command
 */
export function isVoiceCommand(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return normalized.startsWith("/voice") || 
         normalized.includes("join voice") ||
         normalized.includes("leave voice");
}
