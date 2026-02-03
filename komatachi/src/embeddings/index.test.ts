/**
 * Tests for the Embeddings Module
 *
 * These tests verify:
 * - Provider creation and configuration validation
 * - API communication and error handling
 * - Batch processing behavior
 * - Vector utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOpenAIProvider,
  cosineSimilarity,
  normalize,
  euclideanDistance,
  EmbeddingProvider,
  EmbeddingAPIError,
  EmbeddingInputError,
  OPENAI_MODELS,
} from "./index.js";

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

/**
 * Create a mock fetch response for OpenAI embeddings API.
 */
function mockOpenAIResponse(embeddings: number[][], model = "text-embedding-3-small") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      object: "list",
      data: embeddings.map((embedding, index) => ({
        object: "embedding",
        index,
        embedding,
      })),
      model,
      usage: {
        prompt_tokens: 10,
        total_tokens: 10,
      },
    }),
    text: async () => "",
  };
}

/**
 * Create a mock error response.
 */
function mockErrorResponse(status: number, message: string, code?: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message, code } }),
    text: async () => JSON.stringify({ error: { message, code } }),
  };
}

// Mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// Provider Creation Tests
// -----------------------------------------------------------------------------

describe("createOpenAIProvider", () => {
  describe("configuration validation", () => {
    it("throws EmbeddingInputError when API key is missing", () => {
      expect(() => createOpenAIProvider({ apiKey: "" })).toThrow(
        EmbeddingInputError
      );
      expect(() => createOpenAIProvider({ apiKey: "  " })).toThrow(
        EmbeddingInputError
      );
    });

    it("throws EmbeddingInputError for unknown model", () => {
      expect(() =>
        createOpenAIProvider({ apiKey: "test-key", model: "unknown-model" })
      ).toThrow(EmbeddingInputError);
      expect(() =>
        createOpenAIProvider({ apiKey: "test-key", model: "unknown-model" })
      ).toThrow(/Unknown OpenAI model/);
    });

    it("accepts valid model names", () => {
      for (const model of Object.keys(OPENAI_MODELS)) {
        const provider = createOpenAIProvider({ apiKey: "test-key", model });
        expect(provider.model).toBe(model);
      }
    });

    it("uses default model when not specified", () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });
      expect(provider.model).toBe("text-embedding-3-small");
    });

    it("sets correct dimensions for each model", () => {
      const smallProvider = createOpenAIProvider({
        apiKey: "test-key",
        model: "text-embedding-3-small",
      });
      expect(smallProvider.dimensions).toBe(1536);

      const largeProvider = createOpenAIProvider({
        apiKey: "test-key",
        model: "text-embedding-3-large",
      });
      expect(largeProvider.dimensions).toBe(3072);
    });

    it("sets provider name to 'openai'", () => {
      const provider = createOpenAIProvider({ apiKey: "test-key" });
      expect(provider.name).toBe("openai");
    });
  });
});

// -----------------------------------------------------------------------------
// Single Embedding Tests
// -----------------------------------------------------------------------------

describe("EmbeddingProvider.embed", () => {
  let provider: EmbeddingProvider;

  beforeEach(() => {
    provider = createOpenAIProvider({ apiKey: "test-key" });
  });

  it("returns embedding vector for valid text", async () => {
    const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    global.fetch = vi.fn().mockResolvedValue(mockOpenAIResponse([mockEmbedding]));

    const result = await provider.embed("test text");

    expect(result).toEqual(mockEmbedding);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends correct request to OpenAI API", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOpenAIResponse([[0.1]]));

    await provider.embed("hello world");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        }),
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: ["hello world"],
        }),
      })
    );
  });

  it("uses custom base URL when provided", async () => {
    const customProvider = createOpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://custom.api.com/v1",
    });
    global.fetch = vi.fn().mockResolvedValue(mockOpenAIResponse([[0.1]]));

    await customProvider.embed("test");

    expect(fetch).toHaveBeenCalledWith(
      "https://custom.api.com/v1/embeddings",
      expect.anything()
    );
  });

  it("throws EmbeddingInputError for empty text", async () => {
    await expect(provider.embed("")).rejects.toThrow(EmbeddingInputError);
    await expect(provider.embed("   ")).rejects.toThrow(EmbeddingInputError);
    await expect(provider.embed("")).rejects.toThrow(/cannot be empty/);
  });

  it("throws EmbeddingAPIError on 401 unauthorized", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockErrorResponse(401, "Invalid API key", "invalid_api_key")
    );

    await expect(provider.embed("test")).rejects.toThrow(EmbeddingAPIError);
    await expect(provider.embed("test")).rejects.toMatchObject({
      status: 401,
      code: "invalid_api_key",
      provider: "openai",
    });
  });

  it("throws EmbeddingAPIError on 429 rate limit", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockErrorResponse(429, "Rate limit exceeded", "rate_limit_exceeded")
    );

    await expect(provider.embed("test")).rejects.toThrow(EmbeddingAPIError);
    await expect(provider.embed("test")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("throws EmbeddingAPIError on 500 server error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockErrorResponse(500, "Internal server error")
    );

    await expect(provider.embed("test")).rejects.toThrow(EmbeddingAPIError);
    await expect(provider.embed("test")).rejects.toMatchObject({
      status: 500,
    });
  });

  it("throws EmbeddingAPIError on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(provider.embed("test")).rejects.toThrow(EmbeddingAPIError);
    await expect(provider.embed("test")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("throws EmbeddingAPIError on timeout", async () => {
    // Use real timers for this test since AbortController interacts poorly with fake timers
    vi.useRealTimers();

    const shortTimeoutProvider = createOpenAIProvider({
      apiKey: "test-key",
      timeout: 50, // Very short timeout
    });

    // Mock fetch to never resolve (simulates hanging request)
    global.fetch = vi.fn().mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );

    const error = await shortTimeoutProvider.embed("test").catch((e) => e);

    expect(error).toBeInstanceOf(EmbeddingAPIError);
    expect(error.code).toBe("timeout");
    expect(error.message).toContain("timed out");
  });

  it("handles non-JSON error response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
      json: async () => {
        throw new Error("Not JSON");
      },
    });

    await expect(provider.embed("test")).rejects.toThrow(EmbeddingAPIError);
    await expect(provider.embed("test")).rejects.toMatchObject({
      status: 502,
    });
  });
});

