import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubsystemLogger } from "../logging/subsystem.js";
import {
  logRateLimitDenied,
  logAuthLockout,
  maskKey,
  RateLimitStats,
  getRateLimitStats,
  resetRateLimitStats,
} from "./rate-limit-logger.js";

function makeMockLogger(): SubsystemLogger & { calls: { level: string; args: unknown[] }[] } {
  const calls: { level: string; args: unknown[] }[] = [];
  const mock =
    (level: string) =>
    (...args: unknown[]) =>
      calls.push({ level, args });
  return {
    calls,
    subsystem: "test",
    trace: mock("trace"),
    debug: mock("debug"),
    info: mock("info"),
    warn: mock("warn"),
    error: mock("error"),
    fatal: mock("fatal"),
    raw: mock("raw"),
    child: () => makeMockLogger(),
  };
}

describe("maskKey", () => {
  it("returns short keys unchanged", () => {
    expect(maskKey("abc")).toBe("abc");
    expect(maskKey("123456")).toBe("123456");
  });

  it("masks keys longer than 6 chars", () => {
    expect(maskKey("192.168.1.100")).toBe("192.16***");
    expect(maskKey("abcdefghij")).toBe("abcdef***");
  });
});

describe("logRateLimitDenied", () => {
  it("calls logger.warn with correct structure", () => {
    const logger = makeMockLogger();
    logRateLimitDenied(logger, {
      layer: "http",
      endpoint: "/v1/chat/completions",
      key: "192.168.1.100",
      remaining: 0,
      retryAfterMs: 5000,
      limiterName: "agent-per-ip",
    });
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0].level).toBe("warn");
    expect(logger.calls[0].args[0]).toBe("rate-limit-denied");
    expect(logger.calls[0].args[1]).toEqual({
      layer: "http",
      endpoint: "/v1/chat/completions",
      key: "192.16***",
      remaining: 0,
      retryAfterMs: 5000,
      limiterName: "agent-per-ip",
    });
  });

  it("does not log sensitive data (full tokens, passwords)", () => {
    const logger = makeMockLogger();
    logRateLimitDenied(logger, {
      layer: "ws",
      key: "super-secret-token-value",
      remaining: 0,
    });
    const meta = logger.calls[0].args[1] as Record<string, unknown>;
    expect(meta.key).toBe("super-***");
    expect(meta.key).not.toContain("secret");
  });

  it("key field is truncated/masked for privacy", () => {
    const logger = makeMockLogger();
    logRateLimitDenied(logger, {
      layer: "external",
      key: "long-api-key-here",
      remaining: 0,
    });
    const meta = logger.calls[0].args[1] as Record<string, unknown>;
    expect(meta.key).toBe("long-a***");
  });
});

describe("logAuthLockout", () => {
  it("calls logger.warn with correct structure", () => {
    const logger = makeMockLogger();
    logAuthLockout(logger, {
      ip: "192.168.1.100",
      failures: 10,
      windowMinutes: 15,
    });
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0].level).toBe("warn");
    expect(logger.calls[0].args[0]).toBe("auth-lockout");
    expect(logger.calls[0].args[1]).toEqual({
      ip: "192.16***",
      failures: 10,
      windowMinutes: 15,
    });
  });
});

describe("RateLimitStats", () => {
  let stats: RateLimitStats;

  afterEach(() => {
    stats?.reset();
    resetRateLimitStats();
  });

  it("tracks denial counts per layer", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    stats.recordDenial("http", "ip1", now);
    stats.recordDenial("http", "ip1", now + 100);
    stats.recordDenial("ws", "ip2", now + 200);
    stats.recordDenial("auth", "ip3", now + 300);

    const summary = stats.getSummary(now + 400);
    expect(summary.denials.http).toBe(2);
    expect(summary.denials.ws).toBe(1);
    expect(summary.denials.auth).toBe(1);
    expect(summary.denials.external).toBe(0);
  });

  it("getSummary returns correct totals", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    stats.recordDenial("http", "ip1", now);
    stats.recordDenial("external", "elevenlabs", now + 100);

    const summary = stats.getSummary(now + 200);
    expect(summary.period).toBe("5m");
    expect(summary.denials.http).toBe(1);
    expect(summary.denials.external).toBe(1);
  });

  it("rolling 5-min window excludes old events", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    const fiveMinutesAgo = now - 5 * 60 * 1000 - 1;

    stats.recordDenial("http", "ip1", fiveMinutesAgo);
    stats.recordDenial("http", "ip2", now);

    const summary = stats.getSummary(now);
    expect(summary.denials.http).toBe(1);
  });

  it("topKeys returns top offenders sorted by count", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    // ip1: 3 denials, ip2: 1 denial
    stats.recordDenial("http", "ip1", now);
    stats.recordDenial("http", "ip1", now + 1);
    stats.recordDenial("http", "ip1", now + 2);
    stats.recordDenial("http", "ip2", now + 3);

    const summary = stats.getSummary(now + 4);
    expect(summary.topKeys[0]).toEqual({ key: "ip1", denials: 3 });
    expect(summary.topKeys[1]).toEqual({ key: "ip2", denials: 1 });
  });

  it("reset clears all stats", () => {
    stats = new RateLimitStats();
    stats.recordDenial("http", "ip1", Date.now());
    expect(stats.size).toBeGreaterThan(0);

    stats.reset();
    expect(stats.size).toBe(0);
    expect(stats.hasDenials()).toBe(false);
  });

  it("prune removes old records", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    const old = now - 6 * 60 * 1000;
    stats.recordDenial("http", "ip1", old);
    stats.recordDenial("http", "ip2", now);
    expect(stats.size).toBe(2);

    stats.prune(now);
    expect(stats.size).toBe(1);
  });

  it("hasDenials returns false when no recent denials", () => {
    stats = new RateLimitStats();
    const now = 1000000;
    const old = now - 6 * 60 * 1000;
    stats.recordDenial("http", "ip1", old);
    expect(stats.hasDenials(now)).toBe(false);
  });

  it("getRateLimitStats returns singleton", () => {
    const a = getRateLimitStats();
    const b = getRateLimitStats();
    expect(a).toBe(b);
  });
});
