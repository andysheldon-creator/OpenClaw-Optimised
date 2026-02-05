import { Api, Model } from "@mariozechner/pi-ai/dist/types.js";
import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { getApiKeyForModel } from "../model-auth.js";
import { SHENGSUANYUN_BASE_URL } from "../shengsuanyun-models.js";

/**
 * ShengSuanYun generation task creation response
 */
interface ShengSuanYunTaskResponse {
  task_id: string;
  status: string;
  created_at?: string;
}

/**
 * ShengSuanYun task status response
 */
interface ShengSuanYunTaskStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at?: string;
  completed_at?: string;
  result?: {
    images?: string[];
    videos?: string[];
    error?: string;
  };
  error?: string;
}
const sampleModel: Model<Api> = {
  id: "openai/gpt-5-nano",
  name: "gpt-5-nano",
  api: "openai-completions" as Api,
  provider: "shengsuanyun",
  baseUrl: "https://router.shengsuanyun.com/api/v1",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 500,
    output: 4000,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 400000,
  maxTokens: 128000,
};
/**
 * Create a generation task on ShengSuanYun
 */
async function createGenerationTask(
  params: Record<string, unknown>,
): Promise<ShengSuanYunTaskResponse> {
  const res = await fetch(`${SHENGSUANYUN_BASE_URL}/tasks/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(params.apiKey)}`,
    },
    body: JSON.stringify({ ...params }),
    signal: AbortSignal.timeout(30000), // 30s timeout
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`Failed to create generation task: HTTP ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  return data as ShengSuanYunTaskResponse;
}

/**
 * Get the status of a generation task
 */
async function getTaskStatus(params: {
  apiKey: string;
  taskId: string;
}): Promise<ShengSuanYunTaskStatusResponse> {
  const res = await fetch(`${SHENGSUANYUN_BASE_URL}/tasks/generations/${params.taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${String(params.apiKey)}`,
    },
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    throw new Error(`Failed to get task status: HTTP ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return data as ShengSuanYunTaskStatusResponse;
}

/**
 * Create tool for ShengSuanYun generation task creation
 */
export function createShengSuanYunGenerationTool(options?: {
  config?: OpenClawConfig;
  agentDir?: string;
}): AnyAgentTool {
  return {
    label: "ShengSuanYun Generation",
    name: "shengsuanyun_create_generation",
    description:
      "Create a multimodal generation task on ShengSuanYun. Supports text-to-image, image-to-image, and other modality transformations. Returns a task_id that can be used to check the generation status.",
    parameters: Type.Object({
      model: Type.String({
        description: "The model to use for generation (e.g., 'google/gemini-3-pro-image-preview')",
      }),
      prompt: Type.String({
        description: "The text prompt describing what to generate",
      }),
      images: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional array of image URLs to use as input (for image-to-image tasks)",
        }),
      ),
      aspect_ratio: Type.Optional(
        Type.String({
          description: "Aspect ratio for the output (e.g., '16:9', '1:1', '9:16')",
        }),
      ),
      size: Type.Optional(
        Type.String({
          description: "Output size specification (e.g., '2K', '4K', '1024x1024')",
        }),
      ),
      response_modalities: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Expected output modalities (e.g., ['IMAGE'], ['VIDEO'], ['IMAGE', 'VIDEO'])",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const model = typeof record.model === "string" ? record.model.trim() : "";
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

      if (!model) {
        throw new Error("model parameter is required");
      }
      if (!prompt) {
        throw new Error("prompt parameter is required");
      }

      const agentDir = options?.agentDir?.trim();
      if (!agentDir) {
        throw new Error("agentDir is required for ShengSuanYun generation tool");
      }

      const apiKeyResult = await getApiKeyForModel({
        model: sampleModel,
        agentDir,
        cfg: options?.config,
      });

      if (!apiKeyResult.apiKey) {
        throw new Error("ShengSuanYun API key not configured");
      }

      const images = Array.isArray(record.images)
        ? record.images
            .filter((img): img is string => typeof img === "string")
            .map((img) => img.trim())
            .filter(Boolean)
        : undefined;

      const aspectRatio =
        typeof record.aspect_ratio === "string" && record.aspect_ratio.trim()
          ? record.aspect_ratio.trim()
          : undefined;

      const size =
        typeof record.size === "string" && record.size.trim() ? record.size.trim() : undefined;

      const responseModalities = Array.isArray(record.response_modalities)
        ? record.response_modalities
            .filter((mod): mod is string => typeof mod === "string")
            .map((mod) => mod.trim())
            .filter(Boolean)
        : undefined;

      const result = await createGenerationTask({
        apiKey: apiKeyResult.apiKey,
        model,
        prompt,
        images,
        aspectRatio,
        size,
        responseModalities,
      });

      return {
        content: [
          {
            type: "text",
            text: `Generation task created successfully. Task ID: ${result.task_id}\nStatus: ${result.status}\n\nUse the 'shengsuanyun_get_generation_status' tool with this task_id to check the generation progress.`,
          },
        ],
        details: {
          task_id: result.task_id,
          status: result.status,
          created_at: result.created_at,
        },
      };
    },
  };
}

