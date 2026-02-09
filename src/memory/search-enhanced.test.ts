import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import {
  hashFileContent,
  FileHashTracker,
  formatSearchResults,
  chunkContent,
  type EnhancedSearchOutput,
} from "./search-enhanced.js";

describe("hashFileContent", () => {
  it("returns consistent 16-char hash", () => {
    expect(hashFileContent("hello")).toBe(hashFileContent("hello"));
    expect(hashFileContent("hello")).toHaveLength(16);
  });
  it("different content different hash", () => {
    expect(hashFileContent("a")).not.toBe(hashFileContent("b"));
  });
});

describe("FileHashTracker", () => {
  it("tracks and persists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ht-"));
    const sp = path.join(tmp, "h.json");
    const t = new FileHashTracker(sp);
    expect(t.needsReindex("f", "v1")).toBe(true);
    expect(t.needsReindex("f", "v1")).toBe(false);
    expect(t.needsReindex("f", "v2")).toBe(true);
    t.save();
    const t2 = new FileHashTracker(sp);
    expect(t2.needsReindex("f", "v2")).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe("chunkContent", () => {
  it("splits long content", () => {
    const content = Array.from({ length: 100 }, (_, i) => `Line ${i}: ${"x".repeat(20)}`).join(
      "\n",
    );
    expect(chunkContent(content, 200).length).toBeGreaterThan(1);
  });
  it("single chunk for short content", () => {
    expect(chunkContent("hello\nworld", 1000)).toHaveLength(1);
  });
});

describe("formatSearchResults", () => {
  it("formats empty", () => {
    expect(
      formatSearchResults({ results: [], searchTimeMs: 5, totalChunks: 100, query: "test" }),
    ).toContain("No results");
  });
  it("formats with scores", () => {
    const out: EnhancedSearchOutput = {
      results: [
        {
          snippet: "Found",
          path: "MEMORY.md",
          startLine: 1,
          endLine: 5,
          score: 0.92,
          source: "memory",
        },
      ],
      searchTimeMs: 3,
      totalChunks: 50,
      query: "test",
    };
    const f = formatSearchResults(out);
    expect(f).toContain("92.0%");
    expect(f).toContain("MEMORY.md:1-5");
  });
});
