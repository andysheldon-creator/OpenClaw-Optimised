import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SecurityEvent } from "./hardening-logger.js";
import {
  __resetHardeningLoggerForTest,
  initHardeningLogger,
  logSecurityEvent,
} from "./hardening-logger.js";
import {
  __resetSingleUserEnforcerForTest,
  hashSender,
  initSingleUserEnforcer,
  isAuthorizedSender,
  isSingleUserEnforcerActive,
} from "./single-user-enforcer.js";
import {
  __resetNetworkMonitorForTest,
  installNetworkMonitor,
  isDomainAllowed,
  isNetworkMonitorActive,
} from "./network-monitor.js";
import {
  __resetFsMonitorForTest,
  auditFileAccess,
  installFsMonitor,
  isFsMonitorActive,
  isSensitivePath,
} from "./fs-monitor.js";
import { initHardening, isHardeningEnabled, teardownHardening } from "./hardening.js";

// ---------------------------------------------------------------------------
// Hardening Logger
// ---------------------------------------------------------------------------

describe("hardening-logger", () => {
  let tmpDir: string;

  beforeEach(async () => {
    __resetHardeningLoggerForTest();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "moltbot-hardening-log-"));
  });

  afterEach(async () => {
    __resetHardeningLoggerForTest();
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("writes structured events to the log file", async () => {
    const logFile = path.join(tmpDir, "test-security.log");
    initHardeningLogger({ logFile });

    logSecurityEvent("hardening_init", { test: true });
    logSecurityEvent("blocked_sender", { sender: "test" });

    // Give the write stream a moment to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    const content = await fs.promises.readFile(logFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as SecurityEvent;
    expect(first.type).toBe("hardening_init");
    expect(first.detail.test).toBe(true);
    expect(first.timestamp).toBeTruthy();

    const second = JSON.parse(lines[1]) as SecurityEvent;
    expect(second.type).toBe("blocked_sender");
  });

  it("invokes the onEvent callback", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: path.join(tmpDir, "cb.log"), onEvent: (e) => events.push(e) });

    logSecurityEvent("hardening_init", { module: "test" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("hardening_init");
  });

  it("does not crash when logging before init", () => {
    // Should be a no-op, not a crash
    logSecurityEvent("hardening_error", { error: "no init" });
  });
});

// ---------------------------------------------------------------------------
// Single-User Enforcer
// ---------------------------------------------------------------------------

