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

  it("sanitizes direct context-overflow errors", () => {
    expect(
      sanitizeUserFacingText(
        "Context overflow: prompt too large for the model. Try again with less input or a larger-context model.",
      ),
    ).toContain("Context overflow: prompt too large for the model.");
    expect(sanitizeUserFacingText("Request size exceeds model context window")).toContain(
      "Context overflow: prompt too large for the model.",
    );
  });

  it("does not rewrite conversational mentions of context overflow", () => {
    const text =
      "nah it failed, hit a context overflow. the prompt was too large for the model. want me to retry it with a different approach?";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });

  it("does not rewrite technical summaries that mention context overflow", () => {
    const text =
      "Problem: When a subagent reads a very large file, it can exceed the model context window. Auto-compaction cannot help in that case.";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });

  it("sanitizes raw API error payloads", () => {
    const raw = '{"type":"error","error":{"message":"Something exploded","type":"server_error"}}';
    expect(sanitizeUserFacingText(raw)).toBe("LLM error server_error: Something exploded");
  });

  it("does not rewrite normal text containing '402'", () => {
    // Dollar amounts (GitHub issue #12711)
    expect(sanitizeUserFacingText("Your MTD spend is $402.55")).toBe("Your MTD spend is $402.55");
    // Street addresses
    expect(sanitizeUserFacingText("Meet me at 402 Main Street")).toBe("Meet me at 402 Main Street");
    // General numeric context
    expect(sanitizeUserFacingText("The report lists 402 items in total")).toBe(
      "The report lists 402 items in total",
    );
    // Historical year
    expect(sanitizeUserFacingText("In the year 1402 the empire expanded")).toBe(
      "In the year 1402 the empire expanded",
    );
  });

  it("still rewrites leaked billing error payloads", () => {
    // HTTP status error
    expect(sanitizeUserFacingText("402 Payment Required")).toContain("billing");
    // Error-prefix form
    expect(sanitizeUserFacingText("Error: 402 Payment Required")).toContain("billing");
    // JSON API error payload with billing keywords
    expect(
      sanitizeUserFacingText(
        '{"type":"error","error":{"message":"insufficient credits","type":"billing_error"}}',
      ),
    ).toContain("billing");
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
