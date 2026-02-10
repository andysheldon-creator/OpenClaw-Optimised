import { describe, it, expect, beforeEach } from "vitest";
import {
  detectDivergence,
  createApprovalEvent,
  recordDecision,
  type ApprovalEvent,
} from "../approval-interlay.js";

describe("approval-interlay", () => {
  let mockEvent: ApprovalEvent;

  beforeEach(() => {
    mockEvent = {
      timestamp: new Date().toISOString(),
      sessionKey: "test:session:123",
      userId: "U0ABVDL7C9M",
      originalTier: "haiku",
      proposedTier: "sonnet",
      reason: "Medium complexity task",
      confidence: 0.8,
      estimatedTokens: 15_000,
      slackDmSent: false,
      sessionPauseSent: false,
      decision: "pending",
    };
  });

  describe("detectDivergence", () => {
    it("returns false if session model override exists", () => {
      const result = detectDivergence({
        sessionModelOverride: "anthropic/claude-opus-4-6",
        messageHistoryDepth: 5,
      });
      expect(result).toBe(false);
    });

    it("returns false if no routing decision", () => {
      const result = detectDivergence({
        messageHistoryDepth: 5,
      });
      expect(result).toBe(false);
    });

    it("returns true if routing picks Sonnet", () => {
      const result = detectDivergence({
        routingDecision: {
          tier: "sonnet",
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250514",
          reason: "Medium complexity",
          confidence: 0.8,
        },
        messageHistoryDepth: 5,
      });
      expect(result).toBe(true);
    });

    it("returns true if routing picks Opus", () => {
      const result = detectDivergence({
        routingDecision: {
          tier: "opus",
          provider: "anthropic",
          model: "claude-opus-4-6",
          reason: "Complex task",
          confidence: 0.85,
        },
        messageHistoryDepth: 5,
      });
      expect(result).toBe(true);
    });

    it("returns false if routing picks Haiku (no divergence)", () => {
      const result = detectDivergence({
        routingDecision: {
          tier: "haiku",
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          reason: "Simple task",
          confidence: 0.9,
        },
        messageHistoryDepth: 5,
      });
      expect(result).toBe(false);
    });
  });

  describe("createApprovalEvent", () => {
    it("creates event with correct fields", () => {
      const routingDecision = {
        tier: "opus" as const,
        provider: "anthropic",
        model: "claude-opus-4-6",
        reason: "Complex analysis required",
        confidence: 0.85,
      };

      const event = createApprovalEvent({
        sessionKey: "test:session:456",
        userId: "user:123",
        routingDecision,
      });

      expect(event.sessionKey).toBe("test:session:456");
      expect(event.userId).toBe("user:123");
      expect(event.originalTier).toBe("haiku");
      expect(event.proposedTier).toBe("opus");
      expect(event.reason).toBe("Complex analysis required");
      expect(event.confidence).toBe(0.85);
      expect(event.decision).toBe("pending");
    });
  });

  describe("recordDecision", () => {
    it("records user approval decision", () => {
      recordDecision(mockEvent, "approve", "user", 2500);

      expect(mockEvent.decision).toBe("approve");
      expect(mockEvent.decidedBy).toBe("user");
      expect(mockEvent.approvalTimeMs).toBe(2500);
      expect(mockEvent.decidedAt).toBeDefined();
    });

    it("records timeout decision", () => {
      recordDecision(mockEvent, "timeout", "timeout", 60_000);

      expect(mockEvent.decision).toBe("timeout");
      expect(mockEvent.decidedBy).toBe("timeout");
      expect(mockEvent.approvalTimeMs).toBe(60_000);
    });

    it("records reject decision", () => {
      recordDecision(mockEvent, "reject", "user", 1500);

      expect(mockEvent.decision).toBe("reject");
      expect(mockEvent.decidedBy).toBe("user");
      expect(mockEvent.approvalTimeMs).toBe(1500);
    });
  });
});
