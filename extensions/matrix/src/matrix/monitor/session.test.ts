import { describe, expect, it } from "vitest";
import { resolveMatrixSessionKey } from "./session.js";

const baseRoute = {
  sessionKey: "agent:main:matrix:channel:!room:matrix.org",
  mainSessionKey: "agent:main:main",
};

describe("resolveMatrixSessionKey", () => {
  it("keeps room session key for room scope", () => {
    const resolved = resolveMatrixSessionKey({
      route: baseRoute,
      sessionScope: "room",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: baseRoute.sessionKey,
      parentSessionKey: undefined,
      isThreadSession: false,
    });
  });

  it("uses agent main session key for agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      route: baseRoute,
      sessionScope: "agent",
      isDirectMessage: false,
    });

    expect(resolved).toEqual({
      sessionKey: baseRoute.mainSessionKey,
      parentSessionKey: undefined,
      isThreadSession: false,
    });
  });

  it("appends thread suffix and sets parent key for room scope", () => {
    const resolved = resolveMatrixSessionKey({
      route: baseRoute,
      sessionScope: "room",
      isDirectMessage: false,
      threadRootId: "$thread-1:matrix.org",
    });

    expect(resolved).toEqual({
      sessionKey: `${baseRoute.sessionKey}:thread:$thread-1:matrix.org`,
      parentSessionKey: baseRoute.sessionKey,
      isThreadSession: true,
    });
  });

  it("appends thread suffix and sets parent key for agent scope", () => {
    const resolved = resolveMatrixSessionKey({
      route: baseRoute,
      sessionScope: "agent",
      isDirectMessage: false,
      threadRootId: "$thread-2:matrix.org",
    });

    expect(resolved).toEqual({
      sessionKey: `${baseRoute.mainSessionKey}:thread:$thread-2:matrix.org`,
      parentSessionKey: baseRoute.mainSessionKey,
      isThreadSession: true,
    });
  });

  it("keeps DM routing unchanged even with thread root", () => {
    const resolved = resolveMatrixSessionKey({
      route: {
        sessionKey: "agent:main:matrix:direct:@alice:matrix.org",
        mainSessionKey: "agent:main:main",
      },
      sessionScope: "agent",
      isDirectMessage: true,
      threadRootId: "$thread-dm:matrix.org",
    });

    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:direct:@alice:matrix.org",
      parentSessionKey: undefined,
      isThreadSession: false,
    });
  });
});
