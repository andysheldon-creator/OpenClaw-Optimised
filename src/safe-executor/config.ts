/**
 * Safe Executor Configuration
 */

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import * as nodeOs from 'node:os';

export type SafeExecutorConfig = {
  enabled: boolean;
  selfIds: string[];
  workdir: string;
  allowedHosts?: string[];
  trustLevelOverrides?: Record<string, string>;
  rateLimiting?: {
    maxRequestsPerMinute?: number;
    maxConcurrent?: number;
    cooldownMs?: number;
  };
  allowedCommands?: string[];
  additionalBlockedPatterns?: string[];
};

export const DEFAULT_SAFE_EXECUTOR_CONFIG: SafeExecutorConfig = {
  enabled: false,
  selfIds: [],
  workdir: process.cwd(),
  allowedHosts: [],
  rateLimiting: {
    maxRequestsPerMinute: 10,
    maxConcurrent: 2,
    cooldownMs: 30000,
  },
};

const CONFIG_PATH = nodePath.join(nodeOs.homedir(), '.openclaw', 'safe-executor.json');

export function loadSafeExecutorConfig(): SafeExecutorConfig {
  try {
    if (nodeFs.existsSync(CONFIG_PATH)) {
      const raw = nodeFs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SAFE_EXECUTOR_CONFIG, ...parsed };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return DEFAULT_SAFE_EXECUTOR_CONFIG;
}
