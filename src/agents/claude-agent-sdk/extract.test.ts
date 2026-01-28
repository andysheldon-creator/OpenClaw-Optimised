import { describe, it, expect } from "vitest";
import { extractTextFromClaudeAgentSdkEvent } from "./extract.js";

describe("extractTextFromClaudeAgentSdkEvent", () => {
  it("extracts text from direct text field", () => {
    expect(extractTextFromClaudeAgentSdkEvent({ text: "Hello" })).toBe("Hello");
  });

  it("extracts text from delta field", () => {
    expect(extractTextFromClaudeAgentSdkEvent({ delta: "World" })).toBe("World");
  });

  it("extracts text from string input", () => {
    expect(extractTextFromClaudeAgentSdkEvent("Direct string")).toBe("Direct string");
  });

  it("extracts text from content array with text blocks", () => {
    const event = {
      content: [
        { type: "text", text: "First" },
        { type: "text", text: "Second" },
      ],
    };
    expect(extractTextFromClaudeAgentSdkEvent(event)).toBe("First\nSecond");
  });

  it("extracts text from nested message object", () => {
    const event = {
      message: {
        content: [{ type: "text", text: "Nested text" }],
      },
    };
    expect(extractTextFromClaudeAgentSdkEvent(event)).toBe("Nested text");
  });

  it("extracts text from nested data object", () => {
    const event = {
      data: {
        text: "Data text",
      },
    };
    expect(extractTextFromClaudeAgentSdkEvent(event)).toBe("Data text");
  });

  it("extracts text from deeply nested delta", () => {
    const event = {
      delta: {
        text: "Deep delta text",
      },
    };
    expect(extractTextFromClaudeAgentSdkEvent(event)).toBe("Deep delta text");
  });

  it("returns undefined for null/undefined input", () => {
    expect(extractTextFromClaudeAgentSdkEvent(null)).toBeUndefined();
    expect(extractTextFromClaudeAgentSdkEvent(undefined)).toBeUndefined();
  });

  it("returns undefined for empty text", () => {
    expect(extractTextFromClaudeAgentSdkEvent({ text: "" })).toBeUndefined();
    expect(extractTextFromClaudeAgentSdkEvent({ text: "   " })).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(extractTextFromClaudeAgentSdkEvent(123)).toBeUndefined();
    expect(extractTextFromClaudeAgentSdkEvent(true)).toBeUndefined();
  });

  it("handles array of strings in content", () => {
    const event = {
      content: ["First string", "Second string"],
    };
    expect(extractTextFromClaudeAgentSdkEvent(event)).toBe("First string\nSecond string");
  });
});
