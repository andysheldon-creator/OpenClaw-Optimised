import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ControlPlaneService, resetControlPlaneServiceForTest } from "./service.js";

function loadOperatorFlowFixture(): {
  skillMutation: { action: "skill.pin"; reason: string; pinnedVersion: string };
  workflowMutation: { action: "workflow.activate"; reason: string };
  workflowRun: { action: "workflow.run"; reason: string };
  deniedMutation: { action: "workflow.pause"; reason: string };
} {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    here,
    "../../../fixtures/api-responses/control-plane-operator-flow.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    skillMutation: { action: "skill.pin"; reason: string; pinnedVersion: string };
    workflowMutation: { action: "workflow.activate"; reason: string };
    workflowRun: { action: "workflow.run"; reason: string };
    deniedMutation: { action: "workflow.pause"; reason: string };
  };
}

describe.sequential("dashboard operator control-plane flow", () => {
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousN8nBaseUrl = process.env.OPENCLAW_N8N_BASE_URL;
  let tempStateDir = "";

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-operator-flow-"));
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

  it("supports lifecycle mutation, workflow run, and denied viewer path", async () => {
    const fixture = loadOperatorFlowFixture();
    const service = new ControlPlaneService();

    const operator = {
      id: "operator-flow",
      role: "operator" as const,
      scopes: ["operator.write"],
    };
    const viewer = {
      id: "viewer-flow",
      role: "viewer" as const,
      scopes: [],
    };

    await service.backfillMetadata({
      id: "seed-admin",
      role: "admin",
      scopes: ["operator.admin"],
    });

    const snapshot = await service.getDashboardSnapshot();
    const skill = snapshot.skills[0];
    const workflow = snapshot.workflows[0];

    expect(skill).toBeDefined();
    expect(workflow).toBeDefined();
    if (!skill || !workflow) {
      throw new Error("Expected non-empty skill and workflow inventories for operator flow test.");
    }

    const skillMutation = await service.mutateSkill(
      {
        skillId: skill.id,
        action: fixture.skillMutation.action,
        reason: fixture.skillMutation.reason,
        pinnedVersion: fixture.skillMutation.pinnedVersion,
      },
      operator,
    );

    expect(skillMutation.ok).toBe(true);

    const workflowMutation = await service.mutateWorkflow(
      {
        workflowId: workflow.id,
        action: fixture.workflowMutation.action,
        reason: fixture.workflowMutation.reason,
      },
      operator,
    );

    expect(workflowMutation.ok).toBe(true);

    const workflowRun = await service.mutateWorkflow(
      {
        workflowId: workflow.id,
        action: fixture.workflowRun.action,
        reason: fixture.workflowRun.reason,
      },
      operator,
    );

    expect(workflowRun.ok).toBe(true);

    const denied = await service.mutateWorkflow(
      {
        workflowId: workflow.id,
        action: fixture.deniedMutation.action,
        reason: fixture.deniedMutation.reason,
      },
      viewer,
    );

    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("Viewer role cannot mutate");

    const runs = await service.listRuns();
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]?.state).toBe("completed");
  });
});
