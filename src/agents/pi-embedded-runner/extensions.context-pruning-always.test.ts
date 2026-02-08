import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { buildEmbeddedExtensionPaths } from "./extensions.js";

describe("context pruning extension (always mode)", () => {
  it("enables context-pruning extension for non-anthropic providers when mode=always", () => {
    const cfg = {
      agents: {
        defaults: {
          contextPruning: {
            mode: "always",
            tools: { allow: ["web_fetch"] },
            softTrim: { maxChars: 2000, headChars: 800, tailChars: 800 },
            softTrimRatio: 0,
            hardClearRatio: 1,
            minPrunableToolChars: 0,
            hardClear: { enabled: false },
          },
        },
      },
    } as unknown as OpenClawConfig;

    const paths = buildEmbeddedExtensionPaths({
      cfg,
      sessionManager: {},
      provider: "openai-codex",
      modelId: "gpt-5.3-codex",
      model: undefined,
    });

    expect(paths.some((p) => p.includes("context-pruning"))).toBe(true);
  });
});
