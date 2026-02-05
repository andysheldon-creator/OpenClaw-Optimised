import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundledHooks, resolveHookEntry } from "../../scripts/build-bundled-hooks.js";

async function writeHook(params: { dir: string; withHandler?: boolean }) {
  await fs.mkdir(params.dir, { recursive: true });
  await fs.writeFile(
    path.join(params.dir, "HOOK.md"),
    ["---", "name: test-hook", "description: test", "---", "", "# Test Hook", ""].join("\n"),
    "utf-8",
  );
  if (params.withHandler !== false) {
    await fs.writeFile(
      path.join(params.dir, "handler.ts"),
      "export default async function handler() { return; }\n",
      "utf-8",
    );
  }
}

describe("build bundled hooks script", () => {
  it("prefers JavaScript handlers when both JS and TS exist", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-build-hooks-"));
    try {
      const hookDir = path.join(root, "demo-hook");
      await fs.mkdir(hookDir, { recursive: true });
      await fs.writeFile(path.join(hookDir, "HOOK.md"), "---\nname: demo\n---\n", "utf-8");
      await fs.writeFile(
        path.join(hookDir, "handler.ts"),
        "export default async function ts() {}\n",
      );
      await fs.writeFile(
        path.join(hookDir, "handler.js"),
        "export default async function js() {}\n",
      );

      await expect(resolveHookEntry(hookDir)).resolves.toBe(path.join(hookDir, "handler.js"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("emits HOOK.md and handler.js for bundled hooks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-build-hooks-"));
    try {
      const srcBundledDir = path.join(root, "src", "hooks", "bundled");
      const distBundledDir = path.join(root, "dist", "hooks", "bundled");
      const hookDir = path.join(srcBundledDir, "demo-hook");
      await writeHook({ dir: hookDir });

      await buildBundledHooks({ srcBundledDir, distBundledDir });

      await expect(
        fs.stat(path.join(distBundledDir, "demo-hook", "HOOK.md")),
      ).resolves.toBeTruthy();
      await expect(
        fs.stat(path.join(distBundledDir, "demo-hook", "handler.js")),
      ).resolves.toBeTruthy();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("cleans stale output before rebuilding", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-build-hooks-"));
    try {
      const srcBundledDir = path.join(root, "src", "hooks", "bundled");
      const distBundledDir = path.join(root, "dist", "hooks", "bundled");
      const hookDir = path.join(srcBundledDir, "demo-hook");
      await writeHook({ dir: hookDir });

      await fs.mkdir(path.join(distBundledDir, "stale"), { recursive: true });
      await fs.writeFile(path.join(distBundledDir, "stale", "old.txt"), "stale", "utf-8");

      await buildBundledHooks({ srcBundledDir, distBundledDir });

      await expect(
        fs.stat(path.join(distBundledDir, "demo-hook", "handler.js")),
      ).resolves.toBeTruthy();
      await expect(fs.stat(path.join(distBundledDir, "stale", "old.txt"))).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("fails when HOOK.md exists without a handler", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-build-hooks-"));
    try {
      const srcBundledDir = path.join(root, "src", "hooks", "bundled");
      const distBundledDir = path.join(root, "dist", "hooks", "bundled");
      const hookDir = path.join(srcBundledDir, "broken-hook");
      await writeHook({ dir: hookDir, withHandler: false });

      await expect(buildBundledHooks({ srcBundledDir, distBundledDir })).rejects.toThrow(
        "handler.ts/handler.js/index.ts/index.js missing",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
