/**
 * Credential Encryption at Rest (FB-015)
 *
 * Provides AES-256-GCM encryption/decryption for sensitive config fields
 * (tokens, passwords, API keys) stored in clawdis.json.
 *
 * Key derivation uses PBKDF2 with a machine-specific salt so encrypted
 * values are tied to the host. Users can also supply a custom passphrase
 * via CLAWDIS_ENCRYPTION_KEY env var.
 *
 * This module does NOT modify config loading directly — it provides
 * utility functions that can be called by the config layer or CLI
 * to encrypt/decrypt sensitive fields before writing/after reading.
 *
 * Addresses MITRE ATLAS AML.CS0048 (Credential Harvesting).
 */

import crypto from "node:crypto";
import os from "node:os";

import { defaultRuntime } from "../runtime.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM recommended
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha256";

/** Prefix for encrypted values in config JSON so we know to decrypt them. */
export const ENCRYPTED_PREFIX = "enc:v1:";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EncryptionConfig = {
  /** Whether encryption is enabled. Defaults to true. */
  enabled: boolean;
  /** Custom passphrase. Falls back to machine-derived key if not set. */
  passphrase?: string;
};

const DEFAULT_CONFIG: EncryptionConfig = {
  enabled: true,
};

/** Keys whose string values should be encrypted at rest. */
const ENCRYPTABLE_KEYS = new Set([
  "token",
  "bottoken",
  "botToken",
  "password",
  "apikey",
  "apiKey",
  "authtoken",
  "authToken",
  "webhooksecret",
  "webhookSecret",
  "secret",
  "auth_token",
  "api_key",
]);

// ─── Key Derivation ──────────────────────────────────────────────────────────

/**
 * Derive a machine-specific encryption key.
 * Uses hostname + username + platform as entropy source, combined with
 * a salt, via PBKDF2.
 */
function deriveMachineKey(salt: Buffer): Buffer {
  const passphrase =
    process.env.CLAWDIS_ENCRYPTION_KEY ??
    `${os.hostname()}:${os.userInfo().username}:${process.platform}:clawdis`;

  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    KEY_BYTES,
    PBKDF2_DIGEST,
  );
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string.
 * Returns a prefixed base64 blob: `enc:v1:<base64(salt + iv + tag + ciphertext)>`
 */
export function encryptValue(
  plaintext: string,
  config: EncryptionConfig = DEFAULT_CONFIG,
): string {
  if (!config.enabled) return plaintext;
  if (!plaintext || plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;

  const salt = crypto.randomBytes(SALT_BYTES);
  const key = config.passphrase
    ? crypto.pbkdf2Sync(
        config.passphrase,
        salt,
        PBKDF2_ITERATIONS,
        KEY_BYTES,
        PBKDF2_DIGEST,
      )
    : deriveMachineKey(salt);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: salt(16) + iv(12) + tag(16) + ciphertext(N)
  const packed = Buffer.concat([salt, iv, tag, encrypted]);
  return `${ENCRYPTED_PREFIX}${packed.toString("base64")}`;
}

/**
 * Decrypt an encrypted value.
 * Expects the `enc:v1:` prefix. Returns original value if not encrypted.
 */
export function decryptValue(
  encrypted: string,
  config: EncryptionConfig = DEFAULT_CONFIG,
): string {
  if (!config.enabled) return encrypted;
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return encrypted;

  try {
    const packed = Buffer.from(
      encrypted.slice(ENCRYPTED_PREFIX.length),
      "base64",
    );

    if (packed.length < SALT_BYTES + IV_BYTES + TAG_BYTES + 1) {
      defaultRuntime.log?.(
        "[credential-encryption] invalid encrypted value: too short",
      );
      return encrypted;
    }

    const salt = packed.subarray(0, SALT_BYTES);
    const iv = packed.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const tag = packed.subarray(
      SALT_BYTES + IV_BYTES,
      SALT_BYTES + IV_BYTES + TAG_BYTES,
    );
    const ciphertext = packed.subarray(SALT_BYTES + IV_BYTES + TAG_BYTES);

    const key = config.passphrase
      ? crypto.pbkdf2Sync(
          config.passphrase,
          salt,
          PBKDF2_ITERATIONS,
          KEY_BYTES,
          PBKDF2_DIGEST,
        )
      : deriveMachineKey(salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    defaultRuntime.log?.(
      `[credential-encryption] decryption failed: ${String(err)}`,
    );
    return encrypted; // return as-is on failure (don't crash)
  }
}

// ─── Config Object Helpers ───────────────────────────────────────────────────

/**
 * Check if a key name should be encrypted.
 */
export function isEncryptableKey(key: string): boolean {
  return ENCRYPTABLE_KEYS.has(key);
}

/**
 * Check if a value is already encrypted.
 */
export function isEncryptedValue(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Recursively encrypt all sensitive fields in a config object.
 * Returns a new object (does not mutate input).
 */
export function encryptConfigFields(
  obj: unknown,
  config: EncryptionConfig = DEFAULT_CONFIG,
): unknown {
  if (!config.enabled) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => encryptConfigFields(item, config));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    obj as Record<string, unknown>,
  )) {
    if (
      isEncryptableKey(key) &&
      typeof value === "string" &&
      value.length > 0 &&
      !isEncryptedValue(value)
    ) {
      result[key] = encryptValue(value, config);
    } else if (typeof value === "object" && value !== null) {
      result[key] = encryptConfigFields(value, config);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively decrypt all sensitive fields in a config object.
 * Returns a new object (does not mutate input).
 */
export function decryptConfigFields(
  obj: unknown,
  config: EncryptionConfig = DEFAULT_CONFIG,
): unknown {
  if (!config.enabled) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => decryptConfigFields(item, config));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    obj as Record<string, unknown>,
  )) {
    if (
      isEncryptableKey(key) &&
      typeof value === "string" &&
      isEncryptedValue(value)
    ) {
      result[key] = decryptValue(value, config);
    } else if (typeof value === "object" && value !== null) {
      result[key] = decryptConfigFields(value, config);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Count how many sensitive fields in a config are currently unencrypted.
 */
export function countUnencryptedFields(obj: unknown): number {
  if (obj === null || obj === undefined || typeof obj !== "object") return 0;
  if (Array.isArray(obj)) {
    return obj.reduce(
      (sum, item) => sum + countUnencryptedFields(item),
      0,
    );
  }
  let count = 0;
  for (const [key, value] of Object.entries(
    obj as Record<string, unknown>,
  )) {
    if (
      isEncryptableKey(key) &&
      typeof value === "string" &&
      value.length > 0 &&
      !isEncryptedValue(value)
    ) {
      count++;
    } else if (typeof value === "object" && value !== null) {
      count += countUnencryptedFields(value);
    }
  }
  return count;
}
