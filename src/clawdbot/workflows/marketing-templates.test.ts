import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type WorkflowTemplate = {
  name: string;
  area: string;
  version: string;
  nodes: Array<{ id: string; type: string; parameters?: Record<string, unknown> }>;
};

function getStringParameter(
  parameters: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = parameters?.[key];
  return typeof value === "string" ? value : undefined;
}

function loadTemplate(relativePath: string): WorkflowTemplate {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fullPath = path.resolve(here, "../../../workflows/templates", relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as WorkflowTemplate;
}

describe("marketing workflow templates", () => {
  it("includes a dry-run template with no mutation executor nodes", () => {
    const template = loadTemplate("marketing/marketing-plan-dry-run.json");

    expect(template.area).toBe("marketing");
    expect(template.version).toBe("1.0.0");

    const skillNodes = template.nodes.filter(
      (node) => node.type === "n8n-nodes-clawdbot.clawdbotSkill",
    );
    const skillNames = skillNodes
      .map((node) => getStringParameter(node.parameters, "skillName") ?? "")
      .filter((name) => name.length > 0);

    expect(skillNames).toContain("marketing-plan-compiler");
    expect(skillNames).not.toContain("google-ads-browser");
    expect(skillNames).not.toContain("google-ads-cli");

    const hasArtifactNode = template.nodes.some(
      (node) => node.type === "n8n-nodes-clawdbot.clawdbotArtifact",
    );
    expect(hasArtifactNode).toBe(true);
  });

  it("includes a live template with adapter branching, retry, escalation, and artifact storage", () => {
    const template = loadTemplate("marketing/marketing-plan-live-execution.json");

    expect(template.area).toBe("marketing");
    expect(template.version).toBe("1.0.0");

    const skillNames = template.nodes
      .filter((node) => node.type === "n8n-nodes-clawdbot.clawdbotSkill")
      .map((node) => getStringParameter(node.parameters, "skillName") ?? "");

    expect(skillNames).toContain("google-ads-browser");
    expect(skillNames).toContain("google-ads-cli");
    expect(skillNames).toContain("mutation-ledger-upsert");
    expect(skillNames).toContain("marketing-reconcile");

    const hasRetryWait = template.nodes.some((node) => node.type === "n8n-nodes-base.wait");
    const hasEscalationGate = template.nodes.some(
      (node) =>
        node.type === "n8n-nodes-clawdbot.clawdbotApprovalGate" &&
        getStringParameter(node.parameters, "approverRole") === "incident-commander",
    );
    const hasArtifactNode = template.nodes.some(
      (node) => node.type === "n8n-nodes-clawdbot.clawdbotArtifact",
    );

    expect(hasRetryWait).toBe(true);
    expect(hasEscalationGate).toBe(true);
    expect(hasArtifactNode).toBe(true);
  });
});
