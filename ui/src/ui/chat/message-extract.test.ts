import { describe, expect, it } from "vitest";
import {
  extractText,
  extractTextCached,
  extractThinking,
  extractThinkingCached,
} from "./message-extract.ts";

describe("extractTextCached", () => {
  it("matches extractText output", () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "Hello there" }],
    };
    expect(extractTextCached(message)).toBe(extractText(message));
  });

  it("returns consistent output for repeated calls", () => {
    const message = {
      role: "user",
      content: "plain text",
    };
    expect(extractTextCached(message)).toBe("plain text");
    expect(extractTextCached(message)).toBe("plain text");
  });
});

describe("extractThinkingCached", () => {
  it("matches extractThinking output", () => {
    const message = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Plan A" }],
    };
    expect(extractThinkingCached(message)).toBe(extractThinking(message));
  });

  it("returns consistent output for repeated calls", () => {
    const message = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Plan A" }],
    };
    expect(extractThinkingCached(message)).toBe("Plan A");
    expect(extractThinkingCached(message)).toBe("Plan A");
  });
});

describe("extractText metadata stripping", () => {
  it("strips inbound untrusted conversation metadata from user-visible text", () => {
    const message = {
      role: "user",
      content:
        "Conversation info (untrusted metadata):\n```json\n{\n  \"conversation_label\": \"Test\"\n}\n```\n\nHello world",
    };
    expect(extractText(message)).toBe("Hello world");
  });

  it("keeps normal user content untouched", () => {
    const message = {
      role: "user",
      content: "Just a normal message",
    };
    expect(extractText(message)).toBe("Just a normal message");
  });
});
