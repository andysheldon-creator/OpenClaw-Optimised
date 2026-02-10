import { describe, expect, it, beforeEach } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import {
  ensureAllowAgentsSnapshot,
  getAllowAgentsConfigVersion,
  resetAllowAgentsConfigVersionForTest,
} from "./session-updates.js";

/**
 * Helper: build a minimal OpenClawConfig with an agents list.
 */
function buildConfig(agents: Array<{ id: string; allowAgents?: string[] }>): OpenClawConfig {
  return {
    agents: {
      list: agents.map((a) => ({
        id: a.id,
        subagents: a.allowAgents ? { allowAgents: a.allowAgents } : undefined,
      })),
    },
  } as OpenClawConfig;
}

describe("ensureAllowAgentsSnapshot", () => {
  beforeEach(() => {
    resetAllowAgentsConfigVersionForTest();
  });

  // -----------------------------------------------------------------------
  // 1. Fresh snapshot creation (no prior snapshot)
  // -----------------------------------------------------------------------
  it("builds a fresh snapshot when no prior snapshot exists", async () => {
    const cfg = buildConfig([
      { id: "main", allowAgents: ["product-analyst"] },
      { id: "product-analyst" },
    ]);
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionKey = "agent:main:test";

    const result = await ensureAllowAgentsSnapshot({
      cfg,
      agentId: "main",
      sessionEntry: undefined,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    expect(result.allowAgentsSnapshot).toBeDefined();
    expect(result.allowAgentsSnapshot?.allowAgents).toEqual(["product-analyst"]);
    // Session store should have been updated.
    expect(sessionStore[sessionKey]?.allowAgentsSnapshot?.allowAgents).toEqual(["product-analyst"]);
  });

  // -----------------------------------------------------------------------
  // 2. Snapshot reuse during normal operation (versions match)
  // -----------------------------------------------------------------------
  it("reuses the snapshot when versions match and data unchanged", async () => {
    const cfg = buildConfig([
      { id: "main", allowAgents: ["product-analyst"] },
      { id: "product-analyst" },
    ]);
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionKey = "agent:main:test";

    // First call — builds snapshot.
    const first = await ensureAllowAgentsSnapshot({
      cfg,
      agentId: "main",
      sessionEntry: undefined,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Second call — same config, same version.
    const result = await ensureAllowAgentsSnapshot({
      cfg,
      agentId: "main",
      sessionEntry: first.sessionEntry,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Should reuse the exact same snapshot object (no rebuild).
    expect(result.allowAgentsSnapshot).toEqual(first.allowAgentsSnapshot);
  });

  // -----------------------------------------------------------------------
  // 3. Stale snapshot detected after restart (version 0 vs persisted >0)
  // -----------------------------------------------------------------------
  it("detects a stale snapshot after a restart via version inversion", async () => {
    const oldCfg = buildConfig([{ id: "main", allowAgents: ["old-agent"] }]);
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionKey = "agent:main:test";

    // Simulate a previous process where the version was bumped.
    // First, build a snapshot — this triggers a version bump because
    // the data differs from the (missing) stored snapshot.
    await ensureAllowAgentsSnapshot({
      cfg: oldCfg,
      agentId: "main",
      sessionEntry: undefined,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Verify the version was bumped above 0.
    const versionBeforeRestart = getAllowAgentsConfigVersion();
    expect(versionBeforeRestart).toBeGreaterThan(0);
    const persistedVersion = sessionStore[sessionKey]?.allowAgentsSnapshot?.version;
    expect(persistedVersion).toBeGreaterThan(0);

    // --- Simulate a full gateway restart ---
    resetAllowAgentsConfigVersionForTest();
    expect(getAllowAgentsConfigVersion()).toBe(0);

    // Updated config in the new process.
    const newCfg = buildConfig([
      { id: "main", allowAgents: ["product-analyst"] },
      { id: "product-analyst" },
    ]);

    // The persisted session entry still carries the old snapshot.
    const persistedEntry = sessionStore[sessionKey];
    expect(persistedEntry.allowAgentsSnapshot?.allowAgents).toEqual(["old-agent"]);

    // Run ensureAllowAgentsSnapshot — should detect restart via version inversion.
    const result = await ensureAllowAgentsSnapshot({
      cfg: newCfg,
      agentId: "main",
      sessionEntry: persistedEntry,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Snapshot should now reflect the NEW config.
    expect(result.allowAgentsSnapshot?.allowAgents).toEqual(["product-analyst"]);
    expect(sessionStore[sessionKey]?.allowAgentsSnapshot?.allowAgents).toEqual(["product-analyst"]);
  });

  // -----------------------------------------------------------------------
  // 4. SessionStore fallback resolution
  // -----------------------------------------------------------------------
  it("falls back to sessionStore when sessionEntry has no snapshot", async () => {
    const cfg = buildConfig([{ id: "main", allowAgents: ["analyst"] }]);
    const sessionKey = "agent:main:test";

    // Pre-populate the session store with a snapshot from a previous process.
    const sessionStore: Record<string, SessionEntry> = {
      [sessionKey]: {
        sessionId: "s1",
        updatedAt: Date.now(),
        allowAgentsSnapshot: {
          allowAgents: ["old-analyst"],
          version: 100, // Previous process version.
        },
      },
    };

    // sessionEntry is undefined — the function should fall back to sessionStore.
    // Since configVersion = 0 and persistedVersion = 100 → restart detection triggers.
    const result = await ensureAllowAgentsSnapshot({
      cfg,
      agentId: "main",
      sessionEntry: undefined,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Should rebuild from current config, not reuse the stale store entry.
    expect(result.allowAgentsSnapshot?.allowAgents).toEqual(["analyst"]);
  });

  // -----------------------------------------------------------------------
  // 5. Data drift detection (config changed without version bump)
  // -----------------------------------------------------------------------
  it("detects data drift when config changes without a version bump", async () => {
    const cfg1 = buildConfig([{ id: "main", allowAgents: ["a"] }]);
    const sessionStore: Record<string, SessionEntry> = {};
    const sessionKey = "agent:main:test";

    // Build initial snapshot.
    const first = await ensureAllowAgentsSnapshot({
      cfg: cfg1,
      agentId: "main",
      sessionEntry: undefined,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    // Change the config (simulates user editing openclaw.json).
    const cfg2 = buildConfig([{ id: "main", allowAgents: ["a", "b"] }]);

    // Call again with the same version — data comparison should catch the change.
    const result = await ensureAllowAgentsSnapshot({
      cfg: cfg2,
      agentId: "main",
      sessionEntry: first.sessionEntry,
      sessionStore,
      sessionKey,
      sessionId: "s1",
    });

    expect(result.allowAgentsSnapshot?.allowAgents).toEqual(["a", "b"]);
    // Version should have been bumped.
    expect(result.allowAgentsSnapshot?.version).toBeGreaterThan(
      first.allowAgentsSnapshot?.version ?? 0,
    );
  });

  // -----------------------------------------------------------------------
  // 6. No session store — returns snapshot without persisting
  // -----------------------------------------------------------------------
  it("returns snapshot without persisting when no sessionStore is provided", async () => {
    const cfg = buildConfig([{ id: "main", allowAgents: ["x"] }]);

    const result = await ensureAllowAgentsSnapshot({
      cfg,
      agentId: "main",
      sessionEntry: undefined,
    });

    expect(result.allowAgentsSnapshot?.allowAgents).toEqual(["x"]);
    // sessionEntry won't be updated since there's no store.
    expect(result.sessionEntry).toBeUndefined();
  });
});