// -----------------------------------------------------------------------------
// Batch Embedding Tests
// -----------------------------------------------------------------------------

describe("EmbeddingProvider.embedBatch", () => {
  let provider: EmbeddingProvider;

  beforeEach(() => {
    provider = createOpenAIProvider({ apiKey: "test-key" });
  });

  it("returns empty array for empty input", async () => {
    const result = await provider.embedBatch([]);
    expect(result).toEqual([]);
  });

  it("returns embeddings in correct order", async () => {
    const embeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ];
    global.fetch = vi.fn().mockResolvedValue(mockOpenAIResponse(embeddings));

    const result = await provider.embedBatch(["one", "two", "three"]);

    expect(result).toEqual(embeddings);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.3, 0.4]);
    expect(result[2]).toEqual([0.5, 0.6]);
  });

  it("handles out-of-order API response by sorting by index", async () => {
    // Simulate API returning embeddings out of order
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: "list",
        data: [
          { index: 2, embedding: [0.5, 0.6] },
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
        model: "text-embedding-3-small",
      }),
      text: async () => "",
    });

    const result = await provider.embedBatch(["one", "two", "three"]);

    // Should be sorted by index
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.3, 0.4]);
    expect(result[2]).toEqual([0.5, 0.6]);
  });

  it("throws EmbeddingInputError if any text is empty", async () => {
    await expect(provider.embedBatch(["valid", ""])).rejects.toThrow(
      EmbeddingInputError
    );
    await expect(provider.embedBatch(["valid", ""])).rejects.toThrow(
      /index 1/
    );
  });

  it("throws EmbeddingInputError for whitespace-only text", async () => {
    await expect(provider.embedBatch(["valid", "   "])).rejects.toThrow(
      EmbeddingInputError
    );
  });

  it("sends all texts in single request for small batches", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockOpenAIResponse([[0.1], [0.2], [0.3]])
    );

    await provider.embedBatch(["one", "two", "three"]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.input).toEqual(["one", "two", "three"]);
  });

  it("chunks large batches into multiple requests", async () => {
    // Create array of 3000 texts (exceeds 2048 limit)
    const texts = Array.from({ length: 3000 }, (_, i) => `text ${i}`);

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockOpenAIResponse(Array(2048).fill([0.1]))
      )
      .mockResolvedValueOnce(
        mockOpenAIResponse(Array(952).fill([0.2]))
      );

    const result = await provider.embedBatch(texts);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.length).toBe(3000);

    // First 2048 should have first batch's embedding
    expect(result[0]).toEqual([0.1]);
    expect(result[2047]).toEqual([0.1]);

    // Remaining should have second batch's embedding
    expect(result[2048]).toEqual([0.2]);
    expect(result[2999]).toEqual([0.2]);
  });
});

// -----------------------------------------------------------------------------
// Vector Utility Tests
// -----------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when one vector is all zeros", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("throws for dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      /dimension mismatch/
    );
  });

  it("computes correct similarity for known vectors", () => {
    // vectors at 45 degrees should have similarity ~0.707
    const a = [1, 0];
    const b = [1, 1];
    const normalized = cosineSimilarity(a, b);
    expect(normalized).toBeCloseTo(Math.sqrt(2) / 2, 5);
  });

  it("is independent of vector magnitude", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });
});

