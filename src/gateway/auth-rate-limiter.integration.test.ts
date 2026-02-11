import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { describe, it, expect } from "vitest";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";

/**
 * Integration test: verify that authorizeGatewayConnect returns rate_limited
 * after enough failed attempts from a non-local IP.
 */

function fakeReq(remoteAddress: string, host = "gateway.example.com:18789"): IncomingMessage {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: remoteAddress });
  const req = new IncomingMessage(socket);
  req.headers = { host };
  return req;
}

describe("authorizeGatewayConnect rate limiting integration", () => {
  const auth: ResolvedGatewayAuth = {
    mode: "token",
    token: "super-secret-token",
    allowTailscale: false,
  };

  it("returns rate_limited after repeated failures from non-local IP", async () => {
    // Spam 12 bad attempts from a "remote" IP
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      const result = await authorizeGatewayConnect({
        auth,
        connectAuth: { token: `wrong-${i}` },
        req: fakeReq("203.0.113.1"),
      });
      results.push(result.reason ?? "ok");
    }

    // First 10 should be token_mismatch, then rate_limited
    const mismatches = results.filter((r) => r === "token_mismatch").length;
    const rateLimited = results.filter((r) => r === "rate_limited").length;

    expect(mismatches).toBe(10);
    expect(rateLimited).toBeGreaterThanOrEqual(1);
  });

  it("does not rate-limit loopback requests", async () => {
    const results: string[] = [];
    for (let i = 0; i < 15; i++) {
      const result = await authorizeGatewayConnect({
        auth,
        connectAuth: { token: `wrong-${i}` },
        req: fakeReq("127.0.0.1", "localhost:18789"),
      });
      results.push(result.reason ?? "ok");
    }

    // All should be token_mismatch — never rate_limited
    expect(results.every((r) => r === "token_mismatch")).toBe(true);
  });

  it("valid auth still works after bad attempts from different IP", async () => {
    // Spam from attacker IP
    for (let i = 0; i < 12; i++) {
      await authorizeGatewayConnect({
        auth,
        connectAuth: { token: `wrong-${i}` },
        req: fakeReq("198.51.100.5"),
      });
    }

    // Valid auth from different IP should work
    const result = await authorizeGatewayConnect({
      auth,
      connectAuth: { token: "super-secret-token" },
      req: fakeReq("192.0.2.10"),
    });
    expect(result.ok).toBe(true);
  });
});
