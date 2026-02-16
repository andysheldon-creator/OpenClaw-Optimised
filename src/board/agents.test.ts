import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOARD_AGENTS,
  getDefaultPersonality,
  resolveAgentDef,
  resolveAllAgentDefs,
} from "./agents.js";
import type { BoardAgentRole } from "./types.js";

describe("DEFAULT_BOARD_AGENTS", () => {
  it("has six agents", () => {
    expect(DEFAULT_BOARD_AGENTS).toHaveLength(6);
  });

  it("each agent has required fields", () => {
    for (const agent of DEFAULT_BOARD_AGENTS) {
      expect(agent.role).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.title).toBeTruthy();
      expect(agent.emoji).toBeTruthy();
      expect(agent.personality).toBeTruthy();
      expect(agent.personality.length).toBeGreaterThan(50);
    }
  });

  it("has unique roles", () => {
    const roles = DEFAULT_BOARD_AGENTS.map((a) => a.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("has unique emojis", () => {
    const emojis = DEFAULT_BOARD_AGENTS.map((a) => a.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });
});

describe("resolveAgentDef", () => {
  it("returns default definition when no config overrides", () => {
    const agent = resolveAgentDef("finance");
    expect(agent.role).toBe("finance");
    expect(agent.name).toBe("Finance Director");
    expect(agent.title).toBe("CFO");
    expect(agent.emoji).toBe("📊");
  });

  it("merges config overrides with defaults", () => {
    const agent = resolveAgentDef("finance", [
      { role: "finance", name: "Money Man", emoji: "💰" },
    ]);
    expect(agent.name).toBe("Money Man");
    expect(agent.emoji).toBe("💰");
    expect(agent.title).toBe("CFO"); // Unchanged
    expect(agent.personality).toBeTruthy(); // Preserved from default
  });

  it("applies model and thinking overrides", () => {
    const agent = resolveAgentDef("research", [
      {
        role: "research",
        model: "anthropic/claude-opus-4-5",
        thinkingDefault: "high",
      },
    ]);
    expect(agent.model).toBe("anthropic/claude-opus-4-5");
    expect(agent.thinkingDefault).toBe("high");
  });

  it("applies telegramTopicId from config", () => {
    const agent = resolveAgentDef("critic", [
      { role: "critic", telegramTopicId: 42 },
    ]);
    expect(agent.telegramTopicId).toBe(42);
  });

  it("throws for unknown role", () => {
    expect(() => resolveAgentDef("unknown" as BoardAgentRole)).toThrow(
      "Unknown board agent role",
    );
  });

  it("ignores overrides for other roles", () => {
    const agent = resolveAgentDef("strategy", [
      { role: "finance", name: "Override" },
    ]);
    expect(agent.name).toBe("Strategy Director"); // Not overridden
  });
});

describe("resolveAllAgentDefs", () => {
  it("returns all six agents", () => {
    const agents = resolveAllAgentDefs();
    expect(agents).toHaveLength(6);
  });

  it("applies config overrides to specific agents", () => {
    const agents = resolveAllAgentDefs([
      { role: "content", name: "Storyteller" },
    ]);
    const content = agents.find((a) => a.role === "content");
    const finance = agents.find((a) => a.role === "finance");
    expect(content?.name).toBe("Storyteller");
    expect(finance?.name).toBe("Finance Director"); // Untouched
  });
});

describe("getDefaultPersonality", () => {
  it("returns personality text for valid roles", () => {
    const text = getDefaultPersonality("general");
    expect(text).toContain("General");
    expect(text).toContain("orchestrator");
  });

  it("returns empty string for unknown role", () => {
    const text = getDefaultPersonality("unknown" as BoardAgentRole);
    expect(text).toBe("");
  });
});
