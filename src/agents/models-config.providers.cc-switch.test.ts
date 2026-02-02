import { mkdtempSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("cc-switch provider", () => {
  it("should detect cc-switch when proxy is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const mockHomeDir = mkdtempSync(join(tmpdir(), "mock-home-"));

    // Create mock .claude directory and settings.json
    const claudeDir = join(mockHomeDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: "http://127.0.0.1:5000",
          ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
        },
      }),
    );

    // Mock homedir to return our mock directory
    const originalHomedir = process.env.HOME;
    process.env.HOME = mockHomeDir;

    try {
      // Need to reload the module to pick up the new HOME
      const { resolveImplicitProviders: resolveProviders } =
        await import("./models-config.providers.js");

      // Clear require cache to force reload
      const modulePath = join(process.cwd(), "dist", "agents", "models-config.providers.js");
      delete require.cache[require.resolve(modulePath)];

      const providers = await resolveProviders({ agentDir });

      expect(providers?.["cc-switch"]).toBeDefined();
      expect(providers?.["cc-switch"]?.baseUrl).toBe("http://127.0.0.1:5000");
      expect(providers?.["cc-switch"]?.api).toBe("anthropic-messages");
      expect(providers?.["cc-switch"]?.models).toHaveLength(2);
      expect(providers?.["cc-switch"]?.models[0].id).toBe("claude-sonnet-4-20250514");
      expect(providers?.["cc-switch"]?.models[1].id).toBe("claude-haiku-4-20250514");
    } finally {
      process.env.HOME = originalHomedir;
    }
  });

  it("should not include cc-switch when proxy is not configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));

    const providers = await resolveImplicitProviders({ agentDir });

    // cc-switch should not be in providers if there's no proxy config
    expect(providers?.["cc-switch"]).toBeUndefined();
  });
});
