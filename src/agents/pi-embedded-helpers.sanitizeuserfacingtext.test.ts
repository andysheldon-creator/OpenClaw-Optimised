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
    const result = sanitizeUserFacingText("400 Incorrect role information", { errorContext: true });
    expect(result).toContain("Message ordering conflict");
  });

  it("sanitizes HTTP status errors with error hints", () => {
    expect(sanitizeUserFacingText("500 Internal Server Error", { errorContext: true })).toBe(
      "HTTP 500: Internal Server Error",
    );
  });

  it("sanitizes direct context-overflow errors", () => {
    expect(
      sanitizeUserFacingText(
        "Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model.",
        { errorContext: true },
      ),
    ).toContain("Context overflow: prompt too large for the model.");
    expect(
      sanitizeUserFacingText("Request size exceeds model context window", { errorContext: true }),
    ).toContain("Context overflow: prompt too large for the model.");
  });

  it("does not swallow assistant text that quotes the canonical context-overflow string", () => {
    const text =
      "Changelog note: we fixed false positives for `Context overflow: prompt too large for the model. Try /reset (or /new) to start a fresh session, or use a larger-context model.` in 2026.2.9";
    expect(sanitizeUserFacingText(text)).toBe(text);
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
    expect(sanitizeUserFacingText(raw, { errorContext: true })).toBe(
      "LLM error server_error: Something exploded",
    );
  });

  it("collapses consecutive duplicate paragraphs", () => {
    const text = "Hello there!\n\nHello there!";
    expect(sanitizeUserFacingText(text)).toBe("Hello there!");
  });

  it("does not collapse distinct paragraphs", () => {
    const text = "Hello there!\n\nDifferent line.";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });

  it("sanitizes real billing error messages", () => {
    const billingMsg =
      "⚠️ API provider returned a billing error — your API key has run out of credits or has an insufficient balance. Check your provider's billing dashboard and top up or switch to a different API key.";
    expect(sanitizeUserFacingText("insufficient credits")).toBe(billingMsg);
    expect(sanitizeUserFacingText("Error: billing account requires payment upgrade")).toBe(
      billingMsg,
    );
    expect(sanitizeUserFacingText("Your credit balance is too low")).toBe(billingMsg);
  });

  it("does not rewrite assistant content discussing billing topics", () => {
    const prose =
      "**Billing:** Processed through ABC Financial Services. Members pay 26 bi-weekly **payments** of $19.99.";
    expect(sanitizeUserFacingText(prose)).toBe(prose);

    const multiSentence =
      "The gym membership billing cycle runs monthly. Payment is processed on the 1st of each month via credit card.";
    expect(sanitizeUserFacingText(multiSentence)).toBe(multiSentence);

    const withParagraphs =
      "Here is a summary of the billing and payment options:\n\n1. Monthly plan: $29.99/month";
    expect(sanitizeUserFacingText(withParagraphs)).toBe(withParagraphs);
  });
});
