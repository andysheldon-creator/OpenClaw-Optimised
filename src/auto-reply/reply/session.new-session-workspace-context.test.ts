import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import { initSessionState } from "./session.js";

describe("initSessionState - new session workspace context reminder", () => {
  const buildTestConfig = (): OpenClawConfig => ({
    session: {
      resetTriggers: ["/new", "/reset"],
      scope: "per-sender",
    },
  });

  const buildTestContext = (body: string): MsgContext => ({
    Body: body,
    BodyForCommands: body,
    CommandBody: body,
    RawBody: body,
    SessionKey: "test-session-key",
    Surface: "test",
    Provider: "test",
    From: "testuser",
    To: "agent",
    MessageId: "msg-123",
    Timestamp: Date.now(),
    ChatType: "direct",
  });

  it("adds context reminder when /new is sent without additional text", async () => {
    const cfg = buildTestConfig();
    const ctx = buildTestContext("/new");

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.isNewSession).toBe(true);
    expect(result.resetTriggered).toBe(true);
    expect(result.sessionCtx.BodyStripped).toContain("[System: New session started");
    expect(result.sessionCtx.BodyStripped).toContain("Project Context");
    expect(result.sessionCtx.BodyStripped).toContain("SOUL.md");
    expect(result.sessionCtx.BodyStripped).toContain("USER.md");
    expect(result.sessionCtx.BodyStripped).toContain("MEMORY.md");
    expect(result.sessionCtx.BodyStripped).toContain("Greet the user");
  });

  it("adds context reminder when /new is sent with additional text", async () => {
    const cfg = buildTestConfig();
    const ctx = buildTestContext("/new take notes");

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.isNewSession).toBe(true);
    expect(result.resetTriggered).toBe(true);
    expect(result.sessionCtx.BodyStripped).toContain("[System: New session started");
    expect(result.sessionCtx.BodyStripped).toContain("Project Context");
    expect(result.sessionCtx.BodyStripped).toContain("take notes");
    // Should not contain the "Greet the user" part when there's additional text
    expect(result.sessionCtx.BodyStripped).not.toContain("Greet the user");
  });

  it("adds context reminder when /reset is sent", async () => {
    const cfg = buildTestConfig();
    const ctx = buildTestContext("/reset");

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.isNewSession).toBe(true);
    expect(result.resetTriggered).toBe(true);
    expect(result.sessionCtx.BodyStripped).toContain("[System: New session started");
    expect(result.sessionCtx.BodyStripped).toContain("Project Context");
  });

  it("does not add context reminder for regular messages", async () => {
    const cfg = buildTestConfig();
    const ctx = buildTestContext("Hello");

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(result.isNewSession).toBe(false);
    expect(result.resetTriggered).toBe(false);
    expect(result.sessionCtx.BodyStripped).not.toContain("[System: New session started");
    expect(result.sessionCtx.BodyStripped).toBe("Hello");
  });

  it("does not add context reminder when reset is unauthorized", async () => {
    const cfg = buildTestConfig();
    const ctx = buildTestContext("/new");

    const result = await initSessionState({
      ctx,
      cfg,
      commandAuthorized: false, // Reset not authorized
    });

    // Should not trigger reset when unauthorized
    expect(result.resetTriggered).toBe(false);
    expect(result.sessionCtx.BodyStripped).not.toContain("[System: New session started");
  });
});
