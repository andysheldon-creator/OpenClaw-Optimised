import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { dispatchInboundMessage } from "./dispatch.js";
import * as internalHooks from "../hooks/internal-hooks.js";
import type { MsgContext } from "./templating.js";
import type { OpenClawConfig } from "../config/config.js";

describe("dispatchInboundMessage hooks", () => {
  let triggerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    triggerSpy = vi.spyOn(internalHooks, "triggerInternalHook").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers message:received hook for regular messages", async () => {
    const ctx: MsgContext = {
      Body: "Hello, this is a test message",
      From: "user123",
      SessionKey: "test-session",
      Channel: "telegram",
      ChatType: "direct",
      MessageSid: "msg-123",
    };

    const cfg = { workspace: { dir: "/test/workspace" } } as OpenClawConfig;
    const dispatcher = {
      dispatch: vi.fn(),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
    };

    // We're testing the hook trigger, not the full dispatch
    // So we mock dispatchReplyFromConfig
    vi.mock("./reply/dispatch-from-config.js", () => ({
      dispatchReplyFromConfig: vi.fn().mockResolvedValue({ kind: "ok" }),
    }));

    await dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher: dispatcher as any,
    });

    expect(triggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message",
        action: "received",
        sessionKey: "test-session",
        context: expect.objectContaining({
          body: "Hello, this is a test message",
          senderId: "user123",
          channel: "telegram",
        }),
      }),
    );
  });

  it("does not trigger message:received hook for commands", async () => {
    const ctx: MsgContext = {
      Body: "/new",
      From: "user123",
      SessionKey: "test-session",
    };

    const cfg = {} as OpenClawConfig;
    const dispatcher = {
      dispatch: vi.fn(),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
    };

    vi.mock("./reply/dispatch-from-config.js", () => ({
      dispatchReplyFromConfig: vi.fn().mockResolvedValue({ kind: "ok" }),
    }));

    await dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher: dispatcher as any,
    });

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("does not trigger for empty messages", async () => {
    const ctx: MsgContext = {
      Body: "",
      From: "user123",
      SessionKey: "test-session",
    };

    const cfg = {} as OpenClawConfig;
    const dispatcher = {
      dispatch: vi.fn(),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
    };

    vi.mock("./reply/dispatch-from-config.js", () => ({
      dispatchReplyFromConfig: vi.fn().mockResolvedValue({ kind: "ok" }),
    }));

    await dispatchInboundMessage({
      ctx,
      cfg,
      dispatcher: dispatcher as any,
    });

    expect(triggerSpy).not.toHaveBeenCalled();
  });
});
