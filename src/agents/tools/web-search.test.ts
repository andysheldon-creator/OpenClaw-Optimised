import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./web-search.js";

const {
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  isDirectPerplexityBaseUrl,
  resolvePerplexityRequestModel,
  normalizeFreshness,
  buildSearchCacheKey,
  performProviderSearch,
} = __testing;

describe("web_search perplexity baseUrl defaults", () => {
  it("detects a Perplexity key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("pplx-123")).toBe("direct");
  });

  it("detects an OpenRouter key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("sk-or-v1-123")).toBe("openrouter");
  });

  it("returns undefined for unknown key formats", () => {
    expect(inferPerplexityBaseUrlFromApiKey("unknown-key")).toBeUndefined();
  });

  it("prefers explicit baseUrl over key-based defaults", () => {
    expect(resolvePerplexityBaseUrl({ baseUrl: "https://example.com" }, "config", "pplx-123")).toBe(
      "https://example.com",
    );
  });

  it("defaults to direct when using PERPLEXITY_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "perplexity_env")).toBe("https://api.perplexity.ai");
  });

  it("defaults to OpenRouter when using OPENROUTER_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "openrouter_env")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to direct when config key looks like Perplexity", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "pplx-123")).toBe(
      "https://api.perplexity.ai",
    );
  });

  it("defaults to OpenRouter when config key looks like OpenRouter", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "sk-or-v1-123")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to OpenRouter for unknown config key formats", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "weird-key")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
});

describe("web_search perplexity model normalization", () => {
  it("detects direct Perplexity host", () => {
    expect(isDirectPerplexityBaseUrl("https://api.perplexity.ai")).toBe(true);
    expect(isDirectPerplexityBaseUrl("https://api.perplexity.ai/")).toBe(true);
    expect(isDirectPerplexityBaseUrl("https://openrouter.ai/api/v1")).toBe(false);
  });

  it("strips provider prefix for direct Perplexity", () => {
    expect(resolvePerplexityRequestModel("https://api.perplexity.ai", "perplexity/sonar-pro")).toBe(
      "sonar-pro",
    );
  });

  it("keeps prefixed model for OpenRouter", () => {
    expect(
      resolvePerplexityRequestModel("https://openrouter.ai/api/v1", "perplexity/sonar-pro"),
    ).toBe("perplexity/sonar-pro");
  });

  it("keeps model unchanged when URL is invalid", () => {
    expect(resolvePerplexityRequestModel("not-a-url", "perplexity/sonar-pro")).toBe(
      "perplexity/sonar-pro",
    );
  });
});

describe("web_search freshness normalization", () => {
  it("accepts Brave shortcut values", () => {
    expect(normalizeFreshness("pd")).toBe("pd");
    expect(normalizeFreshness("PW")).toBe("pw");
  });

  it("accepts valid date ranges", () => {
    expect(normalizeFreshness("2024-01-01to2024-01-31")).toBe("2024-01-01to2024-01-31");
  });

  it("rejects invalid date ranges", () => {
    expect(normalizeFreshness("2024-13-01to2024-01-31")).toBeUndefined();
    expect(normalizeFreshness("2024-02-30to2024-03-01")).toBeUndefined();
    expect(normalizeFreshness("2024-03-10to2024-03-01")).toBeUndefined();
  });
});

describe("buildSearchCacheKey", () => {
  const baseParams = { query: "test query", count: 5 } as const;

  describe("brave", () => {
    it("includes all locale and freshness fields", () => {
      const key = buildSearchCacheKey({
        ...baseParams,
        provider: "brave",
        country: "US",
        search_lang: "en",
        ui_lang: "en-US",
        freshness: "pw",
      });
      expect(key).toBe("brave:test query:5:us:en:en-us:pw");
    });

    it("uses 'default' for missing optional fields", () => {
      const key = buildSearchCacheKey({ ...baseParams, provider: "brave" });
      expect(key).toBe("brave:test query:5:default:default:default:default");
    });

    it("produces different keys for different freshness values", () => {
      const a = buildSearchCacheKey({ ...baseParams, provider: "brave", freshness: "pd" });
      const b = buildSearchCacheKey({ ...baseParams, provider: "brave", freshness: "pm" });
      expect(a).not.toBe(b);
    });
  });

  describe("perplexity", () => {
    it("includes explicit baseUrl and model", () => {
      const key = buildSearchCacheKey({
        ...baseParams,
        provider: "perplexity",
        perplexityBaseUrl: "https://custom.api/v1",
        perplexityModel: "sonar",
      });
      expect(key).toBe("perplexity:test query:https://custom.api/v1:sonar");
    });

    it("falls back to default baseUrl and model", () => {
      const key = buildSearchCacheKey({ ...baseParams, provider: "perplexity" });
      expect(key).toBe("perplexity:test query:https://openrouter.ai/api/v1:perplexity/sonar-pro");
    });
  });

  describe("tavily", () => {
    it("includes count, freshness, and searchDepth", () => {
      const key = buildSearchCacheKey({
        ...baseParams,
        provider: "tavily",
        freshness: "pw",
        tavilySearchDepth: "basic",
      });
      expect(key).toBe("tavily:test query:5:pw:basic");
    });

    it("falls back to defaults for missing optional fields", () => {
      const key = buildSearchCacheKey({ ...baseParams, provider: "tavily" });
      expect(key).toBe("tavily:test query:5:default:advanced");
    });

    it("produces different keys for different search depths", () => {
      const a = buildSearchCacheKey({
        ...baseParams,
        provider: "tavily",
        tavilySearchDepth: "basic",
      });
      const b = buildSearchCacheKey({
        ...baseParams,
        provider: "tavily",
        tavilySearchDepth: "advanced",
      });
      expect(a).not.toBe(b);
    });
  });

  describe("grok", () => {
    it("includes explicit model", () => {
      const key = buildSearchCacheKey({
        ...baseParams,
        provider: "grok",
        grokModel: "grok-custom",
      });
      expect(key).toBe("grok:test query:grok-custom");
    });

    it("falls back to default model", () => {
      const key = buildSearchCacheKey({ ...baseParams, provider: "grok" });
      expect(key).toBe("grok:test query:grok-4-1-fast-reasoning");
    });
  });

  it("normalizes keys to lowercase", () => {
    const key = buildSearchCacheKey({
      ...baseParams,
      query: "UPPER CASE",
      provider: "brave",
      country: "US",
    });
    expect(key).toBe("brave:upper case:5:us:default:default:default");
  });

  it("different providers produce different keys for same query", () => {
    const brave = buildSearchCacheKey({ ...baseParams, provider: "brave" });
    const perplexity = buildSearchCacheKey({ ...baseParams, provider: "perplexity" });
    const tavily = buildSearchCacheKey({ ...baseParams, provider: "tavily" });
    const grok = buildSearchCacheKey({ ...baseParams, provider: "grok" });
    const keys = new Set([brave, perplexity, tavily, grok]);
    expect(keys.size).toBe(4);
  });
});

