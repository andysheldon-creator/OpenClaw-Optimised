import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { MeridiaExperienceRecord } from "./types.js";
import { dispatchFanout, fanoutToGraph, fanoutBatchToGraph } from "./fanout.js";

const makeRecord = (overrides?: Partial<MeridiaExperienceRecord>): MeridiaExperienceRecord => ({
  id: "test-id",
  ts: new Date().toISOString(),
  kind: "tool_result",
  session: { key: "session-1", id: "sid-1", runId: "run-1" },
  tool: { name: "write", callId: "call-1", isError: false },
  capture: {
    score: 0.8,
    evaluation: { kind: "heuristic", score: 0.8, reason: "test" },
  },
  content: {
    topic: "Test topic",
    summary: "Test summary",
  },
  data: { args: { path: "/test" }, result: { ok: true } },
  ...overrides,
});

describe("fanoutToGraph", () => {
  it("returns error when no config provided", async () => {
    const result = await fanoutToGraph(makeRecord(), undefined);
    expect(result.success).toBe(false);
    expect(result.target).toBe("graphiti");
    expect(result.error).toBe("No config");
  });

  it("returns error when graphiti not enabled", async () => {
    const cfg = { memory: {} } as unknown as OpenClawConfig;
    const result = await fanoutToGraph(makeRecord(), cfg);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Graphiti not enabled");
  });

  it("returns error when record has no text content", async () => {
    const cfg = {
      memory: {
        graphiti: { enabled: true, serverHost: "localhost", servicePort: 8000 },
      },
    } as unknown as OpenClawConfig;
    const record = makeRecord({ content: undefined });
    const result = await fanoutToGraph(record, cfg);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No text content to push");
  });
});

describe("fanoutBatchToGraph", () => {
  it("returns error when no config provided", async () => {
    const result = await fanoutBatchToGraph([], undefined);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No config");
  });

  it("returns error when graphiti not enabled", async () => {
    const cfg = { memory: {} } as unknown as OpenClawConfig;
    const result = await fanoutBatchToGraph([], cfg);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Graphiti not enabled");
  });
});

describe("dispatchFanout", () => {
  it("swallows errors from the async function", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    dispatchFanout(async () => {
      throw new Error("test error");
    }, "test");

    // Give the microtask a tick to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[fanout:test] dispatch error: test error"),
    );
    warnSpy.mockRestore();
  });

  it("does not throw when function succeeds", () => {
    expect(() =>
      dispatchFanout(
        async () => ({ target: "graphiti" as const, success: true, durationMs: 0 }),
        "test",
      ),
    ).not.toThrow();
  });
});
