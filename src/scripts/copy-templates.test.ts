import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { copyTemplates } from "../../scripts/copy-templates";

async function makeTempDir(prefix = "openclaw-templates-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("copyTemplates", () => {
  it("copies files from src to dest", async () => {
    const src = await makeTempDir();
    const dest = await makeTempDir();

    // create sample template files and a nested dir
    await fs.mkdir(path.join(src, "nested"));
    await fs.writeFile(path.join(src, "AGENTS.md"), "agents content", "utf-8");
    await fs.writeFile(path.join(src, "SOUL.md"), "soul content", "utf-8");
    await fs.writeFile(path.join(src, "nested", "TOOL.md"), "tool content", "utf-8");

    await copyTemplates({ src, dest });

    const agents = await fs.readFile(path.join(dest, "AGENTS.md"), "utf-8");
    const soul = await fs.readFile(path.join(dest, "SOUL.md"), "utf-8");
    const tool = await fs.readFile(path.join(dest, "nested", "TOOL.md"), "utf-8");

    expect(agents).toBe("agents content");
    expect(soul).toBe("soul content");
    expect(tool).toBe("tool content");

    // cleanup
    await fs.rm(src, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
  });

  it("does not throw when source is missing", async () => {
    const dest = await makeTempDir();
    await copyTemplates({ src: path.join(dest, "no-such-src"), dest });
    await fs.rm(dest, { recursive: true, force: true });
  });
});