/**
 * Embeddings Module - Distilled from OpenClaw
 *
 * Converts text into vector representations for semantic search.
 * Multiple providers behind a single interface.
 *
 * Design principles:
 * - Interface over implementation: Provider interface is the contract
 * - Fail clearly: API errors surface as exceptions, not silent fallbacks
 * - Respect boundaries: Embedding only; no caching, batching, or fallback logic
 * - Explicit state: Providers are stateless; config is explicit
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * A provider that converts text into vector embeddings.
 *
 * Implementations handle the specifics of each embedding API (OpenAI, Gemini, etc.)
 * but expose a uniform interface for consumers.
 */
export interface EmbeddingProvider {
  /** Convert a single text into a vector embedding */
  embed(text: string): Promise<number[]>;

  /** Convert multiple texts into embeddings (more efficient than individual calls) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** The dimensionality of vectors produced by this provider */
  readonly dimensions: number;

  /** Human-readable provider name for logging/debugging */
  readonly name: string;

  /** Model identifier being used */
  readonly model: string;
}

/**
 * Configuration for creating an embedding provider.
 */
export interface ProviderConfig {
  /** API key for authentication */
  apiKey: string;

  /** Model to use (provider-specific defaults if omitted) */
  model?: string;

  /** Base URL override for API endpoint */
  baseUrl?: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Result from an embedding API call.
 * Used internally by providers.
 */
export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Base error for embedding operations.
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Error when API request fails (network, auth, rate limit, etc.).
 */
export class EmbeddingAPIError extends EmbeddingError {
  constructor(
    message: string,
    provider: string,
    public readonly status?: number,
    public readonly code?: string,
    cause?: Error
  ) {
    super(message, provider, cause);
    this.name = "EmbeddingAPIError";
  }
}

/**
 * Error when input is invalid (empty text, too long, etc.).
 */
export class EmbeddingInputError extends EmbeddingError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = "EmbeddingInputError";
  }
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT = 30_000;

/** OpenAI embedding models and their dimensions */
export const OPENAI_MODELS = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
} as const;

/** Default OpenAI model */
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";

/** OpenAI API base URL */
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Maximum texts per OpenAI batch request */
const OPENAI_MAX_BATCH_SIZE = 2048;

// -----------------------------------------------------------------------------
// OpenAI Provider
// -----------------------------------------------------------------------------

/**
 * Create an OpenAI embedding provider.
 *
 * Supports text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002.
 */
export function createOpenAIProvider(config: ProviderConfig): EmbeddingProvider {
  const model = config.model || DEFAULT_OPENAI_MODEL;
  const baseUrl = config.baseUrl || OPENAI_BASE_URL;
  const timeout = config.timeout || DEFAULT_TIMEOUT;

  // Validate model
  const dimensions = OPENAI_MODELS[model as keyof typeof OPENAI_MODELS];
  if (!dimensions) {
    throw new EmbeddingInputError(
      `Unknown OpenAI model: ${model}. Supported: ${Object.keys(OPENAI_MODELS).join(", ")}`,
      "openai"
    );
  }

  // Validate API key
  if (!config.apiKey || config.apiKey.trim() === "") {
    throw new EmbeddingInputError("API key is required", "openai");
  }

  async function callAPI(texts: string[]): Promise<EmbeddingResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        let errorMessage = `API request failed with status ${response.status}`;
        let errorCode: string | undefined;

        try {
          const parsed = JSON.parse(errorBody);
          if (parsed.error?.message) {
            errorMessage = parsed.error.message;
            errorCode = parsed.error.code;
          }
        } catch {
          // Use default message
        }

        throw new EmbeddingAPIError(
          errorMessage,
          "openai",
          response.status,
          errorCode
        );
      }

      const data = await response.json();

      // OpenAI returns embeddings sorted by index, but we sort explicitly
      const sorted = [...data.data].sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index
      );

      return {
        embeddings: sorted.map((item: { embedding: number[] }) => item.embedding),
        model: data.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new EmbeddingAPIError(
          `Request timed out after ${timeout}ms`,
          "openai",
          undefined,
          "timeout",
          error
        );
      }

      throw new EmbeddingAPIError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        "openai",
        undefined,
        "network",
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    name: "openai",
    model,
    dimensions,

    async embed(text: string): Promise<number[]> {
      if (!text || text.trim() === "") {
        throw new EmbeddingInputError("Text cannot be empty", "openai");
      }

      const response = await callAPI([text]);
      return response.embeddings[0];
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      // Validate all texts
      for (let i = 0; i < texts.length; i++) {
        if (!texts[i] || texts[i].trim() === "") {
          throw new EmbeddingInputError(
            `Text at index ${i} cannot be empty`,
            "openai"
          );
        }
      }

      // Process in chunks if needed
      if (texts.length <= OPENAI_MAX_BATCH_SIZE) {
        const response = await callAPI(texts);
        return response.embeddings;
      }

      // Chunk large batches
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += OPENAI_MAX_BATCH_SIZE) {
        const chunk = texts.slice(i, i + OPENAI_MAX_BATCH_SIZE);
        const response = await callAPI(chunk);
        results.push(...response.embeddings);
      }

      return results;
    },
  };
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 *
 * Returns a value between -1 and 1, where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Normalize a vector to unit length.
 *
 * Unit vectors are useful for cosine similarity (dot product = cosine).
 */
export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));

  if (norm === 0) {
    return vector.slice(); // Return copy of zero vector
  }

  return vector.map((v) => v / norm);
}

/**
 * Compute Euclidean distance between two vectors.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}
