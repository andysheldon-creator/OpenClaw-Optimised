import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

type StubSession = {
  subscribe: (fn: (evt: unknown) => void) => () => void;
};

describe("subscribeEmbeddedPiSession compaction timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out compaction retry after specified timeout (issue #5784)", async () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const subscription = subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-timeout",
    });

    // Trigger compaction retry (willRetry=true)
    handler?.({ type: "auto_compaction_start" });
    handler?.({ type: "auto_compaction_end", willRetry: true });

    // Should be compacting
    expect(subscription.isCompacting()).toBe(true);

    // Start waiting with a 100ms timeout
    const waitPromise = subscription.waitForCompactionRetry(100);

    // Advance time past timeout
    await vi.advanceTimersByTimeAsync(150);

    // Should resolve with timedOut: true
    const result = await waitPromise;
    expect(result.timedOut).toBe(true);

    // Compaction state should be cleaned up
    expect(subscription.isCompacting()).toBe(false);
  });

  it("resolves normally if compaction completes before timeout", async () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const subscription = subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-normal",
    });

    // Trigger compaction retry
    handler?.({ type: "auto_compaction_start" });
    handler?.({ type: "auto_compaction_end", willRetry: true });

    const waitPromise = subscription.waitForCompactionRetry(60_000);

    // Complete compaction normally via agent_end
    handler?.({ type: "agent_end" });

    const result = await waitPromise;
    expect(result.timedOut).toBeUndefined();
    expect(subscription.isCompacting()).toBe(false);
  });

  it("uses default timeout of 60 seconds when not specified", async () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const subscription = subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-default-timeout",
    });

    handler?.({ type: "auto_compaction_start" });
    handler?.({ type: "auto_compaction_end", willRetry: true });

    const waitPromise = subscription.waitForCompactionRetry();

    // Advance 59 seconds - should still be waiting
    await vi.advanceTimersByTimeAsync(59_000);
    expect(subscription.isCompacting()).toBe(true);

    // Advance past 60 seconds
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await waitPromise;
    expect(result.timedOut).toBe(true);
  });
});
