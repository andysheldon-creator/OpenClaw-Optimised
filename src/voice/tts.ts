/**
 * Text-to-Speech utility using ElevenLabs REST API.
 *
 * Used for Telegram/WhatsApp voice note responses where real-time
 * streaming isn't possible. Converts text to an audio buffer that
 * can be sent as a voice message.
 */

import { createSubsystemLogger } from "../logging.js";

const log = createSubsystemLogger("voice:tts");

export type TextToSpeechParams = {
  /** The text to convert to speech. */
  text: string;
  /** ElevenLabs voice ID. */
  voiceId: string;
  /** ElevenLabs API key. */
  apiKey: string;
  /** ElevenLabs model ID (default: "eleven_turbo_v2_5"). */
  modelId?: string;
  /** Output format (default: "mp3_44100_128"). */
  outputFormat?: string;
  /** Request timeout in ms (default: 30_000). */
  timeoutMs?: number;
};

/**
 * Convert text to speech using ElevenLabs TTS API.
 * Returns the audio data as a Buffer.
 */
export async function textToSpeech(
  params: TextToSpeechParams,
): Promise<Buffer> {
  const modelId = params.modelId ?? "eleven_turbo_v2_5";
  const outputFormat = params.outputFormat ?? "mp3_44100_128";
  const timeoutMs = params.timeoutMs ?? 30_000;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}?output_format=${outputFormat}`;

  log.info(
    `TTS: generating audio (voice=${params.voiceId}, model=${modelId}, text=${params.text.length} chars)`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": params.apiKey,
      },
      body: JSON.stringify({
        text: params.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${body.slice(0, 200)}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    log.info(`TTS: generated ${buffer.length} bytes of audio`);
    return buffer;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ElevenLabs TTS timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Check if ElevenLabs TTS is configured and available.
 */
export function isTtsConfigured(params: {
  voiceId?: string;
  apiKey?: string;
}): boolean {
  return Boolean(params.voiceId && params.apiKey);
}
