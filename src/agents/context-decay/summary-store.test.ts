import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SummaryStore } from "./summary-store.js";
import {
  clearSummaryStore,
  loadSummaryStore,
  loadSummaryStoreSync,
  saveSummaryStore,
} from "./summary-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function sessionPath(): string {
  return path.join(tmpDir, "session.jsonl");
}

function summaryPath(): string {
  return path.join(tmpDir, "session.summaries.json");
}

function makeSampleStore(): SummaryStore {
  return {
    2: {
      summary: "Read file /src/foo.ts, found function bar()",
      originalTokenEstimate: 450,
      summaryTokenEstimate: 12,
      summarizedAt: "2026-01-15T10:00:00.000Z",
      model: "anthropic/claude-haiku-4-5",
    },
    5: {
      summary: "Search returned 3 matches in utils.ts",
      originalTokenEstimate: 200,
      summaryTokenEstimate: 8,
      summarizedAt: "2026-01-15T10:01:00.000Z",
      model: "anthropic/claude-haiku-4-5",
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "summary-store-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("summary-store", () => {
  describe("loadSummaryStore (async)", () => {
    it("returns empty store when file does not exist", async () => {
      const store = await loadSummaryStore(sessionPath());
      expect(store).toEqual({});
    });

    it("returns empty store when file contains invalid JSON", async () => {
      await fs.writeFile(summaryPath(), "not json!", "utf-8");
      const store = await loadSummaryStore(sessionPath());
      expect(store).toEqual({});
    });

    it("returns empty store when file contains a JSON array", async () => {
      await fs.writeFile(summaryPath(), "[1,2,3]", "utf-8");
      const store = await loadSummaryStore(sessionPath());
      expect(store).toEqual({});
    });

    it("loads a valid store", async () => {
      const sample = makeSampleStore();
      await fs.writeFile(summaryPath(), JSON.stringify(sample), "utf-8");
      const store = await loadSummaryStore(sessionPath());
      expect(store).toEqual(sample);
    });
  });

  describe("loadSummaryStoreSync", () => {
    it("returns empty store when file does not exist", () => {
      const store = loadSummaryStoreSync(sessionPath());
      expect(store).toEqual({});
    });

    it("returns empty store when file contains invalid JSON", async () => {
      await fs.writeFile(summaryPath(), "{broken", "utf-8");
      const store = loadSummaryStoreSync(sessionPath());
      expect(store).toEqual({});
    });

    it("loads a valid store", async () => {
      const sample = makeSampleStore();
      await fs.writeFile(summaryPath(), JSON.stringify(sample), "utf-8");
      const store = loadSummaryStoreSync(sessionPath());
      expect(store).toEqual(sample);
    });
  });

  describe("saveSummaryStore", () => {
    it("creates directories and saves a round-trippable store", async () => {
      const nestedSession = path.join(tmpDir, "a", "b", "session.jsonl");
      const sample = makeSampleStore();

      await saveSummaryStore(nestedSession, sample);

      const loaded = await loadSummaryStore(nestedSession);
      expect(loaded).toEqual(sample);
    });

    it("overwrites an existing store", async () => {
      const sample1 = makeSampleStore();
      await saveSummaryStore(sessionPath(), sample1);

      const sample2: SummaryStore = {
        10: {
          summary: "Updated summary",
          originalTokenEstimate: 100,
          summaryTokenEstimate: 5,
          summarizedAt: "2026-02-01T00:00:00.000Z",
          model: "haiku",
        },
      };
      await saveSummaryStore(sessionPath(), sample2);

      const loaded = await loadSummaryStore(sessionPath());
      expect(loaded).toEqual(sample2);
      expect(loaded[2]).toBeUndefined(); // old entry gone
    });

    it("writes pretty-printed JSON", async () => {
      await saveSummaryStore(sessionPath(), makeSampleStore());
      const raw = await fs.readFile(summaryPath(), "utf-8");
      // Pretty-printed JSON has newlines and indentation
      expect(raw).toContain("\n");
      expect(raw).toContain("  ");
    });
  });

  describe("clearSummaryStore", () => {
    it("removes an existing summary store file", async () => {
      await saveSummaryStore(sessionPath(), makeSampleStore());
      // File exists
      await expect(fs.access(summaryPath())).resolves.toBeUndefined();

      await clearSummaryStore(sessionPath());

      // File is gone — load returns empty
      const store = await loadSummaryStore(sessionPath());
      expect(store).toEqual({});
    });

    it("is a no-op when the file does not exist", async () => {
      // Should not throw
      await expect(clearSummaryStore(sessionPath())).resolves.toBeUndefined();
    });
  });
});
