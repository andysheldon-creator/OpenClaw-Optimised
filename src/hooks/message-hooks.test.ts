import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerInternalHook,
  clearInternalHooks,
  type InternalHookEvent,
} from "./internal-hooks.js";

describe("message hook events", () => {
  beforeEach(() => {
    clearInternalHooks();
  });

  afterEach(() => {
    clearInternalHooks();
  });

  describe("message:received", () => {
    it("triggers handler registered for message:received", async () => {
      const handler = vi.fn();
      registerInternalHook("message:received", handler);

      const { createInternalHookEvent, triggerInternalHook } = await import("./internal-hooks.js");

      const event = createInternalHookEvent("message", "received", "agent:main:test", {
        text: "Hello world",
        channel: "telegram",
        chatType: "dm",
        from: "telegram:12345",
        senderId: "12345",
        senderName: "Test User",
      });

      await triggerInternalHook(event);

      expect(handler).toHaveBeenCalledTimes(1);
      const fired = handler.mock.calls[0][0] as InternalHookEvent;
      expect(fired.type).toBe("message");
      expect(fired.action).toBe("received");
      expect(fired.sessionKey).toBe("agent:main:test");
      expect(fired.context.text).toBe("Hello world");
      expect(fired.context.channel).toBe("telegram");
      expect(fired.context.senderId).toBe("12345");
    });

    it("triggers both general message and specific message:received handlers", async () => {
      const generalHandler = vi.fn();
      const specificHandler = vi.fn();
      registerInternalHook("message", generalHandler);
      registerInternalHook("message:received", specificHandler);

      const { createInternalHookEvent, triggerInternalHook } = await import("./internal-hooks.js");

      const event = createInternalHookEvent("message", "received", "test-session", {
        text: "Test",
      });

      await triggerInternalHook(event);

      expect(generalHandler).toHaveBeenCalledTimes(1);
      expect(specificHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("message:sent", () => {
    it("triggers handler registered for message:sent", async () => {
      const handler = vi.fn();
      registerInternalHook("message:sent", handler);

      const { createInternalHookEvent, triggerInternalHook } = await import("./internal-hooks.js");

      const event = createInternalHookEvent("message", "sent", "agent:main:test", {
        text: "Hello back!",
        channel: "telegram",
        chatType: "dm",
        kind: "final",
      });

      await triggerInternalHook(event);

      expect(handler).toHaveBeenCalledTimes(1);
      const fired = handler.mock.calls[0][0] as InternalHookEvent;
      expect(fired.type).toBe("message");
      expect(fired.action).toBe("sent");
      expect(fired.context.text).toBe("Hello back!");
      expect(fired.context.kind).toBe("final");
    });

    it("includes media fields when present", async () => {
      const handler = vi.fn();
      registerInternalHook("message:sent", handler);

      const { createInternalHookEvent, triggerInternalHook } = await import("./internal-hooks.js");

      const event = createInternalHookEvent("message", "sent", "test-session", {
        text: "Check this out",
        mediaUrl: "/tmp/image.png",
        kind: "final",
      });

      await triggerInternalHook(event);

      const fired = handler.mock.calls[0][0] as InternalHookEvent;
      expect(fired.context.mediaUrl).toBe("/tmp/image.png");
    });
  });

  describe("error isolation", () => {
    it("does not throw when a handler errors", async () => {
      registerInternalHook("message:received", () => {
        throw new Error("handler boom");
      });

      const { createInternalHookEvent, triggerInternalHook } = await import("./internal-hooks.js");

      const event = createInternalHookEvent("message", "received", "test", { text: "hi" });

      // Should not throw — errors are caught internally
      await expect(triggerInternalHook(event)).resolves.toBeUndefined();
    });
  });

  describe("message type is valid InternalHookEventType", () => {
    it("accepts 'message' as a valid event type", async () => {
      const { createInternalHookEvent } = await import("./internal-hooks.js");
      const event = createInternalHookEvent("message", "received", "s", {});
      expect(event.type).toBe("message");
    });
  });
});
