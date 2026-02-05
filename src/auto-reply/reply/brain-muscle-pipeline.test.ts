import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { parseBrainPlan, resolveReplyPipelineConfig } from "./brain-muscle-pipeline.js";

describe("brain-muscle pipeline helpers", () => {
  it("parses a valid brain plan", () => {
    const raw = `{"use_muscle": true, "tasks": ["do x", "do y"], "response": ""}`;
    const plan = parseBrainPlan(raw);
    expect(plan?.useMuscle).toBe(true);
    expect(plan?.tasks).toEqual(["do x", "do y"]);
  });

  it("returns null for invalid plan payloads", () => {
    expect(parseBrainPlan("not json")).toBeNull();
  });

  it("uses fallbacks as muscle models when none are configured", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          replyPipeline: { enabled: true },
          model: { fallbacks: ["openrouter/auto"] },
        },
      },
    };
    const pipeline = resolveReplyPipelineConfig({
      cfg,
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-5",
    });
    expect(pipeline.enabled).toBe(true);
    expect(pipeline.muscleModels.length).toBe(1);
    expect(pipeline.muscleModels[0]?.provider).toBe("openrouter");
  });
});
