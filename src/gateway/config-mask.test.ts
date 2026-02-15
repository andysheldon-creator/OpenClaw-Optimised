import { describe, expect, it } from "vitest";

import { maskSensitiveFields, maskValue } from "./config-mask.js";

describe("maskValue", () => {
  it("fully masks short values (< 6 chars)", () => {
    expect(maskValue("abc")).toBe("***");
    expect(maskValue("12345")).toBe("***");
  });

  it("shows first 4 chars of longer values", () => {
    expect(maskValue("sk-ant-api03-abc123")).toBe("sk-a***");
    expect(maskValue("123456789")).toBe("1234***");
  });

  it("handles exactly 6 chars", () => {
    expect(maskValue("abcdef")).toBe("abcd***");
  });
});

describe("maskSensitiveFields", () => {
  it("masks token fields", () => {
    const input = { gateway: { auth: { token: "super-secret-token-123" } } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const gateway = result.gateway as Record<string, unknown>;
    const auth = gateway.auth as Record<string, unknown>;
    expect(auth.token).toBe("supe***");
  });

  it("masks password fields", () => {
    const input = { gateway: { auth: { password: "my-password-123" } } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const gateway = result.gateway as Record<string, unknown>;
    const auth = gateway.auth as Record<string, unknown>;
    expect(auth.password).toBe("my-p***");
  });

  it("masks apiKey fields", () => {
    const input = { talk: { apiKey: "sk-1234567890" } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const talk = result.talk as Record<string, unknown>;
    expect(talk.apiKey).toBe("sk-1***");
  });

  it("masks botToken fields", () => {
    const input = { telegram: { botToken: "1234567890:ABCDefgh" } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const telegram = result.telegram as Record<string, unknown>;
    expect(telegram.botToken).toBe("1234***");
  });

  it("masks webhookSecret fields", () => {
    const input = { telegram: { webhookSecret: "webhook-secret-value" } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const telegram = result.telegram as Record<string, unknown>;
    expect(telegram.webhookSecret).toBe("webh***");
  });

  it("preserves non-sensitive fields", () => {
    const input = {
      gateway: {
        bind: "loopback",
        port: 18789,
        auth: { mode: "password", password: "secret123" },
      },
    };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const gateway = result.gateway as Record<string, unknown>;
    expect(gateway.bind).toBe("loopback");
    expect(gateway.port).toBe(18789);
    const auth = gateway.auth as Record<string, unknown>;
    expect(auth.mode).toBe("password");
    expect(auth.password).toBe("secr***");
  });

  it("masks fields in arrays", () => {
    const input = {
      providers: [
        { name: "openai", apiKey: "sk-proj-abc123456" },
        { name: "gemini", apiKey: "AIza-short" },
      ],
    };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const providers = result.providers as Array<Record<string, unknown>>;
    expect(providers[0].name).toBe("openai");
    expect(providers[0].apiKey).toBe("sk-p***");
    expect(providers[1].name).toBe("gemini");
    expect(providers[1].apiKey).toBe("AIza***");
  });

  it("handles null and undefined gracefully", () => {
    expect(maskSensitiveFields(null)).toBe(null);
    expect(maskSensitiveFields(undefined)).toBe(undefined);
  });

  it("handles empty objects", () => {
    expect(maskSensitiveFields({})).toEqual({});
  });

  it("does not mask empty string values", () => {
    const input = { gateway: { auth: { token: "" } } };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const gateway = result.gateway as Record<string, unknown>;
    const auth = gateway.auth as Record<string, unknown>;
    expect(auth.token).toBe("");
  });

  it("does not mutate the original object", () => {
    const input = { gateway: { auth: { token: "original-token" } } };
    maskSensitiveFields(input);
    expect(input.gateway.auth.token).toBe("original-token");
  });

  it("masks nested skill apiKeys", () => {
    const input = {
      skills: {
        entries: [{ name: "web-search", apiKey: "serp-api-key-12345" }],
      },
    };
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    const skills = result.skills as Record<string, unknown>;
    const entries = skills.entries as Array<Record<string, unknown>>;
    expect(entries[0].apiKey).toBe("serp***");
  });

  it("is case-insensitive for key matching", () => {
    const input = { Token: "my-token-value", PASSWORD: "my-pass" };
    // Our implementation lowercases keys for comparison
    // Note: JS object keys are case-sensitive, but our sensitive check is case-insensitive
    const result = maskSensitiveFields(input) as Record<string, unknown>;
    // "Token" lowercased = "token" which is in SENSITIVE_KEYS
    expect(result.Token).toBe("my-t***");
  });
});
