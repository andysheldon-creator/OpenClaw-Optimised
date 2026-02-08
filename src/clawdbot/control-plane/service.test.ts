import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ControlPlaneService, resetControlPlaneServiceForTest } from "./service.js";

type ProbeResult = {
  ok: boolean;
  adapter: "browser" | "cli";
  accountId?: string;
  checkedAt: string;
  detail: string;
};

function loadSandboxPlan(): Record<string, unknown> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    here,
    "../../../fixtures/api-responses/marketing-plan-sandbox.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

describe.sequential("control-plane service", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousN8nBaseUrl = process.env.OPENCLAW_N8N_BASE_URL;
  const previousN8nApiKey = process.env.OPENCLAW_N8N_API_KEY;
  let tempStateDir = "";

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-control-plane-"));
    process.env.OPENCLAW_STATE_DIR = tempStateDir;
    delete process.env.OPENCLAW_N8N_BASE_URL;
    delete process.env.OPENCLAW_N8N_API_KEY;
    resetControlPlaneServiceForTest();
  });

  afterEach(() => {
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
    if (previousN8nApiKey === undefined) {
      delete process.env.OPENCLAW_N8N_API_KEY;
    } else {
      process.env.OPENCLAW_N8N_API_KEY = previousN8nApiKey;
    }
    resetControlPlaneServiceForTest();
    fs.rmSync(tempStateDir, { recursive: true, force: true });
  });

  it("dedupes repeated plan executions via fingerprint ledger", async () => {
    const service = new ControlPlaneService();
    const actor = { id: "ops-admin", role: "admin" as const, scopes: ["operator.admin"] };
    const plan = {
      ...loadSandboxPlan(),
      mode: "dry-run",
      preferredAdapter: "cli",
    };

    const first = await service.executeMarketingPlan(plan, actor);
    expect(first.ok).toBe(true);
    expect(first.run?.state).toBe("completed");

    const second = await service.executeMarketingPlan(plan, actor);
    expect(second.ok).toBe(true);
    expect(second.run?.state).toBe("completed");

    const dedupedStep = second.run?.steps.find((step) => {
      const result = step.result as { deduped?: boolean } | undefined;
      return result?.deduped === true;
    });
    expect(dedupedStep).toBeDefined();

    const snapshot = await service.getDashboardSnapshot();
    expect(snapshot.runs.length).toBe(2);
  });

  it("blocks live execution when a required adapter preflight fails", async () => {
    const service = new ControlPlaneService();
    const actor = { id: "ops-admin", role: "admin" as const, scopes: ["operator.admin"] };

    const browserProbe: ProbeResult = {
      ok: true,
      adapter: "browser",
      checkedAt: new Date().toISOString(),
      detail: "ok",
    };
    const cliProbe: ProbeResult = {
      ok: false,
      adapter: "cli",
      checkedAt: new Date().toISOString(),
      detail: "cli auth missing",
    };

    const asMutable = service as unknown as {
      browserAdapter: {
        probeSession: (accountId?: string) => Promise<ProbeResult>;
      };
      cliAdapter: {
        probeSession: (accountId?: string) => Promise<ProbeResult>;
      };
    };
    asMutable.browserAdapter = {
      probeSession: async () => browserProbe,
    };
    asMutable.cliAdapter = {
      probeSession: async () => cliProbe,
    };

    const plan = {
      ...loadSandboxPlan(),
      mode: "live",
      preferredAdapter: "cli",
    };

    const result = await service.executeMarketingPlan(plan, actor);
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]).toContain("readiness guard");
    expect(result.errors?.join(" ")).toContain("cli adapter unavailable");
  });

  it("backfill migration is idempotent across reruns", async () => {
    const service = new ControlPlaneService();
    const actor = { id: "ops-admin", role: "admin" as const, scopes: ["operator.admin"] };

    const first = await service.backfillMetadata(actor);
    const second = await service.backfillMetadata(actor);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.createdSkills).toBe(0);
    expect(second.createdWorkflows).toBe(0);
  });

  it("denies lifecycle mutation attempts from viewer role", async () => {
    const service = new ControlPlaneService();
    const snapshot = await service.getDashboardSnapshot();
    const targetSkill = snapshot.skills[0];

    expect(targetSkill).toBeDefined();
    if (!targetSkill) {
      throw new Error("Expected at least one skill in snapshot inventory.");
    }

    const result = await service.mutateSkill(
      {
        skillId: targetSkill.id,
        action: "skill.disable",
        reason: "viewer test should fail",
      },
      {
        id: "viewer-user",
        role: "viewer",
        scopes: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Viewer role cannot mutate");
  });
});
