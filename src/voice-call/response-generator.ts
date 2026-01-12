/**
 * Voice call response generator using the agent system.
 * Routes through runEmbeddedPiAgent for consistent model handling.
 */

import crypto from "node:crypto";
import path from "node:path";

import { resolveClawdbotAgentDir } from "../agents/agent-paths.js";
import { resolveModelRefFromString } from "../agents/model-selection.js";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import { loadConfig } from "../config/config.js";
import { resolveConfigDir } from "../utils.js";

import type { VoiceCallConfig } from "./config.js";

export type VoiceResponseParams = {
  /** Voice call config */
  voiceConfig: VoiceCallConfig;
  /** Call ID for session tracking */
  callId: string;
  /** Caller's phone number */
  from: string;
  /** Conversation transcript */
  transcript: Array<{ speaker: "user" | "bot"; text: string }>;
  /** Latest user message */
  userMessage: string;
};

export type VoiceResponseResult = {
  text: string | null;
  error?: string;
};

const DEFAULT_VOICE_MODEL = "openai/gpt-4o-mini";
const DEFAULT_PROVIDER = "openai";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Generate a voice response using the agent system.
 * Supports any model provider (OpenAI, Anthropic, Google, local, etc.)
 */
export async function generateVoiceResponse(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const { voiceConfig, callId, from, transcript, userMessage } = params;

  const cfg = loadConfig();
  const agentDir = resolveClawdbotAgentDir();
  const configDir = resolveConfigDir();

  // Resolve model from config (e.g., "anthropic/claude-sonnet-4" or "openai/gpt-4o")
  const modelRef = voiceConfig.responseModel || DEFAULT_VOICE_MODEL;
  const resolved = resolveModelRefFromString({
    raw: modelRef,
    defaultProvider: DEFAULT_PROVIDER,
  });

  // Extract provider and model from resolved ref
  const provider = resolved?.ref.provider ?? DEFAULT_PROVIDER;
  const model = resolved?.ref.model ?? "gpt-4o-mini";

  // Build system prompt
  const systemPrompt =
    voiceConfig.responseSystemPrompt ??
    `You are Haki, a helpful voice assistant. Keep responses brief and conversational (1-2 sentences max). You're on a phone call, so be natural and friendly. The caller's phone number is ${from}.`;

  // Build conversation history as a prompt
  const historyText = transcript
    .map((entry) => {
      const role = entry.speaker === "bot" ? "Assistant" : "User";
      return `${role}: ${entry.text}`;
    })
    .join("\n");

  const prompt = historyText
    ? `${historyText}\n\nUser: ${userMessage}\n\nRespond briefly (1-2 sentences).`
    : `User: ${userMessage}\n\nRespond briefly (1-2 sentences).`;

  // Session setup for the agent runner
  const sessionId = `voice-call-${callId}`;
  const sessionFile = path.join(configDir, "voice-calls", `${sessionId}.jsonl`);
  const workspaceDir = path.join(configDir, "voice-calls", "workspace");
  const runId = crypto.randomUUID();

  try {
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionKey: `voice-call:${callId}`,
      sessionFile,
      workspaceDir,
      agentDir,
      config: cfg,
      prompt,
      provider,
      model,
      thinkLevel: "off", // Fast responses, no extended thinking
      timeoutMs: voiceConfig.responseTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      runId,
      lane: "voice-call",
      extraSystemPrompt: systemPrompt,
    });

    // Extract text from payloads
    const payloads = result.payloads ?? [];
    const text = payloads
      .map((p) => p.text?.trim())
      .filter(Boolean)
      .join(" ");

    return { text: text || null };
  } catch (err) {
    console.error(`[voice-call] Response generation failed:`, err);
    return { text: null, error: String(err) };
  }
}
