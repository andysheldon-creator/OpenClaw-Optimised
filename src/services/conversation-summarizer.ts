/**
 * Conversation Summarizer Service (Week 4)
 *
 * Automatically compresses old conversation segments to reduce token counts.
 * Instead of sending full message history, this service:
 *
 * 1. Detects when conversation is getting long (beyond a threshold)
 * 2. Summarises older message groups into compact summaries
 * 3. Replaces the original messages with the summary
 * 4. Preserves recent messages in full for conversational coherence
 *
 * This works alongside RAG (Week 2) and tiered memory (Week 3) to
 * provide a multi-layered approach to context management.
 *
 * Configuration:
 * - SUMMARIZE_THRESHOLD: Messages before summarization kicks in (default: 15)
 * - SUMMARIZE_BATCH_SIZE: Messages to summarize at once (default: 8)
 * - SUMMARIZE_KEEP_RECENT: Recent messages to keep in full (default: 6)
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { defaultRuntime } from "../runtime.js";

// ─── Configuration ───────────────────────────────────────────────────────────

const ENABLE_SUMMARIZATION = process.env.ENABLE_SUMMARIZATION !== "false";

/** Messages threshold before summarization activates. */
const SUMMARIZE_THRESHOLD =
  Number.parseInt(process.env.SUMMARIZE_THRESHOLD ?? "", 10) || 15;

/** How many old messages to batch into one summary. */
const SUMMARIZE_BATCH_SIZE =
  Number.parseInt(process.env.SUMMARIZE_BATCH_SIZE ?? "", 10) || 8;

/** Recent messages to always keep in full (not summarized). */
const SUMMARIZE_KEEP_RECENT =
  Number.parseInt(process.env.SUMMARIZE_KEEP_RECENT ?? "", 10) || 6;

/** Maximum summary length in characters. */
const MAX_SUMMARY_LENGTH = 800;

/** Ollama configuration for summarization. */
const OLLAMA_HOST = (
  process.env.OLLAMA_HOST ?? "http://localhost:11434"
).replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of summarization. */
export type SummarizationResult = {
  /** Whether summarization was applied. */
  applied: boolean;
  /** Original message count. */
  originalCount: number;
  /** Message count after summarization. */
  resultCount: number;
  /** Number of messages summarized. */
  summarizedCount: number;
  /** The output messages (summaries + recent). */
  messages: AgentMessage[];
  /** Time taken in ms. */
  durationMs: number;
};

// ─── Text Extraction ─────────────────────────────────────────────────────────

/**
 * Extract text content from an AgentMessage.
 */
function extractText(msg: AgentMessage): string {
  const raw = msg as unknown as Record<string, unknown>;
  const content = raw.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as Record<string, unknown>).type === "text" &&
        "text" in block &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        texts.push((block as Record<string, unknown>).text as string);
      }
    }
    return texts.join(" ");
  }
  return "";
}

/**
 * Get the role from an AgentMessage.
 */
function extractRole(msg: AgentMessage): string {
  const raw = msg as unknown as Record<string, unknown>;
  return typeof raw.role === "string" ? raw.role : "unknown";
}

// ─── Local Summarization ─────────────────────────────────────────────────────

/**
 * Create a heuristic summary of a batch of messages (no LLM needed).
 * Extracts key information and condenses into a compact format.
 */
