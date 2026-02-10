import { describe, expect, it } from "vitest";
import { NO_TIMEOUT, resolveAgentTimeoutMs } from "./timeout.js";

describe("resolveAgentTimeoutMs", () => {
  it("returns NO_TIMEOUT (0) for no-timeout overrides so callers skip the timer", () => {
    expect(resolveAgentTimeoutMs({ overrideSeconds: 0 })).toBe(NO_TIMEOUT);
    expect(resolveAgentTimeoutMs({ overrideMs: 0 })).toBe(NO_TIMEOUT);
    expect(NO_TIMEOUT).toBe(0);
  });

  it("clamps very large timeout overrides to timer-safe values", () => {
    expect(resolveAgentTimeoutMs({ overrideSeconds: 9_999_999 })).toBe(2_147_000_000);
    expect(resolveAgentTimeoutMs({ overrideMs: 9_999_999_999 })).toBe(2_147_000_000);
  });
});
