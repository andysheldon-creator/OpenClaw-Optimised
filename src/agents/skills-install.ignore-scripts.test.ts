import { describe, expect, it } from "vitest";
import { buildNodeInstallCommand } from "./skills-install.js";

/**
 * VULN-211: Skill installation must use --ignore-scripts flag
 *
 * This test verifies that all package manager commands include the
 * --ignore-scripts flag to prevent execution of arbitrary lifecycle scripts
 * from untrusted packages during skill installation.
 *
 * CWE-506: Embedded Malicious Code
 * CWE-494: Download of Code Without Integrity Check
 */

describe("VULN-211: skill install must use --ignore-scripts", () => {
  it("npm install includes --ignore-scripts", () => {
    const argv = buildNodeInstallCommand("test-package", { nodeManager: "npm" });
    expect(argv).toContain("--ignore-scripts");
    expect(argv[0]).toBe("npm");
    expect(argv).toContain("install");
    expect(argv).toContain("-g");
    expect(argv).toContain("test-package");
  });

  it("pnpm add includes --ignore-scripts", () => {
    const argv = buildNodeInstallCommand("test-package", { nodeManager: "pnpm" });
    expect(argv).toContain("--ignore-scripts");
    expect(argv[0]).toBe("pnpm");
    expect(argv).toContain("add");
    expect(argv).toContain("-g");
    expect(argv).toContain("test-package");
  });

  it("yarn global add includes --ignore-scripts", () => {
    const argv = buildNodeInstallCommand("test-package", { nodeManager: "yarn" });
    expect(argv).toContain("--ignore-scripts");
    expect(argv[0]).toBe("yarn");
    expect(argv).toContain("global");
    expect(argv).toContain("add");
    expect(argv).toContain("test-package");
  });

  it("bun add includes --ignore-scripts", () => {
    const argv = buildNodeInstallCommand("test-package", { nodeManager: "bun" });
    expect(argv).toContain("--ignore-scripts");
    expect(argv[0]).toBe("bun");
    expect(argv).toContain("add");
    expect(argv).toContain("-g");
    expect(argv).toContain("test-package");
  });

  it("defaults to npm when nodeManager is unspecified", () => {
    const argv = buildNodeInstallCommand("test-package", {});
    expect(argv).toContain("--ignore-scripts");
    expect(argv[0]).toBe("npm");
  });
});
