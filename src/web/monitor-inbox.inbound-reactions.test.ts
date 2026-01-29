import { vi } from "vitest";

vi.mock("../media/store.js", () => ({
  saveMediaBuffer: vi.fn().mockResolvedValue({
    id: "mid",
    path: "/tmp/mid",
    size: 1,
    contentType: "image/jpeg",
  }),
}));

const mockLoadConfig = vi.fn().mockReturnValue({
  channels: {
    whatsapp: {
      allowFrom: ["*"],
    },
  },
  messages: {
    messagePrefix: undefined,
    responsePrefix: undefined,
  },
});

const readAllowFromStoreMock = vi.fn().mockResolvedValue([]);
const upsertPairingRequestMock = vi.fn().mockResolvedValue({ code: "PAIRCODE", created: true });

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => mockLoadConfig(),
  };
});

vi.mock("../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));

vi.mock("./session.js", () => {
  const { EventEmitter } = require("node:events");
  const ev = new EventEmitter();
  const sock = {
    ev,
    ws: { close: vi.fn() },
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    readMessages: vi.fn().mockResolvedValue(undefined),
    updateMediaMessage: vi.fn(),
    logger: {},
    signalRepository: {
      lidMapping: {
        getPNForLID: vi.fn().mockResolvedValue(null),
      },
    },
    user: { id: "123@s.whatsapp.net" },
    groupMetadata: vi.fn().mockResolvedValue({ subject: "Test Group", participants: [] }),
  };
  return {
    createWaSocket: vi.fn().mockResolvedValue(sock),
    waitForWaConnection: vi.fn().mockResolvedValue(undefined),
    getStatusCode: vi.fn(() => 500),
  };
});

const { createWaSocket } = await import("./session.js");

import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetLogger, setLoggerOverride } from "../logging.js";
import { monitorWebInbox, resetWebInboundDedupe } from "./inbound.js";

const ACCOUNT_ID = "default";
let authDir: string;

describe("web monitor inbox – inbound reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readAllowFromStoreMock.mockResolvedValue([]);
    resetWebInboundDedupe();
    authDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "moltbot-auth-"));
  });

  afterEach(() => {
    resetLogger();
    setLoggerOverride(null);
    vi.useRealTimers();
    fsSync.rmSync(authDir, { recursive: true, force: true });
  });

  it("calls onReaction for inbound reaction events", async () => {
    const onMessage = vi.fn(async () => {});
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage,
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    const reactionEvent = [
      {
        key: {
          id: "msg-123",
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: {
            remoteJid: "888@s.whatsapp.net",
            participant: "888@s.whatsapp.net",
          },
        },
      },
    ];

    sock.ev.emit("messages.reaction", reactionEvent);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).toHaveBeenCalledTimes(1);
    expect(onReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-123",
        emoji: "👍",
        chatJid: "999@s.whatsapp.net",
        chatType: "direct",
        accountId: ACCOUNT_ID,
        senderJid: "888@s.whatsapp.net",
        reactedToFromMe: false,
      }),
    );
    expect(onMessage).not.toHaveBeenCalled();

    await listener.close();
  });

  it("handles reaction removals (empty emoji)", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-123",
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "",
          key: { remoteJid: "888@s.whatsapp.net" },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-123",
        emoji: "",
        isRemoval: true,
        chatJid: "999@s.whatsapp.net",
      }),
    );

    await listener.close();
  });

  it("skips reactions on status/broadcast JIDs", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-123",
          remoteJid: "status@status",
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: { remoteJid: "888@s.whatsapp.net" },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).not.toHaveBeenCalled();

    await listener.close();
  });

  it("identifies group reactions by chatType", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-456",
          remoteJid: "120363@g.us",
          fromMe: true,
        },
        reaction: {
          text: "❤️",
          key: {
            remoteJid: "120363@g.us",
            participant: "777@s.whatsapp.net",
          },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-456",
        emoji: "❤️",
        chatJid: "120363@g.us",
        chatType: "group",
        senderJid: "777@s.whatsapp.net",
        reactedToFromMe: true,
      }),
    );

    await listener.close();
  });

  it("resolves self-reactions in DMs to own JID", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    // Self-reaction: reactionKey.fromMe = true, remoteJid is the partner
    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-789",
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: {
            remoteJid: "999@s.whatsapp.net",
            fromMe: true,
          },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-789",
        emoji: "👍",
        // senderJid should be our own JID, not the chat partner
        senderJid: "123@s.whatsapp.net",
      }),
    );

    await listener.close();
  });

  it("continues processing remaining reactions when callback throws", async () => {
    const onReaction = vi.fn().mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: { id: "msg-1", remoteJid: "999@s.whatsapp.net", fromMe: false },
        reaction: { text: "👍", key: { remoteJid: "888@s.whatsapp.net" } },
      },
      {
        key: { id: "msg-2", remoteJid: "999@s.whatsapp.net", fromMe: false },
        reaction: { text: "❤️", key: { remoteJid: "888@s.whatsapp.net" } },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    // Both reactions should be attempted despite first throwing
    expect(onReaction).toHaveBeenCalledTimes(2);

    await listener.close();
  });

  it("skips reactions with missing messageId", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: undefined,
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: { remoteJid: "888@s.whatsapp.net" },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).not.toHaveBeenCalled();

    await listener.close();
  });

  it("skips reactions with missing remoteJid", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-123",
          remoteJid: undefined,
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: { remoteJid: "888@s.whatsapp.net" },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(onReaction).not.toHaveBeenCalled();

    await listener.close();
  });

  it("handles missing reaction.key gracefully (senderJid undefined)", async () => {
    const onReaction = vi.fn();

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage: vi.fn(async () => {}),
      onReaction,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-123",
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "🔥",
          // no key — sender unknown
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    // In DMs without reaction.key, we use chatJid as the sender
    expect(onReaction).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-123",
        emoji: "🔥",
        senderJid: "999@s.whatsapp.net",
        chatType: "direct",
      }),
    );

    await listener.close();
  });

  it("works without onReaction callback (no-op)", async () => {
    const onMessage = vi.fn(async () => {});

    const listener = await monitorWebInbox({
      verbose: false,
      onMessage,
      accountId: ACCOUNT_ID,
      authDir,
    });
    const sock = await createWaSocket();

    // Should not throw when no onReaction is provided
    sock.ev.emit("messages.reaction", [
      {
        key: {
          id: "msg-123",
          remoteJid: "999@s.whatsapp.net",
          fromMe: false,
        },
        reaction: {
          text: "👍",
          key: { remoteJid: "888@s.whatsapp.net" },
        },
      },
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    await listener.close();
  });
});
