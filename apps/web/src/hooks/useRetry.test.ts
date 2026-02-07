import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRetry, withRetry } from "./useRetry";

describe("useRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes successfully on first try", async () => {
    const operation = vi.fn().mockResolvedValue("success");
    const { result } = renderHook(() => useRetry(operation));

    let executeResult: unknown;
    await act(async () => {
      executeResult = await result.current.execute();
    });

    expect(executeResult).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.attemptCount).toBe(0);
    expect(result.current.lastError).toBeNull();
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("success");

    const { result } = renderHook(() =>
      useRetry(operation, { maxRetries: 3, baseDelay: 100, jitter: false }),
    );

    await act(async () => {
      const promise = result.current.execute();
      // Advance past the backoff delay
      await vi.advanceTimersByTimeAsync(200);
      await promise;
    });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it("exhausts retries and reports exhaustion", async () => {
    const error = new Error("persistent failure");
    const operation = vi.fn().mockRejectedValue(error);
    const onExhausted = vi.fn();

    const { result } = renderHook(() =>
      useRetry(operation, {
        maxRetries: 2,
        baseDelay: 50,
        jitter: false,
        onExhausted,
      }),
    );

    await act(async () => {
      const promise = result.current.execute();
      // Advance timers through all retry delays
      await vi.advanceTimersByTimeAsync(500);
      await promise;
    });

    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.current.isExhausted).toBe(true);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.lastError).toBe(error);
    expect(onExhausted).toHaveBeenCalledWith(error, 3);
  });

  it("calls onRetry callback for each retry", async () => {
    const error = new Error("fail");
    const operation = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();

    const { result } = renderHook(() =>
      useRetry(operation, {
        maxRetries: 3,
        baseDelay: 50,
        jitter: false,
        onRetry,
      }),
    );

    await act(async () => {
      const promise = result.current.execute();
      await vi.advanceTimersByTimeAsync(500);
      await promise;
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, error, expect.any(Number));
    expect(onRetry).toHaveBeenCalledWith(2, error, expect.any(Number));
  });

  it("respects isRetryable filter", async () => {
    const nonRetryableError = new Error("auth failed");
    const operation = vi.fn().mockRejectedValue(nonRetryableError);
    const isRetryable = vi.fn((err: Error) => !err.message.includes("auth"));

    const { result } = renderHook(() =>
      useRetry(operation, { maxRetries: 3, isRetryable }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(operation).toHaveBeenCalledTimes(1); // No retries
    expect(result.current.isExhausted).toBe(true);
    expect(isRetryable).toHaveBeenCalledWith(nonRetryableError);
  });

  it("reset clears all state", async () => {
    const error = new Error("fail");
    const operation = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useRetry(operation, { maxRetries: 0 }),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.isExhausted).toBe(true);
    expect(result.current.lastError).toBe(error);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isExhausted).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.attemptCount).toBe(0);
  });
});

describe("withRetry (standalone)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns result on success", async () => {
    const op = vi.fn().mockResolvedValue("data");
    const result = await withRetry(op);
    expect(result).toBe("data");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("err"))
      .mockResolvedValueOnce("data");

    const promise = withRetry(op, { maxRetries: 2, baseDelay: 50, jitter: false });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe("data");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    const op = vi.fn().mockRejectedValue(new Error("persistent"));

    const promise = withRetry(op, { maxRetries: 1, baseDelay: 50, jitter: false });
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow("persistent");
    expect(op).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("respects isRetryable", async () => {
    const op = vi.fn().mockRejectedValue(new Error("not retryable"));

    await expect(
      withRetry(op, {
        maxRetries: 5,
        isRetryable: () => false,
      }),
    ).rejects.toThrow("not retryable");

    expect(op).toHaveBeenCalledTimes(1);
  });
});
