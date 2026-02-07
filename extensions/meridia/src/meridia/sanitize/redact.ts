/**
 * Sanitization and Redaction Guard (Component 12)
 *
 * Prevents secrets and unsafe payloads from being persisted or fanned out.
 * Applied before canonical store writes and before graph/vector fanout.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SanitizeConfig = {
  /** Max chars for tool args stored in records */
  maxArgChars: number;
  /** Max chars for tool results stored in records */
  maxResultChars: number;
  /** Patterns to redact from text (env vars, tokens, etc.) */
  redactPatterns: RegExp[];
};

// ────────────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_REDACT_PATTERNS: RegExp[] = [
  // API keys and tokens
  /(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
  // AWS-style keys
  /AKIA[0-9A-Z]{16}/g,
  // JWT tokens
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  // Generic long hex/base64 strings that look like secrets (64+ chars)
  /(?:sk-|pk-|ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_-]{20,}/g,
];

export const DEFAULT_SANITIZE_CONFIG: SanitizeConfig = {
  maxArgChars: 3000,
  maxResultChars: 5000,
  redactPatterns: DEFAULT_REDACT_PATTERNS,
};

// ────────────────────────────────────────────────────────────────────────────
// Sanitization functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Redact sensitive patterns from a string.
 */
export function redactSecrets(text: string, patterns?: RegExp[]): string {
  const pats = patterns ?? DEFAULT_REDACT_PATTERNS;
  let result = text;
  for (const pat of pats) {
    // Reset lastIndex for global regexes
    pat.lastIndex = 0;
    result = result.replace(pat, "[REDACTED]");
  }
  return result;
}

/**
 * Truncate a string to maxChars, adding a truncation indicator.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 14))}…(truncated)`;
}

/**
 * Safely stringify a value to JSON, with truncation and redaction.
 */
export function sanitizePayload(value: unknown, maxChars: number, config?: SanitizeConfig): string {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  const truncated = truncate(raw, maxChars);
  return redactSecrets(truncated, config?.redactPatterns);
}

/**
 * Sanitize a single payload value: stringify → truncate → redact → try to parse back.
 * Falls back to the redacted string if JSON.parse fails (truncation/redaction can break JSON).
 */
function sanitizeValue(value: unknown, maxChars: number, cfg: SanitizeConfig): unknown {
  const redacted = sanitizePayload(value, maxChars, cfg);
  try {
    return JSON.parse(redacted);
  } catch {
    // Truncation or redaction broke JSON structure — store as redacted string
    return redacted;
  }
}

/**
 * Sanitize tool args and result for persistence.
 * Handles both `{ args, result }` and `{ toolArgs, toolResult }` field conventions.
 * Returns a new object with sanitized payload fields.
 */
export function sanitizeForPersistence<T extends Record<string, unknown>>(
  data: T,
  config?: Partial<SanitizeConfig>,
): T {
  const cfg = { ...DEFAULT_SANITIZE_CONFIG, ...config };
  const sanitized = { ...data };

  // Handle { args, result } convention
  if (sanitized.args !== undefined) {
    sanitized.args = sanitizeValue(sanitized.args, cfg.maxArgChars, cfg);
  }
  if (sanitized.result !== undefined) {
    sanitized.result = sanitizeValue(sanitized.result, cfg.maxResultChars, cfg);
  }

  // Handle { toolArgs, toolResult } convention (experience kits)
  if (sanitized.toolArgs !== undefined) {
    sanitized.toolArgs = sanitizeValue(sanitized.toolArgs, cfg.maxArgChars, cfg);
  }
  if (sanitized.toolResult !== undefined) {
    sanitized.toolResult = sanitizeValue(sanitized.toolResult, cfg.maxResultChars, cfg);
  }

  return sanitized;
}

/**
 * Sanitize text fields (topic, summary, reason) by redacting secrets.
 */
export function sanitizeText(
  text: string | undefined,
  config?: SanitizeConfig,
): string | undefined {
  if (!text) return text;
  return redactSecrets(text, config?.redactPatterns);
}
