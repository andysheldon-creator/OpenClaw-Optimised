import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { VoiceSession } from "./voice-session.js";

interface AudioPipelineConfig {
  sttProvider: "groq" | "openai";
  ttsProvider: "elevenlabs" | "openai";
  sttApiKey?: string;
  ttsApiKey?: string;
  groqApiKey?: string;
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId?: string;
}

interface TranscriptionResult {
  text: string;
  confidence?: number;
}

interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

/**
 * Audio pipeline for voice conversations
 * Handles: Audio capture → STT → LLM processing → TTS → Audio playback
 */
export class AudioPipeline extends EventEmitter {
  private config: AudioPipelineConfig;
  private isProcessing = false;
  private audioBuffer: AudioChunk[] = [];
  private lastSpeechTime = 0;
  private silenceThresholdMs = 1500; // 1.5 seconds of silence to trigger processing

  constructor(config: AudioPipelineConfig) {
    super();
    this.config = config;
  }

  /**
   * Process incoming audio chunk (from user microphone)
   */
  async processAudioChunk(audioData: Buffer): Promise<void> {
    const chunk: AudioChunk = {
      data: audioData,
      timestamp: Date.now(),
    };

    this.audioBuffer.push(chunk);

    // Detect silence (no audio data for threshold period)
    const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;

    if (timeSinceLastSpeech > this.silenceThresholdMs && this.audioBuffer.length > 0) {
      // User finished speaking - process the buffered audio
      await this.processBufferedAudio();
    }

    this.lastSpeechTime = Date.now();
  }

  /**
   * Process buffered audio and transcribe
   */
  private async processBufferedAudio(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Combine audio chunks
      const combinedAudio = Buffer.concat(this.audioBuffer.map((c) => c.data));
      this.audioBuffer = [];

      // Transcribe audio to text
      const transcription = await this.transcribeAudio(combinedAudio);

      if (transcription.text.trim()) {
        // Emit transcription event
        this.emit("transcription", transcription.text);
      }
    } catch (error) {
      this.emit("error", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Transcribe audio using configured STT provider
   */
  private async transcribeAudio(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (this.config.sttProvider === "groq") {
      return await this.transcribeWithGroq(audioBuffer);
    } else {
      return await this.transcribeWithOpenAI(audioBuffer);
    }
  }

  /**
   * Transcribe with Groq Whisper API
   */
  private async transcribeWithGroq(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const apiKey = this.config.groqApiKey || this.config.sttApiKey;

    if (!apiKey) {
      throw new Error("Groq API key not configured");
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", "whisper-large-v3");
      formData.append("language", "en");
      formData.append("response_format", "json");

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        text: result.text || "",
        confidence: 1.0,
      };
    } catch (error) {
      throw new Error(`Groq transcription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Transcribe with OpenAI Whisper API
   */
  private async transcribeWithOpenAI(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const apiKey = this.config.sttApiKey;

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", "whisper-1");
      formData.append("language", "en");

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        text: result.text || "",
      };
    } catch (error) {
      throw new Error(`OpenAI transcription failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate speech from text using configured TTS provider
   */
  async generateSpeech(text: string): Promise<Buffer> {
    if (this.config.ttsProvider === "elevenlabs") {
      return await this.generateSpeechElevenLabs(text);
    } else {
      return await this.generateSpeechOpenAI(text);
    }
  }

  /**
   * Generate speech with ElevenLabs
   */
  private async generateSpeechElevenLabs(text: string): Promise<Buffer> {
    const apiKey = this.config.elevenlabsApiKey || this.config.ttsApiKey;
    const voiceId = this.config.elevenlabsVoiceId || "j57KDF72L6gxbLk4sOo5";
    const modelId = this.config.elevenlabsModelId || "eleven_turbo_v2_5";

    if (!apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              speed: 1.1,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`ElevenLabs TTS failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate speech with OpenAI
   */
  private async generateSpeechOpenAI(text: string): Promise<Buffer> {
    const apiKey = this.config.ttsApiKey;

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: "alloy",
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`OpenAI TTS failed: ${(error as Error).message}`);
    }
  }

  /**
   * Convert audio buffer to PCM format for Discord
   */
  static convertToPCM(inputBuffer: Buffer): Buffer {
    // This is a simplified version - in production you'd use FFmpeg or similar
    // For now, assume the input is already in a compatible format
    return inputBuffer;
  }

  /**
   * Reset audio buffer (useful when interrupted)
   */
  resetBuffer(): void {
    this.audioBuffer = [];
    this.isProcessing = false;
  }
}

/**
 * Voice conversation handler
 * Orchestrates the full voice interaction flow
 */
export class VoiceConversationHandler {
  private audioPipeline: AudioPipeline;
  private voiceSession: VoiceSession;
  private onTextCallback: (text: string) => Promise<string>;

  constructor(
    voiceSession: VoiceSession,
    pipelineConfig: AudioPipelineConfig,
    onTextCallback: (text: string) => Promise<string>,
  ) {
    this.voiceSession = voiceSession;
    this.audioPipeline = new AudioPipeline(pipelineConfig);
    this.onTextCallback = onTextCallback;

    this.setupPipelineHandlers();
  }

  private setupPipelineHandlers(): void {
    // Handle transcribed text
    this.audioPipeline.on("transcription", async (text: string) => {
      try {
        // Send text to LLM and get response
        const response = await this.onTextCallback(text);

        if (response.trim()) {
          // Generate speech from response
          const audioBuffer = await this.audioPipeline.generateSpeech(response);

          // Play audio in voice channel
          await this.voiceSession.playAudio(audioBuffer);
        }
      } catch (error) {
        console.error("Conversation handler error:", error);
        this.audioPipeline.emit("error", error);
      }
    });

    // Handle errors
    this.audioPipeline.on("error", (error: Error) => {
      console.error("Audio pipeline error:", error);
    });
  }

  /**
   * Process incoming audio from Discord voice connection
   */
  async handleAudioChunk(audioData: Buffer): Promise<void> {
    await this.audioPipeline.processAudioChunk(audioData);
  }

  /**
   * Interrupt current speech
   */
  interrupt(): void {
    this.voiceSession.stopAudio();
    this.audioPipeline.resetBuffer();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.audioPipeline.removeAllListeners();
  }
}
