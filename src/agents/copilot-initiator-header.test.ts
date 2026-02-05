import { describe, expect, it } from "vitest";
import { CopilotInitiatorTracker } from "./copilot-initiator-header.js";

describe("CopilotInitiatorTracker", () => {
  it("should return 'user' on first call for a session", () => {
    const tracker = new CopilotInitiatorTracker();
    const result = tracker.getInitiator("session-123");
    expect(result).toBe("user");
  });

  it("should return 'agent' on subsequent calls for the same session", () => {
    const tracker = new CopilotInitiatorTracker();
    tracker.getInitiator("session-123"); // First call
    const result = tracker.getInitiator("session-123"); // Second call
    expect(result).toBe("agent");
  });

  it("should track multiple sessions independently", () => {
    const tracker = new CopilotInitiatorTracker();
    const session1 = "session-abc";
    const session2 = "session-xyz";

    // First call for each session should return 'user'
    expect(tracker.getInitiator(session1)).toBe("user");
    expect(tracker.getInitiator(session2)).toBe("user");

    // Subsequent calls for each should return 'agent'
    expect(tracker.getInitiator(session1)).toBe("agent");
    expect(tracker.getInitiator(session2)).toBe("agent");
  });

  it("should reset session tracking", () => {
    const tracker = new CopilotInitiatorTracker();
    const sessionId = "session-reset";

    // First call returns 'user'
    expect(tracker.getInitiator(sessionId)).toBe("user");
    // Subsequent calls return 'agent'
    expect(tracker.getInitiator(sessionId)).toBe("agent");

    // Reset the session
    tracker.reset(sessionId);

    // After reset, first call should return 'user' again
    expect(tracker.getInitiator(sessionId)).toBe("user");
  });
});
