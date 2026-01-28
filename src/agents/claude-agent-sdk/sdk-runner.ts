/**
 * Claude Agent SDK runner.
 *
 * Executes agent turns using the Claude Agent SDK, handling authentication,
 * event streaming, hooks, and result adaptation.
 */

import type { SdkRunnerParams, SdkProviderEnv } from "./types.js";
import type { CcSdkModelTiers } from "../../config/types.agents.js";
import type { AgentRuntimeResult } from "../agent-runtime.js";
import { loadClaudeAgentSdk, type ClaudeAgentSdkModule } from "./sdk-loader.js";
import { resolveProviderConfig } from "./provider-config.js";
import { buildSystemPromptAdditionsFromParams } from "./system-prompt.js";
import {
  classifyError,
  withRetry,
  DEFAULT_RETRY_OPTIONS,
  type CcsdkErrorKind,
} from "./error-handling.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("agents/claude-agent-sdk");

/**
 * Build environment variables for model tier configuration.
 *
 * The Claude Code SDK uses these environment variables to select models
 * for different task complexity tiers.
 */
function buildModelTierEnv(modelTiers?: CcSdkModelTiers): SdkProviderEnv {
  const env: SdkProviderEnv = {};

  if (modelTiers?.haiku) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelTiers.haiku;
  }
  if (modelTiers?.sonnet) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelTiers.sonnet;
  }
  if (modelTiers?.opus) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelTiers.opus;
  }

  return env;
}

/**
 * Internal result type from SDK execution.
 */
type SdkInternalResult = {
  texts: string[];
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  aborted?: boolean;
  error?: string;
};

/**
 * SDK event handler for streaming callbacks.
 */
type SdkEventHandler = {
  onText?: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolUse?: (toolName: string, toolId: string, input: unknown) => void;
  onToolResult?: (toolId: string, result: string, isError?: boolean) => void;
  onError?: (error: string) => void;
  onDone?: (usage?: SdkInternalResult["usage"]) => void;
};

/**
 * Run an agent turn using the Claude Agent SDK.
 *
 * This function:
 * 1. Runs before_agent_start hooks to allow context injection
 * 2. Loads the SDK dynamically
 * 3. Configures authentication based on available credentials
 * 4. Builds system prompt additions for Moltbot-specific context
 * 5. Executes the agent turn with the given prompt
 * 6. Streams events back to the caller via callbacks
 * 7. Runs agent_end hooks for post-processing
 * 8. Returns results in the standard AgentRuntimeResult format
 */
