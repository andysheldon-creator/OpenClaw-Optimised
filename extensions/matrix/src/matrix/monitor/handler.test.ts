import { describe, expect, it } from "vitest";
import { resolveMatrixSessionKey } from "./handler.js";

describe("resolveMatrixSessionKey", () => {
  it("keeps per-room session key when sessionScope is room", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org",
      parentSessionKey: undefined,
    });
  });

  it("defaults to per-room session key when sessionScope is not set", () => {
    const resolved = resolveMatrixSessionKey({
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org",
      parentSessionKey: undefined,
    });
  });

  it("uses shared agent matrix session when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main",
      parentSessionKey: undefined,
    });
  });

  it("creates thread-scoped session key for room thread messages", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!room:example.org:thread:$ThreadRoot:Example.Org",
      parentSessionKey: "agent:main:matrix:channel:!room:example.org",
    });
  });

  it("keeps thread isolation when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:channel:!room:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main:thread:$ThreadRoot:Example.Org",
      parentSessionKey: "agent:main-agent:matrix:main",
    });
  });

  it("does not create thread session for direct messages", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:direct:@alice:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: true,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:direct:@alice:example.org",
      parentSessionKey: undefined,
    });
  });

  it("does not create thread session for direct messages with agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "Main-Agent",
        sessionKey: "agent:main-agent:matrix:direct:@alice:example.org",
      },
      threadRootId: "$ThreadRoot:Example.Org",
      isDirectMessage: true,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main-agent:matrix:main",
      parentSessionKey: undefined,
    });
  });

  it("preserves case in threadRootId", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "$UPPERCASE:THREAD.ID",
      isDirectMessage: false,
    });

    expect(resolved.sessionKey).toBe(
      "agent:main:matrix:channel:!room:example.org:thread:$UPPERCASE:THREAD.ID",
    );
  });

  it("trims whitespace from threadRootId", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "room",
      route: {
        agentId: "main",
        sessionKey: "agent:main:matrix:channel:!room:example.org",
      },
      threadRootId: "  \$thread:event.org  ",
      isDirectMessage: false,
    });

    expect(resolved.sessionKey).toBe(
      "agent:main:matrix:channel:!room:example.org:thread:\$thread:event.org",
    );
  });

  it("normalizes agentId to lowercase when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "UPPER_AGENT",
        sessionKey: "agent:upper_agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:upper_agent:matrix:main");
  });

  it("trims whitespace from agentId when sessionScope is agent", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "  my-agent  ",
        sessionKey: "agent:my-agent:matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:my-agent:matrix:main");
  });

  it("uses 'main' as fallback when agentId is empty with agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "   ",
        sessionKey: "agent::matrix:channel:!room:example.org",
      },
    });

    expect(resolved.sessionKey).toBe("agent:main:matrix:main");
  });

  it("combines thread isolation with agent scope normalization", () => {
    const resolved = resolveMatrixSessionKey({
      sessionScope: "agent",
      route: {
        agentId: "MyAgent",
        sessionKey: "agent:myagent:matrix:channel:!room:example.org",
      },
      threadRootId: "$MixedCase:Thread.ID",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: "agent:myagent:matrix:main:thread:$MixedCase:Thread.ID",
      parentSessionKey: "agent:myagent:matrix:main",
    });
  });
});
