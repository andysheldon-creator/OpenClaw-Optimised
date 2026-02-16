import { describe, expect, it } from "vitest";

import {
  buildTopicMap,
  extractConsultTags,
  extractMeetingTag,
  routeMessage,
  stripConsultTags,
  stripMeetingTag,
} from "./router.js";
import type { BoardAgentRole } from "./types.js";

// ── routeMessage ─────────────────────────────────────────────────────────────

describe("routeMessage", () => {
  it("defaults to general when no routing signal", () => {
    const result = routeMessage({ body: "Hello, how are you?" });
    expect(result.agentRole).toBe("general");
    expect(result.reason).toBe("default");
    expect(result.cleanedBody).toBe("Hello, how are you?");
  });

  it("routes by Telegram topic ID", () => {
    const topicMap = new Map<number, BoardAgentRole>([
      [101, "finance"],
      [102, "research"],
    ]);
    const result = routeMessage({
      body: "What's our runway?",
      telegramTopicId: 101,
      topicMap,
    });
    expect(result.agentRole).toBe("finance");
    expect(result.reason).toBe("topic");
  });

  it("falls through when topic ID not in map", () => {
    const topicMap = new Map<number, BoardAgentRole>([[101, "finance"]]);
    const result = routeMessage({
      body: "Hello",
      telegramTopicId: 999,
      topicMap,
    });
    expect(result.agentRole).toBe("general");
    expect(result.reason).toBe("default");
  });

  it("routes by /agent:<role> directive", () => {
    const result = routeMessage({ body: "/agent:finance What's our budget?" });
    expect(result.agentRole).toBe("finance");
    expect(result.reason).toBe("directive");
    expect(result.cleanedBody).toBe("What's our budget?");
  });

  it("routes by /agent: directive with space", () => {
    const result = routeMessage({
      body: "/agent: research Analyze the market",
    });
    expect(result.agentRole).toBe("research");
    expect(result.reason).toBe("directive");
  });

  it("routes by @mention", () => {
    const result = routeMessage({
      body: "@critic What could go wrong with this plan?",
    });
    expect(result.agentRole).toBe("critic");
    expect(result.reason).toBe("mention");
    expect(result.cleanedBody).toBe("What could go wrong with this plan?");
  });

  it("routes by @mention mid-sentence", () => {
    const result = routeMessage({
      body: "Hey @strategy what do you think about expansion?",
    });
    expect(result.agentRole).toBe("strategy");
    expect(result.reason).toBe("mention");
  });

  it("prioritizes topic over directive", () => {
    const topicMap = new Map<number, BoardAgentRole>([[50, "research"]]);
    const result = routeMessage({
      body: "/agent:finance Check the numbers",
      telegramTopicId: 50,
      topicMap,
    });
    expect(result.agentRole).toBe("research"); // Topic wins
    expect(result.reason).toBe("topic");
  });

  it("prioritizes directive over mention", () => {
    const result = routeMessage({
      body: "/agent:finance @research Give me data",
    });
    expect(result.agentRole).toBe("finance"); // Directive wins
    expect(result.reason).toBe("directive");
  });

  it("routes by keywords when signal is strong", () => {
    const result = routeMessage({
      body: "What's the financial cost and ROI and budget impact of this pricing change?",
    });
    expect(result.agentRole).toBe("finance");
    expect(result.reason).toBe("keyword");
  });

  it("does not route by keywords when signal is weak", () => {
    // Single weak keyword shouldn't trigger
    const result = routeMessage({ body: "What's the cost?" });
    expect(result.agentRole).toBe("general");
    expect(result.reason).toBe("default");
  });

  it("does not route by keywords when ambiguous", () => {
    // Mix of finance and strategy keywords
    const result = routeMessage({
      body: "What's the strategic financial impact?",
    });
    expect(result.agentRole).toBe("general"); // Ambiguous → default
    expect(result.reason).toBe("default");
  });
});

// ── extractConsultTags ───────────────────────────────────────────────────────

describe("extractConsultTags", () => {
  it("extracts single consultation tag", () => {
    const tags = extractConsultTags(
      "I think we should also check with [[consult:finance]] What would this cost over 6 months?",
    );
    expect(tags).toHaveLength(1);
    expect(tags[0].toAgent).toBe("finance");
    expect(tags[0].question).toBe("What would this cost over 6 months?");
  });

  it("extracts multiple consultation tags", () => {
    const text = `Let me get some input.
[[consult:research]] What does the data say about this market?
[[consult:critic]] What are the main risks here?`;
    const tags = extractConsultTags(text);
    expect(tags).toHaveLength(2);
    expect(tags[0].toAgent).toBe("research");
    expect(tags[1].toAgent).toBe("critic");
  });

  it("returns empty array when no tags", () => {
    const tags = extractConsultTags("Just a normal response.");
    expect(tags).toHaveLength(0);
  });

  it("handles case-insensitive role names", () => {
    const tags = extractConsultTags("[[consult:Finance]] What's the budget?");
    expect(tags).toHaveLength(1);
    expect(tags[0].toAgent).toBe("finance");
  });
});

describe("stripConsultTags", () => {
  it("removes consultation tags on their own line", () => {
    const result = stripConsultTags(
      "Here's my analysis.\n[[consult:finance]] What's the cost?\nThe end.",
    );
    expect(result).toBe("Here's my analysis. The end.");
  });

  it("removes inline consultation tag and remainder of line", () => {
    const result = stripConsultTags(
      "Here's my analysis. [[consult:finance]] What's the cost?",
    );
    expect(result).toBe("Here's my analysis.");
  });

  it("returns unchanged text when no tags", () => {
    expect(stripConsultTags("No tags here.")).toBe("No tags here.");
  });
});

// ── extractMeetingTag ────────────────────────────────────────────────────────

describe("extractMeetingTag", () => {
  it("extracts meeting trigger tag", () => {
    const result = extractMeetingTag(
      "Let's discuss this formally.\n[[board_meeting]] Should we expand into the European market?",
    );
    expect(result).toBeDefined();
    expect(result?.topic).toBe("Should we expand into the European market?");
  });

  it("returns undefined when no meeting tag", () => {
    const result = extractMeetingTag("Just a regular message.");
    expect(result).toBeUndefined();
  });
});

describe("stripMeetingTag", () => {
  it("removes meeting tag", () => {
    const result = stripMeetingTag(
      "Let me get the board's input.\n[[board_meeting]] European expansion",
    );
    expect(result).toBe("Let me get the board's input.");
  });
});

// ── buildTopicMap ────────────────────────────────────────────────────────────

describe("buildTopicMap", () => {
  it("builds map from agent config", () => {
    const map = buildTopicMap([
      { role: "finance", telegramTopicId: 101 },
      { role: "research", telegramTopicId: 102 },
    ]);
    expect(map.get(101)).toBe("finance");
    expect(map.get(102)).toBe("research");
    expect(map.size).toBe(2);
  });

  it("skips agents without topic IDs", () => {
    const map = buildTopicMap([
      { role: "finance", telegramTopicId: 101 },
      { role: "research" },
    ]);
    expect(map.size).toBe(1);
  });

  it("returns empty map for undefined input", () => {
    const map = buildTopicMap(undefined);
    expect(map.size).toBe(0);
  });

  it("skips invalid roles", () => {
    const map = buildTopicMap([{ role: "invalid", telegramTopicId: 100 }]);
    expect(map.size).toBe(0);
  });
});
