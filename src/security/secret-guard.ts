import fs from "node:fs";
import path from "node:path";

/**
 * SECURITY: Secret Guard Module
 * 
 * Enforces that secrets must come from environment variables only.
 * Refuses to start if plaintext secrets are detected in config files.
 * 
 * Migration note: Remove all secrets from files and use env vars instead.
 */

const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "token",
  "access",
  "refresh",
  "password",
  "secret",
  "clientsecret",
  "client_secret",
  "key",
  "bearer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSecretKey(key: string): boolean {
  const normalized = String(key).trim().toLowerCase();
  return SECRET_KEYS.has(normalized);
}

interface SecretMatch {
  path: string;
  key: string;
}

function scanForSecrets(
  value: unknown,
  pathParts: string[] = []
): SecretMatch | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const match = scanForSecrets(value[i], [...pathParts, String(i)]);
      if (match) return match;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const [key, entry] of Object.entries(value)) {
    if (isSecretKey(key)) {
      if (typeof entry === "string" && entry.trim()) {
        return { path: [...pathParts, key].join("."), key };
      }
    }
    const nested = scanForSecrets(entry, [...pathParts, key]);
    if (nested) return nested;
  }

  return null;
}

/**
 * Ensures a file has 600 permissions (owner read/write only).
 * Best-effort: does not throw on chmod failures.
 */
export function ensureFilePermissions600(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {
    // best-effort; do not throw on chmod failures
  }
}

/**
 * Asserts that a JSON file does not contain plaintext secrets.
 * Throws an error if secrets are detected, refusing to start.
 * Also enforces 600 permissions on the file.
 */
export function assertNoSecretsInFile(filePath: string, label?: string): void {
  if (!fs.existsSync(filePath)) return;

  ensureFilePermissions600(filePath);

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const hit = scanForSecrets(parsed);

    if (hit) {
      const source = label ?? path.basename(filePath);
      throw new Error(
        `Refusing to start: ${source} contains plaintext secrets at ${hit.path}. ` +
          "Move secrets to environment variables and remove them from files."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Refusing to start")) {
      throw err;
    }
    // If file is unreadable or invalid JSON, ignore here (handled elsewhere).
  }
}

/**
 * Asserts that a config object does not contain plaintext secrets.
 * Throws an error if secrets are detected, refusing to start.
 */
export function assertNoSecretsInConfig(cfg: unknown): void {
  const hit = scanForSecrets(cfg);
  if (hit) {
    throw new Error(
      `Refusing to start: config contains plaintext secret at ${hit.path}. ` +
        "Secrets must be supplied via environment variables only."
    );
  }
}
