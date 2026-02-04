import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import {
  chunkMessagesByMaxTokens,
  estimateMessagesTokens,
  isOversizedForSummary,
  pruneHistoryForContextShare,
  splitMessagesByTokenShare,
  summarizeWithFallback,
} from "./compaction.js";

function makeMessage(id: number, size: number): AgentMessage {
  return {
    role: "user",
    content: "x".repeat(size),
    timestamp: id,
  };
}

describe("splitMessagesByTokenShare", () => {
  it("splits messages into two non-empty parts", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
    ];

    const parts = splitMessagesByTokenShare(messages, 2);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]?.length).toBeGreaterThan(0);
    expect(parts[1]?.length).toBeGreaterThan(0);
    expect(parts.flat().length).toBe(messages.length);
  });

  it("preserves message order across parts", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
      makeMessage(5, 4000),
      makeMessage(6, 4000),
    ];

    const parts = splitMessagesByTokenShare(messages, 3);
    expect(parts.flat().map((msg) => msg.timestamp)).toEqual(messages.map((msg) => msg.timestamp));
  });
});

describe("pruneHistoryForContextShare", () => {
  it("drops older chunks until the history budget is met", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
    ];
    const maxContextTokens = 2000; // budget is 1000 tokens (50%)
    const pruned = pruneHistoryForContextShare({
      messages,
      maxContextTokens,
      maxHistoryShare: 0.5,
      parts: 2,
    });

    expect(pruned.droppedChunks).toBeGreaterThan(0);
    expect(pruned.keptTokens).toBeLessThanOrEqual(Math.floor(maxContextTokens * 0.5));
    expect(pruned.messages.length).toBeGreaterThan(0);
  });

  it("keeps the newest messages when pruning", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
      makeMessage(5, 4000),
      makeMessage(6, 4000),
    ];
    const totalTokens = estimateMessagesTokens(messages);
    const maxContextTokens = Math.max(1, Math.floor(totalTokens * 0.5)); // budget = 25%
    const pruned = pruneHistoryForContextShare({
      messages,
      maxContextTokens,
      maxHistoryShare: 0.5,
      parts: 2,
    });

    const keptIds = pruned.messages.map((msg) => msg.timestamp);
    const expectedSuffix = messages.slice(-keptIds.length).map((msg) => msg.timestamp);
    expect(keptIds).toEqual(expectedSuffix);
  });

  it("keeps history when already within budget", () => {
    const messages: AgentMessage[] = [makeMessage(1, 1000)];
    const maxContextTokens = 2000;
    const pruned = pruneHistoryForContextShare({
      messages,
      maxContextTokens,
      maxHistoryShare: 0.5,
      parts: 2,
    });

    expect(pruned.droppedChunks).toBe(0);
    expect(pruned.messages.length).toBe(messages.length);
    expect(pruned.keptTokens).toBe(estimateMessagesTokens(messages));
    expect(pruned.droppedMessagesList).toEqual([]);
  });

  it("returns droppedMessagesList containing dropped messages", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
    ];
    const maxContextTokens = 2000; // budget is 1000 tokens (50%)
    const pruned = pruneHistoryForContextShare({
      messages,
      maxContextTokens,
      maxHistoryShare: 0.5,
      parts: 2,
    });

    expect(pruned.droppedChunks).toBeGreaterThan(0);
    expect(pruned.droppedMessagesList.length).toBe(pruned.droppedMessages);

    // All messages accounted for: kept + dropped = original
    const allIds = [
      ...pruned.droppedMessagesList.map((m) => m.timestamp),
      ...pruned.messages.map((m) => m.timestamp),
    ].toSorted((a, b) => a - b);
    const originalIds = messages.map((m) => m.timestamp).toSorted((a, b) => a - b);
    expect(allIds).toEqual(originalIds);
  });

  it("returns empty droppedMessagesList when no pruning needed", () => {
    const messages: AgentMessage[] = [makeMessage(1, 100)];
    const pruned = pruneHistoryForContextShare({
      messages,
      maxContextTokens: 100_000,
      maxHistoryShare: 0.5,
      parts: 2,
    });

    expect(pruned.droppedChunks).toBe(0);
    expect(pruned.droppedMessagesList).toEqual([]);
    expect(pruned.messages.length).toBe(1);
  });
});

