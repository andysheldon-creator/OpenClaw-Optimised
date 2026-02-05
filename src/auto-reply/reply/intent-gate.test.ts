import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { muscleEligible, requiresBrain } from "./intent-gate.js";

const makeSession = (overrides: Partial<SessionEntry> = {}): SessionEntry => ({
  sessionId: "session-id",
  updatedAt: Date.now(),
  ...overrides,
});

describe("intent gate", () => {
  it("requires brain for planning prompts", () => {
    expect(requiresBrain("Can you propose a rollout strategy for this migration?", {})).toBe(true);
  });

  it("marks explicit transforms as muscle-eligible", () => {
    expect(muscleEligible("rewrite this paragraph as a bullet list", {})).toBe(true);
    expect(requiresBrain("rewrite this paragraph as a bullet list", {})).toBe(false);
  });

  it("lets session reasoning preference suppress muscle eligibility", () => {
    const sessionEntry = makeSession({ reasoningLevel: "on" });
    expect(muscleEligible("summarize this log as json", { sessionEntry })).toBe(false);
  });

  it("uses session store lookup when session entry is omitted", () => {
    const sessionEntry = makeSession({
      modelOverride: "anthropic/claude-opus-4-5",
    });
    expect(
      requiresBrain("Thoughts?", {
        sessionStore: { "agent:main:main": sessionEntry },
        sessionKey: "agent:main:main",
      }),
    ).toBe(true);
  });
});
