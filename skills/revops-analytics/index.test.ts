import { describe, it, expect, vi } from "vitest";
import skill from "./index.js";

describe("revops-analytics skill", () => {
  it("registers tools", async () => {
    const api = {
      registerTool: vi.fn(),
      logger: { warn: vi.fn(), error: vi.fn() },
    };
    await skill.register(api);
    expect(api.registerTool).toHaveBeenCalledTimes(2);
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "track_event",
      }),
    );
    expect(api.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "get_kpi_metrics",
      }),
    );
  });

  it("track_event records data", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);

    // Find the tool definition
    const trackTool = (api.registerTool as any).mock.calls.find(
      (c: any) => c[0].name === "track_event",
    )[0];

    const result = await trackTool.func({
      event_name: "deal_won",
      properties: { amount: 1000 },
    });

    expect(result.status).toBe("recorded");
    expect(result.message).toContain("deal_won");
  });

  it("get_kpi_metrics returns mock data", async () => {
    const api = { registerTool: vi.fn() };
    await skill.register(api);

    const metricsTool = (api.registerTool as any).mock.calls.find(
      (c: any) => c[0].name === "get_kpi_metrics",
    )[0];

    const result = await metricsTool.func({
      metric_type: "pipeline_value",
      period: "month",
    });

    expect(result.metric).toBe("pipeline_value");
    expect(result.value).toBeGreaterThan(0);
    expect(result.unit).toBe("USD");
  });
});
