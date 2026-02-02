/**
 * Tests for the Rust-backed compaction implementation.
 *
 * These tests mirror index.test.ts to verify the Rust implementation
 * produces equivalent results to the TypeScript implementation.
 */

import { describe, it, expect, vi } from "vitest";
import {
  estimateTokens,
  estimateMessagesTokens,
  canCompact,
  extractToolFailures,
  computeFileLists,
  formatToolFailuresSection,
  formatFileOperationsSection,
  compact,
  createSummarizer,
  calculateMaxInputTokens,
  InputTooLargeError,
  TOKEN_SAFETY_MARGIN,
  type FileOperations,
  type CompactionConfig,
} from "./rust.js";
import type { Message } from "../../crates/compaction/index.js";

// -----------------------------------------------------------------------------
// Token Estimation
// -----------------------------------------------------------------------------

describe("Rust: estimateTokens", () => {
  it("estimates tokens for string content", () => {
    const msg: Message = { role: "user", content: "Hello world" }; // 11 chars
    const tokens = estimateTokens(msg);
    expect(tokens).toBe(3); // ceil(11/4) = 3
  });

  it("estimates tokens for longer text", () => {
    const text = "a".repeat(100);
    const msg: Message = { role: "user", content: text };
    expect(estimateTokens(msg)).toBe(25); // ceil(100/4) = 25
  });

  it("handles content block arrays", () => {
    const msg: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ],
    };
    // "Hello\nWorld" = 11 chars
    expect(estimateTokens(msg)).toBe(3);
  });

  it("handles mixed content blocks", () => {
    const msg: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Hello" },
        { type: "image", data: "..." }, // non-text block
        { type: "text", text: "World" },
      ],
    };
    expect(estimateTokens(msg)).toBe(3);
  });

  it("handles non-string, non-array content via JSON stringify", () => {
    const msg: Message = {
      role: "tool",
      content: { result: "success", count: 42 },
    };
    const tokens = estimateTokens(msg);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("Rust: estimateMessagesTokens", () => {
  it("sums tokens across messages", () => {
    const messages: Message[] = [
      { role: "user", content: "a".repeat(40) }, // 10 tokens
      { role: "assistant", content: "b".repeat(80) }, // 20 tokens
    ];
    expect(estimateMessagesTokens(messages)).toBe(30);
  });

  it("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Input Validation
// -----------------------------------------------------------------------------

describe("Rust: canCompact", () => {
  it("returns ok:true when input fits", () => {
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    const result = canCompact(messages, 1000);
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false when input exceeds limit", () => {
    const messages: Message[] = [{ role: "user", content: "a".repeat(4000) }];
    const result = canCompact(messages, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.inputTokens).toBeGreaterThan(750);
      expect(result.reason).toContain("exceeds limit");
    }
  });

  it("applies safety margin correctly", () => {
    const messages: Message[] = [{ role: "user", content: "a".repeat(400) }]; // 100 tokens

    expect(canCompact(messages, 150).ok).toBe(false);
    expect(canCompact(messages, 200).ok).toBe(true);
  });
});

describe("Rust: InputTooLargeError", () => {
  it("includes helpful information", () => {
    const error = new InputTooLargeError(2000, 1000);
    expect(error.name).toBe("InputTooLargeError");
    expect(error.inputTokens).toBe(2000);
    expect(error.maxTokens).toBe(1000);
    expect(error.message).toContain("2000 tokens");
    expect(error.message).toContain("1000 tokens");
    expect(error.message).toContain("Caller should reduce input size");
  });
});

// -----------------------------------------------------------------------------
// Tool Failure Extraction
// -----------------------------------------------------------------------------

describe("Rust: extractToolFailures", () => {
  it("extracts failures from toolResult messages", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "Command failed: file not found",
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
        details: { exitCode: 1 },
      },
    ];

    const failures = extractToolFailures(messages);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      toolCallId: "call_1",
      toolName: "bash",
      errorSummary: "Command failed: file not found",
      exitCode: 1,
    });
  });

  it("ignores non-error tool results", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "Success",
        toolCallId: "call_1",
        toolName: "bash",
        isError: false,
      },
    ];

    expect(extractToolFailures(messages)).toHaveLength(0);
  });

  it("ignores non-toolResult messages", () => {
    const messages: Message[] = [
      { role: "user", content: "Do something" },
      { role: "assistant", content: "I'll try" },
    ];

    expect(extractToolFailures(messages)).toHaveLength(0);
  });

  it("deduplicates by toolCallId", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "Error 1",
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
      },
      {
        role: "toolResult",
        content: "Error 2",
        toolCallId: "call_1", // same ID
        toolName: "bash",
        isError: true,
      },
    ];

    expect(extractToolFailures(messages)).toHaveLength(1);
  });

  it("truncates long error messages", () => {
    const longError = "x".repeat(300);
    const messages: Message[] = [
      {
        role: "toolResult",
        content: longError,
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
      },
    ];

    const failures = extractToolFailures(messages);
    expect(failures[0].errorSummary.length).toBeLessThanOrEqual(240);
    expect(failures[0].errorSummary).toContain("...");
  });

  it("handles content block arrays", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: [{ type: "text", text: "Error occurred" }],
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
      },
    ];

    const failures = extractToolFailures(messages);
    expect(failures[0].errorSummary).toBe("Error occurred");
  });

  it("provides default for empty error content", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "",
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
      },
    ];

    const failures = extractToolFailures(messages);
    expect(failures[0].errorSummary).toBe("failed (no output)");
  });

  it("normalizes whitespace in error text", () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "Error\n\nwith   multiple\tspaces",
        toolCallId: "call_1",
        toolName: "bash",
        isError: true,
      },
    ];

    const failures = extractToolFailures(messages);
    expect(failures[0].errorSummary).toBe("Error with multiple spaces");
  });
});

