/**
 * RAG Retrieval Service
 *
 * Orchestrates the Retrieval Augmented Generation pipeline:
 * 1. Takes the current user message
 * 2. Embeds it into a vector
 * 3. Searches the vector store for relevant past conversation
 * 4. Assembles a context block that can be prepended to the conversation
 *
 * This replaces the simple "last N messages" windowing with intelligent
 * semantic retrieval, allowing the bot to recall relevant context from
 * any point in the conversation history, not just the most recent turns.
 *
 * The system uses a hybrid approach:
 * - Always includes the last few messages (recency window) for coherence
 * - Retrieves semantically similar messages from the full history via RAG
 * - Deduplicates to avoid sending the same message twice
 * - Assembles into a clean context block
 *
 * Configuration:
 * - ENABLE_RAG: Enable/disable RAG (default: true)
 * - RAG_TOP_K: Number of retrieved results (default: 10)
 * - RAG_MIN_SCORE: Minimum similarity threshold (default: 0.35)
 * - RAG_RECENCY_WINDOW: Recent messages always included (default: 4)
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { defaultRuntime } from "../runtime.js";
import { embed } from "./embedding.js";
import { searchSimilar } from "./vector-store.js";

/** RAG configuration from environment. */
const ENABLE_RAG = process.env.ENABLE_RAG !== "false";
const RAG_TOP_K = Number.parseInt(process.env.RAG_TOP_K ?? "", 10) || 10;
const RAG_MIN_SCORE =
  Number.parseFloat(process.env.RAG_MIN_SCORE ?? "") || 0.35;
const RAG_RECENCY_WINDOW =
  Number.parseInt(process.env.RAG_RECENCY_WINDOW ?? "", 10) || 4;

/** Result of a RAG retrieval operation. */
export type RagResult = {
  /** Whether RAG was used (false if disabled or insufficient data). */
  used: boolean;
  /** Number of retrieved relevant messages. */
  retrievedCount: number;
  /** The assembled context messages (recency + retrieved, deduplicated). */
  contextMessages: AgentMessage[];
  /** Time taken in ms. */
  durationMs: number;
  /** Debug info about retrieval scores. */
  debug?: {
    topScores: number[];
    recencyCount: number;
    ragCount: number;
  };
};

/**
 * Extract text content from an AgentMessage for embedding.
 * Safely handles union types (AgentMessage may include BashExecutionMessage etc.)
 */
