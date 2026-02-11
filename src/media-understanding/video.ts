import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import type { MediaAttachmentCache } from "./attachments.js";
import type {
  AudioTranscriptionResult,
  MediaUnderstandingOutput,
  MediaUnderstandingProvider,
} from "./types.js";
import { requireApiKey, resolveApiKeyForProvider } from "../agents/model-auth.js";
import { runExec } from "../process/exec.js";
import {
  CLI_OUTPUT_MAX_BUFFER,
  DEFAULT_AUDIO_MODELS,
  DEFAULT_VIDEO_MAX_BASE64_BYTES,
} from "./defaults.js";
import { MediaUnderstandingSkipError } from "./errors.js";

export function estimateBase64Size(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export function resolveVideoMaxBase64Bytes(maxBytes: number): number {
  const expanded = Math.floor(maxBytes * (4 / 3));
  return Math.min(expanded, DEFAULT_VIDEO_MAX_BASE64_BYTES);
}

async function extractAndTranscribeVideoAudio(params: {
  provider: MediaUnderstandingProvider;
  providerId: string;
  cache: MediaAttachmentCache;
  attachmentIndex: number;
  maxBytes: number;
  maxChars?: number;
  timeoutMs: number;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  trimOutput: (text: string, maxChars?: number) => string;
}): Promise<MediaUnderstandingOutput> {
  const { provider, providerId, cache, attachmentIndex, maxBytes, maxChars, timeoutMs } = params;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-video-audio-"));
  const audioPath = path.join(tmpDir, "audio.mp3");
  const pathResult = await cache.getPath({ attachmentIndex, maxBytes, timeoutMs });
  try {
    await runExec(
      "ffmpeg",
      ["-i", pathResult.path, "-vn", "-acodec", "libmp3lame", "-y", audioPath],
      { timeoutMs, maxBuffer: CLI_OUTPUT_MAX_BUFFER },
    );
    const audioBuffer = await fs.readFile(audioPath);
    const model = params.model?.trim() || DEFAULT_AUDIO_MODELS[providerId] || params.model;
    const result: AudioTranscriptionResult = await provider.transcribeVideoAudio!({
      buffer: audioBuffer,
      fileName: "audio.mp3",
      mime: "audio/mpeg",
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model,
      timeoutMs,
    });
    return {
      kind: "video.transcription",
      attachmentIndex,
      text: params.trimOutput(result.text, maxChars),
      provider: providerId,
      model: result.model ?? model,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function describeVideoWithProvider(params: {
  provider: MediaUnderstandingProvider;
  providerId: string;
  cache: MediaAttachmentCache;
  attachmentIndex: number;
  maxBytes: number;
  maxChars?: number;
  timeoutMs: number;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  model?: string;
  prompt?: string;
  trimOutput: (text: string, maxChars?: number) => string;
}): Promise<MediaUnderstandingOutput> {
  const { provider, providerId, cache, attachmentIndex, maxBytes, maxChars, timeoutMs } = params;
  if (!provider.describeVideo) {
    throw new Error(`Video understanding provider "${providerId}" not available.`);
  }
  const media = await cache.getBuffer({ attachmentIndex, maxBytes, timeoutMs });
  const estimatedBase64Bytes = estimateBase64Size(media.size);
  const maxBase64Bytes = resolveVideoMaxBase64Bytes(maxBytes);
  if (estimatedBase64Bytes > maxBase64Bytes) {
    throw new MediaUnderstandingSkipError(
      "maxBytes",
      `Video attachment ${attachmentIndex + 1} base64 payload ${estimatedBase64Bytes} exceeds ${maxBase64Bytes}`,
    );
  }
  const result = await provider.describeVideo({
    buffer: media.buffer,
    fileName: media.fileName,
    mime: media.mime,
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    headers: params.headers,
    model: params.model,
    prompt: params.prompt,
    timeoutMs,
  });
  return {
    kind: "video.description",
    attachmentIndex,
    text: params.trimOutput(result.text, maxChars),
    provider: providerId,
    model: result.model ?? params.model,
  };
}

/**
 * Run a video provider entry — either audio transcription (via ffmpeg + Whisper)
 * or visual description, depending on the provider's capabilities.
 */
export async function runVideoProvider(params: {
  provider: MediaUnderstandingProvider;
  providerId: string;
  entry: MediaUnderstandingModelConfig;
  cfg: OpenClawConfig;
  cache: MediaAttachmentCache;
  attachmentIndex: number;
  agentDir?: string;
  maxBytes: number;
  maxChars?: number;
  timeoutMs: number;
  prompt?: string;
  config?: MediaUnderstandingConfig;
  trimOutput: (text: string, maxChars?: number) => string;
}): Promise<MediaUnderstandingOutput> {
  const { provider, providerId, entry, cfg } = params;
  const auth = await resolveApiKeyForProvider({
    provider: providerId,
    cfg,
    profileId: entry.profile,
    preferredProfile: entry.preferredProfile,
    agentDir: params.agentDir,
  });
  const apiKey = requireApiKey(auth, providerId);
  const providerConfig = cfg.models?.providers?.[providerId];

  if (provider.transcribeVideoAudio) {
    const baseUrl = entry.baseUrl ?? params.config?.baseUrl ?? providerConfig?.baseUrl;
    return extractAndTranscribeVideoAudio({
      provider,
      providerId,
      cache: params.cache,
      attachmentIndex: params.attachmentIndex,
      maxBytes: params.maxBytes,
      maxChars: params.maxChars,
      timeoutMs: params.timeoutMs,
      apiKey,
      baseUrl,
      model: entry.model,
      trimOutput: params.trimOutput,
    });
  }

  return describeVideoWithProvider({
    provider,
    providerId,
    cache: params.cache,
    attachmentIndex: params.attachmentIndex,
    maxBytes: params.maxBytes,
    maxChars: params.maxChars,
    timeoutMs: params.timeoutMs,
    apiKey,
    baseUrl: providerConfig?.baseUrl,
    headers: providerConfig?.headers,
    model: entry.model,
    prompt: params.prompt,
    trimOutput: params.trimOutput,
  });
}
