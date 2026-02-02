import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("SiliconFlow provider", () => {
  it("should not include siliconflow when no API key is configured", async () => {
    const previous = process.env.SILICONFLOW_API_KEY;
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    try {
      delete process.env.SILICONFLOW_API_KEY;
      const providers = await resolveImplicitProviders({ agentDir });
      expect(providers?.siliconflow).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previous;
      }
    }
  });

  it("includes siliconflow when SILICONFLOW_API_KEY is set", async () => {
    const previous = process.env.SILICONFLOW_API_KEY;
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    try {
      process.env.SILICONFLOW_API_KEY = "siliconflow-test-key";
      const providers = await resolveImplicitProviders({ agentDir });
      expect(providers?.siliconflow).toBeDefined();
      const siliconflow = providers?.siliconflow;
      expect(siliconflow?.api).toBe("openai-completions");
      expect(siliconflow?.baseUrl).toBe("https://api.siliconflow.com/v1");
      expect(siliconflow?.apiKey).toBe("SILICONFLOW_API_KEY");
      expect(siliconflow?.models?.some((m) => m.id === "deepseek-ai/DeepSeek-V3.2")).toBe(true);
      expect(siliconflow?.models?.some((m) => m.id === "zai-org/GLM-4.6V")).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.SILICONFLOW_API_KEY;
      } else {
        process.env.SILICONFLOW_API_KEY = previous;
      }
    }
  });
});