/**
 * Create tool for checking ShengSuanYun generation task status
 */
export function createShengSuanYunStatusTool(options?: {
  config?: OpenClawConfig;
  agentDir?: string;
}): AnyAgentTool {
  return {
    label: "ShengSuanYun Status",
    name: "shengsuanyun_get_generation_status",
    description:
      "Check the status of a ShengSuanYun generation task. Returns the current status and result URLs if completed.",
    parameters: Type.Object({
      task_id: Type.String({
        description: "The task ID returned from shengsuanyun_create_generation",
      }),
    }),
    execute: async (_toolCallId, args) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const taskId = typeof record.task_id === "string" ? record.task_id.trim() : "";

      if (!taskId) {
        throw new Error("task_id parameter is required");
      }

      const agentDir = options?.agentDir?.trim();
      if (!agentDir) {
        throw new Error("agentDir is required for ShengSuanYun status tool");
      }

      // Get API key for ShengSuanYun
      const apiKeyResult = await getApiKeyForModel({
        model: sampleModel, // Not needed for status check
        agentDir,
        cfg: options?.config,
      });

      if (!apiKeyResult.apiKey) {
        throw new Error("ShengSuanYun API key not configured");
      }

      const result = await getTaskStatus({
        apiKey: apiKeyResult.apiKey,
        taskId,
      });

      let statusText = `Task Status: ${result.status}\n`;
      statusText += `Task ID: ${result.task_id}\n`;

      if (result.created_at) {
        statusText += `Created: ${result.created_at}\n`;
      }

      if (result.completed_at) {
        statusText += `Completed: ${result.completed_at}\n`;
      }

      if (result.status === "completed" && result.result) {
        if (result.result.images && result.result.images.length > 0) {
          statusText += `\nGenerated Images:\n`;
          for (const [index, imageUrl] of result.result.images.entries()) {
            statusText += `${index + 1}. ${imageUrl}\n`;
          }
        }
        if (result.result.videos && result.result.videos.length > 0) {
          statusText += `\nGenerated Videos:\n`;
          for (const [index, videoUrl] of result.result.videos.entries()) {
            statusText += `${index + 1}. ${videoUrl}\n`;
          }
        }
      } else if (result.status === "failed") {
        statusText += `\nError: ${result.error || result.result?.error || "Unknown error"}\n`;
      } else if (result.status === "pending" || result.status === "processing") {
        statusText += `\nThe task is still ${result.status}. Please check again later.\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: statusText,
          },
        ],
        details: {
          task_id: result.task_id,
          status: result.status,
          result: result.result,
          error: result.error,
        },
      };
    },
  };
}