// -----------------------------------------------------------------------------
// File Operations
// -----------------------------------------------------------------------------

describe("Rust: computeFileLists", () => {
  it("separates read-only files from modified files", () => {
    const fileOps: FileOperations = {
      read: new Set(["a.ts", "b.ts", "c.ts"]),
      edited: new Set(["b.ts"]),
      written: new Set(["d.ts"]),
    };

    const result = computeFileLists(fileOps);
    expect(result.filesRead).toEqual(["a.ts", "c.ts"]); // sorted, excludes modified
    expect(result.filesModified).toEqual(["b.ts", "d.ts"]); // sorted
  });

  it("handles empty sets", () => {
    const fileOps: FileOperations = {
      read: new Set(),
      edited: new Set(),
      written: new Set(),
    };

    const result = computeFileLists(fileOps);
    expect(result.filesRead).toEqual([]);
    expect(result.filesModified).toEqual([]);
  });

  it("handles overlapping edited and written", () => {
    const fileOps: FileOperations = {
      read: new Set(["a.ts"]),
      edited: new Set(["a.ts"]),
      written: new Set(["a.ts"]),
    };

    const result = computeFileLists(fileOps);
    expect(result.filesRead).toEqual([]); // a.ts was modified
    expect(result.filesModified).toEqual(["a.ts"]);
  });
});

// -----------------------------------------------------------------------------
// Summary Formatting
// -----------------------------------------------------------------------------

describe("Rust: formatToolFailuresSection", () => {
  it("returns empty string for no failures", () => {
    expect(formatToolFailuresSection([])).toBe("");
  });

  it("formats failures with exit codes", () => {
    const failures = [
      { toolCallId: "1", toolName: "bash", errorSummary: "not found", exitCode: 1 },
    ];

    const section = formatToolFailuresSection(failures);
    expect(section).toContain("## Tool Failures");
    expect(section).toContain("- bash (exit 1): not found");
  });

  it("formats failures without exit codes", () => {
    const failures = [
      { toolCallId: "1", toolName: "read", errorSummary: "permission denied" },
    ];

    const section = formatToolFailuresSection(failures);
    expect(section).toContain("- read: permission denied");
  });

  it("limits to 8 failures and shows count", () => {
    const failures = Array.from({ length: 12 }, (_, i) => ({
      toolCallId: String(i),
      toolName: "bash",
      errorSummary: `error ${i}`,
    }));

    const section = formatToolFailuresSection(failures);
    const lines = section.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(9); // 8 failures + "...and 4 more"
    expect(section).toContain("...and 4 more");
  });
});

describe("Rust: formatFileOperationsSection", () => {
  it("returns empty string for no files", () => {
    expect(formatFileOperationsSection([], [])).toBe("");
  });

  it("formats read files", () => {
    const section = formatFileOperationsSection(["a.ts", "b.ts"], []);
    expect(section).toContain("<read-files>");
    expect(section).toContain("a.ts");
    expect(section).toContain("b.ts");
    expect(section).toContain("</read-files>");
  });

  it("formats modified files", () => {
    const section = formatFileOperationsSection([], ["c.ts"]);
    expect(section).toContain("<modified-files>");
    expect(section).toContain("c.ts");
    expect(section).toContain("</modified-files>");
  });

  it("formats both read and modified", () => {
    const section = formatFileOperationsSection(["a.ts"], ["b.ts"]);
    expect(section).toContain("<read-files>");
    expect(section).toContain("<modified-files>");
  });
});

// -----------------------------------------------------------------------------
// Core Compaction
// -----------------------------------------------------------------------------

