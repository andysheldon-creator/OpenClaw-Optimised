import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("NVIDIA provider", () => {
  it("should not include nvidia when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));

    // Temporarily clear NVIDIA_API_KEY for this test
    const originalEnv = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;

    try {
      const providers = await resolveImplicitProviders({ agentDir });

      // NVIDIA requires NVIDIA_API_KEY env var or auth profile
      expect(providers?.nvidia).toBeUndefined();
    } finally {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.NVIDIA_API_KEY = originalEnv;
      }
    }
  });

  it("should include nvidia when NVIDIA_API_KEY env var is set", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const testKey = "nvapi-test-key-12345";

    // Mock the environment variable
    const originalEnv = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = testKey;

    try {
      const providers = await resolveImplicitProviders({ agentDir });

      expect(providers?.nvidia).toBeDefined();
      // The apiKey stores the env var name, not the actual value
      expect(providers?.nvidia?.apiKey).toBe("NVIDIA_API_KEY");
      expect(providers?.nvidia?.baseUrl).toBe("https://integrate.api.nvidia.com/v1");
      expect(providers?.nvidia?.api).toBe("openai-completions");
      expect(providers?.nvidia?.models).toHaveLength(1);
      expect(providers?.nvidia?.models[0].id).toBe("nvidia/kimi-k2-instruct");
    } finally {
      // Restore original environment
      if (originalEnv !== undefined) {
        process.env.NVIDIA_API_KEY = originalEnv;
      } else {
        delete process.env.NVIDIA_API_KEY;
      }
    }
  });

  it("should have correct model configuration for NVIDIA Kimi K2", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const testKey = "nvapi-test-key-12345";

    const originalEnv = process.env.NVIDIA_API_KEY;
    process.env.NVIDIA_API_KEY = testKey;

    try {
      const providers = await resolveImplicitProviders({ agentDir });
      const model = providers?.nvidia?.models[0];

      expect(model).toBeDefined();
      expect(model?.id).toBe("nvidia/kimi-k2-instruct");
      expect(model?.name).toBe("NVIDIA Kimi K2 Instruct");
      expect(model?.reasoning).toBe(false);
      expect(model?.input).toEqual(["text"]);
      expect(model?.contextWindow).toBe(128000);
      expect(model?.maxTokens).toBe(8192);
      expect(model?.cost).toEqual({
        input: 0.27,
        output: 0.9,
        cacheRead: 0,
        cacheWrite: 0,
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env.NVIDIA_API_KEY = originalEnv;
      } else {
        delete process.env.NVIDIA_API_KEY;
      }
    }
  });
});
