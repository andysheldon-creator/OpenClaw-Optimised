import { describe, expect, it, vi, beforeEach } from "vitest";

const mockStore = {
  archiveExpired: vi.fn(),
  searchHybrid: vi.fn(async () => []),
};

vi.mock("../../memory/progressive-manager.js", () => ({
  getProgressiveStore: async () => ({ store: mockStore, embedFn: undefined }),
}));

const mockSearch = vi.fn(async () => [
  {
    path: "MEMORY.md",
    startLine: 1,
    endLine: 2,
    score: 0.9,
    snippet: "Legacy entry",
    source: "memory",
  },
]);

vi.mock("../../memory/index.js", () => ({
  getMemorySearchManager: async () => ({
    manager: {
      search: mockSearch,
      readFile: async () => ({ text: "", path: "" }),
      status: () => ({ backend: "builtin", provider: "builtin" }),
      probeEmbeddingAvailability: async () => ({ ok: true }),
      probeVectorAvailability: async () => false,
    },
  }),
}));

import { createMemoryRecallTool } from "./memory-recall-tool.js";

describe("memory_recall tool", () => {
  beforeEach(() => {
    mockStore.archiveExpired.mockClear();
    mockStore.searchHybrid.mockClear();
    mockSearch.mockClear();
  });

  it("returns legacy fallback results when progressive store is empty", async () => {
    mockStore.searchHybrid.mockResolvedValueOnce([]);
    const tool = createMemoryRecallTool({
      config: { memory: { progressive: { enabled: true } }, agents: { list: [{ id: "main" }] } },
    });
    expect(tool).not.toBeNull();
    if (!tool) {
      throw new Error("tool missing");
    }
    const result = await tool.execute("call_1", { query: "legacy query" });
    expect(result.details.entries).toHaveLength(0);
    expect(result.details.fallback?.results).toHaveLength(1);
    expect(result.details.fallback?.results[0].path).toBe("MEMORY.md");
  });

  it("omits legacy fallback when progressive results exist", async () => {
    mockStore.searchHybrid.mockResolvedValueOnce([
      {
        id: "entry-1",
        category: "fact",
        content: "Progressive entry",
        context: null,
        priority: "high",
        tags: [],
        relatedTo: [],
        score: 0.9,
        createdAt: new Date().toISOString(),
      },
    ]);
    const tool = createMemoryRecallTool({
      config: { memory: { progressive: { enabled: true } }, agents: { list: [{ id: "main" }] } },
    });
    expect(tool).not.toBeNull();
    if (!tool) {
      throw new Error("tool missing");
    }
    const result = await tool.execute("call_2", { query: "progressive query" });
    expect(result.details.entries).toHaveLength(1);
    expect(result.details.fallback).toBeUndefined();
  });
});
