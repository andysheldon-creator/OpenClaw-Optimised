import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSessionHistoryForSdk, readSessionHistory } from "./sdk-session-history.js";

describe("readSessionHistory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-history-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for missing file", () => {
    const result = readSessionHistory(path.join(tmpDir, "missing.jsonl"));
    expect(result).toEqual([]);
  });

  it("returns empty array for empty file", () => {
    const file = path.join(tmpDir, "empty.jsonl");
    fs.writeFileSync(file, "");
    expect(readSessionHistory(file)).toEqual([]);
  });

  it("skips session header lines", () => {
    const file = path.join(tmpDir, "session.jsonl");
    const lines = [
      JSON.stringify({ type: "session_start", sessionId: "s1" }),
      JSON.stringify({ role: "user", content: "hello" }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("hello");
  });

  it("extracts string content", () => {
    const file = path.join(tmpDir, "string.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "question" }),
      JSON.stringify({ role: "assistant", content: "answer" }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("question");
    expect(result[1].content).toBe("answer");
  });

  it("extracts content block arrays", () => {
    const file = path.join(tmpDir, "blocks.jsonl");
    const lines = [
      JSON.stringify({
        role: "assistant",
        content: [
          { type: "text", text: "part 1" },
          { type: "text", text: "part 2" },
        ],
      }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("part 1\npart 2");
  });

  it("skips toolResult entries", () => {
    const file = path.join(tmpDir, "tools.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "run something" }),
      JSON.stringify({ role: "tool", content: "tool output" }),
      JSON.stringify({ type: "toolResult", content: "another tool" }),
      JSON.stringify({ role: "assistant", content: "done" }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("preserves timestamps", () => {
    const file = path.join(tmpDir, "timestamps.jsonl");
    const ts = "2025-01-01T00:00:00Z";
    const lines = [JSON.stringify({ role: "user", content: "hi", timestamp: ts })];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result[0].timestamp).toBe(ts);
  });

  it("handles malformed JSON lines gracefully", () => {
    const file = path.join(tmpDir, "bad.jsonl");
    const lines = ["not valid json", JSON.stringify({ role: "user", content: "valid" }), "{broken"];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("valid");
  });

  it("skips lines with empty content", () => {
    const file = path.join(tmpDir, "empty-content.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "" }),
      JSON.stringify({ role: "assistant", content: "   " }),
      JSON.stringify({ role: "user", content: "real content" }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = readSessionHistory(file);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("real content");
  });
});

describe("loadSessionHistoryForSdk", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-load-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("caps to maxTurns most recent turns", () => {
    const file = path.join(tmpDir, "long.jsonl");
    const lines = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` }),
    );
    fs.writeFileSync(file, lines.join("\n"));
    const result = loadSessionHistoryForSdk({ sessionFile: file, maxTurns: 5 });
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe("msg 25");
    expect(result[4].content).toBe("msg 29");
  });

  it("returns all turns when under maxTurns", () => {
    const file = path.join(tmpDir, "short.jsonl");
    const lines = [
      JSON.stringify({ role: "user", content: "a" }),
      JSON.stringify({ role: "assistant", content: "b" }),
    ];
    fs.writeFileSync(file, lines.join("\n"));
    const result = loadSessionHistoryForSdk({ sessionFile: file, maxTurns: 10 });
    expect(result).toHaveLength(2);
  });

  it("defaults maxTurns to 20", () => {
    const file = path.join(tmpDir, "default.jsonl");
    const lines = Array.from({ length: 25 }, (_, i) =>
      JSON.stringify({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` }),
    );
    fs.writeFileSync(file, lines.join("\n"));
    const result = loadSessionHistoryForSdk({ sessionFile: file });
    expect(result).toHaveLength(20);
  });
});
