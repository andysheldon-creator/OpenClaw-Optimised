/**
 * Agent Execution Layer
 *
 * Unified orchestration architecture for agent execution.
 * All agent runs flow through this layer with consistent runtime selection,
 * execution, normalization, event emission, and state persistence.
 *
 * @see docs/design/plans/opus/01-agent-execution-layer.md
 */

// Core types
export type {
  // Event types
  ExecutionEvent,
  ExecutionEventKind,
  EventListener,
  Unsubscribe,
  // Callback types
  OnPartialReplyCallback,
  OnToolStartCallback,
  OnToolEndCallback,
  OnExecutionEventCallback,
  // Request/Result types
  ExecutionRequest,
  ExecutionResult,
  ExecutionRuntimeInfo,
  MessageContext,
  // Internal types (for layer components)
  TurnOutcome,
  RuntimeContext,
  RuntimeCapabilities,
  ToolPolicy,
  SandboxContext,
  // Metrics and summaries
  UsageMetrics,
  ToolCallSummary,
  // Error types
  ExecutionError,
  ExecutionErrorKind,
  // Config types
  ExecutionConfig,
  ExecutionEntryPointFlags,
} from "./types.js";

// Feature flag utilities
export {
  useNewExecutionLayer,
  anyNewExecutionLayerEnabled,
  getExecutionLayerStatus,
  type ExecutionEntryPoint,
} from "./feature-flag.js";

// Event Router
export {
  EventRouter,
  createEventRouter,
  createLegacyEventAdapter,
  // Hook mapping
  EVENT_TO_HOOK_MAP,
  getHookForEventKind,
  // Event builder helpers
  createEvent,
  createLifecycleStartEvent,
  createLifecycleEndEvent,
  createLifecycleErrorEvent,
  createToolStartEvent,
  createToolEndEvent,
  createAssistantPartialEvent,
  createAssistantCompleteEvent,
  createCompactionStartEvent,
  createCompactionEndEvent,
  createHookTriggeredEvent,
  type EventRouterLogger,
  type EventRouterOptions,
} from "./events.js";

// State Service
export {
  DefaultStateService,
  createStateService,
  hasNonzeroUsageMetrics,
  type StateService,
  type StatePersistOptions,
  type CompactionUpdateResult,
  type CompactionUpdateOptions,
  type StateServiceLogger,
  type StateServiceOptions,
} from "./state.js";
