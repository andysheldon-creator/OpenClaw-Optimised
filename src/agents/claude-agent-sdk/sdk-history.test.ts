import { describe, it, expect } from "vitest";
import { serializeConversationHistory, buildHistorySystemPromptSuffix } from "./sdk-history.js";
import type { SdkConversationTurn } from "./types.js";

describe("serializeConversationHistory", () => {
  it("returns empty string for undefined input", () => {
    expect(serializeConversationHistory(undefined)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(serializeConversationHistory([])).toBe("");
  });

  it("serializes a single user turn", () => {
    const turns: SdkConversationTurn[] = [{ role: "user", content: "Hello" }];
    const result = serializeConversationHistory(turns);

    expect(result).toContain("<conversation-history>");
    expect(result).toContain("[User]:");
    expect(result).toContain("Hello");
    expect(result).toContain("</conversation-history>");
  });

  it("serializes multiple turns", () => {
    const turns: SdkConversationTurn[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const result = serializeConversationHistory(turns);

    expect(result).toContain("[User]:");
    expect(result).toContain("Hello");
    expect(result).toContain("[Assistant]:");
    expect(result).toContain("Hi there!");
  });

  it("includes timestamps when provided", () => {
    const turns: SdkConversationTurn[] = [
      { role: "user", content: "Hello", timestamp: "2025-01-26T10:00:00Z" },
    ];
    const result = serializeConversationHistory(turns);

    expect(result).toContain("(2025-01-26T10:00:00Z)");
  });

  it("limits to maxTurns most recent", () => {
    const turns: SdkConversationTurn[] = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `Message ${i}`,
    }));
    const result = serializeConversationHistory(turns, { maxTurns: 5 });

    // Should note that earlier turns were omitted
    expect(result).toContain("earlier turns omitted");
    // Should contain the last 5 messages
    expect(result).toContain("Message 25");
    expect(result).toContain("Message 29");
  });

  it("truncates when content exceeds maxChars", () => {
    const longContent = "a".repeat(70000);
    const turns: SdkConversationTurn[] = [{ role: "user", content: longContent }];
    const result = serializeConversationHistory(turns, { maxChars: 1000 });

    expect(result.length).toBeLessThan(1200); // Some overhead for tags
    expect(result).toContain("[...truncated]");
  });
});

describe("buildHistorySystemPromptSuffix", () => {
  it("returns empty string for no history", () => {
    expect(buildHistorySystemPromptSuffix(undefined)).toBe("");
    expect(buildHistorySystemPromptSuffix([])).toBe("");
  });

  it("builds suffix with instruction header", () => {
    const turns: SdkConversationTurn[] = [{ role: "user", content: "Hello" }];
    const result = buildHistorySystemPromptSuffix(turns);

    expect(result).toContain("## Prior Conversation Context");
    expect(result).toContain("conversation history from prior turns");
    expect(result).toContain("do not re-execute");
    expect(result).toContain("<conversation-history>");
  });
});
