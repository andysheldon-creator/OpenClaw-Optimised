import { describe, expect, it, vi } from "vitest";
import {
  ZulipApiError,
  parseJsonOrThrow,
  zulipAddReaction,
  zulipSendMessage,
  zulipSetTypingStatus,
} from "./client.js";

describe("parseJsonOrThrow", () => {
  it("throws a helpful error for HTML auth pages", async () => {
    const res = new Response("<!doctype html><html><body>CF Access</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

    await expect(parseJsonOrThrow(res)).rejects.toThrow(/received HTML instead of JSON/i);
  });

  it("throws when payload.result != success", async () => {
    const res = new Response(JSON.stringify({ result: "error", msg: "bad" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(parseJsonOrThrow(res)).rejects.toThrow(/bad/);
  });

  it("captures Retry-After metadata in ZulipApiError", async () => {
    const res = new Response(JSON.stringify({ result: "error", msg: "slow down" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "3" },
    });

    await expect(parseJsonOrThrow(res)).rejects.toMatchObject({
      name: "ZulipApiError",
      status: 429,
      retryAfterMs: 3000,
    });
  });
});

describe("client outbound payloads", () => {
  it("sends reactions as emoji_name=eyes", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as string;
      const params = new URLSearchParams(body);
      expect(params.get("emoji_name")).toBe("eyes");
      return new Response(JSON.stringify({ result: "success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await zulipAddReaction(
      { baseUrl: "https://zulip.example.com", email: "bot@example.com", apiKey: "x" },
      { messageId: 123, emojiName: "eyes" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/v1/messages/123/reactions");
  });

  it("sends typing payload with op start/stop and to [user_id]", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as string;
      const params = new URLSearchParams(body);
      expect(params.get("type")).toBe("direct");
      expect(["start", "stop"]).toContain(params.get("op"));
      expect(params.get("to")).toBe(JSON.stringify([42]));
      return new Response(JSON.stringify({ result: "success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await zulipSetTypingStatus(
      { baseUrl: "https://zulip.example.com", email: "bot@example.com", apiKey: "x" },
      { op: "start", to: [42] },
    );

    await zulipSetTypingStatus(
      { baseUrl: "https://zulip.example.com", email: "bot@example.com", apiKey: "x" },
      { op: "stop", to: [42] },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/v1/typing");
  });

  it("DM send supports numeric user_ids", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = init?.body as string;
      const params = new URLSearchParams(body);
      expect(params.get("type")).toBe("private");
      expect(params.get("to")).toBe(JSON.stringify([42]));
      return new Response(JSON.stringify({ result: "success", id: 999 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await zulipSendMessage(
      { baseUrl: "https://zulip.example.com", email: "bot@example.com", apiKey: "x" },
      { type: "private", to: [42], content: "hi" },
    );
    expect(res).toEqual({ id: 999 });
  });
});

describe("client failover", () => {
  it("does not fail over on 429 so monitor can honor Retry-After", async () => {
    const lan = "http://lan.zulip.invalid";
    const tunnel = "https://tunnel.zulip.invalid";

    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      expect([lan, tunnel]).toContain(u.origin);
      return new Response(JSON.stringify({ result: "error", msg: "rate limit" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "4" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      zulipSendMessage(
        { baseUrls: [lan, tunnel], email: "bot@example.com", apiKey: "x" },
        { type: "stream", stream: "a", topic: "b", content: "c" },
      ),
    ).rejects.toBeInstanceOf(ZulipApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails over to the next base URL on 5xx/HTML and remembers last-good", async () => {
    const lan = "http://lan.zulip.invalid";
    const tunnel = "https://tunnel.zulip.invalid";

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.pathname).toContain("/api/v1/messages");
      expect(init?.method).toBe("POST");

      if (u.origin === lan) {
        return new Response("<!doctype html><html><body>502 Bad Gateway</body></html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        });
      }

      return new Response(JSON.stringify({ result: "success", id: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = {
      baseUrls: [lan, tunnel],
      email: "bot-failover@example.com",
      apiKey: "x",
    };

    const r1 = await zulipSendMessage(client, {
      type: "stream",
      stream: "a",
      topic: "b",
      content: "c",
    });
    expect(r1).toEqual({ id: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();

    const r2 = await zulipSendMessage(client, {
      type: "stream",
      stream: "a",
      topic: "b",
      content: "c",
    });
    expect(r2).toEqual({ id: 123 });

    // Second call should start with the remembered last-good URL (tunnel).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(calledUrl)).origin).toBe(tunnel);
  });
});
