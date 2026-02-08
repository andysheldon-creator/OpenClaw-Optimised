import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("device identity state dir defaults", () => {
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

  it("writes the default identity file under OPENCLAW_STATE_DIR", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-identity-state-"));
    const stateDir = path.join(tempRoot, "state");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    delete process.env.CLAWDBOT_STATE_DIR;
    vi.resetModules();

    const { loadOrCreateDeviceIdentity } = await import("./device-identity.js");
    const identity = loadOrCreateDeviceIdentity();

    try {
      const identityPath = path.join(stateDir, "identity", "device.json");
      const raw = JSON.parse(await fs.readFile(identityPath, "utf8")) as { deviceId?: string };
      expect(raw.deviceId).toBe(identity.deviceId);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
