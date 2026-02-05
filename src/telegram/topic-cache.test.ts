import { describe, expect, it } from "vitest";
import { buildTelegramTopicLabel, normalizeTelegramTopicLabelToken } from "./topic-cache.js";

describe("normalizeTelegramTopicLabelToken", () => {
  it("normalizes topic names into label tokens", () => {
    expect(normalizeTelegramTopicLabelToken(" Release Squad ")).toBe("release-squad");
  });

  it("strips leading topic hashes", () => {
    expect(normalizeTelegramTopicLabelToken("#General")).toBe("general");
  });
});

describe("buildTelegramTopicLabel", () => {
  it("builds telegram labels from topic names", () => {
    expect(buildTelegramTopicLabel({ topicId: 42, topicName: "Release Squad" })).toBe(
      "telegram:release-squad",
    );
  });

  it("falls back to topic id when name is missing", () => {
    expect(buildTelegramTopicLabel({ topicId: 42 })).toBe("telegram:42");
  });

  it("prefixes the agent id in multi-agent configs", () => {
    expect(
      buildTelegramTopicLabel({
        topicId: 7,
        topicName: "Ops",
        agentId: "codex",
        multiAgent: true,
      }),
    ).toBe("codex:telegram:ops");
  });
});