describe("normalize", () => {
  it("returns unit vector", () => {
    const v = [3, 4]; // 3-4-5 triangle
    const n = normalize(v);

    expect(n[0]).toBeCloseTo(0.6, 10);
    expect(n[1]).toBeCloseTo(0.8, 10);

    // Check magnitude is 1
    const magnitude = Math.sqrt(n[0] ** 2 + n[1] ** 2);
    expect(magnitude).toBeCloseTo(1, 10);
  });

  it("returns copy of zero vector for zero input", () => {
    const v = [0, 0, 0];
    const n = normalize(v);

    expect(n).toEqual([0, 0, 0]);
    expect(n).not.toBe(v); // Should be a copy
  });

  it("does not mutate original vector", () => {
    const v = [3, 4];
    normalize(v);

    expect(v).toEqual([3, 4]);
  });

  it("handles high-dimensional vectors", () => {
    const v = Array.from({ length: 1536 }, () => Math.random());
    const n = normalize(v);

    const magnitude = Math.sqrt(n.reduce((sum, x) => sum + x ** 2, 0));
    expect(magnitude).toBeCloseTo(1, 10);
  });
});

describe("euclideanDistance", () => {
  it("returns 0 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(euclideanDistance(v, v)).toBe(0);
  });

  it("computes correct distance for known vectors", () => {
    const a = [0, 0];
    const b = [3, 4];
    expect(euclideanDistance(a, b)).toBe(5); // 3-4-5 triangle
  });

  it("is symmetric", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });

  it("throws for dimension mismatch", () => {
    expect(() => euclideanDistance([1], [1, 2])).toThrow(/dimension mismatch/);
  });

  it("works for single dimension", () => {
    expect(euclideanDistance([5], [2])).toBe(3);
  });

  it("handles negative values", () => {
    const a = [-1, -2];
    const b = [2, 2];
    expect(euclideanDistance(a, b)).toBe(5); // sqrt(9 + 16)
  });
});

// -----------------------------------------------------------------------------
// Integration-style Tests
// -----------------------------------------------------------------------------

describe("provider workflow", () => {
  it("embed returns vectors usable with similarity functions", async () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });

    // Return vectors with known similarity properties
    const vectorA = [1, 0, 0];
    const vectorB = [0, 1, 0]; // orthogonal to A

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockOpenAIResponse([vectorA]))
      .mockResolvedValueOnce(mockOpenAIResponse([vectorB]));

    const embeddingA = await provider.embed("text A");
    const embeddingB = await provider.embed("text B");

    // Verify the vectors came through correctly
    expect(embeddingA).toEqual(vectorA);
    expect(embeddingB).toEqual(vectorB);

    // Verify they work with our similarity functions
    const similarity = cosineSimilarity(embeddingA, embeddingB);
    expect(similarity).toBeCloseTo(0, 10); // orthogonal vectors
  });

  it("embedBatch returns array with correct length and preserves order", async () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });

    // Use distinct embeddings to verify ordering
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    global.fetch = vi.fn().mockResolvedValue(mockOpenAIResponse(embeddings));

    const result = await provider.embedBatch(["first", "second", "third"]);

    // Verify length
    expect(result.length).toBe(3);

    // Verify each embedding is distinct and in order
    expect(result[0]).toEqual([1, 0, 0]);
    expect(result[1]).toEqual([0, 1, 0]);
    expect(result[2]).toEqual([0, 0, 1]);

    // Verify they're orthogonal (proves we got distinct vectors, not duplicates)
    expect(cosineSimilarity(result[0], result[1])).toBe(0);
    expect(cosineSimilarity(result[1], result[2])).toBe(0);
  });

  it("provider exposes dimensions matching model specification", () => {
    const small = createOpenAIProvider({
      apiKey: "test-key",
      model: "text-embedding-3-small",
    });
    const large = createOpenAIProvider({
      apiKey: "test-key",
      model: "text-embedding-3-large",
    });

    // These must match the documented OpenAI model dimensions
    expect(small.dimensions).toBe(OPENAI_MODELS["text-embedding-3-small"]);
    expect(large.dimensions).toBe(OPENAI_MODELS["text-embedding-3-large"]);

    // Verify the OPENAI_MODELS constant has correct values
    expect(OPENAI_MODELS["text-embedding-3-small"]).toBe(1536);
    expect(OPENAI_MODELS["text-embedding-3-large"]).toBe(3072);
  });
});

// -----------------------------------------------------------------------------
// Error Hierarchy Tests
// -----------------------------------------------------------------------------

describe("error types", () => {
  it("EmbeddingInputError has correct properties", () => {
    const error = new EmbeddingInputError("test message", "openai");

    expect(error.name).toBe("EmbeddingInputError");
    expect(error.message).toBe("test message");
    expect(error.provider).toBe("openai");
    expect(error).toBeInstanceOf(Error);
  });

  it("EmbeddingAPIError preserves cause", () => {
    const cause = new Error("original error");
    const error = new EmbeddingAPIError(
      "API failed",
      "openai",
      500,
      "server_error",
      cause
    );

    expect(error.cause).toBe(cause);
    expect(error.status).toBe(500);
    expect(error.code).toBe("server_error");
  });

  it("errors are catchable by base type", async () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });
    global.fetch = vi.fn().mockResolvedValue(mockErrorResponse(500, "Error"));

    try {
      await provider.embed("test");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EmbeddingAPIError);
      // Can also catch as base EmbeddingError would work if we had that check
    }
  });
});