function heuristicSummarize(messages: AgentMessage[]): string {
  const parts: string[] = [];
  let userTopics: string[] = [];
  let assistantActions: string[] = [];

  for (const msg of messages) {
    const text = extractText(msg).trim();
    if (!text) continue;

    const role = extractRole(msg);

    if (role === "user") {
      // Extract the core of user messages (first sentence or first 100 chars)
      const firstSentence =
        text.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? text.slice(0, 100);
      userTopics.push(firstSentence.trim());
    } else if (role === "assistant") {
      // Extract the gist of assistant responses
      const firstSentence =
        text.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? text.slice(0, 100);
      assistantActions.push(firstSentence.trim());
    }
  }

  // Deduplicate and limit
  userTopics = [...new Set(userTopics)].slice(0, 4);
  assistantActions = [...new Set(assistantActions)].slice(0, 3);

  if (userTopics.length > 0) {
    parts.push(`User discussed: ${userTopics.join("; ")}`);
  }
  if (assistantActions.length > 0) {
    parts.push(`Assistant: ${assistantActions.join("; ")}`);
  }

  const summary = parts.join(". ");
  return summary.length > MAX_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 3)}...`
    : summary;
}

/**
 * Try to use Ollama for higher-quality summarization.
 * Falls back to heuristic if Ollama is unavailable.
 */
async function ollamaSummarize(messages: AgentMessage[]): Promise<string> {
  // Build a conversation excerpt for the summarizer
  const transcript: string[] = [];
  for (const msg of messages) {
    const role = extractRole(msg);
    const text = extractText(msg).slice(0, 200);
    if (text) {
      transcript.push(`${role}: ${text}`);
    }
  }

  const prompt = `Summarize this conversation excerpt in 2-3 sentences. Focus on key topics, decisions, and outcomes. Be concise.\n\n${transcript.join("\n")}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        system:
          "You are a conversation summarizer. Output ONLY the summary, nothing else. Keep it under 3 sentences.",
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 200,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { response?: string };
      const summary = data.response?.trim();
      if (summary && summary.length > 10) {
        return summary.length > MAX_SUMMARY_LENGTH
          ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 3)}...`
          : summary;
      }
    }
  } catch {
    // Fall through to heuristic
  }

  return heuristicSummarize(messages);
}

// ─── Summary Message Construction ────────────────────────────────────────────

/**
 * Create a summary AgentMessage that replaces a batch of messages.
 */
function createSummaryMessage(
  summaryText: string,
  originalCount: number,
): AgentMessage {
  return {
    role: "user",
    content: `[Conversation Summary — ${originalCount} earlier messages]\n${summaryText}`,
  } as unknown as AgentMessage;
}

// ─── Main Summarization Pipeline ─────────────────────────────────────────────

/**
 * Summarize a conversation's message history if it exceeds the threshold.
 *
 * Strategy:
 * 1. Keep the last SUMMARIZE_KEEP_RECENT messages in full
 * 2. Batch the older messages into groups of SUMMARIZE_BATCH_SIZE
 * 3. Summarize each batch into a compact summary message
 * 4. Return: [summary1, summary2, ...] + [recent messages]
 *
 * @param messages - Full conversation history
 * @returns Summarized messages or original if no summarization needed
 */
export async function summarizeConversation(
  messages: AgentMessage[],
): Promise<SummarizationResult> {
  const started = Date.now();

  // If disabled or below threshold, return original
  if (!ENABLE_SUMMARIZATION || messages.length <= SUMMARIZE_THRESHOLD) {
    return {
      applied: false,
      originalCount: messages.length,
      resultCount: messages.length,
      summarizedCount: 0,
      messages,
      durationMs: Date.now() - started,
    };
  }

  // Split into old (to summarize) and recent (to keep)
  const keepCount = Math.min(SUMMARIZE_KEEP_RECENT, messages.length);
  const oldMessages = messages.slice(0, messages.length - keepCount);
  const recentMessages = messages.slice(messages.length - keepCount);

  // If there are too few old messages to be worth summarizing
  if (oldMessages.length < SUMMARIZE_BATCH_SIZE) {
    return {
      applied: false,
      originalCount: messages.length,
      resultCount: messages.length,
      summarizedCount: 0,
      messages,
      durationMs: Date.now() - started,
    };
  }

  // Batch the old messages and summarize each batch
  const summaryMessages: AgentMessage[] = [];
  let summarizedCount = 0;

  for (let i = 0; i < oldMessages.length; i += SUMMARIZE_BATCH_SIZE) {
    const batch = oldMessages.slice(i, i + SUMMARIZE_BATCH_SIZE);

    try {
      const summary = await ollamaSummarize(batch);
      summaryMessages.push(createSummaryMessage(summary, batch.length));
      summarizedCount += batch.length;
    } catch (err) {
      defaultRuntime.log?.(
        `[summarizer] failed to summarize batch: ${String(err)}`,
      );
      // On failure, use heuristic fallback
      const summary = heuristicSummarize(batch);
      summaryMessages.push(createSummaryMessage(summary, batch.length));
      summarizedCount += batch.length;
    }
  }

  // Combine: summaries + recent messages
  const resultMessages = [...summaryMessages, ...recentMessages];

  const duration = Date.now() - started;
  defaultRuntime.log?.(
    `[summarizer] compressed ${messages.length} → ${resultMessages.length} messages ` +
      `(summarized=${summarizedCount} kept=${keepCount}) duration=${duration}ms`,
  );

  return {
    applied: true,
    originalCount: messages.length,
    resultCount: resultMessages.length,
    summarizedCount,
    messages: resultMessages,
    durationMs: duration,
  };
}

/**
 * Check if summarization is enabled.
 */
export function isSummarizationEnabled(): boolean {
  return ENABLE_SUMMARIZATION;
}
