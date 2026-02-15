/**
 * Config Credential Masking — prevents credential exposure via config.get RPC.
 *
 * Walks a parsed config object and masks sensitive field values so that API keys,
 * tokens, and passwords are not returned verbatim to gateway clients.
 *
 * Addresses MITRE ATLAS AML.CS0048 (Credential Harvesting via Agent Configuration).
 */

/** Field names whose string values should be masked. */
const SENSITIVE_KEYS = new Set([
  "token",
  "bottoken",
  "password",
  "apikey",
  "authtoken",
  "webhooksecret",
  "tokenfile",
  "secret",
  "auth_token",
  "api_key",
]);

/**
 * Returns true if a key (case-insensitive) is considered sensitive.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Masks a string value, showing at most the first 4 characters.
 * Values shorter than 6 characters are fully masked.
 */
export function maskValue(value: string): string {
  if (value.length < 6) return "***";
  return `${value.slice(0, 4)}***`;
}

/**
 * Recursively walks an object and masks values at sensitive keys.
 * Returns a new object (does not mutate the input).
 */
export function maskSensitiveFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key) && typeof value === "string" && value.length > 0) {
      result[key] = maskValue(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = maskSensitiveFields(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
