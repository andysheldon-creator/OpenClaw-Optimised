/**
 * Pre-Answer Hooks for Agent Context Injection
 *
 * Hooks run before the agent generates a response, allowing automatic
 * context retrieval from external systems (memory search, RAG, database, etc.)
 */

import type { TemplateContext } from "../auto-reply/templating.js";
import type { SessionEntry } from "../config/sessions.js";
// Agent configuration type not exported, using unknown
// import type { ResolvedAgentConfig } from "./agent-scope.js";

/**
 * Context fragment to inject into the prompt
 */
export interface ContextFragment {
  /** The content to inject */
  content: string;
  /** Weight for ordering (optional) */
  weight?: number;
  /** Metadata for logging */
  metadata?: Record<string, unknown>;
}

/**
 * Result from a pre-answer hook execution
 */
export interface PreAnswerHookResult {
  /** Context fragments to inject */
  contextFragments: ContextFragment[];
  /** Optional metadata for logging/diagnostics */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters passed to pre-answer hooks
 */
export interface PreAnswerHookParams {
  /** User message/command body */
  commandBody: string;
  /** Session key */
  sessionKey?: string;
  /** Agent session entry */
  sessionEntry?: SessionEntry;
  /** Agent configuration */
  agentConfig?: unknown;
  /** Context from the message */
  sessionCtx: TemplateContext;
  /** Whether this is a heartbeat */
  isHeartbeat?: boolean;
  /** Original options passed to runReplyAgent */
  opts?: unknown;
}

/**
 * Definition of a pre-answer hook
 */
export interface PreAnswerHook {
  /** Unique hook identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Hook priority (lower = earlier execution, default: 100) */
  priority: number;
  /** Whether this hook is enabled by default */
  enabledByDefault?: boolean;
  /** Hook execution timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Hook execution function */
  execute: (params: PreAnswerHookParams) => Promise<PreAnswerHookResult>;

  /**
   * Optional filter to determine if hook should run for this request
   * e.g., skip for heartbeats, system commands, etc.
   */
  shouldExecute?: (params: PreAnswerHookParams) => boolean;
}

/**
 * Hook execution result with timing metadata
 */
export interface HookExecutionResult extends PreAnswerHookResult {
  /** Hook that produced this result */
  hook: PreAnswerHook;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error if execution failed */
  error?: Error;
}
