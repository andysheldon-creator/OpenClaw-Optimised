import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatOctal,
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  isGroupReadable,
  isGroupWritable,
  isWorldReadable,
  isWorldWritable,
  modeBits,
  safeStat,
  type PermissionCheck,
} from "./audit-fs.js";

describe("safeStat", () => {
  it("returns ok for existing file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello");
    const result = await safeStat(filePath);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(false);
    expect(result.isSymlink).toBe(false);
    expect(result.mode).toBeTypeOf("number");
    await fs.rm(tmpDir, { recursive: true });
  });

  it("returns ok for directory", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    const result = await safeStat(tmpDir);
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(true);
    await fs.rm(tmpDir, { recursive: true });
  });

  it("returns ok=false for non-existent path", async () => {
    const result = await safeStat("/tmp/nonexistent-audit-fs-test-" + Date.now());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("detects symlinks", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    const target = path.join(tmpDir, "target.txt");
    const link = path.join(tmpDir, "link.txt");
    await fs.writeFile(target, "data");
    await fs.symlink(target, link);
    const result = await safeStat(link);
    expect(result.ok).toBe(true);
    expect(result.isSymlink).toBe(true);
    await fs.rm(tmpDir, { recursive: true });
  });
});

describe("inspectPathPermissions", () => {
  it("inspects file permissions on posix", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    const filePath = path.join(tmpDir, "secure.txt");
    await fs.writeFile(filePath, "secret");
    await fs.chmod(filePath, 0o600);
    const result = await inspectPathPermissions(filePath, { platform: "darwin" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("posix");
    expect(result.worldWritable).toBe(false);
    expect(result.groupWritable).toBe(false);
    expect(result.worldReadable).toBe(false);
    expect(result.groupReadable).toBe(false);
    await fs.rm(tmpDir, { recursive: true });
  });

  it("detects world-writable file", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    const filePath = path.join(tmpDir, "open.txt");
    await fs.writeFile(filePath, "public");
    await fs.chmod(filePath, 0o666);
    const result = await inspectPathPermissions(filePath, { platform: "darwin" });
    expect(result.worldWritable).toBe(true);
    expect(result.groupWritable).toBe(true);
    expect(result.worldReadable).toBe(true);
    expect(result.groupReadable).toBe(true);
    await fs.rm(tmpDir, { recursive: true });
  });

  it("returns ok=false for non-existent path", async () => {
    const result = await inspectPathPermissions("/tmp/nofile-" + Date.now());
    expect(result.ok).toBe(false);
  });

  it("inspects directory permissions", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-fs-test-"));
    await fs.chmod(tmpDir, 0o700);
    const result = await inspectPathPermissions(tmpDir, { platform: "darwin" });
    expect(result.ok).toBe(true);
    expect(result.isDir).toBe(true);
    expect(result.worldWritable).toBe(false);
    await fs.rm(tmpDir, { recursive: true });
  });
});

describe("modeBits", () => {
  it("extracts lower 9 bits", () => {
    expect(modeBits(0o100644)).toBe(0o644);
    expect(modeBits(0o100755)).toBe(0o755);
    expect(modeBits(0o040700)).toBe(0o700);
  });

  it("returns null for null input", () => {
    expect(modeBits(null)).toBeNull();
  });
});

describe("formatOctal", () => {
  it("formats bits as zero-padded octal", () => {
    expect(formatOctal(0o644)).toBe("644");
    expect(formatOctal(0o600)).toBe("600");
    expect(formatOctal(0o007)).toBe("007");
  });

  it("returns 'unknown' for null", () => {
    expect(formatOctal(null)).toBe("unknown");
  });
});

describe("permission bit helpers", () => {
  it("isWorldWritable", () => {
    expect(isWorldWritable(0o002)).toBe(true);
    expect(isWorldWritable(0o666)).toBe(true);
    expect(isWorldWritable(0o644)).toBe(false);
    expect(isWorldWritable(null)).toBe(false);
  });

  it("isGroupWritable", () => {
    expect(isGroupWritable(0o020)).toBe(true);
    expect(isGroupWritable(0o660)).toBe(true);
    expect(isGroupWritable(0o600)).toBe(false);
    expect(isGroupWritable(null)).toBe(false);
  });

  it("isWorldReadable", () => {
    expect(isWorldReadable(0o004)).toBe(true);
    expect(isWorldReadable(0o644)).toBe(true);
    expect(isWorldReadable(0o600)).toBe(false);
    expect(isWorldReadable(null)).toBe(false);
  });

  it("isGroupReadable", () => {
    expect(isGroupReadable(0o040)).toBe(true);
    expect(isGroupReadable(0o640)).toBe(true);
    expect(isGroupReadable(0o600)).toBe(false);
    expect(isGroupReadable(null)).toBe(false);
  });
});

describe("formatPermissionDetail", () => {
  it("formats posix permission detail", () => {
    const perms: PermissionCheck = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: 0o100644,
      bits: 0o644,
      source: "posix",
      worldWritable: false,
      groupWritable: false,
      worldReadable: true,
      groupReadable: true,
    };
    const result = formatPermissionDetail("/tmp/test", perms);
    expect(result).toBe("/tmp/test mode=644");
  });

  it("formats windows ACL detail", () => {
    const perms: PermissionCheck = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: null,
      bits: null,
      source: "windows-acl",
      worldWritable: true,
      groupWritable: false,
      worldReadable: true,
      groupReadable: false,
      aclSummary: "Everyone:RW",
    };
    const result = formatPermissionDetail("C:\\test", perms);
    expect(result).toBe("C:\\test acl=Everyone:RW");
  });
});

describe("formatPermissionRemediation", () => {
  it("generates chmod command for posix", () => {
    const perms: PermissionCheck = {
      ok: true,
      isSymlink: false,
      isDir: false,
      mode: 0o100666,
      bits: 0o666,
      source: "posix",
      worldWritable: true,
      groupWritable: true,
      worldReadable: true,
      groupReadable: true,
    };
    const result = formatPermissionRemediation({
      targetPath: "/tmp/fix",
      perms,
      isDir: false,
      posixMode: 0o600,
    });
    expect(result).toBe("chmod 600 /tmp/fix");
  });

  it("generates chmod for directory mode", () => {
    const perms: PermissionCheck = {
      ok: true,
      isSymlink: false,
      isDir: true,
      mode: 0o040777,
      bits: 0o777,
      source: "posix",
      worldWritable: true,
      groupWritable: true,
      worldReadable: true,
      groupReadable: true,
    };
    const result = formatPermissionRemediation({
      targetPath: "/tmp/dir",
      perms,
      isDir: true,
      posixMode: 0o700,
    });
    expect(result).toBe("chmod 700 /tmp/dir");
  });
});
