/**
 * OpenClaw Identity Guard
 *
 * Prevents identity impersonation by stripping user-provided identity fields
 * from incoming requests. Identity should only come from authenticated sessions
 * or the bot's own identity.
 *
 * Fields that are stripped:
 * - agent_id (when user-provided, not session-derived)
 * - display_name (when attempting to override)
 * - actor (when user-provided)
 * - impersonate / impersonate_as
 * - post_as / send_as
 * - from_user / from_id
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("security/identity-guard");

/**
 * Fields that should never be accepted from user input
 */
const FORBIDDEN_IDENTITY_FIELDS = [
  "impersonate",
  "impersonate_as",
  "impersonateAs",
  "post_as",
  "postAs",
  "send_as",
  "sendAs",
  "as_user",
  "asUser",
  "from_user",
  "fromUser",
  "from_id",
  "fromId",
  "actor_id",
  "actorId",
  "override_identity",
  "overrideIdentity",
  "spoof",
  "spoof_as",
];

/**
 * Fields that are allowed but should be logged when present
 */
const MONITORED_IDENTITY_FIELDS = ["agent_id", "agentId", "display_name", "displayName", "actor"];

export type IdentityGuardResult = {
  sanitized: boolean;
  strippedFields: string[];
  originalFieldCount: number;
};

/**
 * Strips forbidden identity fields from an object
 */
export function stripIdentityFields<T extends Record<string, unknown>>(
  input: T,
  options?: { silent?: boolean },
): { output: T; result: IdentityGuardResult } {
  if (!input || typeof input !== "object") {
    return {
      output: input,
      result: { sanitized: false, strippedFields: [], originalFieldCount: 0 },
    };
  }

  const strippedFields: string[] = [];
  const output = { ...input };
  const originalFieldCount = Object.keys(input).length;

  // Strip forbidden fields
  for (const field of FORBIDDEN_IDENTITY_FIELDS) {
    if (field in output) {
      delete (output as Record<string, unknown>)[field];
      strippedFields.push(field);
    }
  }

  // Check for monitored fields (log but don't strip)
  if (!options?.silent) {
    for (const field of MONITORED_IDENTITY_FIELDS) {
      if (field in output && output[field] !== undefined) {
        // Log that a monitored field was present
        log.debug(`identity field '${field}' present in request (monitoring only)`);
      }
    }
  }

  // Log if any fields were stripped
  if (strippedFields.length > 0 && !options?.silent) {
    log.warn(
      `SECURITY_EVENT: stripped ${strippedFields.length} identity field(s): ${strippedFields.join(", ")}`,
    );
  }

  return {
    output,
    result: {
      sanitized: strippedFields.length > 0,
      strippedFields,
      originalFieldCount,
    },
  };
}

/**
 * Checks if an object contains any forbidden identity fields
 */
export function containsForbiddenIdentityFields(input: Record<string, unknown>): {
  hasForbidden: boolean;
  fields: string[];
} {
  if (!input || typeof input !== "object") {
    return { hasForbidden: false, fields: [] };
  }

  const foundFields: string[] = [];

  for (const field of FORBIDDEN_IDENTITY_FIELDS) {
    if (field in input && input[field] !== undefined) {
      foundFields.push(field);
    }
  }

  return {
    hasForbidden: foundFields.length > 0,
    fields: foundFields,
  };
}

/**
 * Deep strips identity fields from nested objects
 */
export function deepStripIdentityFields<T>(
  input: T,
  options?: { maxDepth?: number; currentDepth?: number },
): T {
  const maxDepth = options?.maxDepth ?? 10;
  const currentDepth = options?.currentDepth ?? 0;

  if (currentDepth >= maxDepth) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) =>
      deepStripIdentityFields(item, { maxDepth, currentDepth: currentDepth + 1 }),
    ) as T;
  }

  if (input && typeof input === "object") {
    const { output } = stripIdentityFields(input as Record<string, unknown>, { silent: true });

    // Recursively process nested objects
    for (const key of Object.keys(output)) {
      const value = output[key];
      if (value && typeof value === "object") {
        output[key] = deepStripIdentityFields(value, {
          maxDepth,
          currentDepth: currentDepth + 1,
        });
      }
    }

    return output as T;
  }

  return input;
}

/**
 * Validates that identity comes from a trusted source
 */
export function validateIdentitySource(params: {
  sessionUserId?: string;
  requestUserId?: string;
  botIdentity?: string;
}): { valid: boolean; resolvedIdentity: string | undefined; source: string } {
  const { sessionUserId, requestUserId, botIdentity } = params;

  // Priority 1: Session-derived identity (most trusted)
  if (sessionUserId) {
    if (requestUserId && requestUserId !== sessionUserId) {
      log.warn(
        `SECURITY_EVENT: identity mismatch - session: ${sessionUserId}, request: ${requestUserId} (using session)`,
      );
    }
    return {
      valid: true,
      resolvedIdentity: sessionUserId,
      source: "session",
    };
  }

  // Priority 2: Bot identity (for automated messages)
  if (botIdentity) {
    return {
      valid: true,
      resolvedIdentity: botIdentity,
      source: "bot",
    };
  }

  // No trusted identity available
  if (requestUserId) {
    log.warn(`SECURITY_EVENT: untrusted identity rejected - ${requestUserId}`);
  }

  return {
    valid: false,
    resolvedIdentity: undefined,
    source: "none",
  };
}

/**
 * Middleware-style function to sanitize request bodies
 */
export function createIdentityGuardMiddleware(): (
  body: Record<string, unknown>,
) => Record<string, unknown> {
  return (body: Record<string, unknown>) => {
    const { output } = stripIdentityFields(body);
    return output;
  };
}

/**
 * Gets list of forbidden fields for documentation
 */
export function getForbiddenIdentityFields(): string[] {
  return [...FORBIDDEN_IDENTITY_FIELDS];
}

/**
 * Gets list of monitored fields for documentation
 */
export function getMonitoredIdentityFields(): string[] {
  return [...MONITORED_IDENTITY_FIELDS];
}
