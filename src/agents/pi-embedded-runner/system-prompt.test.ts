import { describe, expect, it, vi } from "vitest";

vi.mock("../../memory/progressive-manager.js", () => ({
  isProgressiveMemoryEnabled: () => true,
  resolveProgressiveMemoryIndex: async () => "# Memory Index\n- Example",
}));

import { buildEmbeddedSystemPrompt } from "./system-prompt.js";

describe("buildEmbeddedSystemPrompt", () => {
  it("injects progressive memory index when tools are present", async () => {
    const prompt = await buildEmbeddedSystemPrompt({
      workspaceDir: "/tmp/openclaw",
      tools: [{ name: "memory_recall" }] as never,
      modelAliasLines: [],
      userTimezone: "UTC",
      runtimeInfo: {
        host: "openclaw",
        os: "darwin",
        arch: "arm64",
        node: "v22.0.0",
        model: "provider/model",
      },
      memoryCitationsMode: "auto",
      config: { memory: { progressive: { enabled: true } }, agents: { list: [{ id: "main" }] } },
    });

    expect(prompt).toContain("## Memory System");
    expect(prompt).toContain("# Memory Index");
  });
});
