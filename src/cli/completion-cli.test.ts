import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempHome } from "../../test/helpers/temp-home.js";
import { installCompletion } from "./completion-cli.js";

const readFile = async (filePath: string) => await fs.readFile(filePath, "utf-8");

describe("completion install", () => {
  it("writes cached completion and updates legacy zsh line", async () => {
    await withTempHome(async (home) => {
      const profilePath = path.join(home, ".zshrc");
      const legacy = "source <(openclaw completion --shell zsh)";
      await fs.writeFile(profilePath, `${legacy}\n`, "utf-8");

      const script = "# zsh completion\n";
      await installCompletion("zsh", true, "openclaw", script);

      const completionPath = path.join(home, ".openclaw", "completions", "openclaw.zsh");
      await expect(readFile(completionPath)).resolves.toBe(script);

      const updated = await readFile(profilePath);
      expect(updated).toContain(`source "${completionPath}"`);
      expect(updated).not.toContain(legacy);
    });
  });

  it("uses binName for cache path and header", async () => {
    await withTempHome(async (home) => {
      const profilePath = path.join(home, ".zshrc");
      await fs.writeFile(profilePath, "", "utf-8");

      const script = "# zsh completion\n";
      await installCompletion("zsh", true, "openclaw-dev", script);

      const completionPath = path.join(home, ".openclaw", "completions", "openclaw-dev.zsh");
      await expect(readFile(completionPath)).resolves.toBe(script);

      const updated = await readFile(profilePath);
      expect(updated).toContain("# Openclaw Dev Completion");
      expect(updated).toContain(`source "${completionPath}"`);
    });
  });

  it("replaces legacy bash line with cached file", async () => {
    await withTempHome(async (home) => {
      const profilePath = path.join(home, ".bashrc");
      const legacy = "source <(openclaw completion --shell bash)";
      await fs.writeFile(profilePath, `${legacy}\n`, "utf-8");

      const script = "# bash completion\n";
      await installCompletion("bash", true, "openclaw", script);

      const completionPath = path.join(home, ".openclaw", "completions", "openclaw.bash");
      await expect(readFile(completionPath)).resolves.toBe(script);

      const updated = await readFile(profilePath);
      expect(updated).toContain(`source "${completionPath}"`);
      expect(updated).not.toContain(legacy);
    });
  });

  it("updates fish config to source cached file", async () => {
    await withTempHome(async (home) => {
      const fishDir = path.join(home, ".config", "fish");
      await fs.mkdir(fishDir, { recursive: true });
      const profilePath = path.join(fishDir, "config.fish");
      const legacy = "openclaw completion --shell fish | source";
      await fs.writeFile(profilePath, `${legacy}\n`, "utf-8");

      const script = "# fish completion\n";
      await installCompletion("fish", true, "openclaw", script);

      const completionPath = path.join(home, ".openclaw", "completions", "openclaw.fish");
      await expect(readFile(completionPath)).resolves.toBe(script);

      const updated = await readFile(profilePath);
      expect(updated).toContain(`source "${completionPath}"`);
      expect(updated).not.toContain(legacy);
    });
  });

  it("is idempotent when already installed", async () => {
    await withTempHome(async (home) => {
      const profilePath = path.join(home, ".zshrc");
      const completionPath = path.join(home, ".openclaw", "completions", "openclaw.zsh");
      await fs.mkdir(path.dirname(completionPath), { recursive: true });
      await fs.writeFile(completionPath, "# custom completion\n", "utf-8");
      await fs.writeFile(profilePath, `source "${completionPath}"\n`, "utf-8");

      await installCompletion("zsh", true, "openclaw", "# regenerated completion\n");

      const updated = await readFile(profilePath);
      expect(updated).toBe(`source "${completionPath}"\n`);
      await expect(readFile(completionPath)).resolves.toBe("# custom completion\n");
    });
  });
});
