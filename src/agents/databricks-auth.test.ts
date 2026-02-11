import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDatabricksTokenCache,
  exchangeDatabricksServicePrincipalToken,
  hasDatabricksServicePrincipalEnv,
  resolveDatabricksServicePrincipalEnv,
} from "./databricks-auth.js";

describe("resolveDatabricksServicePrincipalEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ["DATABRICKS_CLIENT_ID", "DATABRICKS_CLIENT_SECRET", "DATABRICKS_HOST"];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns null when no env vars are set", () => {
    expect(resolveDatabricksServicePrincipalEnv()).toBeNull();
  });

  it("returns null when only client_id is set", () => {
    process.env.DATABRICKS_CLIENT_ID = "test-client-id";
    expect(resolveDatabricksServicePrincipalEnv()).toBeNull();
  });

  it("returns null when only client_id and secret are set (no host)", () => {
    process.env.DATABRICKS_CLIENT_ID = "test-client-id";
    process.env.DATABRICKS_CLIENT_SECRET = "test-secret";
    expect(resolveDatabricksServicePrincipalEnv()).toBeNull();
  });

  it("returns config when all three env vars are set", () => {
    process.env.DATABRICKS_CLIENT_ID = "test-client-id";
    process.env.DATABRICKS_CLIENT_SECRET = "test-secret";
    process.env.DATABRICKS_HOST = "https://my-workspace.cloud.databricks.com";

    const result = resolveDatabricksServicePrincipalEnv();
    expect(result).not.toBeNull();
    expect(result?.clientId).toBe("test-client-id");
    expect(result?.clientSecret).toBe("test-secret");
    expect(result?.workspaceUrl).toBe("https://my-workspace.cloud.databricks.com");
  });

  it("strips trailing slashes from host URL", () => {
    process.env.DATABRICKS_CLIENT_ID = "test-client-id";
    process.env.DATABRICKS_CLIENT_SECRET = "test-secret";
    process.env.DATABRICKS_HOST = "https://my-workspace.cloud.databricks.com///";

    const result = resolveDatabricksServicePrincipalEnv();
    expect(result?.workspaceUrl).toBe("https://my-workspace.cloud.databricks.com");
  });

  it("trims whitespace from all values", () => {
    process.env.DATABRICKS_CLIENT_ID = "  test-client-id  ";
    process.env.DATABRICKS_CLIENT_SECRET = "  test-secret  ";
    process.env.DATABRICKS_HOST = "  https://workspace.cloud.databricks.com  ";

    const result = resolveDatabricksServicePrincipalEnv();
    expect(result?.clientId).toBe("test-client-id");
    expect(result?.clientSecret).toBe("test-secret");
    expect(result?.workspaceUrl).toBe("https://workspace.cloud.databricks.com");
  });

  it("returns null when values are whitespace-only", () => {
    process.env.DATABRICKS_CLIENT_ID = "   ";
    process.env.DATABRICKS_CLIENT_SECRET = "test-secret";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    expect(resolveDatabricksServicePrincipalEnv()).toBeNull();
  });

  it("accepts explicit env parameter", () => {
    const env = {
      DATABRICKS_CLIENT_ID: "custom-id",
      DATABRICKS_CLIENT_SECRET: "custom-secret",
      DATABRICKS_HOST: "https://custom.cloud.databricks.com",
    } as NodeJS.ProcessEnv;

    const result = resolveDatabricksServicePrincipalEnv(env);
    expect(result?.clientId).toBe("custom-id");
    expect(result?.workspaceUrl).toBe("https://custom.cloud.databricks.com");
  });
});

