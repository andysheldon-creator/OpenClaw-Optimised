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

  it("collapses consecutive duplicate paragraphs", () => {
    const text = "Hello there!\n\nHello there!";
    expect(sanitizeUserFacingText(text)).toBe("Hello there!");
  });

  it("does not collapse distinct paragraphs", () => {
    const text = "Hello there!\n\nDifferent line.";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });
});

describe('sanitizeUserFacingText with { source: "assistant" }', () => {
  const assistant = { source: "assistant" as const };

  it("does not rewrite billing-related keywords in assistant text", () => {
    expect(sanitizeUserFacingText("Your credit balance is $42.00", assistant)).toBe(
      "Your credit balance is $42.00",
    );
    expect(sanitizeUserFacingText("billing: please upgrade your plan", assistant)).toBe(
      "billing: please upgrade your plan",
    );
    expect(sanitizeUserFacingText("insufficient credits for this operation", assistant)).toBe(
      "insufficient credits for this operation",
    );
  });

  it("does not rewrite HTTP status codes in assistant text", () => {
    expect(sanitizeUserFacingText("500 Internal Server Error", assistant)).toBe(
      "500 Internal Server Error",
    );
    expect(sanitizeUserFacingText("402 Payment Required", assistant)).toBe("402 Payment Required");
  });

  it("does not rewrite error-prefixed text in assistant text", () => {
    expect(sanitizeUserFacingText("Error: something went wrong in the build", assistant)).toBe(
      "Error: something went wrong in the build",
    );
    expect(sanitizeUserFacingText("Failed: deployment step 3", assistant)).toBe(
      "Failed: deployment step 3",
    );
  });

  it("does not rewrite raw JSON error payloads in assistant text", () => {
    const raw = '{"type":"error","error":{"message":"Something exploded","type":"server_error"}}';
    expect(sanitizeUserFacingText(raw, assistant)).toBe(raw);
  });

  it("still strips <final> tags for assistant text", () => {
    expect(sanitizeUserFacingText("<final>Hello</final>", assistant)).toBe("Hello");
    expect(sanitizeUserFacingText("Hi <final>there</final>!", assistant)).toBe("Hi there!");
  });

  it("still collapses consecutive duplicate paragraphs for assistant text", () => {
    const text = "Hello there!\n\nHello there!";
    expect(sanitizeUserFacingText(text, assistant)).toBe("Hello there!");
  });

  it("does not collapse distinct paragraphs for assistant text", () => {
    const text = "Hello there!\n\nDifferent line.";
    expect(sanitizeUserFacingText(text, assistant)).toBe(text);
  });

  it("passes through normal assistant content unchanged", () => {
    const response =
      "Here are your Linear issues:\n1. Show Credit Balance - Task #1234\n2. 402 API endpoint - Task #5678";
    expect(sanitizeUserFacingText(response, assistant)).toBe(response);
  });
});
