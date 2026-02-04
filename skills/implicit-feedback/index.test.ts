import { describe, it, expect, vi } from "vitest";
import skill from "./index.js";

// Mock internal modules
vi.mock("../../src/memory/embeddings.ts", () => ({
  createEmbeddingProvider: vi.fn(),
}));

vi.mock("../../src/config/config.ts", () => ({
  loadConfig: vi.fn(() => ({})),
}));

import { createEmbeddingProvider } from "../../src/memory/embeddings.ts";

describe("implicit-feedback skill", () => {
  it("registers the tool", async () => {
    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "semantic_compare",
      }),
    );
  });

  it("calculates similarity correctly", async () => {
    const mockEmbedQuery = vi.fn();
    (createEmbeddingProvider as any).mockResolvedValue({
      provider: {
        embedQuery: mockEmbedQuery,
      },
    });

    // Mock embeddings: [1, 0] and [0, 1] -> orthogonal -> similarity 0
    // [1, 0] and [1, 0] -> identical -> similarity 1
    mockEmbedQuery
      .mockResolvedValueOnce([1, 0]) // Text 1
      .mockResolvedValueOnce([1, 0]); // Text 2

    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    const toolDef = (api.registerTool as any).mock.calls[0][0];

    const result = await toolDef.func({ text1: "a", text2: "a", threshold: 0.8 });
    expect(result.similarity).toBeCloseTo(1);
    expect(result.is_similar).toBe(true);
  });

  it("handles dissimilar texts", async () => {
    const mockEmbedQuery = vi.fn();
    (createEmbeddingProvider as any).mockResolvedValue({
      provider: {
        embedQuery: mockEmbedQuery,
      },
    });

    mockEmbedQuery.mockResolvedValueOnce([1, 0]).mockResolvedValueOnce([0, 1]);

    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    const toolDef = (api.registerTool as any).mock.calls[0][0];

    const result = await toolDef.func({ text1: "a", text2: "b", threshold: 0.8 });
    expect(result.similarity).toBeCloseTo(0);
    expect(result.is_similar).toBe(false);
  });
});