describe("single-user-enforcer", () => {
  const testPhone = "+8613800138000";
  const testHash = crypto.createHash("sha256").update(testPhone).digest("hex");

  beforeEach(() => {
    __resetSingleUserEnforcerForTest();
    __resetHardeningLoggerForTest();
  });

  afterEach(() => {
    __resetSingleUserEnforcerForTest();
    __resetHardeningLoggerForTest();
  });

  it("hashSender produces correct SHA-256", () => {
    const hash = hashSender(testPhone);
    expect(hash).toBe(testHash);
    expect(hash).toHaveLength(64);
  });

  it("rejects invalid hash in init", () => {
    expect(() => initSingleUserEnforcer({ authorizedUserHash: "notahash" })).toThrow(
      "64-char lowercase hex SHA-256",
    );
  });

  it("allows authorized sender", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    initSingleUserEnforcer({ authorizedUserHash: testHash });

    expect(isSingleUserEnforcerActive()).toBe(true);
    expect(isAuthorizedSender(testPhone)).toBe(true);
    // No blocked_sender event should be emitted
    expect(events.filter((e) => e.type === "blocked_sender")).toHaveLength(0);
  });

  it("blocks unauthorized sender", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    initSingleUserEnforcer({ authorizedUserHash: testHash });

    expect(isAuthorizedSender("+1234567890")).toBe(false);
    expect(events.filter((e) => e.type === "blocked_sender")).toHaveLength(1);
  });

  it("blocks all senders when not initialized (fail-closed)", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });

    // Not initialized - should deny all
    expect(isAuthorizedSender(testPhone)).toBe(false);
    expect(events.filter((e) => e.type === "hardening_error")).toHaveLength(1);
  });

  it("uses constant-time comparison (functional check)", () => {
    initSingleUserEnforcer({ authorizedUserHash: testHash });

    // Verify it works correctly even with similar inputs
    expect(isAuthorizedSender(testPhone)).toBe(true);
    expect(isAuthorizedSender("+8613800138001")).toBe(false);
    expect(isAuthorizedSender("+8613800138000 ")).toBe(false); // trailing space
    expect(isAuthorizedSender("")).toBe(false);
  });

  it("is inactive before init", () => {
    expect(isSingleUserEnforcerActive()).toBe(false);
  });

  it("accepts uppercase hash in init", () => {
    const upperHash = testHash.toUpperCase();
    // Should normalize to lowercase
    initSingleUserEnforcer({ authorizedUserHash: upperHash });
    expect(isSingleUserEnforcerActive()).toBe(true);
    expect(isAuthorizedSender(testPhone)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Network Monitor
// ---------------------------------------------------------------------------

describe("network-monitor", () => {
  beforeEach(() => {
    __resetNetworkMonitorForTest();
    __resetHardeningLoggerForTest();
  });

  afterEach(() => {
    __resetNetworkMonitorForTest();
    __resetHardeningLoggerForTest();
  });

  it("allows whitelisted domains", () => {
    installNetworkMonitor();
    expect(isDomainAllowed("api.anthropic.com")).toBe(true);
    expect(isDomainAllowed("web.whatsapp.com")).toBe(true);
    expect(isDomainAllowed("localhost")).toBe(true);
    expect(isDomainAllowed("127.0.0.1")).toBe(true);
  });

  it("allows whatsapp subdomains via suffix match", () => {
    installNetworkMonitor();
    expect(isDomainAllowed("mmg.whatsapp.net")).toBe(true);
    expect(isDomainAllowed("media-ams2-1.cdn.whatsapp.net")).toBe(true);
    expect(isDomainAllowed("something.whatsapp.com")).toBe(true);
  });

  it("blocks non-whitelisted domains", () => {
    installNetworkMonitor();
    expect(isDomainAllowed("evil.com")).toBe(false);
    expect(isDomainAllowed("attacker.example.org")).toBe(false);
    expect(isDomainAllowed("api.openai.com")).toBe(false); // not in default list
  });

  it("allows extra domains when configured", () => {
    installNetworkMonitor({ extraAllowedDomains: ["api.openai.com"] });
    expect(isDomainAllowed("api.openai.com")).toBe(true);
    expect(isDomainAllowed("evil.com")).toBe(false);
  });

  it("allows extra suffixes when configured", () => {
    installNetworkMonitor({ extraAllowedSuffixes: [".openai.com"] });
    expect(isDomainAllowed("api.openai.com")).toBe(true);
    expect(isDomainAllowed("files.openai.com")).toBe(true);
    expect(isDomainAllowed("evil.com")).toBe(false);
  });

  it("replaces default domains when allowedDomains is set", () => {
    installNetworkMonitor({ allowedDomains: ["custom.example.com"] });
    expect(isDomainAllowed("custom.example.com")).toBe(true);
    expect(isDomainAllowed("api.anthropic.com")).toBe(false); // default removed
  });

  it("is case-insensitive for domain matching", () => {
    installNetworkMonitor();
    expect(isDomainAllowed("API.ANTHROPIC.COM")).toBe(true);
    expect(isDomainAllowed("Web.WhatsApp.Com")).toBe(true);
  });

  it("returns true when not installed (passthrough)", () => {
    expect(isDomainAllowed("anything.com")).toBe(true);
  });

  it("reports active status correctly", () => {
    expect(isNetworkMonitorActive()).toBe(false);
    installNetworkMonitor();
    expect(isNetworkMonitorActive()).toBe(true);
    __resetNetworkMonitorForTest();
    expect(isNetworkMonitorActive()).toBe(false);
  });

  it("blocks fetch to non-whitelisted domain in enforce mode", async () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    installNetworkMonitor({ enforce: true });

    await expect(fetch("https://evil.com/steal-data")).rejects.toThrow(
      "[network-monitor] Blocked outbound request to evil.com",
    );
    expect(events.filter((e) => e.type === "blocked_network")).toHaveLength(1);
  });

  it("allows fetch to whitelisted domain", async () => {
    installNetworkMonitor({ enforce: true });

    // This should not throw (though the actual fetch may fail due to network)
    // We just verify it doesn't throw a network-monitor error
    try {
      await fetch("https://api.anthropic.com/v1/messages", { signal: AbortSignal.timeout(100) });
    } catch (err) {
      // Network error is expected (no real API key), but not a monitor block
      expect(String(err)).not.toContain("[network-monitor]");
    }
  });
});

// ---------------------------------------------------------------------------
// File System Monitor
// ---------------------------------------------------------------------------

describe("fs-monitor", () => {
  beforeEach(() => {
    __resetFsMonitorForTest();
    __resetHardeningLoggerForTest();
  });

  afterEach(() => {
    __resetFsMonitorForTest();
    __resetHardeningLoggerForTest();
  });

  it("detects sensitive paths", () => {
    installFsMonitor();

    const home = os.homedir();
    expect(isSensitivePath(path.join(home, ".ssh", "id_rsa"))).toBe(true);
    expect(isSensitivePath(path.join(home, ".aws", "credentials"))).toBe(true);
    expect(isSensitivePath(path.join(home, ".gnupg", "pubring.kbx"))).toBe(true);
    expect(isSensitivePath("/etc/shadow")).toBe(true);
  });

  it("does not flag non-sensitive paths", () => {
    installFsMonitor();

    expect(isSensitivePath("/tmp/safe-file.txt")).toBe(false);
    expect(isSensitivePath(path.join(os.homedir(), "Documents", "notes.txt"))).toBe(false);
  });

  it("supports extra sensitive paths", () => {
    installFsMonitor({ extraSensitivePaths: ["~/Documents/secret"] });

    const secretPath = path.join(os.homedir(), "Documents", "secret", "file.txt");
    expect(isSensitivePath(secretPath)).toBe(true);
  });

  it("audit logs sensitive file access", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    installFsMonitor();

    const sshKey = path.join(os.homedir(), ".ssh", "id_rsa");
    const result = auditFileAccess(sshKey, "read");
    expect(result).toBe(true); // default is audit-only (no blocking)
    expect(events.filter((e) => e.type === "sensitive_file_access")).toHaveLength(1);
  });

  it("blocks in enforce mode", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    installFsMonitor({ enforce: true });

    const sshKey = path.join(os.homedir(), ".ssh", "id_rsa");
    const result = auditFileAccess(sshKey, "read");
    expect(result).toBe(false); // blocked
    expect(events.filter((e) => e.type === "sensitive_file_access")).toHaveLength(1);
    expect(events[events.length - 1].detail.allowed).toBe(false);
  });

  it("does not log non-sensitive access", () => {
    const events: SecurityEvent[] = [];
    initHardeningLogger({ logFile: "/dev/null", onEvent: (e) => events.push(e) });
    installFsMonitor();

    auditFileAccess("/tmp/safe.txt", "read");
    expect(events.filter((e) => e.type === "sensitive_file_access")).toHaveLength(0);
  });

  it("returns true when not installed (passthrough)", () => {
    expect(isSensitivePath(path.join(os.homedir(), ".ssh", "id_rsa"))).toBe(false);
    expect(auditFileAccess("/anything", "read")).toBe(true);
  });

  it("reports active status correctly", () => {
    expect(isFsMonitorActive()).toBe(false);
    installFsMonitor();
    expect(isFsMonitorActive()).toBe(true);
    __resetFsMonitorForTest();
    expect(isFsMonitorActive()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hardening Integration (initHardening / isHardeningEnabled)
// ---------------------------------------------------------------------------

describe("hardening integration", () => {
  beforeEach(() => {
    __resetSingleUserEnforcerForTest();
    __resetNetworkMonitorForTest();
    __resetFsMonitorForTest();
    __resetHardeningLoggerForTest();
    delete process.env.MOLTBOT_HARDENING_ENABLED;
    delete process.env.CLAWDBOT_HARDENING_ENABLED;
    delete process.env.MOLTBOT_AUTHORIZED_USER_HASH;
    delete process.env.CLAWDBOT_AUTHORIZED_USER_HASH;
  });

  afterEach(() => {
    teardownHardening();
    delete process.env.MOLTBOT_HARDENING_ENABLED;
    delete process.env.CLAWDBOT_HARDENING_ENABLED;
    delete process.env.MOLTBOT_AUTHORIZED_USER_HASH;
    delete process.env.CLAWDBOT_AUTHORIZED_USER_HASH;
  });

  it("is disabled by default", () => {
    expect(isHardeningEnabled({})).toBe(false);
  });

  it("can be enabled via config", () => {
    expect(isHardeningEnabled({ security: { hardening: { enabled: true } } } as any)).toBe(true);
  });

  it("can be enabled via env var", () => {
    process.env.MOLTBOT_HARDENING_ENABLED = "1";
    expect(isHardeningEnabled({})).toBe(true);
  });

  it("returns inactive when disabled", () => {
    const result = initHardening({});
    expect(result.active).toBe(false);
  });

  it("initializes all modules when enabled with full config", () => {
    const testHash = crypto.createHash("sha256").update("+1234567890").digest("hex");
    process.env.MOLTBOT_HARDENING_ENABLED = "1";
    process.env.MOLTBOT_AUTHORIZED_USER_HASH = testHash;

    const result = initHardening({});
    expect(result.active).toBe(true);
    expect(result.singleUser).toBe(true);
    expect(result.networkMonitor).toBe(true);
    expect(result.fsMonitor).toBe(true);
    expect(result.logPath).toBeTruthy();
  });

  it("initializes without single-user when no hash is provided", () => {
    process.env.MOLTBOT_HARDENING_ENABLED = "1";

    const result = initHardening({});
    expect(result.active).toBe(true);
    expect(result.singleUser).toBe(false);
    expect(result.networkMonitor).toBe(true);
    expect(result.fsMonitor).toBe(true);
  });
});
