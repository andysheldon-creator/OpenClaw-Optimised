import { describe, expect, it } from "vitest";
import { resolveTranscriptPolicy } from "./transcript-policy.js";

describe("resolveTranscriptPolicy", () => {
  describe("textifyToolCallHistory", () => {
    it("enables textifyToolCallHistory for github-copilot + gemini model", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "openai-responses",
        provider: "github-copilot",
        modelId: "gemini-3-flash-preview",
      });
      expect(policy.textifyToolCallHistory).toBe(true);
    });

    it("enables textifyToolCallHistory for copilot + gemini-2.5-pro", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "openai-responses",
        provider: "github-copilot",
        modelId: "gemini-2.5-pro",
      });
      expect(policy.textifyToolCallHistory).toBe(true);
    });

    it("does not enable textifyToolCallHistory for copilot + non-gemini model", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "openai-responses",
        provider: "github-copilot",
        modelId: "gpt-4o",
      });
      expect(policy.textifyToolCallHistory).toBe(false);
    });

    it("does not enable textifyToolCallHistory for openai provider", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "openai-responses",
        provider: "openai",
        modelId: "gpt-4o",
      });
      expect(policy.textifyToolCallHistory).toBe(false);
    });

    it("does not enable textifyToolCallHistory for direct google api", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "google-generative-ai",
        provider: "google-generative-ai",
        modelId: "gemini-3-flash-preview",
      });
      expect(policy.textifyToolCallHistory).toBe(false);
    });

    it("does not enable textifyToolCallHistory for openrouter + gemini (has own handling)", () => {
      const policy = resolveTranscriptPolicy({
        modelApi: "openai-completions",
        provider: "openrouter",
        modelId: "google/gemini-2.5-pro",
      });
      expect(policy.textifyToolCallHistory).toBe(false);
    });
  });
});
