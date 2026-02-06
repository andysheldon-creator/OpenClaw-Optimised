import { describe, expect, it, vi } from "vitest";
import { runCommandWithTimeout } from "./exec.js";

describe("runCommandWithTimeout", () => {
  it("passes env overrides to child", async () => {
    const result = await runCommandWithTimeout(
      [process.execPath, "-e", 'process.stdout.write(process.env.OPENCLAW_TEST_ENV ?? "")'],
      {
        timeoutMs: 5_000,
        env: { OPENCLAW_TEST_ENV: "ok" },
      },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  it("merges custom env with process.env", async () => {
    const previous = process.env.OPENCLAW_BASE_ENV;
    process.env.OPENCLAW_BASE_ENV = "base";
    try {
      const result = await runCommandWithTimeout(
        [
          process.execPath,
          "-e",
          'process.stdout.write((process.env.OPENCLAW_BASE_ENV ?? "") + "|" + (process.env.OPENCLAW_TEST_ENV ?? ""))',
        ],
        {
          timeoutMs: 5_000,
          env: { OPENCLAW_TEST_ENV: "ok" },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("base|ok");
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCLAW_BASE_ENV;
      } else {
        process.env.OPENCLAW_BASE_ENV = previous;
      }
    }
  });

  it("mirrors stdout when mirrorStdout is enabled", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await runCommandWithTimeout(
        [process.execPath, "-e", 'process.stdout.write("hello")'],
        {
          timeoutMs: 5_000,
          mirrorStdout: true,
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("hello");
      expect(stdoutSpy).toHaveBeenCalledWith(expect.any(Buffer));
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("mirrors stderr when mirrorStderr is enabled", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = await runCommandWithTimeout(
        [process.execPath, "-e", 'process.stderr.write("oops")'],
        {
          timeoutMs: 5_000,
          mirrorStderr: true,
        },
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("oops");
      expect(stderrSpy).toHaveBeenCalledWith(expect.any(Buffer));
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("does not mirror stdout/stderr when disabled", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = await runCommandWithTimeout(
        [process.execPath, "-e", 'process.stdout.write("hello");process.stderr.write("oops")'],
        {
          timeoutMs: 5_000,
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("hello");
      expect(result.stderr).toBe("oops");
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
