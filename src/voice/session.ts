/**
 * VoiceSession — wraps an ElevenLabs Conversational AI WebSocket session.
 *
 * Each active voice call is a VoiceSession instance. The session manages:
 * - Connection to ElevenLabs Conversational AI WebSocket
 * - Routing audio from the client to ElevenLabs and back
 * - State tracking (connecting → listening → thinking → speaking → ended)
 * - Transcript collection for persistence
 *
 * The ElevenLabs Conversational AI handles STT, conversation management,
 * and TTS internally — we just pipe audio in/out.
 */

import { randomUUID } from "node:crypto";

import WebSocket from "ws";

import { createSubsystemLogger } from "../logging.js";

const log = createSubsystemLogger("voice");

// ─── Types ───────────────────────────────────────────────────────────────────

export type VoiceSessionState =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";

export type VoiceSessionConfig = {
  voiceId: string;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  interruptOnSpeech: boolean;
  agentId?: string;
  outputFormat?: string;
  maxDurationMs?: number;
};

export type VoiceSessionEvents = {
  onStateChange: (state: VoiceSessionState) => void;
  onTranscript: (text: string, speaker: "user" | "agent") => void;
  onAudioChunk: (chunk: Buffer) => void;
  onError: (error: string) => void;
  onEnd: (summary: VoiceSessionSummary) => void;
};

export type VoiceSessionSummary = {
  durationMs: number;
  transcript: Array<{ speaker: "user" | "agent"; text: string; ts: number }>;
};

// ─── VoiceSession ────────────────────────────────────────────────────────────

