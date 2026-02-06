import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

import { generateApiKey, validateApiKey, sendAuthError } from "./inbound-auth.js";
import type { A2AInboundKey } from "./config.js";

function mockRequest(headers: Record<string, string | undefined> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function mockResponse(): {
  res: ServerResponse;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  const state = { statusCode: 200, headers: {} as Record<string, string>, body: "" };
  const res = {
    set statusCode(code: number) {
      state.statusCode = code;
    },
    get statusCode() {
      return state.statusCode;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    end(data?: string) {
      state.body = data ?? "";
    },
  } as unknown as ServerResponse;
  return { res, ...state, get statusCode() { return state.statusCode; }, get headers() { return state.headers; }, get body() { return state.body; } };
}

const validKeys: A2AInboundKey[] = [
  { label: "agent-alpha", key: "test-key-alpha-12345" },
  { label: "agent-beta", key: "test-key-beta-67890" },
];

describe("generateApiKey", () => {
  it("generates a base64url string of expected length", () => {
    const key = generateApiKey();
    // 32 bytes -> 43 base64url chars (no padding)
    expect(key.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});

describe("validateApiKey", () => {
  it("accepts a valid Bearer token", () => {
    const req = mockRequest({ authorization: "Bearer test-key-alpha-12345" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: true, label: "agent-alpha" });
  });

  it("accepts a valid X-A2A-Key header", () => {
    const req = mockRequest({ "x-a2a-key": "test-key-beta-67890" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: true, label: "agent-beta" });
  });

  it("prefers Bearer over X-A2A-Key", () => {
    const req = mockRequest({
      authorization: "Bearer test-key-alpha-12345",
      "x-a2a-key": "test-key-beta-67890",
    });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: true, label: "agent-alpha" });
  });

  it("rejects missing key", () => {
    const req = mockRequest({});
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: false, reason: "missing_key" });
  });

  it("rejects invalid key", () => {
    const req = mockRequest({ authorization: "Bearer wrong-key" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("rejects non-Bearer auth schemes", () => {
    const req = mockRequest({ authorization: "Basic dGVzdDp0ZXN0" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: false, reason: "missing_key" });
  });

  it("handles case-insensitive Bearer prefix", () => {
    const req = mockRequest({ authorization: "bearer test-key-alpha-12345" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: true, label: "agent-alpha" });
  });

  it("rejects empty Authorization header", () => {
    const req = mockRequest({ authorization: "" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: false, reason: "missing_key" });
  });

  it("rejects Bearer with no token value", () => {
    const req = mockRequest({ authorization: "Bearer " });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: false, reason: "missing_key" });
  });

  it("validates against all keys in the list", () => {
    const req = mockRequest({ authorization: "Bearer test-key-beta-67890" });
    const result = validateApiKey(req, validKeys);
    expect(result).toEqual({ ok: true, label: "agent-beta" });
  });

  it("returns ok:false for empty key list", () => {
    const req = mockRequest({ authorization: "Bearer test-key-alpha-12345" });
    const result = validateApiKey(req, []);
    expect(result).toEqual({ ok: false, reason: "invalid_key" });
  });
});

describe("sendAuthError", () => {
  it("sends 401 with JSON-RPC error body", () => {
    const mock = mockResponse();
    sendAuthError(mock.res, "Auth required");

    expect(mock.statusCode).toBe(401);
    expect(mock.headers["www-authenticate"]).toBe('Bearer realm="a2a"');
    expect(mock.headers["content-type"]).toContain("application/json");

    const parsed = JSON.parse(mock.body);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBeNull();
    expect(parsed.error.code).toBe(-32001);
    expect(parsed.error.message).toBe("Auth required");
  });
});
