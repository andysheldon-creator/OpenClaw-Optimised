import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDatabricksProvider,
  DATABRICKS_DEFAULT_MODEL_ID,
  resolveImplicitProviders,
} from "./models-config.providers.js";

describe("Databricks provider", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ["DATABRICKS_TOKEN", "DATABRICKS_API_KEY", "DATABRICKS_HOST"];

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

  it("should not include databricks when no API key is configured", async () => {
    saveAndClearEnv();
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks).toBeUndefined();
  });

  it("should not include databricks when API key is set but DATABRICKS_HOST is missing", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-test-token-123";
    // No DATABRICKS_HOST set
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    // Should not be added without a host URL
    expect(providers?.databricks).toBeUndefined();
  });

  it("should include databricks when both DATABRICKS_TOKEN and DATABRICKS_HOST are set", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-test-token-123";
    process.env.DATABRICKS_HOST = "https://my-workspace.cloud.databricks.com";
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks).toBeDefined();
    expect(providers?.databricks?.apiKey).toBe("DATABRICKS_TOKEN");
    expect(providers?.databricks?.baseUrl).toBe(
      "https://my-workspace.cloud.databricks.com/serving-endpoints",
    );
    expect(providers?.databricks?.api).toBe("openai-completions");
  });

  it("should include databricks with DATABRICKS_API_KEY fallback", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_API_KEY = "dapi-fallback-key";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks).toBeDefined();
    expect(providers?.databricks?.apiKey).toBe("DATABRICKS_API_KEY");
  });

  it("should normalize host URL that already ends with /serving-endpoints", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-test-token";
    process.env.DATABRICKS_HOST = "https://my-workspace.cloud.databricks.com/serving-endpoints";
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks?.baseUrl).toBe(
      "https://my-workspace.cloud.databricks.com/serving-endpoints",
    );
  });

  it("should strip trailing slashes from host URL", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-test-token";
    process.env.DATABRICKS_HOST = "https://my-workspace.cloud.databricks.com/";
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks?.baseUrl).toBe(
      "https://my-workspace.cloud.databricks.com/serving-endpoints",
    );
  });

  it("should prefer DATABRICKS_TOKEN over DATABRICKS_API_KEY", async () => {
    saveAndClearEnv();
    process.env.DATABRICKS_TOKEN = "dapi-pat-token";
    process.env.DATABRICKS_API_KEY = "dapi-api-key";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.databricks).toBeDefined();
    // DATABRICKS_TOKEN should take precedence
    expect(providers?.databricks?.apiKey).toBe("DATABRICKS_TOKEN");
  });
});

describe("buildDatabricksProvider", () => {
  it("should return a valid provider config with correct base URL", () => {
    const baseUrl = "https://workspace.cloud.databricks.com/serving-endpoints";
    const provider = buildDatabricksProvider(baseUrl);

    expect(provider.baseUrl).toBe(baseUrl);
    expect(provider.api).toBe("openai-completions");
    expect(provider.models).toHaveLength(3);
  });

  it("should include default model IDs", () => {
    const provider = buildDatabricksProvider("https://test.cloud.databricks.com/serving-endpoints");

    const modelIds = provider.models.map((m) => m.id);
    expect(modelIds).toContain(DATABRICKS_DEFAULT_MODEL_ID);
    expect(modelIds).toContain("databricks-dbrx-instruct");
    expect(modelIds).toContain("databricks-mixtral-8x7b-instruct");
  });

  it("should set all models to text input only", () => {
    const provider = buildDatabricksProvider("https://test.cloud.databricks.com/serving-endpoints");

    for (const model of provider.models) {
      expect(model.input).toEqual(["text"]);
      expect(model.reasoning).toBe(false);
    }
  });

  it("should set zero costs (pay-per-use via Databricks billing)", () => {
    const provider = buildDatabricksProvider("https://test.cloud.databricks.com/serving-endpoints");

    for (const model of provider.models) {
      expect(model.cost.input).toBe(0);
      expect(model.cost.output).toBe(0);
      expect(model.cost.cacheRead).toBe(0);
      expect(model.cost.cacheWrite).toBe(0);
    }
  });
});
