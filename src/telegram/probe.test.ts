import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { probeTelegram } from "./probe.js";

describe("probeTelegram", () => {
  const testToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
  const timeoutMs = 5000;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default API base when apiBase is not provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789,
            username: "test_bot",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: true,
          },
        }),
        { status: 200 },
      ),
    );

    global.fetch = fetchSpy;

    const result = await probeTelegram(testToken, timeoutMs);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${testToken}/getMe`,
      expect.any(Object),
    );
  });

  it("uses custom API base when apiBase is provided", async () => {
    const customBase = "https://custom.api.example.com";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789,
            username: "test_bot",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: true,
          },
        }),
        { status: 200 },
      ),
    );

    global.fetch = fetchSpy;

    const result = await probeTelegram(testToken, timeoutMs, undefined, customBase);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${customBase}/bot${testToken}/getMe`,
      expect.any(Object),
    );
  });

  it("normalizes API base by stripping trailing slashes", async () => {
    const customBase = "https://custom.api.example.com/";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789,
            username: "test_bot",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: true,
          },
        }),
        { status: 200 },
      ),
    );

    global.fetch = fetchSpy;

    const result = await probeTelegram(testToken, timeoutMs, undefined, customBase);

    expect(result.ok).toBe(true);
    // Should strip the trailing slash
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://custom.api.example.com/bot${testToken}/getMe`,
      expect.any(Object),
    );
  });

  it("normalizes API base with multiple trailing slashes", async () => {
    const customBase = "https://custom.api.example.com///";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            id: 123456789,
            username: "test_bot",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: true,
          },
        }),
        { status: 200 },
      ),
    );

    global.fetch = fetchSpy;

    const result = await probeTelegram(testToken, timeoutMs, undefined, customBase);

    expect(result.ok).toBe(true);
    // Should strip all trailing slashes
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://custom.api.example.com/bot${testToken}/getMe`,
      expect.any(Object),
    );
  });
});