describe("Rust: compact", () => {
  const mockFileOps: FileOperations = {
    read: new Set(["read.ts"]),
    edited: new Set(["edited.ts"]),
    written: new Set(),
  };

  it("compacts messages with metadata", async () => {
    const messages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize: vi.fn().mockResolvedValue("Summary of conversation"),
    };

    const result = await compact(messages, mockFileOps, config);

    expect(result.summary).toContain("Summary of conversation");
    expect(result.summary).toContain("<read-files>");
    expect(result.summary).toContain("<modified-files>");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.metadata.filesRead).toEqual(["read.ts"]);
    expect(result.metadata.filesModified).toEqual(["edited.ts"]);
  });

  it("throws InputTooLargeError when input exceeds limit", async () => {
    const messages: Message[] = [{ role: "user", content: "a".repeat(10000) }];

    const config: CompactionConfig = {
      maxInputTokens: 100,
      summarize: vi.fn(),
    };

    await expect(compact(messages, mockFileOps, config)).rejects.toThrow(
      InputTooLargeError
    );
    expect(config.summarize).not.toHaveBeenCalled();
  });

  it("handles empty messages", async () => {
    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize: vi.fn(),
    };

    const result = await compact([], mockFileOps, config);

    expect(result.summary).toBe("No prior conversation history.");
    expect(result.inputTokens).toBe(0);
    expect(config.summarize).not.toHaveBeenCalled();
  });

  it("uses previousSummary when provided with empty messages", async () => {
    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize: vi.fn(),
      previousSummary: "Earlier context here",
    };

    const result = await compact([], mockFileOps, config);

    expect(result.summary).toBe("Earlier context here");
  });

  it("includes tool failures in result", async () => {
    const messages: Message[] = [
      {
        role: "toolResult",
        content: "file not found",
        toolCallId: "call_1",
        toolName: "read",
        isError: true,
        details: { exitCode: 1 },
      },
    ];

    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize: vi.fn().mockResolvedValue("Summary"),
    };

    const result = await compact(messages, mockFileOps, config);

    expect(result.metadata.toolFailures).toHaveLength(1);
    expect(result.summary).toContain("## Tool Failures");
    expect(result.summary).toContain("read (exit 1)");
  });

  it("uses fallback when summarizer throws", async () => {
    const messages: Message[] = [{ role: "user", content: "Hello" }];

    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize: vi.fn().mockRejectedValue(new Error("API error")),
    };

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await compact(messages, mockFileOps, config);

    expect(result.summary).toContain("Summary unavailable");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("passes previousSummary to summarizer", async () => {
    const messages: Message[] = [{ role: "user", content: "Hello" }];

    const summarize = vi.fn().mockResolvedValue("New summary");
    const config: CompactionConfig = {
      maxInputTokens: 10000,
      summarize,
      previousSummary: "Previous context",
    };

    await compact(messages, mockFileOps, config);

    expect(summarize).toHaveBeenCalledWith(messages, "Previous context");
  });
});

// -----------------------------------------------------------------------------
// Summarizer Factory
// -----------------------------------------------------------------------------

describe("Rust: createSummarizer", () => {
  it("creates a function that calls the model", async () => {
    const callModel = vi.fn().mockResolvedValue("Model summary");
    const summarizer = createSummarizer({
      contextWindow: 100000,
      callModel,
    });

    const messages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];

    const result = await summarizer(messages);

    expect(result).toBe("Model summary");
    expect(callModel).toHaveBeenCalledTimes(1);
    const prompt = callModel.mock.calls[0][0];
    expect(prompt).toContain("Summarize this conversation");
    expect(prompt).toContain("[user]: Hello");
    expect(prompt).toContain("[assistant]: Hi!");
  });

  it("includes previousSummary in prompt", async () => {
    const callModel = vi.fn().mockResolvedValue("Model summary");
    const summarizer = createSummarizer({
      contextWindow: 100000,
      callModel,
    });

    await summarizer([{ role: "user", content: "test" }], "Earlier context");

    const prompt = callModel.mock.calls[0][0];
    expect(prompt).toContain("Previous context:");
    expect(prompt).toContain("Earlier context");
  });

  it("includes customInstructions in prompt", async () => {
    const callModel = vi.fn().mockResolvedValue("Model summary");
    const summarizer = createSummarizer({
      contextWindow: 100000,
      callModel,
      customInstructions: "Focus on code changes",
    });

    await summarizer([{ role: "user", content: "test" }]);

    const prompt = callModel.mock.calls[0][0];
    expect(prompt).toContain("Additional focus: Focus on code changes");
  });

  it("passes abort signal to model", async () => {
    const callModel = vi.fn().mockResolvedValue("Model summary");
    const controller = new AbortController();
    const summarizer = createSummarizer({
      contextWindow: 100000,
      callModel,
      signal: controller.signal,
    });

    await summarizer([{ role: "user", content: "test" }]);

    expect(callModel).toHaveBeenCalledWith(expect.any(String), controller.signal);
  });
});

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

describe("Rust: calculateMaxInputTokens", () => {
  it("applies safety margin and output reservation", () => {
    const result = calculateMaxInputTokens(120000);
    // 120000 / 1.2 = 100000, * 0.75 = 75000
    expect(result).toBe(75000);
  });

  it("handles smaller context windows", () => {
    const result = calculateMaxInputTokens(8000);
    // 8000 / 1.2 = 6666.67, * 0.75 = 5000
    expect(result).toBe(5000);
  });
});

describe("Rust: TOKEN_SAFETY_MARGIN", () => {
  it("is 1.2 (20% buffer)", () => {
    expect(TOKEN_SAFETY_MARGIN).toBe(1.2);
  });
});
