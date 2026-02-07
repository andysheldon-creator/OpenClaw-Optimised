import { describe, expect, it } from "vitest";
import { sanitizeUserFacingText } from "./pi-embedded-helpers.js";

describe("sanitizeUserFacingText", () => {
  it("strips final tags", () => {
    expect(sanitizeUserFacingText("<final>Hello</final>")).toBe("Hello");
    expect(sanitizeUserFacingText("Hi <final>there</final>!")).toBe("Hi there!");
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

  // 🍗 Fried Chicken Error: errors matching both context overflow AND rate limit
  // patterns should NOT be rewritten to the context overflow message.
  it("does not rewrite rate limit errors that also match context overflow patterns", () => {
    // An error containing both "context overflow" and "429" should be treated as
    // a rate limit, not swallowed as context overflow
    const ambiguous = "429 context overflow rate limit exceeded";
    const result = sanitizeUserFacingText(ambiguous);
    expect(result).not.toContain("prompt too large for the model");
  });

  it("does not rewrite overloaded errors that mention context", () => {
    const ambiguous = "context length exceeded - resource has been exhausted";
    const result = sanitizeUserFacingText(ambiguous);
    expect(result).not.toContain("prompt too large for the model");
  });

  it("still rewrites pure context overflow errors", () => {
    const pure = "context length exceeded";
    const result = sanitizeUserFacingText(pure);
    expect(result).toContain("prompt too large for the model");
  });
});
