import { describe, expect, it } from "vitest";

import { buildDeviceAuthPayload, type DeviceAuthPayloadParams } from "./device-auth.js";

function baseParams(overrides?: Partial<DeviceAuthPayloadParams>): DeviceAuthPayloadParams {
  return {
    deviceId: "dev-001",
    clientId: "client-abc",
    clientMode: "interactive",
    role: "user",
    scopes: ["read", "write"],
    signedAtMs: 1700000000000,
    ...overrides,
  };
}

describe("buildDeviceAuthPayload", () => {
  describe("assertNoPipe validation", () => {
    it("passes with normal values", () => {
      expect(() => buildDeviceAuthPayload(baseParams())).not.toThrow();
    });

    it("rejects pipe in deviceId", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ deviceId: "dev|bad" }))).toThrow(
        /deviceId.*pipe/,
      );
    });

    it("rejects pipe in clientId", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ clientId: "c|x" }))).toThrow(
        /clientId.*pipe/,
      );
    });

    it("rejects pipe in clientMode", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ clientMode: "a|b" }))).toThrow(
        /clientMode.*pipe/,
      );
    });

    it("rejects pipe in role", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ role: "admin|root" }))).toThrow(
        /role.*pipe/,
      );
    });

    it("rejects pipe in scopes", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ scopes: ["ok", "bad|scope"] }))).toThrow(
        /scopes.*pipe/,
      );
    });

    it("rejects pipe in token", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ token: "tok|en" }))).toThrow(/token.*pipe/);
    });

    it("rejects pipe in nonce", () => {
      expect(() => buildDeviceAuthPayload(baseParams({ nonce: "n|once", version: "v2" }))).toThrow(
        /nonce.*pipe/,
      );
    });

    it("allows empty string fields without throwing", () => {
      expect(() =>
        buildDeviceAuthPayload(
          baseParams({ deviceId: "", clientId: "", clientMode: "", role: "" }),
        ),
      ).not.toThrow();
    });

    it("allows special characters other than pipe", () => {
      expect(() =>
        buildDeviceAuthPayload(baseParams({ deviceId: "dev@#$%^&*()!~" })),
      ).not.toThrow();
    });
  });

  describe("v1 format", () => {
    it("builds v1 payload by default (no nonce)", () => {
      const result = buildDeviceAuthPayload(baseParams());
      const parts = result.split("|");
      expect(parts[0]).toBe("v1");
      expect(parts[1]).toBe("dev-001");
      expect(parts[2]).toBe("client-abc");
      expect(parts[3]).toBe("interactive");
      expect(parts[4]).toBe("user");
      expect(parts[5]).toBe("read,write");
      expect(parts[6]).toBe("1700000000000");
      expect(parts[7]).toBe("");
      expect(parts).toHaveLength(8);
    });

    it("includes token when provided in v1", () => {
      const result = buildDeviceAuthPayload(baseParams({ token: "secret123" }));
      const parts = result.split("|");
      expect(parts[0]).toBe("v1");
      expect(parts[7]).toBe("secret123");
      expect(parts).toHaveLength(8);
    });
  });

  describe("v2 format", () => {
    it("auto-detects v2 when nonce is present", () => {
      const result = buildDeviceAuthPayload(baseParams({ nonce: "nonce-xyz" }));
      const parts = result.split("|");
      expect(parts[0]).toBe("v2");
      expect(parts).toHaveLength(9);
      expect(parts[8]).toBe("nonce-xyz");
    });

    it("uses explicit version override", () => {
      const result = buildDeviceAuthPayload(baseParams({ version: "v2" }));
      const parts = result.split("|");
      expect(parts[0]).toBe("v2");
      expect(parts).toHaveLength(9);
      expect(parts[8]).toBe("");
    });

    it("builds v2 with both token and nonce", () => {
      const result = buildDeviceAuthPayload(
        baseParams({ token: "tok", nonce: "abc", version: "v2" }),
      );
      const parts = result.split("|");
      expect(parts[0]).toBe("v2");
      expect(parts[7]).toBe("tok");
      expect(parts[8]).toBe("abc");
    });
  });

  describe("scopes serialization", () => {
    it("joins scopes with comma", () => {
      const result = buildDeviceAuthPayload(baseParams({ scopes: ["a", "b", "c"] }));
      expect(result.split("|")[5]).toBe("a,b,c");
    });

    it("handles empty scopes", () => {
      const result = buildDeviceAuthPayload(baseParams({ scopes: [] }));
      expect(result.split("|")[5]).toBe("");
    });
  });
});
