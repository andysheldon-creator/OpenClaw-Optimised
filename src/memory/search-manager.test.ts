import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrimary = {
  search: vi.fn(async () => []),
  readFile: vi.fn(async () => ({ text: "", path: "MEMORY.md" })),
  status: vi.fn(() => ({
    backend: "qmd" as const,
    provider: "qmd",
    model: "qmd",
    requestedProvider: "qmd",
    files: 0,
    chunks: 0,
    dirty: false,
    workspaceDir: "/tmp",
    dbPath: "/tmp/index.sqlite",
    sources: ["memory" as const],
    sourceCounts: [{ source: "memory" as const, files: 0, chunks: 0 }],
  })),
  sync: vi.fn(async () => {}),
  probeEmbeddingAvailability: vi.fn(async () => ({ ok: true })),
  probeVectorAvailability: vi.fn(async () => true),
  close: vi.fn(async () => {}),
};

vi.mock("./qmd-manager.js", () => ({
  QmdMemoryManager: {
    create: vi.fn(async () => mockPrimary),
  },
}));

vi.mock("./manager.js", () => ({
  MemoryIndexManager: {
    get: vi.fn(async () => null),
  },
}));

import { MemoryIndexManager } from "./manager.js";
import { QmdMemoryManager } from "./qmd-manager.js";
import { getMemorySearchManager } from "./search-manager.js";

beforeEach(() => {
  mockPrimary.search.mockClear();
  mockPrimary.readFile.mockClear();
  mockPrimary.status.mockClear();
  mockPrimary.sync.mockClear();
  mockPrimary.probeEmbeddingAvailability.mockClear();
  mockPrimary.probeVectorAvailability.mockClear();
  mockPrimary.close.mockClear();
  QmdMemoryManager.create.mockClear();
  MemoryIndexManager.get.mockClear();
});

describe("getMemorySearchManager caching", () => {
  it("reuses the same QMD manager instance for repeated calls", async () => {
    const cfg = {
      memory: { backend: "qmd", qmd: {} },
      agents: { list: [{ id: "main", default: true, workspace: "/tmp/workspace" }] },
    } as const;

    const first = await getMemorySearchManager({ cfg, agentId: "main" });
    const second = await getMemorySearchManager({ cfg, agentId: "main" });

    expect(first.manager).toBe(second.manager);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(QmdMemoryManager.create).toHaveBeenCalledTimes(1);
  });
});

describe("FallbackMemoryManager QMD recovery", () => {
  const mockFallback = {
    search: vi.fn(async () => [
      {
        path: "MEMORY.md",
        startLine: 1,
        endLine: 1,
        score: 1,
        snippet: "",
        source: "memory" as const,
      },
    ]),
    readFile: vi.fn(async () => ({ text: "", path: "MEMORY.md" })),
    status: vi.fn(() => mockPrimary.status()),
    sync: vi.fn(async () => {}),
    probeEmbeddingAvailability: vi.fn(async () => ({ ok: true })),
    probeVectorAvailability: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };

  beforeEach(() => {
    mockFallback.search.mockClear();
    mockFallback.readFile.mockClear();
    mockFallback.status.mockClear();
    mockFallback.sync.mockClear();
    mockFallback.probeEmbeddingAvailability.mockClear();
    mockFallback.probeVectorAvailability.mockClear();
    mockFallback.close.mockClear();
  });

  it("falls back per-query on transient errors without closing QMD", async () => {
    MemoryIndexManager.get.mockResolvedValue(mockFallback);
    mockPrimary.search
      .mockRejectedValueOnce(new Error("qmd query timed out after 100ms"))
      .mockResolvedValueOnce([]);

    const cfg = {
      memory: { backend: "qmd", qmd: {} },
      agents: { list: [{ id: "timeout", default: true, workspace: "/tmp/workspace" }] },
    } as const;

    const result = await getMemorySearchManager({ cfg, agentId: "timeout" });
    expect(result.manager).not.toBeNull();

    const first = await result.manager!.search("hello");
    const second = await result.manager!.search("hello");

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(mockPrimary.close).not.toHaveBeenCalled();
    expect(mockPrimary.search).toHaveBeenCalledTimes(2);
    expect(mockFallback.search).toHaveBeenCalledTimes(1);
  });

  it("disables and closes QMD after 5 consecutive non-transient failures", async () => {
    MemoryIndexManager.get.mockResolvedValue(mockFallback);
    mockPrimary.search.mockRejectedValue(new Error("qmd query failed (code 1): bad"));

    const cfg = {
      memory: { backend: "qmd", qmd: {} },
      agents: { list: [{ id: "fatal", default: true, workspace: "/tmp/workspace" }] },
    } as const;

    const result = await getMemorySearchManager({ cfg, agentId: "fatal" });
    expect(result.manager).not.toBeNull();

    for (let i = 0; i < 6; i += 1) {
      const res = await result.manager!.search("hello");
      expect(res).toHaveLength(1);
    }

    // 5 attempts reach the threshold, 6th bypasses primary entirely.
    expect(mockPrimary.search).toHaveBeenCalledTimes(5);
    expect(mockPrimary.close).toHaveBeenCalledTimes(1);
    expect(mockFallback.search).toHaveBeenCalledTimes(6);
  });

  it("resets the failure counter when QMD succeeds after previous failures", async () => {
    MemoryIndexManager.get.mockResolvedValue(mockFallback);
    mockPrimary.search
      .mockRejectedValueOnce(new Error("qmd query failed (code 1): bad"))
      .mockRejectedValueOnce(new Error("qmd query failed (code 1): bad"))
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error("qmd query failed (code 1): bad"));

    const cfg = {
      memory: { backend: "qmd", qmd: {} },
      agents: { list: [{ id: "reset", default: true, workspace: "/tmp/workspace" }] },
    } as const;

    const result = await getMemorySearchManager({ cfg, agentId: "reset" });
    expect(result.manager).not.toBeNull();

    // 2 failures -> fallback; 1 success -> primary; then 4 failures -> fallback.
    for (let i = 0; i < 7; i += 1) {
      await result.manager!.search("hello");
    }

    // If the counter had not reset after the success, we would have hit 5 consecutive failures and closed.
    expect(mockPrimary.close).not.toHaveBeenCalled();
  });
});