export async function runSdkAgent(params: SdkRunnerParams): Promise<AgentRuntimeResult> {
  const started = Date.now();
  const hookRunner = getGlobalHookRunner();

  // Emit lifecycle start event
  params.onAgentEvent?.({
    stream: "lifecycle",
    data: {
      phase: "start",
      runtime: "ccsdk",
      sessionId: params.sessionId,
      runId: params.runId,
    },
  });

  // ─── Run before_agent_start hooks ──────────────────────────────────────────
  let effectivePrompt = params.prompt;
  if (hookRunner?.hasHooks("before_agent_start")) {
    try {
      const hookResult = await hookRunner.runBeforeAgentStart(
        { prompt: params.prompt, messages: [] },
        {
          agentId: params.agentId ?? params.sessionKey?.split(":")[0] ?? "main",
          sessionKey: params.sessionKey,
          workspaceDir: params.workspaceDir,
        },
      );
      if (hookResult?.prependContext) {
        effectivePrompt = `${hookResult.prependContext}\n\n${params.prompt}`;
        log.debug(`hooks: prepended context to prompt (${hookResult.prependContext.length} chars)`);
      }
    } catch (hookErr) {
      log.warn(`before_agent_start hook failed: ${String(hookErr)}`);
    }
  }

  try {
    // Load the SDK
    const sdk = await loadClaudeAgentSdk();

    // Resolve provider configuration
    const providerConfig = params.providerConfig ?? resolveProviderConfig();

    log.info("Starting SDK agent run", {
      provider: providerConfig.name,
      model: params.model,
      sessionId: params.sessionId,
      runId: params.runId,
      reasoning: params.reasoningLevel ?? "off",
    });

    // Set up environment for the SDK
    const originalEnv = { ...process.env };
    try {
      // Apply provider environment variables
      for (const [key, value] of Object.entries(providerConfig.env)) {
        if (value !== undefined) {
          process.env[key] = value;
        }
      }

      // Apply model tier environment variables
      const modelTierEnv = buildModelTierEnv(params.modelTiers);
      for (const [key, value] of Object.entries(modelTierEnv)) {
        if (value !== undefined) {
          process.env[key] = value;
        }
      }

      // Build system prompt additions
      const systemPromptAdditions = buildSystemPromptAdditionsFromParams({
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        workspaceDir: params.workspaceDir,
        timezone: params.timezone,
        messageChannel: params.messageChannel,
        channelHints: params.channelHints,
        skills: params.skills,
      });

      // Combine with any legacy extra system prompt
      const combinedSystemPrompt =
        [systemPromptAdditions, params.extraSystemPrompt].filter(Boolean).join("\n\n") || undefined;

      // Build event handler for streaming callbacks
      const eventHandler = buildEventHandler(params);

      // Run the agent with retry logic
      const result = await withRetry(
        () =>
          runSdkAgentInternal(
            sdk,
            effectivePrompt,
            {
              model: params.model,
              workingDirectory: params.workspaceDir,
              sessionId: params.sessionId,
              systemPrompt: combinedSystemPrompt,
              timeout: params.timeoutMs,
              signal: params.abortSignal,
              reasoningLevel: params.reasoningLevel,
              maxOutputTokens: params.maxOutputTokens,
              maxThinkingTokens: params.maxThinkingTokens,
              ...params.sdkOptions,
            },
            eventHandler,
          ),
        {
          ...DEFAULT_RETRY_OPTIONS,
          maxRetries: 2,
          backoffMs: 1000,
          retryOn: ["rate_limit", "network", "timeout"] as CcsdkErrorKind[],
          abortSignal: params.abortSignal,
          onRetry: (attempt, error, delayMs) => {
            log.warn(`SDK agent retry attempt ${attempt}`, {
              error: error instanceof Error ? error.message : String(error),
              delayMs,
              sessionId: params.sessionId,
            });
            params.onAgentEvent?.({
              stream: "lifecycle",
              data: { phase: "retry", attempt, delayMs },
            });
          },
        },
      );

      // Build result
      const agentResult: AgentRuntimeResult = {
        payloads: result.texts.map((text) => ({ text })),
        meta: {
          durationMs: Date.now() - started,
          agentMeta: {
            sessionId: params.sessionId,
            provider: "anthropic",
            model: params.model ?? "claude-sonnet-4-20250514",
            usage: result.usage,
          },
          aborted: result.aborted,
        },
      };

      // Emit lifecycle end event
      params.onAgentEvent?.({
        stream: "lifecycle",
        data: {
          phase: "end",
          runtime: "ccsdk",
          startedAt: started,
          endedAt: Date.now(),
          aborted: result.aborted ?? false,
        },
      });

      // ─── Run agent_end hooks (fire-and-forget) ─────────────────────────────
      if (hookRunner?.hasHooks("agent_end")) {
        hookRunner
          .runAgentEnd(
            {
              messages: [],
              success: !result.aborted && !result.error,
              error: result.error,
              durationMs: Date.now() - started,
            },
            {
              agentId: params.agentId ?? params.sessionKey?.split(":")[0] ?? "main",
              sessionKey: params.sessionKey,
              workspaceDir: params.workspaceDir,
            },
          )
          .catch((err) => {
            log.warn(`agent_end hook failed: ${err}`);
          });
      }

      return agentResult;
    } finally {
      // Restore original environment
      const keysToRestore = [
        ...Object.keys(providerConfig.env),
        ...Object.keys(buildModelTierEnv(params.modelTiers)),
      ];
      for (const key of keysToRestore) {
        if (originalEnv[key] !== undefined) {
          process.env[key] = originalEnv[key];
        } else {
          delete process.env[key];
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorKind = classifyError(error);

    log.error("SDK agent run failed", {
      error: errorMessage,
      errorKind,
      sessionId: params.sessionId,
      runId: params.runId,
    });

    // Emit lifecycle error event
    params.onAgentEvent?.({
      stream: "lifecycle",
      data: {
        phase: "error",
        runtime: "ccsdk",
        startedAt: started,
        endedAt: Date.now(),
        error: errorMessage,
        errorKind,
      },
    });

    // Run agent_end hooks on error
    if (hookRunner?.hasHooks("agent_end")) {
      hookRunner
        .runAgentEnd(
          {
            messages: [],
            success: false,
            error: errorMessage,
            durationMs: Date.now() - started,
          },
          {
            agentId: params.agentId ?? params.sessionKey?.split(":")[0] ?? "main",
            sessionKey: params.sessionKey,
            workspaceDir: params.workspaceDir,
          },
        )
        .catch((err) => {
          log.warn(`agent_end hook failed: ${err}`);
        });
    }

    // Return error result
    return {
      payloads: [
        {
          text: `SDK agent error: ${errorMessage}`,
          isError: true,
        },
      ],
      meta: {
        durationMs: Date.now() - started,
        agentMeta: {
          sessionId: params.sessionId,
          provider: "anthropic",
          model: params.model ?? "unknown",
        },
        error: {
          kind: errorKind === "context_overflow" ? "context_overflow" : "compaction_failure",
          message: errorMessage,
        },
      },
    };
  }
}

/**
 * Build event handler for streaming callbacks.
 */
function buildEventHandler(params: SdkRunnerParams): SdkEventHandler {
  let assistantStarted = false;

  return {
    onText: (text) => {
      // Signal assistant message start
      if (!assistantStarted) {
        assistantStarted = true;
        params.onAssistantMessageStart?.();
      }

      // Stream partial reply
      params.onPartialReply?.({ text });

      // Forward as block reply if configured
      params.onBlockReply?.({ text });
    },

    onThinking: (text) => {
      params.onReasoningStream?.({ text });
    },

    onToolUse: (toolName, toolId, input) => {
      params.onAgentEvent?.({
        stream: "tool",
        data: {
          phase: "start",
          toolName,
          toolId,
          input,
        },
      });
    },

    onToolResult: (toolId, result, isError) => {
      // Check if we should emit this tool result
      const toolName = "unknown"; // Would need to track from onToolUse
      if (params.shouldEmitToolResult && !params.shouldEmitToolResult(toolName)) {
        return;
      }

      params.onToolResult?.({ text: result });
      params.onAgentEvent?.({
        stream: "tool",
        data: {
          phase: "end",
          toolId,
          result: params.shouldEmitToolOutput?.(toolName) ? result : undefined,
          isError,
        },
      });
    },

    onError: (error) => {
      params.onAgentEvent?.({
        stream: "error",
        data: { message: error },
      });
    },

    onDone: (usage) => {
      // Flush any pending block replies
      params.onBlockReplyFlush?.();

      params.onAgentEvent?.({
        stream: "done",
        data: { usage },
      });
    },
  };
}

/**
 * Internal SDK execution function.
 *
 * Calls the Claude Agent SDK's query function and processes the streaming response.
 * The SDK handles:
 * - Session resumption (via sessionId)
 * - Workspace context building
 * - Tool execution
 * - Conversation history
 */
async function runSdkAgentInternal(
  sdk: ClaudeAgentSdkModule,
  prompt: string,
  options: {
    model?: string;
    workingDirectory?: string;
    sessionId?: string;
    systemPrompt?: string;
    timeout?: number;
    signal?: AbortSignal;
    reasoningLevel?: string;
    maxOutputTokens?: number;
    maxThinkingTokens?: number;
    [key: string]: unknown;
  },
  eventHandler: SdkEventHandler,
): Promise<SdkInternalResult> {
  const texts: string[] = [];
  let usage: SdkInternalResult["usage"];
  let aborted = false;
  let error: string | undefined;

  try {
    // The Claude Agent SDK exports a `query` function that returns an async iterator
    // of events. The exact API shape may vary by SDK version.
    const queryFn = (sdk as { query?: unknown }).query;

    if (typeof queryFn !== "function") {
      // Check for alternative API shapes
      const claudeFn = (sdk as { claude?: unknown }).claude;
      const agentFn = (sdk as { agent?: unknown }).agent;

      if (typeof claudeFn === "function" || typeof agentFn === "function") {
        throw new Error(
          "Found alternative SDK API. Please update runSdkAgentInternal to use the correct interface.",
        );
      }

      throw new Error(
        "Claude Agent SDK query function not found. " +
          "Ensure @anthropic-ai/claude-agent-sdk is installed correctly.",
      );
    }

    // Build query options
    const queryOptions = {
      prompt,
      options: {
        cwd: options.workingDirectory,
        model: options.model,
        systemPrompt: options.systemPrompt,
        maxTurns: 50, // Reasonable default
        resume: options.sessionId, // Resume existing session
        abortController: options.signal ? { signal: options.signal } : undefined,
        // Thinking/reasoning configuration
        ...(options.reasoningLevel && options.reasoningLevel !== "off"
          ? {
              thinking: {
                type: "enabled",
                budgetTokens: options.maxThinkingTokens ?? 10000,
              },
            }
          : {}),
        ...(options.maxOutputTokens ? { maxTokens: options.maxOutputTokens } : {}),
      },
    };

    // Execute query and process events
    const response = await (
      queryFn as (opts: typeof queryOptions) => Promise<AsyncIterable<unknown>>
    )(queryOptions);

    // Process streaming events
    for await (const event of response) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }

      processEvent(event, texts, eventHandler, (u) => {
        usage = u;
      });
    }
  } catch (err) {
    if (options.signal?.aborted) {
      aborted = true;
    } else {
      error = err instanceof Error ? err.message : String(err);
      eventHandler.onError?.(error);
      throw err;
    }
  }

  // Notify completion
  eventHandler.onDone?.(usage);

  // Ensure we have at least one text response
  if (texts.length === 0 && !aborted && !error) {
    texts.push("(No response from agent)");
  }

  return { texts, usage, aborted, error };
}

/**
 * Process a single SDK event.
 */
function processEvent(
  event: unknown,
  texts: string[],
  handler: SdkEventHandler,
  setUsage: (u: SdkInternalResult["usage"]) => void,
): void {
  if (!event || typeof event !== "object") return;

  const evt = event as Record<string, unknown>;
  const type = evt.type as string | undefined;

  switch (type) {
    case "text":
    case "content_block_delta": {
      const text = (evt.text as string) ?? (evt.delta as { text?: string })?.text;
      if (text) {
        texts.push(text);
        handler.onText?.(text);
      }
      break;
    }

    case "thinking":
    case "thinking_delta": {
      const thinking = (evt.thinking as string) ?? (evt.delta as { thinking?: string })?.thinking;
      if (thinking) {
        handler.onThinking?.(thinking);
      }
      break;
    }

    case "tool_use":
    case "tool_use_start": {
      const name = evt.name as string;
      const id = evt.id as string;
      const input = evt.input;
      if (name && id) {
        handler.onToolUse?.(name, id, input);
      }
      break;
    }

    case "tool_result": {
      const toolId = (evt.tool_use_id as string) ?? (evt.id as string);
      const content = evt.content as string;
      const isError = evt.is_error as boolean;
      if (toolId) {
        handler.onToolResult?.(toolId, content ?? "", isError);
      }
      break;
    }

    case "message_stop":
    case "done":
    case "result": {
      const eventUsage = evt.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          }
        | undefined;
      if (eventUsage) {
        setUsage({
          input: eventUsage.input_tokens,
          output: eventUsage.output_tokens,
          cacheRead: eventUsage.cache_read_input_tokens,
          cacheWrite: eventUsage.cache_creation_input_tokens,
        });
      }
      // Extract final text if present
      const resultText = (evt.result as string) ?? (evt.text as string);
      if (resultText && !texts.includes(resultText)) {
        texts.push(resultText);
        handler.onText?.(resultText);
      }
      break;
    }

    case "error": {
      const errorMsg =
        (evt.error as { message?: string })?.message ?? (evt.message as string) ?? "Unknown error";
      handler.onError?.(errorMsg);
      break;
    }
  }
}
