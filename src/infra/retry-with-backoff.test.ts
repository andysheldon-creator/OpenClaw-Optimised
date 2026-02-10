import { describe, expect, it } from "vitest";
import { isRetryableError, calculateBackoff, retryWithBackoff } from "./retry-with-backoff.js";

describe("retry-with-backoff", () => {
  describe("isRetryableError", () => {
    it("returns false for 400", () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
    });
    it("returns false for 401", () => {
      expect(isRetryableError({ status: 401 })).toBe(false);
    });
    it("returns false for 404", () => {
      expect(isRetryableError({ status: 404 })).toBe(false);
    });
    it("returns true for 429", () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
    });
    it("returns true for 503", () => {
      expect(isRetryableError({ status: 503 })).toBe(true);
    });
    it("returns true for ETIMEDOUT", () => {
      expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
    });
    it("returns true for ECONNRESET", () => {
      expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
    });
    it("returns true for timeout message", () => {
      expect(isRetryableError(new Error("request timed out"))).toBe(true);
    });
    it("returns false for random error", () => {
      expect(isRetryableError(new Error("invalid json"))).toBe(false);
    });
  });

  describe("calculateBackoff", () => {
    it("calculates exponential delays", () => {
      const config = { maxRetries: 4, baseDelayMs: 1000, maxDelayMs: 8000, jitterFactor: 0 };
      expect(calculateBackoff(0, config)).toBe(1000);
      expect(calculateBackoff(1, config)).toBe(2000);
      expect(calculateBackoff(2, config)).toBe(4000);
      expect(calculateBackoff(3, config)).toBe(8000);
    });
    it("caps at maxDelayMs", () => {
      const config = { maxRetries: 4, baseDelayMs: 1000, maxDelayMs: 8000, jitterFactor: 0 };
      expect(calculateBackoff(10, config)).toBe(8000);
    });
  });

  describe("retryWithBackoff", () => {
    it("succeeds on first try", async () => {
      const { result, metadata } = await retryWithBackoff(() => Promise.resolve(42), {
        baseDelayMs: 10,
        maxDelayMs: 80,
      });
      expect(result).toBe(42);
      expect(metadata.attempts).toBe(1);
      expect(metadata.finalStatus).toBe("success");
    });

    it("retries transient errors", async () => {
      let calls = 0;
      const { result, metadata } = await retryWithBackoff(
        async () => {
          calls++;
          if (calls < 3) {
            throw Object.assign(new Error("timeout"), { status: 503 });
          }
          return "ok";
        },
        { baseDelayMs: 10, maxDelayMs: 80 },
      );
      expect(result).toBe("ok");
      expect(metadata.attempts).toBe(3);
      expect(metadata.finalStatus).toBe("success");
    });

    it("does not retry non-retryable errors", async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw Object.assign(new Error("not found"), { status: 404 });
          },
          { baseDelayMs: 10, maxDelayMs: 80 },
        ),
      ).rejects.toThrow("not found");
      expect(calls).toBe(1);
    });

    it("gives up after maxRetries", async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw Object.assign(new Error("overloaded"), { status: 503 });
          },
          { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 80 },
        ),
      ).rejects.toThrow("overloaded");
      expect(calls).toBe(3); // 1 initial + 2 retries
    });

    it("attaches retry metadata to thrown error", async () => {
      try {
        await retryWithBackoff(
          async () => {
            throw Object.assign(new Error("fail"), { status: 500 });
          },
          { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 80 },
        );
      } catch (err: any) {
        expect(err.retryMetadata).toBeDefined();
        expect(err.retryMetadata.attempts).toBe(3);
        expect(err.retryMetadata.finalStatus).toBe("failed");
      }
    });
  });
});
