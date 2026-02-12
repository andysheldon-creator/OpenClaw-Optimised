/**
 * Vector Store Service
 *
 * A lightweight, file-based vector store for conversation embeddings.
 * Uses JSONL files for storage and brute-force cosine similarity search.
 *
 * Design decisions:
 * - JSONL format: consistent with cost-log.jsonl pattern, appendable, human-readable
 * - Brute-force search: fast enough for typical conversation volumes (< 50k entries)
 * - In-memory index: loaded on first access, kept in sync with file
 * - Per-session collections: each session has its own JSONL file
 * - No native dependencies: works on any platform without compilation
 *
 * Storage location: ~/.clawdis/rag/<sessionId>.jsonl
 */

import fs from "node:fs";
import path from "node:path";

import { cosineSimilarity } from "./embedding.js";

/** A stored document with its embedding vector. */
export type VectorDocument = {
  /** Unique document ID. */
  id: string;
  /** The original text content. */
  text: string;
  /** The embedding vector (stored as number[]). */
  embedding: number[];
  /** Message role (user/assistant). */
  role: "user" | "assistant";
  /** Timestamp when the document was stored. */
  timestamp: number;
  /** Session ID this document belongs to. */
  sessionId: string;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
};

/** Search result with similarity score. */
export type SearchResult = {
  document: VectorDocument;
  score: number;
};

/** In-memory index for a single session. */
type SessionIndex = {
  documents: VectorDocument[];
  dirty: boolean;
  lastLoaded: number;
};

/** Global index cache (sessionId -> SessionIndex). */
const indexCache = new Map<string, SessionIndex>();

/** Maximum number of sessions to keep cached. */
const MAX_CACHED_SESSIONS = 20;

/**
 * Resolve the RAG storage directory.
 */
function resolveRagDir(): string {
  const stateDir =
    process.env.CLAWDIS_STATE_DIR ??
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".clawdis");
  return path.join(stateDir, "rag");
}

/**
 * Resolve the JSONL file path for a session.
 */
function resolveSessionPath(sessionId: string): string {
  return path.join(resolveRagDir(), `${sessionId}.jsonl`);
}

/**
 * Load the index for a session from disk.
 */
async function loadSessionIndex(sessionId: string): Promise<SessionIndex> {
  const cached = indexCache.get(sessionId);
  if (cached) return cached;

  const filePath = resolveSessionPath(sessionId);
  const documents: VectorDocument[] = [];

  if (fs.existsSync(filePath)) {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const doc = JSON.parse(line) as VectorDocument;
          documents.push(doc);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File doesn't exist or can't be read
    }
  }

  const index: SessionIndex = {
    documents,
    dirty: false,
    lastLoaded: Date.now(),
  };

  // Evict old cached sessions if needed
  if (indexCache.size >= MAX_CACHED_SESSIONS) {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, val] of indexCache) {
      if (val.lastLoaded < oldestTime) {
        oldestTime = val.lastLoaded;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      indexCache.delete(oldestKey);
    }
  }

  indexCache.set(sessionId, index);
  return index;
}

/**
 * Store a document in the vector store.
 *
 * @param doc - The document to store (must include embedding as number[])
 */
export async function storeDocument(doc: VectorDocument): Promise<void> {
  const dir = resolveRagDir();
  await fs.promises.mkdir(dir, { recursive: true });

  const index = await loadSessionIndex(doc.sessionId);

  // Check for duplicate IDs
  const existingIdx = index.documents.findIndex((d) => d.id === doc.id);
  if (existingIdx >= 0) {
    index.documents[existingIdx] = doc;
    index.dirty = true;
  } else {
    index.documents.push(doc);
  }

  // Append to JSONL file
  const filePath = resolveSessionPath(doc.sessionId);
  const line = `${JSON.stringify(doc)}\n`;
  await fs.promises.appendFile(filePath, line, "utf-8");
}

/**
 * Store multiple documents at once.
 */
