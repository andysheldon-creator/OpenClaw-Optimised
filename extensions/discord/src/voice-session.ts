import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { VoiceChannel, VoiceBasedChannel } from "discord.js";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { getVoiceAdapterCreator } from "./voice-client.js";

interface VoiceSessionConfig {
  guildId: string;
  channelId: string;
  userId: string;
  idleTimeoutMs?: number;
  interruptEnabled?: boolean;
}

interface VoiceSessionEvents {
  speech: (audioChunk: Buffer) => void;
  interrupt: () => void;
  idle: () => void;
  error: (error: Error) => void;
  disconnected: () => void;
}

export class VoiceSession extends EventEmitter {
  private connection: VoiceConnection | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private config: VoiceSessionConfig;
  private idleTimer: NodeJS.Timeout | null = null;
  private isActive = false;
  private isSpeaking = false;

  constructor(config: VoiceSessionConfig) {
    super();
    this.config = config;
  }

  /**
   * Join the voice channel and set up audio handlers
   */
  async join(): Promise<void> {
    if (this.connection) {
      throw new Error("Already connected to a voice channel");
    }

    try {
      // Get adapter creator from voice client
      const adapterCreator = getVoiceAdapterCreator(this.config.guildId);

      // Join the voice channel
      this.connection = joinVoiceChannel({
        channelId: this.config.channelId,
        guildId: this.config.guildId,
        adapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      // Create audio player
      this.audioPlayer = createAudioPlayer();

      // Subscribe connection to audio player
      this.connection.subscribe(this.audioPlayer);

      // Wait for connection to be ready
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);

      this.isActive = true;

      // Set up event handlers
      this.setupConnectionHandlers();
      this.setupAudioPlayerHandlers();

      // Start idle timeout
      this.resetIdleTimeout();
    } catch (error) {
      this.emit("error", error as Error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Leave the voice channel and cleanup
   */
  async leave(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Play audio in the voice channel
   */
  async playAudio(audioStream: Readable | Buffer): Promise<void> {
    if (!this.audioPlayer || !this.isActive) {
      throw new Error("Not connected to a voice channel");
    }

    try {
      // Convert buffer to stream if needed
      const stream = audioStream instanceof Buffer
        ? Readable.from(audioStream)
        : audioStream;

      // Create audio resource
      const resource = createAudioResource(stream, {
        inlineVolume: true,
      });

      // Set volume to 100%
      if (resource.volume) {
        resource.volume.setVolume(1.0);
      }

      this.isSpeaking = true;

      // Play the audio
      this.audioPlayer.play(resource);

      // Reset idle timeout
      this.resetIdleTimeout();
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    }
  }

  /**
   * Stop current audio playback
   */
  stopAudio(): void {
    if (this.audioPlayer) {
      this.audioPlayer.stop();
      this.isSpeaking = false;
    }
  }

  /**
   * Check if currently speaking
   */
  getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current voice connection
   */
  getConnection(): VoiceConnection | null {
    return this.connection;
  }

  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Seems to be reconnecting to a new channel - ignore disconnect
      } catch {
        // Seems to be a real disconnect - cleanup
        this.emit("disconnected");
        await this.cleanup();
      }
    });

    this.connection.on("error", (error) => {
      this.emit("error", error);
    });
  }

  private setupAudioPlayerHandlers(): void {
    if (!this.audioPlayer) return;

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.isSpeaking = false;
      this.resetIdleTimeout();
    });

    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this.isSpeaking = true;
    });

    this.audioPlayer.on("error", (error) => {
      this.emit("error", error.error);
    });
  }

  private resetIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    const timeoutMs = this.config.idleTimeoutMs || 60_000;

    this.idleTimer = setTimeout(() => {
      this.emit("idle");
    }, timeoutMs);
  }

  private async cleanup(): Promise<void> {
    this.isActive = false;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.audioPlayer) {
      this.audioPlayer.stop();
      this.audioPlayer.removeAllListeners();
      this.audioPlayer = null;
    }

    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }
}

/**
 * Global voice session manager
 */
class VoiceSessionManager {
  private sessions = new Map<string, VoiceSession>();

  /**
   * Get or create a voice session for a guild
   */
  getSession(guildId: string): VoiceSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Create a new voice session
   */
  async createSession(config: VoiceSessionConfig): Promise<VoiceSession> {
    const existingSession = this.sessions.get(config.guildId);
    if (existingSession) {
      await existingSession.leave();
    }

    const session = new VoiceSession(config);

    session.on("disconnected", () => {
      this.sessions.delete(config.guildId);
    });

    session.on("idle", async () => {
      await session.leave();
      this.sessions.delete(config.guildId);
    });

    this.sessions.set(config.guildId, session);

    return session;
  }

  /**
   * Destroy a session
   */
  async destroySession(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (session) {
      await session.leave();
      this.sessions.delete(guildId);
    }
  }

  /**
   * Destroy all sessions
   */
  async destroyAll(): Promise<void> {
    const promises = Array.from(this.sessions.keys()).map((guildId) =>
      this.destroySession(guildId)
    );
    await Promise.all(promises);
  }

  /**
   * List all active sessions
   */
  listSessions(): { guildId: string; channelId: string; userId: string }[] {
    return Array.from(this.sessions.entries()).map(([guildId, session]) => ({
      guildId,
      channelId: session["config"].channelId,
      userId: session["config"].userId,
    }));
  }
}

export const voiceSessionManager = new VoiceSessionManager();
