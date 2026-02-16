import { afterEach, describe, expect, it } from "vitest";

import {
  buildSynthesisPrompt,
  cancelMeeting,
  clearAllMeetings,
  completeMeeting,
  createMeeting,
  failAgentInput,
  formatMeetingSummary,
  getActiveMeetings,
  getMeeting,
  isMeetingTimedOut,
  recordAgentInput,
  skipAgentInput,
  startMeeting,
} from "./meeting.js";

afterEach(() => {
  clearAllMeetings();
});

describe("createMeeting", () => {
  it("creates a meeting with all specialist inputs", () => {
    const meeting = createMeeting({ topic: "European expansion" });
    expect(meeting).toBeDefined();
    expect(meeting?.topic).toBe("European expansion");
    expect(meeting?.status).toBe("pending");
    expect(meeting?.initiatedBy).toBe("general");
    expect(meeting?.id).toMatch(/^meeting-/);

    // Should have 5 specialist inputs (excluding general)
    expect(meeting?.inputs).toHaveLength(5);
    const roles = meeting?.inputs.map((i) => i.agent) ?? [];
    expect(roles).toContain("research");
    expect(roles).toContain("finance");
    expect(roles).toContain("content");
    expect(roles).toContain("strategy");
    expect(roles).toContain("critic");
    expect(roles).not.toContain("general"); // General synthesizes, doesn't provide input
  });

  it("all inputs start as pending", () => {
    const meeting = createMeeting({ topic: "Test" });
    for (const input of meeting?.inputs ?? []) {
      expect(input.status).toBe("pending");
      expect(input.prompt).toBeTruthy();
    }
  });

  it("uses custom max duration and turns", () => {
    const meeting = createMeeting({
      topic: "Quick meeting",
      maxDurationMs: 60_000,
      maxTurnsPerAgent: 1,
    });
    expect(meeting?.maxDurationMs).toBe(60_000);
    expect(meeting?.maxTurnsPerAgent).toBe(1);
  });
});

describe("startMeeting", () => {
  it("transitions meeting to in-progress", () => {
    const meeting = createMeeting({ topic: "Test" });
    const started = startMeeting(meeting?.id);
    expect(started?.status).toBe("in-progress");
    expect(started?.startedAt).toBeDefined();
  });

  it("returns undefined for non-pending meeting", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);
    // Try to start again
    expect(startMeeting(meeting?.id)).toBeUndefined();
  });

  it("returns undefined for unknown meeting", () => {
    expect(startMeeting("nonexistent")).toBeUndefined();
  });
});

describe("recordAgentInput", () => {
  it("records an agent response", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    const updated = recordAgentInput(
      meeting?.id,
      "finance",
      "Budget analysis shows $500k needed",
      1500,
    );
    const input = updated?.inputs.find((i) => i.agent === "finance");
    expect(input?.status).toBe("completed");
    expect(input?.response).toBe("Budget analysis shows $500k needed");
    expect(input?.durationMs).toBe(1500);
  });

  it("transitions to synthesizing when all inputs complete", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    for (const input of meeting?.inputs ?? []) {
      recordAgentInput(
        meeting?.id,
        input.agent,
        `Response from ${input.agent}`,
      );
    }

    const updated = getMeeting(meeting?.id);
    expect(updated?.status).toBe("synthesizing");
  });

  it("returns undefined for non-in-progress meeting", () => {
    const meeting = createMeeting({ topic: "Test" });
    // Not started yet
    expect(recordAgentInput(meeting?.id, "finance", "Test")).toBeUndefined();
  });
});

describe("failAgentInput", () => {
  it("marks an agent input as failed", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    failAgentInput(meeting?.id, "research", "Timeout");
    const input = getMeeting(meeting?.id)?.inputs.find(
      (i) => i.agent === "research",
    );
    expect(input?.status).toBe("failed");
    expect(input?.response).toBe("Timeout");
  });
});

describe("skipAgentInput", () => {
  it("marks an agent input as skipped", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    skipAgentInput(meeting?.id, "content");
    const input = getMeeting(meeting?.id)?.inputs.find(
      (i) => i.agent === "content",
    );
    expect(input?.status).toBe("skipped");
  });
});

