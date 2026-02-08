import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { createWebFetchTool } from "./web-fetch.js";

// Minimal smoke: ensure tool creation works with contextBudget config.

describe("web_fetch (contextBudget)", () => {
  it("creates tool with contextBudget enabled", () => {
    const config = {
      agents: { defaults: { contextBudget: { enabled: true, webFetchMaxChars: 1234 } } },
      tools: { web: { fetch: { enabled: true, maxChars: 9999, firecrawl: { enabled: false } } } },
    } as unknown as OpenClawConfig;
    const tool = createWebFetchTool({ config, sandboxed: false });
    expect(tool?.name).toBe("web_fetch");
  });
});
