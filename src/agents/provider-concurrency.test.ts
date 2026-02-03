import type { StreamFn } from "@mariozechner/pi-agent-core";
import { afterEach, describe, expect, it } from "vitest";
import {
  AsyncSemaphore,
  clearProviderConcurrency,
  getProviderSemaphore,
  initProviderConcurrencyFromConfig,
  resolveProviderMaxConcurrent,
  setProviderMaxConcurrent,
  wrapStreamFnWithConcurrencyGate,
} from "./provider-concurrency.js";

afterEach(() => {
  clearProviderConcurrency();
});

// Helper: create a mock stream that behaves like AssistantMessageEventStream.
function createMockStream(events: unknown[], errorAfter?: number) {
  let resultResolve: (v: unknown) => void;
  let resultReject: (e: unknown) => void;
  const resultPromise = new Promise<unknown>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });

  const stream = {
    result: () => resultPromise,
    [Symbol.asyncIterator]: () => {
      let idx = 0;
      return {
        async next() {
          if (errorAfter !== undefined && idx >= errorAfter) {
            const err = new Error("stream failed");
            resultReject!(err);
            throw err;
          }
          if (idx >= events.length) {
            resultResolve!(events[events.length - 1]);
            return { value: undefined, done: true as const };
          }
          return { value: events[idx++], done: false as const };
        },
      };
    },
  };

  return stream;
}

