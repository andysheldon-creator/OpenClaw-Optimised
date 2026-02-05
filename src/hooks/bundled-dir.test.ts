import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBundledHooksDir } from "./bundled-dir.js";

describe("resolveBundledHooksDir", () => {
  const originalOverride = process.env.OPENCLAW_BUNDLED_HOOKS_DIR;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.OPENCLAW_BUNDLED_HOOKS_DIR;
    } else {
      process.env.OPENCLAW_BUNDLED_HOOKS_DIR = originalOverride;
    }
  });

  it("resolves bundled hooks under a flattened dist layout", async () => {
    delete process.env.OPENCLAW_BUNDLED_HOOKS_DIR;

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-bundled-hooks-"));
    try {
      await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "openclaw" }));
      await fs.mkdir(path.join(root, "dist", "hooks", "bundled"), { recursive: true });
      await fs.writeFile(path.join(root, "dist", "index.js"), "// stub", "utf-8");

      const moduleUrl = pathToFileURL(path.join(root, "dist", "hooks-status-X.js")).href;
      const execPath = path.join(root, "bin", "node");
      await fs.mkdir(path.dirname(execPath), { recursive: true });

      const resolved = resolveBundledHooksDir({
        argv1: path.join(root, "dist", "index.js"),
        moduleUrl,
        cwd: path.join(root, "dist"),
        execPath,
      });

      expect(resolved).toBe(path.join(root, "dist", "hooks", "bundled"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
