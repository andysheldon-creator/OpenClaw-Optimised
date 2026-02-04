import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenAIClient } from "./openai.js";

describe("openai client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe("createOpenAIClient", () => {
    it("creates client with normalized baseUrl", () => {
      const client = createOpenAIClient({ baseUrl: "http://localhost:11434" });

      // Should add /v1 suffix
      expect(client.baseUrl).toBe("http://localhost:11434/v1");
    });

    it("preserves baseUrl if already has /v1", () => {
      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });

      expect(client.baseUrl).toBe("http://localhost:11434/v1");
    });
  });

  describe("chat", () => {
    it("calls /v1/chat/completions with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "llama3",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello!" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      });

      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });
      const result = await client.chat({
        model: "llama3",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 100,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe("llama3");
      expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
      expect(body.max_tokens).toBe(100);
      expect(body.stream).toBe(false);

      expect(result.choices[0].message.content).toBe("Hello!");
      expect(result.usage?.total_tokens).toBe(15);
    });

    it("throws OllamaApiError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid model",
      });

      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });

      await expect(
        client.chat({
          model: "nonexistent",
          messages: [{ role: "user", content: "Hi" }],
        }),
      ).rejects.toThrow("Ollama /v1/chat/completions failed");
    });
  });

  describe("ping", () => {
    it("returns available=true with models on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "llama3:latest" }, { id: "mistral:latest" }],
          object: "list",
        }),
      });

      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });
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

      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });
      const result = await client.ping();

      expect(result.available).toBe(false);
      expect(result.models).toEqual([]);
      expect(result.error).toContain("500");
    });

    it("returns available=false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const client = createOpenAIClient({ baseUrl: "http://localhost:11434/v1" });
      const result = await client.ping();

      expect(result.available).toBe(false);
      expect(result.models).toEqual([]);
      expect(result.error).toContain("Connection refused");
    });
  });
});
