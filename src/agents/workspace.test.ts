import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  GLOBAL_MERGE_SEPARATOR,
  loadGlobalBootstrapFiles,
  loadWorkspaceBootstrapFiles,
} from "./workspace.js";

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

describe("global bootstrap file loading", () => {
  it("merges global and workspace content when both exist (global prepended)", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    await writeWorkspaceFile({ dir: workspaceDir, name: "AGENTS.md", content: "workspace agents" });
    await writeWorkspaceFile({ dir: globalDir, name: "AGENTS.md", content: "global agents" });

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });
    const agentsFile = files.find((f) => f.name === DEFAULT_AGENTS_FILENAME);

    expect(agentsFile).toBeDefined();
    expect(agentsFile!.missing).toBe(false);
    expect(agentsFile!.content).toBe("global agents" + GLOBAL_MERGE_SEPARATOR + "workspace agents");
  });

  it("uses global file as-is when no workspace file exists", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    // No workspace SOUL.md, but global has one
    await writeWorkspaceFile({ dir: globalDir, name: "SOUL.md", content: "global soul" });

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });
    const soulFile = files.find((f) => f.name === DEFAULT_SOUL_FILENAME);

    expect(soulFile).toBeDefined();
    expect(soulFile!.missing).toBe(false);
    expect(soulFile!.content).toBe("global soul");
  });

  it("uses workspace file only when no global file exists (unchanged behavior)", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    await writeWorkspaceFile({ dir: workspaceDir, name: "TOOLS.md", content: "workspace tools" });
    // No global TOOLS.md

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });
    const toolsFile = files.find((f) => f.name === DEFAULT_TOOLS_FILENAME);

    expect(toolsFile).toBeDefined();
    expect(toolsFile!.missing).toBe(false);
    expect(toolsFile!.content).toBe("workspace tools");
  });

  it("marks file as missing when neither global nor workspace exists", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });
    const agentsFile = files.find((f) => f.name === DEFAULT_AGENTS_FILENAME);

    expect(agentsFile).toBeDefined();
    expect(agentsFile!.missing).toBe(true);
    expect(agentsFile!.content).toBeUndefined();
  });

  it("excludes MEMORY.md from global loading", async () => {
    const globalDir = await makeTempWorkspace("openclaw-global-");

    // Write a MEMORY.md in the global dir — it should NOT be loaded
    await writeWorkspaceFile({ dir: globalDir, name: "MEMORY.md", content: "global memory" });

    const globalFiles = await loadGlobalBootstrapFiles(globalDir);
    expect(globalFiles.has("MEMORY.md" as any)).toBe(false);
  });

  it("merges multiple global files correctly", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    await writeWorkspaceFile({ dir: workspaceDir, name: "AGENTS.md", content: "ws agents" });
    await writeWorkspaceFile({ dir: workspaceDir, name: "SOUL.md", content: "ws soul" });
    await writeWorkspaceFile({ dir: globalDir, name: "AGENTS.md", content: "global agents" });
    await writeWorkspaceFile({ dir: globalDir, name: "SOUL.md", content: "global soul" });

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });

    const agentsFile = files.find((f) => f.name === DEFAULT_AGENTS_FILENAME);
    const soulFile = files.find((f) => f.name === DEFAULT_SOUL_FILENAME);

    expect(agentsFile!.content).toBe("global agents" + GLOBAL_MERGE_SEPARATOR + "ws agents");
    expect(soulFile!.content).toBe("global soul" + GLOBAL_MERGE_SEPARATOR + "ws soul");
  });

  it("ignores empty global files", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-workspace-");
    const globalDir = await makeTempWorkspace("openclaw-global-");

    await writeWorkspaceFile({ dir: workspaceDir, name: "AGENTS.md", content: "ws agents" });
    await writeWorkspaceFile({ dir: globalDir, name: "AGENTS.md", content: "   " }); // whitespace only

    const files = await loadWorkspaceBootstrapFiles(workspaceDir, { globalDir });
    const agentsFile = files.find((f) => f.name === DEFAULT_AGENTS_FILENAME);

    // Should not merge empty global content — just workspace content
    expect(agentsFile!.content).toBe("ws agents");
  });
});

describe("loadGlobalBootstrapFiles", () => {
  it("returns empty map when global dir does not exist", async () => {
    const result = await loadGlobalBootstrapFiles("/tmp/nonexistent-openclaw-global-dir");
    expect(result.size).toBe(0);
  });

  it("loads only eligible files (not MEMORY.md)", async () => {
    const globalDir = await makeTempWorkspace("openclaw-global-");

    await writeWorkspaceFile({ dir: globalDir, name: "AGENTS.md", content: "global agents" });
    await writeWorkspaceFile({ dir: globalDir, name: "MEMORY.md", content: "global memory" });

    const result = await loadGlobalBootstrapFiles(globalDir);

    expect(result.has("AGENTS.md" as any)).toBe(true);
    expect(result.get("AGENTS.md" as any)).toBe("global agents");
    expect(result.has("MEMORY.md" as any)).toBe(false);
  });
});