describe("chunkMessagesByMaxTokens", () => {
  it("splits messages into chunks that fit within token limit", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 4000),
      makeMessage(2, 4000),
      makeMessage(3, 4000),
      makeMessage(4, 4000),
    ];

    const chunks = chunkMessagesByMaxTokens(messages, 8000);
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      const tokens = estimateMessagesTokens(chunk);
      // Allow some wiggle room for estimation
      expect(tokens).toBeLessThanOrEqual(12000);
    }

    expect(chunks.flat().length).toBe(messages.length);
  });

  it("handles oversized messages by splitting them into separate chunks", () => {
    const messages: AgentMessage[] = [
      makeMessage(1, 1000),
      makeMessage(2, 20000), // Oversized
      makeMessage(3, 1000),
    ];

    const chunks = chunkMessagesByMaxTokens(messages, 5000);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    // Verify all messages are accounted for
    expect(chunks.flat().length).toBe(messages.length);
  });

  it("returns single chunk when all messages fit", () => {
    const messages: AgentMessage[] = [makeMessage(1, 1000), makeMessage(2, 1000)];

    const chunks = chunkMessagesByMaxTokens(messages, 10000);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.length).toBe(2);
  });
});

describe("isOversizedForSummary", () => {
  it("identifies messages exceeding 50% of context window", () => {
    const largeMsg = makeMessage(1, 60000);
    const contextWindow = 100000;

    expect(isOversizedForSummary(largeMsg, contextWindow)).toBe(true);
  });

  it("allows messages under 50% of context window", () => {
    const smallMsg = makeMessage(1, 20000);
    const contextWindow = 100000;

    expect(isOversizedForSummary(smallMsg, contextWindow)).toBe(false);
  });
});

describe("summarizeWithFallback", () => {
  it("returns graceful fallback message when all summarization attempts fail", async () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(100000), timestamp: 1 },
      { role: "assistant", content: "y".repeat(100000), timestamp: 2 },
    ];

    const mockModel = { contextWindow: 100000 };
    const mockGenerateSummary = vi.fn().mockRejectedValue(new Error("Context overflow"));

    // Mock the generateSummary function
    vi.mock("@mariozechner/pi-coding-agent", () => ({
      generateSummary: mockGenerateSummary,
      estimateTokens: (msg: AgentMessage) => {
        if (typeof msg.content === "string") {
          return msg.content.length / 4;
        }
        return 0;
      },
    }));

    const result = await summarizeWithFallback({
      messages,
      model: mockModel as any,
      apiKey: "test-key",
      signal: new AbortController().signal,
      reserveTokens: 4000,
      maxChunkTokens: 20000,
      contextWindow: 100000,
    });

    // Should provide informative fallback message instead of "Summary unavailable"
    expect(result).toContain("Session contained");
    expect(result).toContain("messages");
    expect(result).toContain("tokens");
    expect(result).not.toBe("Summary unavailable due to size limits.");
  });

  it("includes message counts in fallback message", async () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "x".repeat(100000), timestamp: 1 },
      { role: "assistant", content: "y".repeat(100000), timestamp: 2 },
      { role: "user", content: "z".repeat(100000), timestamp: 3 },
    ];

    const mockModel = { contextWindow: 100000 };
    const mockGenerateSummary = vi.fn().mockRejectedValue(new Error("Context overflow"));

    vi.mock("@mariozechner/pi-coding-agent", () => ({
      generateSummary: mockGenerateSummary,
      estimateTokens: (msg: AgentMessage) => {
        if (typeof msg.content === "string") {
          return msg.content.length / 4;
        }
        return 0;
      },
    }));

    const result = await summarizeWithFallback({
      messages,
      model: mockModel as any,
      apiKey: "test-key",
      signal: new AbortController().signal,
      reserveTokens: 4000,
      maxChunkTokens: 20000,
      contextWindow: 100000,
    });

    expect(result).toContain("3 messages");
    expect(result).toContain("2 user");
    expect(result).toContain("1 assistant");
  });
});
