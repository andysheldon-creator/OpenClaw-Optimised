import type { Message } from "discord.js";
import { handleVoiceCommand, isVoiceCommand } from "./voice-commands.js";
import { voiceSessionManager } from "./voice-session.js";
import { VoiceConversationHandler, type AudioPipelineConfig } from "./audio-pipeline.js";
import { getVoiceClient, destroyVoiceClient } from "./voice-client.js";

/**
 * Initialize voice integration for Discord
 * Call this when the Discord plugin is registered
 */
export async function initializeVoiceIntegration(config: {
  token: string;
  groqApiKey?: string;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId?: string;
}): Promise<void> {
  console.log("Discord voice integration initializing...");
  
  // Initialize voice client (parallel discord.js client for voice)
  try {
    await getVoiceClient(config.token);
    console.log("Discord voice client initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Discord voice client:", error);
    throw error;
  }
  
  // Store config for later use
  voiceConfig = {
    sttProvider: "groq",
    ttsProvider: "elevenlabs",
    groqApiKey: config.groqApiKey,
    elevenlabsApiKey: config.elevenlabsApiKey,
    elevenlabsVoiceId: config.elevenlabsVoiceId,
    elevenlabsModelId: config.elevenlabsModelId,
  };
  
  console.log("Discord voice integration initialized");
}

let voiceConfig: AudioPipelineConfig | null = null;

/**
 * Handle incoming Discord message for voice commands
 */
export async function handleDiscordMessageForVoice(message: Message): Promise<boolean> {
  // Check if this is a voice command
  if (isVoiceCommand(message.content)) {
    await handleVoiceCommand(message);
    return true; // Command handled
  }

  return false; // Not a voice command
}

/**
 * Setup voice conversation handler for a session
 */
export function setupVoiceConversation(
  guildId: string,
  onTextCallback: (text: string) => Promise<string>,
): VoiceConversationHandler | null {
  if (!voiceConfig) {
    console.error("Voice config not initialized");
    return null;
  }

  const session = voiceSessionManager.getSession(guildId);
  if (!session) {
    console.error("No voice session found for guild:", guildId);
    return null;
  }

  const handler = new VoiceConversationHandler(
    session,
    voiceConfig,
    onTextCallback,
  );

  return handler;
}

/**
 * Get voice session manager
 */
export function getVoiceSessionManager() {
  return voiceSessionManager;
}

/**
 * Cleanup voice integration
 */
export async function cleanupVoiceIntegration(): Promise<void> {
  await voiceSessionManager.destroyAll();
  await destroyVoiceClient();
  console.log("Discord voice integration cleaned up");
}
