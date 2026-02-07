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
 * Sanitize tool args and result for persistence.
 * Returns a new object with sanitized payload fields.
 */
export function sanitizeForPersistence<T extends { args?: unknown; result?: unknown }>(
  data: T,
  config?: Partial<SanitizeConfig>,
): T {
  const cfg = { ...DEFAULT_SANITIZE_CONFIG, ...config };
  const sanitized = { ...data };

  if (sanitized.args !== undefined) {
    const raw =
      typeof sanitized.args === "string" ? sanitized.args : JSON.stringify(sanitized.args);
    sanitized.args = JSON.parse(
      sanitizePayload(JSON.parse(raw === undefined ? "null" : raw), cfg.maxArgChars, cfg),
    );
  }
  if (sanitized.result !== undefined) {
    const raw =
      typeof sanitized.result === "string" ? sanitized.result : JSON.stringify(sanitized.result);
    sanitized.result = JSON.parse(
      sanitizePayload(JSON.parse(raw === undefined ? "null" : raw), cfg.maxResultChars, cfg),
    );
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
