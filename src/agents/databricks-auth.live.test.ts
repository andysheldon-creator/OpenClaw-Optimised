/**
 * Live integration test for Databricks service principal OAuth token exchange.
 *
 * Requires real credentials exported in the environment:
 *   export DATABRICKS_CLIENT_ID="your-client-id"
 *   export DATABRICKS_CLIENT_SECRET="your-client-secret"
 *   export DATABRICKS_HOST="https://your-workspace.cloud.databricks.com"
 *
 * Run with: LIVE=1 npx vitest run src/agents/databricks-auth.live.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabricksTokenCache,
  exchangeDatabricksServicePrincipalToken,
  resolveDatabricksServicePrincipalEnv,
} from "./databricks-auth.js";

const isLive = process.env.LIVE === "1" || process.env.CLAWDBOT_LIVE_TEST === "1";

describe.skipIf(!isLive)("Databricks service principal (LIVE)", () => {
  beforeEach(() => {
    clearDatabricksTokenCache();
  });

  afterEach(() => {
    clearDatabricksTokenCache();
  });

  it("resolves service principal config from env", () => {
    const config = resolveDatabricksServicePrincipalEnv();
    expect(config).not.toBeNull();
    expect(config!.clientId).toBeTruthy();
    expect(config!.clientSecret).toBeTruthy();
    expect(config!.workspaceUrl).toMatch(/^https:\/\//);
    console.log(`  Workspace: ${config!.workspaceUrl}`);
    console.log(`  Client ID: ${config!.clientId.slice(0, 8)}...`);
  });

  it("exchanges client credentials for a real access token", async () => {
    const config = resolveDatabricksServicePrincipalEnv();
    expect(config).not.toBeNull();

    const token = await exchangeDatabricksServicePrincipalToken(config!);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    console.log(`  Token obtained: ${token.slice(0, 12)}... (${token.length} chars)`);
  });

  it("returns cached token on second call", async () => {
    const config = resolveDatabricksServicePrincipalEnv();
    expect(config).not.toBeNull();

    const token1 = await exchangeDatabricksServicePrincipalToken(config!);
    const token2 = await exchangeDatabricksServicePrincipalToken(config!);

    expect(token1).toBe(token2);
    console.log("  Cache hit confirmed: second call returned same token");
  });

  it("can use the token to call a serving endpoint (smoke test)", async () => {
    const config = resolveDatabricksServicePrincipalEnv();
    expect(config).not.toBeNull();

    const token = await exchangeDatabricksServicePrincipalToken(config!);

    // Try listing serving endpoints — this is a lightweight API call that
    // validates the token works against the Databricks workspace.
    const response = await fetch(`${config!.workspaceUrl}/api/2.0/serving-endpoints`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    // 200 = success, 403 = token works but SP lacks permissions (still valid auth)
    expect([200, 403]).toContain(response.status);
    console.log(`  Serving endpoints API: ${response.status} ${response.statusText}`);

    if (response.status === 200) {
      const data = (await response.json()) as { endpoints?: Array<{ name: string }> };
      const count = data.endpoints?.length ?? 0;
      console.log(`  Found ${count} serving endpoint(s)`);
      if (data.endpoints && data.endpoints.length > 0) {
        for (const ep of data.endpoints.slice(0, 5)) {
          console.log(`    - ${ep.name}`);
        }
        if (data.endpoints.length > 5) {
          console.log(`    ... and ${data.endpoints.length - 5} more`);
        }
      }
    }
  });
});
