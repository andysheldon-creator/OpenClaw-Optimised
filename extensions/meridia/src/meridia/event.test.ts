import { describe, expect, it } from "vitest";
import type { HookEvent } from "./event.js";
import {
  asObject,
  resolveHookConfig,
  readNumber,
  readPositiveNumber,
  readString,
  readBoolean,
  nowIso,
  safeFileKey,
  resolveSessionContext,
  resolveSessionIdFromEntry,
  normalizeToolResultEvent,
  eventToToolResultContext,
} from "./event.js";

// ────────────────────────────────────────────────────────────────────────────
// asObject
// ────────────────────────────────────────────────────────────────────────────

describe("asObject", () => {
  it("returns object for valid object", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
  });
  it("returns null for null", () => {
    expect(asObject(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(asObject(undefined)).toBeNull();
  });
  it("returns null for string", () => {
    expect(asObject("hello")).toBeNull();
  });
  it("returns null for number", () => {
    expect(asObject(42)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// readNumber
// ────────────────────────────────────────────────────────────────────────────

describe("readNumber", () => {
  it("reads number from first matching key", () => {
    expect(readNumber({ a: 5, b: 10 }, ["a", "b"], 0)).toBe(5);
  });
  it("falls back to second key when first is missing", () => {
    expect(readNumber({ b: 10 }, ["a", "b"], 0)).toBe(10);
  });
  it("parses string numbers", () => {
    expect(readNumber({ a: "42" }, ["a"], 0)).toBe(42);
  });
  it("returns fallback for non-numeric", () => {
    expect(readNumber({ a: "abc" }, ["a"], 99)).toBe(99);
  });
  it("returns fallback for undefined config", () => {
    expect(readNumber(undefined, ["a"], 99)).toBe(99);
  });
  it("accepts single key string", () => {
    expect(readNumber({ val: 7 }, "val", 0)).toBe(7);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// readPositiveNumber
// ────────────────────────────────────────────────────────────────────────────

describe("readPositiveNumber", () => {
  it("returns positive number", () => {
    expect(readPositiveNumber({ a: 5 }, "a", 10)).toBe(5);
  });
  it("returns fallback for zero", () => {
    expect(readPositiveNumber({ a: 0 }, "a", 10)).toBe(10);
  });
  it("returns fallback for negative", () => {
    expect(readPositiveNumber({ a: -3 }, "a", 10)).toBe(10);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// readString
// ────────────────────────────────────────────────────────────────────────────

describe("readString", () => {
  it("reads string from first matching key", () => {
    expect(readString({ a: "hello" }, ["a"])).toBe("hello");
  });
  it("trims whitespace", () => {
    expect(readString({ a: "  hello  " }, ["a"])).toBe("hello");
  });
  it("skips empty strings", () => {
    expect(readString({ a: "  ", b: "world" }, ["a", "b"])).toBe("world");
  });
  it("returns fallback when no match", () => {
    expect(readString({}, ["a"], "default")).toBe("default");
  });
  it("returns undefined when no fallback", () => {
    expect(readString({}, ["a"])).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// readBoolean
// ────────────────────────────────────────────────────────────────────────────

describe("readBoolean", () => {
  it("reads true", () => {
    expect(readBoolean({ a: true }, "a", false)).toBe(true);
  });
  it("reads false", () => {
    expect(readBoolean({ a: false }, "a", true)).toBe(false);
  });
  it("returns fallback for non-boolean", () => {
    expect(readBoolean({ a: "true" }, "a", false)).toBe(false);
  });
  it("accepts array keys", () => {
    expect(readBoolean({ b: true }, ["a", "b"], false)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// nowIso & safeFileKey
// ────────────────────────────────────────────────────────────────────────────

describe("nowIso", () => {
  it("returns ISO string", () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("safeFileKey", () => {
  it("replaces special characters", () => {
    expect(safeFileKey("hello/world:test")).toBe("hello_world_test");
  });
  it("preserves dots, dashes, underscores", () => {
    expect(safeFileKey("file.name-v1_2")).toBe("file.name-v1_2");
  });
  it("trims whitespace", () => {
    expect(safeFileKey("  hello  ")).toBe("hello");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// resolveHookConfig
// ────────────────────────────────────────────────────────────────────────────

describe("resolveHookConfig", () => {
  it("resolves nested hook config", () => {
    const cfg = {
      hooks: { internal: { entries: { myHook: { enabled: true } } } },
    } as never;
    expect(resolveHookConfig(cfg, "myHook")).toEqual({ enabled: true });
  });
  it("returns undefined for missing hook", () => {
    const cfg = { hooks: { internal: { entries: {} } } } as never;
    expect(resolveHookConfig(cfg, "missing")).toBeUndefined();
  });
  it("returns undefined for undefined config", () => {
    expect(resolveHookConfig(undefined, "any")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// resolveSessionContext & resolveSessionIdFromEntry
// ────────────────────────────────────────────────────────────────────────────

describe("resolveSessionContext", () => {
  it("extracts session info from context", () => {
    const event: HookEvent = {
      type: "agent",
      action: "tool:result",
      timestamp: new Date(),
      sessionKey: "event-key",
    };
    const ctx = { sessionId: "sid", sessionKey: "ctx-key", runId: "rid" };
    const result = resolveSessionContext(event, ctx);
    expect(result).toEqual({ sessionId: "sid", sessionKey: "ctx-key", runId: "rid" });
  });
  it("falls back to event.sessionKey", () => {
    const event: HookEvent = {
      type: "agent",
      action: "tool:result",
      timestamp: new Date(),
      sessionKey: "event-key",
    };
    const result = resolveSessionContext(event, {});
    expect(result.sessionKey).toBe("event-key");
  });
});

describe("resolveSessionIdFromEntry", () => {
  it("extracts sessionId from object", () => {
    expect(resolveSessionIdFromEntry({ sessionId: "abc" })).toBe("abc");
  });
  it("returns undefined for missing sessionId", () => {
    expect(resolveSessionIdFromEntry({ other: "val" })).toBeUndefined();
  });
  it("returns undefined for non-object", () => {
    expect(resolveSessionIdFromEntry("string")).toBeUndefined();
  });
  it("trims whitespace", () => {
    expect(resolveSessionIdFromEntry({ sessionId: "  abc  " })).toBe("abc");
  });
  it("returns undefined for empty sessionId", () => {
    expect(resolveSessionIdFromEntry({ sessionId: "  " })).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// normalizeToolResultEvent
// ────────────────────────────────────────────────────────────────────────────

describe("normalizeToolResultEvent", () => {
  const baseEvent: HookEvent = {
    type: "agent",
    action: "tool:result",
    timestamp: new Date(),
    sessionKey: "sk",
  };

  it("normalizes a valid tool result", () => {
    const context = {
      toolName: "exec",
      toolCallId: "call-1",
      sessionId: "sid",
      args: { cmd: "ls" },
      result: "output",
    };
    const result = normalizeToolResultEvent(baseEvent, context);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("tool_result");
    expect(result!.tool?.name).toBe("exec");
    expect(result!.tool?.callId).toBe("call-1");
    expect(result!.session?.id).toBe("sid");
    expect(result!.provenance.source).toBe("hook");
  });

  it("returns null when toolName is missing", () => {
    expect(normalizeToolResultEvent(baseEvent, { toolCallId: "c" })).toBeNull();
  });

  it("returns null when toolCallId is missing", () => {
    expect(normalizeToolResultEvent(baseEvent, { toolName: "t" })).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// eventToToolResultContext
// ────────────────────────────────────────────────────────────────────────────

describe("eventToToolResultContext", () => {
  it("bridges MeridiaEvent to MeridiaToolResultContext", () => {
    const event = {
      id: "e1",
      kind: "tool_result" as const,
      ts: "2024-01-01T00:00:00Z",
      tool: { name: "write", callId: "c1", isError: false },
      session: { key: "sk" },
      payload: { args: { path: "/tmp" }, result: "ok" },
      provenance: { source: "hook" as const },
    };
    const ctx = eventToToolResultContext(event);
    expect(ctx).not.toBeNull();
    expect(ctx!.tool.name).toBe("write");
    expect(ctx!.args).toEqual({ path: "/tmp" });
    expect(ctx!.result).toBe("ok");
  });

  it("returns null for non-tool_result events", () => {
    const event = {
      id: "e1",
      kind: "user_message" as const,
      ts: "2024-01-01T00:00:00Z",
      payload: {},
      provenance: { source: "hook" as const },
    };
    expect(eventToToolResultContext(event)).toBeNull();
  });

  it("returns null when tool name is missing", () => {
    const event = {
      id: "e1",
      kind: "tool_result" as const,
      ts: "2024-01-01T00:00:00Z",
      tool: { callId: "c1" },
      payload: {},
      provenance: { source: "hook" as const },
    };
    expect(eventToToolResultContext(event)).toBeNull();
  });
});
