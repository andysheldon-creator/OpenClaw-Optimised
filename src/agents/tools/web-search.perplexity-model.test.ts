import { describe, expect, it } from "vitest";
import { normalizePerplexityModelForBaseUrl } from "./web-search.js";

describe("web_search perplexity model normalization", () => {
  it("strips provider namespace for Perplexity direct baseUrl", () => {
    const model = normalizePerplexityModelForBaseUrl({
      model: "perplexity/sonar-pro",
      baseUrl: "https://api.perplexity.ai",
    });
    expect(model).toBe("sonar-pro");
  });

  it("keeps namespaced model for OpenRouter baseUrl", () => {
    const model = normalizePerplexityModelForBaseUrl({
      model: "perplexity/sonar-pro",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(model).toBe("perplexity/sonar-pro");
  });
});
