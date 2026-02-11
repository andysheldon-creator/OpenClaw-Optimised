import { describe, expect, it } from "vitest";
import { ZulipApiError } from "./client.js";
import { hashZulipTopicKey, resolveMonitorBackoffMs } from "./monitor.js";

describe("hashZulipTopicKey", () => {
  it("is stable and short for very long topics", () => {
    const topic = "x".repeat(10_000);
    const a = hashZulipTopicKey(topic);
    const b = hashZulipTopicKey(topic);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });
});

describe("resolveMonitorBackoffMs", () => {
  it("honors Retry-After when present", () => {
    const err = new ZulipApiError("rate limited", { status: 429, retryAfterMs: 4200 });
    expect(resolveMonitorBackoffMs({ error: err, consecutiveFailures: 1 })).toBe(4200);
  });

  it("uses stronger backoff for 429 without Retry-After", () => {
    const err = new ZulipApiError("rate limited", { status: 429 });
    expect(resolveMonitorBackoffMs({ error: err, consecutiveFailures: 1 })).toBe(4000);
  });

  it("falls back to incremental backoff for generic errors", () => {
    expect(resolveMonitorBackoffMs({ error: new Error("boom"), consecutiveFailures: 3 })).toBe(
      6000,
    );
  });
});
