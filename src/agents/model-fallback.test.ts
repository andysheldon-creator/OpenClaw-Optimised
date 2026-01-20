import { describe, expect, it, beforeEach } from "vitest";

import {
  isAbortError,
  runWithModelFallback,
  _resetAllCircuitBreakers,
} from "./model-fallback.js";

describe("isAbortError", () => {
  it("returns false for null/undefined", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it("returns false for non-object errors", () => {
    expect(isAbortError("error")).toBe(false);
    expect(isAbortError(123)).toBe(false);
  });

  it("returns true for AbortError without timeout in message", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for AbortError with timeout in message", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(false);
  });

  it("returns false for AbortError with Timeout in message (case insensitive)", () => {
    const err = new Error("Request Timeout - aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(false);
  });

  it("returns false for regular errors with aborted in message", () => {
    const err = new Error("Request was aborted");
    expect(isAbortError(err)).toBe(false);
  });

  it("returns false for regular errors", () => {
    const err = new Error("Network error");
    expect(isAbortError(err)).toBe(false);
  });
});

describe("runWithModelFallback", () => {
  beforeEach(() => {
    _resetAllCircuitBreakers();
  });

  it("returns result from first successful provider", async () => {
    const result = await runWithModelFallback({
      cfg: undefined,
      provider: "test-provider",
      model: "test-model",
      run: async () => "success",
    });

    expect(result.result).toBe("success");
    expect(result.provider).toBe("test-provider");
    expect(result.model).toBe("test-model");
    expect(result.attempts).toHaveLength(0);
  });

  it("throws AbortError for user-initiated aborts", async () => {
    const abortErr = new Error("User cancelled");
    abortErr.name = "AbortError";

    await expect(
      runWithModelFallback({
        cfg: undefined,
        provider: "test-provider",
        model: "test-model",
        run: async () => {
          throw abortErr;
        },
      }),
    ).rejects.toThrow("User cancelled");
  });

  it("does not throw AbortError for timeout aborts - allows fallback", async () => {
    const timeoutErr = new Error("Request timeout - aborted");
    timeoutErr.name = "AbortError";

    let callCount = 0;
    const result = await runWithModelFallback({
      cfg: {
        agent: {
          model: {
            primary: "test-provider/test-model",
            fallbacks: ["test-provider/fallback-model"],
          },
          models: {
            "test-provider/test-model": {},
            "test-provider/fallback-model": {},
          },
        },
      } as any,
      provider: "test-provider",
      model: "test-model",
      run: async (provider, model) => {
        callCount++;
        if (callCount === 1) {
          throw timeoutErr;
        }
        return "fallback-success";
      },
    });

    expect(result.result).toBe("fallback-success");
    expect(callCount).toBe(2);
  });

  it("records attempts for failed providers", async () => {
    let callCount = 0;
    const result = await runWithModelFallback({
      cfg: {
        agent: {
          model: {
            primary: "test-provider/test-model",
            fallbacks: ["test-provider/fallback-model"],
          },
          models: {
            "test-provider/test-model": {},
            "test-provider/fallback-model": {},
          },
        },
      } as any,
      provider: "test-provider",
      model: "test-model",
      run: async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("First provider failed");
        }
        return "success";
      },
    });

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.error).toBe("First provider failed");
  });

  it("skips provider after circuit breaker threshold", async () => {
    const errors: string[] = [];

    // Fail 3 times to trigger circuit breaker
    for (let i = 0; i < 3; i++) {
      try {
        await runWithModelFallback({
          cfg: undefined,
          provider: "failing-provider",
          model: "failing-model",
          run: async () => {
            throw new Error(`Failure ${i + 1}`);
          },
        });
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    expect(errors).toHaveLength(3);

    // Fourth attempt should skip due to circuit breaker
    const result = await runWithModelFallback({
      cfg: {
        agent: {
          model: {
            primary: "failing-provider/failing-model",
            fallbacks: ["backup-provider/backup-model"],
          },
          models: {
            "failing-provider/failing-model": {},
            "backup-provider/backup-model": {},
          },
        },
      } as any,
      provider: "failing-provider",
      model: "failing-model",
      run: async (provider) => {
        if (provider === "failing-provider") {
          throw new Error("Should be skipped");
        }
        return "backup-success";
      },
    });

    expect(result.result).toBe("backup-success");
    expect(result.attempts.some((a) => a.error.includes("Circuit breaker"))).toBe(
      true,
    );
  });
});
