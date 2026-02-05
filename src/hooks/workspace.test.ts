import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadHookEntriesFromDir } from "./workspace.js";

describe("loadHookEntriesFromDir", () => {
  it("prefers handler.js when both JS and TS handlers exist", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hook-workspace-"));
    try {
      const hookDir = path.join(root, "my-hook");
      await fs.mkdir(hookDir, { recursive: true });
      await fs.writeFile(
        path.join(hookDir, "HOOK.md"),
        [
          "---",
          "name: my-hook",
          "description: test hook",
          'metadata: {"openclaw":{"events":["command:new"]}}',
          "---",
          "",
          "# My Hook",
        ].join("\n"),
        "utf-8",
      );
      await fs.writeFile(
        path.join(hookDir, "handler.ts"),
        "export default async () => {};\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(hookDir, "handler.js"),
        "export default async () => {};\n",
        "utf-8",
      );

      const entries = loadHookEntriesFromDir({
        dir: root,
        source: "openclaw-workspace",
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]?.hook.handlerPath).toBe(path.join(hookDir, "handler.js"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
