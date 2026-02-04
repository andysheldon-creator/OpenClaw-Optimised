/**
 * Native Ollama API client wrapping /api/generate and /api/tags.
 *
 * CRITICAL: The `context` array is STRIPPED by default from responses.
 * This array can contain tens of thousands of token IDs and floods logs.
 */
import { OllamaApiError } from "../errors.js";
import type {
  NativeGenerateParams,
  NativeGenerateResponse,
  NativeGenerateResponseRaw,
  OllamaTagsResponse,
  OllamaTransportConfig,
  PingResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Configuration for native Ollama client.
 */
export interface NativeClientConfig extends OllamaTransportConfig {
  /** Whether to include context array in responses. Default: false (STRIPPED) */
  includeContext?: boolean;
}

/**
 * Strip the context array from a native response.
 * This is the default behavior to avoid flooding logs.
 */
function stripContext(raw: NativeGenerateResponseRaw): NativeGenerateResponse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { context: _context, ...rest } = raw;
  return rest;
}

/**
 * Create a native Ollama client.
 *
 * @param config - Transport configuration
 * @returns Client with generate and ping methods
 */
export function createNativeClient(config: NativeClientConfig) {
  const { baseUrl, timeout = DEFAULT_TIMEOUT_MS, includeContext = false } = config;

  /**
   * Generate text using /api/generate endpoint.
   *
   * @param params - Generation parameters
   * @returns Response with context array STRIPPED by default
   */
  async function generate(params: NativeGenerateParams): Promise<NativeGenerateResponse> {
    const url = `${baseUrl}/api/generate`;
    const body = {
      model: params.model,
      prompt: params.prompt,
      stream: params.stream ?? false,
      options: params.options,
      system: params.system,
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
        message: `Ollama /api/generate failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        code: `http_${response.status}`,
        status: response.status,
        endpoint: "/api/generate",
      });
    }

    const raw = (await response.json()) as NativeGenerateResponseRaw;

    // Strip context array by default (it's huge and pollutes logs)
    const shouldInclude = params.includeContext ?? includeContext;
    return shouldInclude ? raw : stripContext(raw);
  }

  /**
   * Ping Ollama using /api/tags endpoint.
   * Returns list of available models.
   */
  async function ping(): Promise<PingResult> {
    const url = `${baseUrl}/api/tags`;
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

      const data = (await response.json()) as OllamaTagsResponse;
      const models = data.models?.map((m) => m.name) ?? [];

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
    generate,
    ping,
    /** Base URL for this client */
    baseUrl,
  };
}

export type NativeClient = ReturnType<typeof createNativeClient>;
