import { describe, expect, it, vi } from "vitest";
import { createAutoCompactionRetryHook } from "./auto-compaction-retry-hook.js";

describe("createAutoCompactionRetryHook", () => {
  it("proceeds without changes when the full prompt fits", () => {
    const warn = vi.fn();
    const hook = createAutoCompactionRetryHook({
      getRetrySystemPrompt: () => "SLIM",
      onDowngradeSystemPrompt: vi.fn(),
      logger: { warn },
      logPrefix: "t",
    });

    const decision = hook({
      estimates: {
        messageTokens: 100,
        systemPromptTokens: 100,
        totalTokens: 200,
        tokenBudget: 1200,
        overBy: 0,
      },
    });

    expect(decision).toEqual({ action: "proceed" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("downgrades the prompt when needed and the retry prompt fits", () => {
    const warn = vi.fn();
    const onDowngradeSystemPrompt = vi.fn();
    const retrySystemPrompt = "x".repeat(400);
    const hook = createAutoCompactionRetryHook({
      getRetrySystemPrompt: () => retrySystemPrompt,
      onDowngradeSystemPrompt,
      logger: { warn },
      logPrefix: "t",
    });

    const decision = hook({
      estimates: {
        messageTokens: 100,
        systemPromptTokens: 900,
        totalTokens: 1000,
        tokenBudget: 1200,
        overBy: 312,
      },
    });

    expect(onDowngradeSystemPrompt).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(decision).toEqual({ action: "proceed", systemPrompt: retrySystemPrompt });
  });

  it("cancels retry when even the slim prompt cannot fit", () => {
    const warn = vi.fn();
    const onDowngradeSystemPrompt = vi.fn();
    const retrySystemPrompt = "x".repeat(400);
    const hook = createAutoCompactionRetryHook({
      getRetrySystemPrompt: () => retrySystemPrompt,
      onDowngradeSystemPrompt,
      logger: { warn },
      logPrefix: "t",
    });

    const decision = hook({
      estimates: {
        messageTokens: 700,
        systemPromptTokens: 900,
        totalTokens: 1600,
        tokenBudget: 1200,
        overBy: 912,
      },
    });

    expect(onDowngradeSystemPrompt).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(decision.action).toBe("cancel");
    if (decision.action !== "cancel") {
      throw new Error("expected cancel");
    }
    expect(decision.errorMessage).toContain("Auto-compaction succeeded");
  });
});
