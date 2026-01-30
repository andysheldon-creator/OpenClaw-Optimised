/**
 * Arcade Client Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ArcadeClient,
  ArcadeApiError,
  createArcadeClient,
} from "./client.js";
import type { ArcadeConfig } from "./config.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ArcadeClient", () => {
  const defaultConfig: ArcadeConfig = {
    enabled: true,
    apiKey: "test_api_key",
    userId: "test_user",
    baseUrl: "https://api.arcade.dev",
    toolPrefix: "arcade",
    autoAuth: true,
    cacheToolsTtlMs: 300000,
  };

  let client: ArcadeClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ArcadeClient(defaultConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("returns true when API key is set", () => {
      expect(client.isConfigured()).toBe(true);
    });

    it("returns false when API key is empty", () => {
      const unconfiguredClient = new ArcadeClient({
        ...defaultConfig,
        apiKey: undefined,
      });
      expect(unconfiguredClient.isConfigured()).toBe(false);
    });
  });

  describe("getUserId", () => {
    it("returns configured user ID", () => {
      expect(client.getUserId()).toBe("test_user");
    });
  });

  describe("configure", () => {
    it("updates client configuration", () => {
      client.configure({ userId: "new_user" });
      expect(client.getUserId()).toBe("new_user");
    });
  });

  describe("health", () => {
    it("checks API health", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: "ok" }),
      });

      const result = await client.health();

      expect(result).toEqual({ status: "ok" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.arcade.dev/v1/health",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test_api_key",
          }),
        }),
      );
    });

    it("throws on API error after retries", async () => {
      // Server errors trigger retries, so we mock multiple failures
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => "Internal Server Error",
      });

      await expect(client.health()).rejects.toThrow(ArcadeApiError);
    });
  });

  describe("listTools", () => {
    it("lists available tools", async () => {
      const mockTools = {
        items: [
          { name: "Gmail.SendEmail", description: "Send email", toolkit: "gmail" },
          { name: "Slack.PostMessage", description: "Post message", toolkit: "slack" },
        ],
        total: 2,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockTools),
      });

      const tools = await client.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("Gmail.SendEmail");
      expect(tools[1].name).toBe("Slack.PostMessage");
    });

    it("filters by toolkit", async () => {
      const mockTools = {
        items: [{ name: "Gmail.SendEmail", description: "Send email", toolkit: "gmail" }],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockTools),
      });

      await client.listTools({ toolkit: "gmail" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("toolkit=gmail"),
        expect.anything(),
      );
    });

    it("caches tool list", async () => {
      const mockTools = {
        items: [{ name: "Gmail.SendEmail", description: "Send email", toolkit: "gmail" }],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockTools),
      });

      // First call - hits API
      await client.listTools();
      // Second call - should use cache
      await client.listTools();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache with forceRefresh", async () => {
      const mockTools = {
        items: [{ name: "Gmail.SendEmail", description: "Send email", toolkit: "gmail" }],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockTools),
      });

      await client.listTools();
      await client.listTools({ forceRefresh: true });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("authorize", () => {
    it("initiates authorization", async () => {
      const mockResponse = {
        status: "pending",
        authorization_id: "auth_123",
        authorization_url: "https://arcade.dev/auth/123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await client.authorize("Gmail.SendEmail");

      expect(result.status).toBe("pending");
      expect(result.authorization_url).toBe("https://arcade.dev/auth/123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.arcade.dev/v1/tools/authorize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            tool_name: "Gmail.SendEmail",
            user_id: "test_user",
          }),
        }),
      );
    });

    it("returns completed status when already authorized", async () => {
      const mockResponse = {
        status: "completed",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await client.authorize("Gmail.SendEmail");

      expect(result.status).toBe("completed");
      expect(result.authorization_url).toBeUndefined();
    });
  });

  describe("execute", () => {
    it("executes a tool", async () => {
      const mockResponse = {
        success: true,
        output: { messageId: "msg_123" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await client.execute("Gmail.SendEmail", {
        to: "test@example.com",
        subject: "Test",
        body: "Hello",
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ messageId: "msg_123" });
    });

    it("handles authorization required error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "Unauthorized" }),
      });

      const result = await client.execute("Gmail.SendEmail", {});

      expect(result.success).toBe(false);
      expect(result.authorization_required).toBe(true);
      expect(result.error?.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("clearCache", () => {
    it("clears the tools cache", async () => {
      const mockTools = {
        items: [{ name: "Gmail.SendEmail", description: "Send email", toolkit: "gmail" }],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(mockTools),
      });

      await client.listTools();
      client.clearCache();
      await client.listTools();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("createArcadeClient", () => {
  it("creates a client instance", () => {
    const client = createArcadeClient({
      enabled: true,
      apiKey: "test_key",
      baseUrl: "https://api.arcade.dev",
      toolPrefix: "arcade",
      autoAuth: true,
      cacheToolsTtlMs: 300000,
    });

    expect(client).toBeInstanceOf(ArcadeClient);
    expect(client.isConfigured()).toBe(true);
  });
});

describe("ArcadeApiError", () => {
  it("stores error details", () => {
    const error = new ArcadeApiError(400, "Bad request", { field: "invalid" });

    expect(error.status).toBe(400);
    expect(error.message).toBe("Bad request");
    expect(error.details).toEqual({ field: "invalid" });
    expect(error.name).toBe("ArcadeApiError");
  });

  it("identifies retriable errors", () => {
    expect(new ArcadeApiError(500, "Server error").isRetriable()).toBe(true);
    expect(new ArcadeApiError(502, "Bad gateway").isRetriable()).toBe(true);
    expect(new ArcadeApiError(429, "Rate limited").isRetriable()).toBe(true);
    expect(new ArcadeApiError(400, "Bad request").isRetriable()).toBe(false);
    expect(new ArcadeApiError(401, "Unauthorized").isRetriable()).toBe(false);
  });
});

describe("retry and rate limiting", () => {
  const defaultConfig: ArcadeConfig = {
    enabled: true,
    apiKey: "test_api_key",
    userId: "test_user",
    baseUrl: "https://api.arcade.dev",
    toolPrefix: "arcade",
    autoAuth: true,
    cacheToolsTtlMs: 300000,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("retries on server errors", async () => {
    const client = new ArcadeClient(defaultConfig, { maxRetries: 2, retryDelayMs: 10 });

    // Fail twice, then succeed
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server error" })
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => "Bad gateway" })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: "ok" }) });

    const result = await client.health();

    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry on client errors", async () => {
    const client = new ArcadeClient(defaultConfig, { maxRetries: 2, retryDelayMs: 10 });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "Bad request" }),
    });

    await expect(client.health()).rejects.toThrow(ArcadeApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles rate limiting with Retry-After header", async () => {
    const client = new ArcadeClient(defaultConfig, { maxRetries: 2, retryDelayMs: 10 });

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1" }),
        text: async () => "Rate limited",
      })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ status: "ok" }) });

    const result = await client.health();

    expect(result).toEqual({ status: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after max retries", async () => {
    const client = new ArcadeClient(defaultConfig, { maxRetries: 2, retryDelayMs: 10 });

    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => "Server error" });

    await expect(client.health()).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});