describe("AsyncSemaphore", () => {
  it("allows acquiring up to maxConcurrent slots", async () => {
    const sem = new AsyncSemaphore(2);
    expect(sem.available).toBe(2);

    await sem.acquire();
    expect(sem.available).toBe(1);

    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it("queues acquires when permits exhausted", async () => {
    const sem = new AsyncSemaphore(1);
    await sem.acquire();
    expect(sem.available).toBe(0);

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Should not have acquired yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);
    expect(sem.pendingCount).toBe(1);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("release passes permit to next waiting task", async () => {
    const sem = new AsyncSemaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    sem.release();
    await p1;
    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });
});

describe("setProviderMaxConcurrent", () => {
  it("creates a semaphore for the provider", () => {
    setProviderMaxConcurrent("zai", 2);
    const sem = getProviderSemaphore("zai");
    expect(sem).toBeDefined();
    expect(sem!.available).toBe(2);
    expect(sem!.pendingCount).toBe(0);
  });

  it("clamps maxConcurrent to at least 1", () => {
    setProviderMaxConcurrent("zai", 0);
    expect(getProviderSemaphore("zai")!.available).toBe(1);

    setProviderMaxConcurrent("zai", -5);
    expect(getProviderSemaphore("zai")!.available).toBe(1);
  });

  it("normalizes provider id", () => {
    setProviderMaxConcurrent("z.ai", 3);
    expect(getProviderSemaphore("zai")).toBeDefined();
    expect(getProviderSemaphore("zai")!.available).toBe(3);
  });
});

describe("initProviderConcurrencyFromConfig", () => {
  it("initializes semaphores from config providers", () => {
    initProviderConcurrencyFromConfig({
      models: {
        providers: {
          zai: {
            baseUrl: "https://api.z.ai/v1",
            models: [],
            maxConcurrent: 2,
          },
          anthropic: {
            baseUrl: "https://api.anthropic.com/v1",
            models: [],
            // No maxConcurrent → unlimited
          },
        },
      },
    });

    expect(getProviderSemaphore("zai")).toBeDefined();
    expect(getProviderSemaphore("zai")!.available).toBe(2);
    expect(getProviderSemaphore("anthropic")).toBeUndefined();
  });

  it("handles undefined config", () => {
    initProviderConcurrencyFromConfig(undefined);
    expect(getProviderSemaphore("zai")).toBeUndefined();
  });

  it("ignores non-numeric maxConcurrent", () => {
    initProviderConcurrencyFromConfig({
      models: {
        providers: {
          zai: {
            baseUrl: "https://api.z.ai/v1",
            models: [],
            maxConcurrent: "invalid" as unknown as number,
          },
        },
      },
    });
    expect(getProviderSemaphore("zai")).toBeUndefined();
  });
});

describe("resolveProviderMaxConcurrent", () => {
  it("returns maxConcurrent from config for matching provider", () => {
    const cfg = {
      models: {
        providers: {
          zai: {
            baseUrl: "https://api.z.ai/v1",
            models: [],
            maxConcurrent: 3,
          },
        },
      },
    };
    expect(resolveProviderMaxConcurrent(cfg, "zai")).toBe(3);
    expect(resolveProviderMaxConcurrent(cfg, "z.ai")).toBe(3);
  });

  it("returns undefined for provider without maxConcurrent", () => {
    const cfg = {
      models: {
        providers: {
          anthropic: {
            baseUrl: "https://api.anthropic.com/v1",
            models: [],
          },
        },
      },
    };
    expect(resolveProviderMaxConcurrent(cfg, "anthropic")).toBeUndefined();
  });

  it("returns undefined for unknown provider", () => {
    const cfg = { models: { providers: {} } };
    expect(resolveProviderMaxConcurrent(cfg, "unknown")).toBeUndefined();
  });

  it("returns undefined for undefined config", () => {
    expect(resolveProviderMaxConcurrent(undefined, "zai")).toBeUndefined();
  });
});

describe("wrapStreamFnWithConcurrencyGate", () => {
  it("returns original streamFn when no semaphore configured", () => {
    const mockStream = (() => {}) as unknown as StreamFn;
    const wrapped = wrapStreamFnWithConcurrencyGate(mockStream, "unconfigured");
    expect(wrapped).toBe(mockStream);
  });

  it("limits concurrent streams to configured max", async () => {
    setProviderMaxConcurrent("zai", 2);

    let activeCount = 0;
    let maxObserved = 0;

    const mockStreamFn = (() => {
      activeCount++;
      maxObserved = Math.max(maxObserved, activeCount);
      const stream = createMockStream(["chunk1", "chunk2"]);
      // Simulate: stream completes asynchronously after consumers drain it.
      const origResult = stream.result.bind(stream);
      const origIter = stream[Symbol.asyncIterator].bind(stream);
      // Wrap the iterator to decrement active count when done.
      stream[Symbol.asyncIterator] = () => {
        const inner = origIter();
        return {
          async next() {
            const result = await inner.next();
            if (result.done) {
              activeCount--;
            }
            return result;
          },
        };
      };
      stream.result = origResult;
      return stream;
    }) as unknown as StreamFn;

    const wrapped = wrapStreamFnWithConcurrencyGate(mockStreamFn, "zai");

    // Launch 4 concurrent wrapped stream calls (max 2 at a time).
    const consumers = Array.from({ length: 4 }, async () => {
      const stream = await wrapped(undefined as never, undefined as never, undefined);
      const chunks: unknown[] = [];
      for await (const chunk of stream as AsyncIterable<unknown>) {
        chunks.push(chunk);
      }
      return chunks;
    });

    const results = await Promise.all(consumers);

    expect(results).toHaveLength(4);
    for (const chunks of results) {
      expect(chunks).toHaveLength(2);
    }
    // Max concurrency should not exceed 2.
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("releases semaphore slot when stream completes normally", async () => {
    setProviderMaxConcurrent("zai", 1);

    const mockStreamFn = (() => createMockStream(["chunk"])) as unknown as StreamFn;
    const wrapped = wrapStreamFnWithConcurrencyGate(mockStreamFn, "zai");

    // Consume the first stream fully.
    const stream1 = await wrapped(undefined as never, undefined as never, undefined);
    for await (const _ of stream1 as AsyncIterable<unknown>) {
      // drain
    }

    // Wait for result() promise to settle and release semaphore.
    await new Promise((r) => setTimeout(r, 10));

    const sem = getProviderSemaphore("zai")!;
    expect(sem.available).toBe(1);

    // Second stream should proceed without blocking.
    const stream2 = await wrapped(undefined as never, undefined as never, undefined);
    for await (const _ of stream2 as AsyncIterable<unknown>) {
      // drain
    }
  });

  it("releases semaphore slot on streamFn throw", async () => {
    setProviderMaxConcurrent("zai", 1);

    const mockStreamFn = (() => {
      throw new Error("streamFn failed");
    }) as unknown as StreamFn;

    const wrapped = wrapStreamFnWithConcurrencyGate(mockStreamFn, "zai");
    await expect(wrapped(undefined as never, undefined as never, undefined)).rejects.toThrow(
      "streamFn failed",
    );

    const sem = getProviderSemaphore("zai")!;
    expect(sem.available).toBe(1);
  });

  it("releases semaphore slot on stream iteration error", async () => {
    setProviderMaxConcurrent("zai", 1);

    // Create a stream that errors after yielding one event.
    const mockStreamFn = (() => createMockStream(["chunk1", "chunk2"], 1)) as unknown as StreamFn;

    const wrapped = wrapStreamFnWithConcurrencyGate(mockStreamFn, "zai");
    const stream = await wrapped(undefined as never, undefined as never, undefined);

    const chunks: unknown[] = [];
    await expect(async () => {
      for await (const chunk of stream as AsyncIterable<unknown>) {
        chunks.push(chunk);
      }
    }).rejects.toThrow("stream failed");
    expect(chunks).toHaveLength(1);

    // Wait for result() rejection to propagate and release.
    await new Promise((r) => setTimeout(r, 10));

    const sem = getProviderSemaphore("zai")!;
    expect(sem.available).toBe(1);
  });
});

describe("clearProviderConcurrency", () => {
  it("removes all semaphores", () => {
    setProviderMaxConcurrent("zai", 2);
    setProviderMaxConcurrent("anthropic", 5);
    clearProviderConcurrency();
    expect(getProviderSemaphore("zai")).toBeUndefined();
    expect(getProviderSemaphore("anthropic")).toBeUndefined();
  });
});
