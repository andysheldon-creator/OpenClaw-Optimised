import { describe, expect, it } from "vitest";

import { formatDurationMs, formatDurationSeconds } from "./format-duration.js";

describe("formatDurationSeconds", () => {
  it("formats basic seconds correctly", () => {
    // 1500ms = 1.5s
    expect(formatDurationSeconds(1500)).toBe("1.5s");
  });

  it("handles 0 correctly", () => {
    expect(formatDurationSeconds(0)).toBe("0s");
  });

  it("respects decimal precision option", () => {
    // 1559ms = 1.559s -> rounds to 1.56s
    // The implementation uses toFixed which rounds.
    expect(formatDurationSeconds(1559, { decimals: 2 })).toBe("1.56s");
    expect(formatDurationSeconds(1559, { decimals: 0 })).toBe("2s");
  });

  it("removes trailing zeros and decimal point if integer", () => {
    expect(formatDurationSeconds(2000)).toBe("2s");
    expect(formatDurationSeconds(2100)).toBe("2.1s");
    expect(formatDurationSeconds(2100, { decimals: 2 })).toBe("2.1s"); // Not "2.10s" due to regex replacer
  });

  it("supports verbose unit label", () => {
    expect(formatDurationSeconds(1500, { unit: "seconds" })).toBe("1.5 seconds");
  });

  it("handles negative numbers as 0 (implementation detail)", () => {
    // The implementation does Math.max(0, ms)
    expect(formatDurationSeconds(-100)).toBe("0s");
  });

  it("handles non-finite numbers", () => {
    expect(formatDurationSeconds(NaN)).toBe("unknown");
    expect(formatDurationSeconds(Infinity)).toBe("unknown");
  });
});

describe("formatDurationMs", () => {
  it("formats sub-second values as ms", () => {
    expect(formatDurationMs(500)).toBe("500ms");
    expect(formatDurationMs(999)).toBe("999ms");
  });

  it("formats values >= 1000ms as seconds (defaulting to 2 decimals)", () => {
    // Default decimals for formatDurationMs is 2
    expect(formatDurationMs(1000)).toBe("1s");
    expect(formatDurationMs(1500)).toBe("1.5s");
    expect(formatDurationMs(1234)).toBe("1.23s");
  });

  it("passes options to formatDurationSeconds when >= 1000ms", () => {
    expect(formatDurationMs(1234, { decimals: 1 })).toBe("1.2s");
    expect(formatDurationMs(1500, { unit: "seconds" })).toBe("1.5 seconds");
  });

  it("handles non-finite numbers", () => {
    expect(formatDurationMs(Infinity)).toBe("unknown");
  });
});
