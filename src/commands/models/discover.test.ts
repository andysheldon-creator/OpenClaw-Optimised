import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(async () => [
    { id: "a1", name: "A1", provider: "windsurf" },
    { id: "b1", name: "B1", provider: "cursor" },
    { id: "c1", name: "C1", provider: "antigravity" },
  ]),
}));

import { modelsDiscoverCommand } from "./discover.js";

describe("modelsDiscoverCommand", () => {
  beforeEach(() => vi.resetAllMocks());

  it("prints discovered models in json when --json used", async () => {
    const logs: string[] = [];
    const runtime = { log: (s: string) => logs.push(s), exit: (_code?: number) => {} } as any;
    await modelsDiscoverCommand({ json: true } as any, runtime);
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.discovered).toBeDefined();
    expect(parsed.discovered.length).toBeGreaterThanOrEqual(3);
  });
});
