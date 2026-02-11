import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureAuthProfileStore, markAuthProfileFailure } from "./auth-profiles.js";

function createTempStore() {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-billing-recovery-"));
  const authPath = path.join(agentDir, "auth-profiles.json");
  fs.writeFileSync(
    authPath,
    JSON.stringify({
      version: 1,
      profiles: {
        "bifrost:fuel": {
          type: "api_key",
          provider: "bifrost",
          key: "vk-test",
        },
      },
    }),
  );
  return { agentDir, store: ensureAuthProfileStore(agentDir) };
}

describe("billingRecoveryMode", () => {
  it('"disable" (default) disables for ~5 hours', async () => {
    const { agentDir, store } = createTempStore();
    try {
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "bifrost:fuel",
        reason: "billing",
        agentDir,
      });

      const stats = store.usageStats?.["bifrost:fuel"];
      expect(stats?.disabledUntil).toBeDefined();
      expect(stats?.disabledReason).toBe("billing");
      const remainingMs = (stats?.disabledUntil as number) - startedAt;
      expect(remainingMs).toBeGreaterThan(4.5 * 60 * 60 * 1000);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it('"retry" applies a 5 minute cooldown', async () => {
    const { agentDir, store } = createTempStore();
    try {
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "bifrost:fuel",
        reason: "billing",
        agentDir,
        cfg: {
          auth: { cooldowns: { billingRecoveryMode: "retry" } },
        } as never,
      });

      const stats = store.usageStats?.["bifrost:fuel"];
      // Should use cooldownUntil (not disabledUntil) for short retry
      expect(stats?.cooldownUntil).toBeDefined();
      expect(stats?.disabledUntil).toBeUndefined();
      expect(stats?.disabledReason).toBeUndefined();
      const remainingMs = (stats?.cooldownUntil as number) - startedAt;
      // 5 minute cooldown ± tolerance
      expect(remainingMs).toBeGreaterThan(4.5 * 60 * 1000);
      expect(remainingMs).toBeLessThan(5.5 * 60 * 1000);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it('"notify" does not set any cooldown or disable', async () => {
    const { agentDir, store } = createTempStore();
    try {
      await markAuthProfileFailure({
        store,
        profileId: "bifrost:fuel",
        reason: "billing",
        agentDir,
        cfg: {
          auth: { cooldowns: { billingRecoveryMode: "notify" } },
        } as never,
      });

      const stats = store.usageStats?.["bifrost:fuel"];
      expect(stats?.disabledUntil).toBeUndefined();
      expect(stats?.disabledReason).toBeUndefined();
      expect(stats?.cooldownUntil).toBeUndefined();
      // Error count should still be recorded for diagnostics
      expect(stats?.errorCount).toBe(1);
      expect(stats?.failureCounts?.billing).toBe(1);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
