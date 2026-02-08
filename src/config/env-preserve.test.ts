import { describe, it, expect } from "vitest";
import { restoreEnvVarRefs } from "./env-preserve.js";

describe("restoreEnvVarRefs", () => {
  const env = {
    ANTHROPIC_API_KEY: "sk-ant-api03-real-key",
    OPENAI_API_KEY: "sk-openai-real-key",
    MY_TOKEN: "tok-12345",
  } as unknown as NodeJS.ProcessEnv;

  it("restores a simple ${VAR} reference when value matches", () => {
    const incoming = { apiKey: "sk-ant-api03-real-key" };
    const parsed = { apiKey: "${ANTHROPIC_API_KEY}" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ apiKey: "${ANTHROPIC_API_KEY}" });
  });

  it("keeps new value when caller intentionally changed it", () => {
    const incoming = { apiKey: "sk-ant-new-different-key" };
    const parsed = { apiKey: "${ANTHROPIC_API_KEY}" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ apiKey: "sk-ant-new-different-key" });
  });

  it("handles nested objects", () => {
    const incoming = {
      models: {
        providers: {
          anthropic: { apiKey: "sk-ant-api03-real-key" },
          openai: { apiKey: "sk-openai-real-key" },
        },
      },
    };
    const parsed = {
      models: {
        providers: {
          anthropic: { apiKey: "${ANTHROPIC_API_KEY}" },
          openai: { apiKey: "${OPENAI_API_KEY}" },
        },
      },
    };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({
      models: {
        providers: {
          anthropic: { apiKey: "${ANTHROPIC_API_KEY}" },
          openai: { apiKey: "${OPENAI_API_KEY}" },
        },
      },
    });
  });

  it("preserves new keys not in parsed", () => {
    const incoming = { apiKey: "sk-ant-api03-real-key", newField: "hello" };
    const parsed = { apiKey: "${ANTHROPIC_API_KEY}" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ apiKey: "${ANTHROPIC_API_KEY}", newField: "hello" });
  });

  it("handles non-env-var strings (no restoration needed)", () => {
    const incoming = { name: "my-config" };
    const parsed = { name: "my-config" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ name: "my-config" });
  });

  it("handles arrays", () => {
    const incoming = ["sk-ant-api03-real-key", "literal"];
    const parsed = ["${ANTHROPIC_API_KEY}", "literal"];
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual(["${ANTHROPIC_API_KEY}", "literal"]);
  });

  it("handles null/undefined parsed gracefully", () => {
    const incoming = { apiKey: "sk-ant-api03-real-key" };
    expect(restoreEnvVarRefs(incoming, null, env)).toEqual(incoming);
    expect(restoreEnvVarRefs(incoming, undefined, env)).toEqual(incoming);
  });

  it("handles missing env var (cannot verify match)", () => {
    const envMissing = {} as unknown as NodeJS.ProcessEnv;
    const incoming = { apiKey: "some-value" };
    const parsed = { apiKey: "${MISSING_VAR}" };
    // Can't resolve the template, so keep incoming as-is
    const result = restoreEnvVarRefs(incoming, parsed, envMissing);
    expect(result).toEqual({ apiKey: "some-value" });
  });

  it("handles composite template strings like prefix-${VAR}-suffix", () => {
    const incoming = { url: "https://tok-12345.example.com" };
    const parsed = { url: "https://${MY_TOKEN}.example.com" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ url: "https://${MY_TOKEN}.example.com" });
  });

  it("handles type mismatches between incoming and parsed", () => {
    // Caller changed type from string to number
    const incoming = { port: 8080 };
    const parsed = { port: "8080" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ port: 8080 });
  });

  it("does not restore when parsed value has no env var pattern", () => {
    const incoming = { apiKey: "sk-ant-api03-real-key" };
    const parsed = { apiKey: "sk-ant-api03-real-key" };
    const result = restoreEnvVarRefs(incoming, parsed, env);
    expect(result).toEqual({ apiKey: "sk-ant-api03-real-key" });
  });
});
