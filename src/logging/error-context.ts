/**
 * Enhanced error context tracking
 * Adds session key, operation trace, and structured error information
 */

export type OperationContext = {
  sessionKey?: string;
  operation?: string;
  tool?: string;
  timestamp?: number;
  breadcrumbs?: string[];
};

export type ContextualError = {
  message: string;
  code?: string;
  context: OperationContext;
  originalError?: Error;
  sanitized?: boolean;
};

const operationStack: OperationContext[] = [];

/**
 * Set the current operation context (for nested operations)
 */
export function pushOperation(ctx: Partial<OperationContext>): void {
  operationStack.push({
    sessionKey: ctx.sessionKey,
    operation: ctx.operation,
    tool: ctx.tool,
    timestamp: ctx.timestamp ?? Date.now(),
    breadcrumbs: ctx.breadcrumbs ?? [],
  });
}

/**
 * Pop the current operation context
 */
export function popOperation(): OperationContext | undefined {
  return operationStack.pop();
}

/**
 * Get the current operation context
 */
export function getCurrentOperation(): OperationContext | undefined {
  return operationStack[operationStack.length - 1];
}

/**
 * Clear all operation contexts
 */
export function clearOperationStack(): void {
  operationStack.length = 0;
}

/**
 * Add a breadcrumb to the current operation
 */
export function addBreadcrumb(message: string): void {
  const current = getCurrentOperation();
  if (current) {
    current.breadcrumbs ??= [];
    current.breadcrumbs.push(`[${new Date().toISOString()}] ${message}`);
  }
}

/**
 * Sanitize an error for safe transmission (e.g., to Slack)
 */
export function sanitizeError(err: Error | unknown): {
  message: string;
  sanitized: boolean;
} {
  if (!(err instanceof Error)) {
    return {
      message: String(err),
      sanitized: true,
    };
  }

  // Remove sensitive paths and keys from message
  let message = err.message;

  // Remove file paths
  message = message.replace(
    /\/[^\s]*(\/\.openclawrc|\.env|secrets?|tokens?|keys?)[^\s]*/gi,
    "[REDACTED_PATH]",
  );

  // Remove token-like strings (long hex/base64 sequences)
  message = message.replace(/[a-zA-Z0-9]{32,}/g, "[REDACTED_TOKEN]");

  // Remove URLs with secrets
  message = message.replace(/https?:\/\/[^\s]*(?:token|key|secret|auth)[^\s]*/gi, "[REDACTED_URL]");

  const sanitized = message !== err.message;

  return { message, sanitized };
}

/**
 * Create a contextual error with session and operation information
 */
export function createContextualError(
  message: string,
  options?: {
    code?: string;
    context?: Partial<OperationContext>;
    originalError?: Error;
  },
): ContextualError {
  const currentOperation = getCurrentOperation();
  const context: OperationContext = {
    sessionKey: options?.context?.sessionKey ?? currentOperation?.sessionKey,
    operation: options?.context?.operation ?? currentOperation?.operation,
    tool: options?.context?.tool ?? currentOperation?.tool,
    timestamp: options?.context?.timestamp ?? Date.now(),
    breadcrumbs: options?.context?.breadcrumbs ?? [...(currentOperation?.breadcrumbs ?? [])],
  };

  return {
    message,
    code: options?.code,
    context,
    originalError: options?.originalError,
    sanitized: false,
  };
}

/**
 * Format a contextual error for logging
 */
export function formatContextualError(err: ContextualError): string {
  const parts: string[] = [];

  if (err.context.sessionKey) {
    parts.push(`[${err.context.sessionKey.slice(0, 8)}]`);
  }

  if (err.context.operation) {
    parts.push(`{${err.context.operation}}`);
  }

  if (err.code) {
    parts.push(`ERR_${err.code}`);
  }

  parts.push(err.message);

  if (err.context.breadcrumbs && err.context.breadcrumbs.length > 0) {
    parts.push(`\nBreadcrumbs:\n${err.context.breadcrumbs.join("\n")}`);
  }

  return parts.join(" ");
}

/**
 * Sanitize a contextual error for safe Slack delivery
 */
export function sanitizeContextualErrorForSlack(err: ContextualError): ContextualError {
  const { message, sanitized } = sanitizeError(new Error(err.message));

  // Also sanitize breadcrumbs
  const sanitizedBreadcrumbs = (err.context.breadcrumbs ?? []).map((crumb) => {
    const { message: sanitizedMessage } = sanitizeError(new Error(crumb));
    return sanitizedMessage;
  });

  return {
    ...err,
    message,
    sanitized: true,
    context: {
      ...err.context,
      breadcrumbs: sanitizedBreadcrumbs,
    },
  };
}
