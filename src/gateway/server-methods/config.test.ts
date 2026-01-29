import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configHandlers } from "./config.js";
import type { RespondFn } from "./types.js";
import * as configModule from "../../config/config.js";
import * as mergePatchModule from "../../config/merge-patch.js";
import * as legacyModule from "../../config/legacy.js";
import * as restartModule from "../../infra/restart.js";
import * as restartSentinelModule from "../../infra/restart-sentinel.js";

// Mock dependencies
vi.mock("../../config/config.js");
vi.mock("../../config/merge-patch.js");
vi.mock("../../config/legacy.js");
vi.mock("../../infra/restart.js");
vi.mock("../../infra/restart-sentinel.js");
vi.mock("../../agents/agent-scope.js");
vi.mock("../../channels/plugins/index.js");
vi.mock("../../plugins/loader.js");

describe("config.patch destructive change warning", () => {
  let respondMock: RespondFn;
  let respondCalls: Array<{ success: boolean; result: unknown; error: unknown }>;

  beforeEach(() => {
    respondCalls = [];
    respondMock = vi.fn((success, result, error) => {
      respondCalls.push({ success, result, error });
    });

    // Mock writeConfigFile to do nothing
    vi.mocked(configModule.writeConfigFile).mockResolvedValue(undefined);

    // Mock restart functions
    vi.mocked(restartModule.scheduleGatewaySigusr1Restart).mockReturnValue({
      scheduled: true,
      delayMs: 0,
    });
    vi.mocked(restartSentinelModule.writeRestartSentinel).mockResolvedValue("/tmp/sentinel");
    vi.mocked(restartSentinelModule.formatDoctorNonInteractiveHint).mockReturnValue("hint");

    // Mock parseConfigJson5 to parse JSON
    vi.mocked(configModule.parseConfigJson5).mockImplementation((raw: string) => {
      try {
        return { ok: true, parsed: JSON.parse(raw) };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });

    // Mock applyLegacyMigrations to return unchanged
    vi.mocked(legacyModule.applyLegacyMigrations).mockImplementation((config) => ({
      next: null,
      config,
      migrated: false,
    }));

    // Mock validateConfigObjectWithPlugins to always succeed
    vi.mocked(configModule.validateConfigObjectWithPlugins).mockReturnValue({
      ok: true,
      config: {} as any,
    });

    // Mock resolveConfigSnapshotHash
    vi.mocked(configModule.resolveConfigSnapshotHash).mockReturnValue("test-hash");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT warn on normal patch with no field loss", async () => {
    const originalConfig = {
      agents: {
        list: [
          { id: "agent1", name: "Agent One" },
          { id: "agent2", name: "Agent Two" },
        ],
      },
      settings: {
        foo: "bar",
        nested: { a: 1, b: 2 },
      },
    };

    const patch = {
      settings: {
        foo: "baz", // Just changing a value
      },
    };

    const mergedConfig = {
      agents: {
        list: [
          { id: "agent1", name: "Agent One" },
          { id: "agent2", name: "Agent Two" },
        ],
      },
      settings: {
        foo: "baz", // Changed value
        nested: { a: 1, b: 2 },
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify(patch),
      },
      respond: respondMock,
    });

    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0].success).toBe(true);
    expect(respondCalls[0].result).toBeDefined();
    expect((respondCalls[0].result as any).warning).toBeUndefined();
  });

  it("should warn when patch removes more than 5 fields", async () => {
    const originalConfig = {
      settings: {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
        field5: "value5",
        field6: "value6",
        field7: "value7",
      },
    };

    const patch = {
      settings: {
        field1: "value1", // Keep only 1 field
      },
    };

    const mergedConfig = {
      settings: {
        field1: "value1",
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify(patch),
      },
      respond: respondMock,
    });

    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0].success).toBe(true);
    expect(respondCalls[0].result).toBeDefined();
    expect((respondCalls[0].result as any).warning).toBeDefined();
    expect((respondCalls[0].result as any).warning).toMatch(/remove.*field/i);
    expect((respondCalls[0].result as any).warning).toMatch(/reduction/i);
  });

  it("should warn when patch removes more than 10% of fields", async () => {
    const originalConfig = {
      settings: {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
        field5: "value5",
        field6: "value6",
        field7: "value7",
        field8: "value8",
        field9: "value9",
        field10: "value10",
      },
    };

    // Remove 2 fields (20% loss)
    const mergedConfig = {
      settings: {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
        field5: "value5",
        field6: "value6",
        field7: "value7",
        field8: "value8",
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify({}),
      },
      respond: respondMock,
    });

    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0].success).toBe(true);
    expect(respondCalls[0].result).toBeDefined();
    expect((respondCalls[0].result as any).warning).toBeDefined();
    // Should warn about percentage reduction (actual is 18.2% due to parent field counting)
    expect((respondCalls[0].result as any).warning).toMatch(/18\.2%/);
  });

  it("should count nested fields recursively", async () => {
    const originalConfig = {
      root: {
        level1: {
          level2: {
            field1: "value1",
            field2: "value2",
            field3: "value3",
          },
          otherField: "value",
        },
      },
    };

    // Remove the entire level2 object (3 fields lost)
    const mergedConfig = {
      root: {
        level1: {
          otherField: "value",
        },
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify({ root: { level1: { level2: null } } }),
      },
      respond: respondMock,
    });

    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0].success).toBe(true);
    // Should NOT warn because only 3 fields lost (below 5 field threshold)
    // but check the percentage - 3 out of 5 is 60%
    expect((respondCalls[0].result as any).warning).toBeDefined();
  });

  it("should still apply the patch even with warning", async () => {
    const originalConfig = {
      settings: {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
        field5: "value5",
        field6: "value6",
      },
    };

    const mergedConfig = {
      settings: {
        field1: "value1",
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify({}),
      },
      respond: respondMock,
    });

    // Should have written the config despite the warning
    expect(configModule.writeConfigFile).toHaveBeenCalled();
    expect(respondCalls[0].success).toBe(true);
    expect((respondCalls[0].result as any).ok).toBe(true);
  });

  it("should NOT warn when adding fields", async () => {
    const originalConfig = {
      settings: {
        field1: "value1",
      },
    };

    const mergedConfig = {
      settings: {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      },
    };

    vi.mocked(configModule.readConfigFileSnapshot).mockResolvedValue({
      exists: true,
      valid: true,
      config: originalConfig,
      hash: "test-hash",
      raw: JSON.stringify(originalConfig),
      path: "/config.json",
    });

    vi.mocked(mergePatchModule.applyMergePatch).mockReturnValue(mergedConfig);

    await configHandlers["config.patch"]({
      params: {
        baseHash: "test-hash",
        raw: JSON.stringify({ settings: { field2: "value2", field3: "value3" } }),
      },
      respond: respondMock,
    });

    expect(respondCalls[0].success).toBe(true);
    expect((respondCalls[0].result as any).warning).toBeUndefined();
  });
});