export class VoiceSession {
  readonly id: string;
  readonly sessionKey: string;
  private _state: VoiceSessionState = "connecting";
  private config: VoiceSessionConfig;
  private events: VoiceSessionEvents;
  private startedAtMs: number;
  private transcript: Array<{
    speaker: "user" | "agent";
    text: string;
    ts: number;
  }> = [];
  private ws: WebSocket | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sessionKey: string,
    config: VoiceSessionConfig,
    events: VoiceSessionEvents,
  ) {
    this.id = randomUUID();
    this.sessionKey = sessionKey;
    this.config = config;
    this.events = events;
    this.startedAtMs = Date.now();
  }

  get state(): VoiceSessionState {
    return this._state;
  }

  private setState(state: VoiceSessionState): void {
    this._state = state;
    this.events.onStateChange(state);
  }

  /**
   * Start the ElevenLabs Conversational AI WebSocket connection.
   */
  async start(): Promise<void> {
    this.setState("connecting");

    const url = this.config.agentId
      ? `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.config.agentId}`
      : "wss://api.elevenlabs.io/v1/convai/conversation";

    log.info(`Starting voice session ${this.id} for ${this.sessionKey}`);

    try {
      this.ws = new WebSocket(url, {
        headers: {
          "xi-api-key": this.config.apiKey,
        },
      });

      this.ws.on("open", () => {
        // Send initial configuration
        const initMessage = {
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            agent: {
              prompt: {
                prompt: this.config.systemPrompt,
              },
              first_message:
                "Hello! I'm here — what would you like to talk about?",
            },
            tts: {
              voice_id: this.config.voiceId,
              model_id: this.config.modelId,
              output_format: this.config.outputFormat ?? "pcm_16000",
            },
          },
        };
        this.ws?.send(JSON.stringify(initMessage));
        this.setState("listening");
      });

      this.ws.on("message", (data) => {
        const text = Buffer.isBuffer(data)
          ? data.toString("utf8")
          : typeof data === "string"
            ? data
            : String(data);
        this.handleMessage(text);
      });

      this.ws.on("close", () => {
        this.handleClose();
      });

      this.ws.on("error", (err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`Voice session ${this.id} error: ${errMsg}`);
        this.events.onError(errMsg);
      });

      // Max duration safety timer
      const maxMs = this.config.maxDurationMs ?? 1_800_000; // 30 min
      this.maxDurationTimer = setTimeout(() => {
        log.warn(`Voice session ${this.id} reached max duration (${maxMs}ms)`);
        void this.end();
      }, maxMs);
    } catch (err) {
      const errMsg = String(err);
      log.error(`Failed to start voice session: ${errMsg}`);
      this.events.onError(errMsg);
      this.setState("ended");
    }
  }

  /**
   * Feed audio from the client to ElevenLabs.
   */
  feedAudio(chunk: Buffer): void {
    if (this._state === "ended" || !this.ws) return;
    // Send as base64-encoded audio
    const audioMessage = {
      user_audio_chunk: chunk.toString("base64"),
    };
    this.ws.send(JSON.stringify(audioMessage));
  }

  /**
   * Interrupt the current agent speech (user started talking).
   */
  interrupt(): void {
    if (this._state === "speaking" && this.config.interruptOnSpeech) {
      this.ws?.send(JSON.stringify({ type: "interrupt" }));
      this.setState("listening");
    }
  }

  /**
   * End the voice session.
   */
  async end(): Promise<VoiceSessionSummary> {
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }

    if (this.ws && this._state !== "ended") {
      this.ws.close();
    }

    this.setState("ended");

    const summary: VoiceSessionSummary = {
      durationMs: Date.now() - this.startedAtMs,
      transcript: [...this.transcript],
    };

    // Remove from active sessions
    activeSessions.delete(this.sessionKey);

    log.info(
      `Voice session ${this.id} ended (duration=${summary.durationMs}ms, turns=${summary.transcript.length})`,
    );

    this.events.onEnd(summary);
    return summary;
  }

  // ── Internal Message Handling ────────────────────────────────────────────

  private handleMessage(data: unknown): void {
    try {
      const raw = typeof data === "string" ? data : String(data);
      const msg = JSON.parse(raw) as Record<string, unknown>;

      switch (msg.type) {
        case "audio": {
          // Agent is speaking — forward audio to client
          if (this._state !== "speaking") this.setState("speaking");
          const audioData = msg.audio as string | undefined;
          if (audioData) {
            this.events.onAudioChunk(Buffer.from(audioData, "base64"));
          }
          break;
        }

        case "agent_response": {
          // Agent text transcript
          const text = (msg.agent_response as string) ?? "";
          if (text) {
            this.transcript.push({
              speaker: "agent",
              text,
              ts: Date.now(),
            });
            this.events.onTranscript(text, "agent");
          }
          break;
        }

        case "user_transcript": {
          // User speech transcript
          const text = (msg.user_transcript as string) ?? "";
          if (text) {
            this.transcript.push({
              speaker: "user",
              text,
              ts: Date.now(),
            });
            this.events.onTranscript(text, "user");
            if (this._state === "speaking") {
              this.setState("listening");
            }
          }
          break;
        }

        case "agent_response_correction": {
          // Correction to a previous agent response — update last agent entry
          const corrected = (msg.agent_response as string) ?? "";
          const lastAgent = [...this.transcript]
            .reverse()
            .find((t) => t.speaker === "agent");
          if (lastAgent && corrected) {
            lastAgent.text = corrected;
          }
          break;
        }

        case "ping":
          // Keepalive — respond with pong
          this.ws?.send(JSON.stringify({ type: "pong" }));
          break;

        case "conversation_initiation_metadata":
          // Session metadata — log it
          log.info(
            `Voice session ${this.id} initialized (convId=${(msg.conversation_id as string) ?? "unknown"})`,
          );
          break;

        default:
          // Unknown message type — ignore
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }

  private handleClose(): void {
    if (this._state !== "ended") {
      void this.end();
    }
  }
}

// ─── Active Session Registry ─────────────────────────────────────────────────

const activeSessions = new Map<string, VoiceSession>();

export function getActiveVoiceSession(
  sessionKey: string,
): VoiceSession | undefined {
  return activeSessions.get(sessionKey);
}

export function setActiveVoiceSession(
  sessionKey: string,
  session: VoiceSession,
): void {
  activeSessions.set(sessionKey, session);
}

export function removeActiveVoiceSession(sessionKey: string): void {
  activeSessions.delete(sessionKey);
}

export function getAllActiveVoiceSessions(): VoiceSession[] {
  return Array.from(activeSessions.values());
}

// ─── Connection Mapping ──────────────────────────────────────────────────────
// Maps WebSocket connection IDs to their active voice session.

const connectionSessions = new Map<string, string>();

export function getActiveVoiceSessionForConnection(
  connId: string,
): VoiceSession | undefined {
  const sessionKey = connectionSessions.get(connId);
  return sessionKey ? activeSessions.get(sessionKey) : undefined;
}

export function setVoiceSessionForConnection(
  connId: string,
  sessionKey: string,
): void {
  connectionSessions.set(connId, sessionKey);
}

export function removeVoiceSessionForConnection(connId: string): void {
  connectionSessions.delete(connId);
}
