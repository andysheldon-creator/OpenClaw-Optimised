import { describe, expect, it, vi, afterEach } from "vitest";
import { isOllamaRunning, getOllamaInstallInstructions } from "./ollama-installer.js";

describe("Ollama installer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OLLAMA_HOST;
  });

  describe("isOllamaRunning", () => {
    it("returns true when Ollama API responds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await isOllamaRunning();
      expect(result).toBe(true);
    });

    it("returns false when Ollama API does not respond", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });

    it("respects OLLAMA_HOST environment variable", async () => {
      process.env.OLLAMA_HOST = "http://custom-host:11434";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await isOllamaRunning();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("http://custom-host:11434"),
        expect.anything(),
      );
    });
  });

  describe("getOllamaInstallInstructions", () => {
    it("returns installation instructions for current platform", () => {
      const instructions = getOllamaInstallInstructions();
      expect(instructions).toBeTruthy();
      expect(instructions).toContain("install");
      expect(instructions).toContain("ollama");
    });
  });
});
