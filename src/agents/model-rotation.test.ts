import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("./model-catalog.js", () => ({
  loadModelCatalog: vi.fn(async () => [
    { id: "m1", name: "M1", provider: "windsurf" },
    { id: "m2", name: "M2", provider: "cursor" },
  ]),
}));

vi.mock("./model-scan.js", () => ({
  scanOpenRouterModels: vi.fn(async () => [
    {
      modelRef: "openrouter/free-1",
      isFree: true,
      tool: { ok: true, latencyMs: 50 },
      image: { ok: false },
      inferredParamB: 2,
    },
    {
      modelRef: "openrouter/free-2",
      isFree: true,
      tool: { ok: true, latencyMs: 200 },
      image: { ok: true, latencyMs: 100 },
      inferredParamB: 8,
    },
  ]),
}));

import { computeDailyRotation } from "./model-rotation.js";

describe("computeDailyRotation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a prioritized list with local providers first and openrouter candidates", async () => {
    const list = await computeDailyRotation({
      includeOpenRouter: true,
      maxCandidates: 5,
      probe: false,
    } as any);
    expect(Array.isArray(list)).toBe(true);
    // local winds and cursor should be present
    expect(list.some((l) => l.includes("windsurf"))).toBe(true);
    expect(list.some((l) => l.includes("cursor"))).toBe(true);
    // openrouter models should be included
    expect(list.some((l) => l.startsWith("openrouter/"))).toBe(true);
  });
});