describe("performProviderSearch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches to brave and returns correct payload shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [{ title: "T", url: "https://a.com", description: "D" }],
        },
      }),
    });

    const start = Date.now();
    const payload = await performProviderSearch(
      {
        query: "brave test",
        provider: "brave",
        count: 3,
        apiKey: "key",
        timeoutSeconds: 10,
      },
      start,
    );

    expect(Object.keys(payload).toSorted()).toEqual([
      "count",
      "provider",
      "query",
      "results",
      "tookMs",
    ]);
    expect(payload.query).toBe("brave test");
    expect(payload.provider).toBe("brave");
    expect(payload.count).toBe(1);
    expect(payload.tookMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it("dispatches to perplexity and returns correct payload shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "answer" } }],
        citations: ["https://cite.com"],
      }),
    });

    const start = Date.now();
    const payload = await performProviderSearch(
      {
        query: "pplx test",
        provider: "perplexity",
        count: 5,
        apiKey: "key",
        timeoutSeconds: 10,
        perplexityBaseUrl: "https://openrouter.ai/api/v1",
        perplexityModel: "perplexity/sonar-pro",
      },
      start,
    );

    expect(Object.keys(payload).toSorted()).toEqual([
      "citations",
      "content",
      "model",
      "provider",
      "query",
      "tookMs",
    ]);
    expect(payload.query).toBe("pplx test");
    expect(payload.provider).toBe("perplexity");
    expect(payload.model).toBe("perplexity/sonar-pro");
    expect(typeof payload.content).toBe("string");
    expect(payload.tookMs).toBeGreaterThanOrEqual(0);
    expect(payload.citations).toEqual(["https://cite.com"]);
  });

  it("dispatches to grok and returns correct payload shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            status: "completed",
            content: [
              {
                text: "grok answer",
                annotations: [{ url: "https://x.com", start_index: 0, end_index: 5 }],
              },
            ],
          },
        ],
      }),
    });

    const start = Date.now();
    const payload = await performProviderSearch(
      {
        query: "grok test",
        provider: "grok",
        count: 5,
        apiKey: "key",
        timeoutSeconds: 10,
        grokModel: "grok-4-1-fast-reasoning",
      },
      start,
    );

    expect(Object.keys(payload).toSorted()).toEqual([
      "citations",
      "model",
      "provider",
      "query",
      "results",
      "tookMs",
    ]);
    expect(payload.query).toBe("grok test");
    expect(payload.provider).toBe("grok");
    expect(payload.model).toBe("grok-4-1-fast-reasoning");
    expect(payload.tookMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.results)).toBe(true);
    expect(Array.isArray(payload.citations)).toBe(true);
  });

  it("dispatches to tavily and returns correct payload shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ title: "T", url: "https://t.com", content: "C", score: 0.8 }],
      }),
    });

    const start = Date.now();
    const payload = await performProviderSearch(
      {
        query: "tavily test",
        provider: "tavily",
        count: 5,
        apiKey: "key",
        timeoutSeconds: 10,
      },
      start,
    );

    expect(Object.keys(payload).toSorted()).toEqual([
      "count",
      "provider",
      "query",
      "results",
      "tookMs",
    ]);
    expect(payload.query).toBe("tavily test");
    expect(payload.provider).toBe("tavily");
    expect(payload.count).toBe(1);
    expect(payload.tookMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.results)).toBe(true);
  });

  it("throws for unsupported provider", async () => {
    await expect(
      performProviderSearch(
        {
          query: "q",
          provider: "unknown" as never,
          count: 5,
          apiKey: "key",
          timeoutSeconds: 10,
        },
        Date.now(),
      ),
    ).rejects.toThrow("Unsupported web search provider.");
  });
});