describe("hasDatabricksServicePrincipalEnv", () => {
  afterEach(() => {
    delete process.env.DATABRICKS_CLIENT_ID;
    delete process.env.DATABRICKS_CLIENT_SECRET;
    delete process.env.DATABRICKS_HOST;
  });

  it("returns false when env vars are not set", () => {
    expect(hasDatabricksServicePrincipalEnv()).toBe(false);
  });

  it("returns true when all env vars are set", () => {
    process.env.DATABRICKS_CLIENT_ID = "id";
    process.env.DATABRICKS_CLIENT_SECRET = "secret";
    process.env.DATABRICKS_HOST = "https://workspace.cloud.databricks.com";
    expect(hasDatabricksServicePrincipalEnv()).toBe(true);
  });
});

describe("exchangeDatabricksServicePrincipalToken", () => {
  beforeEach(() => {
    clearDatabricksTokenCache();
  });

  afterEach(() => {
    clearDatabricksTokenCache();
    vi.restoreAllMocks();
  });

  it("exchanges client credentials for an access token", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "dapi-exchanged-token-123",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    const token = await exchangeDatabricksServicePrincipalToken({
      workspaceUrl: "https://my-workspace.cloud.databricks.com",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    });

    expect(token).toBe("dapi-exchanged-token-123");

    // Verify the fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith(
      "https://my-workspace.cloud.databricks.com/oidc/v1/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: "grant_type=client_credentials&scope=all-apis",
      }),
    );

    // Verify Basic auth header
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const headers = (callArgs?.[1] as RequestInit)?.headers as Record<string, string>;
    const expectedBasic = Buffer.from("test-client-id:test-client-secret").toString("base64");
    expect(headers.Authorization).toBe(`Basic ${expectedBasic}`);
  });

  it("caches the token for subsequent calls", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "dapi-cached-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const config = {
      workspaceUrl: "https://workspace.cloud.databricks.com",
      clientId: "id",
      clientSecret: "secret",
    };

    const token1 = await exchangeDatabricksServicePrincipalToken(config);
    const token2 = await exchangeDatabricksServicePrincipalToken(config);

    expect(token1).toBe("dapi-cached-token");
    expect(token2).toBe("dapi-cached-token");
    // Should only call fetch once due to caching
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws on non-OK response", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => '{"error": "invalid_client"}',
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    await expect(
      exchangeDatabricksServicePrincipalToken({
        workspaceUrl: "https://workspace.cloud.databricks.com",
        clientId: "bad-id",
        clientSecret: "bad-secret",
      }),
    ).rejects.toThrow("Databricks OAuth token exchange failed (401)");
  });

  it("throws when response is missing access_token", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ token_type: "Bearer" }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse as Response);

    await expect(
      exchangeDatabricksServicePrincipalToken({
        workspaceUrl: "https://workspace.cloud.databricks.com",
        clientId: "id",
        clientSecret: "secret",
      }),
    ).rejects.toThrow("Databricks OAuth response missing access_token");
  });

  it("handles missing expires_in with default TTL", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "dapi-no-expiry-token",
        token_type: "Bearer",
        // No expires_in field — should default to 3600
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const token = await exchangeDatabricksServicePrincipalToken({
      workspaceUrl: "https://workspace.cloud.databricks.com",
      clientId: "id",
      clientSecret: "secret",
    });

    expect(token).toBe("dapi-no-expiry-token");

    // Second call should still use cache (token defaults to 1hr TTL)
    const token2 = await exchangeDatabricksServicePrincipalToken({
      workspaceUrl: "https://workspace.cloud.databricks.com",
      clientId: "id",
      clientSecret: "secret",
    });
    expect(token2).toBe("dapi-no-expiry-token");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clearDatabricksTokenCache forces a re-exchange", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "dapi-first-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as Response);

    const config = {
      workspaceUrl: "https://workspace.cloud.databricks.com",
      clientId: "id",
      clientSecret: "secret",
    };

    await exchangeDatabricksServicePrincipalToken(config);
    expect(fetch).toHaveBeenCalledTimes(1);

    clearDatabricksTokenCache();

    await exchangeDatabricksServicePrincipalToken(config);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
