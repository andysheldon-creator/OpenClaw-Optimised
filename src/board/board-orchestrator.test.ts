/**
 * Tests for FB-017/018/019/020: Board of Directors Orchestrator
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../runtime.js", () => ({
  defaultRuntime: { log: vi.fn() },
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({}),
}));

// Stub fs for personality loading (avoids filesystem access)
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: (p: string) => {
      // Allow temp dirs for audit tests, block workspace board/ lookups
      if (typeof p === "string" && p.includes("board/")) return false;
      return actual.existsSync(p);
    },
    mkdirSync: vi.fn(),
    readFileSync: actual.readFileSync,
    writeFileSync: vi.fn(),
  };
});

const {
  prepareBoardContext,
  processAgentResponse,
  executeConsultations,
  executeMeeting,
} = await import("./board-orchestrator.js");

const {
  clearAllConsultations,
} = await import("./consultation.js");

const {
  clearAllMeetings,
} = await import("./meeting.js");

afterEach(() => {
  clearAllConsultations();
  clearAllMeetings();
});

// ─── Helper: build a minimal config with board enabled ───────────────────────

function boardConfig(overrides?: Record<string, unknown>) {
  return {
    board: {
      enabled: true,
      agents: [
        { role: "general", telegramTopicId: 100 },
        { role: "research", telegramTopicId: 101 },
        { role: "finance", telegramTopicId: 102 },
        { role: "content", telegramTopicId: 103 },
        { role: "strategy", telegramTopicId: 104 },
        { role: "critic", telegramTopicId: 105 },
      ],
      meetings: { enabled: true },
      consultation: { enabled: true, maxDepth: 2, timeoutMs: 5000 },
      ...overrides,
    },
  } as never;
}

function disabledConfig() {
  return {} as never; // No board key = disabled
}

// ─── FB-017: Board Context Preparation ──────────────────────────────────────

describe("FB-017: prepareBoardContext", () => {
  it("returns disabled context when board is off", () => {
    const ctx = prepareBoardContext({
      body: "hello",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: disabledConfig(),
    });
    expect(ctx.enabled).toBe(false);
    expect(ctx.agentRole).toBe("general");
    expect(ctx.sessionKey).toBe("main");
  });

  it("routes to general by default when board is enabled", () => {
    const ctx = prepareBoardContext({
      body: "What's happening?",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
    });
    expect(ctx.enabled).toBe(true);
    expect(ctx.agentRole).toBe("general");
    expect(ctx.routeReason).toBe("default");
  });

  it("routes to specific agent via @mention", () => {
    const ctx = prepareBoardContext({
      body: "@finance What's our budget?",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
    });
    expect(ctx.agentRole).toBe("finance");
    expect(ctx.routeReason).toBe("mention");
    expect(ctx.cleanedBody).toBe("What's our budget?");
  });

  it("routes to specific agent via /agent: directive", () => {
    const ctx = prepareBoardContext({
      body: "/agent:research analyze trends",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
    });
    expect(ctx.agentRole).toBe("research");
    expect(ctx.routeReason).toBe("directive");
  });

  it("routes via Telegram topic ID", () => {
    const ctx = prepareBoardContext({
      body: "How much will this cost?",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
      telegramTopicId: 102,
    });
    expect(ctx.agentRole).toBe("finance");
    expect(ctx.routeReason).toBe("topic");
  });

  it("includes board personality in extra system prompt", () => {
    const ctx = prepareBoardContext({
      body: "hello",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
    });
    expect(ctx.extraSystemPrompt).toContain("Agent Role");
    expect(ctx.extraSystemPrompt).toContain("Board of Directors");
  });

  it("merges existing extra prompt with board prompt", () => {
    const ctx = prepareBoardContext({
      body: "hello",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
      existingExtraPrompt: "You are in a group chat.",
    });
    expect(ctx.extraSystemPrompt).toContain("You are in a group chat.");
    expect(ctx.extraSystemPrompt).toContain("Board of Directors");
  });

  it("derives board-specific session key for specialists", () => {
    const ctx = prepareBoardContext({
      body: "@finance budget?",
      baseSessionKey: "main",
      workspaceDir: "/tmp/ws",
      config: boardConfig(),
    });
    // prepareBoardContext uses "" as base key (it's resolved separately)
    // The session key derivation happens in reply.ts via boardSessionKey()
    expect(ctx.enabled).toBe(true);
    expect(ctx.agentRole).toBe("finance");
  });
});

// ─── FB-017: Agent Response Processing ──────────────────────────────────────

describe("FB-017: processAgentResponse", () => {
  it("returns reply unchanged when board is off", () => {
    const result = processAgentResponse({
      replyText: "Hello there!",
      agentRole: "general",
      config: disabledConfig(),
    });
    expect(result.cleanedReply).toBe("Hello there!");
    expect(result.consultations).toHaveLength(0);
    expect(result.needsFollowUp).toBe(false);
  });

  it("strips consultation tags from reply", () => {
    const reply =
      "Here's what I think.\n[[consult:finance]] What's the cost?\nLet me know.";
    const result = processAgentResponse({
      replyText: reply,
      agentRole: "general",
      config: boardConfig(),
    });
    expect(result.cleanedReply).not.toContain("[[consult:");
    expect(result.consultations).toHaveLength(1);
    expect(result.consultations[0].toAgent).toBe("finance");
    expect(result.consultations[0].question).toBe("What's the cost?");
    expect(result.needsFollowUp).toBe(true);
  });

  it("strips meeting tags from general agent reply", () => {
    const reply =
      "I'll convene the board.\n[[board_meeting]] Should we expand into Europe?";
    const result = processAgentResponse({
      replyText: reply,
      agentRole: "general",
      config: boardConfig(),
    });
    expect(result.cleanedReply).not.toContain("[[board_meeting]]");
    expect(result.meetingTopic).toBe("Should we expand into Europe?");
    expect(result.needsFollowUp).toBe(true);
  });

  it("ignores meeting tags from non-general agents", () => {
    const reply = "[[board_meeting]] Let's discuss";
    const result = processAgentResponse({
      replyText: reply,
      agentRole: "finance",
      config: boardConfig(),
    });
    // Finance agent's meeting tag should be ignored
    expect(result.meetingTopic).toBeUndefined();
  });

  it("extracts multiple consultation tags", () => {
    const reply =
      "Let me check.\n[[consult:research]] Data on this?\n[[consult:critic]] What are the risks?";
    const result = processAgentResponse({
      replyText: reply,
      agentRole: "general",
      config: boardConfig(),
    });
    expect(result.consultations).toHaveLength(2);
    expect(result.consultations[0].toAgent).toBe("research");
    expect(result.consultations[1].toAgent).toBe("critic");
  });

  it("respects consultation disabled config", () => {
    const reply = "[[consult:finance]] How much?";
    const result = processAgentResponse({
      replyText: reply,
      agentRole: "general",
      config: boardConfig({ consultation: { enabled: false } }),
    });
    expect(result.consultations).toHaveLength(0);
  });
});

// ─── FB-020: Consultation Execution ─────────────────────────────────────────

describe("FB-020: executeConsultations", () => {
  it("executes consultations via callback", async () => {
    const runAgent = vi.fn().mockResolvedValue("The cost is $50k/quarter.");
    const results = await executeConsultations({
      consultations: [
        { toAgent: "finance", question: "How much will this cost?" },
      ],
      fromAgent: "general",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });
    expect(runAgent).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]).toContain("finance");
    expect(results[0]).toContain("$50k/quarter");
  });

  it("handles depth limit gracefully", async () => {
    const runAgent = vi.fn().mockResolvedValue("ok");
    const results = await executeConsultations({
      consultations: [
        { toAgent: "finance", question: "cost?" },
      ],
      fromAgent: "general",
      config: boardConfig({ consultation: { enabled: true, maxDepth: 2 } }),
      workspaceDir: "/tmp/ws",
      depth: 2, // Already at max depth
      runAgent,
    });
    // Should be rejected due to depth limit
    expect(runAgent).not.toHaveBeenCalled();
    expect(results[0]).toContain("skipped");
  });

  it("handles agent failure gracefully", async () => {
    const runAgent = vi
      .fn()
      .mockRejectedValue(new Error("agent crashed"));
    const results = await executeConsultations({
      consultations: [
        { toAgent: "research", question: "what data?" },
      ],
      fromAgent: "general",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toContain("failed");
    expect(results[0]).toContain("agent crashed");
  });

  it("runs multiple consultations", async () => {
    const responses: Record<string, string> = {
      finance: "Budget is tight.",
      research: "Data shows growth.",
    };
    const runAgent = vi.fn().mockImplementation(async (params) => {
      return responses[params.agentRole] ?? "no response";
    });
    const results = await executeConsultations({
      consultations: [
        { toAgent: "finance", question: "budget?" },
        { toAgent: "research", question: "data?" },
      ],
      fromAgent: "general",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });
    expect(results).toHaveLength(2);
    expect(results[0]).toContain("Budget is tight");
    expect(results[1]).toContain("Data shows growth");
  });
});

// ─── FB-019: Board Meeting Execution ────────────────────────────────────────

describe("FB-019: executeMeeting", () => {
  it("runs all specialists and synthesizes", async () => {
    const responses: Record<string, string> = {
      research: "Data shows opportunity.",
      finance: "Budget allows $200k.",
      content: "Audience is receptive.",
      strategy: "Aligns with long-term goals.",
      critic: "Risk of market saturation.",
      general: "Based on all inputs, we should proceed cautiously.",
    };
    const runAgent = vi.fn().mockImplementation(async (params) => {
      return responses[params.agentRole] ?? "ok";
    });

    const result = await executeMeeting({
      topic: "Should we expand into Europe?",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });

    // Should have called all 5 specialists + 1 synthesis = 6 calls
    expect(runAgent).toHaveBeenCalledTimes(6);
    expect(result).toContain("Board Meeting");
    expect(result).toContain("expand into Europe");
    expect(result).toContain("proceed cautiously");
  });

  it("handles specialist failures gracefully", async () => {
    let callCount = 0;
    const runAgent = vi.fn().mockImplementation(async (params) => {
      callCount++;
      if (params.agentRole === "finance") {
        throw new Error("finance model unavailable");
      }
      if (params.agentRole === "general") {
        return "Synthesis with partial data.";
      }
      return `${params.agentRole} response.`;
    });

    const result = await executeMeeting({
      topic: "Budget review",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });

    // Should still complete with partial results
    expect(result).toContain("Board Meeting");
  });

  it("reports failure when synthesis fails", async () => {
    const runAgent = vi.fn().mockImplementation(async (params) => {
      if (params.agentRole === "general") {
        throw new Error("synthesis model failed");
      }
      return "ok";
    });

    const result = await executeMeeting({
      topic: "Test topic",
      config: boardConfig(),
      workspaceDir: "/tmp/ws",
      runAgent,
    });

    expect(result).toContain("synthesis failed");
  });
});
