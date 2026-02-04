/**
 * OpenAI-compatible Ollama client wrapping /v1/chat/completions and /v1/models.
 *
 * This is the production client - OpenAI-compatible API doesn't have the
 * context array issue that the native API has.
 */
import { OllamaApiError } from "../errors.js";
import type {
  ChatCompletionParams,
  ChatCompletionResponse,
  OllamaTransportConfig,
  OpenAIModelsResponse,
  PingResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Configuration for OpenAI-compatible Ollama client.
 */
export interface OpenAIClientConfig extends OllamaTransportConfig {}

/**
 * Create an OpenAI-compatible Ollama client.
 *
 * @param config - Transport configuration (baseUrl should end with /v1)
 * @returns Client with chat and ping methods
 */
export function createOpenAIClient(config: OpenAIClientConfig) {
  const { baseUrl, timeout = DEFAULT_TIMEOUT_MS } = config;

  // Ensure baseUrl ends with /v1 for OpenAI-compatible endpoints
  const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;

  /**
   * Send a chat completion request.
   *
   * @param params - Chat completion parameters
   * @returns Chat completion response
   */
  async function chat(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
    const url = `${normalizedBaseUrl}/chat/completions`;
    const body = {
      model: params.model,
      messages: params.messages,
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      stream: params.stream ?? false,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OllamaApiError({
        message: `Ollama /v1/chat/completions failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        code: `http_${response.status}`,
        status: response.status,
        endpoint: "/v1/chat/completions",
      });
    }

    return (await response.json()) as ChatCompletionResponse;
  }

  /**
   * Ping Ollama using /v1/models endpoint.
   * Returns list of available models.
   */
  async function ping(): Promise<PingResult> {
    const url = `${normalizedBaseUrl}/models`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(timeout),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          available: false,
          models: [],
          error: `HTTP ${response.status} ${response.statusText}`,
          latencyMs,
        };
      }

      const data = (await response.json()) as OpenAIModelsResponse;
      const models = data.data?.map((m) => m.id) ?? [];

      return {
        available: true,
        models,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return {
        available: false,
        models: [],
        error: err instanceof Error ? err.message : String(err),
        latencyMs,
      };
    }
  }

  return {
    chat,
    ping,
    /** Base URL for this client (normalized to end with /v1) */
    baseUrl: normalizedBaseUrl,
  };
}

export type OpenAIClient = ReturnType<typeof createOpenAIClient>;
