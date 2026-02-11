import { describe, expect, it } from "vitest";
import type { WebInboundMsg } from "./types.js";
import { isBotMentionedFromTargets, resolveMentionTargets } from "./mentions.js";

const makeMsg = (overrides: Partial<WebInboundMsg>): WebInboundMsg =>
  ({
    id: "m1",
    from: "120363401234567890@g.us",
    conversationId: "120363401234567890@g.us",
    to: "15551234567@s.whatsapp.net",
    accountId: "default",
    body: "",
    chatType: "group",
    chatId: "120363401234567890@g.us",
    sendComposing: async () => {},
    reply: async () => {},
    sendMedia: async () => {},
    ...overrides,
  }) as WebInboundMsg;

describe("isBotMentionedFromTargets", () => {
  const mentionCfg = { mentionRegexes: [/\bopenclaw\b/i] };

  it("ignores regex matches when other mentions are present", () => {
    const msg = makeMsg({
      body: "@OpenClaw please help",
      mentionedJids: ["19998887777@s.whatsapp.net"],
      selfE164: "+15551234567",
      selfJid: "15551234567@s.whatsapp.net",
    });
    const targets = resolveMentionTargets(msg);
    expect(isBotMentionedFromTargets(msg, mentionCfg, targets)).toBe(false);
  });

  it("matches explicit self mentions", () => {
    const msg = makeMsg({
      body: "hey",
      mentionedJids: ["15551234567@s.whatsapp.net"],
      selfE164: "+15551234567",
      selfJid: "15551234567@s.whatsapp.net",
    });
    const targets = resolveMentionTargets(msg);
    expect(isBotMentionedFromTargets(msg, mentionCfg, targets)).toBe(true);
  });

  it("falls back to regex when no mentions are present", () => {
    const msg = makeMsg({
      body: "openclaw can you help?",
      selfE164: "+15551234567",
      selfJid: "15551234567@s.whatsapp.net",
    });
    const targets = resolveMentionTargets(msg);
    expect(isBotMentionedFromTargets(msg, mentionCfg, targets)).toBe(true);
  });

  describe("self-chat mode", () => {
    const selfChatMentionCfg = {
      mentionRegexes: [/\bopenclaw\b/i],
      allowFrom: ["+15551234567"],
    };

    it("blocks owner's messages with auto-included JID (prevents false positives)", () => {
      const msg = makeMsg({
        body: "Hello everyone",
        mentionedJids: ["15551234567@s.whatsapp.net"],
        selfE164: "+15551234567",
        selfJid: "15551234567@s.whatsapp.net",
        senderE164: "+15551234567",
      });
      const targets = resolveMentionTargets(msg);
      expect(isBotMentionedFromTargets(msg, selfChatMentionCfg, targets)).toBe(false);
    });

    it("triggers when non-owner @mentions the bot", () => {
      const msg = makeMsg({
        body: "@bot please help",
        mentionedJids: ["15551234567@s.whatsapp.net"],
        selfE164: "+15551234567",
        selfJid: "15551234567@s.whatsapp.net",
        senderE164: "+19998887777",
      });
      const targets = resolveMentionTargets(msg);
      expect(isBotMentionedFromTargets(msg, selfChatMentionCfg, targets)).toBe(true);
    });

    it("blocks text patterns when JID mentions present (no fallback in self-chat)", () => {
      const msg = makeMsg({
        body: "openclaw help",
        mentionedJids: ["19998887777@s.whatsapp.net"],
        selfE164: "+15551234567",
        selfJid: "15551234567@s.whatsapp.net",
        senderE164: "+19998887777",
      });
      const targets = resolveMentionTargets(msg);
      expect(isBotMentionedFromTargets(msg, selfChatMentionCfg, targets)).toBe(false);
    });

    it("blocks owner's messages when senderE164 is missing but senderJid matches (fallback)", () => {
      const msg = makeMsg({
        body: "Hello team",
        mentionedJids: ["15551234567@s.whatsapp.net"],
        selfE164: "+15551234567",
        selfJid: "15551234567@s.whatsapp.net",
        senderJid: "15551234567@s.whatsapp.net",
        // senderE164 is intentionally undefined (edge case)
      });
      const targets = resolveMentionTargets(msg);
      expect(isBotMentionedFromTargets(msg, selfChatMentionCfg, targets)).toBe(false);
    });

    it("triggers when non-owner mentions bot and senderE164 is missing (uses senderJid)", () => {
      const msg = makeMsg({
        body: "@bot help",
        mentionedJids: ["15551234567@s.whatsapp.net"],
        selfE164: "+15551234567",
        selfJid: "15551234567@s.whatsapp.net",
        senderJid: "19998887777@s.whatsapp.net",
        // senderE164 is intentionally undefined (edge case)
      });
      const targets = resolveMentionTargets(msg);
      expect(isBotMentionedFromTargets(msg, selfChatMentionCfg, targets)).toBe(true);
    });
  });
});
