import { describe, expect, it } from "vitest";
import { redactText, redactValue, sanitizeForPersistence } from "./sanitize.js";

describe("redactText", () => {
  it("redacts API keys in ENV-style assignments", () => {
    const input = "MY_API_KEY=sk-abc123def456ghi789jkl012mno345pqr678";
    const result = redactText(input);
    expect(result).not.toContain("sk-abc123def456ghi789jkl012mno345pqr678");
    // Token is masked (first 6 + last 4 chars) not fully redacted
    expect(result).toContain("…");
  });

  it("redacts OpenAI-style sk- tokens", () => {
    const input = "token is sk-abcdefghijklmnop";
    const result = redactText(input);
    expect(result).not.toContain("sk-abcdefghijklmnop");
  });

  it("redacts GitHub PATs", () => {
    const input = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const result = redactText(input);
    expect(result).not.toContain("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123";
    const result = redactText(input);
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123");
  });

  it("redacts PEM private key blocks", () => {
    const input = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWi",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const result = redactText(input);
    expect(result).toContain("…redacted…");
    expect(result).not.toContain("MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWi");
  });

  it("redacts JSON sensitive fields", () => {
    const input = '"apiKey": "my-super-secret-api-key-value"';
    const result = redactText(input);
    expect(result).not.toContain("my-super-secret-api-key-value");
  });

  it("redacts Slack tokens", () => {
    const input = "xoxb-123456789-abcdefghij";
    const result = redactText(input);
    expect(result).not.toContain("xoxb-123456789-abcdefghij");
  });

  it("redacts password assignments fully", () => {
    const input = "PASSWORD=mysecretpassword123";
    const result = redactText(input);
    expect(result).toContain("***");
    expect(result).not.toContain("mysecretpassword123");
  });

  it("returns empty string for empty input", () => {
    expect(redactText("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    const input = "Hello world, no secrets here";
    expect(redactText(input)).toBe(input);
  });
});

describe("redactValue", () => {
  it("redacts sensitive keys in objects", () => {
    const input = { apiKey: "sk-abc123def456ghi789jkl012mno", name: "test" };
    const result = redactValue(input) as Record<string, unknown>;
    expect(result.name).toBe("test");
    expect(result.apiKey).not.toBe("sk-abc123def456ghi789jkl012mno");
  });

  it("redacts password keys fully", () => {
    const input = { password: "hunter2", user: "admin" };
    const result = redactValue(input) as Record<string, unknown>;
    expect(result.password).toBe("***");
    expect(result.user).toBe("admin");
  });

  it("handles nested objects", () => {
    const input = {
      config: { credentials: { token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" } },
    };
    const result = redactValue(input) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result.config.credentials.token).not.toBe("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("handles arrays", () => {
    const input = ["normal", "sk-abcdefghijklmnop"];
    const result = redactValue(input) as string[];
    expect(result[0]).toBe("normal");
    expect(result[1]).not.toBe("sk-abcdefghijklmnop");
  });

  it("preserves null and undefined values in sensitive keys", () => {
    const input = { token: null, secret: undefined };
    const result = redactValue(input) as Record<string, unknown>;
    expect(result.token).toBeNull();
    // undefined values in sensitive keys are treated as null
    expect(result.secret).toBeUndefined();
  });

  it("handles numbers and booleans", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;
    const result = redactValue(obj) as Record<string, unknown>;
    expect(result.name).toBe("test");
    expect(result.self).toBe("[Circular]");
  });
});

describe("sanitizeForPersistence", () => {
  it("redacts by default", () => {
    const input = { token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" };
    const result = sanitizeForPersistence(input) as Record<string, unknown>;
    expect(result.token).not.toBe("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("passes through when disabled", () => {
    const input = { token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" };
    const result = sanitizeForPersistence(input, { enabled: false });
    expect(result).toBe(input);
  });

  it("handles string input", () => {
    const input = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123def456ghi789";
    const result = sanitizeForPersistence(input) as string;
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123def456ghi789");
  });
});
