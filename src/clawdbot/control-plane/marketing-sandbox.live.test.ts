import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ControlPlaneService, resetControlPlaneServiceForTest } from "./service.js";

const LIVE_ENABLED = process.env.OPENCLAW_MARKETING_SANDBOX_E2E === "1";
const describeLive = LIVE_ENABLED ? describe : describe.skip;

function loadSandboxPlan(): Record<string, unknown> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    here,
    "../../../fixtures/api-responses/marketing-plan-sandbox.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

describeLive("marketing sandbox live flow", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousN8nBaseUrl = process.env.OPENCLAW_N8N_BASE_URL;
  let tempStateDir = "";

  beforeAll(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-marketing-live-"));
    process.env.OPENCLAW_STATE_DIR = tempStateDir;
    delete process.env.OPENCLAW_N8N_BASE_URL;
    resetControlPlaneServiceForTest();
  });

  afterAll(() => {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousN8nBaseUrl === undefined) {
      delete process.env.OPENCLAW_N8N_BASE_URL;
    } else {
      process.env.OPENCLAW_N8N_BASE_URL = previousN8nBaseUrl;
    }
    resetControlPlaneServiceForTest();
    fs.rmSync(tempStateDir, { recursive: true, force: true });
  });

  it("executes a sandbox plan and records telemetry + replay artifacts", async () => {
    const service = new ControlPlaneService();
    const actor = { id: "sandbox-operator", role: "admin" as const, scopes: ["operator.admin"] };

    const plan = {
      ...loadSandboxPlan(),
      accountId: process.env.OPENCLAW_MARKETING_SANDBOX_ACCOUNT_ID ?? "sandbox-account-123",
      mode: "live",
    };

    const result = await service.executeMarketingPlan(plan, actor);
    expect(result.ok).toBe(true);
    expect(result.run).toBeDefined();
    expect(["completed", "awaiting_approval"]).toContain(result.run?.state);
    expect((result.run?.telemetry.length ?? 0) > 0).toBe(true);
    expect((result.run?.replayTrace.length ?? 0) > 0).toBe(true);
  });

  it("captures replay data for forced failure scenarios", async () => {
    const service = new ControlPlaneService();
    const actor = { id: "sandbox-operator", role: "admin" as const, scopes: ["operator.admin"] };

    const asMutable = service as unknown as {
      browserAdapter: {
        probeSession: () => Promise<{
          ok: boolean;
          adapter: "browser";
          checkedAt: string;
          detail: string;
        }>;
      };
      cliAdapter: {
        probeSession: () => Promise<{
          ok: boolean;
          adapter: "cli";
          checkedAt: string;
          detail: string;
        }>;
        executeAction: () => Promise<{
          ok: boolean;
          actionId: string;
          adapter: "cli";
          accountId: string;
          errorCategory?:
            | "validation"
            | "auth"
            | "permission"
            | "rate_limit"
            | "timeout"
            | "unknown";
          errorMessage?: string;
          details: Record<string, unknown>;
        }>;
      };
    };

    asMutable.browserAdapter = {
      probeSession: async () => ({
        ok: true,
        adapter: "browser",
        checkedAt: new Date().toISOString(),
        detail: "ok",
      }),
    };
    asMutable.cliAdapter = {
      probeSession: async () => ({
        ok: true,
        adapter: "cli",
        checkedAt: new Date().toISOString(),
        detail: "ok",
      }),
      executeAction: async () => ({
        ok: false,
        actionId: "forced-failure",
        adapter: "cli",
        accountId: "sandbox-account-123",
        errorCategory: "unknown",
        errorMessage: "forced failure",
        details: { forced: true },
      }),
    };

    const plan = {
      ...loadSandboxPlan(),
      mode: "live",
      preferredAdapter: "cli",
    };

    const result = await service.executeMarketingPlan(plan, actor);
    expect(result.ok).toBe(true);
    expect(result.run?.state).toBe("failed");
    expect((result.run?.replayTrace.length ?? 0) > 0).toBe(true);
    expect(result.run?.telemetry.some((item) => item.status === "failed")).toBe(true);
  });
});
