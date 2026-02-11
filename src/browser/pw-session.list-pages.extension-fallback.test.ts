import { describe, expect, it, vi } from "vitest";

describe("pw-session listPagesViaPlaywright", () => {
  it("falls back to /json/list ordering when CDP session attachment is blocked", async () => {
    vi.resetModules();

    const pageA = {
      url: () => "https://example.com/a",
      title: vi.fn(async () => "A"),
      on: vi.fn(),
      context: () => context,
    } as unknown as import("playwright-core").Page;
    const pageB = {
      url: () => "https://example.com/b",
      title: vi.fn(async () => "B"),
      on: vi.fn(),
      context: () => context,
    } as unknown as import("playwright-core").Page;

    const context = {
      pages: () => [pageA, pageB],
      on: vi.fn(),
      newCDPSession: vi.fn(async () => {
        throw new Error("Not allowed");
      }),
    } as unknown as import("playwright-core").BrowserContext;

    const browser = {
      contexts: () => [context],
      on: vi.fn(),
      close: vi.fn(async () => {}),
    } as unknown as import("playwright-core").Browser;

    vi.doMock("playwright-core", () => ({
      chromium: {
        connectOverCDP: vi.fn(async () => browser),
      },
    }));

    vi.doMock("./chrome.js", () => ({
      getChromeWebSocketUrl: vi.fn(async () => null),
    }));

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "t-1", type: "page", url: "https://example.com/a", title: "A" },
        { id: "t-2", type: "page", url: "https://example.com/b", title: "B" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./pw-session.js");
    const pages = await mod.listPagesViaPlaywright({ cdpUrl: "http://127.0.0.1:18792" });

    expect(pages).toEqual([
      { targetId: "t-1", title: "A", url: "https://example.com/a", type: "page" },
      { targetId: "t-2", title: "B", url: "https://example.com/b", type: "page" },
    ]);

    await mod.closePlaywrightBrowserConnection();
    vi.unstubAllGlobals();
  });
});
