/**
 * Claude Code-style hooks system.
 *
 * @see https://code.claude.com/docs/en/hooks
 */

// Types
export type {
  ClaudeHookEvent,
  ClaudeHookHandlerBase,
  ClaudeHookCommandHandler,
  ClaudeHookPromptHandler,
  ClaudeHookAgentHandler,
  ClaudeHookHandler,
  ClaudeHookMatcher,
  ClaudeHookRule,
  ClaudeHookInputBase,
  ClaudeHookPreToolUseInput,
  ClaudeHookPostToolUseInput,
  ClaudeHookPostToolUseFailureInput,
  ClaudeHookUserPromptSubmitInput,
  ClaudeHookStopInput,
  ClaudeHookSubagentStartInput,
  ClaudeHookSubagentStopInput,
  ClaudeHookPreCompactInput,
  ClaudeHookInput,
  ClaudeHookDecision,
  ClaudeHookOutput,
  ClaudeHookEventConfig,
  ClaudeHooksConfig,
} from "./types.js";

// Schemas and utilities
export {
  ClaudeHookCommandHandlerSchema,
  ClaudeHookPromptHandlerSchema,
  ClaudeHookAgentHandlerSchema,
  ClaudeHookHandlerSchema,
  ClaudeHookRuleSchema,
  ClaudeHookEventConfigSchema,
  ClaudeHooksConfigSchema,
  isClaudeHooksEnabled,
  parseClaudeHooksConfig,
} from "./config.js";

// Executor
export {
  runClaudeHook,
  runCommandHook,
  parseCommand,
  getHandlerId,
  recordSuccess,
  recordFailure,
  isDisabled,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  DEFAULT_TIMEOUTS,
  type CommandHookResult,
} from "./executor.js";

// Registry
export {
  matchHooks,
  matchesPattern,
  getRulesForEvent,
  hasHooksForEvent,
  getPatternsForEvent,
  countHandlersForEvent,
  getClaudeHooksFromSettings,
} from "./registry.js";

// Sanitization
export { sanitizeForHook } from "./sanitize.js";

// Hook implementations
export {
  runPostToolUseHooks,
  runPostToolUseFailureHooks,
  hasPostToolUseHooks,
  hasPostToolUseFailureHooks,
  type PostToolUseHookInput,
  type PostToolUseFailureHookInput,
} from "./hooks/post-tool-use.js";

export {
  runUserPromptSubmitHooks,
  hasUserPromptSubmitHooks,
  type UserPromptSubmitHookInput,
  type UserPromptSubmitHookResult,
} from "./hooks/user-prompt.js";

export {
  runStopHooks,
  hasStopHooks,
  type StopHookInput,
  type StopHookResult,
} from "./hooks/stop.js";

export {
  runSubagentStartHooks,
  runSubagentStopHooks,
  hasSubagentStartHooks,
  hasSubagentStopHooks,
  type SubagentStartHookInput,
  type SubagentStartHookResult,
  type SubagentStopHookInput,
} from "./hooks/subagent.js";

export {
  runPreCompactHooks,
  hasPreCompactHooks,
  type PreCompactHookInput,
} from "./hooks/pre-compact.js";
