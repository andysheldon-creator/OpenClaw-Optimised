/**
 * Tests for Custom Script Executor
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AutomationServiceState } from "../service/state.js";
import type { Automation, CustomScriptConfig } from "../types.js";
import { CustomScriptExecutor } from "./custom-script.js";

// Mock dependencies
vi.mock("../../process/exec.js", () => ({
  runCommandWithTimeout: vi.fn(),
}));

// Track artifact storage calls
const artifactCalls: Array<{ name: string; type: string; content: string }> = [];

vi.mock("../artifacts.js", () => ({
  ArtifactStorage: class {
    init = vi.fn();
    async storeText(runId: string, name: string, type: string, content: string) {
      artifactCalls.push({ runId, name, type, content });
      return {
        id: crypto.randomUUID(),
        name,
        type,
        size: "10 B",
        url: `/api/artifacts/${runId}/${crypto.randomUUID()}`,
      };
    }
    storeBuffer = vi.fn();
    storeFile = vi.fn();
    getArtifact = vi.fn();
    deleteRunArtifacts = vi.fn();
    cleanup = vi.fn();
  },
}));

// Clear artifact calls before each test
beforeEach(() => {
  artifactCalls.length = 0;
});

describe("CustomScriptExecutor", () => {
  let mockState: AutomationServiceState;
  let mockAutomation: Automation;
  let mockRunId: string;
  let mockStartedAt: number;
  let tempDir: string;
  let testScriptPath: string;

  // Clear artifact calls before each test
  beforeEach(() => {
    artifactCalls.length = 0;
  });

  beforeEach(async () => {
    // Create temp directory for test scripts
    tempDir = path.join(process.env.TMPDIR ?? "/tmp", `clawdbrain-test-${crypto.randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create a test script
    testScriptPath = path.join(tempDir, "test-script.sh");
    await fs.writeFile(
      testScriptPath,
      `#!/bin/sh
echo "Test output"
exit 0
`,
      { mode: 0o755 },
    );

    // Mock state
    mockState = {
      deps: {
        nowMs: () => Date.now(),
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
        storePath: "/tmp/test-store.json",
        automationsEnabled: true,
        emitAutomationEvent: vi.fn(),
        onEvent: vi.fn(),
      },
    } as unknown as AutomationServiceState;

    // Mock automation
    mockAutomation = {
      id: crypto.randomUUID(),
      name: "Test Automation",
      enabled: true,
      status: "active",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: { kind: "every", everyMs: 60000 },
      type: "custom-script",
      tags: [],
      config: {
        type: "custom-script",
        script: testScriptPath,
        args: ["arg1", "arg2"],
        environment: { TEST_VAR: "test-value" },
        workingDirectory: tempDir,
        timeoutMs: 5000,
      } satisfies CustomScriptConfig,
      state: {},
    } as Automation;

    mockRunId = crypto.randomUUID();
    mockStartedAt = Date.now();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe("successful execution", () => {
    it("should execute a script and return success", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "Test output\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
      expect(result.artifacts).toHaveLength(1); // stdout only (stderr is empty)
      expect(result.conflicts).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it("should handle scripts with arguments", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "arg1 arg2\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
      expect(runCommandWithTimeout).toHaveBeenCalledWith(
        [testScriptPath, "arg1", "arg2"],
        expect.objectContaining({
          timeoutMs: 5000,
          cwd: tempDir,
          env: expect.objectContaining({
            TEST_VAR: "test-value",
          }),
        }),
      );
    });

    it("should use default timeout when not specified", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      mockAutomation.config = {
        type: "custom-script",
        script: testScriptPath,
      };

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      await executor.execute();

      expect(runCommandWithTimeout).toHaveBeenCalledWith(
        [testScriptPath],
        expect.objectContaining({
          timeoutMs: 30000, // Default timeout
        }),
      );
    });
  });

  describe("script path resolution", () => {
    it("should handle absolute paths correctly", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      // Use absolute path
      mockAutomation.config = {
        type: "custom-script",
        script: testScriptPath, // Absolute path
        workingDirectory: tempDir,
      };

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      // Absolute path should work
      expect(result.status).toBe("success");
    });

    it("should handle absolute paths", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      mockAutomation.config = {
        type: "custom-script",
        script: testScriptPath, // Absolute path
      };

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
    });
  });

  describe("error handling", () => {
    it("should return error when script is not found", async () => {
      mockAutomation.config = {
        type: "custom-script",
        script: "/nonexistent/script.sh",
      };

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("error");
      expect(result.error).toContain("not found");
    });

    it("should return error when script exits with non-zero code", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "Error: Something went wrong\n",
        code: 1,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("error");
      expect(result.error).toContain("exited with code 1");
      expect(result.error).toContain("Error: Something went wrong");
    });

    it("should handle timeout errors", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      const timeoutError = new Error("Command timed out") as Error & { code?: string };
      timeoutError.code = "ETIMEDOUT";
      vi.mocked(runCommandWithTimeout).mockRejectedValue(timeoutError);

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("error");
      expect(result.error).toContain("timed out");
    });

    it("should handle permission errors", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      const permError = new Error("Permission denied") as Error & { code?: string };
      permError.code = "EACCES";
      vi.mocked(runCommandWithTimeout).mockRejectedValue(permError);

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("error");
      expect(result.error).toContain("Permission denied");
    });
  });

  describe("artifact storage", () => {
    it("should store stdout as artifact", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "Script output\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].name).toBe("stdout.txt");
      expect(result.artifacts[0].type).toBe("text/plain");

      // Verify the artifact call
      const stdoutCall = artifactCalls.find((c) => c.name === "stdout.txt");
      expect(stdoutCall).toBeDefined();
      expect(stdoutCall?.content).toBe("Script output\n");
    });

    it("should store stderr as artifact", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "Warning: Something\n",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].name).toBe("stderr.txt");
      expect(result.artifacts[0].type).toBe("text/plain");

      // Verify the artifact call
      const stderrCall = artifactCalls.find((c) => c.name === "stderr.txt");
      expect(stderrCall).toBeDefined();
      expect(stderrCall?.content).toBe("Warning: Something\n");
    });

    it("should not store empty stdout/stderr", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");
      expect(result.artifacts).toHaveLength(0);
      expect(artifactCalls).toHaveLength(0);
    });
  });

  describe("permission handling", () => {
    it("should make non-executable scripts executable", async () => {
      // Create a non-executable script
      const nonExecutableScript = path.join(tempDir, "non-exec.sh");
      await fs.writeFile(nonExecutableScript, "#!/bin/sh\necho 'test'\n");
      await fs.chmod(nonExecutableScript, 0o644); // Read/write only

      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "test\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      mockAutomation.config = {
        type: "custom-script",
        script: nonExecutableScript,
      };

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.status).toBe("success");

      // Clean up
      await fs.unlink(nonExecutableScript);
    });

    it("should handle chmod failures gracefully", async () => {
      // Create a script
      const scriptPath = path.join(tempDir, "test.sh");
      await fs.writeFile(scriptPath, "#!/bin/sh\necho 'test'\n");
      await fs.chmod(scriptPath, 0o644);

      // Mock fs.chmod to fail
      const _originalChmod = fs.chmod;
      vi.spyOn(fs, "chmod").mockRejectedValue(new Error("Permission denied"));

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      mockAutomation.config = {
        type: "custom-script",
        script: scriptPath,
      };

      const result = await executor.execute();

      // Should fail because chmod failed
      expect(result.status).toBe("error");
      expect(result.error).toContain("not executable");

      // Restore original
      vi.spyOn(fs, "chmod").mockRestore();

      // Clean up
      await fs.unlink(scriptPath);
    });
  });

  describe("milestones", () => {
    it("should track execution milestones", async () => {
      const { runCommandWithTimeout } = await import("../../process/exec.js");
      vi.mocked(runCommandWithTimeout).mockResolvedValue({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

      const executor = new CustomScriptExecutor(
        mockState,
        mockAutomation,
        mockRunId,
        mockStartedAt,
      );

      const result = await executor.execute();

      expect(result.milestones).toHaveLength(5); // All milestones
      expect(result.milestones[0].title).toBe("Validating script path");
      expect(result.milestones[1].title).toBe("Verifying script permissions");
      expect(result.milestones[2].title).toBe("Starting script execution");
      expect(result.milestones[3].title).toBe("Running...");
      expect(result.milestones[4].title).toBe("Completed");
    });
  });
});
