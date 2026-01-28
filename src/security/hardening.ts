/**
 * Security hardening module - entry point.
 *
 * Provides single-user authorization, network domain whitelisting,
 * and file system access monitoring for secure single-user deployments.
 *
 * Enable by setting `security.hardening.enabled: true` in config or
 * `MOLTBOT_HARDENING_ENABLED=1` environment variable.
 *
 * Configuration (in moltbot.json):
 *   security: {
 *     hardening: {
 *       enabled: true,
 *       authorizedUserHash: "<sha256 hex of your E.164 phone>",
 *       network: {
 *         enforce: true,
 *         extraAllowedDomains: ["api.openai.com"],
 *         extraAllowedSuffixes: [".openai.com"],
 *         logAllowed: false,
 *       },
 *       filesystem: {
 *         enforce: false,
 *         extraSensitivePaths: ["~/Documents/secret"],
 *       },
 *     },
 *   }
 *
 * Or via environment variables:
 *   MOLTBOT_HARDENING_ENABLED=1
 *   MOLTBOT_AUTHORIZED_USER_HASH=<sha256>
 *   MOLTBOT_HARDENING_NETWORK_ENFORCE=1
 *   MOLTBOT_HARDENING_FS_ENFORCE=0
 */

import type { MoltbotConfig } from "../config/config.js";
import {
  closeHardeningLogger,
  getHardeningLogPath,
  initHardeningLogger,
  logSecurityEvent,
} from "./hardening-logger.js";
import { initSingleUserEnforcer, isSingleUserEnforcerActive } from "./single-user-enforcer.js";
import {
  installNetworkMonitor,
  isNetworkMonitorActive,
  uninstallNetworkMonitor,
} from "./network-monitor.js";
import { installFsMonitor, isFsMonitorActive, uninstallFsMonitor } from "./fs-monitor.js";

export type HardeningConfig = {
  enabled?: boolean;
  /** SHA-256 hex hash of the authorized user's E.164 phone number. */
  authorizedUserHash?: string;
  network?: {
    enforce?: boolean;
    extraAllowedDomains?: string[];
    extraAllowedSuffixes?: string[];
    logAllowed?: boolean;
  };
  filesystem?: {
    enforce?: boolean;
    extraSensitivePaths?: string[];
  };
};

/**
 * Extract hardening config from the app config and environment.
 */
function resolveHardeningConfig(cfg: MoltbotConfig): HardeningConfig {
  const security = (cfg as Record<string, unknown>).security as Record<string, unknown> | undefined;
  const hardening = security?.hardening as HardeningConfig | undefined;
  return hardening ?? {};
}

/**
 * Check if hardening is enabled via config or environment.
 */
export function isHardeningEnabled(cfg: MoltbotConfig): boolean {
  const config = resolveHardeningConfig(cfg);
  if (config.enabled === true) return true;
  if (config.enabled === false) return false;
  // Also check environment variable
  const envFlag = process.env.MOLTBOT_HARDENING_ENABLED ?? process.env.CLAWDBOT_HARDENING_ENABLED;
  return envFlag === "1" || envFlag === "true";
}

/**
 * Initialize all security hardening modules.
 * Should be called very early in gateway startup, before any I/O.
 */
export function initHardening(cfg: MoltbotConfig): {
  active: boolean;
  singleUser: boolean;
  networkMonitor: boolean;
  fsMonitor: boolean;
  logPath: string | null;
} {
  if (!isHardeningEnabled(cfg)) {
    return {
      active: false,
      singleUser: false,
      networkMonitor: false,
      fsMonitor: false,
      logPath: null,
    };
  }

  const config = resolveHardeningConfig(cfg);

  // 1. Initialize audit logger first (all other modules depend on it).
  initHardeningLogger();

  logSecurityEvent("hardening_init", {
    module: "hardening",
    message: "Security hardening starting",
  });

  // 2. Single-user enforcer (if hash is configured).
  const userHash =
    config.authorizedUserHash ??
    process.env.MOLTBOT_AUTHORIZED_USER_HASH ??
    process.env.CLAWDBOT_AUTHORIZED_USER_HASH;

  let singleUserActive = false;
  if (userHash) {
    try {
      initSingleUserEnforcer({ authorizedUserHash: userHash });
      singleUserActive = true;
    } catch (err) {
      logSecurityEvent("hardening_error", {
        module: "single-user-enforcer",
        error: String(err),
      });
    }
  }

  // 3. Network monitor.
  let networkActive = false;
  try {
    const networkEnforceEnv =
      process.env.MOLTBOT_HARDENING_NETWORK_ENFORCE ??
      process.env.CLAWDBOT_HARDENING_NETWORK_ENFORCE;
    installNetworkMonitor({
      enforce:
        config.network?.enforce ?? (networkEnforceEnv === "1" || networkEnforceEnv === "true"),
      extraAllowedDomains: config.network?.extraAllowedDomains,
      extraAllowedSuffixes: config.network?.extraAllowedSuffixes,
      logAllowed: config.network?.logAllowed ?? false,
    });
    networkActive = true;
  } catch (err) {
    logSecurityEvent("hardening_error", {
      module: "network-monitor",
      error: String(err),
    });
  }

  // 4. File system monitor.
  let fsActive = false;
  try {
    const fsEnforceEnv =
      process.env.MOLTBOT_HARDENING_FS_ENFORCE ?? process.env.CLAWDBOT_HARDENING_FS_ENFORCE;
    installFsMonitor({
      enforce: config.filesystem?.enforce ?? (fsEnforceEnv === "1" || fsEnforceEnv === "true"),
      extraSensitivePaths: config.filesystem?.extraSensitivePaths,
    });
    fsActive = true;
  } catch (err) {
    logSecurityEvent("hardening_error", {
      module: "fs-monitor",
      error: String(err),
    });
  }

  logSecurityEvent("hardening_init", {
    module: "hardening",
    message: "Security hardening initialized",
    singleUser: singleUserActive,
    networkMonitor: networkActive,
    fsMonitor: fsActive,
  });

  return {
    active: true,
    singleUser: singleUserActive,
    networkMonitor: networkActive,
    fsMonitor: fsActive,
    logPath: getHardeningLogPath(),
  };
}

/**
 * Tear down all hardening modules. Call on gateway shutdown.
 */
export function teardownHardening(): void {
  uninstallNetworkMonitor();
  uninstallFsMonitor();
  closeHardeningLogger();
}

/**
 * Get the current hardening status for diagnostics.
 */
export function getHardeningStatus(): {
  active: boolean;
  singleUser: boolean;
  networkMonitor: boolean;
  fsMonitor: boolean;
  logPath: string | null;
} {
  return {
    active: isSingleUserEnforcerActive() || isNetworkMonitorActive() || isFsMonitorActive(),
    singleUser: isSingleUserEnforcerActive(),
    networkMonitor: isNetworkMonitorActive(),
    fsMonitor: isFsMonitorActive(),
    logPath: getHardeningLogPath(),
  };
}
