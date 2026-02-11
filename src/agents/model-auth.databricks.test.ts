import { afterEach, describe, expect, it } from "vitest";
import { resolveEnvApiKey, resolveModelAuthMode } from "./model-auth.js";

describe("resolveEnvApiKey for databricks", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "DATABRICKS_TOKEN",
    "DATABRICKS_API_KEY",
    "DATABRICKS_CLIENT_ID",
    "DATABRICKS_CLIENT_SECRET",
    "DATABRICKS_HOST",
  ];

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  it("should return null when no Databricks env vars are set", () => {
    saveAndClearEnv();
    const result = resolveEnvApiKey("databricks");
    expect(result).toBeNull();
  });

  it("should resolve DATABRICKS_TOKEN when set", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-test-token-123";
    const result = resolveEnvApiKey("databricks");
    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe("dapi-test-token-123");
    expect(result?.source).toContain("DATABRICKS_TOKEN");
  });

  it("should resolve DATABRICKS_API_KEY as fallback", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_API_KEY = "dapi-api-key-456";
    const result = resolveEnvApiKey("databricks");
    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe("dapi-api-key-456");
    expect(result?.source).toContain("DATABRICKS_API_KEY");
  });

  it("should prefer DATABRICKS_TOKEN over DATABRICKS_API_KEY", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-pat-preferred";
    process.env.DATABRICKS_API_KEY = "dapi-api-fallback";
    const result = resolveEnvApiKey("databricks");
    expect(result).not.toBeNull();
    expect(result?.apiKey).toBe("dapi-pat-preferred");
    expect(result?.source).toContain("DATABRICKS_TOKEN");
  });

  it("should handle whitespace-only values as unset", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "   ";
    const result = resolveEnvApiKey("databricks");
    // normalizeOptionalSecretInput trims whitespace, so empty => null
    expect(result).toBeNull();
  });
});

describe("resolveModelAuthMode for databricks", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "DATABRICKS_TOKEN",
    "DATABRICKS_API_KEY",
    "DATABRICKS_CLIENT_ID",
    "DATABRICKS_CLIENT_SECRET",
    "DATABRICKS_HOST",
  ];

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  function saveAndClearEnv() {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }

  it("should return unknown when no databricks env vars are set", () => {
    saveAndClearEnv();
    expect(resolveModelAuthMode("databricks")).toBe("unknown");
  });

  it("should return api-key when DATABRICKS_TOKEN is set", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-pat-token";
    expect(resolveModelAuthMode("databricks")).toBe("api-key");
  });

  it("should return oauth when service principal env vars are set", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_CLIENT_ID = "sp-client-id";
    process.env.DATABRICKS_CLIENT_SECRET = "sp-secret";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    expect(resolveModelAuthMode("databricks")).toBe("oauth");
  });

  it("should prefer PAT token (api-key) when both PAT and SP are set", () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-pat-token";
    process.env.DATABRICKS_CLIENT_ID = "sp-client-id";
    process.env.DATABRICKS_CLIENT_SECRET = "sp-secret";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    // PAT is found first by resolveEnvApiKey, so mode is api-key
    expect(resolveModelAuthMode("databricks")).toBe("api-key");
  });
});
