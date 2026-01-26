import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeFetch, safeFetchText, safeFetchJson, type SafeFetchResult } from "./safe-fetch.js";

describe("safeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return ok: true for successful fetch", async () => {
    const mockResponse = new Response("test data", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response).toBe(mockResponse);
      expect(result.error).toBe(null);
    }
  });

  it("should return ok: false for network errors without throwing", async () => {
    const networkError = new Error("fetch failed");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(networkError);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response).toBe(null);
      expect(result.error).toBe(networkError);
      expect(result.message).toBe("fetch failed");
      expect(result.type).toBe("network");
    }
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should classify abort errors correctly", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.type).toBe("abort");
    }
  });

  it("should classify timeout errors correctly", async () => {
    const timeoutError = new Error("Request timeout");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(timeoutError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.type).toBe("timeout");
    }
  });

  it("should classify ECONNREFUSED as network error", async () => {
    const connError = new Error("connect ECONNREFUSED");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(connError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.type).toBe("network");
    }
  });

  it("should handle non-Error objects thrown from fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue("string error");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await safeFetch("https://example.com/data");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("string error");
      expect(result.type).toBe("unknown");
    }
  });

  it("should log errors with URL information", async () => {
    const error = new Error("fetch failed");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await safeFetch("https://example.com/api/test");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("safeFetch failed"),
      expect.stringContaining("fetch failed"),
    );
  });

  it("should pass through RequestInit options", async () => {
    const mockResponse = new Response("data");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    };

    await safeFetch("https://example.com/api", init);

    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/api", expect.objectContaining(init));
  });
});

describe("safeFetchText", () => {
  it("should return text for successful fetch", async () => {
    const mockResponse = new Response("test data");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const text = await safeFetchText("https://example.com/data");

    expect(text).toBe("test data");
  });

  it("should return null for failed fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const text = await safeFetchText("https://example.com/data");

    expect(text).toBe(null);
  });

  it("should return null if response.text() throws", async () => {
    const mockResponse = {
      text: () => Promise.reject(new Error("Failed to read body")),
    } as Response;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const text = await safeFetchText("https://example.com/data");

    expect(text).toBe(null);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read response text"),
      expect.any(Error),
    );
  });
});

describe("safeFetchJson", () => {
  it("should return parsed JSON for successful fetch", async () => {
    const data = { test: true, value: 42 };
    const mockResponse = new Response(JSON.stringify(data));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const json = await safeFetchJson<typeof data>("https://example.com/api");

    expect(json).toEqual(data);
  });

  it("should return null for failed fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const json = await safeFetchJson("https://example.com/api");

    expect(json).toBe(null);
  });

  it("should return null if JSON parsing fails", async () => {
    const mockResponse = new Response("not valid json");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const json = await safeFetchJson("https://example.com/api");

    expect(json).toBe(null);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse response JSON"),
      expect.any(Error),
    );
  });

  it("should handle empty response gracefully", async () => {
    const mockResponse = new Response("");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const json = await safeFetchJson("https://example.com/api");

    expect(json).toBe(null);
  });
});

describe("safeFetch - real-world scenario simulation", () => {
  it("should not throw unhandled promise rejection on network failure", async () => {
    // Simulate the exact error from the crash logs
    const error = new TypeError("fetch failed");
    Object.defineProperty(error, "stack", {
      value: "at node:internal/deps/undici/undici:15422:13",
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});

    // This should NOT throw an unhandled rejection
    const result = await safeFetch("https://api.example.com/endpoint");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TypeError);
      expect(result.type).toBe("network");
    }
  });

  it("should handle multiple concurrent failed fetches without crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const promises = [
      safeFetch("https://api1.example.com"),
      safeFetch("https://api2.example.com"),
      safeFetch("https://api3.example.com"),
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.ok).toBe(false);
    });
  });
});
