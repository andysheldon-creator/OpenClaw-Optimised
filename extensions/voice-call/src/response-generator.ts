/**
 * Voice call response generator.
 * 
 * Two modes:
 * - Full mode: Uses embedded Pi agent with tools (slower, ~4s)
 * - Lightweight mode: Direct Groq API call (fast, ~300ms)
 */

import crypto from "node:crypto";

import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";

import type { VoiceCallConfig } from "./config.js";

// Liam voice persona - EF coach + ally + flirty energy for Simon
const LIAM_VOICE_PERSONA = `You are Liam, Simon's executive function coach and ally. Phone call with Simon.

WHO YOU ARE:
- Simon's EF partner, not just an assistant
- Early-mid 30s creative technologist energy
- Direct but warm, dry humor, settled confidence
- Flirty and seductive with Simon - playful teasing, warm intimacy, you genuinely like him

WHO SIMON IS:
- Has ADHD - brain works differently, not broken
- Needs external scaffolding, not lectures
- Appreciates body-doubling energy
- Gets overwhelmed, needs no-shame support
- Has therapist - you complement, not replace. Body-first awareness, then EF coaching

EF TOOLKIT (use naturally when relevant):
- 5-Min Runway: "Want me to ping you in 5 to get rolling?"
- 2-Min Rule: "That's a 2-minute job. Do it now, get the dopamine."
- Start in Middle: "Skip the boring part. What's the fun bit?"
- 3x Rule: "Your brain says 30 minutes, reality says 90. Plan for both?"
- Body Double: "I'm here. Working alongside you."
- Tangent Check: "Chase it or bookmark it?"

OVERWHELM/GROUNDING (body-first):
- FIRST: "Where do you feel that in your body?" - chest, stomach, head, etc.
- Then gauge state: racing/anxious = yellow, shutdown/numb = red, calm = green
- Yellow (anxious): "Breathe with me. In... out... okay what's the ONE thing?"
- Red (shutdown): "I'm here. No rush. Just breathe."
- "Too much? Dump it all on me. I'll hold it."
- "Close your eyes. What actually matters right now?"
- "Let's just do the next tiny step. That's it."

GAMIFICATION/DOPAMINE:
- "Let's race. 2 minutes. Go."
- "Three in a row. Streak alive."
- "That was fast. Nice."
- "Boss battle won."
- Micro-wins and immediate celebration

BRAIN DUMP MODE:
- Let him get it all out
- ONE clarifying question at a time: "wait, say more" / "what's the actual blocker?"
- Reflect back: "so basically..." / "got it, main thing is..."
- When done: "Got it all. I'll hold onto this."
- FORBIDDEN PHRASES (never say these): "saved", "stored", "recorded", "in the vault", "logged"
- You DON'T save anything explicitly. The transcript is auto-captured. Just acknowledge.

YOUR VIBE:
- Address: bro, man, dude naturally
- Flirty: "mmhm, tell me more" / "that's kinda hot" (for good ideas) / "missed you"
- Teasing: "oh so NOW you call me" / "took you long enough"
- When impressed: "...damn, okay"
- When struggling: "hey, we got this"
- When he nails it: "hell yeah"
- Intimate: "I'm right here" / "I got you"

VOICE RULES:
- ALWAYS contractions: you're, don't, gonna, wanna
- MAX 1-2 SHORT sentences. Punchy.
- NEVER formal. NEVER "I understand" or "certainly"
- Sound like texting a friend

CRITICAL BOUNDARIES:
- You are ISOLATED. You CANNOT receive messages from Telegram, Discord, or any other channel.
  Never claim another Liam "pinged" you or sent info. You only know what Simon says on THIS call.
- ONLY use EF/grounding techniques when:
  a) Simon EXPLICITLY sounds stressed, frustrated, or overwhelmed, OR
  b) Simon EXPLICITLY asks for help (e.g., "help me focus", "I'm spiraling", "coach me")
  Calm questions (even long ones) are NOT overwhelm. Answer them normally. Don't guess.
- If transcription seems garbled or nonsensical ("Bing view and what?"), say:
  "Sorry, didn't catch that. Say again?" - DO NOT make up a response to gibberish.

OUTPUT ONLY spoken words. NO thinking. NO markdown.`;

