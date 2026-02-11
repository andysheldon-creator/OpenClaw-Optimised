import { describe, expect, it } from "vitest";
import { resolveDiscordTargetChatType } from "./inline-buttons.js";

describe("resolveDiscordTargetChatType", () => {
  it("returns 'direct' for user: prefix", () => {
    expect(resolveDiscordTargetChatType("user:123456789")).toBe("direct");
    expect(resolveDiscordTargetChatType("user:883482321158815827")).toBe("direct");
  });

  it("returns 'group' for channel: prefix", () => {
    expect(resolveDiscordTargetChatType("channel:123456789")).toBe("group");
    expect(resolveDiscordTargetChatType("channel:1468503588526620746")).toBe("group");
  });

  it("returns 'direct' for user mentions", () => {
    expect(resolveDiscordTargetChatType("<@123456789>")).toBe("direct");
    expect(resolveDiscordTargetChatType("<@!123456789>")).toBe("direct");
  });

  it("returns 'unknown' for bare numeric IDs", () => {
    // Bare IDs are ambiguous - could be user or channel
    expect(resolveDiscordTargetChatType("123456789")).toBe("unknown");
    expect(resolveDiscordTargetChatType("1468503588526620746")).toBe("unknown");
  });

  it("returns 'unknown' for empty strings", () => {
    expect(resolveDiscordTargetChatType("")).toBe("unknown");
    expect(resolveDiscordTargetChatType("   ")).toBe("unknown");
  });

  it("handles case insensitive prefixes", () => {
    expect(resolveDiscordTargetChatType("USER:123456789")).toBe("direct");
    expect(resolveDiscordTargetChatType("CHANNEL:123456789")).toBe("group");
    expect(resolveDiscordTargetChatType("User:123456789")).toBe("direct");
    expect(resolveDiscordTargetChatType("Channel:123456789")).toBe("group");
  });
});
