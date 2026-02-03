import { describe, expect, it, vi } from "vitest";
import { discoverTeammates } from "./teammates.js";
import { buildIdentityContext } from "./identity-context.js";
import { buildMentionContext } from "./mention-context.js";

describe("co-working integration", () => {
  it("builds complete identity context with teammates", async () => {
    const mockClient = {
      users: {
        list: vi.fn().mockResolvedValue({
          ok: true,
          members: [
            {
              id: "U002",
              name: "data-bot",
              is_bot: true,
              deleted: false,
              profile: { display_name: "Data Bot" },
            },
            {
              id: "U003",
              name: "devops-bot",
              is_bot: true,
              deleted: false,
              profile: { display_name: "DevOps Bot" },
            },
          ],
        }),
      },
    };

    const teammates = await discoverTeammates({
      client: mockClient as any,
      token: "test-token",
      selfUserId: "U001",
    });

    const identityContext = buildIdentityContext({
      botUserId: "U001",
      botName: "claude-bot",
      displayName: "Claude Bot",
      teammates,
    });

    expect(identityContext).toContain("Claude Bot");
    expect(identityContext).toContain("U001");
    expect(identityContext).toContain("data-bot");
    expect(identityContext).toContain("devops-bot");
  });

  it("detects mentions correctly with teammates", async () => {
    const teammates = [
      { userId: "U002", name: "data-bot", displayName: "Data Bot", isBot: true, deleted: false },
    ];

    // Self mentioned
    const selfMention = buildMentionContext({
      messageText: "Hey <@U001> can you help?",
      selfUserId: "U001",
      teammates,
    });
    expect(selfMention.wasMentioned).toBe(true);
    expect(selfMention.mentionType).toBe("direct");

    // Teammate mentioned
    const teammateMention = buildMentionContext({
      messageText: "Hey <@U002> can you help?",
      selfUserId: "U001",
      teammates,
    });
    expect(teammateMention.wasMentioned).toBe(false);
    expect(teammateMention.otherBotsMentioned).toHaveLength(1);
    expect(teammateMention.otherBotsMentioned[0].name).toBe("data-bot");
  });

  it("handles multiple mentions in a single message", () => {
    const teammates = [
      { userId: "U002", name: "data-bot", displayName: "Data Bot", isBot: true, deleted: false },
      {
        userId: "U003",
        name: "devops-bot",
        displayName: "DevOps Bot",
        isBot: true,
        deleted: false,
      },
    ];

    const result = buildMentionContext({
      messageText: "Hey <@U001> and <@U002> and <@U003>, what do you think?",
      selfUserId: "U001",
      teammates,
    });

    expect(result.wasMentioned).toBe(true);
    expect(result.mentionType).toBe("direct");
    expect(result.otherBotsMentioned).toHaveLength(2);
  });

  it("deduplicates multiple mentions of the same teammate", () => {
    const teammates = [
      { userId: "U002", name: "data-bot", displayName: "Data Bot", isBot: true, deleted: false },
    ];

    const result = buildMentionContext({
      messageText: "Hey <@U002> <@U002> <@U002>!",
      selfUserId: "U001",
      teammates,
    });

    expect(result.otherBotsMentioned).toHaveLength(1);
  });
});
