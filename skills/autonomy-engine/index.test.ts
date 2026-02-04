import { describe, it, expect, vi } from "vitest";
import skill from "./index.js";

describe("autonomy-engine skill", () => {
  it("registers tools", async () => {
    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    expect(api.registerTool).toHaveBeenCalledTimes(2);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "assess_goal_progress",
      }),
    );
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "plan_next_moves",
      }),
    );
  });

  it("assess_goal_progress returns structured output", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);
    const toolDef = (api.registerTool as any).mock.calls[0][0]; // assess_goal_progress call

    // Safety check in case calls order changes, check name
    let assessTool = toolDef;
    if (assessTool.name !== "assess_goal_progress") {
      assessTool = (api.registerTool as any).mock.calls.find(
        (c: any) => c[0].name === "assess_goal_progress",
      )[0];
    }

    const result = await assessTool.func({
      goal: "Win the game",
      context: "Level 1 complete",
      success_criteria: ["Level 3 complete"],
    });

    expect(result.status).toBe("evaluated");
    expect(result.meta.criteria_count).toBe(1);
    expect(result.instruction).toContain("Review your 'context'");
  });
});
