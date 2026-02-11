import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { DEFAULT_HIERARCHICAL_MEMORY_CONFIG, createEmptyIndex } from "./types.js";

// Mock all external dependencies
vi.mock("../../config/config.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../../config/sessions.js", () => ({ loadSessionStore: vi.fn() }));
vi.mock("../../config/sessions/paths.js", () => ({
  resolveSessionFilePath: vi.fn(() => "/tmp/session.jsonl"),
  resolveStorePath: vi.fn(() => "/tmp/sessions.json"),
}));
vi.mock("../../agents/model-auth.js", () => ({
  getApiKeyForModel: vi.fn(),
}));
vi.mock("./lock.js", () => ({
  acquireSummaryLock: vi.fn(),
}));
vi.mock("./storage.js", () => ({
  loadSummaryIndex: vi.fn(),
  saveSummaryIndex: vi.fn(),
  writeSummary: vi.fn(),
  generateNextSummaryId: vi.fn(() => "0001"),
  loadSummaryContents: vi.fn(async () => []),
}));
vi.mock("./config.js", () => ({
  resolveHierarchicalMemoryConfig: vi.fn(),
}));

// Mock SessionManager
vi.mock("@mariozechner/pi-coding-agent", () => ({
  SessionManager: {
    open: vi.fn(),
  },
}));

import { SessionManager } from "@mariozechner/pi-coding-agent";
import { getApiKeyForModel } from "../../agents/model-auth.js";
import { loadSessionStore } from "../../config/sessions.js";
import { resolveHierarchicalMemoryConfig } from "./config.js";
import { acquireSummaryLock } from "./lock.js";
import { loadSummaryIndex, saveSummaryIndex } from "./storage.js";
import { runHierarchicalMemoryWorker } from "./worker.js";

const TEST_CONFIG = {} as OpenClawConfig;

describe("runHierarchicalMemoryWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns skipped:disabled when memory is disabled", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: false,
    });

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe("disabled");
  });

  it("returns skipped:lock_held when lock cannot be acquired", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue(null);

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe("lock_held");
  });

  it("returns skipped:no_session when session store has no entry", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("test"));
    vi.mocked(loadSessionStore).mockReturnValue({});

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe("no_session");
  });

  it("returns error when API key resolution fails", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("test"));
    vi.mocked(loadSessionStore).mockReturnValue({
      "agent:test:main": { sessionId: "sess-1", agentId: "test" },
    });
    vi.mocked(getApiKeyForModel).mockResolvedValue({ apiKey: null } as ReturnType<
      typeof getApiKeyForModel
    > extends Promise<infer T>
      ? T
      : never);

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("summarization parameters");
  });

  it("returns success with 0 chunks when session file is invalid", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
      pruningBoundaryTokens: 0,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("test"));
    vi.mocked(loadSessionStore).mockReturnValue({
      "agent:test:main": { sessionId: "sess-1", agentId: "test", model: "anthropic/claude-sonnet" },
    });
    vi.mocked(getApiKeyForModel).mockResolvedValue({ apiKey: "sk-test" } as ReturnType<
      typeof getApiKeyForModel
    > extends Promise<infer T>
      ? T
      : never);
    // SessionManager.open throws (file doesn't exist)
    vi.mocked(SessionManager.open).mockImplementation(() => {
      throw new Error("file not found");
    });

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(true);
    expect(result.chunksProcessed).toBe(0);
  });

  it("returns success with 0 chunks when session has no entries", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("test"));
    vi.mocked(loadSessionStore).mockReturnValue({
      "agent:test:main": { sessionId: "sess-1", agentId: "test", model: "anthropic/claude-sonnet" },
    });
    vi.mocked(getApiKeyForModel).mockResolvedValue({ apiKey: "sk-test" } as ReturnType<
      typeof getApiKeyForModel
    > extends Promise<infer T>
      ? T
      : never);
    vi.mocked(SessionManager.open).mockReturnValue({
      getEntries: () => [],
      buildSessionContext: () => ({ messages: [] }),
    } as unknown as ReturnType<typeof SessionManager.open>);

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(true);
    expect(result.chunksProcessed).toBe(0);
  });

  it("releases lock even when worker throws", async () => {
    const releaseMock = vi.fn();
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: releaseMock });
    vi.mocked(loadSummaryIndex).mockRejectedValue(new Error("index corrupt"));

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("index corrupt");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("saves error state in index when worker fails", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    // First call: loadSummaryIndex in runWorkerWithLock (triggers error path)
    // The error handler tries to load index again to save error state
    const emptyIndex = createEmptyIndex("test");
    vi.mocked(loadSummaryIndex).mockResolvedValue(emptyIndex);
    vi.mocked(loadSessionStore).mockImplementation(() => {
      throw new Error("session store broken");
    });

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("session store broken");
    // saveSummaryIndex should have been called in the error handler
    expect(saveSummaryIndex).toHaveBeenCalled();
  });

  it("handles saveSummaryIndex failure in error handler gracefully", async () => {
    vi.mocked(resolveHierarchicalMemoryConfig).mockReturnValue({
      ...DEFAULT_HIERARCHICAL_MEMORY_CONFIG,
      enabled: true,
    });
    vi.mocked(acquireSummaryLock).mockResolvedValue({ release: vi.fn() });
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("test"));
    vi.mocked(loadSessionStore).mockImplementation(() => {
      throw new Error("original error");
    });
    // Make saveSummaryIndex also fail in the error handler
    vi.mocked(saveSummaryIndex).mockRejectedValue(new Error("save also failed"));

    const result = await runHierarchicalMemoryWorker({
      agentId: "test",
      config: TEST_CONFIG,
    });

    // Should still return the original error, not crash
    expect(result.success).toBe(false);
    expect(result.error).toContain("original error");
  });
});
