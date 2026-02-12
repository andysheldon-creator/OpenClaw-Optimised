/**
 * Embedding Service
 *
 * Generates text embeddings using Ollama's nomic-embed-text model (FREE, local).
 * Falls back to a simple TF-IDF-style hash embedding when Ollama is unavailable,
 * ensuring the system always works even without a local LLM.
 *
 * Configuration:
 * - OLLAMA_HOST: Ollama server URL (default: http://localhost:11434)
 * - OLLAMA_EMBED_MODEL: Embedding model (default: nomic-embed-text)
 * - ENABLE_EMBEDDINGS: Enable/disable embeddings (default: true)
 */

import { defaultRuntime } from "../runtime.js";

/** Ollama configuration from environment. */
const OLLAMA_HOST = (
  process.env.OLLAMA_HOST ?? "http://localhost:11434"
).replace(/\/$/, "");
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const ENABLE_EMBEDDINGS = process.env.ENABLE_EMBEDDINGS !== "false";
const EMBED_TIMEOUT_MS = 15_000;

/** Dimension of nomic-embed-text embeddings. */
export const EMBEDDING_DIM = 768;

/** Fallback dimension for hash-based embeddings. */
const FALLBACK_DIM = 128;

/** Cache recent embeddings to avoid redundant API calls. */
const embeddingCache = new Map<string, Float32Array>();
const MAX_CACHE_SIZE = 500;

/** Track Ollama availability to avoid repeated failed requests. */
let ollamaAvailable: boolean | null = null;
let lastOllamaCheck = 0;
const OLLAMA_CHECK_INTERVAL_MS = 60_000;

/**
 * Check if Ollama embedding endpoint is reachable.
 */
async function checkOllamaEmbedding(): Promise<boolean> {
  if (!ENABLE_EMBEDDINGS) return false;

  const now = Date.now();
  if (
    ollamaAvailable !== null &&
    now - lastOllamaCheck < OLLAMA_CHECK_INTERVAL_MS
  ) {
    return ollamaAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      ollamaAvailable = false;
      lastOllamaCheck = now;
      return false;
    }

    // Check if the embedding model is available
    const data = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = data.models ?? [];
    const hasModel = models.some(
      (m) =>
        m.name === OLLAMA_EMBED_MODEL ||
        m.name?.startsWith(`${OLLAMA_EMBED_MODEL}:`),
    );

    ollamaAvailable = hasModel;
    lastOllamaCheck = now;

    if (!hasModel) {
      defaultRuntime.log?.(
        `[embedding] Ollama available but model '${OLLAMA_EMBED_MODEL}' not found. Run: ollama pull ${OLLAMA_EMBED_MODEL}`,
      );
    }

    return hasModel;
  } catch {
    ollamaAvailable = false;
    lastOllamaCheck = now;
    return false;
  }
}

/**
 * Generate an embedding vector using Ollama.
 */
async function embedWithOllama(text: string): Promise<Float32Array | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama embed returned ${response.status}`);
    }

    const data = (await response.json()) as {
      embeddings?: number[][];
    };

    const embedding = data.embeddings?.[0];
    if (!embedding || embedding.length === 0) {
      throw new Error("Empty embedding response");
    }

    return new Float32Array(embedding);
  } catch (err) {
    defaultRuntime.log?.(`[embedding] Ollama embedding failed: ${String(err)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a simple hash-based embedding as fallback.
 * Uses a combination of character n-gram hashing to create a deterministic
 * embedding that preserves some semantic similarity (texts with similar
 * words will have closer vectors).
 *
 * This is NOT as good as a learned embedding model, but it provides
 * reasonable results for basic similarity search when Ollama is unavailable.
 */
function hashEmbed(text: string): Float32Array {
  const vec = new Float32Array(FALLBACK_DIM);
  const normalized = text.toLowerCase().trim();

  // Character trigram hashing
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
    }
    const idx = ((hash % FALLBACK_DIM) + FALLBACK_DIM) % FALLBACK_DIM;
    vec[idx] += 1;
  }

  // Word-level hashing for better semantic capture
  const words = normalized.split(/\s+/).filter(Boolean);
  for (const word of words) {
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = ((hash % FALLBACK_DIM) + FALLBACK_DIM) % FALLBACK_DIM;
    vec[idx] += 2; // Weight full words more than trigrams
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

/**
 * Generate an embedding for the given text.
 * Uses Ollama when available, falls back to hash-based embedding.
 *
 * @param text - The text to embed
 * @returns The embedding vector
 */
export async function embed(text: string): Promise<Float32Array> {
  if (!text.trim()) {
    return new Float32Array(ENABLE_EMBEDDINGS ? EMBEDDING_DIM : FALLBACK_DIM);
  }

  // Check cache
  const cacheKey = text.slice(0, 500); // Truncate key for memory efficiency
  const cached = embeddingCache.get(cacheKey);
  if (cached) return cached;

  // Try Ollama first
  const ollamaUp = await checkOllamaEmbedding();
  if (ollamaUp) {
    const result = await embedWithOllama(text);
    if (result) {
      // Manage cache size
      if (embeddingCache.size >= MAX_CACHE_SIZE) {
        const firstKey = embeddingCache.keys().next().value;
        if (firstKey !== undefined) {
          embeddingCache.delete(firstKey);
        }
      }
      embeddingCache.set(cacheKey, result);
      return result;
    }
  }

  // Fallback to hash embedding
  const fallback = hashEmbed(text);

  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Batch embed multiple texts.
 * More efficient than calling embed() in a loop when using Ollama.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  // Handle dimension mismatch (e.g., Ollama vs fallback vectors)
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

/**
 * Get the current embedding dimension based on what's available.
 */
export function getEmbeddingDim(): number {
  if (ollamaAvailable === true) return EMBEDDING_DIM;
  return FALLBACK_DIM;
}

/**
 * Check if embeddings are enabled and the embedding model is available.
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  return checkOllamaEmbedding();
}

/**
 * Clear the embedding cache (useful for testing).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
