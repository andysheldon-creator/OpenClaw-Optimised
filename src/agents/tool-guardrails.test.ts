import { beforeEach, describe, expect, it } from "vitest";
import { evaluateToolGuardrails, resetToolGuardrailStateForTests } from "./tool-guardrails.js";

describe("tool guardrails", () => {
  beforeEach(() => {
    resetToolGuardrailStateForTests();
  });

  it("blocks tool names listed in toolBlocklist", () => {
    const result = evaluateToolGuardrails({
      toolName: "message.send",
      sessionKey: "session-1",
      guardrails: {
        toolBlocklist: ["message.send"],
      },
      nowMs: 1_000,
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'Tool "message.send" is blocked by agent guardrails.',
    });
  });

  it("enforces maxToolCallsPerSession", () => {
    const guardrails = { maxToolCallsPerSession: 2 };
    expect(
      evaluateToolGuardrails({
        toolName: "read",
        sessionKey: "session-1",
        guardrails,
        nowMs: 1_000,
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluateToolGuardrails({
        toolName: "read",
        sessionKey: "session-1",
        guardrails,
        nowMs: 1_100,
      }),
    ).toEqual({ allowed: true });
    const blocked = evaluateToolGuardrails({
      toolName: "read",
      sessionKey: "session-1",
      guardrails,
      nowMs: 1_200,
    });
    expect(blocked.allowed).toBe(false);
  });

  it("enforces maxToolCallsPerMinute", () => {
    const guardrails = { maxToolCallsPerMinute: 2 };
    expect(
      evaluateToolGuardrails({
        toolName: "read",
        sessionKey: "session-1",
        guardrails,
        nowMs: 10_000,
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluateToolGuardrails({
        toolName: "write",
        sessionKey: "session-1",
        guardrails,
        nowMs: 10_100,
      }),
    ).toEqual({ allowed: true });
    const blocked = evaluateToolGuardrails({
      toolName: "edit",
      sessionKey: "session-1",
      guardrails,
      nowMs: 10_200,
    });
    expect(blocked.allowed).toBe(false);
    const afterWindow = evaluateToolGuardrails({
      toolName: "edit",
      sessionKey: "session-1",
      guardrails,
      nowMs: 70_201,
    });
    expect(afterWindow).toEqual({ allowed: true });
  });

  it("enforces per-tool minute limits via toolRateLimits", () => {
    const guardrails = {
      toolRateLimits: {
        "message.send": { maxPerMinute: 1 },
      },
    };
    expect(
      evaluateToolGuardrails({
        toolName: "message.send",
        sessionKey: "session-1",
        guardrails,
        nowMs: 20_000,
      }),
    ).toEqual({ allowed: true });
    const blocked = evaluateToolGuardrails({
      toolName: "message.send",
      sessionKey: "session-1",
      guardrails,
      nowMs: 20_100,
    });
    expect(blocked.allowed).toBe(false);
    expect(
      evaluateToolGuardrails({
        toolName: "read",
        sessionKey: "session-1",
        guardrails,
        nowMs: 20_100,
      }),
    ).toEqual({ allowed: true });
  });
});
