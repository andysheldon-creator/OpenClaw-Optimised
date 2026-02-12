/**
 * RAG Ingestion Pipeline
 *
 * Handles storing conversation messages into the vector store for later
 * retrieval. This runs asynchronously after each agent turn to avoid
 * adding latency to the response path.
 *
 * Features:
 * - Extracts text from AgentMessage objects (handles text + content blocks)
 * - Embeds messages using the embedding service
 * - Stores in the vector store with metadata
 * - Deduplicates (won't re-embed messages already stored)
 * - Handles both user and assistant messages
 * - Runs in the background (fire-and-forget with error handling)
 *
 * Design: messages are ingested after each agent turn, not during.
 * This means the vector store is always one turn behind, which is
 * fine because we always include the most recent messages via the
 * recency window.
 */

import crypto from "node:crypto";

import type { AgentMessage } from "@mariozechner/pi-agent-core";

import { defaultRuntime } from "../runtime.js";
import { embed } from "./embedding.js";
import {
  getDocumentCount,
  storeDocument,
  type VectorDocument,
} from "./vector-store.js";

/** Track which messages have already been ingested (per session). */
const ingestedMessages = new Map<string, Set<string>>();

/** Maximum ingested message tracking entries per session. */
const MAX_TRACKED_PER_SESSION = 5000;

/** Minimum message length to bother embedding. */
const MIN_MESSAGE_LENGTH = 10;

/** Maximum text length to embed (longer texts are truncated). */
const MAX_EMBED_LENGTH = 2000;

/**
 * Extract text content from an AgentMessage.
 * Safely handles union types (AgentMessage may include BashExecutionMessage etc.)
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
 * Generate a stable ID for a message based on its content and role.
 */
function messageId(text: string, role: string): string {
  const content = `${role}:${text.slice(0, 500)}`;
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Get or create the ingested message set for a session.
 */
function getIngestedSet(sessionId: string): Set<string> {
  let set = ingestedMessages.get(sessionId);
  if (!set) {
    set = new Set();
    ingestedMessages.set(sessionId, set);
  }
  return set;
}

/**
 * Ingest a single message into the vector store.
 *
 * @param params.sessionId - Session this message belongs to
 * @param params.message - The message to ingest
 * @param params.timestamp - When the message was created (default: now)
 */
export async function ingestMessage(params: {
  sessionId: string;
  message: AgentMessage;
  timestamp?: number;
}): Promise<void> {
  const text = extractText(params.message);

  // Skip empty or very short messages
  if (text.trim().length < MIN_MESSAGE_LENGTH) return;

  const rawRole = (params.message as unknown as Record<string, unknown>).role;
  const role = rawRole === "user" ? ("user" as const) : ("assistant" as const);
  const id = messageId(text, role);
  const ingested = getIngestedSet(params.sessionId);

  // Skip already-ingested messages
  if (ingested.has(id)) return;

  // Truncate long texts for embedding
  const textToEmbed = text.slice(0, MAX_EMBED_LENGTH);

  try {
    const embedding = await embed(textToEmbed);

    const doc: VectorDocument = {
      id,
      text: textToEmbed,
      embedding: Array.from(embedding),
      role,
      timestamp: params.timestamp ?? Date.now(),
      sessionId: params.sessionId,
    };

    await storeDocument(doc);

    // Track as ingested
    ingested.add(id);

    // Evict old tracking entries if needed
    if (ingested.size > MAX_TRACKED_PER_SESSION) {
      const entries = [...ingested];
      const toRemove = entries.slice(
        0,
        entries.length - MAX_TRACKED_PER_SESSION,
      );
      for (const entry of toRemove) {
        ingested.delete(entry);
      }
    }
  } catch (err) {
    defaultRuntime.log?.(
      `[rag-ingest] failed to ingest message: ${String(err)}`,
    );
  }
}

/**
 * Ingest multiple messages from a conversation history.
 * Typically called after an agent turn to store both the user message
 * and the assistant response.
 *
 * @param params.sessionId - Session these messages belong to
 * @param params.messages - Messages to ingest
 */
export async function ingestMessages(params: {
  sessionId: string;
  messages: AgentMessage[];
}): Promise<void> {
  const { sessionId, messages } = params;
  let ingested = 0;

  for (const msg of messages) {
    try {
      await ingestMessage({
        sessionId,
        message: msg,
      });
      ingested++;
    } catch {
      // Continue with other messages
    }
  }

  if (ingested > 0) {
    defaultRuntime.log?.(
      `[rag-ingest] ingested ${ingested}/${messages.length} messages for session=${sessionId}`,
    );
  }
}

/**
 * Background ingest: fire-and-forget wrapper that won't throw.
 * Call this from the main response path to avoid blocking.
 */
export function backgroundIngest(params: {
  sessionId: string;
  messages: AgentMessage[];
}): void {
  void ingestMessages(params).catch((err) => {
    defaultRuntime.log?.(
      `[rag-ingest] background ingest failed: ${String(err)}`,
    );
  });
}

/**
 * Get ingestion stats for a session.
 */
export async function getIngestStats(sessionId: string): Promise<{
  trackedCount: number;
  storedCount: number;
}> {
  const tracked = ingestedMessages.get(sessionId)?.size ?? 0;
  const stored = await getDocumentCount(sessionId);
  return { trackedCount: tracked, storedCount: stored };
}

/**
 * Clear ingestion tracking for a session (e.g., on session reset).
 */
export function clearIngestTracking(sessionId: string): void {
  ingestedMessages.delete(sessionId);
}
