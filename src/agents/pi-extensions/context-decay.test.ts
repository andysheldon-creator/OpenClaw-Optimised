import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { ContextDecayConfig } from "../../config/types.agent-defaults.js";
import type { SummaryStore } from "../context-decay/summary-store.js";
import { applyContextDecay } from "./context-decay/decay.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: Date.now() };
}

function makeAssistant(text: string, withThinking = false): AgentMessage {
  const content: Array<Record<string, unknown>> = [];
  if (withThinking) {
    content.push({ type: "thinking", thinking: "internal reasoning..." });
  }
  content.push({ type: "text", text });
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "fake",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
    stopReason: "stop",
    timestamp: Date.now(),
  } as AgentMessage;
}

function makeAssistantWithToolUse(toolCallId: string, toolName: string): AgentMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "Let me call a tool." },
      { type: "tool_use", id: toolCallId, name: toolName, input: {} },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "fake",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 },
    stopReason: "tool_use",
    timestamp: Date.now(),
  } as AgentMessage;
}

function makeToolResult(toolCallId: string, toolName: string, text: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

function getContentText(msg: AgentMessage): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<Record<string, unknown>>)
      .filter((b) => b.type === "text")
      .map((b) => b.text as string)
      .join("\n");
  }
  return "";
}

function hasThinkingBlock(msg: AgentMessage): boolean {
  if (!Array.isArray(msg.content)) {
    return false;
  }
  return (msg.content as Array<Record<string, unknown>>).some((b) => b.type === "thinking");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyContextDecay", () => {
  const emptySummaryStore: SummaryStore = {};

  describe("disabled config", () => {
    it("returns messages unchanged when config is empty", () => {
      const messages = [makeUser("hi"), makeAssistant("hello")];
      const config: ContextDecayConfig = {};
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      expect(result).toBe(messages); // same reference
    });

    it("returns messages unchanged when all values are 0", () => {
      const messages = [makeUser("hi"), makeAssistant("hello")];
      const config: ContextDecayConfig = {
        stripThinkingAfterTurns: 0,
        summarizeToolResultsAfterTurns: 0,
        stripToolResultsAfterTurns: 0,
        maxContextMessages: 0,
      };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      expect(result).toBe(messages);
    });

    it("returns empty array unchanged", () => {
      const messages: AgentMessage[] = [];
      const config: ContextDecayConfig = { stripThinkingAfterTurns: 1 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      expect(result).toBe(messages);
    });
  });

  describe("stripThinkingAfterTurns", () => {
    it("strips thinking blocks from assistant messages older than N turns", () => {
      // Turn 0 (current): user3 + assistant3
      // Turn 1: user2 + assistant2
      // Turn 2: user1 + assistant1 (with thinking)
      const messages = [
        makeUser("user1"),
        makeAssistant("response1", true), // has thinking, turn age 2
        makeUser("user2"),
        makeAssistant("response2", true), // has thinking, turn age 1
        makeUser("user3"),
        makeAssistant("response3", true), // has thinking, turn age 0
      ];

      const config: ContextDecayConfig = { stripThinkingAfterTurns: 2 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      // Turn age 2 (assistant at idx 1) should have thinking stripped
      expect(hasThinkingBlock(result[1])).toBe(false);
      expect(getContentText(result[1])).toBe("response1");

      // Turn age 1 (assistant at idx 3) should keep thinking
      expect(hasThinkingBlock(result[3])).toBe(true);

      // Turn age 0 (assistant at idx 5) should keep thinking
      expect(hasThinkingBlock(result[5])).toBe(true);
    });

    it("preserves thinking blocks within N turns", () => {
      const messages = [
        makeUser("user1"),
        makeAssistant("response1", true),
        makeUser("user2"),
        makeAssistant("response2", true),
      ];

      const config: ContextDecayConfig = { stripThinkingAfterTurns: 5 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      // All within 5 turns — nothing stripped
      expect(result).toBe(messages);
    });
  });

  describe("summarizeToolResultsAfterTurns", () => {
    it("replaces tool result content with summary when summary exists in store", () => {
      const messages = [
        makeUser("user1"),
        makeAssistantWithToolUse("call_1", "read_file"),
        makeToolResult("call_1", "read_file", "very long file content..."),
        makeUser("user2"),
        makeAssistant("response"),
        makeUser("user3"),
        makeAssistant("latest"),
      ];

      const summaryStore: SummaryStore = {
        2: {
          summary: "File contains a config module.",
          originalTokenEstimate: 100,
          summaryTokenEstimate: 10,
          summarizedAt: new Date().toISOString(),
          model: "haiku",
        },
      };

      const config: ContextDecayConfig = { summarizeToolResultsAfterTurns: 1 };
      const result = applyContextDecay({ messages, config, summaryStore });

      // Tool result at index 2 (turn age >= 1) should be summarized
      expect(getContentText(result[2])).toContain("[Summarized]");
      expect(getContentText(result[2])).toContain("File contains a config module.");
    });

    it("does not apply summary if no entry exists in store", () => {
      const messages = [
        makeUser("user1"),
        makeAssistantWithToolUse("call_1", "read_file"),
        makeToolResult("call_1", "read_file", "original content"),
        makeUser("user2"),
        makeAssistant("response"),
      ];

      const config: ContextDecayConfig = { summarizeToolResultsAfterTurns: 1 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      // No summary in store, content unchanged
      expect(getContentText(result[2])).toBe("original content");
    });
  });

  describe("stripToolResultsAfterTurns", () => {
    it("replaces tool result content with placeholder after N turns", () => {
      const messages = [
        makeUser("user1"),
        makeAssistantWithToolUse("call_1", "read_file"),
        makeToolResult("call_1", "read_file", "very long file content..."),
        makeUser("user2"),
        makeAssistant("response"),
        makeUser("user3"),
        makeAssistant("latest"),
      ];

      const config: ContextDecayConfig = { stripToolResultsAfterTurns: 1 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      // Tool result at index 2 (turn age 2, threshold 1) should be stripped
      expect(getContentText(result[2])).toContain("[Tool result removed");
      expect(getContentText(result[2])).toContain("aged past 1 turns");
    });

    it("preserves tool results within N turns", () => {
      const messages = [
        makeUser("user1"),
        makeAssistantWithToolUse("call_1", "read_file"),
        makeToolResult("call_1", "read_file", "content"),
        makeUser("user2"),
        makeAssistant("response"),
      ];

      const config: ContextDecayConfig = { stripToolResultsAfterTurns: 5 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      expect(getContentText(result[2])).toBe("content");
    });
  });

  describe("graduated decay", () => {
    it("summarizes at lower threshold, strips at higher threshold", () => {
      // 5 turns of history
      const messages: AgentMessage[] = [];
      for (let i = 0; i < 5; i++) {
        messages.push(makeUser(`user${i}`));
        messages.push(makeAssistantWithToolUse(`call_${i}`, "tool"));
        messages.push(makeToolResult(`call_${i}`, "tool", `result ${i} with enough text`));
      }
      messages.push(makeUser("latest"));
      messages.push(makeAssistant("latest response"));

      // Summarize at 3 turns, strip at 5 turns
      const summaryStore: SummaryStore = {};
      // Add summaries for old tool results (indices 2, 5, 8)
      summaryStore[2] = {
        summary: "Summary of result 0",
        originalTokenEstimate: 50,
        summaryTokenEstimate: 5,
        summarizedAt: new Date().toISOString(),
        model: "haiku",
      };
      summaryStore[5] = {
        summary: "Summary of result 1",
        originalTokenEstimate: 50,
        summaryTokenEstimate: 5,
        summarizedAt: new Date().toISOString(),
        model: "haiku",
      };

      const config: ContextDecayConfig = {
        summarizeToolResultsAfterTurns: 3,
        stripToolResultsAfterTurns: 5,
      };

      const result = applyContextDecay({ messages, config, summaryStore });

      // Tool result at turn age 5 (oldest) → stripped (age >= stripAfter=5)
      expect(getContentText(result[2])).toContain("[Tool result removed");

      // Tool result at turn age 4 → summarized (age >= summarizeAfter=3, < stripAfter=5, summary exists)
      expect(getContentText(result[5])).toContain("[Summarized]");
      expect(getContentText(result[5])).toContain("Summary of result 1");

      // Tool result at turn age 3 → no summary in store, untouched
      expect(getContentText(result[8])).toBe("result 2 with enough text");

      // Tool result at turn age 2 → recent, untouched
      expect(getContentText(result[11])).toBe("result 3 with enough text");

      // Tool result at turn age 1 → recent, untouched
      expect(getContentText(result[14])).toBe("result 4 with enough text");
    });
  });

  describe("maxContextMessages", () => {
    it("drops oldest messages beyond the cap", () => {
      const messages = [
        makeUser("old1"),
        makeAssistant("old2"),
        makeUser("old3"),
        makeAssistant("old4"),
        makeUser("recent1"),
        makeAssistant("recent2"),
      ];

      const config: ContextDecayConfig = { maxContextMessages: 4 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      expect(result).toHaveLength(4);
      expect(getContentText(result[0])).toBe("old3");
      expect(getContentText(result[3])).toBe("recent2");
    });

    it("does nothing when message count is within cap", () => {
      const messages = [makeUser("hi"), makeAssistant("hello")];
      const config: ContextDecayConfig = { maxContextMessages: 10 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });
      expect(result).toBe(messages);
    });

    it("repairs orphaned tool results when cap slices mid-tool-call pair", () => {
      // The cap cuts between an assistant tool_use and its toolResult
      const messages = [
        makeUser("old"),
        makeAssistantWithToolUse("call_old", "read_file"), // will be dropped
        makeToolResult("call_old", "read_file", "old result"), // orphaned toolResult
        makeUser("recent"),
        makeAssistant("response"),
      ];

      const config: ContextDecayConfig = { maxContextMessages: 3 };
      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      // After slicing to last 3: [toolResult(orphan), user("recent"), assistant("response")]
      // repairToolUseResultPairing should handle the orphaned toolResult
      expect(result.length).toBeLessThanOrEqual(3);
      // All remaining messages should have valid pairing (no orphaned toolResults)
      const toolResults = result.filter((m) => m.role === "toolResult");
      for (const tr of toolResults) {
        // Each remaining toolResult should have a preceding assistant with matching tool_use
        const trIdx = result.indexOf(tr);
        const trMsg = tr as unknown as { toolCallId?: string };
        const hasMatchingToolUse = result.slice(0, trIdx).some((m) => {
          if (m.role !== "assistant" || !Array.isArray(m.content)) {
            return false;
          }
          return (m.content as Array<Record<string, unknown>>).some(
            (b) => b.type === "tool_use" && b.id === trMsg.toolCallId,
          );
        });
        // If the toolResult survived, it must have a matching tool_use OR be removed by repair
        if (!hasMatchingToolUse) {
          // Repair should have removed it or the message count should reflect removal
          expect(result.some((m) => m === tr)).toBe(false);
        }
      }
    });
  });

  describe("combined features", () => {
    it("strips thinking and tool results together", () => {
      const messages = [
        makeUser("user1"),
        makeAssistant("thinking response", true), // has thinking
        makeAssistantWithToolUse("call_1", "read_file"),
        makeToolResult("call_1", "read_file", "file content"),
        makeUser("user2"),
        makeAssistant("latest", true), // has thinking
      ];

      const config: ContextDecayConfig = {
        stripThinkingAfterTurns: 1,
        stripToolResultsAfterTurns: 1,
      };

      const result = applyContextDecay({ messages, config, summaryStore: emptySummaryStore });

      // Old thinking (turn age 1) stripped
      expect(hasThinkingBlock(result[1])).toBe(false);
      // Current thinking (turn age 0) preserved
      expect(hasThinkingBlock(result[5])).toBe(true);
      // Old tool result stripped
      expect(getContentText(result[3])).toContain("[Tool result removed");
    });
  });
});
