import { describe, expect, it } from "vitest";
import { resolveAutoReplyEnabled } from "./auto-reply-config.js";

describe("resolveAutoReplyEnabled", () => {
  it("returns true by default when nothing is configured", () => {
    expect(resolveAutoReplyEnabled({ cfg: {}, channel: "whatsapp" })).toBe(true);
  });

  it("respects channels.defaults.autoReply", () => {
    const cfg = { channels: { defaults: { autoReply: false } } };
    expect(resolveAutoReplyEnabled({ cfg, channel: "whatsapp" })).toBe(false);
  });

  it("channel-level overrides defaults", () => {
    const cfg = {
      channels: {
        defaults: { autoReply: true },
        whatsapp: { autoReply: false },
      },
    };
    expect(resolveAutoReplyEnabled({ cfg, channel: "whatsapp" })).toBe(false);
  });

  it("account-level overrides channel-level", () => {
    const cfg = {
      channels: {
        whatsapp: {
          autoReply: false,
          accounts: { work: { autoReply: true } },
        },
      },
    };
    expect(resolveAutoReplyEnabled({ cfg, channel: "whatsapp", accountId: "work" })).toBe(true);
  });

  it("falls through to channel when account has no override", () => {
    const cfg = {
      channels: {
        whatsapp: {
          autoReply: false,
          accounts: { work: {} },
        },
      },
    };
    expect(resolveAutoReplyEnabled({ cfg, channel: "whatsapp", accountId: "work" })).toBe(false);
  });

  it("account-level true overrides both channel-level and defaults false", () => {
    const cfg = {
      channels: {
        defaults: { autoReply: false },
        whatsapp: {
          autoReply: false,
          accounts: { work: { autoReply: true } },
        },
      },
    };
    expect(resolveAutoReplyEnabled({ cfg, channel: "whatsapp", accountId: "work" })).toBe(true);
  });

  it("returns true for channels without config", () => {
    const cfg = { channels: { whatsapp: { autoReply: false } } };
    expect(resolveAutoReplyEnabled({ cfg, channel: "telegram" })).toBe(true);
  });
});
