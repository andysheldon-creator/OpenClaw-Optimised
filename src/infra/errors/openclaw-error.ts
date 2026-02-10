import type { ErrorShape } from "../../gateway/protocol/schema/types.js";
import type { OpenClawErrorCode } from "./error-codes.js";

export type ErrorContext = Record<string, unknown>;

export type OpenClawErrorOptions = {
  code: OpenClawErrorCode;
  context?: ErrorContext;
  cause?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
};

export class OpenClawError extends Error {
  readonly code: OpenClawErrorCode;
  readonly context: ErrorContext;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(message: string, options: OpenClawErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "OpenClawError";
    this.code = options.code;
    this.context = options.context ?? {};
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;

    if (options.cause instanceof Error && options.cause.stack && this.stack) {
      this.stack = `${this.stack}\n  Caused by: ${options.cause.stack}`;
    }
  }

  toErrorShape(): ErrorShape {
    const shape: ErrorShape = {
      code: this.code,
      message: this.message || this.code,
      retryable: this.retryable,
    };

    if (this.retryAfterMs != null) {
      shape.retryAfterMs = this.retryAfterMs;
    }
    if (Object.keys(this.context).length > 0) {
      shape.details = this.context;
    }

    return shape;
  }

  toLogContext(): Record<string, unknown> {
    const logContext: Record<string, unknown> = {
      errorName: this.name,
      errorCode: this.code,
      errorMessage: this.message,
      retryable: this.retryable,
      ...this.context,
    };

    if (this.retryAfterMs != null) {
      logContext.retryAfterMs = this.retryAfterMs;
    }
    if (this.cause instanceof Error) {
      logContext.causeName = this.cause.name;
      logContext.causeMessage = this.cause.message;
    } else if (this.cause != null) {
      if (typeof this.cause === "string") {
        logContext.cause = this.cause;
      } else {
        try {
          logContext.cause = JSON.stringify(this.cause);
        } catch {
          logContext.cause = Object.prototype.toString.call(this.cause);
        }
      }
    }

    return logContext;
  }
}
