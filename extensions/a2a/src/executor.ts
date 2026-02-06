import type {
  Message,
  Task,
  RequestContext,
  ExecutionEventBus,
  TextPart,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import type { AgentExecutor } from "@a2a-js/sdk/server";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";

import type { A2APluginConfig } from "./config.js";

// We'll call the gateway method to run the agent
type GatewayCall = (params: {
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

export type OpenClawAgentExecutorParams = {
  config: OpenClawConfig;
  pluginConfig: A2APluginConfig;
  runtime: PluginRuntime;
  callGateway: GatewayCall;
};

/**
 * OpenClaw AgentExecutor implementation.
 * Bridges A2A protocol requests to OpenClaw's agent execution system.
 */
export class OpenClawAgentExecutor implements AgentExecutor {
  private abortControllers = new Map<string, AbortController>();
  private config: OpenClawConfig;
  private pluginConfig: A2APluginConfig;
  private runtime: PluginRuntime;
  private callGateway: GatewayCall;

  constructor(params: OpenClawAgentExecutorParams) {
    this.config = params.config;
    this.pluginConfig = params.pluginConfig;
    this.runtime = params.runtime;
    this.callGateway = params.callGateway;
  }

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { taskId, userMessage } = requestContext;
    const agentId = this.pluginConfig.agentId ?? "main";

    // Generate a stable contextId if not provided, so multi-turn conversations work
    const effectiveContextId = requestContext.contextId ?? crypto.randomUUID();

    // Create abort controller for this task
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    // Build session key using contextId for multi-turn conversations
    const sessionKey = `agent:${agentId}:a2a:${effectiveContextId}`;

    // Extract text from message parts
    const text = userMessage.parts
      .filter((p): p is TextPart => p.kind === "text")
      .map((p) => p.text)
      .join("\n");

    if (!text.trim()) {
      // No text content - publish error and finish
      const errorMessage: Message = {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: "No text content in message" }],
        contextId: effectiveContextId,
      };
      eventBus.publish(errorMessage);
      eventBus.finished();
      this.abortControllers.delete(taskId);
      return;
    }

    try {
      // Publish initial Task to initialize it in the SDK's ResultManager
      const initialTask: Task = {
        kind: "task",
        id: taskId,
        contextId: effectiveContextId,
        status: {
          state: "working",
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
      };
      eventBus.publish(initialTask);

      // Call the agent via gateway method
      // Params must match AgentParamsSchema (additionalProperties: false)
      const result = await this.callGateway({
        method: "agent",
        params: {
          message: text,
          sessionKey,
          agentId,
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        },
        timeoutMs: 300_000, // 5 minute timeout
      });

      if (abortController.signal.aborted) {
        return;
      }

      if (!result.ok) {
        throw new Error(result.error ?? "Agent execution failed");
      }

      // Gateway "agent" response wire format (from ResponseFrameSchema + agent handler):
      //   callGateway resolves with data = msg.payload, which is:
      //   { runId: string, status: "ok", summary: "completed",
      //     result: { payloads: OutboundPayloadJson[], meta: EmbeddedPiRunMeta } }
      //   where OutboundPayloadJson = { text: string, mediaUrl: string|null, ... }
      type AgentPayload = {
        runId?: string;
        status?: string;
        summary?: string;
        result?: {
          payloads?: Array<{ text: string; mediaUrl?: string | null }>;
          meta?: Record<string, unknown>;
        };
      };
      const data = result.data as AgentPayload | undefined;

      console.log("[a2a:executor] gateway result.data:", JSON.stringify(data ?? null).slice(0, 1000));
      console.log("[a2a:executor] data.status:", data?.status);
      console.log("[a2a:executor] data.result keys:", data?.result ? Object.keys(data.result) : "no result");
      console.log("[a2a:executor] data.result.payloads:", JSON.stringify(data?.result?.payloads ?? null).slice(0, 500));

      if (data?.status === "error") {
        throw new Error(data.summary ?? "Agent execution failed");
      }

      const responseText =
        data?.result?.payloads
          ?.map((p) => p.text)
          .filter(Boolean)
          .join("\n\n") || "No response";

      console.log("[a2a:executor] responseText:", responseText.slice(0, 200));

      // Publish artifact with agent response
      const artifactUpdate: TaskArtifactUpdateEvent = {
        kind: "artifact-update",
        taskId,
        contextId: effectiveContextId,
        artifact: {
          artifactId: "response",
          parts: [{ kind: "text", text: responseText }],
        },
      };
      eventBus.publish(artifactUpdate);

      // Publish completed status (final: true stops the event generator)
      const completedStatus: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId: effectiveContextId,
        status: {
          state: "completed",
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(completedStatus);

      eventBus.finished();
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }

      const errorText = err instanceof Error ? err.message : String(err);

      // Publish error message before the final status-update.
      const errorMessage: Message = {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: `Error: ${errorText}` }],
        contextId: effectiveContextId,
      };
      eventBus.publish(errorMessage);

      // Publish failed status
      const failedStatus: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId: effectiveContextId,
        status: {
          state: "failed",
          timestamp: new Date().toISOString(),
          message: errorText,
        },
        final: true,
      };
      eventBus.publish(failedStatus);

      eventBus.finished();
    } finally {
      this.abortControllers.delete(taskId);
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);

    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
  }
}
