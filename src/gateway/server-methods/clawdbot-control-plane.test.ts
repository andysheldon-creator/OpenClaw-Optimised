import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetControlPlaneServiceForTest } from "../../clawdbot/control-plane/index.js";
import { clawdbotControlPlaneHandlers } from "./clawdbot-control-plane.js";

function loadSandboxPlan(): Record<string, unknown> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    here,
    "../../../fixtures/api-responses/marketing-plan-sandbox.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

type HandlerName = keyof typeof clawdbotControlPlaneHandlers;

async function invoke(method: HandlerName, params: unknown, client?: unknown) {
  const respond = vi.fn();
  const handler = clawdbotControlPlaneHandlers[method];
  await handler({
    params,
    respond,
    client: (client ?? null) as never,
  } as never);
  const [ok, data, err] = respond.mock.calls[0] as [boolean, unknown, unknown];
  return { ok, data, err };
}

describe.sequential("gateway clawdbot control-plane handlers", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousN8nBaseUrl = process.env.OPENCLAW_N8N_BASE_URL;
  let tempStateDir = "";

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-gateway-control-plane-"));
    process.env.OPENCLAW_STATE_DIR = tempStateDir;
    delete process.env.OPENCLAW_N8N_BASE_URL;
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
    resetControlPlaneServiceForTest();
    fs.rmSync(tempStateDir, { recursive: true, force: true });
  });

  it("serves dashboard snapshot and inventory query surfaces", async () => {
    const snapshot = await invoke("clawdbot.snapshot", {});
    expect(snapshot.ok).toBe(true);

    const body = snapshot.data as {
      runs: unknown[];
      approvals: unknown[];
      skills: unknown[];
      workflows: unknown[];
    };

    expect(Array.isArray(body.runs)).toBe(true);
    expect(Array.isArray(body.approvals)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(Array.isArray(body.workflows)).toBe(true);

    const skillInventory = await invoke("clawdbot.skills.inventory", {});
    expect(skillInventory.ok).toBe(true);
    expect(Array.isArray((skillInventory.data as { skills: unknown[] }).skills)).toBe(true);

    const workflowInventory = await invoke("clawdbot.workflows.inventory", {});
    expect(workflowInventory.ok).toBe(true);
    expect(Array.isArray((workflowInventory.data as { workflows: unknown[] }).workflows)).toBe(
      true,
    );
  });

  it("rejects invalid run detail requests", async () => {
    const missingRunId = await invoke("clawdbot.runs.get", {});
    expect(missingRunId.ok).toBe(false);

    const err = missingRunId.err as { code: number; message: string };
    expect(err.message).toContain("runId is required");
  });

  it("supports compile and run query flow for marketing plans", async () => {
    const adminClient = {
      connect: {
        scopes: ["operator.admin"],
        client: { id: "test-admin", displayName: "test-admin" },
      },
    };

    const plan = {
      ...loadSandboxPlan(),
      mode: "dry-run",
      preferredAdapter: "cli",
    };

    const compile = await invoke("clawdbot.marketing.compile", { plan }, adminClient);
    expect(compile.ok).toBe(true);
    expect((compile.data as { valid: boolean }).valid).toBe(true);

    const run = await invoke("clawdbot.marketing.execute", { plan }, adminClient);
    expect(run.ok).toBe(true);
    const runData = run.data as { run?: { id: string } };
    expect(runData.run?.id).toBeTruthy();

    const runsList = await invoke("clawdbot.runs.list", {});
    expect(runsList.ok).toBe(true);
    const list = (runsList.data as { runs: Array<{ id: string }> }).runs;
    expect(list.length).toBeGreaterThan(0);

    const runDetail = await invoke("clawdbot.runs.get", { runId: list[0]?.id });
    expect(runDetail.ok).toBe(true);
    expect((runDetail.data as { run: { id: string } }).run.id).toBe(list[0]?.id);
  });
});
