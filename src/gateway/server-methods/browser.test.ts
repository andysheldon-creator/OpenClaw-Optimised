import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ...(() => {
    const dispatch = vi.fn();
    return {
      dispatch,
      createBrowserControlContext: vi.fn(() => ({})),
      startBrowserControlServiceFromConfig: vi.fn(async () => ({ ok: true })),
      createBrowserRouteDispatcher: vi.fn(() => ({ dispatch })),
    };
  })(),
}));

vi.mock("../../browser/control-service.js", () => ({
  createBrowserControlContext: mocks.createBrowserControlContext,
  startBrowserControlServiceFromConfig: mocks.startBrowserControlServiceFromConfig,
}));

vi.mock("../../browser/routes/dispatcher.js", () => ({
  createBrowserRouteDispatcher: mocks.createBrowserRouteDispatcher,
}));

import { browserHandlers } from "./browser.js";

describe("browser.request profile forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dispatch.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it("forwards top-level profile to local browser dispatcher query", async () => {
    const respond = vi.fn();
    await browserHandlers["browser.request"]({
      params: {
        method: "POST",
        path: "/tabs/open",
        profile: "openclaw",
        body: { url: "https://example.com" },
      },
      respond,
      context: {
        nodeRegistry: {
          listConnected: () => [],
        },
      },
    } as never);

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/tabs/open",
        query: expect.objectContaining({ profile: "openclaw" }),
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, { ok: true });
  });

  it("prefers top-level profile over query.profile when both are set", async () => {
    const respond = vi.fn();
    await browserHandlers["browser.request"]({
      params: {
        method: "GET",
        path: "/",
        profile: "openclaw",
        query: { profile: "chrome" },
      },
      respond,
      context: {
        nodeRegistry: {
          listConnected: () => [],
        },
      },
    } as never);

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/",
        query: expect.objectContaining({ profile: "openclaw" }),
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, { ok: true });
  });
});