function extractMessageText(msg: AgentMessage): string {
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
 * Perform RAG retrieval for a conversation.
 *
 * Takes the current message and full session history, returns an optimized
 * set of context messages combining:
 * 1. Recent messages (always included for conversational coherence)
 * 2. Semantically relevant older messages (retrieved via embedding search)
 *
 * @param params.currentMessage - The latest user message text
 * @param params.sessionId - The session to search within
 * @param params.fullHistory - The complete session message history
 * @param params.maxHistoryWindow - The original window size (fallback)
 * @param params.ragTopK - Override for number of RAG results
 * @param params.ragMinScore - Override for minimum similarity
 * @param params.ragRecencyWindow - Override for recency window size
 */
export async function retrieveContext(params: {
  currentMessage: string;
  sessionId: string;
  fullHistory: AgentMessage[];
  maxHistoryWindow?: number;
  ragTopK?: number;
  ragMinScore?: number;
  ragRecencyWindow?: number;
}): Promise<RagResult> {
  const started = Date.now();
  const topK = params.ragTopK ?? RAG_TOP_K;
  const minScore = params.ragMinScore ?? RAG_MIN_SCORE;
  const recencyWindow = params.ragRecencyWindow ?? RAG_RECENCY_WINDOW;
  const maxWindow = params.maxHistoryWindow ?? 10;

  // If RAG is disabled, fall back to simple windowing
  if (!ENABLE_RAG) {
    const windowed =
      maxWindow > 0 && params.fullHistory.length > maxWindow
        ? params.fullHistory.slice(-maxWindow)
        : params.fullHistory;
    return {
      used: false,
      retrievedCount: 0,
      contextMessages: windowed,
      durationMs: Date.now() - started,
    };
  }

  // If history is small enough, no need for RAG
  if (params.fullHistory.length <= maxWindow) {
    return {
      used: false,
      retrievedCount: 0,
      contextMessages: params.fullHistory,
      durationMs: Date.now() - started,
    };
  }

  try {
    // Step 1: Always include the most recent messages for coherence
    const recentMessages = params.fullHistory.slice(-recencyWindow);
    const recentMessageIds = new Set(
      recentMessages.map(
        (_, idx) => params.fullHistory.length - recencyWindow + idx,
      ),
    );

    // Step 2: Embed the current query
    const queryEmbedding = await embed(params.currentMessage);

    // Step 3: Search the vector store for semantically similar messages
    const searchResults = await searchSimilar(
      params.sessionId,
      queryEmbedding,
      topK,
      minScore,
    );

    if (searchResults.length === 0) {
      // No relevant results found, fall back to simple windowing
      const windowed =
        maxWindow > 0 && params.fullHistory.length > maxWindow
          ? params.fullHistory.slice(-maxWindow)
          : params.fullHistory;
      return {
        used: false,
        retrievedCount: 0,
        contextMessages: windowed,
        durationMs: Date.now() - started,
        debug: {
          topScores: [],
          recencyCount: recentMessages.length,
          ragCount: 0,
        },
      };
    }

    // Step 4: Find matching messages in the full history by timestamp/content
    const retrievedMessages: AgentMessage[] = [];
    const retrievedTimestamps = new Set<string>();

    for (const result of searchResults) {
      const doc = result.document;
      // Find the matching message in full history
      for (let i = 0; i < params.fullHistory.length; i++) {
        if (recentMessageIds.has(i)) continue; // Skip recency window messages
        const msg = params.fullHistory[i];
        const msgText = extractMessageText(msg);
        // Match by content similarity (exact or near-exact match)
        if (
          msgText.trim() === doc.text.trim() ||
          msgText.includes(doc.text.slice(0, 100))
        ) {
          const key = `${i}-${msgText.slice(0, 50)}`;
          if (!retrievedTimestamps.has(key)) {
            retrievedTimestamps.add(key);
            retrievedMessages.push(msg);
          }
          break;
        }
      }
    }

    // Step 5: Assemble context = retrieved (sorted by position) + recent
    // Sort retrieved messages by their original position in history
    // to maintain conversational flow
    const retrievedWithPosition: Array<{
      msg: AgentMessage;
      pos: number;
    }> = [];
    for (const rMsg of retrievedMessages) {
      const rText = extractMessageText(rMsg);
      const pos = params.fullHistory.findIndex(
        (m) => extractMessageText(m).trim() === rText.trim(),
      );
      retrievedWithPosition.push({ msg: rMsg, pos: pos >= 0 ? pos : 0 });
    }
    retrievedWithPosition.sort((a, b) => a.pos - b.pos);

    // Limit total context to maxWindow to prevent cost explosion
    const maxRetrieved = Math.max(0, maxWindow - recencyWindow);
    const trimmedRetrieved = retrievedWithPosition
      .slice(0, maxRetrieved)
      .map((r) => r.msg);

    // Combine: retrieved context + recent messages
    const contextMessages = [...trimmedRetrieved, ...recentMessages];

    const topScores = searchResults.map((r) => r.score);

    defaultRuntime.log?.(
      `[rag-retrieval] session=${params.sessionId} | retrieved=${retrievedMessages.length} used=${trimmedRetrieved.length} | ` +
        `recent=${recentMessages.length} total=${contextMessages.length}/${params.fullHistory.length} | ` +
        `top_scores=[${topScores
          .slice(0, 3)
          .map((s) => s.toFixed(3))
          .join(",")}] | ` +
        `duration=${Date.now() - started}ms`,
    );

    return {
      used: true,
      retrievedCount: trimmedRetrieved.length,
      contextMessages,
      durationMs: Date.now() - started,
      debug: {
        topScores,
        recencyCount: recentMessages.length,
        ragCount: trimmedRetrieved.length,
      },
    };
  } catch (err) {
    // RAG failure should never break the main flow
    defaultRuntime.log?.(
      `[rag-retrieval] failed, falling back to windowing: ${String(err)}`,
    );

    const windowed =
      maxWindow > 0 && params.fullHistory.length > maxWindow
        ? params.fullHistory.slice(-maxWindow)
        : params.fullHistory;

    return {
      used: false,
      retrievedCount: 0,
      contextMessages: windowed,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Check if RAG is enabled.
 */
export function isRagEnabled(): boolean {
  return ENABLE_RAG;
}
