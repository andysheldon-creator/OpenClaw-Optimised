import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNativeClient } from "./native.js";

describe("native client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe("createNativeClient", () => {
    it("creates client with baseUrl", () => {
      const client = createNativeClient({ baseUrl: "http://localhost:11434" });

      expect(client.baseUrl).toBe("http://localhost:11434");
      expect(typeof client.generate).toBe("function");
      expect(typeof client.ping).toBe("function");
    });
  });

  describe("generate", () => {
    it("calls /api/generate with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: "Hello!",
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });
      const result = await client.generate({
        model: "llama3",
        prompt: "Hi",
        options: { num_predict: 100 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/generate",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe("llama3");
      expect(body.prompt).toBe("Hi");
      expect(body.stream).toBe(false);
      expect(body.options.num_predict).toBe(100);

      expect(result.response).toBe("Hello!");
      expect(result.done).toBe(true);
    });

    it("strips context array by default", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: "Hello!",
          done: true,
          context: [1, 2, 3, 4, 5], // This should be stripped
        }),
      });

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });
      const result = await client.generate({
        model: "llama3",
        prompt: "Hi",
      });

      // Context should not be in the result
      expect("context" in result).toBe(false);
    });

    it("includes context when requested", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: "Hello!",
          done: true,
          context: [1, 2, 3, 4, 5],
        }),
      });

      const client = createNativeClient({
        baseUrl: "http://localhost:11434",
        includeContext: true,
      });
      const result = await client.generate({
        model: "llama3",
        prompt: "Hi",
      });

      // Context should be included
      expect("context" in result).toBe(true);
    });

    it("throws OllamaApiError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Server error",
      });

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });

      await expect(client.generate({ model: "llama3", prompt: "Hi" })).rejects.toThrow(
        "Ollama /api/generate failed",
      );
    });
  });

  describe("ping", () => {
    it("returns available=true with models on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3:latest" }, { name: "mistral:latest" }],
        }),
      });

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });
      const result = await client.ping();

      expect(result.available).toBe(true);
      expect(result.models).toEqual(["llama3:latest", "mistral:latest"]);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns available=false on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });
      const result = await client.ping();

      expect(result.available).toBe(false);
      expect(result.models).toEqual([]);
      expect(result.error).toContain("500");
    });

    it("returns available=false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const client = createNativeClient({ baseUrl: "http://localhost:11434" });
      const result = await client.ping();

      expect(result.available).toBe(false);
      expect(result.models).toEqual([]);
      expect(result.error).toContain("Connection refused");
    });
  });
});
