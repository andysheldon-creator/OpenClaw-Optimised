import { describe, expect, it } from "vitest";
import { sanitizeUserFacingText } from "./pi-embedded-helpers.js";

describe("sanitizeUserFacingText", () => {
  it("strips final tags", () => {
    expect(sanitizeUserFacingText("<final>Hello</final>")).toBe("Hello");
    expect(sanitizeUserFacingText("Hi <final>there</final>!")).toBe("Hi there!");
  });

  it("strips thinking tags and their content (issue #6328)", () => {
    // Gemini models may output <think>/<final> tags that should not reach users
    expect(sanitizeUserFacingText("<think>Internal reasoning</think>Hello")).toBe("Hello");
    expect(sanitizeUserFacingText("<thinking>Some thought</thinking>World")).toBe("World");
    expect(sanitizeUserFacingText("<thought>Hmm</thought>There")).toBe("There");
    expect(sanitizeUserFacingText("<antthinking>Planning</antthinking>Done")).toBe("Done");
  });

  it("strips both thinking and final tags together (issue #6328)", () => {
    const geminiOutput = "<think>Let me analyze this...</think><final>The answer is 42</final>";
    expect(sanitizeUserFacingText(geminiOutput)).toBe("The answer is 42");
  });

  it("preserves content when text has content before tags (issue #6328)", () => {
    const output = "Hey! <think>Internal reasoning</think><final>The answer</final>";
    // With preserve mode, content before tags is kept, thinking is stripped
    expect(sanitizeUserFacingText(output)).toBe("Hey! The answer");
  });

  it("does not clobber normal numeric prefixes", () => {
    expect(sanitizeUserFacingText("202 results found")).toBe("202 results found");
    expect(sanitizeUserFacingText("400 days left")).toBe("400 days left");
  });

  it("sanitizes role ordering errors", () => {
    const result = sanitizeUserFacingText("400 Incorrect role information");
    expect(result).toContain("Message ordering conflict");
  });

  it("sanitizes HTTP status errors with error hints", () => {
    expect(sanitizeUserFacingText("500 Internal Server Error")).toBe(
      "HTTP 500: Internal Server Error",
    );
  });

  it("sanitizes raw API error payloads", () => {
    const raw = '{"type":"error","error":{"message":"Something exploded","type":"server_error"}}';
    expect(sanitizeUserFacingText(raw)).toBe("LLM error server_error: Something exploded");
  });

  it("collapses consecutive duplicate paragraphs", () => {
    const text = "Hello there!\n\nHello there!";
    expect(sanitizeUserFacingText(text)).toBe("Hello there!");
  });

  it("does not collapse distinct paragraphs", () => {
    const text = "Hello there!\n\nDifferent line.";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });
});
