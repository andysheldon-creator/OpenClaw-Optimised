import { describe, expect, it } from "vitest";
import { buildSyntheticContext } from "./context.js";

describe("buildSyntheticContext", () => {
  it("should generate valid MsgContext with all required fields", () => {
    const ctx = buildSyntheticContext({
      body: "Hello, Clawdbot!",
      sessionKey: "test-session-123",
      senderId: "mcp-client",
    });

    // Core message content
    expect(ctx.Body).toBe("Hello, Clawdbot!");
    expect(ctx.RawBody).toBe("Hello, Clawdbot!");
    expect(ctx.CommandBody).toBe("Hello, Clawdbot!");
    expect(ctx.BodyForCommands).toBe("Hello, Clawdbot!");
    expect(ctx.BodyForAgent).toBe("Hello, Clawdbot!");

    // Session/routing
    expect(ctx.SessionKey).toBe("test-session-123");

    // Provider identification
    expect(ctx.Provider).toBe("mcp");
    expect(ctx.Surface).toBe("mcp");
    expect(ctx.AccountId).toBe("mcp");

    // Sender info
    expect(ctx.From).toBe("mcp-client");
    expect(ctx.SenderId).toBe("mcp-client");
    expect(ctx.SenderUsername).toBe("mcp-client");
    expect(ctx.SenderName).toBe("MCP Client"); // default

    // Message metadata
    expect(ctx.MessageSid).toMatch(/^mcp-\d+-[a-z0-9]+$/);

    // Flags
    expect(ctx.WasMentioned).toBe(true);
    expect(ctx.CommandAuthorized).toBe(true);
    expect(ctx.CommandSource).toBe("native");

    // Media (empty for text-only)
    expect(ctx.MediaUrl).toBeUndefined();
    expect(ctx.MediaUrls).toEqual([]);
    expect(ctx.MediaPath).toBeUndefined();
    expect(ctx.MediaPaths).toEqual([]);

    // Threading
    expect(ctx.ReplyToId).toBeUndefined();
    expect(ctx.MessageThreadId).toBeUndefined();
  });

  it("should use custom senderName when provided", () => {
    const ctx = buildSyntheticContext({
      body: "Test message",
      sessionKey: "session-1",
      senderId: "user-123",
      senderName: "Custom Sender Name",
    });

    expect(ctx.SenderName).toBe("Custom Sender Name");
  });

  it("should generate unique MessageSid for each call", () => {
    const ctx1 = buildSyntheticContext({
      body: "msg1",
      sessionKey: "session-1",
      senderId: "client",
    });
    const ctx2 = buildSyntheticContext({
      body: "msg2",
      sessionKey: "session-1",
      senderId: "client",
    });

    expect(ctx1.MessageSid).not.toBe(ctx2.MessageSid);
  });

  it("should NOT set OriginatingChannel (intentional omission)", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "client",
    });

    // OriginatingChannel is intentionally omitted because MCP returns
    // responses in-band rather than routing to external channels
    expect(ctx.OriginatingChannel).toBeUndefined();
  });

  it("should set Provider, Surface, and AccountId to 'mcp'", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "client",
    });

    expect(ctx.Provider).toBe("mcp");
    expect(ctx.Surface).toBe("mcp");
    expect(ctx.AccountId).toBe("mcp");
  });

  it("should set From to the senderId parameter", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "custom-sender-id-456",
    });

    expect(ctx.From).toBe("custom-sender-id-456");
  });
});
