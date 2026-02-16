import { describe, expect, it } from "vitest";

import {
  buildExpectedTopics,
  buildTopicName,
  getTopicIdForAgent,
  resolveAgentFromTopicId,
  topicMappingsToMap,
} from "./telegram-topics.js";
import type { TopicMapping } from "./types.js";

describe("buildTopicName", () => {
  it("combines emoji and name", () => {
    const name = buildTopicName({
      role: "finance",
      name: "Finance Director",
      title: "CFO",
      emoji: "📊",
      personality: "",
    });
    expect(name).toBe("📊 Finance Director");
  });
});

describe("buildExpectedTopics", () => {
  it("returns six topics (one per agent)", () => {
    const topics = buildExpectedTopics();
    expect(topics).toHaveLength(6);
  });

  it("each topic has role, name, and icon color", () => {
    const topics = buildExpectedTopics();
    for (const topic of topics) {
      expect(topic.role).toBeTruthy();
      expect(topic.name).toBeTruthy();
      expect(typeof topic.iconColor).toBe("number");
    }
  });

  it("applies config overrides", () => {
    const topics = buildExpectedTopics([
      { role: "finance", name: "Money Expert", emoji: "💰" },
    ]);
    const finance = topics.find((t) => t.role === "finance");
    expect(finance?.name).toBe("💰 Money Expert");
  });
});

describe("resolveAgentFromTopicId", () => {
  const mappings: TopicMapping[] = [
    { topicId: 100, agentRole: "general", topicName: "General" },
    { topicId: 101, agentRole: "finance", topicName: "Finance" },
    { topicId: 102, agentRole: "research", topicName: "Research" },
  ];

  it("resolves known topic ID", () => {
    expect(resolveAgentFromTopicId(101, mappings)).toBe("finance");
    expect(resolveAgentFromTopicId(102, mappings)).toBe("research");
  });

  it("returns undefined for unknown topic ID", () => {
    expect(resolveAgentFromTopicId(999, mappings)).toBeUndefined();
  });
});

describe("getTopicIdForAgent", () => {
  const mappings: TopicMapping[] = [
    { topicId: 100, agentRole: "general", topicName: "General" },
    { topicId: 101, agentRole: "finance", topicName: "Finance" },
  ];

  it("returns topic ID for known agent", () => {
    expect(getTopicIdForAgent("finance", mappings)).toBe(101);
  });

  it("returns undefined for unknown agent", () => {
    expect(getTopicIdForAgent("critic", mappings)).toBeUndefined();
  });
});

describe("topicMappingsToMap", () => {
  it("converts array to Map", () => {
    const mappings: TopicMapping[] = [
      { topicId: 100, agentRole: "general", topicName: "General" },
      { topicId: 101, agentRole: "finance", topicName: "Finance" },
    ];
    const map = topicMappingsToMap(mappings);
    expect(map.size).toBe(2);
    expect(map.get(100)).toBe("general");
    expect(map.get(101)).toBe("finance");
  });
});
