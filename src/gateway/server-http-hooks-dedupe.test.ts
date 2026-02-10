import { type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { resolveHookMappings } from "./hooks-mapping.js";
import { createHooksRequestHandler } from "./server-http.js";

function fakeReq(opts: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): IncomingMessage {
  const chunks: Buffer[] = [];
  const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
  if (bodyStr) {
    chunks.push(Buffer.from(bodyStr, "utf-8"));
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: "Bearer test-token",
    ...opts.headers,
  };
  return {
    url: opts.url,
    method: opts.method ?? "POST",
    headers,
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "data") {
        for (const chunk of chunks) {
          cb(chunk);
        }
      }
      if (event === "end") {
        cb();
      }
      return this;
    },
    removeListener() {
      return this;
    },
  } as unknown as IncomingMessage;
}

function fakeRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    _status: 0,
    _body: "",
    _headers: {} as Record<string, string>,
    statusCode: 200,
    headersSent: false,
    setHeader(key: string, value: string) {
      res._headers[key.toLowerCase()] = value;
    },
    end(body?: string) {
      res._status = res.statusCode;
      res._body = body ?? "";
    },
  };
  return res as unknown as ServerResponse & { _status: number; _body: string };
}

describe("hooks request handler dedup", () => {
  const gmailMappings = resolveHookMappings({
    presets: ["gmail"],
  });

  function makeHandler() {
    const dispatched: Array<{ message: string; sessionKey: string }> = [];
    const dispatchAgentHook = vi.fn((value: { message: string; sessionKey: string }) => {
      dispatched.push(value);
      return `run-${dispatched.length}`;
    });
    const dispatchWakeHook = vi.fn();
    const handler = createHooksRequestHandler({
      getHooksConfig: () => ({
        basePath: "/hooks",
        token: "test-token",
        maxBodyBytes: 1_000_000,
        mappings: gmailMappings,
      }),
      bindHost: "127.0.0.1",
      port: 18789,
      logHooks: {
        info: () => {},
        warn: () => {},
        error: () => {},
        verbose: () => {},
      } as any,
      dispatchAgentHook: dispatchAgentHook as any,
      dispatchWakeHook: dispatchWakeHook as any,
    });
    return { handler, dispatchAgentHook, dispatched };
  }

  it("dispatches the first hook request", async () => {
    const { handler, dispatchAgentHook } = makeHandler();
    const req = fakeReq({
      url: "/hooks/gmail",
      body: {
        messages: [
          {
            id: "msg-123",
            from: "alice@test.com",
            subject: "Hello",
            snippet: "Hi",
            body: "Hi there",
          },
        ],
      },
    });
    const res = fakeRes();
    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(202);
    expect(dispatchAgentHook).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the same hook payload within TTL", async () => {
    const { handler, dispatchAgentHook } = makeHandler();
    const body = {
      messages: [
        { id: "msg-456", from: "bob@test.com", subject: "Dup", snippet: "...", body: "body" },
      ],
    };

    // First request — should dispatch
    const req1 = fakeReq({ url: "/hooks/gmail", body });
    const res1 = fakeRes();
    await handler(req1, res1);
    expect(res1._status).toBe(202);
    expect(dispatchAgentHook).toHaveBeenCalledTimes(1);

    // Second request with same payload — should be deduped
    const req2 = fakeReq({ url: "/hooks/gmail", body });
    const res2 = fakeRes();
    await handler(req2, res2);
    expect(res2._status).toBe(200);
    expect(dispatchAgentHook).toHaveBeenCalledTimes(1); // Still 1, not 2
    const parsed = JSON.parse(res2._body);
    expect(parsed.ok).toBe(true);
    expect(parsed.duplicate).toBe(true);
  });

  it("allows different message IDs through", async () => {
    const { handler, dispatchAgentHook } = makeHandler();

    const req1 = fakeReq({
      url: "/hooks/gmail",
      body: {
        messages: [{ id: "msg-a", from: "a@test.com", subject: "A", snippet: "", body: "" }],
      },
    });
    const res1 = fakeRes();
    await handler(req1, res1);

    const req2 = fakeReq({
      url: "/hooks/gmail",
      body: {
        messages: [{ id: "msg-b", from: "b@test.com", subject: "B", snippet: "", body: "" }],
      },
    });
    const res2 = fakeRes();
    await handler(req2, res2);

    expect(dispatchAgentHook).toHaveBeenCalledTimes(2);
    expect(res1._status).toBe(202);
    expect(res2._status).toBe(202);
  });
});