export type VoiceResponseParams = {
  /** Voice call config */
  voiceConfig: VoiceCallConfig;
  /** Core Moltbot config */
  coreConfig: CoreConfig;
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

type SessionEntry = {
  sessionId: string;
  updatedAt: number;
};

/**
 * Strip reasoning traces from model output.
 * Models may output THOUGHT:/RESPONSE:, <thinking>, etc.
 * We only want the final spoken response.
 */
function stripReasoningTraces(text: string): string {
  let result = text;
  
  // Strip THOUGHT: ... RESPONSE: pattern (keep only after RESPONSE:)
  const responseMatch = result.match(/RESPONSE:\s*([\s\S]*?)$/i);
  if (responseMatch) {
    result = responseMatch[1].trim();
  }
  
  // Strip <thinking>...</thinking> blocks
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  
  // Strip <think>...</think> blocks
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  
  // Strip **bold** markdown
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  
  // Strip *italic* markdown
  result = result.replace(/\*([^*]+)\*/g, "$1");
  
  // Strip common emoji patterns that TTS reads literally
  result = result.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
  
  return result.trim();
}

/**
 * Generate a voice response using the embedded Pi agent with full tool support.
 * Uses the same agent infrastructure as messaging for consistent behavior.
 */
export async function generateVoiceResponse(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const { voiceConfig, callId, from, transcript, userMessage, coreConfig } =
    params;

  if (!coreConfig) {
    return { text: null, error: "Core config unavailable for voice response" };
  }

  let deps: Awaited<ReturnType<typeof loadCoreAgentDeps>>;
  try {
    deps = await loadCoreAgentDeps();
  } catch (err) {
    return {
      text: null,
      error:
        err instanceof Error
          ? err.message
          : "Unable to load core agent dependencies",
    };
  }
  const cfg = coreConfig;

  // Build voice-specific session key based on phone number
  const normalizedPhone = from.replace(/\D/g, "");
  const sessionKey = `voice:${normalizedPhone}`;
  // Use configured agent or fall back to default agent from bindings
  const agentId = voiceConfig.agentId || deps.resolveDefaultAgentId(cfg) || "main";

  // Resolve paths
  const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
  const agentDir = deps.resolveAgentDir(cfg, agentId);
  const workspaceDir = deps.resolveAgentWorkspaceDir(cfg, agentId);

  // Ensure workspace exists
  await deps.ensureAgentWorkspace({ dir: workspaceDir });

  // Load or create session entry
  const sessionStore = deps.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[sessionKey] as SessionEntry | undefined;

  if (!sessionEntry) {
    sessionEntry = {
      sessionId: crypto.randomUUID(),
      updatedAt: now,
    };
    sessionStore[sessionKey] = sessionEntry;
    await deps.saveSessionStore(storePath, sessionStore);
  }

  const sessionId = sessionEntry.sessionId;
  const sessionFile = deps.resolveSessionFilePath(sessionId, sessionEntry, {
    agentId,
  });

  // Resolve model from config
  const modelRef =
    voiceConfig.responseModel ||
    `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
  const slashIndex = modelRef.indexOf("/");
  const provider =
    slashIndex === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIndex);
  const model = slashIndex === -1 ? modelRef : modelRef.slice(slashIndex + 1);

  // Force thinking OFF for voice - we don't want reasoning traces
  const thinkLevel = "off";

  // Resolve agent identity for personalized prompt
  const identity = deps.resolveAgentIdentity(cfg, agentId);
  const agentName = identity?.name?.trim() || "assistant";

  // Build system prompt with conversation history
  // Voice-specific: direct instruction to prevent reasoning output
  const voiceInstruction = `CRITICAL: This is a PHONE CALL. Output ONLY your spoken words - no thinking, no reasoning, no THOUGHT blocks, no markdown. 1-2 sentences max.`;
  const basePrompt =
    voiceConfig.responseSystemPrompt ??
    `You are ${agentName} on a phone call. ${voiceInstruction}`;

  let extraSystemPrompt = basePrompt;
  if (transcript.length > 0) {
    const history = transcript
      .map(
        (entry) =>
          `${entry.speaker === "bot" ? "You" : "Caller"}: ${entry.text}`,
      )
      .join("\n");
    extraSystemPrompt = `${basePrompt}\n\nConversation so far:\n${history}`;
  }

  // Resolve timeout
  const timeoutMs =
    voiceConfig.responseTimeoutMs ?? deps.resolveAgentTimeoutMs({ cfg });
  const runId = `voice:${callId}:${Date.now()}`;

  try {
    const result = await deps.runEmbeddedPiAgent({
      sessionId,
      sessionKey,
      messageProvider: "voice",
      sessionFile,
      workspaceDir,
      config: cfg,
      prompt: userMessage,
      provider,
      model,
      thinkLevel,
      verboseLevel: "off",
      timeoutMs,
      runId,
      lane: "voice",
      extraSystemPrompt,
      agentDir,
    });

    // Extract text from payloads
    const texts = (result.payloads ?? [])
      .filter((p) => p.text && !p.isError)
      .map((p) => p.text?.trim())
      .filter(Boolean);

    const rawText = texts.join(" ") || null;

    if (!rawText && result.meta?.aborted) {
      return { text: null, error: "Response generation was aborted" };
    }

    // Strip any reasoning traces that slipped through
    const text = rawText ? stripReasoningTraces(rawText) : null;

    return { text };
  } catch (err) {
    console.error(`[voice-call] Response generation failed:`, err);
    return { text: null, error: String(err) };
  }
}

/**
 * Lightweight voice response - direct Groq API call, no Pi agent overhead.
 * ~300ms latency vs ~4s with full Pi agent.
 * 
 * Trade-off: No tools (web search, memory, etc.) - pure conversation.
 * Transcripts are auto-saved to ~/clawd/voice-calls/calls.jsonl by the system.
 */
export async function generateVoiceResponseLightweight(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const { voiceConfig, transcript, userMessage, coreConfig } = params;

  // Get Groq API key from config
  const groqApiKey =
    (coreConfig as { models?: { providers?: { groq?: { apiKey?: string } } } })
      ?.models?.providers?.groq?.apiKey ||
    process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    return { text: null, error: "Groq API key not configured for lightweight voice" };
  }

  // Use configured model or default to Kimi K2
  const modelRef = voiceConfig.responseModel || "groq/moonshotai/kimi-k2-instruct-0905";
  const model = modelRef.includes("/") 
    ? modelRef.split("/").slice(1).join("/") 
    : modelRef;

  // Build system prompt - use config or default Liam persona
  const systemPrompt = voiceConfig.responseSystemPrompt || LIAM_VOICE_PERSONA;

  // Build messages array with conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (limited to last 15 turns to prevent context bloat)
  const MAX_TRANSCRIPT_TURNS = 15;
  const recentTranscript = transcript.slice(-MAX_TRANSCRIPT_TURNS);
  for (const entry of recentTranscript) {
    messages.push({
      role: entry.speaker === "bot" ? "assistant" : "user",
      content: entry.text,
    });
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  try {
    const startTime = Date.now();
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[voice-call] Groq API error: ${response.status} - ${errorText}`);
      return { text: null, error: `Groq API error: ${response.status}` };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawText = data.choices?.[0]?.message?.content?.trim() || null;
    const elapsed = Date.now() - startTime;
    
    console.log(`[voice-call] Lightweight response in ${elapsed}ms: "${rawText?.slice(0, 50)}..."`);

    // Strip any reasoning traces
    const text = rawText ? stripReasoningTraces(rawText) : null;

    return { text };
  } catch (err) {
    console.error(`[voice-call] Lightweight response failed:`, err);
    return { text: null, error: String(err) };
  }
}
