import { beforeEach, describe, expect, it, vi } from "vitest";
import { callBrowserRequest, type BrowserParentOpts } from "./browser-cli-shared.js";

const callGatewayFromCliMock = vi.fn();

vi.mock("./gateway-rpc.js", () => ({
  callGatewayFromCli: (...args: unknown[]) => callGatewayFromCliMock(...args),
}));

describe("browser CLI shared transport", () => {
  beforeEach(() => {
    callGatewayFromCliMock.mockReset();
  });

  it("uses browser.request with a relative path (no hardcoded control URL)", async () => {
    callGatewayFromCliMock.mockResolvedValue({ running: true });

    const opts: BrowserParentOpts = {
      timeout: "2500",
      token: "token",
      url: "ws://127.0.0.1:29173",
    };

    await callBrowserRequest(
      opts,
      {
        method: "POST",
        path: "/start",
        query: { profile: "openclaw", ignored: undefined },
      },
      { timeoutMs: 1500 },
    );

    expect(callGatewayFromCliMock).toHaveBeenCalledTimes(1);
    expect(callGatewayFromCliMock).toHaveBeenCalledWith(
      "browser.request",
      expect.objectContaining({
        url: "ws://127.0.0.1:29173",
        token: "token",
        timeout: "1500",
      }),
      expect.objectContaining({
        method: "POST",
        path: "/start",
        query: { profile: "openclaw" },
        timeoutMs: 1500,
      }),
      expect.objectContaining({
        progress: undefined,
      }),
    );

    const payload = callGatewayFromCliMock.mock.calls[0]?.[2] as { path: string };
    expect(payload.path).toBe("/start");
    expect(payload.path).not.toContain("18791");
    expect(payload.path).not.toContain("http://");
    expect(payload.path).not.toContain("https://");
  });
});
