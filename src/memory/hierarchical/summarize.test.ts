import { describe, expect, it } from "vitest";
import { estimateMessagesTokens, getNextLevel, getSourceLevel } from "./summarize.js";

describe("estimateMessagesTokens", () => {
  it("returns 0 for empty messages array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it("estimates tokens for string content", () => {
    // "hello" = 5 chars, ceil(5/4) = 2
    expect(estimateMessagesTokens([{ role: "user", content: "hello" }])).toBe(2);
  });

  it("handles null content via JSON.stringify", () => {
    // typeof null !== "string", so JSON.stringify(null) = "null" (4 chars), ceil(4/4) = 1
    expect(estimateMessagesTokens([{ role: "user", content: null }])).toBe(1);
  });

  it("handles undefined content via fallback", () => {
    // undefined ?? "" = "", JSON.stringify("") = '""' (2 chars), ceil(2/4) = 1
    expect(estimateMessagesTokens([{ role: "user" }])).toBe(1);
  });

  it("handles object content via JSON.stringify", () => {
    const content = [{ type: "text", text: "hello world" }];
    const serialized = JSON.stringify(content);
    const expected = Math.ceil(serialized.length / 4);
    expect(estimateMessagesTokens([{ role: "assistant", content }])).toBe(expected);
  });

  it("handles numeric content", () => {
    // typeof 42 !== "string", JSON.stringify(42) = "42" (2 chars), ceil(2/4) = 1
    expect(estimateMessagesTokens([{ role: "user", content: 42 }])).toBe(1);
  });

  it("sums tokens across multiple messages", () => {
    const result = estimateMessagesTokens([
      { role: "user", content: "a".repeat(100) }, // ceil(100/4) = 25
      { role: "assistant", content: "b".repeat(200) }, // ceil(200/4) = 50
    ]);
    expect(result).toBe(75);
  });

  it("handles empty string content", () => {
    expect(estimateMessagesTokens([{ role: "user", content: "" }])).toBe(0);
  });
});

describe("getNextLevel", () => {
  it("returns L2 for L1", () => {
    expect(getNextLevel("L1")).toBe("L2");
  });

  it("returns L3 for L2", () => {
    expect(getNextLevel("L2")).toBe("L3");
  });

  it("returns null for L3", () => {
    expect(getNextLevel("L3")).toBeNull();
  });
});

describe("getSourceLevel", () => {
  it("returns L0 for L1", () => {
    expect(getSourceLevel("L1")).toBe("L0");
  });

  it("returns L1 for L2", () => {
    expect(getSourceLevel("L2")).toBe("L1");
  });

  it("returns L2 for L3", () => {
    expect(getSourceLevel("L3")).toBe("L2");
  });
});
