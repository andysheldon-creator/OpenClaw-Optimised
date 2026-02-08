import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type MarketingAction,
  actionRequiresApproval,
  compileMarketingPlan,
  computeActionFingerprint,
  validateMarketingPlan,
} from "./marketing.js";

function loadSandboxPlan(): unknown {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(
    here,
    "../../../fixtures/api-responses/marketing-plan-sandbox.json",
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

describe("marketing plan compiler", () => {
  it("produces deterministic action ids and graph hash for the same plan", () => {
    const plan = loadSandboxPlan();
    const first = compileMarketingPlan(plan);
    const second = compileMarketingPlan(plan);

    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    expect(first.actionGraphHash).toBe(second.actionGraphHash);
    expect(first.actions.map((action) => action.id)).toEqual(
      second.actions.map((action) => action.id),
    );
    expect(first.actions.map((action) => action.type)).toEqual(
      second.actions.map((action) => action.type),
    );
  });

  it("validates malformed plans with operator-friendly errors", () => {
    const result = validateMarketingPlan({ title: "", campaigns: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("title is required");
    expect(result.errors).toContain("accountId is required");
  });

  it("classifies risky actions for approval gating and stable fingerprints", () => {
    const compiled = compileMarketingPlan(loadSandboxPlan());
    expect(compiled.valid).toBe(true);

    const fingerprints = compiled.actions.map((action) => computeActionFingerprint(action));
    const unique = new Set(fingerprints);
    expect(unique.size).toBe(fingerprints.length);

    for (const action of compiled.actions) {
      expect(actionRequiresApproval(action)).toBe(
        action.risk === "high" || action.risk === "critical",
      );
    }

    const base = compiled.actions[0] as MarketingAction;
    expect(actionRequiresApproval({ ...base, risk: "low" })).toBe(false);
    expect(actionRequiresApproval({ ...base, risk: "medium" })).toBe(false);
    expect(actionRequiresApproval({ ...base, risk: "high" })).toBe(true);
    expect(actionRequiresApproval({ ...base, risk: "critical" })).toBe(true);
  });
});
