import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSummaryContent,
  generateNextSummaryId,
  hasSummaries,
  loadSummaryContents,
  loadSummaryIndex,
  readSummary,
  saveSummaryIndex,
  writeSummary,
} from "./storage.js";
import { createEmptyIndex, type SummaryEntry, type SummaryIndex } from "./types.js";

// Mock the paths module to use a temp directory
vi.mock("../../config/paths.js", () => ({
  resolveStateDir: vi.fn(),
}));

import { resolveStateDir } from "../../config/paths.js";

describe("hierarchical memory storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hierarchical-memory-test-"));
    vi.mocked(resolveStateDir).mockReturnValue(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadSummaryIndex", () => {
    it("returns empty index when file does not exist", async () => {
      const index = await loadSummaryIndex();

      expect(index.version).toBe(1);
      expect(index.lastSummarizedEntryId).toBeNull();
      expect(index.levels.L1).toEqual([]);
      expect(index.levels.L2).toEqual([]);
      expect(index.levels.L3).toEqual([]);
    });

    it("loads existing index from file", async () => {
      const existingIndex: SummaryIndex = {
        version: 1,
        agentId: "main",
        lastSummarizedEntryId: "e100",
        lastSummarizedSessionId: "sess-123",
        levels: {
          L1: [
            {
              id: "0001",
              level: "L1",
              createdAt: 1000,
              tokenEstimate: 900,
              sourceLevel: "L0",
              sourceIds: ["e1", "e2"],
              mergedInto: null,
            },
          ],
          L2: [],
          L3: [],
        },
        worker: {
          lastRunAt: 2000,
          lastRunDurationMs: 500,
          lastError: null,
        },
      };

      // Path structure: <stateDir>/agents/<agentId>/memory/summaries/index.json
      const indexDir = path.join(tempDir, "agents", "main", "memory", "summaries");
      await fs.mkdir(indexDir, { recursive: true });
      await fs.writeFile(path.join(indexDir, "index.json"), JSON.stringify(existingIndex));

      const loaded = await loadSummaryIndex();

      expect(loaded.agentId).toBe("main");
      expect(loaded.lastSummarizedEntryId).toBe("e100");
      expect(loaded.levels.L1).toHaveLength(1);
      expect(loaded.levels.L1[0].id).toBe("0001");
    });
  });

  describe("saveSummaryIndex", () => {
    it("creates directory and saves index", async () => {
      const index = createEmptyIndex("test-agent");
      index.lastSummarizedEntryId = "e50";

      await saveSummaryIndex(index);

      // Path structure: <stateDir>/agents/<agentId>/memory/summaries/index.json
      // When no agentId is passed to saveSummaryIndex, it defaults to "main"
      const indexPath = path.join(tempDir, "agents", "main", "memory", "summaries", "index.json");
      const content = await fs.readFile(indexPath, "utf-8");
      const saved = JSON.parse(content);

      expect(saved.agentId).toBe("test-agent");
      expect(saved.lastSummarizedEntryId).toBe("e50");
    });
  });

  describe("generateNextSummaryId", () => {
    it("returns 0001 for empty level", () => {
      const index = createEmptyIndex("test");
      expect(generateNextSummaryId(index, "L1")).toBe("0001");
    });

    it("increments from existing max", () => {
      const index = createEmptyIndex("test");
      index.levels.L1 = [
        {
          id: "0001",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
        {
          id: "0003",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
      ];

      expect(generateNextSummaryId(index, "L1")).toBe("0004");
    });
  });

  describe("writeSummary / readSummary", () => {
    it("writes and reads summary with metadata", async () => {
      const entry: SummaryEntry = {
        id: "0001",
        level: "L1",
        createdAt: Date.now(),
        tokenEstimate: 950,
        sourceLevel: "L0",
        sourceIds: ["e1", "e2", "e3"],
        sourceSessionId: "sess-abc",
        mergedInto: null,
      };

      const content = "I helped the user understand compression.";

      await writeSummary(entry, content);

      const result = await readSummary("L1", "0001");

      expect(result).not.toBeNull();
      expect(result?.content).toBe(content);
      expect(result?.metadata.id).toBe("0001");
      expect(result?.metadata.level).toBe("L1");
      expect(result?.metadata.sourceIds).toEqual(["e1", "e2", "e3"]);
    });

    it("returns null for non-existent summary", async () => {
      const result = await readSummary("L1", "9999");
      expect(result).toBeNull();
    });
  });

  describe("extractSummaryContent", () => {
    it("strips metadata from full content", () => {
      const full = `<!--
  id: 0001
  level: L1
-->

This is the actual summary content.`;

      const content = extractSummaryContent(full);
      expect(content).toBe("This is the actual summary content.");
    });

    it("returns content as-is if no metadata", () => {
      const content = extractSummaryContent("Just plain content");
      expect(content).toBe("Just plain content");
    });
  });

  // ── Edge case tests ───────────────────────────────────────────

  describe("generateNextSummaryId - edge cases", () => {
    it("handles non-numeric IDs by ignoring them (NaN < max is false)", () => {
      const index = createEmptyIndex("test");
      index.levels.L1 = [
        {
          id: "abc",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
        {
          id: "0002",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
      ];
      // parseInt("abc", 10) = NaN, NaN > 2 is false, so max stays 2
      expect(generateNextSummaryId(index, "L1")).toBe("0003");
    });

    it("handles IDs with leading zeros correctly", () => {
      const index = createEmptyIndex("test");
      index.levels.L1 = [
        {
          id: "0099",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
      ];
      expect(generateNextSummaryId(index, "L1")).toBe("0100");
    });

    it("handles large ID numbers beyond 4-digit padding", () => {
      const index = createEmptyIndex("test");
      index.levels.L1 = [
        {
          id: "9999",
          level: "L1",
          createdAt: 0,
          tokenEstimate: 0,
          sourceLevel: "L0",
          sourceIds: [],
          mergedInto: null,
        },
      ];
      // 10000 padded to 4 is "10000" (5 chars)
      expect(generateNextSummaryId(index, "L1")).toBe("10000");
    });
  });

  describe("loadSummaryIndex - corrupt data", () => {
    it("throws on invalid JSON in index file", async () => {
      const indexDir = path.join(tempDir, "agents", "main", "memory", "summaries");
      await fs.mkdir(indexDir, { recursive: true });
      await fs.writeFile(path.join(indexDir, "index.json"), "not valid json");

      await expect(loadSummaryIndex()).rejects.toThrow();
    });

    it("warns but loads index with unknown version", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const indexDir = path.join(tempDir, "agents", "main", "memory", "summaries");
      await fs.mkdir(indexDir, { recursive: true });
      const index = createEmptyIndex("main");
      (index as { version: number }).version = 99;
      await fs.writeFile(path.join(indexDir, "index.json"), JSON.stringify(index));

      const loaded = await loadSummaryIndex();
      expect(loaded.version).toBe(99);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown summary index version 99"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("readSummary - metadata edge cases", () => {
    it("handles metadata with malformed sourceIds JSON", async () => {
      const entry: SummaryEntry = {
        id: "0010",
        level: "L1",
        createdAt: Date.now(),
        tokenEstimate: 100,
        sourceLevel: "L0",
        sourceIds: ["e1"],
        mergedInto: null,
      };
      await writeSummary(entry, "test content");

      // Manually corrupt the sourceIds in the file
      const { resolveSummaryPath } = await import("./storage.js");
      const filePath = resolveSummaryPath("L1", "0010");
      let raw = await fs.readFile(filePath, "utf-8");
      raw = raw.replace(/sourceIds: \[.*\]/, "sourceIds: [invalid json");
      await fs.writeFile(filePath, raw);

      const result = await readSummary("L1", "0010");
      expect(result).not.toBeNull();
      // Malformed JSON falls back to []
      expect(result?.metadata.sourceIds).toEqual([]);
    });

    it("returns empty metadata when file has no comment block", async () => {
      const { resolveSummaryPath, ensureSummariesDir } = await import("./storage.js");
      await ensureSummariesDir();
      const filePath = resolveSummaryPath("L1", "0020");
      await fs.writeFile(filePath, "Just plain content, no metadata.");

      const result = await readSummary("L1", "0020");
      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual({});
      expect(result?.content).toBe("Just plain content, no metadata.");
    });
  });

  describe("loadSummaryContents", () => {
    it("skips entries whose files are missing", async () => {
      const entry1: SummaryEntry = {
        id: "0001",
        level: "L1",
        createdAt: Date.now(),
        tokenEstimate: 100,
        sourceLevel: "L0",
        sourceIds: [],
        mergedInto: null,
      };
      const entry2: SummaryEntry = {
        id: "0002",
        level: "L1",
        createdAt: Date.now(),
        tokenEstimate: 100,
        sourceLevel: "L0",
        sourceIds: [],
        mergedInto: null,
      };
      // Only write entry1
      await writeSummary(entry1, "first summary");
      // entry2 file does not exist

      const contents = await loadSummaryContents([entry1, entry2]);
      expect(contents).toHaveLength(1);
      expect(contents[0]).toBe("first summary");
    });

    it("returns empty array for empty entries list", async () => {
      const contents = await loadSummaryContents([]);
      expect(contents).toEqual([]);
    });
  });

  describe("hasSummaries", () => {
    it("returns false when no index exists", async () => {
      expect(await hasSummaries()).toBe(false);
    });

    it("returns true when L1 summaries exist", async () => {
      const index = createEmptyIndex("main");
      index.levels.L1.push({
        id: "0001",
        level: "L1",
        createdAt: 0,
        tokenEstimate: 0,
        sourceLevel: "L0",
        sourceIds: [],
        mergedInto: null,
      });
      await saveSummaryIndex(index);

      expect(await hasSummaries()).toBe(true);
    });
  });
});
