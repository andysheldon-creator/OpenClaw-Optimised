import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./web-search.js";

const {
  resolveTavilyConfig,
  resolveTavilyApiKey,
  resolveTavilySearchDepth,
  runTavilySearch,
  freshnessToTavilyTimeParams,
} = __testing;

describe("web_search tavily config resolution", () => {
  it("uses config apiKey when provided", () => {
    expect(resolveTavilyApiKey({ apiKey: "tvly-test-key" })).toBe("tvly-test-key");
  });

  it("falls back to TAVILY_API_KEY env var", () => {
    const previous = process.env.TAVILY_API_KEY;
    try {
      process.env.TAVILY_API_KEY = "tvly-from-env";
      expect(resolveTavilyApiKey({})).toBe("tvly-from-env");
    } finally {
      if (previous === undefined) {
        delete process.env.TAVILY_API_KEY;
      } else {
        process.env.TAVILY_API_KEY = previous;
      }
    }
  });

  it("returns undefined when no apiKey is available", () => {
    const previous = process.env.TAVILY_API_KEY;
    try {
      delete process.env.TAVILY_API_KEY;
      expect(resolveTavilyApiKey({})).toBeUndefined();
      expect(resolveTavilyApiKey(undefined)).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.TAVILY_API_KEY;
      } else {
        process.env.TAVILY_API_KEY = previous;
      }
    }
  });
});

describe("resolveTavilySearchDepth", () => {
  it("defaults to advanced when not configured", () => {
    expect(resolveTavilySearchDepth({})).toBe("advanced");
    expect(resolveTavilySearchDepth(undefined)).toBe("advanced");
  });

  it("accepts valid search depth values", () => {
    expect(resolveTavilySearchDepth({ searchDepth: "basic" })).toBe("basic");
    expect(resolveTavilySearchDepth({ searchDepth: "advanced" })).toBe("advanced");
    expect(resolveTavilySearchDepth({ searchDepth: "fast" })).toBe("fast");
    expect(resolveTavilySearchDepth({ searchDepth: "ultra-fast" })).toBe("ultra-fast");
  });

  it("is case-insensitive", () => {
    expect(resolveTavilySearchDepth({ searchDepth: "BASIC" })).toBe("basic");
    expect(resolveTavilySearchDepth({ searchDepth: "Advanced" })).toBe("advanced");
  });

  it("falls back to advanced for invalid values", () => {
    expect(resolveTavilySearchDepth({ searchDepth: "invalid" })).toBe("advanced");
    expect(resolveTavilySearchDepth({ searchDepth: "" })).toBe("advanced");
  });
});

describe("freshnessToTavilyTimeParams", () => {
  it("maps pd to day", () => {
    expect(freshnessToTavilyTimeParams("pd")).toEqual({ time_range: "day" });
  });

  it("maps pw to week", () => {
    expect(freshnessToTavilyTimeParams("pw")).toEqual({ time_range: "week" });
  });

  it("maps pm to month", () => {
    expect(freshnessToTavilyTimeParams("pm")).toEqual({ time_range: "month" });
  });

  it("maps py to year", () => {
    expect(freshnessToTavilyTimeParams("py")).toEqual({ time_range: "year" });
  });

  it("splits date ranges into start_date and end_date", () => {
    expect(freshnessToTavilyTimeParams("2024-01-01to2024-03-01")).toEqual({
      start_date: "2024-01-01",
      end_date: "2024-03-01",
    });
  });

  it("returns empty object for undefined", () => {
    expect(freshnessToTavilyTimeParams(undefined)).toEqual({});
  });

  it("returns empty object for unrecognized values", () => {
    expect(freshnessToTavilyTimeParams("unknown")).toEqual({});
  });
});

type TavilyFixture = {
  description: string;
  response: Record<string, unknown>;
  expect: {
    resultsLength: number;
    firstTitle?: string;
    firstUrl?: string;
    firstScore?: number;
  };
};

const TAVILY_FIXTURES_DIR = path.resolve(import.meta.dirname, "__fixtures__/tavily");

function loadTavilyFixtures(): { name: string; fixture: TavilyFixture }[] {
  const files = fs.readdirSync(TAVILY_FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(TAVILY_FIXTURES_DIR, file), "utf-8");
    return { name: file.replace(/\.json$/, ""), fixture: JSON.parse(raw) as TavilyFixture };
  });
}

describe("running tavily web searches (fixtures)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "tvly-test-key",
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

  const fixtures = loadTavilyFixtures();

  for (const { name, fixture } of fixtures) {
    describe(`fixture: ${name}`, () => {
      it(fixture.description, async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => fixture.response,
        });

        const results = await runTavilySearch(defaultParams);

        expect(results).toHaveLength(fixture.expect.resultsLength);

        if (fixture.expect.firstTitle && results.length > 0) {
          expect(results[0].title).toContain(fixture.expect.firstTitle);
        }

        if (fixture.expect.firstUrl && results.length > 0) {
          expect(results[0].url).toBe(fixture.expect.firstUrl);
        }

        if (fixture.expect.firstScore !== undefined && results.length > 0) {
          expect(results[0].score).toBe(fixture.expect.firstScore);
        }
      });
    });
  }

  it("sends correct request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await runTavilySearch({ ...defaultParams, freshness: "pw" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    const body = JSON.parse(options.body);
    expect(body.query).toBe("test query");
    expect(body.search_depth).toBe("advanced");
    expect(body.topic).toBe("general");
    expect(body.max_results).toBe(5);
    expect(body.time_range).toBe("week");
  });

  it("passes configured searchDepth to request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await runTavilySearch({ ...defaultParams, searchDepth: "basic" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.search_depth).toBe("basic");
  });
});

describe("runTavilySearch (error handling)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "tvly-test-key",
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

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "invalid api key",
    });

    await expect(runTavilySearch(defaultParams)).rejects.toThrow("Tavily API error (401)");
  });
});

describe("resolveTavilyConfig", () => {
  it("returns empty object when search config is undefined", () => {
    expect(resolveTavilyConfig(undefined)).toEqual({});
  });

  it("returns empty object when search config has no tavily key", () => {
    expect(resolveTavilyConfig({ enabled: true } as never)).toEqual({});
  });

  it("returns empty object when tavily is not an object", () => {
    expect(resolveTavilyConfig({ tavily: "invalid" } as never)).toEqual({});
  });

  it("returns tavily config when present", () => {
    const config = { tavily: { apiKey: "tvly-key", searchDepth: "basic" } } as never;
    expect(resolveTavilyConfig(config)).toEqual({ apiKey: "tvly-key", searchDepth: "basic" });
  });
});

describe("runTavilySearch (authorization header)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "tvly-secret-key",
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

  it("sends Bearer authorization header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await runTavilySearch(defaultParams);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer tvly-secret-key");
  });
});

describe("runTavilySearch (wrapWebContent)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "tvly-test-key",
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

  it("wraps title and content with web_search markers but keeps URL raw", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Test Title",
            url: "https://example.com",
            content: "Test content body",
            score: 0.9,
          },
        ],
      }),
    });

    const results = await runTavilySearch(defaultParams);
    expect(results).toHaveLength(1);

    // Title and description should be wrapped (contain web_search markers)
    expect(results[0].title).toContain("Test Title");
    expect(results[0].title).not.toBe("Test Title");

    expect(results[0].description).toContain("Test content body");
    expect(results[0].description).not.toBe("Test content body");

    // URL should be raw, not wrapped
    expect(results[0].url).toBe("https://example.com");
  });
});
