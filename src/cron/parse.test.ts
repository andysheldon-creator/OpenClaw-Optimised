import { describe, expect, it } from "vitest";
import { parseAbsoluteTimeMs } from "./parse.js";

describe("parseAbsoluteTimeMs", () => {
  // --- Epoch milliseconds (numeric strings) ---

  it("parses a plain integer string as epoch milliseconds", () => {
    expect(parseAbsoluteTimeMs("1700000000000")).toBe(1700000000000);
  });

  it("parses a small positive integer", () => {
    expect(parseAbsoluteTimeMs("1")).toBe(1);
  });

  it("floors fractional-looking integers (integer-only regex)", () => {
    // "123.456" is not all-digits so falls through to Date.parse
    const result = parseAbsoluteTimeMs("123.456");
    // Date.parse("123.456") is NaN → null
    expect(result).toBeNull();
  });

  // --- ISO 8601 with timezone ---

  it("parses a full ISO 8601 date-time with Z suffix", () => {
    const result = parseAbsoluteTimeMs("2026-01-15T12:30:00Z");
    expect(result).toBe(Date.parse("2026-01-15T12:30:00Z"));
  });

  it("parses ISO 8601 with positive UTC offset", () => {
    const result = parseAbsoluteTimeMs("2026-06-01T08:00:00+05:30");
    expect(result).toBe(Date.parse("2026-06-01T08:00:00+05:30"));
  });

  it("parses ISO 8601 with negative UTC offset", () => {
    const result = parseAbsoluteTimeMs("2026-03-15T20:00:00-04:00");
    expect(result).toBe(Date.parse("2026-03-15T20:00:00-04:00"));
  });

  // --- ISO 8601 date-only (no timezone → appends T00:00:00Z) ---

  it("normalizes a date-only string to midnight UTC", () => {
    const result = parseAbsoluteTimeMs("2026-07-04");
    expect(result).toBe(Date.parse("2026-07-04T00:00:00Z"));
  });

  // --- ISO 8601 date-time without timezone (appends Z) ---

  it("normalizes date-time without timezone by appending Z", () => {
    const result = parseAbsoluteTimeMs("2026-01-15T12:30:00");
    expect(result).toBe(Date.parse("2026-01-15T12:30:00Z"));
  });

  it("normalizes date-time with fractional seconds and no timezone", () => {
    const result = parseAbsoluteTimeMs("2026-01-15T12:30:00.500");
    expect(result).toBe(Date.parse("2026-01-15T12:30:00.500Z"));
  });

  // --- Whitespace handling ---

  it("trims leading and trailing whitespace", () => {
    expect(parseAbsoluteTimeMs("  1700000000000  ")).toBe(1700000000000);
  });

  it("trims whitespace around ISO date", () => {
    const result = parseAbsoluteTimeMs("  2026-01-15T12:30:00Z  ");
    expect(result).toBe(Date.parse("2026-01-15T12:30:00Z"));
  });

  // --- Null / invalid inputs ---

  it("returns null for an empty string", () => {
    expect(parseAbsoluteTimeMs("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(parseAbsoluteTimeMs("   ")).toBeNull();
  });

  it("returns null for non-numeric, non-date string", () => {
    expect(parseAbsoluteTimeMs("not-a-date")).toBeNull();
  });

  it("falls through to Date.parse for zero", () => {
    // "0" matches /^\d+$/ but n > 0 fails, so falls to Date.parse("0") which
    // interprets "0" as a year and returns a valid timestamp
    const result = parseAbsoluteTimeMs("0");
    expect(result).toBe(Date.parse("0"));
  });

  it("falls through to Date.parse for negative string", () => {
    // "-1" doesn't match /^\d+$/, falls to Date.parse("-1") which interprets
    // it as a year and returns a valid timestamp
    const result = parseAbsoluteTimeMs("-1");
    expect(result).toBe(Date.parse("-1"));
  });

  it("returns null for an invalid ISO date", () => {
    expect(parseAbsoluteTimeMs("2026-13-45T99:99:99Z")).toBeNull();
  });
});
