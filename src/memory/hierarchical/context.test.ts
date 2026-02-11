import { describe, expect, it, vi } from "vitest";

// Mock storage module
vi.mock("./storage.js", () => ({
  hasSummaries: vi.fn(),
  loadSummaryIndex: vi.fn(),
  loadSummaryContents: vi.fn(),
}));

import { getLastSummarizedEntryId, getMemoryStats, loadMemoryContext } from "./context.js";
import { hasSummaries, loadSummaryContents, loadSummaryIndex } from "./storage.js";
import { createEmptyIndex, type SummaryEntry } from "./types.js";

function makeEntry(
  level: "L1" | "L2" | "L3",
  id: string,
  merged: string | null = null,
): SummaryEntry {
  return {
    id,
    level,
    createdAt: Date.now() - 60000,
    tokenEstimate: 100,
    sourceLevel: level === "L1" ? "L0" : level === "L2" ? "L1" : "L2",
    sourceIds: [],
    mergedInto: merged,
  };
}

describe("loadMemoryContext", () => {
  it("returns null when hasSummaries returns false", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(false);
    expect(await loadMemoryContext("agent")).toBeNull();
  });

  it("returns null when all summary contents are empty", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(true);
    const index = createEmptyIndex("agent");
    index.levels.L1.push(makeEntry("L1", "0001"));
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    vi.mocked(loadSummaryContents).mockResolvedValue([]);

    expect(await loadMemoryContext("agent")).toBeNull();
  });

  it("formats memory section with only L1 summaries", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(true);
    const index = createEmptyIndex("agent");
    index.levels.L1.push(makeEntry("L1", "0001"));
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    vi.mocked(loadSummaryContents).mockImplementation(async (entries) => {
      if (entries.length > 0 && entries[0].level === "L1") {
        return ["I helped with TypeScript."];
      }
      return [];
    });

    const result = await loadMemoryContext("agent");
    expect(result).not.toBeNull();
    expect(result!.memorySection).toContain("### Recent memory");
    expect(result!.memorySection).toContain("I helped with TypeScript.");
    expect(result!.memorySection).not.toContain("### Long-term memory");
    expect(result!.memorySection).not.toContain("### Earlier context");
    expect(result!.counts).toEqual({ L1: 1, L2: 0, L3: 0 });
  });

  it("formats memory section with only L3 summaries", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(true);
    const index = createEmptyIndex("agent");
    index.levels.L3.push(makeEntry("L3", "0001"));
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    vi.mocked(loadSummaryContents).mockImplementation(async (entries) => {
      if (entries.length > 0 && entries[0].level === "L3") {
        return ["Long relationship with the user."];
      }
      return [];
    });

    const result = await loadMemoryContext("agent");
    expect(result).not.toBeNull();
    expect(result!.memorySection).toContain("### Long-term memory");
    expect(result!.memorySection).not.toContain("### Recent memory");
  });

  it("formats memory section with all three levels", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(true);
    const index = createEmptyIndex("agent");
    index.levels.L1.push(makeEntry("L1", "0001"));
    index.levels.L2.push(makeEntry("L2", "0001"));
    index.levels.L3.push(makeEntry("L3", "0001"));
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    vi.mocked(loadSummaryContents).mockImplementation(async (entries) => {
      if (entries.length > 0) {
        return [`Summary at ${entries[0].level}`];
      }
      return [];
    });

    const result = await loadMemoryContext("agent");
    expect(result).not.toBeNull();
    expect(result!.memorySection).toContain("### Long-term memory");
    expect(result!.memorySection).toContain("### Earlier context");
    expect(result!.memorySection).toContain("### Recent memory");
    expect(result!.counts).toEqual({ L1: 1, L2: 1, L3: 1 });
  });

  it("calculates token estimate from section length", async () => {
    vi.mocked(hasSummaries).mockResolvedValue(true);
    const index = createEmptyIndex("agent");
    index.levels.L1.push(makeEntry("L1", "0001"));
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    vi.mocked(loadSummaryContents).mockImplementation(async (entries) => {
      if (entries.length > 0 && entries[0].level === "L1") {
        return ["a".repeat(400)]; // ~100 tokens
      }
      return [];
    });

    const result = await loadMemoryContext("agent");
    expect(result).not.toBeNull();
    expect(result!.tokenEstimate).toBe(Math.ceil(result!.memorySection.length / 4));
  });
});

describe("getLastSummarizedEntryId", () => {
  it("returns null when index has no lastSummarizedEntryId", async () => {
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("agent"));
    expect(await getLastSummarizedEntryId("agent")).toBeNull();
  });

  it("returns the ID when set", async () => {
    const index = createEmptyIndex("agent");
    index.lastSummarizedEntryId = "entry-42";
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);
    expect(await getLastSummarizedEntryId("agent")).toBe("entry-42");
  });

  it("returns null when loadSummaryIndex throws", async () => {
    vi.mocked(loadSummaryIndex).mockRejectedValue(new Error("corrupt"));
    expect(await getLastSummarizedEntryId("agent")).toBeNull();
  });
});

describe("getMemoryStats", () => {
  it("returns null when all levels are empty", async () => {
    vi.mocked(loadSummaryIndex).mockResolvedValue(createEmptyIndex("agent"));
    expect(await getMemoryStats("agent")).toBeNull();
  });

  it("returns correct counts and timestamps", async () => {
    const index = createEmptyIndex("agent");
    index.levels.L1.push(makeEntry("L1", "0001"));
    index.levels.L1.push(makeEntry("L1", "0002"));
    index.levels.L2.push(makeEntry("L2", "0001"));
    index.worker.lastRunAt = Date.now();
    vi.mocked(loadSummaryIndex).mockResolvedValue(index);

    const stats = await getMemoryStats("agent");
    expect(stats).not.toBeNull();
    expect(stats!.totalSummaries).toBe(3);
    expect(stats!.levels).toEqual({ L1: 2, L2: 1, L3: 0 });
  });
});
