import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./web-search.js";

const { runBraveSearch } = __testing;

describe("runBraveSearch", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "brave-test-key",
    count: 5,
    timeoutSeconds: 30,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct request URL with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await runBraveSearch({
      ...defaultParams,
      country: "DE",
      search_lang: "de",
      ui_lang: "de-DE",
      freshness: "pw",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("test query");
    expect(parsed.searchParams.get("count")).toBe("5");
    expect(parsed.searchParams.get("country")).toBe("DE");
    expect(parsed.searchParams.get("search_lang")).toBe("de");
    expect(parsed.searchParams.get("ui_lang")).toBe("de-DE");
    expect(parsed.searchParams.get("freshness")).toBe("pw");
  });

  it("omits optional query params when not provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await runBraveSearch(defaultParams);

    const [url] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.has("country")).toBe(false);
    expect(parsed.searchParams.has("search_lang")).toBe(false);
    expect(parsed.searchParams.has("ui_lang")).toBe(false);
    expect(parsed.searchParams.has("freshness")).toBe(false);
  });

  it("sends X-Subscription-Token auth header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    });

    await runBraveSearch(defaultParams);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["X-Subscription-Token"]).toBe("brave-test-key");
  });

  it("maps results with wrapped title/description and raw URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "Test Title",
              url: "https://example.com/page",
              description: "A test description",
              age: "2 days ago",
            },
          ],
        },
      }),
    });

    const results = await runBraveSearch(defaultParams);
    expect(results).toHaveLength(1);

    // Title and description should be wrapped (not equal to raw)
    expect(results[0].title).toContain("Test Title");
    expect(results[0].title).not.toBe("Test Title");

    expect(results[0].description).toContain("A test description");
    expect(results[0].description).not.toBe("A test description");

    // URL should be kept raw
    expect(results[0].url).toBe("https://example.com/page");
  });

  it("maps published from age and siteName from hostname", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: "Title",
              url: "https://docs.example.com/path",
              description: "Desc",
              age: "3 hours ago",
            },
          ],
        },
      }),
    });

    const results = await runBraveSearch(defaultParams);
    expect(results[0].published).toBe("3 hours ago");
    expect(results[0].siteName).toBe("docs.example.com");
  });

  it("throws on non-ok response with status and detail", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "invalid token",
    });

    await expect(runBraveSearch(defaultParams)).rejects.toThrow(
      "Brave Search API error (403): invalid token",
    );
  });

  it("falls back to statusText when response body is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "",
    });

    await expect(runBraveSearch(defaultParams)).rejects.toThrow(
      "Brave Search API error (500): Internal Server Error",
    );
  });
});
