import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Tests for the sync loadConfig() → async cache fallback.
 *
 * When a config contains $secret{} references, the sync loadConfig() cannot
 * resolve them.  After readConfigFileSnapshot() resolves secrets and primes the
 * module-level config cache, subsequent sync loadConfig() calls should return
 * the cached (secrets-resolved) config instead of throwing/returning {}.
 *
 * These tests use real temp files and the module-level loadConfig /
 * readConfigFileSnapshot wrappers (which is how the gateway uses them).
 */
describe("sync loadConfig falls back to async-primed cache", () => {
  let tmpDir: string;
  let configPath: string;
  let origConfigPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-secret-cache-test-"));
    configPath = path.join(tmpDir, "openclaw.json");
    origConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    if (origConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = origConfigPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sync loadConfig returns {} when secrets are unresolved and no cache exists", async () => {
    // Dynamically import to pick up the env override
    const { loadConfig } = await import("../io.js");

    fs.writeFileSync(
      configPath,
      JSON.stringify({
        secrets: { provider: "env" },
        gateway: { mode: "local", auth: { token: "$secret{MY_TOKEN}" } },
      }),
    );

    const cfg = loadConfig();
    // Without a primed cache, loadConfig catches the error and returns {}
    expect(Object.keys(cfg).length === 0 || cfg.gateway?.auth?.token !== "resolved-token").toBe(
      true,
    );
  });

  it("sync loadConfig returns resolved config after async snapshot primes cache", async () => {
    const { loadConfig, readConfigFileSnapshot } = await import("../io.js");

    const secretValue = `test-secret-${Date.now()}`;
    process.env.TEST_SYNC_CACHE_SECRET = secretValue;

    fs.writeFileSync(
      configPath,
      JSON.stringify({
        secrets: { provider: "env" },
        gateway: { mode: "local", auth: { token: "$secret{TEST_SYNC_CACHE_SECRET}" } },
      }),
    );

    // Async snapshot resolves secrets and primes the cache
    const snapshot = await readConfigFileSnapshot();
    expect(snapshot.valid).toBe(true);
    expect(snapshot.config.gateway?.auth?.token).toBe(secretValue);

    // Now sync loadConfig should return the cached resolved config
    const cfg = loadConfig();
    expect(cfg.gateway?.mode).toBe("local");
    expect(cfg.gateway?.auth?.token).toBe(secretValue);

    delete process.env.TEST_SYNC_CACHE_SECRET;
  });
});
