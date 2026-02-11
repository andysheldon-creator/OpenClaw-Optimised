import { describe, expect, it } from "vitest";
import {
  buildChunkSummarizationPrompt,
  buildMergeSummariesPrompt,
  formatMessagesForSummary,
} from "./prompts.js";

describe("formatMessagesForSummary", () => {
  it("formats user and assistant messages correctly", () => {
    const result = formatMessagesForSummary([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(result).toContain("User: hello");
    expect(result).toContain("Me: hi there");
  });

  it("handles empty messages array", () => {
    expect(formatMessagesForSummary([])).toBe("");
  });

  it("handles message with null content", () => {
    const result = formatMessagesForSummary([{ role: "user", content: null }]);
    // null is not string and not array, so content stays ""
    expect(result).toBe("User: ");
  });

  it("handles message with undefined content", () => {
    const result = formatMessagesForSummary([{ role: "user" }]);
    expect(result).toBe("User: ");
  });

  it("handles message with array content (text blocks)", () => {
    const result = formatMessagesForSummary([
      {
        role: "assistant",
        content: [
          { type: "text", text: "hello" },
          { type: "image", data: "..." },
          { type: "text", text: "world" },
        ],
      },
    ]);
    expect(result).toBe("Me: hello\nworld");
  });

  it("truncates long content to maxContentChars", () => {
    const longContent = "a".repeat(3000);
    const result = formatMessagesForSummary([{ role: "user", content: longContent }]);
    expect(result).toContain("... [truncated]");
    expect(result.length).toBeLessThan(3000);
  });

  it("respects custom maxContentChars option", () => {
    const result = formatMessagesForSummary([{ role: "user", content: "a".repeat(200) }], {
      maxContentChars: 100,
    });
    expect(result).toContain("... [truncated]");
  });

  it("skips toolResult messages by default", () => {
    const result = formatMessagesForSummary([
      { role: "user", content: "run this" },
      { role: "toolResult", content: "output here", toolName: "bash" },
      { role: "assistant", content: "done" },
    ]);
    expect(result).not.toContain("bash");
    expect(result).toContain("User: run this");
    expect(result).toContain("Me: done");
  });

  it("includes toolResult when includeToolResults is true", () => {
    const result = formatMessagesForSummary(
      [{ role: "toolResult", content: "output here", toolName: "bash" }],
      { includeToolResults: true },
    );
    expect(result).toContain("[bash:");
  });

  it("shows error status for tool results with isError", () => {
    const result = formatMessagesForSummary(
      [{ role: "toolResult", content: "failed", toolName: "bash", isError: true }],
      { includeToolResults: true },
    );
    expect(result).toContain("[bash (error):");
  });

  it("skips unknown roles", () => {
    const result = formatMessagesForSummary([{ role: "system", content: "you are helpful" }]);
    expect(result).toBe("");
  });
});

describe("buildChunkSummarizationPrompt", () => {
  it("includes prior summaries section when provided", () => {
    const result = buildChunkSummarizationPrompt({
      priorSummaries: ["I remember the user likes TypeScript."],
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result).toContain("My earlier memories");
    expect(result).toContain("I remember the user likes TypeScript.");
  });

  it("omits prior summaries section when empty", () => {
    const result = buildChunkSummarizationPrompt({
      priorSummaries: [],
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result).not.toContain("My earlier memories");
  });
});

describe("buildMergeSummariesPrompt", () => {
  it("includes older context section when provided", () => {
    const result = buildMergeSummariesPrompt({
      summaries: ["Memory 1"],
      olderContext: ["Long-term context"],
    });
    expect(result).toContain("Long-term memory");
    expect(result).toContain("Long-term context");
  });

  it("omits older context when undefined", () => {
    const result = buildMergeSummariesPrompt({
      summaries: ["Memory 1"],
    });
    expect(result).not.toContain("Long-term memory");
  });

  it("omits older context when empty array", () => {
    const result = buildMergeSummariesPrompt({
      summaries: ["Memory 1"],
      olderContext: [],
    });
    expect(result).not.toContain("Long-term memory");
  });
});
