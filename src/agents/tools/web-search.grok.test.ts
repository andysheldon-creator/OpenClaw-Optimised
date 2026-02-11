import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./web-search.js";

const { resolveGrokApiKey, resolveGrokModel, runGrokSearch } = __testing;

describe("web_search grok config resolution", () => {
  it("uses config apiKey when provided", () => {
    expect(resolveGrokApiKey({ apiKey: "xai-test-key" })).toBe("xai-test-key");
  });

  it("returns undefined when no apiKey is available", () => {
    const previous = process.env.XAI_API_KEY;
    try {
      delete process.env.XAI_API_KEY;
      expect(resolveGrokApiKey({})).toBeUndefined();
      expect(resolveGrokApiKey(undefined)).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.XAI_API_KEY;
      } else {
        process.env.XAI_API_KEY = previous;
      }
    }
  });

  it("uses default model when not specified", () => {
    expect(resolveGrokModel({})).toBe("grok-4-1-fast-reasoning");
    expect(resolveGrokModel(undefined)).toBe("grok-4-1-fast-reasoning");
  });

  it("uses config model when provided", () => {
    expect(resolveGrokModel({ model: "grok-3" })).toBe("grok-3");
  });
});

type GrokFixture = {
  description: string;
  response: Record<string, unknown>;
  expect: {
    contentsLength: number;
    contentsContains?: string[];
    citationsLength: number;
    citationUrls?: string[];
  };
};

const FIXTURES_DIR = path.resolve(import.meta.dirname, "__fixtures__/grok");

function loadGrokFixtures(): { name: string; fixture: GrokFixture }[] {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
    return { name: file.replace(/\.json$/, ""), fixture: JSON.parse(raw) as GrokFixture };
  });
}

describe("running grok web searches (fixtures)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "xai-test-key",
    model: "grok-4-1-fast-reasoning",
    timeoutSeconds: 30,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fixtures = loadGrokFixtures();

  for (const { name, fixture } of fixtures) {
    describe(`fixture: ${name}`, () => {
      it(fixture.description, async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => fixture.response,
        });

        const result = await runGrokSearch(defaultParams);

        expect(result.contents).toHaveLength(fixture.expect.contentsLength);
        expect(result.citations).toHaveLength(fixture.expect.citationsLength);

        if (fixture.expect.contentsContains) {
          for (const substring of fixture.expect.contentsContains) {
            const found = result.contents.some((c) => c.includes(substring));
            expect(found, `expected some content to contain "${substring}"`).toBe(true);
          }
        }

        if (fixture.expect.citationUrls) {
          for (const expectedUrl of fixture.expect.citationUrls) {
            const found = result.citations.some((c) => c.url.includes(expectedUrl));
            expect(found, `expected some citation url to contain "${expectedUrl}"`).toBe(true);
          }
        }
      });
    });
  }
});

describe("runGrokSearch (error handling)", () => {
  const mockFetch = vi.fn();
  const defaultParams = {
    query: "test query",
    apiKey: "xai-test-key",
    model: "grok-4-1-fast-reasoning",
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
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "rate limited",
    });

    await expect(runGrokSearch(defaultParams)).rejects.toThrow("xAI API error (429)");
  });
});
