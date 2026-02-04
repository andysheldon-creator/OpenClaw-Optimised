import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedEmbeddingRateLimiter } from "./embedding-rate-limit.js";

describe("SharedEmbeddingRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays subsequent calls after rate limit signal", async () => {
    vi.useFakeTimers();
    const limiter = new SharedEmbeddingRateLimiter({
      backoffStepsMs: [500],
      maxConcurrency: 1,
    });
    const calls: string[] = [];

    await limiter.run(async () => {
      calls.push("first");
    });

    limiter.noteRateLimit();

    const second = limiter.run(async () => {
      calls.push("second");
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(200);
    await second;
    expect(calls).toEqual(["first", "second"]);
  });
});
