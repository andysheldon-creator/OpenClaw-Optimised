import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  loadWorkspaceBootstrapFiles,
  normalizeWorkspacePath,
  resolveDefaultAgentWorkspaceDir,
} from "./workspace.js";

describe("resolveDefaultAgentWorkspaceDir", () => {
  it("uses OPENCLAW_HOME for default workspace resolution", () => {
    const dir = resolveDefaultAgentWorkspaceDir({
      OPENCLAW_HOME: "/srv/openclaw-home",
      HOME: "/home/other",
    } as NodeJS.ProcessEnv);

    expect(dir).toBe(path.join(path.resolve("/srv/openclaw-home"), ".openclaw", "workspace"));
  });
});

describe("loadWorkspaceBootstrapFiles", () => {
  it("includes MEMORY.md when present", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "MEMORY.md", content: "memory" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("memory");
  });

  it("includes memory.md when MEMORY.md is absent", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: "memory.md", content: "alt" });

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(1);
    expect(memoryEntries[0]?.missing).toBe(false);
    expect(memoryEntries[0]?.content).toBe("alt");
  });

  it("omits memory entries when no memory files exist", async () => {
    const tempDir = await makeTempWorkspace("openclaw-workspace-");

    const files = await loadWorkspaceBootstrapFiles(tempDir);
    const memoryEntries = files.filter((file) =>
      [DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME].includes(file.name),
    );

    expect(memoryEntries).toHaveLength(0);
  });
});

describe("normalizeWorkspacePath", () => {
  it("returns the path unchanged when HOME matches", () => {
    const result = normalizeWorkspacePath(
      "/home/node/.openclaw/workspace",
      { HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    expect(result).toBe("/home/node/.openclaw/workspace");
  });

  it("remaps a foreign HOME path to the current HOME", () => {
    const result = normalizeWorkspacePath(
      "/Users/cy/.openclaw/workspace",
      { HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    expect(result).toBe("/home/node/.openclaw/workspace");
  });

  it("remaps a profiled workspace path", () => {
    const result = normalizeWorkspacePath(
      "/Users/cy/.openclaw/workspace-prod",
      { HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    expect(result).toBe("/home/node/.openclaw/workspace-prod");
  });

  it("leaves custom workspace paths untouched", () => {
    const result = normalizeWorkspacePath(
      "/data/my-custom-workspace",
      { HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    expect(result).toBe("/data/my-custom-workspace");
  });

  it("respects OPENCLAW_HOME over HOME", () => {
    const result = normalizeWorkspacePath(
      "/Users/cy/.openclaw/workspace",
      { OPENCLAW_HOME: "/srv/app", HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    expect(result).toBe("/srv/app/.openclaw/workspace");
  });

  it("handles paths with subdirectories after workspace", () => {
    const result = normalizeWorkspacePath(
      "/Users/cy/.openclaw/workspace/subdir",
      { HOME: "/home/node" } as NodeJS.ProcessEnv,
      () => "/home/node",
    );
    // Should NOT remap because "/subdir" doesn't start with "-"
    expect(result).toBe("/Users/cy/.openclaw/workspace/subdir");
  });
});
