/**
 * Client types for Ollama API wrappers.
 *
 * IMPORTANT: We define OllamaTransportConfig separately from ProviderConfig
 * to avoid mutating the shared provider config object. The transport config
 * contains only what's needed for HTTP requests.
 */

/**
 * Transport configuration for Ollama clients.
 *
 * This is separate from ProviderConfig to avoid corrupting shared provider metadata.
 * Extract the URL you need and pass it here.
 */
export interface OllamaTransportConfig {
  /** Base URL for API requests (e.g., "http://127.0.0.1:11434" for native, "http://127.0.0.1:11434/v1" for OpenAI) */
  baseUrl: string;
  /** Request timeout in milliseconds. Default: 120000 (2 minutes) */
  timeout?: number;
}

/**
 * Native Ollama API response from /api/generate.
 *
 * The `context` field is STRIPPED by default to avoid flooding logs.
 */
export interface NativeGenerateResponse {
  /** Generated text response */
  response: string;
  /** Whether generation is complete */
  done: boolean;
  /** Reason for completion (e.g., "stop", "length") */
  done_reason?: string;
  /** Number of tokens generated */
  eval_count?: number;
  /** Number of tokens in the prompt (after Ollama's truncation) */
  prompt_eval_count?: number;
  /** Total duration in nanoseconds */
  total_duration?: number;
  /** Model load duration in nanoseconds */
  load_duration?: number;
  /** Prompt evaluation duration in nanoseconds */
  prompt_eval_duration?: number;
  /** Response generation duration in nanoseconds */
  eval_duration?: number;
  // context: number[]  <-- STRIPPED by default (huge array of token IDs)
}

/**
 * Raw native response before context stripping.
 */
export interface NativeGenerateResponseRaw extends NativeGenerateResponse {
  /** Token IDs for KV cache (HUGE - stripped by default) */
  context?: number[];
}

/**
 * Parameters for native /api/generate endpoint.
 */
export interface NativeGenerateParams {
  /** Model name (e.g., "llama3.1:8b") */
  model: string;
  /** Prompt text */
  prompt: string;
  /** Whether to stream response. Default: false */
  stream?: boolean;
  /** Generation options */
  options?: {
    /** Maximum tokens to generate */
    num_predict?: number;
    /** Context window size */
    num_ctx?: number;
    /** Temperature for sampling */
    temperature?: number;
    /** Top-p sampling */
    top_p?: number;
    /** Top-k sampling */
    top_k?: number;
  };
  /** System prompt (prepended to prompt) */
  system?: string;
  /** Whether to include context array in response. Default: false */
  includeContext?: boolean;
}

/**
 * Response from /api/tags endpoint.
 */
export interface OllamaTagsResponse {
  models: Array<{
    name: string;
    modified_at?: string;
    size?: number;
    digest?: string;
    details?: {
      family?: string;
      parameter_size?: string;
    };
  }>;
}

/**
 * Response from OpenAI-compatible /v1/models endpoint.
 */
export interface OpenAIModelsResponse {
  data: Array<{
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
  object?: string;
}

/**
 * Ping result from availability check.
 */
export interface PingResult {
  /** Whether the endpoint is reachable */
  available: boolean;
  /** List of available model names */
  models: string[];
  /** Error message if not available */
  error?: string;
  /** Response time in milliseconds */
  latencyMs?: number;
}

/**
 * OpenAI-compatible chat message.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Parameters for OpenAI-compatible /v1/chat/completions endpoint.
 */
export interface ChatCompletionParams {
  /** Model name */
  model: string;
  /** Chat messages */
  messages: ChatMessage[];
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Temperature for sampling */
  temperature?: number;
  /** Whether to stream response. Default: false */
  stream?: boolean;
}

/**
 * OpenAI-compatible chat completion response.
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
