import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSummaryContent,
  generateNextSummaryId,
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
        agentId: "test-agent",
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

      expect(loaded.agentId).toBe("test-agent");
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
});
