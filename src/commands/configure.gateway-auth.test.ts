import { describe, expect, it } from "vitest";
import { buildGatewayAuthConfig } from "./configure.js";

describe("buildGatewayAuthConfig", () => {
  it("preserves allowTailscale when switching to token", () => {
    const result = buildGatewayAuthConfig({
      existing: {
        mode: "password",
        password: "secret",
        allowTailscale: true,
      },
      mode: "token",
      token: "abc",
    });

    expect(result).toEqual({ mode: "token", token: "abc", allowTailscale: true });
  });

  it("drops password when switching to token", () => {
    const result = buildGatewayAuthConfig({
      existing: {
        mode: "password",
        password: "secret",
        allowTailscale: false,
      },
      mode: "token",
      token: "abc",
    });

    expect(result).toEqual({
      mode: "token",
      token: "abc",
      allowTailscale: false,
    });
  });

  it("drops token when switching to password", () => {
    const result = buildGatewayAuthConfig({
      existing: { mode: "token", token: "abc" },
      mode: "password",
      password: "secret",
    });

    expect(result).toEqual({ mode: "password", password: "secret" });
  });

  it("omits token when undefined is passed", () => {
    const result = buildGatewayAuthConfig({
      mode: "token",
      token: undefined,
    });

    expect(result).toEqual({ mode: "token" });
    expect(result).not.toHaveProperty("token");
  });

  it('rejects the literal string "undefined" as token', () => {
    const result = buildGatewayAuthConfig({
      mode: "token",
      token: "undefined",
    });

    expect(result).toEqual({ mode: "token" });
    expect(result).not.toHaveProperty("token");
  });

  it('rejects the literal string "null" as token', () => {
    const result = buildGatewayAuthConfig({
      mode: "token",
      token: "null",
    });

    expect(result).toEqual({ mode: "token" });
    expect(result).not.toHaveProperty("token");
  });

  it("omits password when undefined is passed", () => {
    const result = buildGatewayAuthConfig({
      mode: "password",
      password: undefined,
    });

    expect(result).toEqual({ mode: "password" });
    expect(result).not.toHaveProperty("password");
  });
});
