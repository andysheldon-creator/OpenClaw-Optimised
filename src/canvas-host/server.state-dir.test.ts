import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRuntime } from "../runtime.js";

describe("canvas host state dir defaults", () => {
  let previousStateDir: string | undefined;
  let previousLegacyStateDir: string | undefined;

  beforeEach(() => {
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousLegacyStateDir = process.env.CLAWDBOT_STATE_DIR;
  });

  afterEach(() => {
    vi.resetModules();
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousLegacyStateDir === undefined) {
      delete process.env.CLAWDBOT_STATE_DIR;
    } else {
      process.env.CLAWDBOT_STATE_DIR = previousLegacyStateDir;
    }
  });

  it("uses OPENCLAW_STATE_DIR for the default canvas root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-canvas-state-"));
    const stateDir = path.join(tempRoot, "state");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    delete process.env.CLAWDBOT_STATE_DIR;
    vi.resetModules();

    const { createCanvasHostHandler } = await import("./server.js");
    const handler = await createCanvasHostHandler({
      runtime: defaultRuntime,
      allowInTests: true,
    });

    try {
      const expectedRoot = await fs.realpath(path.join(stateDir, "canvas"));
      const actualRoot = await fs.realpath(handler.rootDir);
      expect(actualRoot).toBe(expectedRoot);
      const indexPath = path.join(expectedRoot, "index.html");
      const indexContents = await fs.readFile(indexPath, "utf8");
      expect(indexContents).toContain("OpenClaw Canvas");
    } finally {
      await handler.close();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
