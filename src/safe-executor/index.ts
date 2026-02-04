/**
 * Safe Executor Integration for OpenClaw
 * 
 * This module provides the bridge between OpenClaw and ajs-clawbot's
 * capability-based execution model.
 */

// Re-export from ajs-clawbot for convenience
export {
  // Capability factories
  createShellCapability,
  createFilesystemCapability,
  createFetchCapability,
  createLLMCapability,
  createCapabilitySet,
  
  // Presets
  createReadOnlyCapabilities,
  createComputeOnlyCapabilities,
  createChatCapabilities,
  
  // Security utilities
  BLOCKED_FILE_PATTERNS,
  DANGEROUS_PATH_PATTERNS,
  isBlockedPath,
  isDangerousEnvVar,
  sanitizeEnv,
  isBlockedHostname,
  isPrivateIP,
  isCloudMetadataIP,
  
  // Process utilities
  killProcessTree,
  terminateProcessTree,
  safeSpawn,
  isProcessRunning,
  
  // Rate limiting
  RateLimiter,
  createDefaultRateLimiter,
  createStrictRateLimiter,
  
  // Executor
  SafeExecutor,
} from 'ajs-clawbot';

// Re-export types
export type {
  ShellCapability,
  ShellCapabilityOptions,
  ShellCommand,
  FilesystemCapability,
  FilesystemCapabilityOptions,
  FetchCapability,
  FetchCapabilityOptions,
  LLMCapability,
  LLMCapabilityOptions,
  RateLimiterOptions,
  RateLimitResult,
  SafeSpawnOptions,
  SafeSpawnResult,
  SafeExecutorOptions,
  ExecutionContext,
  ExecutionResult,
  TrustLevel,
} from 'ajs-clawbot';

// Local utilities specific to OpenClaw integration
export { loadSafeExecutorConfig, DEFAULT_SAFE_EXECUTOR_CONFIG } from './config.js';
export type { SafeExecutorConfig } from './config.js';
export { createOpenClawExecutor, getTrustLevelFromSource } from './openclaw-executor.js';
export type { OpenClawExecutorOptions, MessageSource } from './openclaw-executor.js';