export async function storeDocuments(docs: VectorDocument[]): Promise<void> {
  if (docs.length === 0) return;

  const dir = resolveRagDir();
  await fs.promises.mkdir(dir, { recursive: true });

  // Group by session
  const bySession = new Map<string, VectorDocument[]>();
  for (const doc of docs) {
    const existing = bySession.get(doc.sessionId) ?? [];
    existing.push(doc);
    bySession.set(doc.sessionId, existing);
  }

  for (const [sessionId, sessionDocs] of bySession) {
    const index = await loadSessionIndex(sessionId);
    const filePath = resolveSessionPath(sessionId);
    const lines: string[] = [];

    for (const doc of sessionDocs) {
      const existingIdx = index.documents.findIndex((d) => d.id === doc.id);
      if (existingIdx >= 0) {
        index.documents[existingIdx] = doc;
        index.dirty = true;
      } else {
        index.documents.push(doc);
      }
      lines.push(JSON.stringify(doc));
    }

    await fs.promises.appendFile(filePath, `${lines.join("\n")}\n`, "utf-8");
  }
}

/**
 * Search for the most similar documents to a query embedding.
 *
 * @param sessionId - The session to search within
 * @param queryEmbedding - The query embedding vector
 * @param topK - Maximum number of results to return (default: 5)
 * @param minScore - Minimum similarity score threshold (default: 0.3)
 * @returns Sorted array of search results (highest score first)
 */
export async function searchSimilar(
  sessionId: string,
  queryEmbedding: Float32Array,
  topK = 5,
  minScore = 0.3,
): Promise<SearchResult[]> {
  const index = await loadSessionIndex(sessionId);

  if (index.documents.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const doc of index.documents) {
    const docEmbedding = new Float32Array(doc.embedding);
    const score = cosineSimilarity(queryEmbedding, docEmbedding);

    if (score >= minScore) {
      results.push({ document: doc, score });
    }
  }

  // Sort by score (highest first)
  results.sort((a, b) => b.score - a.score);

  // Return top K
  return results.slice(0, topK);
}

/**
 * Search across ALL sessions (for cross-session recall).
 *
 * @param queryEmbedding - The query embedding vector
 * @param topK - Maximum number of results to return
 * @param minScore - Minimum similarity score threshold
 * @returns Sorted array of search results (highest score first)
 */
export async function searchAllSessions(
  queryEmbedding: Float32Array,
  topK = 10,
  minScore = 0.3,
): Promise<SearchResult[]> {
  const ragDir = resolveRagDir();
  if (!fs.existsSync(ragDir)) return [];

  const files = await fs.promises.readdir(ragDir);
  const sessionFiles = files.filter((f) => f.endsWith(".jsonl"));

  const allResults: SearchResult[] = [];

  for (const file of sessionFiles) {
    const sessionId = file.replace(".jsonl", "");
    const results = await searchSimilar(
      sessionId,
      queryEmbedding,
      topK,
      minScore,
    );
    allResults.push(...results);
  }

  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, topK);
}

/**
 * Get the total number of documents in a session's vector store.
 */
export async function getDocumentCount(sessionId: string): Promise<number> {
  const index = await loadSessionIndex(sessionId);
  return index.documents.length;
}

/**
 * Get all documents for a session (useful for debugging).
 */
export async function getAllDocuments(
  sessionId: string,
): Promise<VectorDocument[]> {
  const index = await loadSessionIndex(sessionId);
  return [...index.documents];
}

/**
 * Delete all RAG data for a session.
 */
export async function deleteSessionData(sessionId: string): Promise<void> {
  indexCache.delete(sessionId);
  const filePath = resolveSessionPath(sessionId);
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // File may not exist
  }
}

/**
 * Clear the in-memory index cache (useful for testing).
 */
export function clearIndexCache(): void {
  indexCache.clear();
}

/**
 * Compact a session's JSONL file by rewriting it without duplicates.
 * This is useful if the file has grown large due to updates.
 */
export async function compactSession(sessionId: string): Promise<void> {
  const index = await loadSessionIndex(sessionId);
  if (!index.dirty && index.documents.length === 0) return;

  const filePath = resolveSessionPath(sessionId);
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  // Deduplicate by ID (keep last)
  const seen = new Map<string, VectorDocument>();
  for (const doc of index.documents) {
    seen.set(doc.id, doc);
  }
  const deduped = [...seen.values()];

  // Rewrite file
  const lines = deduped.map((doc) => JSON.stringify(doc));
  await fs.promises.writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  // Update cache
  index.documents = deduped;
  index.dirty = false;
}
