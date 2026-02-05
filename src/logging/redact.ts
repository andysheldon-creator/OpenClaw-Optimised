import { createRequire } from "node:module";
import type { OpenClawConfig } from "../config/config.js";

const requireConfig = createRequire(import.meta.url);

export type RedactSensitiveMode = "off" | "tools";

const DEFAULT_REDACT_MODE: RedactSensitiveMode = "tools";
const DEFAULT_REDACT_MIN_LENGTH = 18;
const DEFAULT_REDACT_KEEP_START = 6;
const DEFAULT_REDACT_KEEP_END = 4;

/**
 * HTTP headers that should always be redacted
 */
export const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "apikey",
  "api-key",
  "supabase-api-key",
  "x-supabase-auth",
  "x-access-token",
  "x-refresh-token",
  "proxy-authorization",
];

/**
 * Payload field names that should be redacted
 */
export const SENSITIVE_PAYLOAD_FIELDS = [
  "token",
  "tokens",
  "key",
  "keys",
  "secret",
  "secrets",
  "password",
  "passwd",
  "api_key",
  "apiKey",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "private_key",
  "privateKey",
  "service_role",
  "serviceRole",
  "anon_key",
  "anonKey",
  "supabase_key",
  "supabaseKey",
  "credentials",
  "auth",
];

const DEFAULT_REDACT_PATTERNS: string[] = [
  // ENV-style assignments.
  String.raw`\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1`,
  // JSON fields.
  String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"`,
  // CLI flags.
  String.raw`--(?:api[-_]?key|token|secret|password|passwd)\s+(["']?)([^\s"']+)\1`,
  // Authorization headers.
  String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`,
  String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`,
  // Basic auth
  String.raw`\bBasic\s+([A-Za-z0-9+/=]{20,})\b`,
  // PEM blocks.
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
  // Common token prefixes.
  String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(sk-ant-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(ghp_[A-Za-z0-9]{20,})\b`,
  String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`,
  String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(xapp-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`,
  String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(npm_[A-Za-z0-9]{10,})\b`,
  String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
  // Supabase patterns
  String.raw`\b(eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*)\b`,
  String.raw`(?:service_role|serviceRole)["\s:=]+([A-Za-z0-9._-]{20,})`,
];

type RedactOptions = {
  mode?: RedactSensitiveMode;
  patterns?: string[];
};

function normalizeMode(value?: string): RedactSensitiveMode {
  return value === "off" ? "off" : DEFAULT_REDACT_MODE;
}

function parsePattern(raw: string): RegExp | null {
  if (!raw.trim()) {
    return null;
  }
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  try {
    if (match) {
      const flags = match[2].includes("g") ? match[2] : `${match[2]}g`;
      return new RegExp(match[1], flags);
    }
    return new RegExp(raw, "gi");
  } catch {
    return null;
  }
}

function resolvePatterns(value?: string[]): RegExp[] {
  const source = value?.length ? value : DEFAULT_REDACT_PATTERNS;
  return source.map(parsePattern).filter((re): re is RegExp => Boolean(re));
}

function maskToken(token: string): string {
  if (token.length < DEFAULT_REDACT_MIN_LENGTH) {
    return "***";
  }
  const start = token.slice(0, DEFAULT_REDACT_KEEP_START);
  const end = token.slice(-DEFAULT_REDACT_KEEP_END);
  return `${start}…${end}`;
}

function redactPemBlock(block: string): string {
  const lines = block.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return "***";
  }
  return `${lines[0]}\n…redacted…\n${lines[lines.length - 1]}`;
}

function redactMatch(match: string, groups: string[]): string {
  if (match.includes("PRIVATE KEY-----")) {
    return redactPemBlock(match);
  }
  const token =
    groups.filter((value) => typeof value === "string" && value.length > 0).at(-1) ?? match;
  const masked = maskToken(token);
  if (token === match) {
    return masked;
  }
  return match.replace(token, masked);
}

function redactText(text: string, patterns: RegExp[]): string {
  let next = text;
  for (const pattern of patterns) {
    next = next.replace(pattern, (...args: string[]) =>
      redactMatch(args[0], args.slice(1, args.length - 2)),
    );
  }
  return next;
}

function resolveConfigRedaction(): RedactOptions {
  let cfg: OpenClawConfig["logging"] | undefined;
  try {
    const loaded = requireConfig("../config/config.js") as {
      loadConfig?: () => OpenClawConfig;
    };
    cfg = loaded.loadConfig?.().logging;
  } catch {
    cfg = undefined;
  }
  return {
    mode: normalizeMode(cfg?.redactSensitive),
    patterns: cfg?.redactPatterns,
  };
}

export function redactSensitiveText(text: string, options?: RedactOptions): string {
  if (!text) {
    return text;
  }
  const resolved = options ?? resolveConfigRedaction();
  if (normalizeMode(resolved.mode) === "off") {
    return text;
  }
  const patterns = resolvePatterns(resolved.patterns);
  if (!patterns.length) {
    return text;
  }
  return redactText(text, patterns);
}

export function redactToolDetail(detail: string): string {
  const resolved = resolveConfigRedaction();
  if (normalizeMode(resolved.mode) !== "tools") {
    return detail;
  }
  return redactSensitiveText(detail, resolved);
}

export function getDefaultRedactPatterns(): string[] {
  return [...DEFAULT_REDACT_PATTERNS];
}

/**
 * Redacts sensitive headers from a headers object
 */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      result[key] = "[REDACTED]";
    } else if (value !== undefined) {
      // Also check for sensitive patterns in header values
      if (Array.isArray(value)) {
        result[key] = value.map((v) => redactSensitiveText(v));
      } else {
        result[key] = redactSensitiveText(value);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Redacts sensitive fields from an object (shallow)
 */
export function redactPayloadFields<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const field of SENSITIVE_PAYLOAD_FIELDS) {
    if (field in result && result[field] !== undefined) {
      (result as Record<string, unknown>)[field] = "[REDACTED]";
    }
  }

  return result;
}

/**
 * Deep redacts sensitive fields from an object
 */
export function deepRedactPayload<T>(
  obj: T,
  options?: { maxDepth?: number; currentDepth?: number },
): T {
  const maxDepth = options?.maxDepth ?? 10;
  const currentDepth = options?.currentDepth ?? 0;

  if (currentDepth >= maxDepth) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      deepRedactPayload(item, { maxDepth, currentDepth: currentDepth + 1 }),
    ) as T;
  }

  if (obj && typeof obj === "object") {
    const result = { ...obj } as Record<string, unknown>;

    for (const [key, value] of Object.entries(result)) {
      // Check if key matches sensitive fields
      if (SENSITIVE_PAYLOAD_FIELDS.includes(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        result[key] = redactSensitiveText(value);
      } else if (value && typeof value === "object") {
        result[key] = deepRedactPayload(value, { maxDepth, currentDepth: currentDepth + 1 });
      }
    }

    return result as T;
  }

  if (typeof obj === "string") {
    return redactSensitiveText(obj) as T;
  }

  return obj;
}

/**
 * Creates a safe-to-log version of process.env
 * NEVER log process.env directly - always use this
 */
export function safeEnvSnapshot(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};

  // Only include non-sensitive environment variables
  const sensitiveEnvPatterns = [
    /key/i,
    /token/i,
    /secret/i,
    /password/i,
    /passwd/i,
    /credential/i,
    /auth/i,
    /private/i,
    /supabase/i,
  ];

  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      continue;
    }

    const isSensitive = sensitiveEnvPatterns.some((pattern) => pattern.test(key));
    if (isSensitive) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }

  return result;
}
