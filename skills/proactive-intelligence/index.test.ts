import { describe, it, expect, vi } from "vitest";
import skill from "./index.js";

describe("proactive-intelligence skill", () => {
  it("registers the analyzer tool", async () => {
    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "analyze_recent_activity",
      }),
    );
  });

  it("analyzes activity correctly", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);
    const toolDef = (api.registerTool as any).mock.calls[0][0];

    const result = await toolDef.func({
      activities: [
        "Normal event",
        "Another normal event",
        "A very long event that might be considered an anomaly because it exceeds the arbitrary length threshold set in the mock implementation of this tool.",
      ],
      focus_area: "anomalies",
    });

    expect(result.analyzed_count).toBe(3);
    expect(result.focus).toBe("anomalies");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]).toContain("Potential anomaly");
  });
});