describe("completeMeeting", () => {
  it("sets synthesis and completes the meeting", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    // Complete all inputs
    for (const input of meeting?.inputs ?? []) {
      recordAgentInput(meeting?.id, input.agent, "Done");
    }
    expect(getMeeting(meeting?.id)?.status).toBe("synthesizing");

    const completed = completeMeeting(
      meeting?.id,
      "The board recommends proceeding with caution.",
    );
    expect(completed?.status).toBe("completed");
    expect(completed?.synthesis).toBe(
      "The board recommends proceeding with caution.",
    );
    expect(completed?.completedAt).toBeDefined();
  });
});

describe("cancelMeeting", () => {
  it("cancels an active meeting", () => {
    const meeting = createMeeting({ topic: "Test" });
    startMeeting(meeting?.id);

    expect(cancelMeeting(meeting?.id)).toBe(true);
    expect(getMeeting(meeting?.id)?.status).toBe("cancelled");
  });

  it("returns false for unknown meeting", () => {
    expect(cancelMeeting("nonexistent")).toBe(false);
  });
});

describe("isMeetingTimedOut", () => {
  it("returns false for recent meeting", () => {
    const meeting = createMeeting({
      topic: "Test",
      maxDurationMs: 600_000,
    });
    startMeeting(meeting?.id);
    expect(isMeetingTimedOut(meeting?.id)).toBe(false);
  });

  it("returns true for expired meeting", async () => {
    const meeting = createMeeting({
      topic: "Test",
      maxDurationMs: 1, // 1ms — will expire almost immediately
    });
    startMeeting(meeting?.id);
    // Wait for the timeout to pass
    await new Promise((r) => setTimeout(r, 10));
    expect(isMeetingTimedOut(meeting?.id)).toBe(true);
  });

  it("returns false for completed meeting", () => {
    const meeting = createMeeting({ topic: "Test", maxDurationMs: 1 });
    startMeeting(meeting?.id);
    for (const input of meeting?.inputs ?? []) {
      recordAgentInput(meeting?.id, input.agent, "Done");
    }
    completeMeeting(meeting?.id, "Synthesis");
    expect(isMeetingTimedOut(meeting?.id)).toBe(false);
  });
});

describe("getActiveMeetings", () => {
  it("returns only active meetings", () => {
    const _m1 = createMeeting({ topic: "Active 1" });
    const _m2 = createMeeting({ topic: "Active 2" });
    const m3 = createMeeting({ topic: "Will cancel" });
    cancelMeeting(m3?.id);

    expect(getActiveMeetings()).toHaveLength(2);
  });
});

describe("buildSynthesisPrompt", () => {
  it("includes all agent responses", () => {
    const meeting = createMeeting({ topic: "European expansion" });
    startMeeting(meeting?.id);

    recordAgentInput(meeting?.id, "research", "Market data looks promising");
    recordAgentInput(meeting?.id, "finance", "ROI is estimated at 15%");
    failAgentInput(meeting?.id, "content", "Timeout");
    recordAgentInput(meeting?.id, "strategy", "Aligns with 2026 vision");
    recordAgentInput(meeting?.id, "critic", "Currency risk is high");

    const fetched = getMeeting(meeting?.id);
    expect(fetched).toBeDefined();
    const prompt = buildSynthesisPrompt(fetched as NonNullable<typeof fetched>);
    expect(prompt).toContain("European expansion");
    expect(prompt).toContain("Market data looks promising");
    expect(prompt).toContain("ROI is estimated at 15%");
    expect(prompt).toContain("failed");
    expect(prompt).toContain("Aligns with 2026 vision");
    expect(prompt).toContain("Currency risk is high");
    expect(prompt).toContain("synthesize");
  });
});

describe("formatMeetingSummary", () => {
  it("formats completed meeting with synthesis", () => {
    const meeting = createMeeting({ topic: "Test topic" });
    startMeeting(meeting?.id);
    for (const input of meeting?.inputs ?? []) {
      recordAgentInput(meeting?.id, input.agent, "Input");
    }
    completeMeeting(meeting?.id, "The board recommends X.");

    const fetched = getMeeting(meeting?.id);
    expect(fetched).toBeDefined();
    const summary = formatMeetingSummary(
      fetched as NonNullable<typeof fetched>,
    );
    expect(summary).toContain("Board Meeting");
    expect(summary).toContain("Test topic");
    expect(summary).toContain("5/5 specialists responded");
    expect(summary).toContain("The board recommends X.");
  });

  it("handles incomplete meeting", () => {
    const meeting = createMeeting({ topic: "Incomplete" });
    expect(meeting).toBeDefined();
    const summary = formatMeetingSummary(
      meeting as NonNullable<typeof meeting>,
    );
    expect(summary).toContain("pending");
  });
});
