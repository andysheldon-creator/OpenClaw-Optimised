import { OpenClawErrorCodes, type OpenClawErrorCode } from "./error-codes.js";
import { OpenClawError } from "./openclaw-error.js";

type BoomLike = {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  name?: unknown;
};

const RETRYABLE_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"]);

function stringifyUnknown(value: unknown): string {
  if (value == null) {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "symbol") {
    return value.description ?? value.toString();
  }
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function toError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === "string") {
    return new Error(err);
  }
  if (err && typeof err === "object") {
    const boom = err as BoomLike;
    const message =
      typeof boom.message === "string" && boom.message.trim().length > 0
        ? boom.message
        : stringifyUnknown(err);
    const error = new Error(message);
    if (typeof boom.name === "string" && boom.name) {
      error.name = boom.name;
    }
    if (typeof boom.code === "string" || typeof boom.code === "number") {
      (error as NodeJS.ErrnoException).code = String(boom.code);
    }
    if (typeof boom.status === "number") {
      (error as Error & { status?: number }).status = boom.status;
    }
    return error;
  }
  return new Error(stringifyUnknown(err));
}

export function toOpenClawError(
  err: unknown,
  code: OpenClawErrorCode = OpenClawErrorCodes.INTERNAL_ERROR,
  context?: Record<string, unknown>,
): OpenClawError {
  if (err instanceof OpenClawError) {
    return err;
  }
  const normalized = toError(err);
  return new OpenClawError(normalized.message, {
    code,
    cause: normalized,
    context,
  });
}

export function formatErrorForLog(err: unknown): string {
  if (err instanceof OpenClawError) {
    if (err.stack) {
      return `[${err.code}] ${err.stack}`;
    }
    return `[${err.code}] ${err.message}`;
  }
  const normalized = toError(err);
  return normalized.stack ?? normalized.message ?? normalized.name;
}

export function formatErrorForUser(err: unknown): string {
  if (err instanceof OpenClawError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message || err.name || "An unexpected error occurred";
  }
  if (typeof err === "string") {
    return err;
  }
  return "An unexpected error occurred";
}

export function errorLogContext(err: unknown): Record<string, unknown> {
  if (err instanceof OpenClawError) {
    return err.toLogContext();
  }
  if (err instanceof Error) {
    const context: Record<string, unknown> = {
      errorName: err.name,
      errorMessage: err.message,
    };
    if ((err as NodeJS.ErrnoException).code) {
      context.errorCode = (err as NodeJS.ErrnoException).code;
    }
    if (err.stack) {
      context.stack = err.stack;
    }
    return context;
  }
  return {
    errorType: typeof err,
    errorValue: stringifyUnknown(err),
  };
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof OpenClawError) {
    return err.retryable;
  }
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code)) {
      return true;
    }
  }
  const normalized = toError(err);
  return RETRYABLE_ERROR_CODES.has((normalized as NodeJS.ErrnoException).code ?? "");
}
