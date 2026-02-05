/**
 * OpenClaw Security Module
 *
 * Central export for all security-related functionality.
 */

// Public bind protection
export {
  assertPublicBindSafe,
  enforcePublicBindGuard,
  isPublicBindAddress,
  logPublicBindAttempt,
  type PublicBindGuardOptions,
  type PublicBindGuardResult,
} from "./public-bind-guard.js";

// One-liner command blocklist
export {
  checkCommandArray,
  checkOneLinerPattern,
  checkSuspiciousPattern,
  enforceOneLinerBlocklist,
  getBlockedPatterns,
  getSuspiciousPatterns,
  sanitizeCommand,
  type OneLinerCheckResult,
} from "./one-liner-blocklist.js";

// Identity impersonation protection
export {
  containsForbiddenIdentityFields,
  createIdentityGuardMiddleware,
  deepStripIdentityFields,
  getForbiddenIdentityFields,
  getMonitoredIdentityFields,
  stripIdentityFields,
  validateIdentitySource,
  type IdentityGuardResult,
} from "./identity-guard.js";

// Skill sandbox
export {
  checkFilesystemAccess,
  checkNetworkAccess,
  checkSubprocessAccess,
  createSkillSandboxPolicy,
  enforceSkillSandbox,
  getDefaultPermissions,
  type FilesystemCheckResult,
  type NetworkCheckResult,
  type SkillPermissions,
  type SkillSandboxPolicy,
  type SubprocessCheckResult,
} from "./skill-sandbox.js";

// Anomaly detection
export {
  getAnomalyDetector,
  initAnomalyDetector,
  isIpBlocked,
  recordAnomaly,
  recordAuthFailure,
  recordRequest,
  recordWrite,
  resetAnomalyDetector,
  type AnomalyDetectorConfig,
  type AnomalyEvent,
  type AnomalyType,
} from "./anomaly-detector.js";
