/**
 * OpenClaw-specific Executor Integration
 * 
 * Bridges OpenClaw's message sources and channels to ajs-clawbot's trust levels.
 */

import { SafeExecutor } from 'ajs-clawbot';
import type { TrustLevel, ExecutionContext, ExecutionResult, RateLimiterOptions } from 'ajs-clawbot';
import { loadSafeExecutorConfig, type SafeExecutorConfig } from './config.js';

/**
 * Message source information from OpenClaw
 */
export type MessageSource = {
  provider: 'discord' | 'telegram' | 'whatsapp' | 'slack' | 'line' | 'web' | 'cli';
  channelType: 'dm' | 'group' | 'public';
  userId?: string;
  channelId?: string;
  isOwner?: boolean;
  isTrusted?: boolean;
};

/**
 * Options for creating an OpenClaw executor
 */
export interface OpenClawExecutorOptions {
  /** Workspace root directory */
  workspaceRoot: string;
  
  /** LLM predict function */
  llmPredict?: (prompt: string, options?: any) => Promise<string>;
  
  /** Allowed hosts for fetch capability */
  allowedHosts?: string[];
  
  /** Bot's own user IDs (for self-message rejection) */
  selfIds?: string[];
  
  /** Use strict rate limiting (for public channels) */
  strictRateLimiting?: boolean;
  
  /** Callback when execution completes */
  onExecute?: (skill: string, result: ExecutionResult) => void;
  
  /** Callback when rate limited */
  onRateLimited?: (context: ExecutionContext, reason: string, retryAfterMs?: number) => void;
  
  /** Custom config (otherwise loads from ~/.openclaw/safe-executor.json) */
  config?: SafeExecutorConfig;
}

/**
 * Map OpenClaw message source to ajs-clawbot trust level
 */
export function getTrustLevelFromSource(source: MessageSource): TrustLevel {
  // CLI is always the local owner
  if (source.provider === 'cli') return 'full';
  
  // Owner flag from OpenClaw's user system
  if (source.isOwner) return 'full';
  
  // Trusted users (explicitly configured in OpenClaw)
  if (source.isTrusted) return 'shell';
  
  // DMs get write access (can create files, etc.)
  if (source.channelType === 'dm') return 'write';
  
  // Group chats get LLM access but no filesystem write
  if (source.channelType === 'group') return 'llm';
  
  // Public channels get minimal access
  return 'network';
}

/**
 * Map trust level to execution context source
 */
function trustLevelToSource(trust: TrustLevel): 'main' | 'dm' | 'group' | 'public' {
  switch (trust) {
    case 'full':
    case 'shell':
      return 'main';
    case 'write':
      return 'dm';
    case 'llm':
    case 'read':
      return 'group';
    default:
      return 'public';
  }
}

/**
 * Create an OpenClaw-integrated executor
 */
export function createOpenClawExecutor(options: OpenClawExecutorOptions): {
  executor: SafeExecutor;
  execute: (
    skillPath: string,
    args: Record<string, any>,
    source: MessageSource
  ) => Promise<ExecutionResult>;
} {
  const config = options.config ?? loadSafeExecutorConfig();
  const selfIds = options.selfIds ?? config.selfIds ?? [];
  
  // Build rate limiter options based on strictness
  const rateLimiterOptions: RateLimiterOptions = {
    selfIds,
    perRequester: options.strictRateLimiting
      ? { maxRequests: 5, windowMs: 60000, maxConcurrent: 1 }
      : { maxRequests: 20, windowMs: 60000, maxConcurrent: 3 },
    global: options.strictRateLimiting
      ? { maxRequests: 50, windowMs: 60000, maxConcurrent: 5 }
      : { maxRequests: 200, windowMs: 60000, maxConcurrent: 20 },
    cooldownMs: options.strictRateLimiting ? 60000 : 30000,
  };
  
  const executor = new SafeExecutor({
    selfIds,
    rateLimiter: rateLimiterOptions,
    onRateLimited: options.onRateLimited,
  });
  
  async function execute(
    skillPath: string,
    args: Record<string, any>,
    source: MessageSource
  ): Promise<ExecutionResult> {
    const trustLevel = getTrustLevelFromSource(source);
    
    const context: ExecutionContext = {
      source: trustLevelToSource(trustLevel),
      userId: source.userId,
      channelId: source.channelId,
      workdir: options.workspaceRoot,
      allowedHosts: options.allowedHosts ?? config.allowedHosts ?? [],
      llmPredict: options.llmPredict,
    };
    
    const result = await executor.execute(skillPath, args, context);
    
    options.onExecute?.(skillPath, result);
    
    return result;
  }
  
  return { executor, execute };
}
