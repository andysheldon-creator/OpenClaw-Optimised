import { describe, expect, it, vi } from "vitest";
import type { MeridiaDbBackend } from "./meridia/db/backend.js";
import { MeridiaSearchAdapter } from "./meridia-search-adapter.js";

describe("MeridiaSearchAdapter.readFile", () => {
  it("resolves meridia:// URI via kit resolver", async () => {
    const mockBackend = {
      getRecordById: vi.fn().mockResolvedValue({
        record: {
          id: "test-id",
          ts: "2025-01-15T10:30:00Z",
          kind: "tool_result",
          tool: { name: "write", callId: "c1", isError: false },
          capture: {
            score: 0.8,
            evaluation: { kind: "heuristic", score: 0.8, reason: "test" },
          },
          content: { summary: "Test summary" },
          data: {},
        },
      }),
    } as unknown as MeridiaDbBackend;

    const adapter = new MeridiaSearchAdapter(mockBackend);
    const result = await adapter.readFile({ relPath: "meridia://test-id" });
    expect(result.text).toContain("Experience Kit: test-id");
    expect(result.path).toBe("meridia://test-id");
  });

  it("resolves bare UUID via kit resolver", async () => {
    const mockBackend = {
      getRecordById: vi.fn().mockResolvedValue({
        record: {
          id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          ts: "2025-01-15T10:30:00Z",
          kind: "tool_result",
          tool: { name: "read", callId: "c2", isError: false },
          capture: {
            score: 0.7,
            evaluation: { kind: "heuristic", score: 0.7, reason: "file read" },
          },
          content: { topic: "Debug session" },
          data: {},
        },
      }),
    } as unknown as MeridiaDbBackend;

    const adapter = new MeridiaSearchAdapter(mockBackend);
    const result = await adapter.readFile({
      relPath: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.text).toContain("Experience Kit");
    expect(result.path).toContain("meridia://");
  });

  it("returns empty for missing record", async () => {
    const mockBackend = {
      getRecordById: vi.fn().mockResolvedValue(null),
    } as unknown as MeridiaDbBackend;

    const adapter = new MeridiaSearchAdapter(mockBackend);
    const result = await adapter.readFile({ relPath: "meridia://missing" });
    expect(result.text).toBe("");
    expect(result.path).toBe("");
  });

  it("returns empty for non-meridia path", async () => {
    const mockBackend = {} as MeridiaDbBackend;
    const adapter = new MeridiaSearchAdapter(mockBackend);
    const result = await adapter.readFile({ relPath: "some/other/path" });
    expect(result.text).toBe("");
    expect(result.path).toBe("");
  });
});
