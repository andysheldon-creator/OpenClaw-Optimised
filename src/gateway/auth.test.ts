import { describe, expect, it } from "vitest";

import { authorizeGatewayConnect, isAllowedOrigin } from "./auth.js";

describe("gateway auth", () => {
  it("does not throw when req is missing socket", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "none", allowTailscale: false },
      connectAuth: null,
      // Regression: avoid crashing on req.socket.remoteAddress when callers pass a non-IncomingMessage.
      req: {} as never,
    });
    expect(res.ok).toBe(true);
  });
});

describe("gateway auth — password mode", () => {
  const passwordAuth = {
    mode: "password" as const,
    password: "secret123",
    allowTailscale: false,
  };

  it("accepts correct password via password field", async () => {
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: { password: "secret123" },
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("password");
  });

  it("rejects wrong password", async () => {
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: { password: "wrong" },
    });
    expect(res.ok).toBe(false);
  });

  it("rejects missing password", async () => {
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: {},
    });
    expect(res.ok).toBe(false);
  });

  it("accepts correct password sent via token field (dashboard refresh)", async () => {
    // The control UI persists the credential in the token field (localStorage).
    // On page refresh, the password field is empty and the credential arrives
    // as connectAuth.token instead.
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: { token: "secret123" },
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("password");
  });

  it("rejects wrong password sent via token field", async () => {
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: { token: "wrong" },
    });
    expect(res.ok).toBe(false);
  });

  it("prefers password field over token field when both provided", async () => {
    const res = await authorizeGatewayConnect({
      auth: passwordAuth,
      connectAuth: { password: "secret123", token: "wrong" },
    });
    expect(res.ok).toBe(true);
  });
});

describe("gateway auth — token mode", () => {
  const tokenAuth = {
    mode: "token" as const,
    token: "mytoken",
    allowTailscale: false,
  };

  it("accepts correct token", async () => {
    const res = await authorizeGatewayConnect({
      auth: tokenAuth,
      connectAuth: { token: "mytoken" },
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("token");
  });

  it("rejects wrong token", async () => {
    const res = await authorizeGatewayConnect({
      auth: tokenAuth,
      connectAuth: { token: "wrong" },
    });
    expect(res.ok).toBe(false);
  });
});

describe("isAllowedOrigin", () => {
  it("allows undefined origin (non-browser clients like CLI)", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it("allows 'null' origin (same-origin from file:// or data: URIs)", () => {
    expect(isAllowedOrigin("null")).toBe(true);
  });

  it("allows http://localhost", () => {
    expect(isAllowedOrigin("http://localhost")).toBe(true);
  });

  it("allows http://localhost with port", () => {
    expect(isAllowedOrigin("http://localhost:18789")).toBe(true);
  });

  it("allows https://localhost with port", () => {
    expect(isAllowedOrigin("https://localhost:3000")).toBe(true);
  });

  it("allows http://127.0.0.1", () => {
    expect(isAllowedOrigin("http://127.0.0.1")).toBe(true);
  });

  it("allows http://127.0.0.1 with port", () => {
    expect(isAllowedOrigin("http://127.0.0.1:18789")).toBe(true);
  });

  it("allows http://[::1]", () => {
    expect(isAllowedOrigin("http://[::1]")).toBe(true);
  });

  it("allows http://[::1] with port", () => {
    expect(isAllowedOrigin("http://[::1]:18789")).toBe(true);
  });

  it("rejects http://evil.com (cross-site attack)", () => {
    expect(isAllowedOrigin("http://evil.com")).toBe(false);
  });

  it("rejects https://attacker.example.com", () => {
    expect(isAllowedOrigin("https://attacker.example.com")).toBe(false);
  });

  it("rejects http://localhost.evil.com (subdomain spoofing)", () => {
    expect(isAllowedOrigin("http://localhost.evil.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedOrigin("")).toBe(false);
  });

  it("allows extra configured origins", () => {
    expect(
      isAllowedOrigin("http://192.168.1.100:18789", [
        "http://192.168.1.100:18789",
      ]),
    ).toBe(true);
  });

  it("allows extra configured origins case-insensitively", () => {
    expect(
      isAllowedOrigin("HTTP://MyHost.Local:18789", [
        "http://myhost.local:18789",
      ]),
    ).toBe(true);
  });

  it("rejects origins not in extra list", () => {
    expect(
      isAllowedOrigin("http://evil.com", ["http://192.168.1.100:18789"]),
    ).toBe(false);
  });

  it("rejects javascript: URI", () => {
    expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URI", () => {
    expect(isAllowedOrigin("data:text/html,<h1>hi</h1>")).toBe(false);
  });
});
