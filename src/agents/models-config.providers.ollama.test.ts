import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";

describe("Ollama provider", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should not include ollama when no API key is configured and discovery fails", async () => {
    // Enable discovery by bypassing test guards
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";

    // Mock fetch to fail or return 404
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection refused"));

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.ollama).toBeUndefined();
  });

  it("should include ollama when discovery succeeds even without API key", async () => {
    // Enable discovery by bypassing test guards
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";

    // Mock fetch to return successful model list
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "llama3:latest" }, { name: "mistral:latest" }],
      }),
    } as Response);

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.ollama).toBeDefined();
    expect(providers?.ollama?.apiKey).toBe("local");
    expect(providers?.ollama?.models).toContainEqual(
      expect.objectContaining({ id: "llama3:latest" }),
    );
  });

  it("should respect OLLAMA_HOST env var", async () => {
    // Enable discovery by bypassing test guards
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    process.env.OLLAMA_HOST = "http://custom-host:11434";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "custom-model" }] }),
    } as Response);

    const agentDir = mkdtempSync(join(tmpdir(), "openclaw-test-"));
    await resolveImplicitProviders({ agentDir });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("http://custom-host:11434"),
      expect.anything(),
    );
  });
});
