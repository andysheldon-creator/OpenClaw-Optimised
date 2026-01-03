import { describe, expect, it } from "vitest";

import { parseNaturalSchedule } from "./natural-language.js";

describe("parseNaturalSchedule", () => {
  it("parses relative durations", () => {
    const nowMs = Date.parse("2026-01-03T12:00:00.000Z");

    expect(parseNaturalSchedule("in 5 minutes", undefined, nowMs)).toEqual({
      kind: "at",
      atMs: nowMs + 5 * 60_000,
    });

    expect(parseNaturalSchedule("in 2 hours", undefined, nowMs)).toEqual({
      kind: "at",
      atMs: nowMs + 2 * 60 * 60_000,
    });

    expect(parseNaturalSchedule("in 3 days", undefined, nowMs)).toEqual({
      kind: "at",
      atMs: nowMs + 3 * 24 * 60 * 60_000,
    });
  });

  it("parses repeating intervals", () => {
    expect(parseNaturalSchedule("every 15 minutes")).toEqual({
      kind: "every",
      everyMs: 15 * 60_000,
    });

    expect(parseNaturalSchedule("every 2 hours")).toEqual({
      kind: "every",
      everyMs: 2 * 60 * 60_000,
    });
  });

  it("parses daily cron times", () => {
    expect(parseNaturalSchedule("at 9am", "America/Los_Angeles")).toEqual({
      kind: "cron",
      expr: "0 9 * * *",
      tz: "America/Los_Angeles",
    });

    expect(parseNaturalSchedule("every day at 3pm")).toEqual({
      kind: "cron",
      expr: "0 15 * * *",
      tz: undefined,
    });
  });

  it("parses tomorrow at time", () => {
    const nowMs = Date.parse("2026-01-03T12:00:00.000Z");
    const expected = new Date(nowMs);
    expected.setDate(expected.getDate() + 1);
    expected.setHours(6, 0, 0, 0);

    expect(parseNaturalSchedule("tomorrow at 6am", undefined, nowMs)).toEqual({
      kind: "at",
      atMs: expected.getTime(),
    });
  });

  it("returns null for unsupported input", () => {
    expect(parseNaturalSchedule("next week")).toBeNull();
  });
});
