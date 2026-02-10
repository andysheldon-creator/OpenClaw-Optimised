import { OpenClawErrorCodes } from "./error-codes.js";
import { OpenClawError, type OpenClawErrorOptions } from "./openclaw-error.js";

type DomainErrorOptions = Omit<OpenClawErrorOptions, "code" | "context"> & {
  context?: Record<string, unknown>;
};

export class GatewayError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "gateway", ...options.context },
    });
    this.name = "GatewayError";
  }

  static connectionFailed(endpoint: string, cause: unknown): GatewayError {
    return new GatewayError(
      "Gateway connection failed",
      OpenClawErrorCodes.GATEWAY_CONNECTION_FAILED,
      {
        cause,
        retryable: true,
        context: { endpoint },
      },
    );
  }

  static parseFailed(payloadType: string, cause: unknown): GatewayError {
    return new GatewayError(
      "Gateway payload parse failed",
      OpenClawErrorCodes.GATEWAY_PARSE_FAILED,
      {
        cause,
        context: { payloadType },
      },
    );
  }

  static requestFailed(method: string, cause: unknown): GatewayError {
    return new GatewayError("Request handler failed", OpenClawErrorCodes.GATEWAY_REQUEST_FAILED, {
      cause,
      context: { method },
    });
  }
}

export class MemoryError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "memory", ...options.context },
    });
    this.name = "MemoryError";
  }

  static vectorUnavailable(index: string, cause?: unknown): MemoryError {
    return new MemoryError(
      "Vector store unavailable",
      OpenClawErrorCodes.MEMORY_VECTOR_UNAVAILABLE,
      {
        cause,
        retryable: true,
        retryAfterMs: 5000,
        context: { index },
      },
    );
  }

  static embeddingFailed(provider: string, cause: unknown): MemoryError {
    return new MemoryError(
      "Embedding generation failed",
      OpenClawErrorCodes.MEMORY_EMBEDDING_FAILED,
      {
        cause,
        retryable: true,
        context: { provider },
      },
    );
  }

  static indexFailed(index: string, cause: unknown): MemoryError {
    return new MemoryError("Memory indexing failed", OpenClawErrorCodes.MEMORY_INDEX_FAILED, {
      cause,
      context: { index },
    });
  }
}

export class ChannelError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "channel", ...options.context },
    });
    this.name = "ChannelError";
  }

  static sendFailed(channel: string, to: string, cause: unknown): ChannelError {
    return new ChannelError(
      "Failed to send outbound message",
      OpenClawErrorCodes.CHANNEL_SEND_FAILED,
      {
        cause,
        retryable: true,
        context: { channel, to },
      },
    );
  }

  static connectionLost(channel: string, cause?: unknown): ChannelError {
    return new ChannelError("Channel connection lost", OpenClawErrorCodes.CHANNEL_CONNECTION_LOST, {
      cause,
      retryable: true,
      context: { channel },
    });
  }
}

export class ToolError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "tool", ...options.context },
    });
    this.name = "ToolError";
  }

  static executionFailed(tool: string, cause: unknown): ToolError {
    return new ToolError("Tool execution failed", OpenClawErrorCodes.TOOL_EXECUTION_FAILED, {
      cause,
      context: { tool },
    });
  }

  static timeout(tool: string, timeoutMs: number, cause?: unknown): ToolError {
    return new ToolError("Tool execution timed out", OpenClawErrorCodes.TOOL_TIMEOUT, {
      cause,
      retryable: true,
      context: { tool, timeoutMs },
    });
  }
}

export class PluginError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "plugin", ...options.context },
    });
    this.name = "PluginError";
  }

  static loadFailed(pluginId: string, cause: unknown): PluginError {
    return new PluginError("Plugin load failed", OpenClawErrorCodes.PLUGIN_LOAD_FAILED, {
      cause,
      context: { pluginId },
    });
  }

  static hookFailed(pluginId: string, hookName: string, cause: unknown): PluginError {
    return new PluginError("Plugin hook failed", OpenClawErrorCodes.PLUGIN_HOOK_FAILED, {
      cause,
      context: { pluginId, hookName },
    });
  }
}

export class ConfigError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "config", ...options.context },
    });
    this.name = "ConfigError";
  }

  static validationFailed(path: string, reason: string): ConfigError {
    return new ConfigError(
      "Configuration validation failed",
      OpenClawErrorCodes.CONFIG_VALIDATION_FAILED,
      {
        context: { path, reason },
      },
    );
  }
}

export class BrowserError extends OpenClawError {
  constructor(
    message: string,
    code: OpenClawErrorOptions["code"],
    options: DomainErrorOptions = {},
  ) {
    super(message, {
      code,
      ...options,
      context: { module: "browser", ...options.context },
    });
    this.name = "BrowserError";
  }
}
