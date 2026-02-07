// Standalone sanitizer for Meridia persistence and LLM prompts.
// Replicates core redaction patterns from src/logging/redact.ts
// without importing it (avoids OpenClawConfig dependency chain).

const MIN_TOKEN_LENGTH = 18;
const KEEP_START = 6;
const KEEP_END = 4;
const MAX_DEPTH = 12;

// Redaction patterns (subset of src/logging/redact.ts DEFAULT_REDACT_PATTERNS)
const REDACT_PATTERNS: RegExp[] = [
  // ENV-style assignments
  new RegExp(
    String.raw`\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1`,
    "gi",
  ),
  // JSON fields
  new RegExp(
    String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"`,
    "gi",
  ),
  // CLI flags
  new RegExp(
    String.raw`--(?:api[-_]?key|token|secret|password|passwd)\s+(["']?)([^\s"']+)\1`,
    "gi",
  ),
  // Authorization headers
  new RegExp(String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`, "gi"),
  new RegExp(String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`, "gi"),
  // PEM blocks
  new RegExp(
    String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
    "g",
  ),
  // Common token prefixes
  new RegExp(String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`, "gi"),
  new RegExp(String.raw`\b(ghp_[A-Za-z0-9]{20,})\b`, "gi"),
  new RegExp(String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`, "gi"),
  new RegExp(String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`, "gi"),
  new RegExp(String.raw`\b(xapp-[A-Za-z0-9-]{10,})\b`, "gi"),
  new RegExp(String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`, "gi"),
  new RegExp(String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`, "gi"),
  new RegExp(String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`, "gi"),
  new RegExp(String.raw`\b(npm_[A-Za-z0-9]{10,})\b`, "gi"),
  new RegExp(String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`, "gi"),
];

const SENSITIVE_KEY_RE =
  /(pass(word)?|passwd|token|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|cookie|credential)\b/i;

const PASSWORD_KEY_RE = /(pass(word)?|passwd)\b/i;

function maskToken(token: string): string {
  if (token.length < MIN_TOKEN_LENGTH) {
    return "***";
  }
  return `${token.slice(0, KEEP_START)}…${token.slice(-KEEP_END)}`;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key) || /^x-api-key$/i.test(key);
}

function redactMatch(match: string, groups: string[]): string {
  if (match.includes("PRIVATE KEY-----")) {
    const lines = match.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      return "***";
    }
    return `${lines[0]}\n…redacted…\n${lines[lines.length - 1]}`;
  }
  const shouldFullyRedact = /\bpass(word)?\b/i.test(match) || /\bpasswd\b/i.test(match);
  const token = groups.filter((v) => typeof v === "string" && v.length > 0).at(-1) ?? match;
  const masked = shouldFullyRedact ? "***" : maskToken(token);
  return token === match ? masked : match.replace(token, masked);
}

/** Redact sensitive values from a text string. */
export function redactText(text: string): string {
  if (!text) {
    return text;
  }
  let out = text;
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, (...args: string[]) =>
      redactMatch(args[0], args.slice(1, args.length - 2)),
    );
  }
  return out;
}

/** Deep-walk an object, redact string leaves matching patterns or sensitive key names. */
export function redactValue(value: unknown): unknown {
  return redactInner(value, new WeakSet<object>(), 0);
}

function redactInner(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= MAX_DEPTH) {
    return "[MaxDepth]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInner(item, seen, depth + 1));
  }
  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (value instanceof URL) {
    return redactText(value.toString());
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack) : undefined,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      if (raw == null) {
        out[key] = raw;
      } else if (PASSWORD_KEY_RE.test(key)) {
        out[key] = "***";
      } else {
        const text = typeof raw === "string" ? raw : typeof raw === "bigint" ? raw.toString() : "";
        if (text) {
          const redacted = redactText(text);
          out[key] = redacted === text ? maskToken(text) : redacted;
        } else {
          out[key] = "***";
        }
      }
      continue;
    }
    out[key] = redactInner(raw, seen, depth + 1);
  }
  return out;
}

/**
 * Config-aware wrapper: sanitize a value for persistence/LLM prompts.
 * Pass `{ enabled: false }` to bypass sanitization.
 */
export function sanitizeForPersistence(value: unknown, opts?: { enabled?: boolean }): unknown {
  if (opts?.enabled === false) {
    return value;
  }
  return redactValue(value);
}
